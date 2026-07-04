import { z } from 'zod';

export const searchUsersSchema = z.object({
  search: z.string().max(60).optional(),
  role: z.enum(['player', 'moderator', 'admin']).optional(),
  status: z.enum(['active', 'suspended', 'banned', 'deleted']).optional(),
  sort: z.enum(['newest', 'oldest', 'coins_desc', 'level_desc', 'last_seen']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const banUserSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const muteUserSchema = z.object({
  minutes: z.number().int().min(1).max(60 * 24 * 30), // up to 30 days
});

export const setRoleSchema = z.object({
  role: z.enum(['player', 'moderator', 'admin']),
});

export const resetCoinsSchema = z.object({
  amount: z.number().int().min(0).max(1_000_000_000).optional(),
});
