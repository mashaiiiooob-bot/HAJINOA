import { z } from 'zod';

export const listTournamentsSchema = z.object({
  search: z.string().max(60).optional(),
  status: z.enum(['registration', 'active', 'completed', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const cancelTournamentSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});
