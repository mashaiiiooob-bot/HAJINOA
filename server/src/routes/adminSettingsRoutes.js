import { Router } from 'express';
import { z } from 'zod';
import { AdminSettingsController } from '../controllers/AdminSettingsController.js';
import { validate } from '../middleware/validate.js';
import { updateSettingsSchema } from '../utils/validators/adminSettingsValidators.js';
import { AdminSettingsModel } from '../models/AdminSettingsModel.js';

const router = Router();

const categoryParamSchema = z.object({ category: z.enum(AdminSettingsModel.CATEGORIES) });

router.get('/', AdminSettingsController.getAll);
router.put(
  '/:category',
  validate(categoryParamSchema, 'params'),
  validate(updateSettingsSchema),
  AdminSettingsController.update
);

export default router;
