# Architecture

OpenLinear now ships as a local-first desktop release with optional landing/docs hosting.

## Deployment shape

```text
GitHub repository
  -> GitHub Releases
    -> macOS DMG / app bundle
    -> Linux AppImage / .deb
  -> raw install.sh
    -> curl installer
  -> npm
    -> openlinear launcher
  -> AUR
    -> openlinear-bin metadata
  -> Optional Vercel project
    -> apps/landing
      -> static pages
```

## Repository structure

```text
openlinear/
  apps/
    desktop/        Tauri desktop app
    desktop-ui/     Desktop UI
    sidecar/        Local API sidecar
    landing/        Next.js marketing site
  packages/
    openlinear/     npm launcher and installer utilities
  packaging/
    aur/            Arch/AUR package metadata
```

## Release channels

- GitHub Releases publish macOS `.dmg` / `.app.tar.gz` assets plus Linux AppImage / `.deb`.
- npm publishes the `openlinear` launcher package.
- AUR publishes `openlinear-bin` metadata that points at the GitHub release artifacts.
- `install.sh` in the repository is the canonical shell installer used by the `curl` command.
- The landing app exists for marketing and docs.

## Landing app

- Framework: Next.js
- Deploy target: Vercel
- Effective project root: `apps/landing`
- Static routes: `/`, `/product`, `/pricing`, `/enterprise`, `/contact`, `/docs`
- Optional mirror route: `/api/install`

## Install script

- Canonical installer: `install.sh`
- Canonical command: `curl -fsSL https://raw.githubusercontent.com/kaizen403/openlinear/main/install.sh | bash`
- Supported platforms: macOS (Apple Silicon / Intel) and Linux x64
- `apps/landing/app/api/install/route.ts` mirrors that installer when the landing app is deployed.

## Hosted surface

- The previous DigitalOcean droplet has been removed.
- The hosted dashboard is gone.
- The landing site is optional and no longer the only shipped surface.
