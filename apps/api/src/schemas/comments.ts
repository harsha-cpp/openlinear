import { z } from 'zod';

/**
 * T10 — Comments schemas (zod). When T9 lands a shared `validateBody`
 * middleware these schemas plug straight into it (`validateBody(createCommentSchema)`).
 * Until then routes call `.safeParse` inline and return the same 400 shape
 * other T7-era routes already use.
 */

export const createCommentSchema = z.object({
  body: z.string().min(1, 'body is required').max(10_000, 'body too long'),
});

export const updateCommentSchema = z.object({
  body: z.string().min(1, 'body is required').max(10_000, 'body too long'),
});

export const listCommentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;

/**
 * Mention regex — matches `@username` only when preceded by start-of-string
 * or whitespace (prevents `email@domain` false positives). Returns the
 * username in capture group 1. Use with `.matchAll()` for global iteration.
 *
 * Allowed characters mirror the User.username column (alphanumeric, `_`, `-`).
 */
export const MENTION_REGEX = /(?:^|\s)@([a-zA-Z0-9_-]+)/g;

/**
 * Extract unique mentioned usernames from a comment body.
 * Order-preserving (first occurrence wins) so logs/UI render in the order
 * the author typed them.
 */
export function extractMentionedUsernames(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
  while ((match = re.exec(body)) !== null) {
    const name = match[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}
