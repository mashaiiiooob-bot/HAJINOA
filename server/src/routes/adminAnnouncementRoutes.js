import { Router } from 'express';
import { AdminAnnouncementController } from '../controllers/AdminAnnouncementController.js';
import { validate, validateUuidParam } from '../middleware/validate.js';
import { sendAnnouncementSchema, listAnnouncementsSchema } from '../utils/validators/adminAnnouncementValidators.js';

const router = Router();

router.get('/', validate(listAnnouncementsSchema, 'query'), AdminAnnouncementController.list);
router.post('/', validate(sendAnnouncementSchema), AdminAnnouncementController.send);
router.delete('/:id', validateUuidParam('id'), AdminAnnouncementController.remove);

export default router;
