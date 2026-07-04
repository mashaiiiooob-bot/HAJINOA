import { Router } from 'express';
import { pool } from '../config/database.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'unreachable' });
  }
});

export default router;
