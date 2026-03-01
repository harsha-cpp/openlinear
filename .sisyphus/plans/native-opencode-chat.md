# Native OpenCode Chat In OpenLinear

## TL;DR

> **Quick Summary**: Add a native in-app chat experience in desktop UI that uses OpenLinear API + existing per-user OpenCode container/session plumbing, instead of exposing raw worker URL/port directly.
>
> **Deliverables**:
> - Authenticated chat API endpoints under `/api/opencode/chat/*`
> - SSE-backed streaming chat in desktop UI (`/chat`)
> - Sidebar chat entry + provider-gated UX
> - Integration tests + Playwright QA + docs updates
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 implementation waves + final verification wave
> **Critical Path**: 1 -> 6 -> 7 -> 12 -> 14 -> 16 -> F1/F3

---

## Context

### Original Request
- User observed worker endpoint (for example `http://127.0.0.1:30000`) during `pnpm dev` and wants that capability available inside OpenLinear itself.

### Interview Summary
**Key Discussions**:
- User wants planning first, then execution.
- Integration mode finalized: **native chat UI** (not embedded worker iframe).
- Test strategy finalized: **tests-after**.

**Research Findings**:
- Worker runtime is currently container-per-user with dynamic port allocation and container lifecycle management in `apps/api/src/services/container-manager.ts`.
- Current UI already ensures runtime via `POST /api/opencode/container` in `apps/desktop-ui/lib/api/opencode.ts`.
- API already uses OpenCode session APIs in execution flows (`session.create`, `session.prompt`, `session.abort`) via `apps/api/src/services/execution/lifecycle.ts`.
- Existing SSE infrastructure is global broadcast in `apps/api/src/sse.ts` and frontend subscription in `apps/desktop-ui/providers/sse-provider.tsx`.

### Metis Review (Incorporated)
**Identified gaps (addressed in this plan)**:
- Session ownership/scoping had to be explicit -> default set to per-user global chat sessions.
- Isolation guardrails had to be explicit -> no client-provided worker host/port, strict requireAuth, server-owned session mapping.
- Stream contract/cancellation/reconnect acceptance criteria were missing -> now explicit in every relevant task.
- Scope creep risks (attachments, history search, exports, multi-model orchestration) had to be locked out of v1.

---

## Work Objectives

### Core Objective
Ship a native, authenticated, streaming chat feature in OpenLinear desktop UI that talks to OpenCode through existing API runtime management and does not require users to manually access worker ports.

### Concrete Deliverables
- New authenticated chat endpoints in API (`/api/opencode/chat/session`, `/api/opencode/chat/message`, `/api/opencode/chat/cancel`, `/api/opencode/chat/history`).
- New desktop chat page and components with streaming assistant output.
- SSE event contract for chat updates integrated with existing SSE provider.
- Test coverage for auth isolation, stream correctness, cancellation, reconnect behavior.

### Definition of Done
- [ ] Authenticated user can open `/chat`, auto-ensure runtime, create/send/cancel chat prompts.
- [ ] Streaming responses render incrementally with deterministic completion state.
- [ ] API rejects unauthorized or cross-user session access.
- [ ] Existing task-execution flow remains non-regressed.

### Must Have
- Native OpenLinear chat UI only (no embedded external worker UI in v1).
- Server-owned session mapping; client never receives or controls raw worker base URL.
- Strict `requireAuth` on all chat routes.
- Tests-after strategy plus agent-executed QA scenarios for every task.

### Must NOT Have (Guardrails)
- No direct frontend calls to `127.0.0.1:30000-31000`.
- No broad refactor of execution lifecycle beyond required chat hooks.
- No v1 scope creep: attachments, export, history search, multi-chat folders, model marketplace.
- No acceptance criteria requiring manual human validation.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: YES (Tests-after)
- **Framework**: Vitest API integration tests + Playwright UI scenarios

