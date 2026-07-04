import { z } from 'zod';

export const sendDirectMessageSchema = z.object({
  recipientId: z.string().uuid('شناسه کاربر نامعتبر است'),
  body: z.string().trim().min(1).max(1000),
});

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
