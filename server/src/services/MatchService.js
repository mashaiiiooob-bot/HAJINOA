import crypto from 'node:crypto';
import { query, withTransaction } from '../config/database.js';
import { errors } from '../utils/AppError.js';

const WIN_COINS = 120;
const STREAK_BONUS = 15;
const ROUNDS_TO_WIN = 3;

/**
 * Game rule: the opponent hand hides a token in 'left' or 'right'.
 * The outcome MUST be generated server-side with a CSPRNG — never accept
 * a client-declared result, or players could trivially cheat the economy.
 */
function flipHiddenHand() {
  return crypto.randomInt(0, 2) === 0 ? 'left' : 'right';
}

export const MatchService = {
  async createMatch({ modeCode, isRanked, player1Id, player2Id }) {
    const { rows: modeRows } = await query(`SELECT id FROM game_modes WHERE code = $1`, [modeCode]);
    if (!modeRows[0]) throw errors.notFound('حالت بازی نامعتبر است');

    return withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO matches (mode_id, status, is_ranked, started_at)
         VALUES ($1, 'active', $2, now()) RETURNING id`,
        [modeRows[0].id, isRanked]
      );
      const matchId = rows[0].id;
      for (const userId of [player1Id, player2Id]) {
        await client.query(
          `INSERT INTO match_participants (match_id, user_id, team) VALUES ($1, $2, $3)`,
          [matchId, userId, userId === player1Id ? 0 : 1]
        );
      }
      return matchId;
    });
  },

  /**
   * Resolves a single round server-side from ALL participants' submitted picks.
   * Both players guess independently against the same hidden hand, so a round can end
   * with both correct, one correct, or neither — round_winner_id reflects that (null
   * when it's not a clean single winner) instead of arbitrarily crediting one player.
   */
  async playRound({ matchId, picks, roundNumber }) {
    const entries = Object.entries(picks);
    if (entries.some(([, guess]) => !['left', 'right'].includes(guess))) {
      throw errors.validation('انتخاب نامعتبر است');
    }

    const hidden = flipHiddenHand();
    const correctness = Object.fromEntries(entries.map(([userId, guess]) => [userId, guess === hidden]));
    const winners = entries.filter(([userId]) => correctness[userId]).map(([userId]) => userId);
    const roundWinnerId = winners.length === 1 ? winners[0] : null;

    await query(
      `INSERT INTO match_rounds (match_id, round_number, moves, round_winner_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (match_id, round_number) DO NOTHING`,
      [matchId, roundNumber, JSON.stringify({ ...picks, hidden }), roundWinnerId]
    );

    return { hidden, correctness };
  },

  async finishMatch({ matchId, winnerId, loserId, isRanked, winnerStreak }) {
    return withTransaction(async (client) => {
      await client.query(
        `UPDATE matches SET status = 'completed', winner_id = $2, ended_at = now() WHERE id = $1`,
        [matchId, winnerId]
      );

      const coinGain = isRanked ? WIN_COINS + Math.min(winnerStreak, 10) * STREAK_BONUS : 0;
      const xpGain = isRanked ? 30 : 14;

      await client.query(
        `UPDATE users SET coins = coins + $2, xp = xp + $3 WHERE id = $1`,
        [winnerId, coinGain, xpGain]
      );
      await client.query(
        `UPDATE player_stats
         SET games_played = games_played + 1, games_won = games_won + 1,
             win_streak = win_streak + 1,
             best_win_streak = GREATEST(best_win_streak, win_streak + 1),
             rank_points = rank_points + 18, updated_at = now()
         WHERE user_id = $1`,
        [winnerId]
      );
      await client.query(
        `UPDATE player_stats
         SET games_played = games_played + 1, games_lost = games_lost + 1,
             win_streak = 0, rank_points = GREATEST(rank_points - 14, 0), updated_at = now()
         WHERE user_id = $1`,
        [loserId]
      );

      return { coinGain, xpGain };
    });
  },

  /**
   * Resolves a Rock-Paper-Scissors round. Unlike playRound() (both players guess
   * independently against a random hidden hand), RPS is a genuine head-to-head
   * comparison — winner is decided by the two submitted moves alone, no server
   * randomness needed for the outcome itself.
   */
  async playRpsRound({ matchId, picks, roundNumber }) {
    const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
    const entries = Object.entries(picks);
    if (entries.some(([, move]) => !['rock', 'paper', 'scissors'].includes(move))) {
      throw errors.validation('انتخاب نامعتبر است');
    }

    let roundWinnerId = null;
    if (entries.length === 2) {
      const [[u1, m1], [u2, m2]] = entries;
      if (m1 !== m2) roundWinnerId = BEATS[m1] === m2 ? u1 : u2;
    }

    const results = Object.fromEntries(
      entries.map(([userId]) => [userId, roundWinnerId === null ? 'draw' : userId === roundWinnerId ? 'win' : 'lose'])
    );

    await query(
      `INSERT INTO match_rounds (match_id, round_number, moves, round_winner_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (match_id, round_number) DO NOTHING`,
      [matchId, roundNumber, JSON.stringify(picks), roundWinnerId]
    );

    return { moves: picks, results, roundWinnerId };
  },

  async getMatchModeCode(matchId) {
    const { rows } = await query(
      `SELECT gm.code FROM matches m JOIN game_modes gm ON gm.id = m.mode_id WHERE m.id = $1`,
      [matchId]
    );
    return rows[0]?.code || null;
  },

  ROUNDS_TO_WIN,
};
