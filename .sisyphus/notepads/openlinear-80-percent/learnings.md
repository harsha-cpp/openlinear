# Learnings & Conventions — openlinear-80-percent

This file accumulates patterns, conventions, and gotchas discovered during execution.
Subagents must APPEND (never overwrite). Format: `## [TIMESTAMP] Task: T## — {topic}`.

## [BOOTSTRAP] Repo conventions baseline (from research, captured pre-execution)

- **Monorepo**: pnpm workspaces + turborepo. Apps: `apps/api`, `apps/sidecar`, `apps/desktop-ui`, `apps/landing`, `apps/desktop` (Tauri). Packages: `packages/db` (Prisma), `packages/openlinear`, `packages/openlinear-cli`.
- **Node**: 22.x. **Package manager**: pnpm. Use `--no-frozen-lockfile` in CI/Docker (lockfile drift after bcryptjs removal).
- **Prisma**: 7.4 with `@prisma/adapter-pg` driver-adapter mode (NOT classic native engine). WASM query compiler at `query_compiler_fast_bg.wasm`.
- **Schema quirk to PRESERVE**: `Repository @@map("projects")` is being renamed to `repositories` in T1. `Project @@map("linear_projects")` STAYS — DO NOT touch.
- **Prisma client**: `packages/db/src/client.ts` is a lazy-cached singleton Proxy with `value.bind(client)`. DO NOT regress.
- **`$transaction` callsites**: ALWAYS pass `{ timeout: 15000, maxWait: 5000 }` — the default 5s default caused the original P2028 bug.
- **`NODE_ENV=production` in shell**: causes pnpm to skip devDeps. Use `--prod=false` or `unset NODE_ENV` in build scripts.
- **API base URLs**: Two — `getApiUrl()` (cloud) and `getSidecarApiUrl()` (Tauri local). Sidecar URL resolves ASYNC via `ensureSidecarListener()`. NEVER capture at module top-level.
- **Auth**: GitHub OAuth only. JWT in `localStorage['token']`. Header `Authorization: Bearer …` + `x-openlinear-client: desktop`.
- **`OPENLINEAR_TRUST_PROXY_AUTH=1`**: footgun — accepts any unsigned JWT. T4 hardens this to refuse in `NODE_ENV=production`.
- **Component prefix `linear-*`**: Linear-app inspired styling, NOT a brand reference. Keep.
- **Branding**: 95% rebrand-complete. Domain canonical = `openlinear.tech` (NOT `.dev`). Personal handle `kaizen403` → `openlinear` org (T41).
- **Test infrastructure**: NONE. All QA is agent-executed via Playwright (UI), curl (API), tmux (CLI). Evidence to `.sisyphus/evidence/task-{N}-{slug}.{ext}`.
- **Container**: `openlinear:preview` image, `openlinear` container (Postgres + sidecar + 2 Next apps). Ports 3000/3001/3002/5432. Control via `scripts/openlinear.sh`. `restart` does `up -d --force-recreate`.

## [BOOTSTRAP] Critical anti-patterns to AVOID

- `as any` / `@ts-ignore` — banned by Must NOT Have
- `console.log` in production code — use `pino` (T4 introduces it)
- `window.confirm() / alert() / prompt()` — banned (T19 replaces 4 sites)
- Raw `localStorage.getItem('token')` outside `apiFetch()` — banned (T20 cleans 8 sites)
- Direct `fetch()` in pages — must go through `apiFetch()` or `lib/api/*`
- Raw hex color literals (`bg-[#1a1a1a]`) — must use `linear-*` tokens (T38)
- `exec()` with shell template literals — `execFile`/`spawn` arrays only (T6 critical)
- New endpoints without auth + ownership checks
- New Prisma queries without index coverage on `where` filters
- Module-level `getApiUrl()` / `getSidecarApiUrl()` captures — call inside functions (T3)

## [2026-05-01 03:03] Task: T5 — Brand assets

