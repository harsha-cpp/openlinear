<div align="center">

# OpenLinear

**A kanban board that executes your tasks.**

Describe what you want built. Click execute. Get a pull request.

[![npm version](https://img.shields.io/npm/v/openlinear.svg)](https://www.npmjs.com/package/openlinear)
[![npm downloads](https://img.shields.io/npm/dm/openlinear.svg)](https://www.npmjs.com/package/openlinear)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

[GitHub](https://github.com/kaizen403/openlinear) · [Documentation](https://github.com/kaizen403/openlinear/tree/main/docs/features) · [Architecture](https://github.com/kaizen403/openlinear/blob/main/docs/ARCHITECTURE.md) · [Releases](https://github.com/kaizen403/openlinear/releases)

</div>

---

## What is OpenLinear?

OpenLinear is a project management tool that turns your backlog into pull requests. You manage tasks on a Linear-style kanban board. When you're ready, an AI agent — running locally with your own credentials — clones your repo, creates a branch, writes the code, and opens a PR. No copy-pasting prompts, no context switching.

**This package** is the official launcher and utility library. It does two things:

1. **CLI** — `openlinear` command that launches the pre-built desktop app on Linux.
2. **Library** — TypeScript utilities for execution metadata validation, payload sanitization, and feature flag management used internally by the OpenLinear platform.

---

## Installation

### Global — CLI launcher

```bash
npm install -g openlinear
# or
pnpm add -g openlinear
# or
yarn global add openlinear
```

After installation, the `postinstall` script downloads the pre-compiled desktop app (Linux AppImage) from GitHub Releases into `~/.openlinear/`. Once complete, run:

```bash
openlinear
```

### Local — Library API

```bash
npm install openlinear
```

---

## CLI

```bash
openlinear [args...]
```

The CLI launcher resolves the desktop binary from `~/.openlinear/openlinear` or `~/.openlinear/openlinear.AppImage`, applies the correct environment flags for X11/Wayland, and passes all arguments through to the app.

If the binary is not found, it prints installation instructions and exits:

```
OpenLinear desktop app not found.

Please install it:
  curl -fsSL https://rixie.in/api/install | bash

Or build from source:
  git clone https://github.com/kaizen403/openlinear.git
  cd openlinear && pnpm install && pnpm --filter @openlinear/desktop build
```

---

## Library API

The package ships four entry points. Import only what you need.

| Entry point | Contents |
|---|---|
| `openlinear` | Re-exports everything below |
| `openlinear/types` | Zod schemas, TypeScript types, validation functions |
| `openlinear/validation` | Payload sanitization and forbidden-field utilities |
| `openlinear/config` | Feature flag parsing and execution mode helpers |

---

### `openlinear/types`

Zod-validated types and validation functions for execution metadata synced between the local agent and the cloud dashboard.

#### Types

```typescript
import type { ExecutionMetadataSync } from 'openlinear/types';

// ExecutionStatus — z.enum
type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

// ErrorCategory — z.enum
type ErrorCategory = 'AUTH' | 'RATE_LIMIT' | 'MERGE_CONFLICT' | 'TIMEOUT' | 'UNKNOWN';

// ExecutionMetadataSync — the full sync payload shape
interface ExecutionMetadataSync {
  version?: '1.0';
  taskId: string;
  runId: string;
  status: ExecutionStatus;
  startedAt?: string;       // ISO 8601 datetime
  completedAt?: string;     // ISO 8601 datetime
  durationMs?: number;      // non-negative integer
  branch?: string;
  commitSha?: string;
  prUrl?: string;           // valid URL
  prNumber?: number;        // positive integer
  outcome?: string;         // max 500 chars
  errorCategory?: ErrorCategory;
}
```

#### `validateExecutionMetadataSync(payload)`

Parses and returns the payload as `ExecutionMetadataSync`. Throws a `ZodError` if validation fails. Use this when an invalid payload should be a hard error.

```typescript
import { validateExecutionMetadataSync } from 'openlinear/types';

const metadata = validateExecutionMetadataSync({
  taskId: 'tsk_123',
  runId: 'run_456',
  status: 'completed',
  durationMs: 45000,
  branch: 'feature/add-login',
  prUrl: 'https://github.com/org/repo/pull/42',
  prNumber: 42,
});
```

#### `safeValidateExecutionMetadataSync(payload)`

Safe variant. Returns a discriminated union — never throws.

```typescript
import { safeValidateExecutionMetadataSync } from 'openlinear/types';

const result = safeValidateExecutionMetadataSync(payload);

if (result.success) {
  console.log('Ready to sync:', result.data);
} else {
  console.error('Validation failed:', result.error.errors);
}
```

#### `checkExecutionMetadataSync(payload)`

Returns a plain `{ valid: boolean; issues?: string[] }` report. Useful for surfacing human-readable errors in logs or UIs without dealing with `ZodError`.

```typescript
import { checkExecutionMetadataSync } from 'openlinear/types';

const { valid, issues } = checkExecutionMetadataSync(payload);
if (!valid) {
  issues?.forEach(issue => console.warn(issue));
  // e.g. "prUrl: Invalid url"
}
```

#### `validateExecutionMetadataMiddleware()`

Express middleware factory. Validates `req.body` against `ExecutionMetadataSyncSchema`, sets `req.validatedMetadata` on success, or responds `400` with a structured error on failure.

```typescript
import express from 'express';
import { validateExecutionMetadataMiddleware } from 'openlinear/types';

const app = express();
app.use(express.json());

app.post('/sync', validateExecutionMetadataMiddleware(), (req, res) => {
  // req.validatedMetadata is typed as ExecutionMetadataSync
  res.json({ received: req.validatedMetadata.taskId });
});
```

Error response shape (`400`):

```json
{
  "error": "Invalid sync payload",
  "code": "FORBIDDEN_FIELDS | VALIDATION_ERROR",
  "details": [{ "field": "prUrl", "message": "Invalid url" }]
}
```

---

### `openlinear/validation`

Utilities that enforce the trust boundary between local execution and the cloud dashboard. Sensitive fields are never allowed through the sync pipeline.

#### `FORBIDDEN_SYNC_FIELDS`

A readonly array of field names that are blocked from cloud sync:

```
prompt, logs, toolLogs, executionLogs, repoPath, accessToken, apiKey,
passwordHash, jwt, client, timeoutId, rawOutput, diff, fileContents,
env, environment, processEnv
```

#### `isForbiddenField(field)`

Returns `true` if the field name is in `FORBIDDEN_SYNC_FIELDS`.

```typescript
import { isForbiddenField } from 'openlinear/validation';

isForbiddenField('accessToken'); // true
isForbiddenField('taskId');      // false
```

#### `sanitizePayload(payload)`

Strips all forbidden fields from an arbitrary object and returns the sanitized result alongside a list of removed keys.

```typescript
import { sanitizePayload } from 'openlinear/validation';

const { sanitized, removed } = sanitizePayload({
  taskId: 'tsk_123',
  status: 'completed',
  accessToken: 'ghp_...',   // forbidden
  logs: '[tool output...]', // forbidden
});

// sanitized → { taskId: 'tsk_123', status: 'completed' }
// removed   → ['accessToken', 'logs']
```

---

### `openlinear/config`

Feature flag utilities for managing the gradual rollout of local execution mode.

#### `parseFeatureFlags(env?)`

Parses feature flags from `process.env` (or any key/value map you pass). All flags have safe defaults so this never throws in production.

```typescript
import { parseFeatureFlags } from 'openlinear/config';

const flags = parseFeatureFlags();
// or override for testing:
const flags = parseFeatureFlags({
  LOCAL_EXECUTION_ENABLED: 'true',
  CANARY_PERCENTAGE: '25',
});
```

| Flag | Type | Default | Description |
|---|---|---|---|
| `LOCAL_EXECUTION_ENABLED` | boolean | `false` | Master switch for local execution |
| `SERVER_EXECUTION_ENABLED` | boolean | `true` | Master switch for server execution |
| `CANARY_PERCENTAGE` | number (0–100) | `0` | % of users routed to local execution |
| `FORCE_LOCAL_EXECUTION` | boolean | `false` | Force local for all users (overrides canary) |
| `KILL_SWITCH_LOCAL_EXECUTION` | boolean | `false` | Disable local for all users immediately |

#### `getFeatureFlags()`

Shorthand for `parseFeatureFlags(process.env)`.

#### `isLocalExecutionEnabled(userId, flags?)`

Determines whether local execution is active for a specific user, respecting the kill switch, force flag, and canary percentage in that order.

```typescript
import { isLocalExecutionEnabled, getFeatureFlags } from 'openlinear/config';

const flags = getFeatureFlags();
const useLocal = isLocalExecutionEnabled('user_abc123', flags);
```

#### `isServerExecutionEnabled(flags?)`

Returns `flags.SERVER_EXECUTION_ENABLED`.

#### `validateFlagConfiguration(flags)`

Checks for invalid flag combinations and returns a `{ valid: boolean; errors: string[] }` report.

```typescript
import { validateFlagConfiguration, getFeatureFlags } from 'openlinear/config';

const { valid, errors } = validateFlagConfiguration(getFeatureFlags());
if (!valid) {
  errors.forEach(e => console.error('[config]', e));
}
```

Catches:
- `FORCE_LOCAL_EXECUTION` and `KILL_SWITCH_LOCAL_EXECUTION` both enabled simultaneously.
- Both `LOCAL_EXECUTION_ENABLED` and `SERVER_EXECUTION_ENABLED` disabled (no execution mode active).

#### `getMigrationPhase(flags?)`

Returns the current rollout phase as a readable string. Useful for observability and dashboards.

```typescript
import { getMigrationPhase } from 'openlinear/config';

getMigrationPhase(); // 'shadow' | 'canary' | 'cutover' | 'rollback' | 'unknown'
```

| Phase | Condition |
|---|---|
| `rollback` | Kill switch is active |
| `cutover` | Server execution disabled, local is primary |
| `canary` | Local enabled with `CANARY_PERCENTAGE > 0` |
| `shadow` | Local enabled but `CANARY_PERCENTAGE === 0` |
| `unknown` | No recognizable state |

---

## Security & Trust Boundaries

The sync pipeline enforces a strict boundary to ensure sensitive data never leaves your machine.

| Category | Examples | Synced to cloud? |
|---|---|---|
| Safe metadata | `taskId`, `status`, `durationMs`, `branch`, `prUrl` | Yes |
| Local-only paths | `repoPath`, `env`, `environment` | No — stripped |
| Credentials | `accessToken`, `apiKey`, `passwordHash`, `jwt` | No — stripped |
| Raw agent output | `prompt`, `logs`, `toolLogs`, `diff`, `rawOutput` | No — stripped |

Any payload passing through `sanitizePayload` or `safeValidateExecutionMetadataSync` has forbidden fields automatically removed or rejected before they can reach the network.

---

## How OpenLinear Works

1. **You create tasks** on the kanban board with descriptions of what you want built.
2. **You click execute** — the desktop app picks it up, clones your repo, and creates a branch.
3. **The agent writes code** locally using your API keys, in its own git worktree.
4. **You watch it work** — real-time SSE streams every tool call, file edit, and decision live.
5. **You get a PR** — changes are committed, pushed, and a pull request is opened automatically.

> For the full architecture deep dive, see [docs/ARCHITECTURE.md](https://github.com/kaizen403/openlinear/blob/main/docs/ARCHITECTURE.md).

---

## Building from Source

```bash
git clone https://github.com/kaizen403/openlinear.git
cd openlinear
pnpm install

# Build the npm package
pnpm --filter openlinear build

# Start the full stack
docker compose up -d    # PostgreSQL only
pnpm db:push
pnpm --filter @openlinear/api dev
pnpm --filter @openlinear/desktop dev
```

---

## Distribution

| Format | Platform | Install |
|---|---|---|
| AppImage | Linux | [GitHub Releases](https://github.com/kaizen403/openlinear/releases) |
| .deb | Debian/Ubuntu | [GitHub Releases](https://github.com/kaizen403/openlinear/releases) |
| AUR | Arch Linux | `yay -S openlinear-bin` |
| npm | Any (launcher) | `npm install -g openlinear` |

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

The npm package lives at `packages/openlinear` in the monorepo.

```bash
cd packages/openlinear
pnpm build    # compile with tsup
pnpm test     # run tests
```

---

## License

[MIT](https://github.com/kaizen403/openlinear/blob/main/LICENSE)
