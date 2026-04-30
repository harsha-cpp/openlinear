# Known Limitations

This document tracks intentional architectural limitations in OpenLinear that operators and contributors must understand before deploying.

---

## OpenCode runs in single-tenant mode

**Status**: Known limitation. Enforced at boot.

**Scope**: All deployments — desktop (Tauri sidecar) and self-hosted server.

### What this means

The OpenCode AI agent (`@opencode-ai/sdk`) is launched as **a single shared subprocess** by the sidecar (`apps/sidecar/src/services/opencode.ts`). All HTTP requests to OpenCode endpoints — regardless of which authenticated OpenLinear user issued them — are routed to that single process.

Concretely:

- **Provider credentials are shared.** OpenCode persists provider auth (OpenAI keys, Anthropic OAuth tokens, etc.) to its own auth store under `$XDG_DATA_HOME/opencode/auth.json` (or the platform equivalent). That file is global to the OpenCode process. If User A configures an OpenAI key, User B's requests to `/opencode/*` will use that same key.
- **Sessions are shared.** OpenCode session IDs are not partitioned by OpenLinear user. A session created by User A is visible to User B if B knows the session ID.
- **Model usage and cost telemetry are not user-scoped** at the OpenCode layer.

### Why this exists

OpenLinear was designed first as a **desktop application** (Tauri sidecar, one user per machine). In that deployment the limitation has no practical impact: there is exactly one human, one auth state, one set of sessions.

The same sidecar binary runs the cloud deployment at `https://openlinear.tech`. There, the limitation matters. We have not yet implemented per-user OpenCode isolation because it requires:

1. **Per-user `XDG_DATA_HOME`** — each user needs an isolated auth store directory.
2. **A port pool and lifecycle manager** — spawn an OpenCode subprocess per active user, reap idle instances after N minutes, cap concurrent processes (each consumes ~150–250 MB RAM).
3. **Reverse proxy / routing layer** — the sidecar must dispatch requests to the right user-scoped subprocess.

This is non-trivial work and orthogonal to the desktop value proposition. Tracked as future work; not on the 80% MVP roadmap.

### Enforcement

To prevent silent multi-tenant misuse, the sidecar **refuses to start** if it detects more than one user with provisioned auth state in the database, unless the operator explicitly opts in:

```
[Sidecar] Multi-user database detected (N users) but OpenCode runs in single-tenant mode.
[Sidecar] All users will SHARE OpenCode provider credentials and sessions.
[Sidecar] Set OPENLINEAR_ALLOW_SHARED_OPENCODE=1 to acknowledge and proceed.
```

The boot banner is also printed loudly on every startup so the limitation is visible in logs:

```
================================================================
  OpenCode runs in SINGLE-TENANT mode.
  All authenticated OpenLinear users share one OpenCode process,
  one provider auth store, and one session namespace.
  See docs/limitations.md for details.
================================================================
```

### Mitigations for cloud operators

If you self-host OpenLinear for multiple users today, you have three options:

1. **Don't.** Run one instance per user (one container, one volume, one DB) and front them with your own router. This is the supported configuration.
2. **Trust your users.** Set `OPENLINEAR_ALLOW_SHARED_OPENCODE=1` and accept that users see each other's provider credentials. Acceptable for internal teams that already share an OpenAI key.
3. **Disable OpenCode endpoints.** Set `OPENLINEAR_DISABLE_OPENCODE=1` (future flag, not yet wired) to gate `/opencode/*` routes off entirely.

### Future work

When per-user isolation is implemented, the changes will land in:

- `apps/sidecar/src/services/opencode.ts` — replace single `serverHandle` with `Map<userId, ServerHandle>`, add idle reaper.
- `apps/sidecar/src/services/opencode.ts` — `getClientForUser(userId)` becomes the lazy spawn entry point with per-user `XDG_DATA_HOME=/var/lib/openlinear/opencode/{userId}`.
- This document — remove the limitation section.

Tracking: see Plan T15 in `.sisyphus/plans/openlinear-80-percent.md`.