### QA Policy
- Every task includes one happy-path and one negative/error scenario.
- Evidence path required per scenario under `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

| Deliverable Type | Verification Tool | Method |
|------------------|-------------------|--------|
| API endpoints | Bash (`curl`) + Vitest | Auth/session validation, status/payload assertions |
| Streaming bridge | Bash + SSE stream capture | Ordered event chunks and completion/cancel semantics |
| Desktop UI | Playwright | Real user flows (open chat, send prompt, stream, cancel, retry) |
| Integration safety | Vitest + typecheck | Non-regression on existing execution/task APIs |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - start immediately)
├── Task 1: Define chat API contract + DTOs [deep]
├── Task 2: Add chat service abstraction over OpenCode client [quick]
├── Task 3: Define chat SSE event schema + frontend typing [deep]
├── Task 4: Scaffold /chat route + baseline UI layout [visual-engineering]
└── Task 5: Sidebar navigation entry + route state behavior [quick]

Wave 2 (Backend core - max parallel)
├── Task 6: Implement chat routes with requireAuth [unspecified-high]
├── Task 7: Implement stream bridge from OpenCode events to chat SSE [deep]
├── Task 8: Session ownership/state map with per-user isolation [deep]
├── Task 9: Chat error normalization + API response contract [quick]
├── Task 10: Runtime ensure + warm/cold state handling for chat [unspecified-high]
└── Task 11: API tests for auth/isolation/cancel/history [deep]

Wave 3 (Frontend core - max parallel)
├── Task 12: Desktop chat API client wrapper [quick]
├── Task 13: Message list + composer + streaming renderer [visual-engineering]
├── Task 14: Hook chat page to SSE events + send/cancel actions [unspecified-high]
├── Task 15: UX states (loading, reconnect, provider-missing, timeout) [visual-engineering]
└── Task 16: Playwright chat scenarios + UI integration tests [deep]

Wave 4 (Integration + docs)
├── Task 17: Non-regression checks for task execution flows [deep]
├── Task 18: Settings/provider copy updates for chat entry [quick]
├── Task 19: API + feature docs updates [writing]
└── Task 20: Operational telemetry/logging for chat lifecycle [unspecified-high]

Wave FINAL (Independent review, parallel)
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA execution via agent tools (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: 1 -> 6 -> 7 -> 12 -> 14 -> 16 -> F1/F3
Parallel Speedup: ~60% vs sequential
Max Concurrent: 6
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|------------|--------|------|
| 1 | - | 6,9,11,19 | 1 |
| 2 | - | 6,7,10 | 1 |
| 3 | - | 7,14,16 | 1 |
| 4 | - | 13,14,15 | 1 |
| 5 | - | 15 | 1 |
| 6 | 1,2 | 8,10,11,14 | 2 |
| 7 | 2,3,6 | 14,16,20 | 2 |
| 8 | 6 | 11,17 | 2 |
| 9 | 1,6 | 11,15 | 2 |
| 10 | 2,6 | 14,15 | 2 |
| 11 | 1,6,8,9 | 17 | 2 |
| 12 | 1,6 | 14,15 | 3 |
| 13 | 4 | 14,16 | 3 |
| 14 | 3,6,7,10,12,13 | 15,16,17 | 3 |
| 15 | 4,5,9,10,12,14 | 16,18 | 3 |
| 16 | 3,13,14,15 | 17,F3 | 3 |
| 17 | 8,11,14,16 | F1,F2,F4 | 4 |
| 18 | 5,15 | F4 | 4 |
| 19 | 1,6 | F1,F4 | 4 |
| 20 | 7,14 | F1,F2 | 4 |

### Agent Dispatch Summary

| Wave | # Parallel | Tasks -> Agent Category |
|------|------------|-------------------------|
| 1 | 5 | T1 `deep`, T2 `quick`, T3 `deep`, T4 `visual-engineering`, T5 `quick` |
| 2 | 6 | T6 `unspecified-high`, T7 `deep`, T8 `deep`, T9 `quick`, T10 `unspecified-high`, T11 `deep` |
| 3 | 5 | T12 `quick`, T13 `visual-engineering`, T14 `unspecified-high`, T15 `visual-engineering`, T16 `deep` |
| 4 | 4 | T17 `deep`, T18 `quick`, T19 `writing`, T20 `unspecified-high` |
| FINAL | 4 | F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep` |

---

## TODOs

