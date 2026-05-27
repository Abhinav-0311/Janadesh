import { BaseRepository } from './BaseRepository';
import { VoteCache } from '../models';
import logger from '../utils/logger';

export class VoteCacheRepository extends BaseRepository<VoteCache> {
  constructor() {
    super('votes_cache');
  }

  async findByElection(electionId: string, verifiedOnly: boolean = false): Promise<VoteCache[]> {
    try {
      let query = 'SELECT * FROM votes_cache WHERE election_id = $1';
      const params: unknown[] = [electionId];
      
      if (verifiedOnly) {
        query += ' AND is_verified = true';
      }
      
      query += ' ORDER BY voted_at DESC';
      
      const result = await this.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error finding votes by election:', error);
      throw error;
    }
  }

  async findByVoter(voterId: string): Promise<VoteCache[]> {
    try {
      const result = await this.query(
        'SELECT * FROM votes_cache WHERE voter_id = $1 ORDER BY voted_at DESC',
        [voterId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error finding votes by voter:', error);
      throw error;
    }
  }

  async findByVoterAndElection(voterId: string, electionId: string): Promise<VoteCache | null> {
    try {
      const result = await this.query(
        'SELECT * FROM votes_cache WHERE voter_id = $1 AND election_id = $2',
        [voterId, electionId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding vote by voter and election:', error);
      throw error;
    }
  }

  async findByTransactionHash(transactionHash: string): Promise<VoteCache | null> {
    try {
      const result = await this.query(
        'SELECT * FROM votes_cache WHERE transaction_hash = $1',
        [transactionHash]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding vote by transaction hash:', error);
      throw error;
    }
  }

  async findUnverifiedVotes(): Promise<VoteCache[]> {
    try {
      const result = await this.query(
        'SELECT * FROM votes_cache WHERE is_verified = false ORDER BY created_at ASC'
      );
      return result.rows;
    } catch (error) {
      logger.error('Error finding unverified votes:', error);
      throw error;
    }
  }

  async verifyVote(voteId: string, blockNumber: number): Promise<VoteCache | null> {
    try {
      const result = await this.update(voteId, {
        is_verified: true,
        block_number: blockNumber
      });

      if (result) {
        // Log the verification
        await this.query(
          `INSERT INTO audit_logs (action, resource_type, resource_id, new_values)
           VALUES ($1, $2, $3, $4)`,
          [
            'vote_verified',
            'vote',
            voteId,
            JSON.stringify({ is_verified: true, block_number: blockNumber })
          ]
        );
      }

      return result;
    } catch (error) {
      logger.error('Error verifying vote:', error);
      throw error;
    }
  }

  async getVotesByCandidate(candidateId: string, verifiedOnly: boolean = true): Promise<VoteCache[]> {
    try {
      let query = 'SELECT * FROM votes_cache WHERE candidate_id = $1';
      const params: unknown[] = [candidateId];
      
      if (verifiedOnly) {
        query += ' AND is_verified = true';
      }
      
      query += ' ORDER BY voted_at DESC';
      
      const result = await this.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting votes by candidate:', error);
      throw error;
    }
  }

  async getElectionVoteStats(electionId: string): Promise<{
    total_votes: number;
    verified_votes: number;
    unverified_votes: number;
    unique_voters: number;
    votes_by_hour: Array<{ hour: string; count: number }>;
  }> {
    try {
      // Get basic stats
      const statsResult = await this.query(`
        SELECT 
          COUNT(*) as total_votes,
          COUNT(*) FILTER (WHERE is_verified = true) as verified_votes,
          COUNT(*) FILTER (WHERE is_verified = false) as unverified_votes,
          COUNT(DISTINCT voter_id) as unique_voters
        FROM votes_cache 
        WHERE election_id = $1
      `, [electionId]);

      // Get votes by hour for the last 24 hours
      const hourlyResult = await this.query(`
        SELECT 
          DATE_TRUNC('hour', voted_at) as hour,
          COUNT(*) as count
        FROM votes_cache 
        WHERE election_id = $1 
        AND voted_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        AND is_verified = true
        GROUP BY DATE_TRUNC('hour', voted_at)
        ORDER BY hour DESC
      `, [electionId]);

      const stats = statsResult.rows[0] as any;
      return {
        total_votes: parseInt(stats.total_votes),
        verified_votes: parseInt(stats.verified_votes),
        unverified_votes: parseInt(stats.unverified_votes),
        unique_voters: parseInt(stats.unique_voters),
        votes_by_hour: hourlyResult.rows.map((row: any) => ({
          hour: row.hour,
          count: parseInt(row.count)
        }))
      };
    } catch (error) {
      logger.error('Error getting election vote stats:', error);
      throw error;
    }
  }

  async hasVoterVoted(voterId: string, electionId: string): Promise<boolean> {
    try {
      const result = await this.query(
        'SELECT 1 FROM votes_cache WHERE voter_id = $1 AND election_id = $2 LIMIT 1',
        [voterId, electionId]
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error checking if voter has voted:', error);
      throw error;
    }
  }

  async getRecentVotes(limit: number = 10): Promise<VoteCache[]> {
    try {
      const result = await this.query(`
        SELECT vc.*, u.username, e.title as election_title, c.name as candidate_name
        FROM votes_cache vc
        JOIN users u ON vc.voter_id = u.id
        JOIN elections e ON vc.election_id = e.id
        JOIN candidates c ON vc.candidate_id = c.id
        WHERE vc.is_verified = true
        ORDER BY vc.voted_at DESC
        LIMIT $1
      `, [limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting recent votes:', error);
      throw error;
    }
  }

  async syncVoteWithBlockchain(
    transactionHash: string, 
    blockNumber: number, 
    isVerified: boolean
  ): Promise<VoteCache | null> {
    try {
      const result = await this.query(
        `UPDATE votes_cache 
         SET block_number = $2, is_verified = $3
         WHERE transaction_hash = $1 
         RETURNING *`,
        [transactionHash, blockNumber, isVerified]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error syncing vote with blockchain:', error);
      throw error;
    }
  }

  async getVotingActivity(electionId: string, timeframe: 'hour' | 'day' | 'week' = 'hour'): Promise<Array<{
    period: string;
    vote_count: number;
    unique_voters: number;
  }>> {
    try {
      let truncateUnit = 'hour';
      let intervalUnit = '24 hours';
      
      switch (timeframe) {
        case 'day':
          truncateUnit = 'day';
          intervalUnit = '30 days';
          break;
        case 'week':
          truncateUnit = 'week';
          intervalUnit = '12 weeks';
          break;
      }

      const result = await this.query(`
        SELECT 
          DATE_TRUNC('${truncateUnit}', voted_at) as period,
          COUNT(*) as vote_count,
          COUNT(DISTINCT voter_id) as unique_voters
        FROM votes_cache 
        WHERE election_id = $1 
        AND voted_at >= CURRENT_TIMESTAMP - INTERVAL '${intervalUnit}'
        AND is_verified = true
        GROUP BY DATE_TRUNC('${truncateUnit}', voted_at)
        ORDER BY period DESC
      `, [electionId]);

      return result.rows.map((row: any) => ({
        period: row.period,
        vote_count: parseInt(row.vote_count),
        unique_voters: parseInt(row.unique_voters)
      }));
    } catch (error) {
      logger.error('Error getting voting activity:', error);
      throw error;
    }
  }
}

export default new VoteCacheRepository();