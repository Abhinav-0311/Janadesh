import { Router } from 'express';
import UserController from '../controllers/UserController';
import { authenticate, requireRoles, requireOwnershipOrAdmin } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Admin-only routes
router.get('/', requireRoles(['admin']), UserController.getAllUsers);
router.get('/stats', requireRoles(['admin']), UserController.getUserStats);
router.put('/:userId/voter-status', requireRoles(['admin']), UserController.updateVoterStatus);
router.post('/:userId/reset-attempts', requireRoles(['admin']), UserController.resetFailedAttempts);

// User can access their own profile, admin can access any
router.get('/profile', UserController.getProfile.bind(UserController) as any);
router.put('/profile', UserController.updateProfile.bind(UserController) as any);
router.get('/:userId', requireOwnershipOrAdmin('userId'), UserController.getUserById);
router.put('/:userId', requireRoles(['admin']), UserController.updateUser);
router.delete('/:userId', requireRoles(['admin']), UserController.deleteUser);
router.post('/:userId/verify', requireRoles(['admin']), UserController.verifyUser);

export default router;
