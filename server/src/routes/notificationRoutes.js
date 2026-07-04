import { Router } from 'express';
import { NotificationController } from '../controllers/NotificationController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateUuidParam } from '../middleware/validate.js';

const router = Router();

router.get('/', requireAuth, NotificationController.list);
router.post('/:id/read', requireAuth, validateUuidParam('id'), NotificationController.markRead);
router.post('/read-all', requireAuth, NotificationController.markAllRead);

export default router;
