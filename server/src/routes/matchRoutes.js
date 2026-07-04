import { Router } from 'express';
import { MatchController } from '../controllers/MatchController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateUuidParam } from '../middleware/validate.js';

const router = Router();

router.get('/history/me', requireAuth, MatchController.myHistory);
router.get('/:id', requireAuth, validateUuidParam('id'), MatchController.getById);

export default router;
