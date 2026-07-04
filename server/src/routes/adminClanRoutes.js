import { Router } from 'express';
import { AdminClanController } from '../controllers/AdminClanController.js';
import { validate, validateUuidParam } from '../middleware/validate.js';
import { listClansSchema, updateClanSchema, clanMemberActionSchema } from '../utils/validators/adminClanValidators.js';

const router = Router();

router.get('/', validate(listClansSchema, 'query'), AdminClanController.list);
router.get('/:id', validateUuidParam('id'), AdminClanController.detail);
router.patch('/:id', validateUuidParam('id'), validate(updateClanSchema), AdminClanController.update);
router.post(
  '/:id/transfer-ownership',
  validateUuidParam('id'),
  validate(clanMemberActionSchema),
  AdminClanController.transferOwnership
);
router.post('/:id/kick', validateUuidParam('id'), validate(clanMemberActionSchema), AdminClanController.kick);
router.delete('/:id', validateUuidParam('id'), AdminClanController.remove);

export default router;
