import { z } from 'zod';

export const listMatchesSchema = z.object({
  search: z.string().max(60).optional(),
  status: z.enum(['pending', 'active', 'completed', 'aborted']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const forceWinnerSchema = z.object({
  winnerId: z.string().uuid('شناسه کاربر نامعتبر است'),
});
