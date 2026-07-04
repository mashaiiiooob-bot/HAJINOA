import 'dotenv/config';

/**
 * Centralized, validated runtime configuration.
 * Never read process.env outside this file — keeps secrets auditable
 * and makes missing-config failures happen at boot, not mid-request.
 */
function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const isProd = (process.env.NODE_ENV || 'development') === 'production';

/** Secrets that must never silently fall back to a dev default in production. */
function requiredSecret(name, devFallback) {
  const value = process.env[name];
  if (isProd && (!value || value === devFallback)) {
    throw new Error(
      `${name} must be set to a strong, unique value in production (got missing/dev-default). ` +
      `Generate one with: openssl rand -hex 32`
    );
  }
  return value ?? devFallback;
}

export const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),

  db: {
    connectionString: required('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/dast_ya_khali'),
    ssl: process.env.DB_SSL === 'true',
    maxPoolSize: Number(process.env.DB_POOL_MAX || 20),
  },

  auth: {
    accessTokenSecret: requiredSecret('JWT_ACCESS_SECRET', 'dev-only-access-secret-change-me'),
    refreshTokenSecret: requiredSecret('JWT_REFRESH_SECRET', 'dev-only-refresh-secret-change-me'),
    accessTokenTtl: '15m',
    refreshTokenTtl: '30d',
    bcryptRounds: 12,
  },

  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX || 300),
    authMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  },

  isProd,
});
