# OpenCode Integration

OpenCode is the AI coding agent that executes tasks. It runs directly on the host machine, managed by the local sidecar (`apps/sidecar`) — no containers, no isolation overhead.

## Architecture

The OpenCode binary is bundled with the desktop app alongside the sidecar binary. When the sidecar starts, it spawns the OpenCode server process and communicates with it via the `@opencode-ai/sdk` client. The cloud API (`apps/api`) has no involvement in OpenCode management.

### Binary Resolution

The sidecar resolves the OpenCode binary using this priority:

1. `OPENCODE_BIN` environment variable (explicit override)
2. Bundled sibling binary next to `process.execPath` with Tauri target-triple naming (e.g., `opencode-x86_64-unknown-linux-gnu`)
3. Fallback to `opencode` in system PATH (dev mode)

### Lifecycle

On sidecar startup:
1. Resolve the OpenCode binary path
2. Spawn the OpenCode server process
3. Wait for the server to become healthy
4. Create an SDK client connected to the server

On sidecar shutdown, the OpenCode process is gracefully terminated.

## SDK

OpenLinear uses `@opencode-ai/sdk` which provides:
- `createOpencodeClient()` -- creates a client for a running OpenCode server
- `OpencodeClient` -- type for session management, event subscription, provider configuration

Note: The SDK's `createOpencodeServer()` is **not used** because it hardcodes `spawn("opencode", ...)` which can't find the bundled sidecar binary. OpenLinear uses a custom `spawnOpencodeServer()` that accepts a resolved binary path.

## Session Management

For each task execution:
1. `client.session.create({ title, directory })` -- creates a new agent session
2. `client.session.prompt({ parts: [{ type: 'text', text }] })` -- sends the task as a prompt
3. `client.session.abort()` -- cancels the session on user cancel or timeout

## Event Streaming

`client.event.subscribe()` returns an async iterable stream. Events handled:

| Event | Action |
|-------|--------|
| `session.completed` / `session.idle` | Agent finished -- commit and PR |
| `session.error` | Execution failed |
| `session.status` (busy) | Mark agent as thinking |
| `session.status` (retry) | Log retry reason |
| `message.part.updated` (text) | Accumulate agent text deltas |
| `message.part.updated` (tool) | Log tool start/complete/error |
| `message.part.updated` (reasoning) | Accumulate reasoning deltas |
| `tool.execute.before` | Log tool starting |
| `tool.execute.after` | Log tool finished, increment counter |
| `file.edited` | Log file edit, increment counter |
| `server.heartbeat` | Ignored |

## Delta Buffer

Text and reasoning arrive as small character-by-character deltas. The delta buffer accumulates them and flushes complete messages to the log at sentence boundaries or after a timeout.

## Provider Authentication

Users configure which LLM provider OpenCode uses through the provider auth API. Two methods are supported:

**API Key:** Set a provider's API key directly via `POST /api/opencode/auth` (sidecar route).

**OAuth:** Start an OAuth flow via `POST /api/opencode/auth/oauth/authorize`, then complete it with `POST /api/opencode/auth/oauth/callback`. Both are sidecar routes.

Provider credentials are stored in the OpenCode config directory on the host machine.

## API Endpoints

All `/api/opencode/*` endpoints are served by the local sidecar (`apps/sidecar`), not the cloud API. All endpoints except `/status` require authentication.

### `GET /api/opencode/status`

Returns the overall OpenCode system state (whether the sidecar is running and healthy).

### `GET /api/opencode/providers`

**Auth: required.** List available LLM providers from the OpenCode instance.

### `GET /api/opencode/providers/auth`

**Auth: required.** Get the authentication status for each provider (which providers have credentials configured).

### `POST /api/opencode/auth`

**Auth: required.** Set an API key for a provider.

Body: `{ "providerId": "anthropic", "apiKey": "sk-..." }`

Response: `{ success: true, providerId: "anthropic" }`

### `POST /api/opencode/auth/oauth/authorize`

**Auth: required.** Start an OAuth authorization flow for a provider.

Body: `{ "providerId": "...", "method": 0 }`

Returns the authorization URL and flow data.

### `POST /api/opencode/auth/oauth/callback`

**Auth: required.** Complete an OAuth authorization flow.

Body: `{ "providerId": "...", "code": "...", "method": 0 }`

Returns the result of the OAuth token exchange.

## Model Configuration

OpenLinear does not configure which model OpenCode uses. That comes from OpenCode's own config files (stored in the host's OpenCode config directory, typically `~/.config/opencode`).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENCODE_BIN` | Path to the OpenCode binary (overrides bundled sidecar) | -- |
| `OPENCODE_PORT` | OpenCode server port | `4096` |
| `OPENCODE_HOST` | OpenCode server host | `127.0.0.1` |
