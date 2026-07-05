import http from 'node:http';
import { createApp } from './app.js';
import { createSocketServer } from './sockets/index.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { pool } from './config/database.js';

const app = createApp();
const httpServer = http.createServer(app);
createSocketServer(httpServer);

const server = httpServer.listen(config.port, () => {
  logger.info(`🚀 API listening on :${config.port} [${config.env}]`);
});

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await pool.end();
    logger.info('Shutdown complete');
    process.exit(0);
  });
  // Force-exit if connections don't drain in time.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
