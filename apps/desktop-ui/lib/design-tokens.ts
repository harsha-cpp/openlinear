/**
 * OpenLinear semantic design tokens.
 *
 * Single source of truth for status/priority color classes and elevation
 * shadows. All UI surfaces should import from this module instead of
 * hand-rolling tailwind class strings or inline hex literals.
 *
 * Tokens use the `linear-*` namespace (which respects the runtime
 * `--linear-accent` CSS variable) plus semantic shadcn tokens.
 */

export type StatusKey =
  | "todo"
  | "in_progress"
  | "done"
  | "cancelled"
  | "error"
  | "cloning"
  | "executing"
  | "committing"
  | "creating_pr"

export type PriorityKey = "low" | "medium" | "high" | "urgent"

export interface ColorTriad {
  /** Background tailwind class. */
  bg: string
  /** Text tailwind class. */
  text: string
  /** Border tailwind class. */
  border: string
}

export const STATUS_COLORS: Readonly<Record<StatusKey, ColorTriad>> = {
  todo: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
  },
  in_progress: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/30",
  },
  done: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
  },
  cancelled: {
    bg: "bg-zinc-500/10",
    text: "text-zinc-400",
    border: "border-zinc-500/30",
  },
  error: {
    bg: "bg-destructive/10",
    text: "text-destructive",
    border: "border-destructive/40",
  },
  cloning: {
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    border: "border-sky-500/30",
  },
  executing: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
  },
  committing: {
    bg: "bg-violet-500/10",
    text: "text-violet-400",
    border: "border-violet-500/30",
  },
  creating_pr: {
    bg: "bg-fuchsia-500/10",
    text: "text-fuchsia-400",
    border: "border-fuchsia-500/30",
  },
} as const

export const PRIORITY_COLORS: Readonly<Record<PriorityKey, ColorTriad>> = {
  low: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
  },
  medium: {
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    border: "border-sky-500/30",
  },
  high: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
  },
  urgent: {
    bg: "bg-destructive/10",
    text: "text-destructive",
    border: "border-destructive/40",
  },
} as const

/**
 * Semantic shadow utilities. The actual shadow values are wired in
 * `tailwind.config.ts` under `theme.extend.boxShadow`.
 */
export const SHADOWS = {
  card: "shadow-card",
  overlay: "shadow-overlay",
  elevation: "shadow-elevation",
} as const

export type ShadowKey = keyof typeof SHADOWS