### Canonical brand color
- **Primary accent**: `#1d4ed8` (OpenLinear blue, matches existing `--linear-accent`)
- **Dark canvas**: `#0a0a0a` (matches new theme-color meta)
- **OG gradient**: `#0a0a0a → #111827` with radial accent glow at 0.85,0.15

### Logomark concept
- Stylized "OL": outer ring (O) + 45° forward-slanting bar (L / execution arrow)
- 64x64 viewBox, 8px stroke weight (7px on rounded-app-icon variant w/ 14px corner radius)
- Single-fill via `currentColor` so it inherits color in any context (sidebar, button, etc.)
- Verified legible at 16px (see `.sisyphus/evidence/task-5-logomark-sizes.png`)

### Asset generation pipeline
- `scripts/generate-brand-assets.cjs` is the canonical generator. Re-run anytime brand changes.
- Uses `sharp` (PNG resize from inline SVG) + `png-to-ico` (multi-size .ico). Both at workspace root.
- IMPORTANT: `png-to-ico` v2 ESM default export — must `require('png-to-ico').default`
- Tauri icon CLI needs a real PNG (not SVG) source — pre-render to 1024x1024 PNG, then `pnpm --filter @openlinear/desktop tauri icon /tmp/<source>.png`. This generates the full Tauri set (icon.icns, icon.ico, 32x32, 64x64, 128x128, 128x128@2x, plus iOS AppIcon-* and Android mipmap-* directories).

### Layout metadata
- Use Next.js 14+ `Metadata.icons` object (no manual `<link>` tags needed for favicons)
- `metadataBase: new URL('https://openlinear.tech')` enables relative OG image URLs
- Apple touch icon must be 180x180; favicon.ico bundles 16/32/48

## [2026-05-01] Task: T6 — Shell injection elimination in git.ts/worktree.ts

**Pattern**: Centralize all subprocess invocation through one promisified `execFile` seam (`apps/sidecar/src/services/execution/exec.ts`). NEVER use `child_process.exec` with template literals — even seemingly-safe interpolated values (branch names, repo paths, commit messages) become RCE vectors when sourced from user/DB input.

**Key conversion rule**:
- `execAsync(\`git -C ${path} commit -m "${msg}"\`)` → `execFileAsync('git', ['-C', path, 'commit', '-m', msg])`
- Each argv element is passed verbatim, so `;`, `&&`, `|`, `$()`, backticks inside untrusted strings become literal characters.

**GitHub token handling (avoid .git/config leak)**:
- Old: `https://oauth2:${token}@github.com/...` baked into clone URL → token persisted in `.git/config`.
- New: `git -c credential.helper='!f() { echo "username=oauth2"; echo "password=$GH_TOKEN"; }; f' clone <plain-url>` with `GH_TOKEN` set in process env only.
- The `-c credential.helper=...` flag is itself a single argv element (not shell-parsed), so the helper script string is safe.

