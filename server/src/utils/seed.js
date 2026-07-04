import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/database.js';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEEDS_DIR = path.resolve(__dirname, '../../../database/seeds');

async function run() {
  const files = fs.readdirSync(SEEDS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(SEEDS_DIR, file), 'utf8');
    logger.info(`▶ seeding: ${file}`);
    await pool.query(sql);
  }
  logger.info('Seeding complete');
  await pool.end();
}

run().catch((err) => {
  logger.error({ err }, 'Seeding failed');
  process.exit(1);
});
