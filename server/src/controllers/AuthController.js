import { AuthService } from '../services/AuthService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { config } from '../config/index.js';

const REFRESH_COOKIE = 'refreshToken';

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
}

export const AuthController = {
  register: asyncHandler(async (req, res) => {
    const user = await AuthService.register(req.body);
    res.status(201).json({ data: user });
  }),

  login: asyncHandler(async (req, res) => {
    const { user, accessToken, refreshToken } = await AuthService.login({
      ...req.body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    setRefreshCookie(res, refreshToken);
    res.json({ data: { user, accessToken } });
  }),

  refresh: asyncHandler(async (req, res) => {
    const { accessToken, refreshToken } = await AuthService.refresh({
      refreshToken: req.cookies?.[REFRESH_COOKIE],
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    setRefreshCookie(res, refreshToken);
    res.json({ data: { accessToken } });
  }),

  logout: asyncHandler(async (req, res) => {
    await AuthService.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    res.status(204).send();
  }),
};