- [ ] 1. Define chat API contract and DTO schema
  - **What to do**: define request/response contracts for create-session, send-message, cancel, history; define event payloads for stream chunks/completion/errors.
  - **Must NOT do**: no ambiguous payload fields; no client-controlled worker host/port.
  - **Recommended Agent Profile**: category `deep`; skills `api-contracts`, `typescript-types`; omitted `visual-polish` (not UI task).
  - **Parallelization**: YES (Wave 1); Blocks 6,9,11,19; Blocked by none.
  - **References**:
    - `apps/api/src/routes/opencode.ts` - existing opencode route conventions and auth patterns.
    - `apps/api/src/middleware/auth.ts` - required auth contract for protected routes.
    - `apps/desktop-ui/lib/api/opencode.ts` - current API client typing style.
  - **Acceptance Criteria**:
    - [ ] Contract definitions exist and are referenced by both route handler and UI API client.
    - [ ] Error response shape is standardized and documented.
  - **QA Scenarios**:
    - Happy: run `pnpm --filter @openlinear/api test -- chat-contract` and verify contract tests pass; evidence `.sisyphus/evidence/task-1-contract-pass.txt`.
    - Error: `curl` invalid payload (`{}`) to chat message endpoint returns 400 with typed error code; evidence `.sisyphus/evidence/task-1-contract-invalid.json`.

- [ ] 2. Add chat OpenCode service abstraction
  - **What to do**: add service methods wrapping OpenCode SDK session create/prompt/abort/list for chat use.
  - **Must NOT do**: no changes to task execution methods unless required by shared helper extraction.
  - **Recommended Agent Profile**: category `quick`; skills `typescript`, `service-layer`; omitted `playwright`.
  - **Parallelization**: YES (Wave 1); Blocks 6,7,10; Blocked by none.
  - **References**:
    - `apps/api/src/services/opencode.ts` - current exported OpenCode runtime API.
    - `apps/api/src/services/execution/lifecycle.ts` - existing session create/prompt usage.
    - `apps/api/src/services/container-manager.ts` - ensureContainer/getClientForUser mechanics.
  - **Acceptance Criteria**:
    - [ ] New abstraction methods return typed results and map SDK errors.
    - [ ] Existing task execution imports remain valid.
  - **QA Scenarios**:
    - Happy: service-level test creates and prompts a chat session successfully with mocked client; evidence `.sisyphus/evidence/task-2-service-happy.txt`.
    - Error: simulated SDK failure maps to typed app error; evidence `.sisyphus/evidence/task-2-service-error.txt`.

- [ ] 3. Define chat SSE event schema and frontend event typing
  - **What to do**: define `chat:stream`, `chat:done`, `chat:error`, `chat:session` event types and payload interfaces.
  - **Must NOT do**: do not break existing event names consumed by current UI.
  - **Recommended Agent Profile**: category `deep`; skills `event-contracts`, `typescript`; omitted `database`.
  - **Parallelization**: YES (Wave 1); Blocks 7,14,16; Blocked by none.
  - **References**:
    - `apps/api/src/sse.ts` - server broadcast mechanics.
    - `apps/desktop-ui/providers/sse-provider.tsx` - subscribed event list and parser.
    - `apps/desktop-ui/hooks/use-sse.ts` - event type unions consumed by UI.
  - **Acceptance Criteria**:
    - [ ] New chat event names added without regressions.
    - [ ] Payload typing available in provider and chat UI hook.
  - **QA Scenarios**:
    - Happy: SSE test emits sample chat events and frontend parser accepts them; evidence `.sisyphus/evidence/task-3-sse-typing.txt`.
    - Error: malformed chat event payload is rejected/logged without crashing provider; evidence `.sisyphus/evidence/task-3-sse-malformed.txt`.

- [ ] 4. Scaffold native `/chat` page baseline
  - **What to do**: add chat route page shell (header, message panel, composer area, status bar).
  - **Must NOT do**: no complex messaging logic in this task (layout only).
  - **Recommended Agent Profile**: category `visual-engineering`; skills `react`, `nextjs-app-router`; omitted `api-design`.
  - **Parallelization**: YES (Wave 1); Blocks 13,14,15; Blocked by none.
  - **References**:
    - `apps/desktop-ui/app/page.tsx` - route/page composition style.
    - `apps/desktop-ui/components/execution-drawer.tsx` - existing log/timeline visual patterns.
    - `apps/desktop-ui/components/layout/app-shell.tsx` - shell sizing and responsive behavior.
  - **Acceptance Criteria**:
    - [ ] `/chat` route renders from sidebar navigation context on desktop and mobile.
    - [ ] Base layout includes fixed test IDs for automation.
  - **QA Scenarios**:
    - Happy: Playwright navigates to `/chat` and asserts `[data-testid="chat-page"]`, `[data-testid="chat-composer"]` exist; evidence `.sisyphus/evidence/task-4-route.png`.
    - Error: direct load while unauthenticated redirects to login; evidence `.sisyphus/evidence/task-4-auth-redirect.txt`.

