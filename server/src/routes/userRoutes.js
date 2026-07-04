import { Router } from 'express';
import { UserController } from '../controllers/UserController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateUuidParam } from '../middleware/validate.js';

const router = Router();

router.get('/me', requireAuth, UserController.me);
router.get('/leaderboard', UserController.leaderboard);
router.get('/:id', validateUuidParam('id'), UserController.getById);

export default router;
