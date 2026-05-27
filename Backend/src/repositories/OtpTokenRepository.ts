import { BaseRepository } from './BaseRepository';
import { OtpToken } from '../models';
import logger from '../utils/logger';
import crypto from 'crypto';

export class OtpTokenRepository extends BaseRepository<OtpToken> {
  constructor() {
    super('otp_tokens');
  }

  async findActiveToken(userId: string, tokenType: OtpToken['token_type']): Promise<OtpToken | null> {
    try {
      const result = await this.query(
        `SELECT * FROM otp_tokens 
         WHERE user_id = $1 AND token_type = $2 
         AND is_used = false AND expires_at > CURRENT_TIMESTAMP
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, tokenType]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding active token:', error);
      throw error;
    }
  }

  async findByTokenAndType(token: string, tokenType: OtpToken['token_type']): Promise<OtpToken | null> {
    try {
      const result = await this.query(
        'SELECT * FROM otp_tokens WHERE token = $1 AND token_type = $2',
        [token, tokenType]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding token by token and type:', error);
      throw error;
    }
  }

  async generateToken(
    userId: string,
    tokenType: OtpToken['token_type'],
    expiresInMinutes: number = 15,
    maxAttempts: number = 3,
    purposeData?: string
  ): Promise<OtpToken> {
    try {
      return await this.transaction(async (client) => {
        // Invalidate any existing active tokens of the same type
        await client.query(
          `UPDATE otp_tokens 
           SET is_used = true, used_at = CURRENT_TIMESTAMP
           WHERE user_id = $1 AND token_type = $2 AND is_used = false`,
          [userId, tokenType]
        );

        // Generate new token
        const token = this.generateOtpCode(6);
        const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

        const result = await client.query(
          `INSERT INTO otp_tokens (user_id, token, token_type, expires_at, max_attempts, purpose_data)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [userId, token, tokenType, expiresAt, maxAttempts, purposeData]
        );

        // Log token generation
        await client.query(
          `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            userId,
            'otp_token_generated',
            'auth',
            result.rows[0].id,
            JSON.stringify({ token_type: tokenType, expires_at: expiresAt })
          ]
        );

        return result.rows[0];
      });
    } catch (error) {
      logger.error('Error generating token:', error);
      throw error;
    }
  }

  async verifyToken(token: string, tokenType: OtpToken['token_type'], userId?: string): Promise<{
    valid: boolean;
    otpToken?: OtpToken;
    reason?: string;
  }> {
    try {
      return await this.transaction(async (client) => {
        // Find the token
        let query = 'SELECT * FROM otp_tokens WHERE token = $1 AND token_type = $2';
        const params: unknown[] = [token, tokenType];

        if (userId) {
          query += ' AND user_id = $3';
          params.push(userId);
        }

        const result = await client.query(query, params);

        if (result.rows.length === 0) {
          return { valid: false, reason: 'Token not found' };
        }

        const otpToken = result.rows[0];

        // Check if token is already used
        if (otpToken.is_used) {
          return { valid: false, reason: 'Token already used', otpToken };
        }

        // Check if token is expired
        if (new Date() > new Date(otpToken.expires_at)) {
          return { valid: false, reason: 'Token expired', otpToken };
        }

        // Check attempts
        if (otpToken.attempts >= otpToken.max_attempts) {
          return { valid: false, reason: 'Maximum attempts exceeded', otpToken };
        }

        // Increment attempts
        await client.query(
          'UPDATE otp_tokens SET attempts = attempts + 1 WHERE id = $1',
          [otpToken.id]
        );

        // Mark as used and get updated token
        const updateResult = await client.query(
          `UPDATE otp_tokens 
           SET is_used = true, used_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [otpToken.id]
        );

        const updatedToken = updateResult.rows[0];

        // Log successful verification
        await client.query(
          `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, success)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            otpToken.user_id,
            'otp_token_verified',
            'auth',
            otpToken.id,
            true
          ]
        );

        return { valid: true, otpToken: updatedToken };
      });
    } catch (error) {
      logger.error('Error verifying token:', error);
      throw error;
    }
  }

  async incrementAttempts(tokenId: string): Promise<OtpToken | null> {
    try {
      const result = await this.query(
        'UPDATE otp_tokens SET attempts = attempts + 1 WHERE id = $1 RETURNING *',
        [tokenId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error incrementing token attempts:', error);
      throw error;
    }
  }

  async invalidateUserTokens(userId: string, tokenType?: OtpToken['token_type']): Promise<number> {
    try {
      let query = `UPDATE otp_tokens 
                   SET is_used = true, used_at = CURRENT_TIMESTAMP
                   WHERE user_id = $1 AND is_used = false`;
      const params: unknown[] = [userId];

      if (tokenType) {
        query += ' AND token_type = $2';
        params.push(tokenType);
      }

      const result = await this.query(query, params);
      return result.rowCount;
    } catch (error) {
      logger.error('Error invalidating user tokens:', error);
      throw error;
    }
  }

  async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await this.query(
        'DELETE FROM otp_tokens WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL \'24 hours\''
      );
      return result.rowCount;
    } catch (error) {
      logger.error('Error cleaning up expired tokens:', error);
      throw error;
    }
  }

  async getTokenStats(userId?: string): Promise<{
    total: number;
    active: number;
    used: number;
    expired: number;
    by_type: Record<string, number>;
  }> {
    try {
      let query = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_used = false AND expires_at > CURRENT_TIMESTAMP) as active,
          COUNT(*) FILTER (WHERE is_used = true) as used,
          COUNT(*) FILTER (WHERE is_used = false AND expires_at <= CURRENT_TIMESTAMP) as expired,
          COUNT(*) FILTER (WHERE token_type = 'email_verification') as email_verification,
          COUNT(*) FILTER (WHERE token_type = 'login') as login,
          COUNT(*) FILTER (WHERE token_type = 'password_reset') as password_reset,
          COUNT(*) FILTER (WHERE token_type = 'voting_access') as voting_access
        FROM otp_tokens
      `;

      const params: unknown[] = [];
      if (userId) {
        query += ' WHERE user_id = $1';
        params.push(userId);
      }

      const result = await this.query(query, params);
      const stats = result.rows[0] as any;

      return {
        total: parseInt(stats.total),
        active: parseInt(stats.active),
        used: parseInt(stats.used),
        expired: parseInt(stats.expired),
        by_type: {
          email_verification: parseInt(stats.email_verification),
          login: parseInt(stats.login),
          password_reset: parseInt(stats.password_reset),
          voting_access: parseInt(stats.voting_access)
        }
      };
    } catch (error) {
      logger.error('Error getting token stats:', error);
      throw error;
    }
  }

  async findRecentTokens(userId: string, limit: number = 10): Promise<OtpToken[]> {
    try {
      const result = await this.query(
        `SELECT * FROM otp_tokens 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [userId, limit]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error finding recent tokens:', error);
      throw error;
    }
  }

  private generateOtpCode(length: number = 6): string {
    const digits = '0123456789';
    let result = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, digits.length);
      result += digits[randomIndex];
    }

    return result;
  }

  async resendToken(userId: string, tokenType: OtpToken['token_type']): Promise<OtpToken | null> {
    try {
      // Check if there's a recent token (within last 2 minutes)
      const recentToken = await this.query(
        `SELECT * FROM otp_tokens 
         WHERE user_id = $1 AND token_type = $2 
         AND created_at > CURRENT_TIMESTAMP - INTERVAL '2 minutes'
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, tokenType]
      );

      if (recentToken.rows.length > 0) {
        throw new Error('Please wait before requesting a new token');
      }

      // Generate new token
      return await this.generateToken(userId, tokenType);
    } catch (error) {
      logger.error('Error resending token:', error);
      throw error;
    }
  }

  async findByToken(token: string): Promise<OtpToken | null> {
    try {
      const result = await this.query(
        'SELECT * FROM otp_tokens WHERE token = $1',
        [token]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding token by token:', error);
      throw error;
    }
  }

  async markAsUsed(tokenId: string): Promise<void> {
    try {
      await this.query(
        'UPDATE otp_tokens SET is_used = true, used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [tokenId]
      );
    } catch (error) {
      logger.error('Error marking token as used:', error);
      throw error;
    }
  }
}

export default new OtpTokenRepository();