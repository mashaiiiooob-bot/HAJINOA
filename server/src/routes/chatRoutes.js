import { Router } from 'express';
import { ChatController } from '../controllers/ChatController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, validateUuidParam } from '../middleware/validate.js';
import { sendDirectMessageSchema, historyQuerySchema } from '../utils/validators/chatValidators.js';

const router = Router();

router.get('/global', requireAuth, validate(historyQuerySchema, 'query'), ChatController.globalHistory);
router.get('/match/:matchId', requireAuth, validateUuidParam('matchId'), ChatController.matchHistory);
router.get('/online', requireAuth, ChatController.onlineUsers);
router.get('/direct', requireAuth, ChatController.conversations);
router.get('/direct/:userId', requireAuth, validateUuidParam('userId'), ChatController.conversation);
router.post('/direct', requireAuth, validate(sendDirectMessageSchema), ChatController.sendDirect);

export default router;
