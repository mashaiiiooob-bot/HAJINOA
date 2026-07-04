import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import dashboardRoutes from './adminDashboardRoutes.js';
import userRoutes from './adminUserRoutes.js';
import tournamentRoutes from './adminTournamentRoutes.js';
import marketplaceRoutes from './adminMarketplaceRoutes.js';
import clanRoutes from './adminClanRoutes.js';
import gameRoutes from './adminGameRoutes.js';
import announcementRoutes from './adminAnnouncementRoutes.js';
import settingsRoutes from './adminSettingsRoutes.js';

const router = Router();

// Every admin endpoint requires an authenticated admin — enforced once, here.
router.use(requireAuth, requireRole('admin'));

router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
router.use('/tournaments', tournamentRoutes);
router.use('/marketplace', marketplaceRoutes);
router.use('/clans', clanRoutes);
router.use('/games', gameRoutes);
router.use('/announcements', announcementRoutes);
router.use('/settings', settingsRoutes);

export default router;
