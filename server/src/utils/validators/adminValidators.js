import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const chartsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional(),
});

export const logsQuerySchema = z.object({
  category: z.enum(['login', 'admin_action', 'economy', 'marketplace', 'clan', 'match']).optional(),
  actorId: z.string().uuid().optional(),
  targetId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
