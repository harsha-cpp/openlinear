# CI/CD Pipeline

Two GitHub Actions workflows handle all automation. One deploys the API + frontend to the production droplet. The other builds desktop releases and publishes to npm.

```
main push ──→ deploy.yml ──→ checks (typecheck, build, test) ──→ SSH deploy ──→ health check
tag push  ──→ release.yml ──→ build desktop (Tauri + Rust) ──→ GitHub Release ──→ npm publish
```

## Workflows

### `deploy.yml` — Deploy to Production

**Trigger:** Push to `main` (ignores docs, landing, desktop, packaging changes).

**Concurrency:** Cancels in-progress deploys when a new push arrives.

| Job | What it does | Timeout |
|-----|-------------|---------|
| **checks** | Install deps, generate Prisma, push test schema, typecheck API + desktop-ui, build API, run API tests | 10 min |
| **deploy** | SSH into droplet, run `scripts/deploy.sh` | 10 min |
| **verify** | POST to `https://rixie.in/health`, retry 6 times | — |

Path filters skip the workflow entirely for changes that don't affect the deployed services:
- `docs/**`, `*.md`, `LICENSE`
- `apps/landing/**` (deployed via Vercel separately)
- `apps/desktop/**`, `apps/intro-video/**`
- `packaging/**`

### `release.yml` — Desktop Release + npm Publish

**Trigger:** Tag push matching `v*` (e.g. `v0.1.14`).

**Concurrency:** Per-tag group, does not cancel (releases must complete).

| Job | What it does | Timeout |
|-----|-------------|---------|
| **build-release** | Build sidecar binary, build Tauri desktop (AppImage + deb), strip Wayland libs, create GitHub Release | 30 min |
| **publish-npm** | Build + publish the `openlinear` npm package with provenance | 10 min |

Caching:
- **Rust build cache** — `~/.cargo` registry + `apps/desktop/src-tauri/target/`, keyed on `Cargo.lock` hash. Saves ~10 min on repeat builds.
- **pnpm store** — via `actions/setup-node` `cache: pnpm`.

## Deploy Script (`scripts/deploy.sh`)

Runs on the droplet via SSH. Implements incremental deploys:

1. **Pull** — `git pull origin main --ff-only`
2. **Diff detection** — compares `OLD_HEAD` vs `NEW_HEAD` to determine what changed:
   - `apps/api/**` → rebuild API
   - `apps/desktop-ui/**` or `packages/**` → rebuild frontend
   - `packages/db/**` → regenerate Prisma + push schema
3. **Install** — only runs `pnpm install` if `package.json` or `pnpm-lock.yaml` changed
4. **Build** — only rebuilds changed components
5. **Restart** — PM2 `reload` for zero-downtime restart (only for changed services)

On manual trigger (`workflow_dispatch`) or first deploy, everything rebuilds.

## Release Process

To cut a release:

```bash
# 1. Bump version in these files:
#    - apps/desktop/src-tauri/tauri.conf.json  (version field)
#    - packages/openlinear/package.json        (version field)

# 2. Commit and tag
git add -A && git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

This triggers:
- `deploy.yml` — deploys the API/frontend commit to production
- `release.yml` — builds desktop binaries and creates a GitHub Release

The npm publish step skips automatically if the version is already published.

## Artifacts

Each GitHub Release contains:
- `openlinear-{version}-x86_64.AppImage` — Linux portable binary
- `openlinear-{version}-x86_64.deb` — Debian/Ubuntu package
- `openlinear-api-{version}-x86_64` — Standalone API server binary

## Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `DEPLOY_HOST` | Droplet IP address |
| `DEPLOY_USER` | SSH username (root) |
| `DEPLOY_SSH_KEY` | SSH private key for droplet access |

npm publishing uses OIDC Trusted Publishers (no `NPM_TOKEN` needed).

## Architecture Decisions

**Why not deploy on `dev`?** Pushing to `dev` previously triggered production deploys. Removed to prevent accidental production deployments from development work.

**Why `cancel-in-progress: true` on deploy?** If you push 3 commits in quick succession, only the latest one deploys. The earlier in-flight deploys are cancelled since they'd be immediately superseded.

**Why `cancel-in-progress: false` on release?** Releases must complete — cancelling a half-uploaded GitHub Release corrupts it.

**Why path filters?** Changes to docs, the landing page (Vercel), or the desktop app (release-only) don't need a production deploy. Saves CI minutes.

**Why Rust caching?** The Tauri/Rust compilation is the slowest step (~15 min cold, ~3 min cached). Caching `target/` and `~/.cargo` dramatically reduces release build times.

**Why is npm publish only in release.yml?** It was previously duplicated in both workflows. The deploy workflow would attempt to publish on every main push (wasteful, even with the version guard skip). npm publishes belong exclusively with tagged releases.

## Troubleshooting

**Deploy fails with SSH timeout:**
- Verify secrets are set: Settings → Secrets → Actions
- Test manually: `ssh -i ~/.ssh/droplet_key root@<DEPLOY_HOST>`

**Health check fails after deploy:**
- SSH in and check PM2: `pm2 status && pm2 logs openlinear-api --lines 50`
- Check port binding: `ss -ltnp | grep 3001`

**Release build fails on Rust compilation:**
- Usually a cache corruption issue. Delete the `rust-release-*` cache from the Actions → Caches page and re-run.

**npm publish fails with 403:**
- Check that OIDC Trusted Publishers is configured for the `openlinear` package on npmjs.com under Settings → Publishing access.

**Two workflows running on same commit:**
- Expected when you push a tag to `main`. `deploy.yml` deploys the API. `release.yml` builds the desktop. They don't conflict — different concurrency groups.
