import { Request, Response } from 'express';
import authService from '../services/AuthService';
import Joi from 'joi';
import { ValidationError } from '../types';
import { AuthenticatedRequest } from '../middleware/auth';
import TokenBlacklistRepository from '../repositories/TokenBlacklistRepository';
import RefreshTokenRepository from '../repositories/RefreshTokenRepository';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Helper function to map error names to error codes
const getErrorCode = (errorName: string): string => {
  const errorMap: { [key: string]: string } = {
    'ValidationError': 'VALIDATION_ERROR',
    'ConflictError': 'CONFLICT',
    'UnauthorizedError': 'UNAUTHORIZED',
    'ForbiddenError': 'FORBIDDEN',
    'NotFoundError': 'NOT_FOUND'
  };
  return errorMap[errorName] || 'INTERNAL_ERROR';
};

interface LoginCredentials {
  email?: string;
  registrationNumber?: string;
  walletAddress?: string;
  otpToken?: string;
}

interface RegisterData {
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  walletAddress?: string;
  registrationNumber?: string;
  role?: 'voter' | 'admin' | 'creator';
}

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = Joi.object({
      email: Joi.string().email({ tlds: { allow: false } }).required(),
      username: Joi.string().min(3).max(50).required(),
      firstName: Joi.string().max(100).optional(),
      lastName: Joi.string().max(100).optional(),
      walletAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional(),
      registrationNumber: Joi.string().min(6).max(50).optional(),
      role: Joi.string().valid('voter', 'admin', 'creator').default('voter')
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }

    const result = await authService.register(value as RegisterData);

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email for verification.',
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          username: result.user.username,
          registrationNumber: result.user.registration_number,
          isVerified: result.user.is_verified,
          role: result.user.role
        },
        verificationRequired: result.verificationRequired
      }
    });
  } catch (error: any) {
    console.error('Registration controller error:', error.message);
    const errorCode = error.name === 'ValidationError' ? 'VALIDATION_ERROR' :
      error.name === 'ConflictError' ? 'CONFLICT' :
        error.name === 'UnauthorizedError' ? 'UNAUTHORIZED' :
          error.name === 'ForbiddenError' ? 'FORBIDDEN' :
            error.name || 'INTERNAL_ERROR';

    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: errorCode,
        message: error.message || 'Internal server error'
      }
    });
  }
};

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = Joi.object({
      token: Joi.string().required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }

    const result = await authService.verifyEmail(value.token);

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          isVerified: result.user.is_verified,
          isEmailVerified: result.user.is_email_verified
        }
      }
    });
  } catch (error: any) {
    console.error('Email verification controller error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: getErrorCode(error.name),
        message: error.message || 'Internal server error'
      }
    });
  }
};

export const resendVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = Joi.object({
      email: Joi.string().email({ tlds: { allow: false } }).required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }

    const result = await authService.resendEmailVerification(value.email);

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        email: value.email
      }
    });
  } catch (error: any) {
    console.error('Resend verification controller error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: getErrorCode(error.name),
        message: error.message || 'Internal server error'
      }
    });
  }
};

export const initiateLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = Joi.object({
      email: Joi.string().email({ tlds: { allow: false } }).optional(),
      registrationNumber: Joi.string().optional(),
      walletAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional()
    }).or('email', 'registrationNumber', 'walletAddress');

    const { error, value } = schema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }

    const result = await authService.initiateLogin(value as LoginCredentials);

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        requiresOtp: result.requiresOtp,
        userId: result.userId
      }
    });
  } catch (error: any) {
    console.error('Login initiation controller error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: getErrorCode(error.name),
        message: error.message || 'Internal server error'
      }
    });
  }
};

export const completeLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = Joi.object({
      email: Joi.string().email({ tlds: { allow: false } }).optional(),
      registrationNumber: Joi.string().optional(),
      walletAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional(),
      otpToken: Joi.string().required()
    }).or('email', 'registrationNumber', 'walletAddress');

    const { error, value } = schema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }

    const result = await authService.completeLogin(value as LoginCredentials);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          username: result.user.username,
          role: result.user.role,
          voterStatus: result.user.voter_status,
          isVerified: result.user.is_verified
        },
        tokens: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn
        }
      }
    });
  } catch (error: any) {
    console.error('Login completion controller error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: getErrorCode(error.name),
        message: error.message || 'Internal server error'
      }
    });
  }
};

