import { BaseRepository } from './BaseRepository';
import { VoterEligibility } from '../models';
import logger from '../utils/logger';

export class VoterEligibilityRepository extends BaseRepository<VoterEligibility> {
  constructor() {
    super('voter_eligibility');
  }

  async findByUserAndElection(userId: string, electionId: string): Promise<VoterEligibility | null> {
    try {
      const result = await this.query(
        'SELECT * FROM voter_eligibility WHERE user_id = $1 AND election_id = $2',
        [userId, electionId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding voter eligibility by user and election:', error);
      throw error;
    }
  }

  async findByElection(electionId: string, eligibleOnly: boolean = false): Promise<VoterEligibility[]> {
    try {
      let query = 'SELECT * FROM voter_eligibility WHERE election_id = $1';
      const params: unknown[] = [electionId];
      
      if (eligibleOnly) {
        query += ' AND is_eligible = true';
      }
      
      query += ' ORDER BY created_at DESC';
      
      const result = await this.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error finding voter eligibility by election:', error);
      throw error;
    }
  }

  async setEligibility(
    userId: string, 
    electionId: string, 
    isEligible: boolean, 
    reason?: string,
    verifiedBy?: string
  ): Promise<VoterEligibility> {
    try {
      // Check if record already exists
      const existing = await this.findByUserAndElection(userId, electionId);
      
      if (existing) {
        // Update existing record
        return await this.update(existing.id, {
          is_eligible: isEligible,
          eligibility_reason: reason,
          verified_at: new Date(),
          verified_by: verifiedBy
        }) as VoterEligibility;
      } else {
        // Create new record
        return await this.create({
          user_id: userId,
          election_id: electionId,
          is_eligible: isEligible,
          eligibility_reason: reason,
          verified_at: new Date(),
          verified_by: verifiedBy,
          registration_required: false,
          has_voted: false
        });
      }
    } catch (error) {
      logger.error('Error setting voter eligibility:', error);
      throw error;
    }
  }

  async getEligibilityStats(electionId?: string): Promise<{
    total: number;
    eligible: number;
    ineligible: number;
    voted: number;
    locked_out: number;
    registration_required: number;
  }> {
    try {
      let query = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_eligible = true) as eligible,
          COUNT(*) FILTER (WHERE is_eligible = false) as ineligible,
          COUNT(*) FILTER (WHERE has_voted = true) as voted,
          COUNT(*) FILTER (WHERE lockout_until IS NOT NULL AND lockout_until > CURRENT_TIMESTAMP) as locked_out,
          COUNT(*) FILTER (WHERE registration_required = true) as registration_required
        FROM voter_eligibility
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
        eligible: parseInt(stats.eligible),
        ineligible: parseInt(stats.ineligible),
        voted: parseInt(stats.voted),
        locked_out: parseInt(stats.locked_out),
        registration_required: parseInt(stats.registration_required)
      };
    } catch (error) {
      logger.error('Error getting eligibility stats:', error);
      throw error;
    }
  }
}

export default new VoterEligibilityRepository();