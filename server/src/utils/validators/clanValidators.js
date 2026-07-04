import { z } from 'zod';

export const createClanSchema = z.object({
  name: z.string().trim().min(3, 'نام کلن باید حداقل ۳ کاراکتر باشد').max(60),
  tag: z.string().trim().min(2, 'تگ کلن باید حداقل ۲ کاراکتر باشد').max(4),
  description: z.string().trim().max(500).optional().nullable(),
  avatarUrl: z.string().trim().url().max(255).optional().nullable(),
});

export const clanAnnouncementSchema = z.object({
  announcement: z.string().trim().max(500),
});

export const clanMemberActionSchema = z.object({
  userId: z.string().uuid('شناسه کاربر نامعتبر است'),
});

export const browseClanSchema = z.object({
  search: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});

export const clanChatSchema = z.object({
  body: z.string().trim().min(1).max(500),
});
