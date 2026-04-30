import { z } from 'zod';

export const SearchTypeEnum = z.enum(['tasks', 'projects', 'teams']);
export type SearchType = z.infer<typeof SearchTypeEnum>;

export const SearchQuerySchema = z.object({
  q: z.string().min(2, 'Query must be at least 2 characters').max(200),
  types: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val === 'all') {
        return ['tasks', 'projects', 'teams'] as const;
      }
      const parts = val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return parts as SearchType[];
    })
    .pipe(
      z.array(SearchTypeEnum).min(1, 'At least one type is required'),
    ),
  limit: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 20;
      const n = parseInt(val, 10);
      return Number.isFinite(n) ? n : 20;
    })
    .pipe(z.number().int().min(1).max(50)),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
