import { Request, Response } from 'express';
import UserRepository from '../repositories/UserRepository';
import authService from '../services/AuthService';
import { AuthenticatedRequest } from '../middleware/auth';
import { ValidationError, NotFoundError, ForbiddenError } from '../types';
import logger from '../utils/logger';
import Joi from 'joi';

export class UserController {
  /**
   * Get all users (admin only)
   */
  async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        role: Joi.string().valid('voter', 'creator', 'admin').optional(),
        voterStatus: Joi.string().valid('eligible', 'voted', 'locked_out', 'suspended').optional(),
        isVerified: Joi.boolean().optional(),
        search: Joi.string().max(100).optional()
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      // Get all users as array for filtering
      // Use a large limit to get all users for now
      const paginatedResult = await UserRepository.findAll({ page: 1, limit: 10000 });
      const allUsers = paginatedResult.data;

      // Filter users based on query parameters
      let filteredUsers = allUsers;

      if (value.role) {
        filteredUsers = filteredUsers.filter(user => user.role === value.role);
      }

      if (value.voterStatus) {
        filteredUsers = filteredUsers.filter(user => user.voter_status === value.voterStatus);
      }

      if (value.isVerified !== undefined) {
        filteredUsers = filteredUsers.filter(user => user.is_verified === value.isVerified);
      }

      if (value.search) {
        const searchTerm = value.search.toLowerCase();
        filteredUsers = filteredUsers.filter(user =>
          user.username.toLowerCase().includes(searchTerm) ||
          user.email.toLowerCase().includes(searchTerm) ||
          user.registration_number.toLowerCase().includes(searchTerm)
        );
      }

