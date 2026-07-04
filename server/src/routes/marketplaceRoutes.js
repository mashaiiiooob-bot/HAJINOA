import { Router } from 'express';
import { MarketplaceController } from '../controllers/MarketplaceController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, validateUuidParam } from '../middleware/validate.js';
import { listItemSchema, browseListingsSchema, historySchema } from '../utils/validators/marketplaceValidators.js';

const router = Router();

router.get('/listings', requireAuth, validate(browseListingsSchema, 'query'), MarketplaceController.browse);
router.get('/inventory', requireAuth, MarketplaceController.inventory);
router.get('/history/me', requireAuth, validate(historySchema, 'query'), MarketplaceController.myHistory);
router.post('/listings', requireAuth, validate(listItemSchema), MarketplaceController.listItem);
router.post('/listings/:id/buy', requireAuth, validateUuidParam('id'), MarketplaceController.buyItem);
router.delete('/listings/:id', requireAuth, validateUuidParam('id'), MarketplaceController.removeListing);

export default router;
