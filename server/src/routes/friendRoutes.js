import { Router } from 'express';
import { FriendController } from '../controllers/FriendController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, validateUuidParam } from '../middleware/validate.js';
import { friendRequestSchema, friendSearchSchema } from '../utils/validators/friendValidators.js';

const router = Router();

router.get('/', requireAuth, FriendController.list);
router.get('/requests', requireAuth, FriendController.requests);
router.get('/search', requireAuth, validate(friendSearchSchema, 'query'), FriendController.search);
router.get('/:id/profile', requireAuth, validateUuidParam('id'), FriendController.profile);

router.post('/requests', requireAuth, validate(friendRequestSchema), FriendController.send);
router.post('/requests/:id/accept', requireAuth, validateUuidParam('id'), FriendController.accept);
router.post('/requests/:id/reject', requireAuth, validateUuidParam('id'), FriendController.reject);
router.post('/requests/:id/cancel', requireAuth, validateUuidParam('id'), FriendController.cancel);
router.delete('/:id', requireAuth, validateUuidParam('id'), FriendController.remove);

export default router;
