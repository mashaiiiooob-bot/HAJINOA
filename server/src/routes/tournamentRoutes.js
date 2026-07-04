import { Router } from 'express';
import { TournamentController } from '../controllers/TournamentController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateUuidParam } from '../middleware/validate.js';

const router = Router();

router.get('/', requireAuth, TournamentController.list);
router.get('/history/me', requireAuth, TournamentController.myHistory);
router.get('/:id', requireAuth, validateUuidParam('id'), TournamentController.getById);
router.post('/join', requireAuth, TournamentController.join);
router.post('/:id/leave', requireAuth, validateUuidParam('id'), TournamentController.leave);

export default router;
