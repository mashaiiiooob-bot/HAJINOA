import crypto from 'node:crypto';
import { query, withTransaction } from '../config/database.js';
import { TournamentModel } from '../models/TournamentModel.js';
import { MatchService } from './MatchService.js';
import { errors } from '../utils/AppError.js';

const MAX_PLAYERS = 8;
const TOTAL_ROUNDS = 3; // 8 players: round 1 = quarter-final, round 2 = semi-final, round 3 = final
const DEFAULT_PRIZE_COINS = 2000;

const ROUND_NAMES = { 1: 'quarterfinal', 2: 'semifinal', 3: 'final' };

/** XP / rank-point rewards by stage. Coin rewards scale off the tournament's own prize pool. */
const REWARDS = {
  champion: { coinPct: 1, xp: 600, rankPoints: 50 },
  runnerUp: { coinPct: 0.4, xp: 300, rankPoints: 25 },
  semifinal: { coinPct: 0.15, xp: 150, rankPoints: 12 },
  quarterfinal: { coinPct: 0.05, xp: 60, rankPoints: 5 },
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shortName() {
  return `مسابقه قهرمانی #${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

async function createRealMatchesForPairings(tournamentId, tmRows, round) {
  const events = [];
  for (const tm of tmRows) {
    const matchId = await MatchService.createMatch({
      modeCode: 'tournament',
      isRanked: false,
      player1Id: tm.player1Id,
      player2Id: tm.player2Id,
    });
    await TournamentModel.attachMatch(tm.id, matchId);
    events.push({
      type: 'match:ready',
      tournamentId,
      matchId,
      round,
      roundName: ROUND_NAMES[round],
      players: [tm.player1Id, tm.player2Id],
    });
  }
  return events;
}

export const TournamentService = {
  MAX_PLAYERS,
  TOTAL_ROUNDS,

  /** createTournament() — opens a fresh 8-player knockout tournament in the 'waiting' (registration) state. */
  async createTournament({ name, prizeCoins = DEFAULT_PRIZE_COINS, maxPlayers = MAX_PLAYERS, createdBy = null } = {}) {
    return withTransaction((client) =>
      TournamentModel.create(client, { name: name || shortName(), prizeCoins, maxPlayers, createdBy })
    );
  },

  /**
   * joinTournament() — adds the player to the join queue: the oldest open tournament with a free
   * slot, or a freshly created one if none is open. Automatically calls startTournament() the
   * moment the 8th player joins.
   */
  async joinTournament(userId) {
    const active = await TournamentModel.findActiveTournamentForUser(userId);
    if (active) throw errors.conflict('شما در حال حاضر در یک مسابقه ثبت‌نام کرده‌اید');

    const { tournamentId, seed, maxPlayers, filled } = await withTransaction(async (client) => {
      let joinable = await TournamentModel.findJoinableForUpdate(client);
      if (!joinable || Number(joinable.participantCount) >= joinable.maxPlayers) {
        const created = await TournamentModel.create(client, {
          name: shortName(),
          prizeCoins: DEFAULT_PRIZE_COINS,
          maxPlayers: MAX_PLAYERS,
          createdBy: null,
        });
        joinable = { id: created.id, maxPlayers: created.maxPlayers, participantCount: 0 };
      }

      const nextSeed = Number(joinable.participantCount) + 1;
      await TournamentModel.addParticipant(client, { tournamentId: joinable.id, userId, seed: nextSeed });

      return {
        tournamentId: joinable.id,
        seed: nextSeed,
        maxPlayers: joinable.maxPlayers,
        filled: nextSeed === joinable.maxPlayers,
      };
    });

    let events = [];
    let started = false;
    if (filled) {
      const result = await this.startTournament(tournamentId);
      events = result.events;
      started = true;
    }

    return { tournamentId, seed, maxPlayers, started, events };
  },

  async leaveTournament(userId, tournamentId) {
    const removed = await TournamentModel.removeParticipant(tournamentId, userId);
    if (!removed) throw errors.conflict('امکان خروج از این مسابقه وجود ندارد');
  },

  /** startTournament() — generates round 1 (quarter-final) pairings and spins up real matches. */
  async startTournament(tournamentId) {
    const tmRows = await withTransaction(async (client) => {
      const participants = await TournamentModel.listParticipants(client, tournamentId);
      if (participants.length < MAX_PLAYERS) {
        throw errors.conflict('تعداد بازیکنان برای شروع مسابقه کافی نیست');
      }

      const ids = shuffle(participants.map((p) => p.userId));
      const pairings = [];
      for (let i = 0; i < ids.length; i += 2) pairings.push([ids[i], ids[i + 1]]);

      const rows = await TournamentModel.createMatchesForRound(client, tournamentId, 1, pairings);
      await TournamentModel.setStatus(client, tournamentId, 'active', { current_round: 1 });
      return rows;
    });

    const events = await createRealMatchesForPairings(tournamentId, tmRows, 1);
    return { events };
  },

  /**
   * Called by the game socket layer right after a real match finishes. If that match belongs to
   * an active tournament bracket, records the result and progresses the bracket.
   */
  async recordMatchResult({ matchId, winnerId, loserId }) {
    const tm = await TournamentModel.findByMatchId(matchId);
    if (!tm) return { events: [] }; // not a tournament match — nothing to do

    await withTransaction(async (client) => {
      await TournamentModel.recordWinner(client, tm.id, winnerId);

      // The final round's loser becomes the runner-up and is rewarded in finishTournament();
      // every earlier round's loser is eliminated + rewarded immediately.
      if (tm.roundNumber < TOTAL_ROUNDS) {
        const { rows } = await client.query(`SELECT prize_coins AS "prizeCoins" FROM tournaments WHERE id = $1`, [
          tm.tournamentId,
        ]);
        const prizeCoins = Number(rows[0]?.prizeCoins || 0);
        const tier = tm.roundNumber === TOTAL_ROUNDS - 1 ? REWARDS.semifinal : REWARDS.quarterfinal;

        await TournamentModel.eliminateParticipant(client, tm.tournamentId, loserId, tm.roundNumber);
        await TournamentModel.awardParticipant(client, tm.tournamentId, loserId, {
          placement: null,
          status: 'eliminated',
          coins: Math.floor(prizeCoins * tier.coinPct),
          xp: tier.xp,
          rankPoints: tier.rankPoints,
        });
      }
    });

    const roundEvents = await this.processTournamentRound(tm.tournamentId);
    return { events: [{ type: 'bracket:updated', tournamentId: tm.tournamentId }, ...roundEvents.events] };
  },

  /**
   * processTournamentRound() — checks whether the current round is fully resolved; if so, either
   * advances to the next round (new pairings from the winners) or, if the final just finished,
   * hands off to finishTournament().
   */
  async processTournamentRound(tournamentId) {
    const outcome = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT current_round AS "currentRound", status FROM tournaments WHERE id = $1 FOR UPDATE`,
        [tournamentId]
      );
      const t = rows[0];
      if (!t || t.status !== 'active') return { kind: 'noop' };

      const roundMatches = await TournamentModel.roundMatches(client, tournamentId, t.currentRound);
      if (roundMatches.length === 0 || !roundMatches.every((m) => m.status === 'completed')) {
        return { kind: 'noop' };
      }

      const winners = roundMatches.sort((a, b) => a.bracketSlot - b.bracketSlot).map((m) => m.winnerId);

      if (winners.length === 1) {
        return { kind: 'finish' };
      }

      const nextRound = t.currentRound + 1;
      const pairings = [];
      for (let i = 0; i < winners.length; i += 2) pairings.push([winners[i], winners[i + 1]]);

      const tmRows = await TournamentModel.createMatchesForRound(client, tournamentId, nextRound, pairings);
      await TournamentModel.setStatus(client, tournamentId, 'active', { current_round: nextRound });
      return { kind: 'advance', tmRows, nextRound };
    });

    if (outcome.kind === 'noop') return { events: [] };

    if (outcome.kind === 'finish') {
      const result = await this.finishTournament(tournamentId);
      return {
        events: [{ type: 'finished', tournamentId, championId: result.championId, runnerUpId: result.runnerUpId }],
      };
    }

    const events = await createRealMatchesForPairings(tournamentId, outcome.tmRows, outcome.nextRound);
    events.push({ type: 'round:advanced', tournamentId, round: outcome.nextRound, roundName: ROUND_NAMES[outcome.nextRound] });
    return { events };
  },

  /** finishTournament() — crowns the champion, pays out final rewards, marks the tournament finished. */
  async finishTournament(tournamentId) {
    return withTransaction(async (client) => {
      const { rows: finalRows } = await client.query(
        `SELECT player1_id AS "player1Id", player2_id AS "player2Id", winner_id AS "winnerId"
         FROM tournament_matches
         WHERE tournament_id = $1
         ORDER BY round_number DESC
         LIMIT 1`,
        [tournamentId]
      );
      const final = finalRows[0];
      if (!final || !final.winnerId) throw errors.conflict('مسابقه نهایی هنوز تمام نشده است');

      const championId = final.winnerId;
      const runnerUpId = final.player1Id === championId ? final.player2Id : final.player1Id;

      const { rows: tRows } = await client.query(`SELECT prize_coins AS "prizeCoins" FROM tournaments WHERE id = $1`, [
        tournamentId,
      ]);
      const prizeCoins = Number(tRows[0]?.prizeCoins || 0);

      await TournamentModel.eliminateParticipant(client, tournamentId, runnerUpId, TOTAL_ROUNDS);
      await TournamentModel.awardParticipant(client, tournamentId, championId, {
        placement: 1,
        status: 'champion',
        coins: Math.floor(prizeCoins * REWARDS.champion.coinPct),
        xp: REWARDS.champion.xp,
        rankPoints: REWARDS.champion.rankPoints,
      });
      await TournamentModel.awardParticipant(client, tournamentId, runnerUpId, {
        placement: 2,
        status: 'eliminated',
        coins: Math.floor(prizeCoins * REWARDS.runnerUp.coinPct),
        xp: REWARDS.runnerUp.xp,
        rankPoints: REWARDS.runnerUp.rankPoints,
      });

      await client.query(
        `UPDATE tournaments SET status = 'completed', champion_id = $2, runner_up_id = $3, ends_at = now() WHERE id = $1`,
        [tournamentId, championId, runnerUpId]
      );

      return { championId, runnerUpId };
    });
  },

  async getById(tournamentId) {
    const tournament = await TournamentModel.getById(tournamentId);
    if (!tournament) throw errors.notFound('مسابقه یافت نشد');
    const bracket = await TournamentModel.fullBracket(tournamentId);
    const { rows: participants } = await query(
      `SELECT tp.user_id AS "userId", tp.seed, tp.status, tp.placement,
              tp.coins_awarded AS "coinsAwarded", tp.xp_awarded AS "xpAwarded",
              tp.rank_points_awarded AS "rankPointsAwarded",
              u.display_name AS "displayName", u.avatar_url AS "avatarUrl"
       FROM tournament_participants tp
       JOIN users u ON u.id = tp.user_id
       WHERE tp.tournament_id = $1
       ORDER BY tp.seed ASC`,
      [tournamentId]
    );
    return { ...tournament, participants, bracket };
  },

  async listOpenAndActive() {
    return TournamentModel.listOpenAndActive();
  },

  async myHistory(userId) {
    return TournamentModel.myHistory(userId);
  },
};
