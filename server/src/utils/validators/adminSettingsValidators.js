import { z } from 'zod';

export const updateSettingsSchema = z.object({
  settings: z.record(z.string(), z.any()),
});
