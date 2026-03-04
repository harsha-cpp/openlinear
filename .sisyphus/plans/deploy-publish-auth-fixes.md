# Deploy And Publish Auth Fixes

## TL;DR
> **Summary**: Deploy the desktop auth fixes on `main` through the existing production workflow, verify live OAuth + username/password behavior, then publish a new npm version through the same workflow path.
> **Deliverables**:
> - Production deploy with passing auth smoke checks
> - Published `openlinear` npm package with bumped version
> - Verification evidence for local + production checks
> **Effort**: Short
> **Parallel**: YES - 2 waves
> **Critical Path**: Task 1 -> Task 2 -> Task 5 -> Task 6

## Context
### Original Request
User selected both execution options: deploy these fixes and publish a new npm package (`"1 2"`).

### Interview Summary
- Scope is restricted to auth-fix release flow: deploy current changes, validate behavior, then publish.
- Current working changes are in `apps/desktop-ui/lib/api/client.ts` and `apps/desktop-ui/lib/api/auth.ts`.
- CI/CD automation already exists for deploy + npm publish on push to `main` in `.github/workflows/deploy.yml`.

### Metis Review (gaps addressed)
- Added publish-channel guardrail: use branch-based publish path only for this execution.
- Added rollback readiness: capture last known good SHA and explicit rollback command.
- Added post-deploy auth smoke checks (not just `/health`).
- Added version parity checks before publish.

## Work Objectives
### Core Objective
Ship the current auth fixes safely to production and release a new npm package version with verifiable desktop OAuth and username/password behavior.

### Deliverables
- Merged/pushed auth fixes on `main`.
- Successful `Deploy to Production` workflow run with deploy + publish-npm jobs green.
- npm registry updated to the new `openlinear` version.
- Evidence bundle under `.sisyphus/evidence/` for local and production verification.

### Definition of Done (verifiable conditions with commands)
- `git status --short` shows only intended files before commit.
- `pnpm --filter @openlinear/desktop-ui build` passes.
- `pnpm --filter @openlinear/api typecheck && pnpm --filter @openlinear/api build` passes.
- GitHub Actions deploy run on `main` has `checks`, `deploy`, and `publish-npm` success.
- `curl -sS https://rixie.in/health` returns 200.
- `npm view openlinear version` matches new package version.

### Must Have
- Desktop auth path adds `?source=desktop` for OAuth login URL.
- Desktop runtime in production resolves API base URL to `https://rixie.in`.
- Post-deploy smoke checks validate desktop callback redirect shape and username/password endpoints.
- npm publish uses trusted publishing path already configured in workflow.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No unrelated refactors/features in commit.
- No manual SSH hotfix as primary release path (only CI automation path).
- No tag-based release during this execution path.
- No publish without version bump and parity checks.

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: tests-after + existing API and desktop build/test tooling.
- QA policy: every task includes executable happy + failure/edge checks.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: release prep + local validation + version/publish readiness
Wave 2: commit/push + CI monitoring + production verification

### Dependency Matrix (full, all tasks)
- Task 1 blocks Tasks 2-4
- Task 2 blocks Tasks 5-7
- Task 3 blocks Task 5
- Task 4 blocks Task 7
- Task 5 blocks Tasks 6-8
- Task 6 blocks Task 8
- Task 7 blocks Task 8

### Agent Dispatch Summary (wave -> task count -> categories)
- Wave 1 -> 4 tasks -> quick / unspecified-low
- Wave 2 -> 4 tasks -> unspecified-low / deep

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

