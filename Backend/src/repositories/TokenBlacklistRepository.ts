import { BaseRepository } from './BaseRepository';
import logger from '../utils/logger';

export interface TokenBlacklistRecord {
    id: string;
    token_hash: string;
    user_id: string;
    expires_at: Date;
    created_at: Date;
}

export class TokenBlacklistRepository extends BaseRepository<TokenBlacklistRecord> {
    constructor() {
        super('token_blacklist');
    }

    async add(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
        try {
            await this.query(
                `INSERT INTO token_blacklist (token_hash, user_id, expires_at, created_at) 
                 VALUES ($1, $2, $3, NOW())`,
                [tokenHash, userId, expiresAt]
            );
        } catch (error) {
            logger.error('Error adding token to blacklist:', error);
            throw error;
        }
    }

    async isBlacklisted(tokenHash: string): Promise<boolean> {
        try {
            const result = await this.query(
                'SELECT 1 FROM token_blacklist WHERE token_hash = $1 AND expires_at > NOW()',
                [tokenHash]
            );
            return result.rows.length > 0;
        } catch (error) {
            logger.error('Error checking token blacklist:', error);
            return false;
        }
    }

    async deleteExpired(): Promise<void> {
        try {
            await this.query(
                'DELETE FROM token_blacklist WHERE expires_at < NOW()',
                []
            );
        } catch (error) {
            logger.error('Error deleting expired blacklisted tokens:', error);
            throw error;
        }
    }

    async deleteByUserId(userId: string): Promise<void> {
        try {
            await this.query(
                'DELETE FROM token_blacklist WHERE user_id = $1',
                [userId]
            );
        } catch (error) {
            logger.error('Error deleting user blacklisted tokens:', error);
            throw error;
        }
    }
}

export default new TokenBlacklistRepository();