- [ ] 5. Add sidebar chat navigation entry
  - **What to do**: add Chat nav item with active-state highlighting and icon.
  - **Must NOT do**: no broad sidebar redesign.
  - **Recommended Agent Profile**: category `quick`; skills `nextjs-routing`, `ui-navigation`; omitted `backend`.
  - **Parallelization**: YES (Wave 1); Blocks 15,18; Blocked by none.
  - **References**:
    - `apps/desktop-ui/components/layout/sidebar.tsx` - nav item patterns and active state.
    - `apps/desktop-ui/app/inbox/page.tsx` - destination route behavior expectations.
  - **Acceptance Criteria**:
    - [ ] Chat item appears in main nav and routes to `/chat`.
    - [ ] Active class matches existing nav behavior.
  - **QA Scenarios**:
    - Happy: Playwright clicks sidebar Chat item and URL becomes `/chat`; evidence `.sisyphus/evidence/task-5-sidebar-chat.png`.
    - Error: missing route shows not-found fallback not blank screen; evidence `.sisyphus/evidence/task-5-route-fallback.txt`.

- [ ] 6. Implement authenticated chat API routes
  - **What to do**: implement endpoints under `/api/opencode/chat/*` for session create, send prompt, cancel, history fetch.
  - **Must NOT do**: do not expose raw worker baseUrl in API response payloads.
  - **Recommended Agent Profile**: category `unspecified-high`; skills `express`, `auth`; omitted `css`.
  - **Parallelization**: YES (Wave 2); Blocks 8,10,11,14; Blocked by 1,2.
  - **References**:
    - `apps/api/src/routes/opencode.ts` - route style, validation, requireAuth usage.
    - `apps/api/src/app.ts` - router mounting and API path conventions.
    - `apps/api/src/middleware/auth.ts` - auth guard contract.
  - **Acceptance Criteria**:
    - [ ] Endpoints return typed payloads from Task 1 contract.
    - [ ] All routes are `requireAuth` protected.
  - **QA Scenarios**:
    - Happy: `curl -H "Authorization: Bearer <token>" POST /api/opencode/chat/session` returns 200 with session metadata; evidence `.sisyphus/evidence/task-6-session-create.json`.
    - Error: same call without auth returns 401; evidence `.sisyphus/evidence/task-6-unauthorized.json`.

- [ ] 7. Build stream bridge from OpenCode session events to chat SSE
  - **What to do**: subscribe to relevant OpenCode events and emit scoped chat SSE events for incremental text, tool states (if included), completion, and errors.
  - **Must NOT do**: no global broadcast of private payload without user/session filtering.
  - **Recommended Agent Profile**: category `deep`; skills `streaming`, `event-processing`; omitted `db-migrations`.
  - **Parallelization**: YES (Wave 2); Blocks 14,16,20; Blocked by 2,3,6.
  - **References**:
    - `apps/api/src/services/execution/events.ts` - OpenCode event parsing patterns.
    - `apps/api/src/sse.ts` - broadcast/send mechanics.
    - `apps/api/src/services/execution/state.ts` - active session/task mapping patterns.
  - **Acceptance Criteria**:
    - [ ] Chat stream emits ordered chunks and terminal done/error event exactly once.
    - [ ] Session/user filter prevents cross-user leakage.
  - **QA Scenarios**:
    - Happy: send prompt, capture SSE stream, assert ordered `chat:stream*` followed by `chat:done`; evidence `.sisyphus/evidence/task-7-stream-order.log`.
    - Error: force backend error and assert `chat:error` emitted with typed code; evidence `.sisyphus/evidence/task-7-stream-error.log`.

