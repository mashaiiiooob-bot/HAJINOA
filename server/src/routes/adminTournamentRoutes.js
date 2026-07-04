import { Router } from 'express';
import { AdminTournamentController } from '../controllers/AdminTournamentController.js';
import { validate, validateUuidParam } from '../middleware/validate.js';
import { listTournamentsSchema, cancelTournamentSchema } from '../utils/validators/adminTournamentValidators.js';

const router = Router();

router.get('/', validate(listTournamentsSchema, 'query'), AdminTournamentController.list);
router.get('/:id', validateUuidParam('id'), AdminTournamentController.detail);
router.post('/:id/force-start', validateUuidParam('id'), AdminTournamentController.forceStart);
router.post('/:id/force-end', validateUuidParam('id'), AdminTournamentController.forceEnd);
router.post('/:id/cancel', validateUuidParam('id'), validate(cancelTournamentSchema), AdminTournamentController.cancel);
router.delete('/:id', validateUuidParam('id'), AdminTournamentController.remove);

export default router;
