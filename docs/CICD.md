# CI/CD

OpenLinear is released as a local-first desktop app. GitHub Actions no longer deploy a hosted API, push to a droplet, or ship backend code over SSH.

## CI flow

```text
push / pull_request -> install dependencies -> sync Arch metadata -> build sidecar -> typecheck desktop UI -> build npm package
```

`/.github/workflows/ci.yml` is the release-readiness check for the local desktop build and packaging surfaces.

## Release flow

```text
git tag vX.Y.Z -> GitHub Actions -> build desktop artifacts -> GitHub Release -> npm publish -> Arch/AUR publish
```

`/.github/workflows/release.yml` performs the tag-based release pipeline. It:

- verifies the tag matches `packages/openlinear/package.json` and `apps/desktop/src-tauri/tauri.conf.json`
- regenerates `packaging/aur/openlinear-bin/.SRCINFO`
- builds Linux release artifacts for GitHub Releases
- publishes the `openlinear` package to npm
- publishes `openlinear-bin` metadata to Arch/AUR

## Required secrets

- `NPM_TOKEN` (use an npm automation token if you want fully automated publishes)
- `AUR_SSH_PRIVATE_KEY`

## Local verification

```bash
pnpm install
bash ./scripts/sync-aur-metadata.sh
bash ./scripts/build-sidecar.sh
pnpm --filter @openlinear/desktop-ui lint
pnpm --filter ./packages/openlinear build
```

## Release checklist

```bash
# versions must already match in:
# - packages/openlinear/package.json
# - apps/desktop/src-tauri/tauri.conf.json

bash ./scripts/sync-aur-metadata.sh
git add packages/openlinear/package.json apps/desktop/src-tauri/tauri.conf.json packaging/aur/openlinear-bin/PKGBUILD packaging/aur/openlinear-bin/.SRCINFO
git commit -m "chore(release): vX.Y.Z"
git tag vX.Y.Z
git push origin main --follow-tags
```

## Notes

- The desktop sidecar still exposes a local API inside the app, but CI/CD does not deploy it as a hosted service.
- The Arch package path in this repo is the existing `PKGBUILD`/AUR flow under `packaging/aur/openlinear-bin`.
- The canonical `curl` installer is `https://raw.githubusercontent.com/kaizen403/openlinear/main/install.sh`, so it does not depend on a Vercel deployment.
