import { MatchService } from '../services/MatchService.js';
import { logger } from '../utils/logger.js';

const activeMatches = new Map(); // matchId -> { scores: { [userId]: number }, round, locked }

export function registerGameEvents(io, socket) {
  socket.on('match:round:play', async ({ matchId, guess }) => {
    if (!matchId || !['left', 'right'].includes(guess)) return;

    let state = activeMatches.get(matchId);
    if (!state) {
      state = { scores: {}, round: 1, locked: false, picks: {} };
      activeMatches.set(matchId, state);
    }
    if (state.locked) return; // ignore late/duplicate submissions

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
      const { hidden, correctness } = await MatchService.playRound({
        matchId,
        picks: state.picks,
        roundNumber: state.round,
      });

      const results = {};
      for (const [uid, correct] of Object.entries(correctness)) {
        results[uid] = correct;
        state.scores[uid] = (state.scores[uid] || 0) + (correct ? 1 : 0);
      }

      io.to(`match:${matchId}`).emit('match:round:result', {
        round: state.round,
        hidden,
        results,
        scores: state.scores,
      });

      const winnerEntry = Object.entries(state.scores).find(([, s]) => s >= MatchService.ROUNDS_TO_WIN);
      if (winnerEntry) {
        const [winnerId] = winnerEntry;
        const [loserId] = Object.keys(state.scores).filter((id) => id !== winnerId);
        const { coinGain, xpGain } = await MatchService.finishMatch({
          matchId,
          winnerId,
          loserId,
          isRanked: true,
          winnerStreak: state.scores[winnerId],
        });
        io.to(`match:${matchId}`).emit('match:finished', { winnerId, coinGain, xpGain, scores: state.scores });
        activeMatches.delete(matchId);
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
