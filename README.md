<div align="center">

# OpenLinear

**A kanban board that executes your tasks.**

Describe what you want built. Click execute. Get a pull request.

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

## What is OpenLinear?

OpenLinear is a project management tool that turns your backlog into pull requests. You manage tasks on a Linear-style kanban board. When you're ready, an AI agent — running locally with your own credentials — clones your repo, creates a branch, writes the code, and opens a PR. No copy-pasting prompts, no context switching.

The dashboard is **desktop-only**. The web version only contains the marketing landing page.

## Features

- **Kanban Board** — drag-and-drop task management with priorities, labels, and status tracking
- **One-Click Execution** — select a task, hit execute, get a PR with real code changes
- **Batch Execution** — run multiple tasks in parallel or queue mode, merged into a single PR
- **Local Execution** — agent runs on your machine with your own API keys and credentials
- **Real-Time Streaming** — watch the AI work live via SSE (tool calls, file edits, progress)
- **GitHub Integration** — OAuth login, repo management, automatic PR creation
- **Brainstorm Mode** — describe a goal in natural language, get actionable tasks generated
- **Teams & Projects** — organize work with teams, projects, and scoped issue numbering

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
- Docker (for PostgreSQL only)
- A GitHub OAuth app (for login and repo access)

### Setup

```bash
# Clone and install
git clone https://github.com/kaizen403/openlinear.git
cd openlinear
pnpm install

# Start PostgreSQL
docker compose up -d

# Configure environment
export DATABASE_URL=postgresql://openlinear:openlinear@localhost:5432/openlinear

# Push database schema
pnpm db:push

# Start the API
pnpm --filter @openlinear/api dev

# Start the desktop app (in another terminal)
pnpm --filter @openlinear/desktop dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing auth tokens |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `GITHUB_REDIRECT_URI` | OAuth callback URL |
| `API_PORT` | API server port (default: `3001`) |
| `CORS_ORIGIN` | Allowed CORS origin (default: `http://localhost:3000`) |

## How It Works

1. **You create tasks** on the kanban board with descriptions of what you want built
2. **You click execute** — the desktop app picks it up, clones your repo, and creates a branch
3. **The agent writes code** locally using your API keys, in its own git worktree
4. **You watch it work** — real-time SSE streams every tool call, file edit, and decision
5. **You get a PR** — changes are committed, pushed, and a pull request is created automatically

For batch execution, multiple tasks run in parallel (or queued), each in isolated worktrees, merged into a single PR.

> For the full architecture deep dive, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Project Structure

```
openlinear/
  apps/
    desktop-ui/     Next.js frontend (desktop webview)
    desktop/        Desktop app shell
    landing/        Marketing landing page (Vercel)
    api/            Express API
  packages/
    db/             Prisma schema + client
    openlinear/     npm package (CLI launcher + library)
    types/          Shared TypeScript types
  docs/
    features/       Feature documentation (18 guides)
    diagrams/       Architecture SVGs
    ARCHITECTURE.md Full system design
```

## Distribution

| Format | Platform | Install |
|--------|----------|---------|
| AppImage | Linux | [GitHub Releases](https://github.com/kaizen403/openlinear/releases) |
| .deb | Debian/Ubuntu | [GitHub Releases](https://github.com/kaizen403/openlinear/releases) |
| AUR | Arch Linux | `yay -S openlinear-bin` |
| npm installer | Any | `npm install -g openlinear` |

Release builds are triggered automatically on tag push (`v*`).

## Documentation

- [Getting Started](docs/features/getting-started.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/features/api-reference.md)
- [Task Execution](docs/features/task-execution.md)
- [Batch Execution](docs/features/batch-execution.md)
- [OpenCode Integration](docs/features/opencode-integration.md)
- [All Features](docs/features/README.md)

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
# Development
pnpm dev          # Start everything
pnpm lint         # Lint
pnpm typecheck    # Type check
pnpm test         # Run tests
```

## License

[MIT](LICENSE)