      // Implement pagination
      const startIndex = (value.page - 1) * value.limit;
      const endIndex = startIndex + value.limit;
      const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: {
          users: paginatedUsers.map(user => ({
            id: user.id,
            email: user.email,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
            registrationNumber: user.registration_number,
            role: user.role,
            voterStatus: user.voter_status,
            isVerified: user.is_verified,
            isEmailVerified: user.is_email_verified,
            lastLogin: user.last_login,
            failedLoginAttempts: user.failed_login_attempts,
            lockedUntil: user.locked_until,
            createdAt: user.created_at
          })),
          pagination: {
            page: value.page,
            limit: value.limit,
            total: filteredUsers.length,
            totalPages: Math.ceil(filteredUsers.length / value.limit),
            hasNext: endIndex < filteredUsers.length,
            hasPrev: value.page > 1
          }
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Users list retrieved by admin`);
    } catch (error) {
      logger.error('Get all users controller error:', error);

      if (error instanceof ValidationError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'USERS_FETCH_FAILED',
            message: 'Failed to fetch users'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(req: Request, res: Response): Promise<void> {
    try {
      const schema = Joi.object({
        userId: Joi.string().uuid().required()
      });

      const { error, value } = schema.validate(req.params);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      const user = await UserRepository.findById(value.userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
            registrationNumber: user.registration_number,
            role: user.role,
            voterStatus: user.voter_status,
            walletAddress: user.wallet_address,
            isVerified: user.is_verified,
            isEmailVerified: user.is_email_verified,
            lastLogin: user.last_login,
            failedLoginAttempts: user.failed_login_attempts,
            lockedUntil: user.locked_until,
            createdAt: user.created_at,
            updatedAt: user.updated_at
          }
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`User details retrieved: ${user.id}`);
    } catch (error) {
      logger.error('Get user by ID controller error:', error);

      if (error instanceof ValidationError || error instanceof NotFoundError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'USER_FETCH_FAILED',
            message: 'Failed to fetch user'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Update user profile
   */
  async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const currentUser = (req as AuthenticatedRequest).user;
      const schema = Joi.object({
        userId: Joi.string().uuid().required()
      });

      const paramsValidation = schema.validate(req.params);
      if (paramsValidation.error) {
        throw new ValidationError(paramsValidation.error.details[0].message);
      }

      const { userId } = paramsValidation.value;

      // Route is admin-only, keep a defensive check for direct invocation.
      if (currentUser.role !== 'admin') {
        throw new ForbiddenError('Only administrators can update users');
      }

      const updateSchema = Joi.object({
        firstName: Joi.string().min(1).max(50).optional(),
        lastName: Joi.string().min(1).max(50).optional(),
        username: Joi.string().alphanum().min(3).max(30).optional(),
        walletAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional(),
        role: Joi.string().valid('voter', 'creator', 'admin').optional(),
        voterStatus: Joi.string().valid('eligible', 'voted', 'locked_out', 'suspended').optional(),
        isVerified: Joi.boolean().optional(),
        isEmailVerified: Joi.boolean().optional()
      }).unknown(false);

      const { error, value } = updateSchema.validate(req.body);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      // Check if username is already taken
      if (value.username) {
        const existingUser = await UserRepository.findByUsername(value.username);
        if (existingUser && existingUser.id !== userId) {
          throw new ValidationError('Username already taken');
        }
      }

      // Check if wallet address is already taken
      if (value.walletAddress) {
        const existingUser = await UserRepository.findByWalletAddress(value.walletAddress);
        if (existingUser && existingUser.id !== userId) {
          throw new ValidationError('Wallet address already registered');
        }
      }

      const updateData: any = {};
      if (typeof value.firstName !== 'undefined') updateData.first_name = value.firstName;
      if (typeof value.lastName !== 'undefined') updateData.last_name = value.lastName;
      if (typeof value.username !== 'undefined') updateData.username = value.username;
      if (typeof value.walletAddress !== 'undefined') updateData.wallet_address = value.walletAddress;
      if (typeof value.role !== 'undefined') updateData.role = value.role;
      if (typeof value.voterStatus !== 'undefined') updateData.voter_status = value.voterStatus;
      if (typeof value.isVerified !== 'undefined') updateData.is_verified = value.isVerified;
      if (typeof value.isEmailVerified !== 'undefined') updateData.is_email_verified = value.isEmailVerified;

      const updatedUser = await UserRepository.update(userId, updateData);

      if (!updatedUser) {
        throw new NotFoundError('User not found');
      }

      res.json({
        success: true,
        data: {
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            username: updatedUser.username,
            firstName: updatedUser.first_name,
            lastName: updatedUser.last_name,
            registrationNumber: updatedUser.registration_number,
            role: updatedUser.role,
            voterStatus: updatedUser.voter_status,
            walletAddress: updatedUser.wallet_address,
            isVerified: updatedUser.is_verified,
            isEmailVerified: updatedUser.is_email_verified,
            voter_status: updatedUser.voter_status,
            is_verified: updatedUser.is_verified,
            is_email_verified: updatedUser.is_email_verified,
            updatedAt: updatedUser.updated_at
          },
          message: 'User updated successfully'
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`User updated: ${updatedUser.id} by ${currentUser.userId}`);
    } catch (error) {
      logger.error('Update user controller error:', error);

      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof ForbiddenError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'USER_UPDATE_FAILED',
            message: 'Failed to update user'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Update voter status (admin only)
   */
  async updateVoterStatus(req: Request, res: Response): Promise<void> {
    try {
      const currentUser = (req as AuthenticatedRequest).user;
      const schema = Joi.object({
        userId: Joi.string().uuid().required()
      });

      const paramsValidation = schema.validate(req.params);
      if (paramsValidation.error) {
        throw new ValidationError(paramsValidation.error.details[0].message);
      }

      const bodySchema = Joi.object({
        voterStatus: Joi.string().valid('eligible', 'voted', 'locked_out', 'suspended').required(),
        reason: Joi.string().max(500).optional()
      });

      const { error, value } = bodySchema.validate(req.body);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      const updatedUser = await UserRepository.updateVoterStatus(
        paramsValidation.value.userId,
        value.voterStatus,
        value.reason
      );

      if (!updatedUser) {
        throw new NotFoundError('User not found');
      }

      res.json({
        success: true,
        data: {
          user: {
            id: updatedUser.id,
            username: updatedUser.username,
            voterStatus: updatedUser.voter_status,
            lockedUntil: updatedUser.locked_until
          },
          message: `Voter status updated to ${value.voterStatus}`
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Voter status updated for user ${updatedUser.id} to ${value.voterStatus} by admin ${currentUser.userId}`);
    } catch (error) {
      logger.error('Update voter status controller error:', error);

      if (error instanceof ValidationError || error instanceof NotFoundError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'VOTER_STATUS_UPDATE_FAILED',
            message: 'Failed to update voter status'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Get user statistics (admin only)
   */
  async getUserStats(req: Request, res: Response): Promise<void> {
    try {
      const baseStats = await UserRepository.getUserStats();

      res.json({
        success: true,
        data: {
          stats: {
            total: baseStats.total,
            byRole: baseStats.by_role,
            byStatus: {
              eligible: baseStats.eligible,
              voted: baseStats.voted,
              locked_out: baseStats.locked_out,
              suspended: Math.max(
                baseStats.total - (baseStats.eligible + baseStats.voted + baseStats.locked_out),
                0
              )
            },
            byVerification: {
              verified: baseStats.verified,
              unverified: Math.max(baseStats.total - baseStats.verified, 0)
            }
          },
          message: 'User statistics retrieved successfully'
        },
        timestamp: new Date().toISOString()
      });

      logger.info('User statistics retrieved');
    } catch (error) {
      logger.error('Get user stats controller error:', error);

      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_FETCH_FAILED',
          message: 'Failed to fetch user statistics'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Reset user failed login attempts (admin only)
   */
  async resetFailedAttempts(req: Request, res: Response): Promise<void> {
    try {
      const schema = Joi.object({
        userId: Joi.string().uuid().required()
      });

      const { error, value } = schema.validate(req.params);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      const user = await UserRepository.resetFailedLoginAttempts(value.userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            failedLoginAttempts: user.failed_login_attempts,
            lockedUntil: user.locked_until
          },
          message: 'Failed login attempts reset successfully'
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Failed login attempts reset for user: ${user.id}`);
    } catch (error) {
      logger.error('Reset failed attempts controller error:', error);

      if (error instanceof ValidationError || error instanceof NotFoundError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'RESET_ATTEMPTS_FAILED',
            message: 'Failed to reset login attempts'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const schema = Joi.object({
        userId: Joi.string().uuid().required()
      });

      const { error, value } = schema.validate(req.params);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      const user = await UserRepository.findById(value.userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      await UserRepository.delete(value.userId);

      res.json({
        success: true,
        data: {
          message: 'User deleted successfully'
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`User deleted: ${value.userId}`);
    } catch (error) {
      logger.error('Delete user controller error:', error);

      if (error instanceof ValidationError || error instanceof NotFoundError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'USER_DELETE_FAILED',
            message: 'Failed to delete user'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Verify user (admin only)
   */
  async verifyUser(req: Request, res: Response): Promise<void> {
    try {
      const schema = Joi.object({
        userId: Joi.string().uuid().required()
      });

      const { error, value } = schema.validate(req.params);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      const user = await UserRepository.update(value.userId, {
        is_verified: true,
        is_email_verified: true
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            is_verified: user.is_verified,
            is_email_verified: user.is_email_verified,
            isVerified: user.is_verified,
            isEmailVerified: user.is_email_verified
          },
          message: 'User verified successfully'
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`User verified: ${value.userId}`);
    } catch (error) {
      logger.error('Verify user controller error:', error);

      if (error instanceof ValidationError || error instanceof NotFoundError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'USER_VERIFY_FAILED',
            message: 'Failed to verify user'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }
  /**
   * Get current user profile
   */
  async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = await UserRepository.findById(req.user.userId);
      if (!user) {
        throw new NotFoundError('User not found');
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
          }
        }
      });
    } catch (error: any) {
      logger.error('Get profile error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message || 'Failed to get profile'
        }
      });
    }
  }

  /**
   * Update current user profile
   */
  async updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const updates = req.body;

      if (!updates || Object.keys(updates).length === 0) {
        throw new ValidationError('No profile fields provided');
      }

      // Prevent role modification by non-admin users
      if (updates.role && req.user.role !== 'admin') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Cannot modify role'
          }
        });
        return;
      }

      // Keep endpoint permissive: only update known fields, ignore unknown fields.
      // For backward compatibility, reject payloads that contain only unknown fields.
      const allowedKeys = ['firstName', 'lastName', 'username', 'walletAddress'];
      const hasKnownProfileField = Object.keys(updates).some((key) => allowedKeys.includes(key));
      if (!hasKnownProfileField) {
        throw new ValidationError('No valid profile fields provided');
      }

      const allowedUpdates: any = {};
      if (typeof updates.firstName === 'string' && updates.firstName.length >= 1 && updates.firstName.length <= 100) {
        allowedUpdates.first_name = updates.firstName;
      }
      if (typeof updates.lastName === 'string' && updates.lastName.length >= 1 && updates.lastName.length <= 100) {
        allowedUpdates.last_name = updates.lastName;
      }
      if (typeof updates.username === 'string' && /^[a-zA-Z0-9]{3,50}$/.test(updates.username)) {
        allowedUpdates.username = updates.username;
      }
      if (typeof updates.walletAddress === 'string' && /^0x[a-fA-F0-9]{40}$/.test(updates.walletAddress)) {
        allowedUpdates.wallet_address = updates.walletAddress;
      }

      if (Object.keys(allowedUpdates).length > 0) {
        await UserRepository.update(req.user.userId, allowedUpdates);
      }

      const user = await UserRepository.findById(req.user.userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            firstName: user.first_name,
            lastName: user.last_name,
            wallet_address: user.wallet_address,
            walletAddress: user.wallet_address,
            role: user.role,
            voter_status: user.voter_status,
            voterStatus: user.voter_status,
            is_verified: user.is_verified,
            is_email_verified: user.is_email_verified,
            isVerified: user.is_verified,
            isEmailVerified: user.is_email_verified
          },
          message: 'Profile updated successfully'
        }
      });
    } catch (error: any) {
      logger.error('Update profile error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message || 'Failed to update profile'
        }
      });
    }
  }
}

export default new UserController();
