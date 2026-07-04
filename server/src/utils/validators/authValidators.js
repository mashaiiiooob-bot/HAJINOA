import { z } from 'zod';

const username = z
  .string()
  .min(3, 'نام کاربری باید حداقل ۳ کاراکتر باشد')
  .max(20, 'نام کاربری باید حداکثر ۲۰ کاراکتر باشد')
  .regex(/^[a-zA-Z0-9_]+$/, 'نام کاربری فقط می‌تواند شامل حروف انگلیسی، عدد و _ باشد');

const password = z
  .string()
  .min(8, 'رمز عبور باید حداقل ۸ کاراکتر باشد')
  .max(72, 'رمز عبور بیش از حد طولانی است')
  .regex(/[A-Z]/, 'رمز عبور باید شامل حداقل یک حرف بزرگ باشد')
  .regex(/[0-9]/, 'رمز عبور باید شامل حداقل یک عدد باشد');

export const registerSchema = z.object({
  username,
  email: z.string().email('ایمیل نامعتبر است').max(254),
  password,
  displayName: z.string().min(2).max(60).optional(),
});

export const loginSchema = z.object({
  identifier: z.string().min(3).max(254),
  password: z.string().min(1, 'رمز عبور الزامی است'),
});
