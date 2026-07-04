import { z } from 'zod';

export const listListingsSchema = z.object({
  search: z.string().max(60).optional(),
  status: z.enum(['active', 'sold', 'cancelled', 'expired']).optional(),
  category: z.enum(['avatar', 'frame', 'emote', 'theme', 'booster', 'border', 'name_color', 'badge']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const removeListingSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const forceCompleteSchema = z.object({
  buyerId: z.string().uuid('شناسه خریدار نامعتبر است'),
});
