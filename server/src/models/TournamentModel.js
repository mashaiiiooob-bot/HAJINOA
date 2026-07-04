import { query } from '../config/database.js';

const TOURNAMENT_FIELDS = `
  t.id, t.name, t.prize_coins AS "prizeCoins", t.max_players AS "maxPlayers",
  t.status, t.current_round AS "currentRound", t.starts_at AS "startsAt",
  t.ends_at AS "endsAt", t.champion_id AS "championId", t.runner_up_id AS "runnerUpId",
  t.created_at AS "createdAt"
`;

export const TournamentModel = {
  async create(client, { name, prizeCoins, maxPlayers, createdBy }) {
    const { rows } = await client.query(
      `INSERT INTO tournaments (name, prize_coins, max_players, status, starts_at, created_by)
       VALUES ($1, $2, $3, 'registration', now(), $4)
       RETURNING ${TOURNAMENT_FIELDS}`,
      [name, prizeCoins, maxPlayers, createdBy || null]
    );
    return rows[0];
  },

  /** Locks the most recently created open tournament with room left, for atomic joins. */
  async findJoinableForUpdate(client) {
    const { rows } = await client.query(
      `SELECT t.id, t.max_players AS "maxPlayers",
              (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id) AS "participantCount"
       FROM tournaments t
       WHERE t.status = 'registration'
       ORDER BY t.created_at ASC
       LIMIT 1
       FOR UPDATE`
    );
    return rows[0] || null;
  },

  async findActiveTournamentForUser(userId) {
    const { rows } = await query(
      `SELECT t.id FROM tournament_participants tp
       JOIN tournaments t ON t.id = tp.tournament_id
       WHERE tp.user_id = $1 AND t.status IN ('registration', 'active')
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  },

  async addParticipant(client, { tournamentId, userId, seed }) {
    await client.query(
      `INSERT INTO tournament_participants (tournament_id, user_id, seed) VALUES ($1, $2, $3)`,
      [tournamentId, userId, seed]
    );
  },

  async listParticipants(client, tournamentId) {
    const { rows } = await client.query(
      `SELECT tp.user_id AS "userId", tp.seed, tp.status, tp.placement,
              u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl"
       FROM tournament_participants tp
       JOIN users u ON u.id = tp.user_id
       WHERE tp.tournament_id = $1
       ORDER BY tp.seed ASC`,
      [tournamentId]
    );
    return rows;
  },

  async setStatus(client, tournamentId, status, extra = {}) {
    const sets = ['status = $2'];
    const params = [tournamentId, status];
    let i = params.length;
    for (const [col, val] of Object.entries(extra)) {
      i += 1;
      sets.push(`${col} = $${i}`);
      params.push(val);
    }
    await client.query(`UPDATE tournaments SET ${sets.join(', ')} WHERE id = $1`, params);
  },

  async createMatchesForRound(client, tournamentId, roundNumber, pairings) {
    const created = [];
    for (const [slot, pair] of pairings.entries()) {
      const { rows } = await client.query(
        `INSERT INTO tournament_matches (tournament_id, round_number, bracket_slot, player1_id, player2_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, round_number AS "roundNumber", bracket_slot AS "bracketSlot",
                   player1_id AS "player1Id", player2_id AS "player2Id", status`,
        [tournamentId, roundNumber, slot, pair[0] || null, pair[1] || null, pair.length === 2 ? 'pending' : 'completed']
      );
      created.push(rows[0]);
    }
    return created;
  },

  /** Links a freshly-created real `matches` row to its bracket slot. Runs outside any open transaction. */
  async attachMatch(tournamentMatchId, matchId) {
    await query(`UPDATE tournament_matches SET match_id = $2, status = 'active' WHERE id = $1`, [
      tournamentMatchId,
      matchId,
    ]);
  },

  async findByMatchId(matchId) {
    const { rows } = await query(
      `SELECT tm.id, tm.tournament_id AS "tournamentId", tm.round_number AS "roundNumber",
              tm.bracket_slot AS "bracketSlot", tm.player1_id AS "player1Id", tm.player2_id AS "player2Id"
       FROM tournament_matches tm
       WHERE tm.match_id = $1 AND tm.status = 'active'`,
      [matchId]
    );
    return rows[0] || null;
  },

  async recordWinner(client, tournamentMatchId, winnerId) {
    await client.query(`UPDATE tournament_matches SET winner_id = $2, status = 'completed' WHERE id = $1`, [
      tournamentMatchId,
      winnerId,
    ]);
  },

  async roundMatches(client, tournamentId, roundNumber) {
    const { rows } = await client.query(
      `SELECT id, bracket_slot AS "bracketSlot", player1_id AS "player1Id", player2_id AS "player2Id",
              winner_id AS "winnerId", status
       FROM tournament_matches
       WHERE tournament_id = $1 AND round_number = $2
       ORDER BY bracket_slot ASC`,
      [tournamentId, roundNumber]
    );
    return rows;
  },

  async eliminateParticipant(client, tournamentId, userId, round) {
    await client.query(
      `UPDATE tournament_participants SET status = 'eliminated', eliminated_round = $3
       WHERE tournament_id = $1 AND user_id = $2`,
      [tournamentId, userId, round]
    );
  },

  async awardParticipant(client, tournamentId, userId, { placement, status, coins, xp, rankPoints }) {
    await client.query(
      `UPDATE tournament_participants
       SET placement = $3, status = $4, coins_awarded = $5, xp_awarded = $6, rank_points_awarded = $7
       WHERE tournament_id = $1 AND user_id = $2`,
      [tournamentId, userId, placement, status, coins, xp, rankPoints]
    );
    if (coins || xp) {
      await client.query(`UPDATE users SET coins = coins + $2, xp = xp + $3 WHERE id = $1`, [userId, coins, xp]);
    }
    if (rankPoints) {
      await client.query(
        `UPDATE player_stats SET rank_points = GREATEST(rank_points + $2, 0), updated_at = now() WHERE user_id = $1`,
        [userId, rankPoints]
      );
    }
  },

  async removeParticipant(tournamentId, userId) {
    const { rowCount } = await query(
      `DELETE FROM tournament_participants
       WHERE tournament_id = $1 AND user_id = $2
         AND tournament_id IN (SELECT id FROM tournaments WHERE status = 'registration')`,
      [tournamentId, userId]
    );
    return rowCount > 0;
  },

  async getById(tournamentId) {
    const { rows } = await query(`SELECT ${TOURNAMENT_FIELDS} FROM tournaments t WHERE t.id = $1`, [tournamentId]);
    return rows[0] || null;
  },

  async listOpenAndActive() {
    const { rows } = await query(
      `SELECT ${TOURNAMENT_FIELDS},
              (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id) AS "playerCount"
       FROM tournaments t
       WHERE t.status IN ('registration', 'active')
       ORDER BY t.created_at DESC
       LIMIT 20`
    );
    return rows;
  },

  async fullBracket(tournamentId) {
    const { rows } = await query(
      `SELECT tm.id, tm.round_number AS "roundNumber", tm.bracket_slot AS "bracketSlot",
              tm.status, tm.match_id AS "matchId",
              p1.id AS "player1Id", p1.display_name AS "player1Name", p1.avatar_url AS "player1Avatar",
              p2.id AS "player2Id", p2.display_name AS "player2Name", p2.avatar_url AS "player2Avatar",
              w.id AS "winnerId", w.display_name AS "winnerName"
       FROM tournament_matches tm
       LEFT JOIN users p1 ON p1.id = tm.player1_id
       LEFT JOIN users p2 ON p2.id = tm.player2_id
       LEFT JOIN users w ON w.id = tm.winner_id
       WHERE tm.tournament_id = $1
       ORDER BY tm.round_number ASC, tm.bracket_slot ASC`,
      [tournamentId]
    );
    return rows;
  },

  async myHistory(userId) {
    const { rows } = await query(
      `SELECT t.id, t.name, t.status, t.prize_coins AS "prizeCoins", t.champion_id AS "championId",
              t.ends_at AS "endsAt", t.created_at AS "createdAt",
              tp.placement, tp.status AS "participantStatus", tp.coins_awarded AS "coinsAwarded",
              tp.xp_awarded AS "xpAwarded", tp.rank_points_awarded AS "rankPointsAwarded"
       FROM tournament_participants tp
       JOIN tournaments t ON t.id = tp.tournament_id
       WHERE tp.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT 30`,
      [userId]
    );
    return rows;
  },
};
