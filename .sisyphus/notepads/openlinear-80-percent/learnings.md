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
