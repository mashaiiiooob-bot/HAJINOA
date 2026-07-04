import { Router } from 'express';
import { AdminMarketplaceController } from '../controllers/AdminMarketplaceController.js';
import { validate, validateUuidParam } from '../middleware/validate.js';
import {
  listListingsSchema,
  removeListingSchema,
  forceCompleteSchema,
} from '../utils/validators/adminMarketplaceValidators.js';

const router = Router();

router.get('/', validate(listListingsSchema, 'query'), AdminMarketplaceController.list);
router.get('/statistics', AdminMarketplaceController.statistics);
router.get('/:id', validateUuidParam('id'), AdminMarketplaceController.detail);
router.post('/:id/remove', validateUuidParam('id'), validate(removeListingSchema), AdminMarketplaceController.remove);
router.post(
  '/:id/force-complete',
  validateUuidParam('id'),
  validate(forceCompleteSchema),
  AdminMarketplaceController.forceComplete
);

export default router;
