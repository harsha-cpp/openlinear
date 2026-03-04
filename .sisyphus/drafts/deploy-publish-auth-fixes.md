# Draft: Deploy And Publish Auth Fixes

## Requirements (confirmed)
- [user selection]: "1 2" (do both next steps: deploy these auth fixes and then publish a new npm version)

## Technical Decisions
- [delivery order]: Deploy first, then publish npm after deploy verification
- [release path]: Use existing GitHub Actions deploy/publish automation on `main` (branch path), not tag path for this request
- [verification gate]: Require local + CI checks and auth redirect behavior confirmation before publish
- [channel guardrail]: avoid dual-publish ambiguity by using only branch-based publish for this execution
- [rollback guardrail]: capture previous good SHA before push; predefine rollback command path

## Research Findings
- [workflows]: `.github/workflows/deploy.yml` runs on push to `main`/`dev` and already includes `publish-npm` job
- [release workflow]: `.github/workflows/release.yml` also has npm publish job on tag push `v*`
- [current branch state]: branch is `main` with local changes in `apps/desktop-ui/lib/api/client.ts` and `apps/desktop-ui/lib/api/auth.ts`
- [desktop oauth decision]: API redirects to `openlinear://callback` only when OAuth state starts with `desktop:` in `apps/api/src/routes/auth.ts:209` and `apps/api/src/routes/auth.ts:276`
- [desktop marker source]: desktop login URL appends `?source=desktop` via `apps/desktop-ui/lib/api/auth.ts:21`, and desktop header is set in `apps/desktop-ui/lib/api/client.ts:38`
- [npm package target]: publish job compares/publishes `packages/openlinear/package.json` version (currently `0.1.20`) in `.github/workflows/deploy.yml:130` and `.github/workflows/release.yml:102`
- [deploy script behavior]: deployment force-resets repo and pulls `main` before build/reload in `scripts/deploy.sh:27` and `scripts/deploy.sh:29`
- [local verification evidence]: local register/login and desktop callback checks were validated in current session (register/login 200 payloads + desktop callback 302 to `openlinear://callback`)
- [test capability matrix]: local can verify register/login, OAuth redirect shape, deep-link parsing tests, and API tests; production is required for full GitHub OAuth code exchange and live desktop callback behavior
- [metis gaps]: add version/tag parity gate, publish-channel guardrails, auth smoke checks after deploy, and rollback-ready criteria

## Open Questions
- [none-blocking]: no blocker identified for plan generation

## Scope Boundaries
- INCLUDE: deploy auth fix changes, verify production health/auth redirect behavior, publish updated npm package
- EXCLUDE: unrelated feature work and non-auth refactors
