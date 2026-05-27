import { BaseRepository } from './BaseRepository';
import { VoterRegistration } from '../models';
import logger from '../utils/logger';

export class VoterRegistrationRepository extends BaseRepository<VoterRegistration> {
  constructor() {
    super('voter_registrations');
  }

  async findByUserAndElection(userId: string, electionId: string): Promise<VoterRegistration | null> {
    try {
      const result = await this.query(
        'SELECT * FROM voter_registrations WHERE user_id = $1 AND election_id = $2',
        [userId, electionId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding registration by user and election:', error);
      throw error;
    }
  }

  async findByElection(electionId: string, status?: VoterRegistration['registration_status']): Promise<VoterRegistration[]> {
    try {
      let query = 'SELECT vr.*, u.username, u.email FROM voter_registrations vr JOIN users u ON vr.user_id = u.id WHERE vr.election_id = $1';
      const params: unknown[] = [electionId];
      
      if (status) {
        query += ' AND vr.registration_status = $2';
        params.push(status);
      }
      
      query += ' ORDER BY vr.registered_at DESC';
      
      const result = await this.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error finding registrations by election:', error);
      throw error;
    }
  }

  async findByUser(userId: string): Promise<VoterRegistration[]> {
    try {
      const result = await this.query(`
        SELECT vr.*, e.title as election_title, e.start_time, e.end_time, e.status as election_status
        FROM voter_registrations vr 
        JOIN elections e ON vr.election_id = e.id
        WHERE vr.user_id = $1 
        ORDER BY vr.registered_at DESC
      `, [userId]);
      return result.rows;
    } catch (error) {
      logger.error('Error finding registrations by user:', error);
      throw error;
    }
  }

  async findPendingRegistrations(): Promise<VoterRegistration[]> {
    try {
      const result = await this.query(`
        SELECT vr.*, u.username, u.email, e.title as election_title
        FROM voter_registrations vr 
        JOIN users u ON vr.user_id = u.id
        JOIN elections e ON vr.election_id = e.id
        WHERE vr.registration_status = 'pending'
        ORDER BY vr.registered_at ASC
      `);
      return result.rows;
    } catch (error) {
      logger.error('Error finding pending registrations:', error);
      throw error;
    }
  }

  async approveRegistration(registrationId: string, approvedBy: string): Promise<VoterRegistration | null> {
    try {
      const result = await this.update(registrationId, {
        registration_status: 'approved',
        approved_at: new Date(),
        approved_by: approvedBy
      });

      if (result) {
        // Increment election registration count
        await this.query(
          'UPDATE elections SET total_registered_voters = total_registered_voters + 1 WHERE id = $1',
          [result.election_id]
        );

        // Log the approval
        await this.query(
          `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            approvedBy,
            'registration_approved',
            'registration',
            registrationId,
            JSON.stringify({ registration_status: 'approved', approved_by: approvedBy })
          ]
        );
      }

      return result;
    } catch (error) {
      logger.error('Error approving registration:', error);
      throw error;
    }
  }

  async rejectRegistration(registrationId: string, rejectionReason: string, rejectedBy?: string): Promise<VoterRegistration | null> {
    try {
      const result = await this.update(registrationId, {
        registration_status: 'rejected',
        rejection_reason: rejectionReason
      });

      if (result && rejectedBy) {
        // Log the rejection
        await this.query(
          `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            rejectedBy,
            'registration_rejected',
            'registration',
            registrationId,
            JSON.stringify({ 
              registration_status: 'rejected', 
              rejection_reason: rejectionReason,
              rejected_by: rejectedBy 
            })
          ]
        );
      }

      return result;
    } catch (error) {
      logger.error('Error rejecting registration:', error);
      throw error;
    }
  }

  async expireRegistrations(electionId: string): Promise<number> {
    try {
      const result = await this.query(
        `UPDATE voter_registrations 
         SET registration_status = 'expired'
         WHERE election_id = $1 
         AND registration_status = 'pending'
         AND EXISTS (
           SELECT 1 FROM elections e 
           WHERE e.id = $1 
           AND e.registration_deadline < CURRENT_TIMESTAMP
         )`,
        [electionId]
      );
      return result.rowCount;
    } catch (error) {
      logger.error('Error expiring registrations:', error);
      throw error;
    }
  }

  async isUserRegistered(userId: string, electionId: string): Promise<boolean> {
    try {
      const result = await this.query(
        `SELECT 1 FROM voter_registrations 
         WHERE user_id = $1 AND election_id = $2 AND registration_status = 'approved'
         LIMIT 1`,
        [userId, electionId]
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error checking if user is registered:', error);
      throw error;
    }
  }

  async getRegistrationStats(electionId?: string): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    expired: number;
  }> {
    try {
      let query = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE registration_status = 'pending') as pending,
          COUNT(*) FILTER (WHERE registration_status = 'approved') as approved,
          COUNT(*) FILTER (WHERE registration_status = 'rejected') as rejected,
          COUNT(*) FILTER (WHERE registration_status = 'expired') as expired
        FROM voter_registrations
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
        pending: parseInt(stats.pending),
        approved: parseInt(stats.approved),
        rejected: parseInt(stats.rejected),
        expired: parseInt(stats.expired)
      };
    } catch (error) {
      logger.error('Error getting registration stats:', error);
      throw error;
    }
  }

  async findRegistrationsNearingDeadline(hoursBeforeDeadline: number = 24): Promise<VoterRegistration[]> {
    try {
      const result = await this.query(`
        SELECT vr.*, u.username, u.email, e.title as election_title, e.registration_deadline
        FROM voter_registrations vr 
        JOIN users u ON vr.user_id = u.id
        JOIN elections e ON vr.election_id = e.id
        WHERE vr.registration_status = 'pending'
        AND e.registration_deadline IS NOT NULL
        AND e.registration_deadline BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '${hoursBeforeDeadline} hours'
        ORDER BY e.registration_deadline ASC
      `);
      return result.rows;
    } catch (error) {
      logger.error('Error finding registrations nearing deadline:', error);
      throw error;
    }
  }

  async generateRegistrationNumber(electionId: string): Promise<string> {
    try {
      const result = await this.query(
        'SELECT COUNT(*) + 1 as next_number FROM voter_registrations WHERE election_id = $1',
        [electionId]
      );
      const nextNumber = (result.rows[0] as any).next_number;
      return `REG-${electionId.substring(0, 8).toUpperCase()}-${nextNumber.toString().padStart(4, '0')}`;
    } catch (error) {
      logger.error('Error generating registration number:', error);
      throw error;
    }
  }

  async bulkApproveRegistrations(registrationIds: string[], approvedBy: string): Promise<number> {
    try {
      const result = await this.transaction(async (client) => {
        // Update registrations
        const result = await client.query(
          `UPDATE voter_registrations 
           SET registration_status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = $1
           WHERE id = ANY($2::uuid[])`,
          [approvedBy, registrationIds]
        );

        // Update election registration counts
        await client.query(
          `UPDATE elections 
           SET total_registered_voters = total_registered_voters + $1
           WHERE id IN (
             SELECT DISTINCT election_id FROM voter_registrations 
             WHERE id = ANY($2::uuid[])
           )`,
          [result.rowCount, registrationIds]
        );

        // Log bulk approval
        await client.query(
          `INSERT INTO audit_logs (user_id, action, resource_type, metadata)
           VALUES ($1, $2, $3, $4)`,
          [
            approvedBy,
            'bulk_registration_approval',
            'registration',
            JSON.stringify({ 
              approved_count: result.rowCount,
              registration_ids: registrationIds 
            })
          ]
        );

        return result.rowCount || 0;
      });
      return result;
    } catch (error) {
      logger.error('Error bulk approving registrations:', error);
      throw error;
    }
  }
}

export default new VoterRegistrationRepository();