import { z } from 'zod';

export const friendRequestSchema = z.object({
  addresseeId: z.string().uuid('شناسه کاربر نامعتبر است'),
});

export const friendSearchSchema = z.object({
  q: z.string().trim().min(1).max(60),
});