- [ ] 8. Implement per-user session ownership map and isolation checks
  - **What to do**: track chat sessions by owner userId and enforce checks for all message/cancel/history actions.
  - **Must NOT do**: no trust in client-provided user/session ownership claims.
  - **Recommended Agent Profile**: category `deep`; skills `security`, `state-management`; omitted `visual-engineering`.
  - **Parallelization**: YES (Wave 2); Blocks 11,17; Blocked by 6.
  - **References**:
    - `apps/api/src/middleware/auth.ts` - canonical user identity source.
    - `apps/api/src/routes/opencode.ts` - current use of `req.userId`.
    - `apps/api/src/services/container-manager.ts` - user-scoped runtime pattern.
  - **Acceptance Criteria**:
    - [ ] Cross-user session access attempts return 403.
    - [ ] Session map cleanup occurs on cancel/idle/expired sessions.
  - **QA Scenarios**:
    - Happy: same user can send and cancel on own session; evidence `.sisyphus/evidence/task-8-own-session.txt`.
    - Error: user B attempts user A sessionId and gets 403; evidence `.sisyphus/evidence/task-8-cross-user.json`.

- [ ] 9. Normalize chat API error contract
  - **What to do**: map container cold, provider missing, timeout, SDK failures into stable `{code,message,retryable}` payload shape.
  - **Must NOT do**: no raw stack traces in API responses.
  - **Recommended Agent Profile**: category `quick`; skills `error-handling`, `api-design`; omitted `playwright`.
  - **Parallelization**: YES (Wave 2); Blocks 11,15; Blocked by 1,6.
  - **References**:
    - `apps/api/src/services/execution/events.ts` - existing error clean-up/mapping patterns.
    - `apps/api/src/routes/opencode.ts` - current ad-hoc error responses to standardize.
  - **Acceptance Criteria**:
    - [ ] All chat endpoints return standardized errors for known failure classes.
  - **QA Scenarios**:
    - Happy: normal flow returns no error fields and valid success payload.
    - Error: simulated provider auth failure returns `code=PROVIDER_AUTH_REQUIRED` with retryable false; evidence `.sisyphus/evidence/task-9-provider-error.json`.

- [ ] 10. Add runtime warm/cold handling for chat startup
  - **What to do**: ensure chat send path calls runtime ensure when needed and surfaces startup state to UI.
  - **Must NOT do**: no duplicate container creation loops.
  - **Recommended Agent Profile**: category `unspecified-high`; skills `runtime-orchestration`, `backend`; omitted `docs`.
  - **Parallelization**: YES (Wave 2); Blocks 14,15; Blocked by 2,6.
  - **References**:
    - `apps/api/src/services/container-manager.ts` - ensureContainer lifecycle.
    - `apps/api/src/routes/opencode.ts` - existing `/container` warm-up endpoint pattern.
    - `apps/desktop-ui/components/provider-setup-dialog.tsx` - current startup UX expectations.
  - **Acceptance Criteria**:
    - [ ] First prompt from cold runtime succeeds without manual pre-step.
    - [ ] UI can represent warm-up state before stream starts.
  - **QA Scenarios**:
    - Happy: from fresh boot, send first message and receive streamed answer after warm-up; evidence `.sisyphus/evidence/task-10-cold-start.log`.
    - Error: startup timeout path returns typed timeout error and no hanging spinner; evidence `.sisyphus/evidence/task-10-timeout.json`.

- [ ] 11. Add API integration tests for chat routes
  - **What to do**: add Vitest/Supertest tests for auth, isolation, send, cancel, history, error mapping.
  - **Must NOT do**: no brittle snapshot-only tests for streaming semantics.
  - **Recommended Agent Profile**: category `deep`; skills `vitest`, `supertest`; omitted `ui-animation`.
  - **Parallelization**: YES (Wave 2); Blocks 17; Blocked by 1,6,8,9.
  - **References**:
    - `apps/api/vitest.config.ts` - test runner config.
    - `apps/api/src/__tests__/tasks.test.ts` - integration test structure.
    - `apps/api/src/__tests__/auth.test.ts` - auth-path assertion style.
  - **Acceptance Criteria**:
    - [ ] New chat API test file passes in CI test command.
    - [ ] Negative tests cover unauthorized + cross-user + invalid payload.
  - **QA Scenarios**:
    - Happy: `pnpm --filter @openlinear/api test` passes including new chat suite; evidence `.sisyphus/evidence/task-11-vitest-pass.txt`.
    - Error: intentionally bad payload test asserts 400 contract; evidence `.sisyphus/evidence/task-11-bad-payload.txt`.

