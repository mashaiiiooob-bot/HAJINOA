import { z } from 'zod';

export const sendAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
  type: z.enum(['announcement', 'maintenance', 'event', 'tournament']).default('announcement'),
  scheduledAt: z.string().datetime().optional().nullable(),
});

export const listAnnouncementsSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
