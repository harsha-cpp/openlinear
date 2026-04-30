import { z } from 'zod';

const PriorityEnum = z.enum(['low', 'medium', 'high']);
const StatusEnum = z.enum(['todo', 'in_progress', 'done', 'cancelled']);

export const createTaskBodySchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    priority: PriorityEnum.optional().default('medium'),
    status: StatusEnum.optional().default('todo'),
    labelIds: z.array(z.string().uuid()).optional().default([]),
    teamId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    dueDate: z.string().datetime().nullable().optional(),
  })
  .refine((data) => Boolean(data.teamId) || Boolean(data.projectId), {
    message: 'Task must belong to a team or a project',
    path: ['teamId'],
  });

export const updateTaskBodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: PriorityEnum.optional(),
  status: StatusEnum.optional(),
  labelIds: z.array(z.string().uuid()).optional(),
  teamId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const listTasksQuerySchema = z.object({
  teamId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
});

export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;
export type UpdateTaskBody = z.infer<typeof updateTaskBodySchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
