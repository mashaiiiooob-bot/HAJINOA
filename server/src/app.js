import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import matchRoutes from './routes/matchRoutes.js';
import healthRoutes from './routes/healthRoutes.js';

export function createApp() {
  const app = express();

  // Trust the first proxy (nginx) so req.ip / rate limiting see the real client IP.
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // NOTE: the client loads socket.io-client from a CDN (see client/index.html).
        // It must be allow-listed here or the script is silently blocked and every
        // realtime feature (matchmaking, live rounds, chat) breaks with no server-side
        // signal. Prefer self-hosting the socket.io client bundle in client/vendor/
        // and dropping this entry once that's set up — one less third-party origin
        // the CSP has to trust.
        scriptSrc: ["'self'", 'https://cdn.socket.io'],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", ...config.cors.origin],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use(cors({ origin: config.cors.origin, credentials: true }));
  app.use(compression());
  app.use(hpp()); // guards against HTTP parameter pollution
  app.use(express.json({ limit: '32kb' })); // small limit — this API has no large-body endpoints
  // express.json() throws a SyntaxError on malformed bodies; without this it falls through
  // to the generic error handler as a 500. Malformed client input is a 400, not a server fault.
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'بدنه درخواست نامعتبر است' } });
    }
    next(err);
  });
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  const globalLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', globalLimiter);

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/matches', matchRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
