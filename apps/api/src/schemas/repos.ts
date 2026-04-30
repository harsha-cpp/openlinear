import { z } from 'zod';

export const repoUrlBodySchema = z.object({
  url: z.string().min(1, 'URL is required').url('Must be a valid URL'),
});

export const importRepoBodySchema = z.object({
  repo: z.object({
    id: z.union([z.number(), z.string()]),
    full_name: z.string().min(1),
    name: z.string().optional(),
    clone_url: z.string().optional(),
    html_url: z.string().optional(),
    default_branch: z.string().optional(),
    private: z.boolean().optional(),
    owner: z
      .object({
        login: z.string().optional(),
      })
      .partial()
      .optional(),
  }).passthrough(),
});

export const updateBaseBranchBodySchema = z.object({
  baseBranch: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^(?![/.])(?!.*\.\.)(?!.*\/\.)(?!.*\.$)(?!.*\/$)[A-Za-z0-9._/-]+$/),
});

export type RepoUrlBody = z.infer<typeof repoUrlBodySchema>;
export type ImportRepoBody = z.infer<typeof importRepoBodySchema>;
export type UpdateBaseBranchBody = z.infer<typeof updateBaseBranchBodySchema>;