- [ ] 12. Implement desktop chat API client wrapper
  - **What to do**: add typed chat API functions in desktop-ui lib for session/message/cancel/history.
  - **Must NOT do**: no direct calls to worker URL from UI.
  - **Recommended Agent Profile**: category `quick`; skills `typescript-client`, `fetch-api`; omitted `database`.
  - **Parallelization**: YES (Wave 3); Blocks 14,15; Blocked by 1,6.
  - **References**:
    - `apps/desktop-ui/lib/api/opencode.ts` - existing API wrapper conventions.
    - `apps/desktop-ui/lib/api/client.ts` - auth header and API base behavior.
  - **Acceptance Criteria**:
    - [ ] Chat client methods are typed and consumed by chat page.
    - [ ] Error mapping from Task 9 is surfaced to UI.
  - **QA Scenarios**:
    - Happy: unit test/mocked fetch verifies methods call expected endpoints and parse responses; evidence `.sisyphus/evidence/task-12-client-pass.txt`.
    - Error: mocked 401/500 responses map to expected thrown typed errors; evidence `.sisyphus/evidence/task-12-client-errors.txt`.

- [ ] 13. Build native message list and composer components
  - **What to do**: implement chat bubbles, timestamp/meta, composer input, send button, cancel button, pending state.
  - **Must NOT do**: no rich attachments or markdown plugins in v1.
  - **Recommended Agent Profile**: category `visual-engineering`; skills `react-ui`, `accessibility`; omitted `docker`.
  - **Parallelization**: YES (Wave 3); Blocks 14,16; Blocked by 4.
  - **References**:
    - `apps/desktop-ui/components/execution-drawer.tsx` - existing streaming-log rendering patterns.
    - `apps/desktop-ui/components/ui/*` - shared UI primitives.
    - `apps/desktop-ui/app/settings/page.tsx` - status/info layout conventions.
  - **Acceptance Criteria**:
    - [ ] Message list renders user and assistant messages with stable keys.
    - [ ] Composer supports Enter submit and Shift+Enter newline.
  - **QA Scenarios**:
    - Happy: Playwright types `hello from chat`, presses Enter, sees user bubble and assistant pending state; evidence `.sisyphus/evidence/task-13-composer.png`.
    - Error: empty input submit is blocked and validation hint shown; evidence `.sisyphus/evidence/task-13-empty-input.txt`.

- [ ] 14. Wire `/chat` page to SSE and chat actions
  - **What to do**: connect API client + SSE provider events to maintain local chat state, append streamed chunks, finalize on done, handle cancel.
  - **Must NOT do**: no duplicate stream consumers causing double-rendered chunks.
  - **Recommended Agent Profile**: category `unspecified-high`; skills `react-state`, `sse`; omitted `schema-migration`.
  - **Parallelization**: YES (Wave 3); Blocks 15,16,17; Blocked by 3,6,7,10,12,13.
  - **References**:
    - `apps/desktop-ui/providers/sse-provider.tsx` - event subscription mechanism.
    - `apps/desktop-ui/hooks/use-sse.ts` - event filtering model.
    - `apps/desktop-ui/components/provider-setup-dialog.tsx` - warm-up/loading state patterns.
  - **Acceptance Criteria**:
    - [ ] Streaming chunks append in order to the active assistant message.
    - [ ] Cancel action stops streaming and marks response aborted.
  - **QA Scenarios**:
    - Happy: Playwright send prompt, wait for token-by-token growth in `[data-testid="assistant-message-latest"]`; evidence `.sisyphus/evidence/task-14-stream.gif`.
    - Error: click cancel mid-stream; verify no new chunks after 1s and UI shows cancelled state; evidence `.sisyphus/evidence/task-14-cancel.txt`.

- [ ] 15. Implement UX states and resilience
  - **What to do**: add visible states for runtime warm-up, provider missing, reconnecting stream, timeout, retry CTA.
  - **Must NOT do**: no silent failures with frozen composer.
  - **Recommended Agent Profile**: category `visual-engineering`; skills `ux-states`, `error-ux`; omitted `backend-refactor`.
  - **Parallelization**: YES (Wave 3); Blocks 16,18; Blocked by 4,5,9,10,12,14.
  - **References**:
    - `apps/desktop-ui/components/provider-setup-dialog.tsx` - loading/error/retry presentation.
    - `apps/desktop-ui/app/settings/page.tsx` - provider-related error messaging style.
  - **Acceptance Criteria**:
    - [ ] Each major failure mode maps to a clear, actionable UI message.
    - [ ] Retry path can recover without full page reload.
  - **QA Scenarios**:
    - Happy: simulate provider ready + healthy stream and no error banners shown.
    - Error: disable provider and verify `Connect Provider` CTA appears with working deep link; evidence `.sisyphus/evidence/task-15-provider-missing.png`.

