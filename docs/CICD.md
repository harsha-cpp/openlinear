# CI/CD

A complete reference for the OpenLinear build, deploy, and release pipeline.

## Flow Architecture

```
  dev branch                   dev + main                     tags (v*)
──────────────────────────────────────────────────────────────────────────

  git push origin dev          git push origin dev:main       just release patch
         │                              │                             │
         ▼                              │                             ▼
  ┌─────────────────┐                  │                 ┌──────────────────────────┐
  │    dev.yml      │                  │                 │       release.yml         │
  │                 │                  │                 │                          │
  │ lint-typecheck  │                  │                 │  build-linux             │
  │ test         (parallel)            │                 │  (ubuntu-22.04)     ──┐  │
  │ build           │                  │                 │                       │  │
  └─────────────────┘                  │                 │  build-macos-intel    │  │
                                       ▼                 │  (macos-13)        ───┼──┼──→ create-release
                              ┌────────────────────┐     │                       │  │    (GitHub Release)
                              │    deploy.yml       │     │  build-macos-arm      │  │         │
                              │                     │     │  (macos-14)        ───┘  │         ▼
                              │  checks             │     │                          │  publish-cli
                              │  (typecheck +       │     │  (3 builds parallel)     │  (GitHub Packages)
                              │   build all +       │     └──────────────────────────┘
                              │   tests vs pg)      │
                              │       │             │
                              │  deploy             │
                              │  (SSH → droplet)    │
                              │       │             │
                              │  diagnostics        │
                              │  (pm2 + port check) │
                              │       │             │
                              │  verify             │
                              │  (curl /health)     │
                              └────────────────────┘

  fires on: push to dev         fires on: push to dev OR main
  (checks only, no deploy)      (always — no path filter)
```

### What triggers what

| Event | Workflows fired |
|-------|----------------|
| `git push origin dev` | `dev.yml` (checks) + `deploy.yml` (deploy) |
| `git push origin dev:main` | `deploy.yml` (deploy) |
| `just release patch/minor/major` | `release.yml` (full release build) |

> `deploy.yml` fires on **both `dev` and `main`**. If you push to `dev` and only want checks, use `[skip ci]` in your commit message or run `workflow_dispatch` on `dev.yml` manually instead of pushing.

---

## Branch Strategy

- **`dev`** — default branch. All work happens here.
- **`main`** — production. Promote when ready: `git push origin dev:main`
- **tags** — releases. Created by `just release`, never auto-generated.

```
dev ──→ main ──→ v*
(work) (deploy) (release)
```

---

## Workflows

### `dev.yml` — Dev Checks

**Trigger:** Push to `dev`. Also `workflow_dispatch`.

**Concurrency:** Cancels in-progress run when a new push to `dev` arrives.

| Job | What it does | Timeout |
|-----|-------------|---------|
| **lint-typecheck** | `pnpm typecheck` + `pnpm lint` across all packages | 10 min |
| **test** | Spins up Postgres 16, pushes schema, runs `pnpm test` | 10 min |
| **build** | `pnpm build` — verifies everything compiles | 10 min |

All three jobs run in **parallel**.

---

### `deploy.yml` — API Deploy

**Trigger:** Push to `dev` **or** `main`. Also `workflow_dispatch`.

**Concurrency:** `cancel-in-progress: false` — deploys always complete, never cancel mid-flight.

| Job | Depends on | What it does |
|-----|-----------|-------------|
| **checks** | — | Typecheck + build all apps + run API tests vs fresh Postgres 16 |
| **deploy** | checks | SSH into droplet → `scripts/deploy.sh` |
| **diagnostics** | deploy (always runs) | `pm2 show`, port check, `curl localhost:3001/health` |
| **verify** | — | Poll `https://rixie.in/health` for 200 |

`scripts/deploy.sh` pulls the latest code on the droplet, rebuilds what changed, and reloads PM2 for zero-downtime restarts.

---

### `release.yml` — Desktop + npm Release

