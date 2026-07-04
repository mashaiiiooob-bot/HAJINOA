import { MatchService } from '../services/MatchService.js';
import { TournamentService } from '../services/TournamentService.js';
import { broadcastTournamentEvents } from './tournamentSocket.js';
import { logger } from '../utils/logger.js';

const activeMatches = new Map(); // matchId -> { scores, round, locked, picks, modeCode }

const MOVES_BY_MODE = {
  rps: ['rock', 'paper', 'scissors'],
};
const DEFAULT_MOVES = ['left', 'right']; // the original hand-guessing game, and any future mode that doesn't opt in above

export function registerGameEvents(io, socket) {
  socket.on('match:round:play', async ({ matchId, guess }) => {
    if (!matchId) return;

    let state = activeMatches.get(matchId);
    if (!state) {
      state = { scores: {}, round: 1, locked: false, picks: {}, modeCode: null };
      activeMatches.set(matchId, state);
    }
    if (state.locked) return; // ignore late/duplicate submissions

    if (!state.modeCode) {
      state.modeCode = (await MatchService.getMatchModeCode(matchId)) || 'classic';
    }
    const isRps = state.modeCode === 'rps';
    const validMoves = MOVES_BY_MODE[state.modeCode] || DEFAULT_MOVES;
    if (!validMoves.includes(guess)) return;

    state.picks[socket.userId] = guess;

    // Wait until both participants have submitted for this round before resolving.
    const room = io.sockets.adapter.rooms.get(`match:${matchId}`);
    const expectedPlayers = room ? room.size : 2;
    if (Object.keys(state.picks).length < expectedPlayers) {
      socket.to(`match:${matchId}`).emit('match:round:waiting', { round: state.round });
      return;
    }

    state.locked = true;
    try {
      let resultPayload;
      let scoredUserIds; // user ids that "won" this round, for score-keeping

      if (isRps) {
        const { moves, results } = await MatchService.playRpsRound({
          matchId,
          picks: state.picks,
          roundNumber: state.round,
        });
        scoredUserIds = Object.entries(results)
          .filter(([, r]) => r === 'win')
          .map(([uid]) => uid);
        resultPayload = { round: state.round, moves, results, mode: 'rps' };
      } else {
        const { hidden, correctness } = await MatchService.playRound({
          matchId,
          picks: state.picks,
          roundNumber: state.round,
        });
        scoredUserIds = Object.entries(correctness)
          .filter(([, correct]) => correct)
          .map(([uid]) => uid);
        resultPayload = { round: state.round, hidden, results: correctness, mode: state.modeCode };
      }

      for (const uid of scoredUserIds) {
        state.scores[uid] = (state.scores[uid] || 0) + 1;
      }

      io.to(`match:${matchId}`).emit('match:round:result', { ...resultPayload, scores: state.scores });

      const winnerEntry = Object.entries(state.scores).find(([, s]) => s >= MatchService.ROUNDS_TO_WIN);
      if (winnerEntry) {
        const [winnerId] = winnerEntry;
        const [loserId] = Object.keys(state.picks).filter((id) => id !== winnerId);
        const { coinGain, xpGain } = await MatchService.finishMatch({
          matchId,
          winnerId,
          loserId,
          isRanked: true,
          winnerStreak: state.scores[winnerId],
        });
        io.to(`match:${matchId}`).emit('match:finished', { winnerId, coinGain, xpGain, scores: state.scores });
        activeMatches.delete(matchId);

        // No-op for regular casual/ranked matches — resolves instantly if this match isn't part of a bracket.
        try {
          const { events } = await TournamentService.recordMatchResult({ matchId, winnerId, loserId });
          broadcastTournamentEvents(io, events);
        } catch (err) {
          logger.error({ err, matchId }, 'Failed to progress tournament bracket');
        }
      } else {
        state.round += 1;
        state.picks = {};
        state.locked = false;
      }
    } catch (err) {
      logger.error({ err, matchId }, 'Failed to resolve round');
      io.to(`match:${matchId}`).emit('match:error', { message: 'خطا در پردازش راند' });
      state.locked = false;
    }
  });
}
