import { Request, Response, NextFunction } from 'express';
import authService from '../services/AuthService';
import { UnauthorizedError, ForbiddenError } from '../types';
import logger from '../utils/logger';
import TokenBlacklistRepository from '../repositories/TokenBlacklistRepository';
import crypto from 'crypto';

export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    walletAddress: string;
    role: string;
    voterStatus: string;
    isVerified: boolean;
    isEmailVerified: boolean;
    email?: string;
    username?: string;
  };
}

// Helper type for route handlers that require authentication
export type AuthenticatedRequestHandler = (req: AuthenticatedRequest, res: Response, next?: NextFunction) => Promise<void> | void;

/**
 * Middleware to authenticate JWT tokens
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token required');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Check if token is blacklisted
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const isBlacklisted = await TokenBlacklistRepository.isBlacklisted(tokenHash);
    if (isBlacklisted) {
      throw new UnauthorizedError('Token has been revoked');
    }

    const payload = await authService.verifyAccessToken(token);

    // Attach user info to request
    (req as AuthenticatedRequest).user = {
      userId: payload.userId,
      walletAddress: payload.walletAddress,
      role: payload.role,
      voterStatus: payload.voterStatus,
      isVerified: payload.isVerified || false,
      isEmailVerified: payload.isEmailVerified || false
    };

    next();
  } catch (error) {
    logger.error('Authentication error:', error);

    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: 'Authentication failed'
        },
        timestamp: new Date().toISOString()
      });
    }
  }
};

/**
 * Middleware to check if user has required roles
 */
export const requireRoles = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const user = (req as AuthenticatedRequest).user;

      if (!user) {
        throw new UnauthorizedError('Authentication required');
      }

      if (!authService.hasRole(user.role, roles)) {
        throw new ForbiddenError(`Access denied. Required roles: ${roles.join(', ')}`);
      }

      next();
    } catch (error) {
      logger.error('Authorization error:', error);

      if (error instanceof ForbiddenError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'Access denied'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  };
};

/**
 * Alias for requireRoles for backward compatibility
 */
export const requireRole = requireRoles;

/**
 * Middleware to check if user can perform specific action
 */
export const requireAction = (action: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const user = (req as AuthenticatedRequest).user;

      if (!user) {
        throw new UnauthorizedError('Authentication required');
      }

      if (!authService.canPerformAction(user.role, action)) {
        throw new ForbiddenError(`Access denied. Cannot perform action: ${action}`);
      }

      next();
    } catch (error) {
      logger.error('Action authorization error:', error);

      if (error instanceof ForbiddenError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACTION_DENIED',
            message: 'Action not permitted'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  };
};

/**
 * Middleware to check if user is eligible to vote
 */
export const requireVotingEligibility = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (user.voterStatus !== 'eligible') {
      throw new ForbiddenError(`Voting not allowed. Status: ${user.voterStatus}`);
    }

    next();
  } catch (error) {
    logger.error('Voting eligibility error:', error);

    if (error instanceof ForbiddenError) {
      res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(403).json({
        success: false,
        error: {
          code: 'VOTING_NOT_ALLOWED',
          message: 'Voting not allowed'
        },
        timestamp: new Date().toISOString()
      });
    }
  }
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = await authService.verifyAccessToken(token);

      (req as AuthenticatedRequest).user = {
        userId: payload.userId,
        walletAddress: payload.walletAddress,
        role: payload.role,
        voterStatus: payload.voterStatus,
        isVerified: payload.isVerified || false,
        isEmailVerified: payload.isEmailVerified || false
      };
    }

    next();
  } catch (error) {
    // For optional auth, we don't fail on invalid tokens
    logger.warn('Optional authentication failed:', error);
    next();
  }
};

/**
 * Middleware to check if user owns resource or has admin privileges
 */
export const requireOwnershipOrAdmin = (userIdField: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const user = (req as AuthenticatedRequest).user;

      if (!user) {
        throw new UnauthorizedError('Authentication required');
      }

      const resourceUserId = req.params[userIdField] || req.body[userIdField];

      // Allow if user is admin or owns the resource
      if (user.role === 'admin' || user.userId === resourceUserId) {
        next();
        return;
      }

      throw new ForbiddenError('Access denied. You can only access your own resources.');
    } catch (error) {
      logger.error('Ownership authorization error:', error);

      if (error instanceof ForbiddenError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'Access denied'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  };
};

/**
 * Rate limiting middleware for authentication endpoints
 */
export const authRateLimit = (maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) => {
  const attempts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip rate limiting in test environment
    if (process.env.NODE_ENV === 'test') {
      next();
      return;
    }

    const clientId = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    const clientAttempts = attempts.get(clientId);

    if (clientAttempts) {
      if (now > clientAttempts.resetTime) {
        // Reset window
        attempts.set(clientId, { count: 1, resetTime: now + windowMs });
      } else if (clientAttempts.count >= maxAttempts) {
        // Rate limit exceeded
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many authentication attempts. Please try again later.'
          },
          timestamp: new Date().toISOString()
        });
        return;
      } else {
        // Increment attempts
        clientAttempts.count++;
      }
    } else {
      // First attempt
      attempts.set(clientId, { count: 1, resetTime: now + windowMs });
    }

    next();
  };
};