<!-- TASKS_INSERT_HERE -->
- [ ] 5. Commit and push release changes to `main`

  **What to do**: Stage only intended files (`apps/desktop-ui/lib/api/client.ts`, `apps/desktop-ui/lib/api/auth.ts`, and version bump file), create release commit, push to `origin/main`.
  **Must NOT do**: Do not include unrelated files; do not amend prior commits.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: focused git hygiene and push.
  - Skills: `[]` — no extra skills needed.
  - Omitted: `deep` — unnecessary for deterministic git workflow.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 6,7,8 | Blocked By: 2,3,4

  **References**:
  - Pattern: `.github/workflows/deploy.yml:5` — push to `main` triggers deploy workflow.
  - Pattern: `apps/desktop-ui/lib/api/client.ts:25` — desktop production API routing logic included in commit.
  - Pattern: `apps/desktop-ui/lib/api/auth.ts:21` — desktop source marker included in commit.

  **Acceptance Criteria**:
  - [ ] Commit contains only intended release files.
  - [ ] Push to `origin/main` succeeds.
  - [ ] Commit SHA logged in `.sisyphus/evidence/task-5-commit-push.txt`.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Happy path commit and push
    Tool: Bash
    Steps: `git status --short`; stage explicit files; commit with release message; push to main.
    Expected: Push succeeds and triggers deploy workflow.
    Evidence: .sisyphus/evidence/task-5-commit-push.txt

  Scenario: Failure/edge case dirty unrelated files
    Tool: Bash
    Steps: Re-check staged file list before commit.
    Expected: Any unrelated file is unstaged before commit proceeds.
    Evidence: .sisyphus/evidence/task-5-commit-push-error.txt
  ```

  **Commit**: YES | Message: `fix(auth): enforce desktop oauth callback and production api routing` | Files: `apps/desktop-ui/lib/api/client.ts, apps/desktop-ui/lib/api/auth.ts, packages/openlinear/package.json`

- [ ] 6. Monitor deploy workflow and verify production runtime health

  **What to do**: Track GitHub Actions run for `Deploy to Production`, ensure `checks` and `deploy` jobs pass, and verify production health endpoint stability.
  **Must NOT do**: Do not proceed to release completion if deploy job fails.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: CI monitoring and endpoint checks.
  - Skills: `[]` — no extra skills needed.
  - Omitted: `ultrabrain` — not a high-complexity reasoning task.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8 | Blocked By: 5

  **References**:
  - Pattern: `.github/workflows/deploy.yml:61` — deploy job definition.
  - Pattern: `.github/workflows/deploy.yml:99` — built-in health verification loop.
  - External: `https://rixie.in/health` — production health endpoint.

  **Acceptance Criteria**:
  - [ ] Workflow run on latest `main` commit has `checks` and `deploy` status success.
  - [ ] `curl -sS https://rixie.in/health` returns 200 in 3 consecutive checks.
  - [ ] Evidence saved at `.sisyphus/evidence/task-6-deploy-verify.txt`.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Happy path deploy verification
    Tool: Bash
    Steps: Query latest workflow run status; poll until completed; hit health endpoint 3 times with 5s spacing.
    Expected: Workflow and health checks all pass.
    Evidence: .sisyphus/evidence/task-6-deploy-verify.txt

  Scenario: Failure/edge case deploy failure
    Tool: Bash
    Steps: If deploy job fails, collect failing job logs and prepare rollback command using baseline SHA.
    Expected: Failure is documented and rollback readiness evidence is produced.
    Evidence: .sisyphus/evidence/task-6-deploy-verify-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: `none`

- [ ] 7. Verify npm publish completion and package integrity

  **What to do**: Confirm `publish-npm` job success in the same workflow run and verify npm registry reflects the new version.
  **Must NOT do**: Do not mark complete based on workflow start alone; require success state + registry check.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: release status + registry validation.
  - Skills: `[]` — no extra skills needed.
  - Omitted: `artistry` — irrelevant.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8 | Blocked By: 5

  **References**:
  - Pattern: `.github/workflows/deploy.yml:113` — `publish-npm` job in deploy workflow.
  - Pattern: `.github/workflows/deploy.yml:133` — local/remote version gate.
  - Pattern: `packages/openlinear/package.json:3` — target release version.

  **Acceptance Criteria**:
  - [ ] `publish-npm` job is green on latest deploy workflow run.
  - [ ] `npm view openlinear version` equals bumped local version.
  - [ ] Evidence saved at `.sisyphus/evidence/task-7-npm-verify.txt`.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Happy path npm publish
    Tool: Bash
    Steps: Inspect workflow job status for publish-npm; query npm view version.
    Expected: Job success and npm version match.
    Evidence: .sisyphus/evidence/task-7-npm-verify.txt

  Scenario: Failure/edge case skipped publish
    Tool: Bash
    Steps: Detect if publish was skipped due equal versions.
    Expected: If skipped, evidence identifies mismatch with expected release and blocks completion.
    Evidence: .sisyphus/evidence/task-7-npm-verify-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: `none`