**Trigger:** Tag push matching `v*`.

**Concurrency:** Per-tag, never cancels — releases must complete.

| Job | Runner | What it does | Timeout |
|-----|--------|-------------|---------|
| **build-linux** | ubuntu-22.04 | Tauri → AppImage + .deb + API sidecar binary | 30 min |
| **build-macos-intel** | macos-13 | Tauri → .dmg (x86_64) | 40 min |
| **build-macos-arm** | macos-14 | Tauri → .dmg (aarch64) | 40 min |
| **create-release** | ubuntu-22.04 | Collect artifacts → GitHub Release | 10 min |
| **publish-cli** | ubuntu-22.04 | Publish `@kaizen403/openlinear-cli` to GitHub Packages | 10 min |

All 3 build jobs run in parallel. `create-release` collects them. `publish-cli` fires after the release is created.

**Artifacts per release:**

```
openlinear-{v}-x86_64.AppImage        Linux portable
openlinear-{v}-x86_64.deb             Debian / Ubuntu
openlinear-{v}-x86_64.dmg             macOS Intel
openlinear-{v}-aarch64.dmg            macOS Apple Silicon
openlinear-api-{v}-x86_64             API sidecar binary (Linux)
@kaizen403/openlinear-cli@{v}         npm (GitHub Packages)
```

---

## Releasing

### Cut a release

```bash
just release patch   # 0.1.24 → 0.1.25  (bug fixes)
just release minor   # 0.1.24 → 0.2.0   (new features)
just release major   # 0.1.24 → 1.0.0   (breaking changes)
```

What it does under the hood:

1. Verifies working tree is clean
2. Pulls latest `main` with `--ff-only`
3. Bumps version in all 4 files:
   - `apps/desktop/src-tauri/tauri.conf.json`
   - `packages/openlinear/package.json`
   - `packaging/aur/openlinear-bin/PKGBUILD`
   - `packaging/aur/openlinear-bin/.SRCINFO`
4. Commits: `chore(release): v0.2.0`
5. Creates tag: `v0.2.0`
6. Pushes commit + tag → `release.yml` fires

### Check version sync

```bash
just version
```

Shows the version in all 4 files and flags any mismatch.

### Set a specific version

```bash
node scripts/bump-version.js 2.0.0
```

---

## Required Secrets

Set these in GitHub → Settings → Secrets and variables → Actions:

| Secret | Workflow | Description |
|--------|---------|-------------|
| `DEPLOY_HOST` | deploy.yml | Droplet IP or hostname |
| `DEPLOY_USER` | deploy.yml | SSH username on the droplet |
| `DEPLOY_SSH_KEY` | deploy.yml | SSH private key (contents, not path) |
| `GITHUB_TOKEN` | release.yml | Auto-provided — used for GitHub Packages + Release creation |

---

## Troubleshooting

**Deploy ran when I only wanted checks**
`deploy.yml` fires on `dev` too. Use `[skip ci]` in your commit message, or trigger `dev.yml` via `workflow_dispatch` instead of pushing directly.

**Health check fails after deploy**
SSH in and check: `pm2 status` and `pm2 logs openlinear-api --lines 50`. Check port: `ss -ltnp | grep 3001`.

**Release Rust build fails**
Usually cache corruption. Delete `rust-linux-*` or `rust-macos-*` caches under Actions → Caches, then re-run the tag.

**npm publish fails**
`GITHUB_TOKEN` is auto-provided but the package must have `"publishConfig": {"registry": "https://npm.pkg.github.com"}` in `packages/openlinear-cli/package.json`.

**Adding AUR publish**
Add a `publish-aur` job that runs after `create-release`, updates `PKGBUILD` checksums, and pushes to the AUR git remote. Needs an `AUR_SSH_PRIVATE_KEY` secret.

**Adding Windows builds**
Add a `build-windows` job with `runs-on: windows-latest`, install Rust, build Tauri, upload `.msi`/`.exe`. Add `build-windows` to the `needs` list in `create-release`.
