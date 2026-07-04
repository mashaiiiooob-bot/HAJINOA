import { z } from 'zod';

const uuid = z.string().uuid('شناسه نامعتبر است');

export const listItemSchema = z.object({
  inventoryId: uuid,
  priceCoins: z.number().int('قیمت باید عدد صحیح باشد').min(1, 'قیمت باید حداقل ۱ سکه باشد').max(1_000_000_000),
  expiresInHours: z.number().int().min(1).max(24 * 14).optional().nullable(),
});

export const browseListingsSchema = z.object({
  search: z.string().max(100).optional(),
  category: z.enum(['avatar', 'frame', 'emote', 'theme', 'booster', 'border', 'name_color', 'badge']).optional(),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['newest', 'oldest', 'price_asc', 'price_desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});

export const historySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});
