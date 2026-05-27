import { BaseRepository } from './BaseRepository';
import { Candidate } from '../models';
import logger from '../utils/logger';

export class CandidateRepository extends BaseRepository<Candidate> {
  constructor() {
    super('candidates');
  }

  async findByElection(electionId: string, activeOnly: boolean = true): Promise<Candidate[]> {
    try {
      let query = 'SELECT * FROM candidates WHERE election_id = $1';
      const params: unknown[] = [electionId];
      
      if (activeOnly) {
        query += ' AND is_active = true';
      }
      
      query += ' ORDER BY position ASC';
      
      const result = await this.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error finding candidates by election:', error);
      throw error;
    }
  }

  async findByElectionAndPosition(electionId: string, position: number): Promise<Candidate | null> {
    try {
      const result = await this.query(
        'SELECT * FROM candidates WHERE election_id = $1 AND position = $2',
        [electionId, position]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding candidate by election and position:', error);
      throw error;
    }
  }

  async incrementVoteCount(candidateId: string, increment: number = 1): Promise<Candidate | null> {
    try {
      const result = await this.query(
        `UPDATE candidates 
         SET vote_count = vote_count + $2
         WHERE id = $1 
         RETURNING *`,
        [candidateId, increment]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error incrementing candidate vote count:', error);
      throw error;
    }
  }

  async getElectionResults(electionId: string): Promise<Candidate[]> {
    try {
      const result = await this.query(`
        SELECT * FROM candidates 
        WHERE election_id = $1 AND is_active = true
        ORDER BY vote_count DESC, position ASC
      `, [electionId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting election results:', error);
      throw error;
    }
  }

  async getTopCandidates(electionId: string, limit: number = 5): Promise<Candidate[]> {
    try {
      const result = await this.query(`
        SELECT * FROM candidates 
        WHERE election_id = $1 AND is_active = true
        ORDER BY vote_count DESC, position ASC
        LIMIT $2
      `, [electionId, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting top candidates:', error);
      throw error;
    }
  }

  async updatePosition(candidateId: string, newPosition: number): Promise<Candidate | null> {
    try {
      return await this.transaction(async (client) => {
        // Get current candidate info
        const currentResult = await client.query(
          'SELECT * FROM candidates WHERE id = $1',
          [candidateId]
        );
        
        if (currentResult.rows.length === 0) {
          throw new Error('Candidate not found');
        }
        
        const candidate = currentResult.rows[0];
        const oldPosition = candidate.position;
        const electionId = candidate.election_id;
        
        if (oldPosition === newPosition) {
          return candidate;
        }
        
        // Shift other candidates' positions
        if (newPosition > oldPosition) {
          // Moving down: shift candidates up
          await client.query(
            `UPDATE candidates 
             SET position = position - 1 
             WHERE election_id = $1 AND position > $2 AND position <= $3`,
            [electionId, oldPosition, newPosition]
          );
        } else {
          // Moving up: shift candidates down
          await client.query(
            `UPDATE candidates 
             SET position = position + 1 
             WHERE election_id = $1 AND position >= $2 AND position < $3`,
            [electionId, newPosition, oldPosition]
          );
        }
        
        // Update the candidate's position
        const result = await client.query(
          'UPDATE candidates SET position = $2 WHERE id = $1 RETURNING *',
          [candidateId, newPosition]
        );
        
        return result.rows[0];
      });
    } catch (error) {
      logger.error('Error updating candidate position:', error);
      throw error;
    }
  }

  async deactivateCandidate(candidateId: string): Promise<Candidate | null> {
    try {
      const result = await this.update(candidateId, { is_active: false });
      
      if (result) {
        // Log the deactivation
        await this.query(
          `INSERT INTO audit_logs (action, resource_type, resource_id, new_values)
           VALUES ($1, $2, $3, $4)`,
          [
            'candidate_deactivated',
            'candidate',
            candidateId,
            JSON.stringify({ is_active: false })
          ]
        );
      }

      return result;
    } catch (error) {
      logger.error('Error deactivating candidate:', error);
      throw error;
    }
  }

  async reactivateCandidate(candidateId: string): Promise<Candidate | null> {
    try {
      const result = await this.update(candidateId, { is_active: true });
      
      if (result) {
        // Log the reactivation
        await this.query(
          `INSERT INTO audit_logs (action, resource_type, resource_id, new_values)
           VALUES ($1, $2, $3, $4)`,
          [
            'candidate_reactivated',
            'candidate',
            candidateId,
            JSON.stringify({ is_active: true })
          ]
        );
      }

      return result;
    } catch (error) {
      logger.error('Error reactivating candidate:', error);
      throw error;
    }
  }

  async getCandidateStats(electionId?: string): Promise<{
    total: number;
    active: number;
    inactive: number;
    total_votes: number;
    average_votes_per_candidate: number;
  }> {
    try {
      let query = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_active = true) as active,
          COUNT(*) FILTER (WHERE is_active = false) as inactive,
          COALESCE(SUM(vote_count), 0) as total_votes,
          COALESCE(AVG(vote_count), 0) as average_votes_per_candidate
        FROM candidates
      `;
      
      const params: unknown[] = [];
      if (electionId) {
        query += ' WHERE election_id = $1';
        params.push(electionId);
      }

      const result = await this.query(query, params);
      const stats = result.rows[0] as any;
      
      return {
        total: parseInt(stats.total),
        active: parseInt(stats.active),
        inactive: parseInt(stats.inactive),
        total_votes: parseInt(stats.total_votes),
        average_votes_per_candidate: parseFloat(stats.average_votes_per_candidate)
      };
    } catch (error) {
      logger.error('Error getting candidate stats:', error);
      throw error;
    }
  }

  async getNextPosition(electionId: string): Promise<number> {
    try {
      const result = await this.query(
        'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM candidates WHERE election_id = $1',
        [electionId]
      );
      return (result.rows[0] as any).next_position;
    } catch (error) {
      logger.error('Error getting next position:', error);
      throw error;
    }
  }
}

export default new CandidateRepository();