- [ ] 8. Run production auth smoke checks and close release

  **What to do**: Execute production auth smoke checks (desktop-marked OAuth redirect branch and username/password endpoint behavior), compare against success criteria, and either close release or initiate rollback.
  **Must NOT do**: Do not declare success on health-only validation.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: final multi-signal validation + rollback decisioning.
  - Skills: `[]` — no extra skills needed.
  - Omitted: `quick` — this is a decision-critical final gate.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: none | Blocked By: 5,6,7

  **References**:
  - Pattern: `apps/api/src/routes/auth.ts:54` — desktop request detection.
  - Pattern: `apps/api/src/routes/auth.ts:276` — desktop callback redirect path.
  - Pattern: `apps/api/src/routes/auth.ts:71` — register endpoint.
  - Pattern: `apps/api/src/routes/auth.ts:131` — login endpoint.

  **Acceptance Criteria**:
  - [ ] Desktop-marked callback path behavior verifies deep-link redirect branch.
  - [ ] Username/password auth endpoints return expected success/error semantics.
  - [ ] Final release report saved at `.sisyphus/evidence/task-8-release-closeout.md` with go/no-go decision.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Happy path production auth smoke
    Tool: Bash
    Steps: Run endpoint checks for `/health`, `/api/auth/github?source=desktop` redirect branch, and auth endpoint behavior; record HTTP statuses/headers.
    Expected: Redirect logic and auth responses match release criteria.
    Evidence: .sisyphus/evidence/task-8-release-closeout.md

  Scenario: Failure/edge case rollback trigger
    Tool: Bash
    Steps: If any auth smoke check fails, execute rollback plan preparation using baseline SHA and document exact command.
    Expected: Release marked failed with rollback action documented.
    Evidence: .sisyphus/evidence/task-8-release-closeout-error.md
  ```

  **Commit**: NO | Message: `n/a` | Files: `none`

<!-- TASKS_INSERT_HERE -->
- [ ] 1. Capture release baseline and rollback anchors

  **What to do**: Record current `main` HEAD SHA, current published npm version, and current package version from `packages/openlinear/package.json`; store in evidence file for rollback and parity decisions.
  **Must NOT do**: Do not modify source files in this task.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: command-only baseline capture.
  - Skills: `[]` — no specialized skills needed.
  - Omitted: `code-review` — not needed for baseline capture.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2,3,4 | Blocked By: none

  **References**:
  - Pattern: `.github/workflows/deploy.yml:113` — publish job tied to branch deploy path.
  - Pattern: `packages/openlinear/package.json:3` — package version source of truth.
  - External: `https://www.npmjs.com/package/openlinear` — published version reference.

  **Acceptance Criteria**:
  - [ ] Evidence file contains `main` SHA, local package version, npm remote version, and timestamp.
  - [ ] Baseline evidence saved at `.sisyphus/evidence/task-1-baseline.txt`.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Happy path baseline capture
    Tool: Bash
    Steps: Run `git rev-parse HEAD`; run `node -p "require('./packages/openlinear/package.json').version"`; run `npm view openlinear version`.
    Expected: All three values resolve and are written to `.sisyphus/evidence/task-1-baseline.txt`.
    Evidence: .sisyphus/evidence/task-1-baseline.txt

  Scenario: Failure/edge case npm lookup
    Tool: Bash
    Steps: Run `npm view openlinear version` with retry logic up to 3 attempts.
    Expected: If npm unavailable, evidence includes failure note and task halts before release actions.
    Evidence: .sisyphus/evidence/task-1-baseline-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: `none`

- [ ] 2. Run local compile/type safety gates for touched apps

  **What to do**: Execute desktop-ui build and API typecheck/build gates; store output summaries and non-zero exits as blockers.
  **Must NOT do**: Do not ignore failing command exit codes.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: deterministic command execution.
  - Skills: `[]` — no extra skills needed.
  - Omitted: `artistry` — no design/creative requirement.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 5 | Blocked By: 1

  **References**:
  - Pattern: `apps/desktop-ui/package.json:7` — desktop-ui build command.
  - Pattern: `apps/api/package.json:13` — API typecheck command.
  - Pattern: `apps/api/package.json:10` — API build command.

  **Acceptance Criteria**:
  - [ ] `pnpm --filter @openlinear/desktop-ui build` exits 0.
  - [ ] `pnpm --filter @openlinear/api typecheck && pnpm --filter @openlinear/api build` exits 0.
  - [ ] Evidence summary saved at `.sisyphus/evidence/task-2-build-gates.txt`.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Happy path build gates
    Tool: Bash
    Steps: Run desktop-ui build; run API typecheck/build.
    Expected: All commands exit 0 and output is captured in evidence.
    Evidence: .sisyphus/evidence/task-2-build-gates.txt

  Scenario: Failure/edge case compile failure
    Tool: Bash
    Steps: If any command exits non-zero, capture failing command + stderr snippet.
    Expected: Release flow is blocked and failure recorded.
    Evidence: .sisyphus/evidence/task-2-build-gates-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: `none`

