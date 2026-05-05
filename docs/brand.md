# OpenLinear Brand & Color Tokens

Canonical reference for the OpenLinear visual identity across `apps/desktop-ui` and `apps/landing`.

## Primary Accent (Canonical)

The OpenLinear brand accent is **Linear-style blue**. Every CTA, primary button, focus ring, and "active" indicator across **both** apps must resolve to this color (or the user's runtime-overridden equivalent in desktop-ui).

| Token | Hex | HSL | Usage |
|---|---|---|---|
| `--linear-accent` | `#1d4ed8` | `224 76% 48%` | Primary CTA fill, focus outline, active indicator |
| `--linear-accent-hover` | `#1e40af` | `226 71% 40%` | Hover state for primary CTAs |
| `--primary` / `--accent` / `--ring` (landing) | `#1d4ed8` | `224 76% 48%` | shadcn/ui semantic tokens — bound to canonical blue |
| `--primary` / `--accent` / `--ring` (desktop-ui) | `#3b82f6` | `217 91% 60%` | shadcn defaults — brighter blue, kept as-is because desktop CTAs read `--linear-accent` directly, not these tokens |

These tokens are defined in:
- `apps/desktop-ui/app/globals.css` (`:root`) — canonical `--linear-accent` lives here and is **runtime-overridden by the accent picker**
- `apps/landing/app/globals.css` (`:root` and `.dark`) — canonical `--linear-accent` is static and matches the desktop default

**The `--linear-accent` hex values MUST stay in lockstep across both files.** A drift = a broken brand. The shadcn `--primary` HSL values are allowed to differ between apps because the canonical CTA path goes through `--linear-accent`, not `--primary`.

## Runtime Themability

In **desktop-ui**, `--linear-accent` and `--linear-accent-hover` are overridden at runtime by the in-app accent-color picker. The picker writes new hex values directly to the document root:

```ts
document.documentElement.style.setProperty('--linear-accent', userPick);
document.documentElement.style.setProperty('--linear-accent-hover', darken(userPick));
```

This means the values in `globals.css` are *defaults*. Any component that wants to honor the user's accent choice must read from `var(--linear-accent)` rather than hardcoding `#1d4ed8` or referencing `hsl(var(--primary))`.

The **landing site does not theme at runtime** — it always renders the canonical `#1d4ed8` for marketing consistency. There is no picker in the landing app.

## Surface Palette

### Desktop-UI (single dark theme)

| Token | HSL | Hex (approx) | Role |
|---|---|---|---|
| `--background` | `0 0% 10%` | `#1a1a1a` | App backdrop |
| `--card` / `--popover` | `0 0% 8%` | `#141414` | Cards, menus |
| `--foreground` | `0 0% 96%` | `#f5f5f5` | Body text |
| `--muted-foreground` | `0 0% 60%` | `#999999` | Secondary text |
| `--border` / `--input` | `0 0% 16%` | `#292929` | Hairlines, inputs |

### Landing (light + dark)

Light mode uses near-white with cool slate text; dark mode uses a deep slate-blue surface (`228 18% 11%`) with a warm cream foreground (`49 43% 87%`). Both modes route the **accent** through the canonical blue.

## Landing-Only Decoration: Warm Cream

The landing site historically used a warm cream/gold (`#ede8d0`) as the dark-mode accent. This is **demoted to decorative use only**:

| Token | Hex | Allowed Uses | Forbidden Uses |
|---|---|---|---|
| `--landing-warm-cream` | `#ede8d0` | Hero background gradients, ornamental glyphs, scrollbar thumbs, decorative section dividers | CTAs, primary buttons, focus rings, links, active states |
| `--landing-warm-cream-rgb` | `237, 232, 208` | Same — provided as raw RGB for `rgba()` composition | Same |

If a component needs a brand-colored interactive element on the landing page, it **must** use `--linear-accent` (or one of the shadcn semantic tokens that resolves to it). Warm cream is texture, not signal.

This token is **landing-scoped**: do not introduce it to `desktop-ui/globals.css`.

## Adding a New Color

1. Decide: is it brand signal (CTA-adjacent) or decoration?
2. Brand signal → derive from `--linear-accent` (e.g. tinted/shaded), don't introduce a new hex.
3. Decoration → add a clearly-prefixed token (`--landing-*` or `--desktop-*`) and document it in this file.
4. Update both `globals.css` files only if the token is shared. Keep app-only tokens in their own file.

## Quick Audit Checklist

When adding/reviewing UI:
- [ ] Every "primary" button resolves to `#1d4ed8` (or runtime-overridden value in desktop-ui).
- [ ] Focus rings use `--linear-accent` or `--ring` (same value).
- [ ] No raw `#ede8d0` / `#EDE8D0` / `rgba(237, 232, 208, …)` in interactive components — only in decorative layers.
- [ ] No purple/indigo (`243 40% 46%`) anywhere — that was the old landing primary; it's been retired.
