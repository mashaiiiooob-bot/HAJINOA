import { Router } from 'express';
import { ClanController } from '../controllers/ClanController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, validateUuidParam } from '../middleware/validate.js';
import {
  createClanSchema,
  clanAnnouncementSchema,
  clanMemberActionSchema,
  browseClanSchema,
} from '../utils/validators/clanValidators.js';

const router = Router();

router.get('/', requireAuth, validate(browseClanSchema, 'query'), ClanController.browse);
router.get('/leaderboard', requireAuth, ClanController.leaderboard);
router.get('/mine', requireAuth, ClanController.myClan);
router.get('/:id', requireAuth, validateUuidParam('id'), ClanController.getById);
router.get('/:id/chat', requireAuth, validateUuidParam('id'), ClanController.chatHistory);

router.post('/', requireAuth, validate(createClanSchema), ClanController.create);
router.post('/:id/join', requireAuth, validateUuidParam('id'), ClanController.join);
router.post('/:id/leave', requireAuth, validateUuidParam('id'), ClanController.leave);
router.post('/:id/kick', requireAuth, validateUuidParam('id'), validate(clanMemberActionSchema), ClanController.kick);
router.post(
  '/:id/transfer-ownership',
  requireAuth,
  validateUuidParam('id'),
  validate(clanMemberActionSchema),
  ClanController.transferOwnership
);
router.post('/:id/invite', requireAuth, validateUuidParam('id'), validate(clanMemberActionSchema), ClanController.invite);
router.post(
  '/:id/announcement',
  requireAuth,
  validateUuidParam('id'),
  validate(clanAnnouncementSchema),
  ClanController.setAnnouncement
);

export default router;
