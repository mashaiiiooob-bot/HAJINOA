import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: process.env.LOG_LEVEL || (config.isProd ? 'info' : 'debug'),
  redact: [
    'req.headers.authorization',
    'req.headers.cookie'
  ]
});
;
