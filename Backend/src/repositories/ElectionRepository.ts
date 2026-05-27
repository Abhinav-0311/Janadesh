import { BaseRepository } from './BaseRepository';
import { Election } from '../models';
import logger from '../utils/logger';

export class ElectionRepository extends BaseRepository<Election> {
  constructor() {
    super('elections');
  }

  async findByContractAddress(contractAddress: string): Promise<Election | null> {
    try {
      const result = await this.query(
        'SELECT * FROM elections WHERE contract_address = $1',
        [contractAddress]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding election by contract address:', error);
      throw error;
    }
  }

  async findByCreator(creatorId: string): Promise<Election[]> {
    try {
      const result = await this.query(
        'SELECT * FROM elections WHERE creator_id = $1 ORDER BY created_at DESC',
        [creatorId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error finding elections by creator:', error);
      throw error;
    }
  }

  async findActiveElections(): Promise<Election[]> {
    try {
      const result = await this.query(`
        SELECT * FROM elections 
        WHERE status = 'active' 
        AND start_time <= CURRENT_TIMESTAMP 
        AND end_time > CURRENT_TIMESTAMP
        ORDER BY start_time ASC
      `);
      return result.rows;
    } catch (error) {
      logger.error('Error finding active elections:', error);
      throw error;
    }
  }

  async findUpcomingElections(): Promise<Election[]> {
    try {
      const result = await this.query(`
        SELECT * FROM elections 
        WHERE status = 'pending' 
        AND start_time > CURRENT_TIMESTAMP
        ORDER BY start_time ASC
      `);
      return result.rows;
    } catch (error) {
      logger.error('Error finding upcoming elections:', error);
      throw error;
    }
  }

  async findPublicElections(): Promise<Election[]> {
    try {
      const result = await this.query(`
        SELECT * FROM elections 
        WHERE is_public = true 
        AND status IN ('pending', 'active')
        ORDER BY start_time ASC
      `);
      return result.rows;
    } catch (error) {
      logger.error('Error finding public elections:', error);
      throw error;
    }
  }

  async updateStatus(electionId: string, status: Election['status']): Promise<Election | null> {
    try {
      const result = await this.update(electionId, { status });
      
      if (result) {
        // Log the status change
        await this.query(
          `INSERT INTO audit_logs (action, resource_type, resource_id, new_values)
           VALUES ($1, $2, $3, $4)`,
          [
            'election_status_change',
            'election',
            electionId,
            JSON.stringify({ status })
          ]
        );
      }

      return result;
    } catch (error) {
      logger.error('Error updating election status:', error);
      throw error;
    }
  }

  async incrementVoteCount(electionId: string): Promise<Election | null> {
    try {
      const result = await this.query(
        `UPDATE elections 
         SET total_votes_cast = total_votes_cast + 1
         WHERE id = $1 
         RETURNING *`,
        [electionId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error incrementing vote count:', error);
      throw error;
    }
  }

  async incrementRegistrationCount(electionId: string): Promise<Election | null> {
    try {
      const result = await this.query(
        `UPDATE elections 
         SET total_registered_voters = total_registered_voters + 1
         WHERE id = $1 
         RETURNING *`,
        [electionId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error incrementing registration count:', error);
      throw error;
    }
  }

  async findElectionsRequiringStatusUpdate(): Promise<Election[]> {
    try {
      const result = await this.query(`
        SELECT * FROM elections 
        WHERE (
          (status = 'pending' AND start_time <= CURRENT_TIMESTAMP) OR
          (status = 'active' AND end_time <= CURRENT_TIMESTAMP)
        )
        ORDER BY start_time ASC
      `);
      return result.rows;
    } catch (error) {
      logger.error('Error finding elections requiring status update:', error);
      throw error;
    }
  }

  async getElectionStats(): Promise<{
    total: number;
    active: number;
    pending: number;
    ended: number;
    cancelled: number;
    public: number;
    private: number;
    total_votes: number;
    total_registrations: number;
  }> {
    try {
      const result = await this.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'ended') as ended,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
          COUNT(*) FILTER (WHERE is_public = true) as public,
          COUNT(*) FILTER (WHERE is_public = false) as private,
          COALESCE(SUM(total_votes_cast), 0) as total_votes,
          COALESCE(SUM(total_registered_voters), 0) as total_registrations
        FROM elections
      `);

      const stats = result.rows[0] as any;
      return {
        total: parseInt(stats.total),
        active: parseInt(stats.active),
        pending: parseInt(stats.pending),
        ended: parseInt(stats.ended),
        cancelled: parseInt(stats.cancelled),
        public: parseInt(stats.public),
        private: parseInt(stats.private),
        total_votes: parseInt(stats.total_votes),
        total_registrations: parseInt(stats.total_registrations)
      };
    } catch (error) {
      logger.error('Error getting election stats:', error);
      throw error;
    }
  }

  async findElectionsWithRegistrationDeadline(): Promise<Election[]> {
    try {
      const result = await this.query(`
        SELECT * FROM elections 
        WHERE requires_registration = true 
        AND registration_deadline IS NOT NULL
        AND registration_deadline BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '24 hours'
        ORDER BY registration_deadline ASC
      `);
      return result.rows;
    } catch (error) {
      logger.error('Error finding elections with registration deadline:', error);
      throw error;
    }
  }
}

export default new ElectionRepository();