import { AdminDashboardModel } from '../models/AdminDashboardModel.js';
import { presence } from '../sockets/presence.js';

export const AdminDashboardService = {
  async overview() {
    const [users, games, tournaments, marketplace, clans, economy] = await Promise.all([
      AdminDashboardModel.userStats(),
      AdminDashboardModel.gameStats(),
      AdminDashboardModel.tournamentStats(),
      AdminDashboardModel.marketplaceStats(),
      AdminDashboardModel.clanStats(),
      AdminDashboardModel.economyStats(),
    ]);

    return {
      users: { ...users, onlineUsers: presence.onlineUserIds().length },
      games,
      tournaments,
      marketplace,
      clans,
      economy,
    };
  },

  async charts(days = 14) {
    const bounded = Math.min(Math.max(Number(days) || 14, 1), 90);
    const [userGrowth, matchVolume] = await Promise.all([
      AdminDashboardModel.activityTimeline(bounded),
      AdminDashboardModel.matchTimeline(bounded),
    ]);
    return { userGrowth, matchVolume };
  },
};