**Force-push hardening**: replaced `--force` with `--force-with-lease` everywhere — prevents clobbering refs that moved since last fetch (finding #56).

**Caller-signature impact**: `commitAndPush` now takes optional `accessToken` for the credential helper on push. Updated single caller (`events.ts handleSessionComplete`) to pass `execution.accessToken`.

**Verification commands**:
- `grep -nE 'execAsync\(\`|exec\(\`' apps/sidecar/src/services/execution/git.ts apps/sidecar/src/services/worktree.ts` → 0 matches
- Injection harness: malicious branch name `'feature; rm /tmp/SHOULD_NOT_EXIST'` → git rejects as invalid ref name; marker file untouched.
- Token-leak harness: cloned `.git/config` contains plain URL with no `oauth2:` substring.

## [2026-04-30T21:40:22Z] Task: T4 — API hardening (pino, helmet, rate-limit, error mw, graceful shutdown)

- **Logger module added**: `apps/api/src/logger.ts` exported via `@openlinear/api/logger` so sidecar shares the same pino instance + redact paths. Avoid `pino-pretty` transport — not installed and breaks runtime; rely on raw JSON (operators pipe through pretty themselves).
- **Middleware order in createApp() (must not change)**: helmet → pinoHttp → rate-limiters (default + per-prefix) → cors → json(`256kb`) → cookieParser → routes → SSE handler → errorHandler. Anything after errorHandler silently bypasses error catching.
- **Rate limit SSE skip**: every limiter checks `req.path === '/api/events' || startsWith('/api/events')`. The default limiter is wrapped in a manual middleware to apply that check; per-prefix limiters use rate-limit's `skip` option.
- **CORS bug fix**: `callback(null, false)` instead of `callback(new Error())` — throwing inside the origin callback escapes Express's middleware error chain on some versions.
- **express-rate-limit v8**: use `limit` (not deprecated `max`) and `standardHeaders: 'draft-7'`. Custom `handler` returns JSON body `{error:'rate_limited', scope, retryAfterSeconds}`.
- **pino-http reqId**: `genReqId` honours incoming `x-request-id`, otherwise mints `randomUUID()`. Same id is set on the response header so the global error handler can read it back via `res.getHeader('x-request-id')`.
- **Redaction proven**: pino redact paths cover both `req.headers.authorization` and `req.headers.cookie` plus `res.headers["set-cookie"]`. Verified in QA log — both show `[REDACTED]` end-to-end.
- **Trust-proxy footgun**: import-time guard in `apps/api/src/middleware/auth.ts` calls `process.exit(1)` if `OPENLINEAR_TRUST_PROXY_AUTH=1 && NODE_ENV=production`. Per-request `logger.warn` fires on every `requireAuth`/`optionalAuth` call when the flag is on in non-prod (loud signal in dev logs).
- **Graceful shutdown pattern**: `server.close(cb)` then `prisma.()` then `process.exit`. 10s force-exit timer is `.unref()`-ed so it doesn't keep the loop alive on its own. Sidecar additionally closes the OAuth interceptor app before `server.close`.
- **QA evidence**:
  - `.sisyphus/evidence/task-4-rate-limit.txt` — auth route returns 429 on request 6; SSE survives 12 rapid connects (no rate limit).
  - `.sisyphus/evidence/task-4-error-middleware.txt` — uncaught throw → 500 JSON `{error:'internal_error', requestId}`; matching reqId across log + response header; auth/cookie redacted.
  - `.sisyphus/evidence/task-4-graceful-shutdown.txt` — SIGTERM → drain + prisma disconnect in 0.213s.
  - `.sisyphus/evidence/task-4-trust-proxy-guard.txt` — prod boot with `OPENLINEAR_TRUST_PROXY_AUTH=1` → FATAL log + `exit=1`; dev boot succeeds.
- **Followups for T8/T9/T13**: they can rely on `req.log` (pino-http auto-attaches), `logger` import from `@openlinear/api/logger`, and the global error middleware to swallow throws — no need for per-route try/catch wrappers around sync errors.

## [2026-04-30T21:40Z] Task: T2 — shadcn primitives + design tokens

- **Next.js underscore-prefix folders are ignored by routing.** `app/_dev/primitives/page.tsx` does NOT register a route (private folder convention). The plan QA spec said `app/_dev/primitives/page.tsx` but Next will return 404. Used `app/dev-primitives/` instead, deleted after QA.
- **shadcn/ui primitive style template:** use `React.forwardRef<ElementRef<typeof X>, ComponentPropsWithoutRef<typeof X>>` and `cn(...)` from `@/lib/utils`. All 13 existing primitives follow this exact shape — new ones must too for consistency.
- **components.json**: `style: default`, `baseColor: neutral`, `cssVariables: true` — every new primitive must use semantic tokens (`bg-popover`, `text-foreground`, `border`, `bg-accent`) NOT raw hex or `linear-*` literals (the `linear-*` namespace is reserved for the runtime `--linear-accent` themability — touching it would break that).
- **Sheet uses `@radix-ui/react-dialog` under the hood** (per shadcn upstream); `cva` from `class-variance-authority` for the `side` variant.
- **Command (cmdk) wraps Dialog**: `CommandDialog` re-uses `@/components/ui/dialog` to share the overlay/animation, keeping bundle size small.
- **AlertDialog reuses `buttonVariants`** from `@/components/ui/button` for Action/Cancel — keeps button styling identical across confirm flows.
- **Design tokens module** (`lib/design-tokens.ts`): exported as `Readonly<Record<...>>` typed constants (`STATUS_COLORS`, `PRIORITY_COLORS`, `SHADOWS`) so consumers get IntelliSense on status keys. Used `bg-{color}-500/10` + `text-{color}-400` + `border-{color}-500/30` triad pattern — works on dark backgrounds and is easy to swap if/when light mode lands (T29 territory).
- **Tailwind boxShadow extension**: added `card`/`overlay`/`elevation` semantic tokens. Values are tuned for the dark theme (high opacity black). T29/T37 will need to make these CSS-variable-driven if they're reused on light surfaces.

## [2026-05-01] Task: T1 — Schema migration tooling

- **Prisma 7.4 CLI flags renamed**: `--from-url`/`--to-url` are REMOVED. Use `--from-config-datasource` / `--to-config-datasource` (reads `prisma.config.ts`). For schema files use `--from-schema` / `--to-schema` (was `--from-schema-datamodel`/`--to-schema-datamodel`).
- **Prisma config datasource silent failure**: `prisma migrate diff --from-config-datasource ...` returns empty output (exit 0) if `DATABASE_URL` env is not set, even though `prisma.config.ts` reads `process.env.DATABASE_URL!`. ALWAYS export DATABASE_URL inline before the command.
- **DB had no migration history** (was bootstrapped via `db:push`). Recovery pattern:
  1. Generate baseline migration via `migrate diff --from-empty --to-config-datasource --script` → save as `<ts>_init/migration.sql`
  2. Generate change migration manually (especially when rename is involved — see below)
  3. Apply change SQL via `psql -f`
  4. `prisma migrate resolve --applied <name>` for both → registers in `_prisma_migrations` table
  5. `prisma migrate status` reports "Database schema is up to date!"
- **Table rename trap**: `prisma migrate diff` cannot detect renames — it always emits DROP + CREATE which is data-destructive. For Repository `@@map("projects")` → `@@map("repositories")`, write the migration MANUALLY with `ALTER TABLE "projects" RENAME TO "repositories"` + `RENAME CONSTRAINT projects_pkey/projects_userId_fkey` + `ALTER INDEX projects_userId_githubRepoId_key RENAME` + drop/re-add the FK in linear_projects (since constraint name embeds old table reference).
- **`packages/db/.env`** does NOT exist by default. `seed.ts` does `process.loadEnvFile(resolve(import.meta.dirname, "../.env"))` — that's `packages/db/.env`. Created with `DATABASE_URL=postgresql://openlinear:openlinear@127.0.0.1:5432/openlinear` for Prisma CLI.
- **`pnpm exec prisma`** fails with `Command "prisma" not found` from monorepo root and even from `packages/db`. Direct binary path works: `./node_modules/.bin/prisma` (when CWD = `packages/db`) or `./packages/db/node_modules/.bin/prisma` from root.
- **Prisma migration.sql section markers** (`-- CreateTable`, `-- CreateIndex`, `-- AddForeignKey`, `-- AlterTable`, `-- CreateEnum`, `-- DropForeignKey`) are CANONICAL Prisma format — keep them despite agent-memo-comment hooks (they are necessary structural markers per Prisma toolchain).
- **AgentRun decimal**: use `costUsd Decimal? @db.Decimal(12, 6)` — gives 6 decimal places of precision for fractional cents.
- **Native enum values in Postgres** must be quoted as the type name (`"agent_run_statuses"`, `"notification_types"`, `"activity_actions"`) when declaring columns.
- **Two opposite-side User relations to Task** require explicit relation names: `assignee   User? @relation("assignedTasks", ...)` + `creator User? @relation("createdTasks", ...)` plus matching back-relations `assignedTasks Task[] @relation("assignedTasks")` + `createdTasks Task[] @relation("createdTasks")` on User.
- **Self-relation on Task for parentId**: `parent Task? @relation("Subtasks", fields: [parentId], references: [id], onDelete: SetNull)` + `subtasks Task[] @relation("Subtasks")`.
- **Notification has TWO User FKs** (`userId` recipient, `actorUserId` who did the action) → needs two named relations: `"notificationRecipient"` + `"notificationActor"`.

## [2026-05-01] Task: T3 — apiFetch wrapper + 401 handler + lazy URL resolution

### Pattern: Single HTTP seam
- Created `apps/desktop-ui/lib/api/fetch.ts` exporting `apiFetch<T>(path, init?: RequestInit & { sidecar?: boolean })`
- Auto Content-Type for JSON bodies (skips FormData/Blob/ArrayBuffer/URLSearchParams)
- Auto Authorization + x-openlinear-client headers via existing `getAuthHeader()`
- 401 → `AuthExpiredError` (subclass of `ApiError`) + dispatches `auth:expired` window event
- non-2xx → `ApiError` with parsed `{ error, code, details }` envelope
- network failure → `NetworkError` ("Could not reach OpenLinear server")
- AbortError propagates as-is (callers detect cancellation)
- Latch on `auth:expired` dispatch (1s) prevents N concurrent 401s firing N events

### Pattern: apiFetchRaw for streaming
- `apiFetchRaw()` returns `Response` after auth/error handling — used by `streamBrainstormTasks()` (NDJSON) and `oauthCallback()` (uses AbortController)
- Same 401/NetworkError envelope as `apiFetch` but caller reads `response.body` manually

### Pattern: OpenCode error class re-mapping
- `opencodeFetch()` wrapper translates `ApiError(status>=500)` → `OpenCodeUnavailableError`
- Other ApiError → plain `Error` with envelope message (preserves call-site behavior)
- All opencode.ts functions go through this wrapper now

### Bug class fixed: module-level URL captures
- 5 sites had `const X = getApiUrl()` at module top — broke Tauri sidecar URL discovery (URL is only known after `sidecar:ready` event fires)
- Fixed by either moving to `apiFetch` calls (lazy) or moving `getSidecarApiUrl()` inside callbacks (api-loading-screen)
- Verified zero remaining via `grep -rEn "^(const|let|var) [A-Z_]+ ?= ?(getApiUrl|getSidecarApiUrl)\("`

### Auth listener wiring
- `hooks/use-auth.tsx` adds `window.addEventListener('auth:expired')` → `setUser(null)`, `setActiveRepository(null)`, `toast.error("Session expired...")`, `router.push('/login')` (skip if already on /login or /)
- Imported `useRouter`, `usePathname` from `next/navigation`, `toast` from `sonner` (both already in dep tree)

### Migration count
- 7 lib/api/*.ts files rewritten (auth, tasks, projects, teams, repos, brainstorm, opencode)
- use-kanban-board.ts: 8 hand-rolled token sites + 2 module captures + 2 silent error swallows fixed
- archived/page.tsx: 4 fetches migrated, all with toast on error, deleteSelected uses Promise.allSettled
- task-form.tsx, label-picker.tsx, api-loading-screen.tsx: module captures eliminated
- teams/manage/page.tsx + settings/page.tsx: untyped fetches replaced with apiFetch

### Gotchas
- `next dev` generates `.next/types/validator.ts` referencing stale routes → must `rm -rf .next` before clean tsc
- `getActiveRepository()` and `fetchCurrentUser()` use `allowUnauthenticated: true` to silently no-op when no token — bootstrap flow on cold start
- `addRepoByUrl`, `getActivePublicRepository`, `activatePublicRepository` are public endpoints (no auth) — use `allowUnauthenticated: true`

## [2026-05-01] Task: T7 — AUTH + ownership seam

**OwnershipError contract** (consumed by T9 fetch.ts validation, T10 comments, T13 notifications):

```ts
class OwnershipError extends Error {
  readonly code = 'OWNERSHIP_REQUIRED';
  resourceType: 'task' | 'project' | 'team' | 'comment' | 'label';
  resourceId: string;
  reason: 'not_found' | 'forbidden' | 'role_required';
  requiredRoles?: string[];   // only on 'role_required'
}
```

**Wire format** (set by `apps/api/src/app.ts` errorHandler — pattern-matches `isOwnershipError`):
- `reason='not_found'`         → HTTP 404 + `{ error:'not_found',  code:'OWNERSHIP_REQUIRED', resourceType, resourceId, requestId }`
- `reason='forbidden'`         → HTTP 403 + `{ error:'forbidden',  code:'OWNERSHIP_REQUIRED', resourceType, resourceId, requestId }`
- `reason='role_required'`     → HTTP 403 + `{ error:'forbidden',  code:'OWNERSHIP_REQUIRED', resourceType, resourceId, requiredRoles, requestId }`

**Existence-leak collapse**: `assertTeamRole` returns `not_found` (404) when the user has no membership at all. This is intentional — distinguishing "team doesn't exist" from "you're not a member" would let attackers enumerate team IDs. The downstream UI should treat 404 with code=OWNERSHIP_REQUIRED as "you don't have access" not "the resource was deleted".

**Backward-compat exception**: `assertTaskOwned` allows ANY authenticated user to access tasks where `teamId IS NULL` (legacy/personal tasks). Tightening this would break the "no team backward compat" tests and the inbox ungrouped flow. T11 may revisit if we add per-user task ownership.

**Single seam discipline**: ALL ownership checks go through `apps/api/src/services/ownership.ts`. Routes do NOT inline `await getUserTeamIds().includes(...)` — they call the typed helper so the OwnershipError → wire format mapping stays consistent.

**Sidecar consumption**: `@openlinear/api/ownership` is exported in apps/api/package.json so `apps/sidecar/src/routes/{execution,batches}.ts` can call `assertTaskOwned()` directly. Sidecar uses `optionalAuth` (not `requireAuth`) because some legacy local-dev flows call without a token; when a userId IS present we enforce ownership, when it's absent we allow (matches T7 spec wording "optionalAuth + ownership").

**Schema changes shipped here (coordinate with T1)**:
- `Settings`: dropped `id="default"` singleton, added `userId String? @unique` (per-user settings)
- `Label`: dropped global `name @unique`, added `teamId String?` + composite `@@unique([teamId, name])` (per-team labels, with shared global labels when teamId is null)

**Test data drift**: Existing vitest suites assumed unauthenticated routes worked. Updated `tasks.test.ts`, `teams.test.ts`, `projects.test.ts` to use `Authorization: Bearer <token>` + `TeamMember` rows for the test user. Tests run against a real Postgres so they're skipped in environments without one — manual QA via curl is canonical (see `.sisyphus/evidence/task-7-*.txt`).

**N+1 risk**: `assertTeamRole` is one Prisma query (TeamMember lookup by composite unique). `assertTaskOwned` is one query for the task + one `getUserTeamIds()` call (which is one query). Routes that loop (e.g. project create with multiple teamIds, batch create with multiple taskIds) intentionally iterate sequentially — small N (≤20 enforced by zod) and clearer error messages than `Promise.all` rejection.

## T12 — Search API
- Prisma ILIKE on Postgres = `{ contains: q, mode: 'insensitive' }` (Postgres-only filter)
- Scope source of truth = `getUserTeamIds(userId)` (T7). NEVER trust client-supplied teamId for scoping.
- Short-circuit when userTeamIds=[]: skip Prisma query, return [] for tasks/projects.
- Project scoping is many-to-many: `projectTeams.some({ teamId: { in: userTeamIds } })`.
- Team scoping is direct: `members.some({ userId })` — do NOT route through teamIds (different invariant: list of teams the user is a member of).
- Per-user rate limiter: mount AFTER requireAuth so AuthRequest.userId is populated; use it as keyGenerator (NOT IP — same-NAT users would share a bucket).
- Limit distribution across types: `Math.max(1, Math.floor(limit / types.length))`.
- Search hit shapes deliberately abbreviated (id + title/name + type discriminator + identifier for tasks) → keeps Cmd+K (T25) payload small.

## [2026-05-01] Task: T10 — Comments API + @mention → Notification fan-out

**Mention regex** (consumed by T13 notifications, T27 UI mention picker):

```ts
/(?:^|\s)@([a-zA-Z0-9_-]+)/g
```

The leading `(?:^|\s)` anchor is non-negotiable — without it `email@domain.com`
matches as `@domain` and creates ghost notifications. Allowed username chars
mirror the `User.username` column (alphanum + `_` + `-`); add chars here ONLY
if you also widen the schema constraint.

Use `RegExp.exec()` in a `while` loop, not `String.matchAll()` — TS2802 in the
repo's current `target` setting (no downlevelIteration on the `RegExpStringIterator`).

**Mention dedupe + commenter-exclusion** (one helper, reused by PATCH):

```ts
const recipientIds = Array.from(
  new Set(mentionedUsers.map(u => u.id).filter(id => id !== req.userId)),
);
```

Two filters in one expression: `Set` collapses duplicates from `@bob @bob` AND
when two distinct usernames resolve to the same userId (rare, but possible
during rename windows). The `!== req.userId` filter prevents self-notification —
required because the spec says "exclude commenter" and because a self-notification
would render as a confusing "you mentioned you" inbox row.

**Silent-skip on missing mention** (don't break the comment over a typo):

```ts
const found = new Set(mentionedUsers.map(u => u.username));
const missing = usernames.filter(u => !found.has(u));
if (missing.length > 0) {
  req.log?.warn({ missing, taskId, userId }, '[comments] @mention skipped — user(s) not found');
}
```

The comment is still created with `mentions: <only resolved IDs>` — no notification
row exists for ghost mentions, and the missing names are NOT stored. T27 UI must
treat the rendered `@username` differently if it's not in `comment.mentions`
(unresolved → render as plain text or strikethrough).

**Broadcast pairing** (T13 will reuse for assignment + status_change events):

For mutation routes that change a resource AND fan-out notifications:
1. **Resource event** → `broadcastToTeam(task.teamId, 'comment:created', ...)` (or
   `broadcastToUser(authorId, ...)` for legacy null-team tasks).
2. **Notification event** → `broadcastToUser(recipientId, 'notification:created', notification)`
   per recipient.

Two separate broadcasts, not one combined event — different consumers (kanban
board listens for the resource event; inbox listens for notification events).
The notification row carries enough state (`commentId`, `actorUserId`, `body`)
that the inbox doesn't need to re-fetch the comment.

**Transaction boundary**:

Wrap `comment.create` + `notification.create` fan-out in `prisma.$transaction(async (tx) => ...)`
so a notification-table FK failure rolls back the comment. Broadcasts happen
AFTER the transaction commits — never broadcast inside the txn closure (would
fire on rollback paths).

**Mount path**:

Routes use `/tasks/:taskId/comments` AND `/comments/:id` patterns, so mount on
`/api` (not `/api/comments`):

```ts
app.use('/api', commentsRouter);
```

**Permission ladder for DELETE**:

- Author             → allowed (T7 `assertCommentOwned` returns owned)
- Team owner/admin   → allowed via `assertTeamRole(teamId, userId, ['owner','admin'])`
- Else               → 403

PATCH is strictly author-only — even team owners can't edit others' comments
(constraint from T10 "Must NOT do"). This is asymmetric on purpose: editing
implies authorship, deleting is moderation.

**Notification.actorUserId convention** (set every time a notification is
created on someone's behalf):

```ts
{
  userId: <recipient-id>,        // who sees it in their inbox
  actorUserId: <causer-id>,      // who did the action
  type: 'mention' | 'assignment' | 'status_change' | 'comment',
  taskId, commentId, body,
}
```

Inbox UI (T28) renders `<actor.username> mentioned you in <task.title>` — the
recipient is implicit (it's "you") so it's NOT shown.
