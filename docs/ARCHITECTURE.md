# Architecture

OpenLinear now ships as a local-first desktop release with optional landing/docs hosting.

## Deployment shape

```text
GitHub repository
  -> GitHub Releases
    -> Linux AppImage / .deb
  -> npm
    -> openlinear launcher
  -> AUR
    -> openlinear-bin metadata
  -> Optional Vercel project
    -> apps/landing
      -> static pages
      -> /api/install
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

- GitHub Releases publish the desktop AppImage and `.deb`.
- npm publishes the `openlinear` launcher package.
- AUR publishes `openlinear-bin` metadata that points at the GitHub release artifacts.
- The landing app exists for marketing, docs, and the shell installer route.

## Landing app

- Framework: Next.js
- Deploy target: Vercel
- Effective project root: `apps/landing`
- Static routes: `/`, `/product`, `/pricing`, `/enterprise`, `/contact`, `/docs`
- Dynamic route: `/api/install`

## Install endpoint

`apps/landing/app/api/install/route.ts` returns a shell installer that uses the active host origin so copied commands work on the current deployed domain.

## Hosted surface

- The previous DigitalOcean droplet has been removed.
- The hosted dashboard is gone.
- The landing site is optional and no longer the only shipped surface.
