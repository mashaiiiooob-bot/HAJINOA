import { Router } from 'express';
import { AdminDashboardController } from '../controllers/AdminDashboardController.js';
import { validate } from '../middleware/validate.js';
import { chartsQuerySchema, logsQuerySchema } from '../utils/validators/adminValidators.js';

const router = Router();

router.get('/overview', AdminDashboardController.overview);
router.get('/charts', validate(chartsQuerySchema, 'query'), AdminDashboardController.charts);
router.get('/logs', validate(logsQuerySchema, 'query'), AdminDashboardController.logs);

export default router;
