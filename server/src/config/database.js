import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.db.connectionString,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  max: config.db.maxPoolSize,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  // Unexpected error on an idle client — log and let the process supervisor restart if fatal.
  logger.error({ err }, 'Unexpected Postgres pool error');
});

/**
 * Query helper with slow-query logging. Always prefer parameterized queries
 * ($1, $2, ...) — never interpolate user input into SQL strings.
 */
export async function query(text, params = []) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 200) {
    logger.warn({ text, duration }, 'Slow query');
  }
  return result;
}

/** Run a callback inside a transaction, rolling back on any thrown error. */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
