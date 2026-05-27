import { BaseRepository } from './BaseRepository';
import { User } from '../models';
import logger from '../utils/logger';

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users');
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      const result = await this.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  }

  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    try {
      const result = await this.query(
        'SELECT * FROM users WHERE wallet_address = $1',
        [walletAddress]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by wallet address:', error);
      throw error;
    }
  }

  async findByRegistrationNumber(registrationNumber: string): Promise<User | null> {
    try {
      const result = await this.query(
        'SELECT * FROM users WHERE registration_number = $1',
        [registrationNumber]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by registration number:', error);
      throw error;
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    try {
      const result = await this.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by username:', error);
      throw error;
    }
  }

  async updateVoterStatus(userId: string, status: User['voter_status'], reason?: string): Promise<User | null> {
    try {
      const updateData: Partial<User> = { voter_status: status };
      
      // If locking out, set lockout time
      if (status === 'locked_out') {
        updateData.locked_until = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      } else if (status === 'eligible') {
        updateData.locked_until = undefined;
      }

      const result = await this.update(userId, updateData);
      
      if (result) {
        // Log the status change
        await this.query(
          `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            userId,
            'voter_status_change',
            'user',
            userId,
            JSON.stringify({ voter_status: status }),
            JSON.stringify({ reason, previous_status: result.voter_status })
          ]
        );
      }

      return result;
    } catch (error) {
      logger.error('Error updating voter status:', error);
      throw error;
    }
  }

  async incrementFailedLoginAttempts(userId: string): Promise<User | null> {
    try {
      const result = await this.query(
        `UPDATE users 
         SET failed_login_attempts = failed_login_attempts + 1,
             locked_until = CASE 
               WHEN failed_login_attempts + 1 >= 5 
               THEN CURRENT_TIMESTAMP + INTERVAL '1 hour'
               ELSE locked_until
             END
         WHERE id = $1 
         RETURNING *`,
        [userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error incrementing failed login attempts:', error);
      throw error;
    }
  }

  async resetFailedLoginAttempts(userId: string): Promise<User | null> {
    try {
      const result = await this.query(
        `UPDATE users 
         SET failed_login_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP
         WHERE id = $1 
         RETURNING *`,
        [userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error resetting failed login attempts:', error);
      throw error;
    }
  }

  async findEligibleVoters(electionId?: string): Promise<User[]> {
    try {
      let query = `
        SELECT u.* FROM users u
        WHERE u.voter_status = 'eligible' 
        AND u.is_verified = true
        AND (u.locked_until IS NULL OR u.locked_until <= CURRENT_TIMESTAMP)
      `;
      
      const params: unknown[] = [];
      
      if (electionId) {
        query += ` AND NOT EXISTS (
          SELECT 1 FROM votes_cache vc 
          WHERE vc.voter_id = u.id AND vc.election_id = $1
        )`;
        params.push(electionId);
      }
      
      query += ' ORDER BY u.created_at';
      
      const result = await this.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error finding eligible voters:', error);
      throw error;
    }
  }

  async getUserStats(): Promise<{
    total: number;
    verified: number;
    eligible: number;
    voted: number;
    locked_out: number;
    by_role: Record<string, number>;
  }> {
    try {
      const result = await this.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_verified = true) as verified,
          COUNT(*) FILTER (WHERE voter_status = 'eligible') as eligible,
          COUNT(*) FILTER (WHERE voter_status = 'voted') as voted,
          COUNT(*) FILTER (WHERE voter_status = 'locked_out') as locked_out,
          COUNT(*) FILTER (WHERE role = 'voter') as voters,
          COUNT(*) FILTER (WHERE role = 'admin') as admins,
          COUNT(*) FILTER (WHERE role = 'creator') as creators
        FROM users
      `);

      const stats = result.rows[0] as any;
      return {
        total: parseInt(stats.total),
        verified: parseInt(stats.verified),
        eligible: parseInt(stats.eligible),
        voted: parseInt(stats.voted),
        locked_out: parseInt(stats.locked_out),
        by_role: {
          voter: parseInt(stats.voters),
          admin: parseInt(stats.admins),
          creator: parseInt(stats.creators)
        }
      };
    } catch (error) {
      logger.error('Error getting user stats:', error);
      throw error;
    }
  }
}

export default new UserRepository();