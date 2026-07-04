import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { errors } from '../utils/AppError.js';

/** Requires a valid access token; attaches { id, role } to req.user. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.accessToken;

  if (!token) return next(errors.unauthorized('وارد حساب کاربری خود شوید'));

  try {
    const payload = jwt.verify(token, config.auth.accessTokenSecret);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(errors.unauthorized('نشست شما منقضی شده است'));
  }
}

/** Role gate — use after requireAuth. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(errors.forbidden());
    }
    next();
  };
}

/** Attaches req.user if a valid token is present, but never rejects. Useful for optional-auth routes. */
export function attachUserIfPresent(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.accessToken;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.auth.accessTokenSecret);
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    /* ignore invalid/expired token on optional routes */
  }
  next();
}
