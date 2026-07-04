import { TournamentService } from '../services/TournamentService.js';
import { logger } from '../utils/logger.js';

/** Fans out TournamentService result events — shared with gameSocket's post-match hook. */
export function broadcastTournamentEvents(io, events) {
  for (const evt of events) {
    if (evt.type === 'match:ready') {
      for (const userId of evt.players) {
        io.to(`user:${userId}`).emit('tournament:match:ready', evt);
      }
      io.to(`tournament:${evt.tournamentId}`).emit('tournament:bracket:updated', evt);
    } else if (evt.type === 'round:advanced' || evt.type === 'bracket:updated') {
      io.to(`tournament:${evt.tournamentId}`).emit('tournament:bracket:updated', evt);
    } else if (evt.type === 'finished') {
      io.to(`tournament:${evt.tournamentId}`).emit('tournament:finished', evt);
      io.to(`user:${evt.championId}`).emit('tournament:finished', evt);
      if (evt.runnerUpId) io.to(`user:${evt.runnerUpId}`).emit('tournament:finished', evt);
    }
  }
}

export function registerTournamentEvents(io, socket) {
  socket.on('tournament:queue:join', async () => {
    try {
      const result = await TournamentService.joinTournament(socket.userId);
      socket.join(`tournament:${result.tournamentId}`);

      if (result.started) {
        broadcastTournamentEvents(io, result.events);
      } else {
        io.to(`tournament:${result.tournamentId}`).emit('tournament:queue:status', {
          tournamentId: result.tournamentId,
          seed: result.seed,
          playerCount: result.seed,
          maxPlayers: result.maxPlayers,
        });
        socket.emit('tournament:queue:joined', {
          tournamentId: result.tournamentId,
          seed: result.seed,
          maxPlayers: result.maxPlayers,
        });
      }
    } catch (err) {
      logger.warn({ err: err.message, userId: socket.userId }, 'tournament:queue:join failed');
      socket.emit('tournament:error', { message: err.message || 'خطا در پیوستن به مسابقه' });
    }
  });

  socket.on('tournament:queue:leave', async ({ tournamentId } = {}) => {
    if (!tournamentId) return;
    try {
      await TournamentService.leaveTournament(socket.userId, tournamentId);
      socket.leave(`tournament:${tournamentId}`);
      socket.emit('tournament:queue:left', { tournamentId });
    } catch (err) {
      socket.emit('tournament:error', { message: err.message || 'خطا در خروج از مسابقه' });
    }
  });

  /** Lets any client (participant or spectator) subscribe to live bracket updates for a tournament. */
  socket.on('tournament:watch', ({ tournamentId } = {}) => {
    if (!tournamentId) return;
    socket.join(`tournament:${tournamentId}`);
  });

  socket.on('tournament:unwatch', ({ tournamentId } = {}) => {
    if (!tournamentId) return;
    socket.leave(`tournament:${tournamentId}`);
  });
}