- [ ] 16. Add Playwright + UI integration test coverage
  - **What to do**: add end-to-end chat scenarios (send, stream, cancel, reconnect, auth failure).
  - **Must NOT do**: do not rely on manual QA only.
  - **Recommended Agent Profile**: category `deep`; skills `playwright`, `e2e-testing`; omitted `copywriting`.
  - **Parallelization**: YES (Wave 3); Blocks 17,F3; Blocked by 3,13,14,15.
  - **References**:
    - Existing Playwright setup in repository (test runner config and scripts).
    - `apps/desktop-ui/components/execution-drawer.tsx` - interaction testing patterns for stream-like output.
  - **Acceptance Criteria**:
    - [ ] Agent-browser scenario pack includes at least 5 chat flows with deterministic waits/selectors.
    - [ ] Scenario scripts run locally with stable pass rate.
  - **QA Scenarios**:
    - Happy: run `agent-browser open http://localhost:3000/chat` then execute scripted send-and-stream flow and assertions; evidence `.sisyphus/evidence/task-16-e2e-pass.txt`.
    - Error: scenario `disconnect-and-reconnect` asserts reconnect banner then resumed state; evidence `.sisyphus/evidence/task-16-reconnect.txt`.

- [ ] 17. Run non-regression checks for task execution and batch flows
  - **What to do**: ensure new chat additions do not break existing execution lifecycle and batch routes/events.
  - **Must NOT do**: do not skip existing task/batch test suites.
  - **Recommended Agent Profile**: category `deep`; skills `regression-testing`, `api`; omitted `new-feature-ui`.
  - **Parallelization**: YES (Wave 4); Blocks F1,F2,F4; Blocked by 8,11,14,16.
  - **References**:
    - `apps/api/src/services/execution/lifecycle.ts` - core task execution path.
    - `apps/api/src/services/batch.ts` - batch execution path.
    - `apps/api/src/services/execution/events.ts` - existing stream event processing.
  - **Acceptance Criteria**:
    - [ ] Existing task execution tests and batch tests remain green.
    - [ ] No regressions in SSE event handling for current features.
  - **QA Scenarios**:
    - Happy: run current task+batch test suites and verify PASS; evidence `.sisyphus/evidence/task-17-regression-pass.txt`.
    - Error: inject conflicting chat event name in test and assert collision protection; evidence `.sisyphus/evidence/task-17-event-collision.txt`.

- [ ] 18. Update provider/settings copy for chat discoverability
  - **What to do**: tune copy where needed so chat flow messaging is coherent and references in-app chat entry.
  - **Must NOT do**: no full redesign of settings IA.
  - **Recommended Agent Profile**: category `quick`; skills `product-copy`, `frontend`; omitted `stream-processing`.
  - **Parallelization**: YES (Wave 4); Blocks F4; Blocked by 5,15.
  - **References**:
    - `apps/desktop-ui/app/settings/page.tsx` - current provider-related copy.
    - `apps/desktop-ui/components/provider-setup-dialog.tsx` - setup messaging.
    - `apps/desktop-ui/components/layout/sidebar.tsx` - navigation label consistency.
  - **Acceptance Criteria**:
    - [ ] Copy references in-app chat flow and avoids raw port language.
    - [ ] No misleading Docker-specific wording in chat UX.
  - **QA Scenarios**:
    - Happy: Playwright captures settings + chat entry text and asserts updated strings; evidence `.sisyphus/evidence/task-18-copy.png`.
    - Error: l10n fallback missing key test fails with explicit key name; evidence `.sisyphus/evidence/task-18-missing-key.txt`.

