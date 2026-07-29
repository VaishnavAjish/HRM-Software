import { Router } from 'express';
import { login, refresh, logout, me } from '../controllers/authController';
import { authenticateJWT } from '../middlewares/auth';
import { authRateLimiter } from '../middlewares/rateLimiter';
import { validate } from '../middlewares/validate';
import { loginValidator } from '../validators/auth.validators';

const router = Router();

router.post('/login', authRateLimiter, loginValidator, validate, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', authenticateJWT, me);

export default router;
