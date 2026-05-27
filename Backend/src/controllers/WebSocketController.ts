import { Request, Response } from 'express';
import WebSocketManager from '../services/WebSocketManager';
import { AuthenticatedRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { ValidationError } from '../types';
import Joi from 'joi';

export class WebSocketController {

  /**
   * Get WebSocket connection statistics
   */
  public async getStats(req: Request, res: Response): Promise<void> {
    try {
      const wsManager = WebSocketManager.getInstance();
      const stats = wsManager.getStats();

      if (!stats) {
        res.status(503).json({
          success: false,
          error: {
            code: 'WEBSOCKET_NOT_INITIALIZED',
            message: 'WebSocket service is not initialized'
          },
          timestamp: new Date().toISOString()
        });
        return;
      }

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Error getting WebSocket stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get WebSocket statistics'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Send system notification to specific user
   */
  public async sendNotification(req: Request, res: Response): Promise<void> {
    try {
      const schema = Joi.object({
        userId: Joi.string().uuid().required(),
        type: Joi.string().valid('info', 'warning', 'error', 'success').required(),
        message: Joi.string().min(1).max(500).required(),
        title: Joi.string().max(100).optional(),
        persistent: Joi.boolean().optional()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      const { userId, type, message, title, persistent } = value;
      const user = (req as AuthenticatedRequest).user;

      // Check if user has permission to send notifications
      if (user.role !== 'admin' && user.userId !== userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'You can only send notifications to yourself'
          },
          timestamp: new Date().toISOString()
        });
        return;
      }

      const wsManager = WebSocketManager.getInstance();
      wsManager.sendSystemNotification(userId, {
        type,
        message,
        title,
        persistent
      });

      res.json({
        success: true,
        data: {
          message: 'Notification sent successfully',
          userId,
          type
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Error sending notification:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to send notification'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Broadcast system notification to all users
   */
  public async broadcastNotification(req: Request, res: Response): Promise<void> {
    try {
      const schema = Joi.object({
        type: Joi.string().valid('info', 'warning', 'error', 'success').required(),
        message: Joi.string().min(1).max(500).required(),
        title: Joi.string().max(100).optional(),
        persistent: Joi.boolean().optional()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      const { type, message, title, persistent } = value;

      const wsManager = WebSocketManager.getInstance();
      wsManager.broadcastSystemNotification({
        type,
        message,
        title,
        persistent
      });

      res.json({
        success: true,
        data: {
          message: 'Notification broadcasted successfully',
          type
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Error broadcasting notification:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to broadcast notification'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Get WebSocket connection token for authenticated user
   */
  public async getConnectionToken(req: Request, res: Response): Promise<void> {
    try {
      // Return the user's current JWT token for WebSocket connection
      // The token is already validated by the auth middleware
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: {
            code: 'NO_TOKEN',
            message: 'No authentication token found'
          },
          timestamp: new Date().toISOString()
        });
        return;
      }

      const token = authHeader.substring(7);
      const user = (req as AuthenticatedRequest).user;

      res.json({
        success: true,
        data: {
          token,
          wsUrl: `ws://localhost:${process.env.WS_PORT || 3002}?token=${token}`,
          userId: user.userId
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Error getting connection token:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get connection token'
        },
        timestamp: new Date().toISOString()
      });
    }
  }
}

export default new WebSocketController();