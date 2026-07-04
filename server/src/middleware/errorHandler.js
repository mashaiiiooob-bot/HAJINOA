import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/** Wraps async route handlers so rejected promises reach the error middleware. */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'مسیر مورد نظر یافت نشد' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const isOperational = err.isOperational === true;
  const statusCode = err.statusCode || 500;

  if (!isOperational) {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  } else {
    logger.warn({ code: err.code, path: req.path }, err.message);
  }

  res.status(statusCode).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: isOperational ? err.message : 'خطای داخلی سرور رخ داده است',
      ...(config.isProd ? {} : { stack: err.stack }),
    },
  });
}