/**
 * Backward-compatible login endpoint.
 * - Without otpToken: initiates login flow (OTP required)
 * - With otpToken: completes login flow and returns tokens
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const hasOtpToken = typeof req.body?.otpToken === 'string' && req.body.otpToken.length > 0;

    if (hasOtpToken) {
      await completeLogin(req, res);
      return;
    }

    await initiateLogin(req, res);
  } catch (error: any) {
    console.error('Login controller error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: getErrorCode(error.name),
        message: error.message || 'Internal server error'
      }
    });
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const schema = Joi.object({
      refreshToken: Joi.string().required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }

    const result = await authService.refreshToken(value.refreshToken);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        tokens: result
      }
    });
  } catch (error: any) {
    console.error('Token refresh controller error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: getErrorCode(error.name),
        message: error.message || 'Internal server error'
      }
    });
  }
};

export const getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const authUser = req.user;
    if (!authUser) {
      const error = new ValidationError('User not found in request');
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      return;
    }

    // Fetch full user details from database
    const UserRepository = require('../repositories/UserRepository').default;
    const user = await UserRepository.findById(authUser.userId);

    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found'
        }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          walletAddress: user.wallet_address,
          role: user.role,
          voterStatus: user.voter_status,
          isVerified: user.is_verified,
          isEmailVerified: user.is_email_verified
        },
        authStatus: {
          isAuthenticated: true,
          isVerified: user.is_verified,
          isEmailVerified: user.is_email_verified,
          role: user.role
        }
      }
    });
  } catch (error: any) {
    console.error('Get profile controller error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: getErrorCode(error.name),
        message: error.message || 'Internal server error'
      }
    });
  }
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const authUser = req.user;
    if (!authUser) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      return;
    }

    const updates = req.body;

    // Prevent role modification by non-admin users
    if (updates.role && authUser.role !== 'admin') {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot modify role'
        }
      });
      return;
    }

    // For now, just return success without actually updating
    // In a real implementation, you would update the user in the database
    res.status(200).json({
      success: true,
      data: { message: 'Profile updated successfully' }
    });
  } catch (error: any) {
    console.error('Update profile controller error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: getErrorCode(error.name),
        message: error.message || 'Internal server error'
      }
    });
  }
};

export const generateVotingAccess = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const schema = Joi.object({
      electionId: Joi.string().uuid().required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }

    const user = req.user;
    if (!user) {
      throw new Error('User not found in request');
    }

    const result = await authService.generateVotingAccessToken(user.userId, value.electionId);

    res.status(200).json({
      success: true,
      message: 'Voting access token generated successfully',
      data: {
        votingToken: result.votingToken,
        expiresIn: result.expiresIn
      }
    });
  } catch (error: any) {
    console.error('Voting access controller error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: getErrorCode(error.name),
        message: error.message || 'Internal server error'
      }
    });
  }
};

export const getSession = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      return;
    }

    const session = {
      userId: user.userId,
      role: user.role,
      isVerified: user.isVerified,
      isEmailVerified: user.isEmailVerified,
      voterStatus: user.voterStatus,
      active: true,
      lastActivity: new Date()
    };

    res.status(200).json({
      success: true,
      data: { session }
    });
  } catch (error: any) {
    console.error('Get session controller error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: getErrorCode(error.name),
        message: error.message || 'Internal server error'
      }
    });
  }
};

export const logout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      return;
    }

    // Get the access token from the request
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // Decode token to get expiration
      const decoded = jwt.decode(token) as any;
      if (decoded && decoded.exp) {
        const expiresAt = new Date(decoded.exp * 1000);
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        // Add token to blacklist
        await TokenBlacklistRepository.add(tokenHash, user.userId, expiresAt);
      }
    }

    // Delete all refresh tokens for this user
    await RefreshTokenRepository.deleteByUserId(user.userId);

    res.status(200).json({
      success: true,
      data: { message: 'Logged out successfully' }
    });
  } catch (error: any) {
    console.error('Logout controller error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: getErrorCode(error.name),
        message: error.message || 'Internal server error'
      }
    });
  }
};

export default {
  register,
  verifyEmail,
  resendVerification,
  login,
  initiateLogin,
  completeLogin,
  refreshToken,
  getProfile,
  updateProfile,
  generateVotingAccess,
  getSession,
  logout
};
