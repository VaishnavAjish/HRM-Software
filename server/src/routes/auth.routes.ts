import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { registerSchema, loginSchema, refreshTokenSchema, forgotPasswordSchema, resetPasswordSchema, verifyEmailSchema } from '../validators/auth.validator';
import * as authController from '../controllers/auth.controller';

const router = Router();

router.post('/register', validateBody(registerSchema), authController.register);
router.post('/login', validateBody(loginSchema), authController.login);
router.post('/refresh', validateBody(refreshTokenSchema), authController.refreshToken);
router.post('/logout', authenticate, authController.logout);
router.post('/forgot-password', validateBody(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validateBody(resetPasswordSchema), authController.resetPassword);
router.post('/verify-email', validateBody(verifyEmailSchema), authController.verifyEmail);
router.get('/me', authenticate, authController.getProfile);
router.put('/me', authenticate, authController.updateProfile);
router.put('/me/password', authenticate, authController.changePassword);
router.post('/me/2fa/enable', authenticate, authController.enable2FA);
router.post('/me/2fa/verify', authenticate, authController.verify2FA);
router.post('/me/2fa/disable', authenticate, authController.disable2FA);

export default router;