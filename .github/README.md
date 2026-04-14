<div align="center">

# OpenLinear

**Turn your kanban board into a code-shipping machine.**

OpenLinear is an open-source desktop app that connects a Linear-style task board to AI coding agents. Create a task, describe what you want, hit execute — and get a pull request with working code.

[![GitHub](https://img.shields.io/github/stars/kaizen403/openlinear?style=social)](https://github.com/kaizen403/openlinear)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/kaizen403/openlinear/blob/main/LICENSE)
[![Live](https://img.shields.io/badge/try%20it-openlinear.tech-purple)](https://openlinear.tech)

</div>

---

### Why OpenLinear?

Most AI coding tools are chat-first. OpenLinear is **task-first**. You plan your work on a kanban board, then let AI agents execute tasks directly on your machine — each task gets its own git worktree, its own branch, and the agent runs as a bundled sidecar.

### Key Capabilities

- **One-click task execution** — describe the task, click execute, receive a pull request
- **Batch execution** — run multiple tasks in parallel or queue mode, merged into a single PR
- **Per-task isolation** — every task runs in its own git worktree with an independent branch
- **Real-time visibility** — watch the AI agent's tool calls, file edits, and decisions as they happen
- **GitHub-native** — OAuth login, automatic repo cloning, branch management, and PR creation

### Built With

Next.js, Tauri, Express.js, PostgreSQL, Prisma, OpenCode SDK

### Get Started

```bash
git clone https://github.com/kaizen403/openlinear.git
cd openlinear && pnpm install
docker compose up -d
pnpm db:push && pnpm dev
```

Full setup guide and architecture docs in the [repository](https://github.com/kaizen403/openlinear).

### Links

- [Repository](https://github.com/kaizen403/openlinear)
- [Documentation](https://github.com/kaizen403/openlinear/tree/main/docs/features)
- [Architecture](https://github.com/kaizen403/openlinear/blob/main/docs/ARCHITECTURE.md)
- [Releases](https://github.com/kaizen403/openlinear/releases)
- [Live Instance](https://openlinear.tech)

### License

[MIT](https://github.com/kaizen403/openlinear/blob/main/LICENSE)