- [ ] 19. Update docs and API reference for native chat
  - **What to do**: document new chat endpoints, stream events, auth behavior, and known limits.
  - **Must NOT do**: no stale docs referencing direct worker-port chat usage.
  - **Recommended Agent Profile**: category `writing`; skills `technical-docs`, `api-reference`; omitted `ui-implementation`.
  - **Parallelization**: YES (Wave 4); Blocks F1,F4; Blocked by 1,6.
  - **References**:
    - `docs/features/api-reference.md` - API endpoint docs structure.
    - `docs/features/opencode-integration.md` - OpenCode architecture docs.
    - `README.md` - user-facing feature summary.
  - **Acceptance Criteria**:
    - [ ] New endpoints/events documented with sample payloads.
    - [ ] Feature docs include chat flow and failure handling notes.
  - **QA Scenarios**:
    - Happy: docs link checker and markdown lint pass; evidence `.sisyphus/evidence/task-19-docs-lint.txt`.
    - Error: invalid sample payload in docs test fixture triggers expected validation failure; evidence `.sisyphus/evidence/task-19-docs-sample-fail.txt`.

- [ ] 20. Add operational telemetry/logging for chat lifecycle
  - **What to do**: log session creation, prompt send, cancel, done/error (without sensitive content) for troubleshooting.
  - **Must NOT do**: never log raw prompts, provider keys, or full model output.
  - **Recommended Agent Profile**: category `unspecified-high`; skills `observability`, `backend-logging`; omitted `design-system`.
  - **Parallelization**: YES (Wave 4); Blocks F1,F2; Blocked by 7,14.
  - **References**:
    - `apps/api/src/services/execution/state.ts` - current structured execution logging style.
    - `apps/api/src/services/execution/events.ts` - event-level logging patterns.
  - **Acceptance Criteria**:
    - [ ] Structured chat lifecycle logs available for debugging.
    - [ ] Redaction policy enforced for sensitive fields.
  - **QA Scenarios**:
    - Happy: run chat flow and verify lifecycle logs emitted with session IDs and status only; evidence `.sisyphus/evidence/task-20-logs.txt`.
    - Error: secret-containing test prompt does not appear in logs; evidence `.sisyphus/evidence/task-20-redaction.txt`.

---

## Final Verification Wave (MANDATORY)

- [ ] F1. **Plan Compliance Audit** (`oracle`)
  - Verify every Must Have is implemented and every Must NOT Have is absent.
  - Confirm all `.sisyphus/evidence/task-*.{ext}` artifacts exist.
  - Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [ ] F2. **Code Quality Review** (`unspecified-high`)
  - Run typecheck/lint/tests; inspect changed files for anti-patterns (`as any`, dead code, debug leftovers).
  - Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [ ] F3. **Real QA Scenario Execution** (`unspecified-high`, with Playwright)
  - Execute all task scenarios end-to-end, including negative paths and reconnect flows.
  - Save consolidated evidence under `.sisyphus/evidence/final-qa/`.
  - Output: `Scenarios [N/N pass] | Integration [N/N] | Edge cases [N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** (`deep`)
  - Compare diff against plan tasks; detect omissions and unplanned additions.
  - Output: `Tasks [N/N compliant] | Scope creep [CLEAN/N] | Unaccounted files [CLEAN/N] | VERDICT`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1-3 | `feat(api): add native chat contracts and stream schema` | API route/service/type files | `pnpm --filter @openlinear/api typecheck && pnpm --filter @openlinear/api test` |
| 4-5 | `feat(ui): add chat route and sidebar entry` | desktop-ui route/layout/sidebar files | `pnpm --filter @openlinear/desktop-ui lint` |
| 6-11 | `feat(api): implement chat endpoints, isolation, and tests` | API runtime/routes/tests | `pnpm --filter @openlinear/api test` |
| 12-16 | `feat(ui): wire streaming chat and e2e coverage` | desktop-ui api client/components/tests | `pnpm --filter @openlinear/desktop-ui lint && agent-browser scenario run chat-smoke` |
| 17-20 | `chore(chat): regression hardening and docs` | tests/docs/logging files | `pnpm test && pnpm lint` |

---

## Success Criteria

### Verification Commands
```bash
pnpm --filter @openlinear/api typecheck
pnpm --filter @openlinear/api test
pnpm --filter @openlinear/desktop-ui lint
agent-browser scenario run chat-smoke
pnpm test
```

### Final Checklist
- [ ] Native `/chat` route is accessible from sidebar and works end-to-end.
- [ ] Streaming chat output is stable, cancellable, and reconnect-aware.
- [ ] Cross-user/session isolation is enforced at API level.
- [ ] Existing task and batch execution functionality remains unchanged.
- [ ] Docs and API references reflect new native chat capability.
