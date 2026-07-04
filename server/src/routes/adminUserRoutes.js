import { Router } from 'express';
import { AdminUserController } from '../controllers/AdminUserController.js';
import { validate, validateUuidParam } from '../middleware/validate.js';
import {
  searchUsersSchema,
  banUserSchema,
  muteUserSchema,
  setRoleSchema,
  resetCoinsSchema,
} from '../utils/validators/adminUserValidators.js';

const router = Router();

router.get('/', validate(searchUsersSchema, 'query'), AdminUserController.search);
router.get('/:id', validateUuidParam('id'), AdminUserController.profile);

router.post('/:id/ban', validateUuidParam('id'), validate(banUserSchema), AdminUserController.ban);
router.post('/:id/unban', validateUuidParam('id'), AdminUserController.unban);
router.post('/:id/mute', validateUuidParam('id'), validate(muteUserSchema), AdminUserController.mute);
router.post('/:id/unmute', validateUuidParam('id'), AdminUserController.unmute);
router.post('/:id/role', validateUuidParam('id'), validate(setRoleSchema), AdminUserController.setRole);

router.post('/:id/reset/coins', validateUuidParam('id'), validate(resetCoinsSchema), AdminUserController.resetCoins);
router.post('/:id/reset/xp', validateUuidParam('id'), AdminUserController.resetXp);
router.post('/:id/reset/inventory', validateUuidParam('id'), AdminUserController.resetInventory);
router.post('/:id/reset/statistics', validateUuidParam('id'), AdminUserController.resetStatistics);

export default router;
