import { BaseRepository } from './BaseRepository';
import logger from '../utils/logger';
import crypto from 'crypto';

export interface RefreshToken {
    id: string;
    user_id: string;
    token_hash: string;
    is_used: boolean;
    expires_at: Date;
    created_at: Date;
    used_at?: Date;
}

export class RefreshTokenRepository extends BaseRepository<RefreshToken> {
    constructor() {
        super('refresh_tokens');
    }

    /**
     * Create a hash of the refresh token for storage
     */
    private hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    /**
     * Store a new refresh token
     */
    async storeToken(userId: string, token: string, expiresAt: Date): Promise<RefreshToken> {
        try {
            const tokenHash = this.hashToken(token);

            const result = await this.query(
                `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, is_used)
         VALUES ($1, $2, $3, FALSE)
         RETURNING *`,
                [userId, tokenHash, expiresAt]
            );

            return result.rows[0];
        } catch (error) {
            logger.error('Error creating refresh token:', error);
            throw error;
        }
    }

    /**
     * Find a refresh token by its hash
     */
    async findByToken(token: string): Promise<RefreshToken | null> {
        try {
            const tokenHash = this.hashToken(token);

            const result = await this.query(
                `SELECT * FROM refresh_tokens 
         WHERE token_hash = $1`,
                [tokenHash]
            );

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Error finding refresh token:', error);
            throw error;
        }
    }

    /**
     * Mark a refresh token as used
     */
    async markAsUsed(token: string): Promise<void> {
        try {
            const tokenHash = this.hashToken(token);

            await this.query(
                `UPDATE refresh_tokens 
         SET is_used = TRUE, used_at = NOW()
         WHERE token_hash = $1`,
                [tokenHash]
            );
        } catch (error) {
            logger.error('Error marking refresh token as used:', error);
            throw error;
        }
    }

    /**
     * Delete expired refresh tokens
     */
    async deleteExpired(): Promise<number> {
        try {
            const result = await this.query(
                `DELETE FROM refresh_tokens 
         WHERE expires_at < NOW()
         RETURNING id`
            );

            const deletedCount = result.rowCount || 0;
            logger.info(`Deleted ${deletedCount} expired refresh tokens`);
            return deletedCount;
        } catch (error) {
            logger.error('Error deleting expired refresh tokens:', error);
            throw error;
        }
    }

    /**
     * Delete all refresh tokens for a user (logout all sessions)
     */
    async deleteByUserId(userId: string): Promise<void> {
        try {
            await this.query(
                `DELETE FROM refresh_tokens WHERE user_id = $1`,
                [userId]
            );
        } catch (error) {
            logger.error('Error deleting user refresh tokens:', error);
            throw error;
        }
    }

    /**
     * Check if a token is valid (exists, not used, not expired)
     */
    async isValid(token: string): Promise<boolean> {
        try {
            const refreshToken = await this.findByToken(token);

            if (!refreshToken) {
                return false;
            }

            if (refreshToken.is_used) {
                return false;
            }

            if (new Date() > new Date(refreshToken.expires_at)) {
                return false;
            }

            return true;
        } catch (error) {
            logger.error('Error checking refresh token validity:', error);
            return false;
        }
    }
}

export default new RefreshTokenRepository();
