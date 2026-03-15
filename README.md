<div align="center">

# OpenLinear

**The local-first OpenLinear release repo.**

The hosted product has been retired. This repository now ships the desktop app, npm launcher, Arch packaging metadata, and the landing/docs surface.

[![npm version](https://img.shields.io/npm/v/openlinear.svg)](https://www.npmjs.com/package/openlinear)
[![npm downloads](https://img.shields.io/npm/dm/openlinear.svg)](https://www.npmjs.com/package/openlinear)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-9-orange)](https://pnpm.io)

</div>

---

<p align="center">
<img src="docs/diagrams/architecture.svg" alt="OpenLinear Architecture" width="100%"/>
</p>

## What is in this repo?

This repository ships the local OpenLinear desktop app, the npm launcher, Arch packaging metadata, and the landing/docs surface.

## What ships

- **`apps/desktop`** — Tauri desktop app
- **`packages/openlinear`** — npm launcher and utilities
- **`packaging/aur/openlinear-bin`** — Arch/AUR package metadata
- **`apps/landing`** — optional landing/docs surface

## Agent Support

| Agent | Status |
|-------|--------|
| [OpenCode](https://opencode.ai) | Integrated |
| Claude Code | Planned |
| Codex | Planned |
| Aider | Planned |

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 9+

### Setup

```bash
git clone https://github.com/kaizen403/openlinear.git
cd openlinear
pnpm install
pnpm --filter @openlinear/landing dev
```

## Releases

- GitHub Releases: [github.com/kaizen403/openlinear/releases](https://github.com/kaizen403/openlinear/releases)
- npm package: `npm install -g openlinear`
- Arch/AUR package: `openlinear-bin`

## CI/CD

GitHub Actions no longer deploy a hosted API. The supported automation is tag-based release publishing to GitHub Releases, npm, and the Arch/AUR package.

## Project Structure

```
openlinear/
  apps/
    desktop/        Tauri desktop app
    desktop-ui/     Desktop webview UI
    landing/        Marketing landing page
  packages/
    openlinear/     npm package / installer
  packaging/
    aur/            Arch/AUR package metadata
  docs/
    diagrams/       Architecture SVGs
    ARCHITECTURE.md System design
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [CI/CD](docs/CICD.md)
- [Landing docs page](apps/landing/app/docs/page.tsx)

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
pnpm --filter @openlinear/landing dev
pnpm --filter @openlinear/landing build
```

## License

[MIT](LICENSE)