- [ ] 3. Validate local auth behavior and redirect branches

  **What to do**: Start local API, run register/login requests, test OAuth init and callback redirects for desktop and non-desktop state, then stop local API.
  **Must NOT do**: Do not skip desktop-state callback verification.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: multi-command local integration check.
  - Skills: `[]` — no extra skills needed.
  - Omitted: `deep` — not needed for straightforward API smoke checks.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 5,6 | Blocked By: 1

  **References**:
  - Pattern: `apps/api/src/routes/auth.ts:54` — desktop request detection.
  - Pattern: `apps/api/src/routes/auth.ts:209` — callback desktop state decision.
  - Pattern: `apps/api/src/routes/auth.ts:276` — desktop callback redirect to deep link.
  - Pattern: `apps/desktop-ui/lib/api/auth.ts:21` — desktop login URL adds `source=desktop`.
  - Pattern: `apps/desktop-ui/lib/api/client.ts:25` — desktop production API selection.

  **Acceptance Criteria**:
  - [ ] Local register/login responses contain token and user payload.
  - [ ] Desktop callback test returns `Location: openlinear://callback?...`.
  - [ ] Non-desktop callback test returns `Location: <FRONTEND_URL>?...`.
  - [ ] Evidence saved at `.sisyphus/evidence/task-3-auth-local.txt`.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Happy path local auth flow
    Tool: Bash
    Steps: Start API with local env; POST /api/auth/register and /api/auth/login; GET /api/auth/github?source=desktop; GET /api/auth/github/callback?state=desktop:test&error=access_denied.
    Expected: Register/login succeed; desktop callback redirects to `openlinear://callback`.
    Evidence: .sisyphus/evidence/task-3-auth-local.txt

  Scenario: Failure/edge case non-desktop callback
    Tool: Bash
    Steps: GET /api/auth/github/callback?state=test&error=access_denied with FRONTEND_URL set.
    Expected: Redirect target is frontend URL, proving branch separation works.
    Evidence: .sisyphus/evidence/task-3-auth-local-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: `none`

- [ ] 4. Prepare npm publish version and parity gates

  **What to do**: Bump `packages/openlinear/package.json` version to next patch, confirm local>remote version, and validate that workflow publish conditions will not skip.
  **Must NOT do**: Do not reuse an already published version.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: single-file version prep and checks.
  - Skills: `[]` — no extra skills needed.
  - Omitted: `unspecified-high` — no complex reasoning required.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 5,7 | Blocked By: 1

  **References**:
  - Pattern: `packages/openlinear/package.json:3` — package version field.
  - Pattern: `.github/workflows/deploy.yml:133` — local-vs-remote version skip condition.
  - Pattern: `.github/workflows/release.yml:105` — same skip condition in release workflow.

  **Acceptance Criteria**:
  - [ ] `packages/openlinear/package.json` version incremented to next patch.
  - [ ] `npm view openlinear version` is lower than local version.
  - [ ] Evidence saved at `.sisyphus/evidence/task-4-version-gate.txt`.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Happy path version parity
    Tool: Bash
    Steps: Read local package version; read remote npm version; compare semver.
    Expected: Local version is greater and eligible for publish.
    Evidence: .sisyphus/evidence/task-4-version-gate.txt

  Scenario: Failure/edge case duplicate version
    Tool: Bash
    Steps: Simulate equal-version check using workflow logic.
    Expected: Plan blocks publish and requires version bump.
    Evidence: .sisyphus/evidence/task-4-version-gate-error.txt
  ```

  **Commit**: YES | Message: `chore(release): bump openlinear package version` | Files: `packages/openlinear/package.json`

<!-- TASKS_INSERT_HERE -->

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Single release commit on `main` containing only auth-fix files and package version bump.
- Commit message format: `fix(auth): enforce desktop oauth callback and production api routing`.
- Push once; rely on `.github/workflows/deploy.yml` for deploy and npm publish.
- Rollback path (if deploy smoke fails): `git revert <release-commit-sha> && git push origin main`.

## Success Criteria
- Production OAuth desktop-marked flow resolves to deep-link callback path behavior.
- Username/password register/login works without network "Load failed" symptom.
- Deploy workflow completes without manual server intervention.
- npm package published at expected version and installable.
