import { Router } from 'express';
import WebSocketController from '../controllers/WebSocketController';
import { authenticate, requireRoles } from '../middleware/auth';

const router = Router();

/**
 * @route GET /websocket/stats
 * @desc Get WebSocket connection statistics
 * @access Admin only
 */
router.get('/stats', authenticate, requireRoles(['admin']), WebSocketController.getStats);

/**
 * @route POST /websocket/notification
 * @desc Send notification to specific user
 * @access Authenticated users (can only send to themselves unless admin)
 */
router.post('/notification', authenticate, WebSocketController.sendNotification);

/**
 * @route POST /websocket/broadcast
 * @desc Broadcast notification to all users
 * @access Admin only
 */
router.post('/broadcast', authenticate, requireRoles(['admin']), WebSocketController.broadcastNotification);

/**
 * @route GET /websocket/token
 * @desc Get WebSocket connection token
 * @access Authenticated users
 */
router.get('/token', authenticate, WebSocketController.getConnectionToken);

export default router;