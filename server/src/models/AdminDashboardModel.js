import { query } from '../config/database.js';

export const AdminDashboardModel = {
  async userStats() {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS "totalUsers",
              COUNT(*) FILTER (WHERE status = 'active')::int AS "activeUsers",
              COUNT(*) FILTER (WHERE status = 'banned')::int AS "bannedUsers",
              COUNT(*) FILTER (WHERE status = 'suspended')::int AS "suspendedUsers",
              COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS "newUsersThisWeek"
       FROM users`
    );
    return rows[0];
  },

  async gameStats() {
    const { rows } = await query(
      `SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS "activeMatches",
              COUNT(*) FILTER (WHERE status = 'completed' AND ended_at > now() - interval '24 hours')::int AS "matchesLast24h",
              COUNT(*)::int AS "totalMatches"
       FROM matches`
    );
    return rows[0];
  },

  async tournamentStats() {
    const { rows } = await query(
      `SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS "activeTournaments",
              COUNT(*) FILTER (WHERE status = 'registration')::int AS "openTournaments",
              COUNT(*) FILTER (WHERE status = 'completed')::int AS "completedTournaments",
              COALESCE(SUM(prize_coins) FILTER (WHERE status = 'completed'), 0)::bigint AS "coinsPaidOut"
       FROM tournaments`
    );
    return rows[0];
  },

  async marketplaceStats() {
    const { rows } = await query(
      `SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS "activeListings",
              COUNT(*) FILTER (WHERE status = 'sold')::int AS "totalSold",
              COUNT(*) FILTER (WHERE status = 'sold' AND sold_at > now() - interval '24 hours')::int AS "soldLast24h",
              COALESCE(SUM(price_coins) FILTER (WHERE status = 'sold'), 0)::bigint AS "totalVolumeCoins"
       FROM marketplace_listings`
    );
    return rows[0];
  },

  async clanStats() {
    const { rows } = await query(
      `SELECT COUNT(DISTINCT c.id)::int AS "totalClans",
              COUNT(cm.user_id)::int AS "totalClanMembers"
       FROM clans c LEFT JOIN clan_members cm ON cm.clan_id = c.id`
    );
    return rows[0];
  },

  async economyStats() {
    const { rows } = await query(
      `SELECT COALESCE(SUM(coins), 0)::bigint AS "totalCoinsInCirculation",
              COALESCE(SUM(gems), 0)::bigint AS "totalGemsInCirculation",
              COALESCE(AVG(coins), 0)::bigint AS "avgCoinsPerUser"
       FROM users WHERE status = 'active'`
    );
    return rows[0];
  },

  async activityTimeline(days = 14) {
    const { rows } = await query(
      `SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS "newUsers"
       FROM users
       WHERE created_at > now() - ($1 || ' days')::interval
       GROUP BY 1 ORDER BY 1`,
      [days]
    );
    return rows;
  },

  async matchTimeline(days = 14) {
    const { rows } = await query(
      `SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS "matches"
       FROM matches
       WHERE created_at > now() - ($1 || ' days')::interval
       GROUP BY 1 ORDER BY 1`,
      [days]
    );
    return rows;
  },
};
