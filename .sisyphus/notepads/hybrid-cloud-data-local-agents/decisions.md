# Decisions

## Task 1: Define secret taxonomy and trust-boundary policy
- Decided to use a simple regex-based parser for the coverage check script to extract fields from TypeScript interfaces and Prisma schemas, as it's lightweight and sufficient for the current structure.
- Hardcoded the fields for the `opencode` route in the coverage check script, as parsing the AST for route handlers is complex and the fields are well-known.
- Used `version: z.literal('1.0').optional()` for the versioned contract marker. This is minimal and pragmatic, allowing existing payloads without a version to still pass validation while providing a mechanism for future versioning.
- Updated the duplicate schema definition in `packages/openlinear/src/validation/security.ts` to ensure consistency across the codebase.

### Task 3: Feature Flags for Migration Phases
- **Decision**: Wired up the existing `feature-flags.ts` to `apps/api/src/services/opencode.ts`, `apps/api/src/services/container-manager.ts`, and `apps/api/src/routes/tasks.ts`.
- **Rationale**: The feature flags were already defined in a previous task, but they were not actively gating the execution paths. By wiring them up, we ensure that the API respects the `LOCAL_EXECUTION_ENABLED` and `SERVER_EXECUTION_ENABLED` flags, failing fast if invalid combinations are provided or if a user attempts to execute a task server-side when it's disabled.
- Implemented a strict allowlist for secret keys (`github_token`, `openai_api_key`, `anthropic_api_key`, `custom_api_key`) to prevent arbitrary key storage and retrieval.
- `get_all_secret_keys` now iterates over the allowlist and checks for existence, rather than attempting to list all keys from the OS keychain, which is safer and more predictable.
- Error messages are generic (e.g., "Failed to store secret") to ensure no secrets or sensitive context are leaked.

## Task 5: Prepare DB migration away from server secret writes
- **Decision**: Removed `accessToken` parameter from `createOrUpdateUser` and `connectGitHubToUser` in `apps/api/src/services/github.ts`.
- **Rationale**: To prevent new or updated auth flows from writing OAuth access tokens to the cloud DB, enforcing the local-only secret storage policy.
- **Decision**: Added `hasLegacyStoredToken`, `clearLegacyToken`, and `getLegacyToken` helpers to `apps/api/src/services/auth-migration.ts`.
- **Rationale**: To provide explicit, read-only paths for legacy token handling during the transition period, allowing migration jobs to safely clear tokens once migrated.
- **Decision**: Documented the Legacy Token Migration & Backfill Policy in `docs/security/trust-boundary.md`.
- **Rationale**: To provide clear guidelines on how existing rows should be handled and when the `accessToken` column can be destructively removed.

## Task 6: Implement metadata ingestion endpoints
- **Decision**: Created `/api/execution/metadata/start`, `/api/execution/metadata/progress`, and `/api/execution/metadata/finish` endpoints in `apps/api/src/routes/execution.ts`.
- **Rationale**: To provide a structured, stateful API for the desktop app to sync execution metadata.
- **Decision**: Added checks in `progress` and `finish` endpoints to ensure `executionStartedAt` is set, returning 409 Conflict if not.
- **Rationale**: To enforce correct state transitions (start -> progress -> finish) and prevent invalid updates.

## Task 7: Add authenticated provenance for metadata uploads
- **Decision**: Created `verifyDeviceSignature` middleware in `apps/api/src/middleware/provenance.ts`.
- **Rationale**: To ensure that metadata uploads are authenticated and originate from a trusted device, preventing replay attacks and unauthorized modifications.
- **Decision**: Used HMAC-SHA256 with the user's JWT token as the secret for signature verification.
- **Rationale**: This leverages the existing authentication mechanism without requiring a separate device registration flow, while still providing strong integrity and authenticity guarantees.

## Task 5: Prepare DB migration away from server secret writes
- **Decision**: Block `accessToken` writes at the Prisma ORM level using `$extends` instead of removing the field from the schema immediately.
- **Rationale**: This ensures no new code can write to the field while preserving the ability to read legacy tokens during the migration period. It also allows explicit `null` writes to clear the token after migration.

## Task 8: Local Runner Orchestration
- Decided to fetch API keys directly from `secure_storage` within the `run_opencode_task` command rather than passing them from the frontend. This ensures secrets never cross the IPC boundary unnecessarily.
- If required keys are missing, the command immediately emits a `failed` metadata event with the `AUTH` error category and returns an error, preventing any execution attempt.
- Raw logs (`stdout`/`stderr`) are still emitted via `opencode:output:{taskId}` for local UI display, but they are kept separate from the `opencode:metadata:{taskId}` events which are intended for cloud sync.

- Deduplication in the offline metadata queue is based strictly on `taskId:runId:status`. If a new event arrives with the same key (e.g., updated progress), it overwrites the existing queued event's payload and resets its retry count, ensuring only the latest state is synced.
- Replaced optionalAuth with requireAuth on all execution-critical endpoints to enforce strict identity mapping.

### Task 9: Offline Metadata Queue
- Decided to implement the metadata queue in the frontend (TypeScript) rather than the Rust backend. This aligns with the existing API client patterns (`apps/desktop-ui/lib/api/client.ts`) and allows leveraging the browser's `localStorage` and `fetch` API with existing authentication headers.
- Decided to deduplicate 'running' events based on their `progress` value as well, to ensure that progress updates are not incorrectly deduplicated if they happen in rapid succession.
- Decided to treat 4xx errors (except 429) as non-retryable to prevent the queue from getting stuck on invalid payloads or unauthorized requests.

## Task 11: Privacy Contract Tests
- Decided to create a dedicated test file `apps/api/src/__tests__/privacy-contract.test.ts` instead of adding to existing test files (`execution.test.ts` or `tasks.test.ts`). This keeps the privacy contract tests focused and isolated, making it easier to verify the specific requirements of the privacy contract (forbidden-field rejection and allowed payload pass cases) across all execution metadata endpoints (`start`, `progress`, `finish`).
- Decided to test a comprehensive list of forbidden fields (`prompt`, `toolLogs`, `repoPath`, `accessToken`, `apiKey`, `env`, `localPath`) to ensure the strict allowlist schema effectively prevents any sensitive data leakage.
- Decided to return a specific `code` (`LOCAL_EXECUTION_REQUIRED` or `SERVER_EXECUTION_DISABLED`) from `executeTask` so that the caller (`routes/tasks.ts`) can pass it back to the client, maintaining the existing API contract.

## Task 14: Align batch execution with local-run metadata model
- Decided to keep the `batch:*` SSE events intact to avoid breaking the frontend, but trigger them from the metadata sync endpoint instead of internal server-side events.
- Decided to remove the server-side git commit logic from `handleTaskComplete` because the local execution model handles committing and pushing changes.
- Decided to update `startTask` to just mark the task as running and wait for the local execution to pick it up, rather than spawning a server-side OpenCode session.
