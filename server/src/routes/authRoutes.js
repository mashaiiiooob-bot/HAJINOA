import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from '../controllers/AuthController.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../utils/validators/authValidators.js';
import { config } from '../config/index.js';

const router = Router();

// Tighter limiter on auth endpoints — these are the most common brute-force targets.
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'تلاش بیش از حد، کمی بعد دوباره امتحان کنید' } },
});

router.post('/register', authLimiter, validate(registerSchema), AuthController.register);
router.post('/login', authLimiter, validate(loginSchema), AuthController.login);
router.post('/refresh', AuthController.refresh);
router.post('/logout', AuthController.logout);

export default router;
