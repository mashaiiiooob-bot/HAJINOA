import { Router } from 'express';
import { AdminGameController } from '../controllers/AdminGameController.js';
import { validate, validateUuidParam } from '../middleware/validate.js';
import { listMatchesSchema, forceWinnerSchema } from '../utils/validators/adminGameValidators.js';

const router = Router();

router.get('/active', AdminGameController.listActive);
router.get('/history', validate(listMatchesSchema, 'query'), AdminGameController.history);
router.get('/:id', validateUuidParam('id'), AdminGameController.detail);
router.post('/:id/end', validateUuidParam('id'), AdminGameController.end);
router.post('/:id/cancel', validateUuidParam('id'), AdminGameController.cancel);
router.post('/:id/force-winner', validateUuidParam('id'), validate(forceWinnerSchema), AdminGameController.forceWinner);

export default router;
