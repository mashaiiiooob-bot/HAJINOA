import { z } from 'zod';

export const listClansSchema = z.object({
  search: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const updateClanSchema = z.object({
  name: z.string().trim().min(3).max(60).optional(),
  tag: z.string().trim().min(2).max(4).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  avatarUrl: z.string().trim().url().max(255).nullable().optional(),
});

export const clanMemberActionSchema = z.object({
  userId: z.string().uuid('شناسه کاربر نامعتبر است'),
});
