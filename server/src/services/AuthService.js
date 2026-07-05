import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { query } from '../config/database.js';
import { UserModel } from '../models/UserModel.js';
import { errors } from '../utils/AppError.js';

const RESERVED_USERNAMES = new Set(['admin', 'root', 'system', 'support', 'moderator']);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.auth.accessTokenSecret, {
    expiresIn: config.auth.accessTokenTtl,
  });
}

function signRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

export const AuthService = {
  async register({ username, email, password, displayName }) {
    if (RESERVED_USERNAMES.has(username.toLowerCase())) {
      throw errors.conflict('این نام کاربری قابل استفاده نیست');
    }
    const exists = await UserModel.existsByEmailOrUsername(email, username);
    if (exists) throw errors.conflict('این ایمیل یا نام کاربری قبلاً ثبت شده است');

    const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);
    const user = await UserModel.create({ username, email, passwordHash, displayName: displayName || username });
    return user;
  },

  async login({ identifier, password, ipAddress, userAgent }) {
    const account = await UserModel.findByEmailOrUsername(identifier);
    // Constant-shape response whether or not the account exists, to avoid user enumeration.
    const dummyHash = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8gW4sV0r3I9b4MZsRvSp2vWdL5h5Ny';
    const matches = await bcrypt.compare(password, account?.passwordHash || dummyHash);

    if (!account || !matches) throw errors.unauthorized('ایمیل/نام کاربری یا رمز عبور اشتباه است');
    if (account.status !== 'active') throw errors.forbidden('این حساب کاربری مسدود شده است');

    const user = await UserModel.findById(account.id);
    const accessToken = signAccessToken(account);
    const refreshToken = signRefreshToken();

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '30 days')`,
      [account.id, hashToken(refreshToken), userAgent || null, ipAddress || null]
    );
    await UserModel.touchLastSeen(account.id);

    return { user, accessToken, refreshToken };
  },

  async refresh({ refreshToken, ipAddress, userAgent }) {
    if (!refreshToken) throw errors.unauthorized();
    const tokenHash = hashToken(refreshToken);

    const { rows } = await query(
      `SELECT rt.id, rt.user_id, u.role, u.status
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > now()`,
      [tokenHash]
    );
    const record = rows[0];
    if (!record || record.status !== 'active') throw errors.unauthorized('نشست نامعتبر است، دوباره وارد شوید');

    // Rotate: revoke old, issue new (prevents replay of stolen refresh tokens).
    const newRefreshToken = signRefreshToken();
    await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [record.id]);
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '30 days')`,
      [record.user_id, hashToken(newRefreshToken), userAgent || null, ipAddress || null]
    );

    const accessToken = signAccessToken({ id: record.user_id, role: record.role });
    return { accessToken, refreshToken: newRefreshToken };
  },

  async logout(refreshToken) {
    if (!refreshToken) return;
    await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`, [hashToken(refreshToken)]);
  },
};
