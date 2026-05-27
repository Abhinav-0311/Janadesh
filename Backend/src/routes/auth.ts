import { Router } from 'express';
import AuthController from '../controllers/AuthController';
import { authenticate, authRateLimit, requireVotingEligibility } from '../middleware/auth';

const router = Router();

// Public routes with rate limiting
router.post('/register', authRateLimit(3, 15 * 60 * 1000), AuthController.register);
router.post('/verify-email', authRateLimit(5, 15 * 60 * 1000), AuthController.verifyEmail);
router.post('/resend-verification', authRateLimit(5, 15 * 60 * 1000), AuthController.resendVerification);
router.post('/login', authRateLimit(5, 15 * 60 * 1000), AuthController.login);
router.post('/login/initiate', authRateLimit(5, 15 * 60 * 1000), AuthController.initiateLogin);
router.post('/login/complete', authRateLimit(5, 15 * 60 * 1000), AuthController.completeLogin);
router.post('/refresh-token', authRateLimit(10, 15 * 60 * 1000), AuthController.refreshToken);

// Protected routes
router.get('/profile', authenticate, AuthController.getProfile as any);
router.put('/profile', authenticate, AuthController.updateProfile as any);
router.get('/session', authenticate, AuthController.getSession as any);
router.post('/logout', authenticate, AuthController.logout as any);

// Voting-specific routes
router.post('/voting-access', authenticate, requireVotingEligibility, AuthController.generateVotingAccess as any);

export default router;
