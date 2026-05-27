import { PoolClient } from 'pg';
import { Migration } from './index';

const migration: Migration = {
  id: '007_create_voter_eligibility_table',
  name: 'Create voter eligibility table for comprehensive voter status tracking',
  
  async up(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE voter_eligibility (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
        is_eligible BOOLEAN DEFAULT FALSE,
        eligibility_reason TEXT,
        verified_at TIMESTAMP,
        verified_by UUID REFERENCES users(id),
        registration_required BOOLEAN DEFAULT FALSE,
        has_voted BOOLEAN DEFAULT FALSE,
        vote_timestamp TIMESTAMP,
        lockout_until TIMESTAMP,
        lockout_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        CONSTRAINT unique_user_election_eligibility UNIQUE (user_id, election_id),
        CONSTRAINT valid_verification_data CHECK (
          (is_eligible = TRUE AND verified_at IS NOT NULL) OR
          (is_eligible = FALSE)
        ),
        CONSTRAINT valid_vote_data CHECK (
          (has_voted = TRUE AND vote_timestamp IS NOT NULL) OR
          (has_voted = FALSE AND vote_timestamp IS NULL)
        ),
        CONSTRAINT valid_lockout_data CHECK (
          (lockout_until IS NOT NULL AND lockout_reason IS NOT NULL) OR
          (lockout_until IS NULL AND lockout_reason IS NULL)
        ),
        CONSTRAINT valid_vote_timestamp CHECK (
          vote_timestamp IS NULL OR vote_timestamp >= created_at
        )
      );

      -- Create indexes for performance
      CREATE INDEX idx_voter_eligibility_user_id ON voter_eligibility(user_id);
      CREATE INDEX idx_voter_eligibility_election_id ON voter_eligibility(election_id);
      CREATE INDEX idx_voter_eligibility_is_eligible ON voter_eligibility(is_eligible);
      CREATE INDEX idx_voter_eligibility_has_voted ON voter_eligibility(has_voted);
      CREATE INDEX idx_voter_eligibility_verified_at ON voter_eligibility(verified_at);
      CREATE INDEX idx_voter_eligibility_verified_by ON voter_eligibility(verified_by);
      CREATE INDEX idx_voter_eligibility_vote_timestamp ON voter_eligibility(vote_timestamp);
      CREATE INDEX idx_voter_eligibility_lockout_until ON voter_eligibility(lockout_until);

      -- Composite indexes for common queries
      CREATE INDEX idx_voter_eligibility_election_eligible ON voter_eligibility(election_id, is_eligible);
      CREATE INDEX idx_voter_eligibility_election_voted ON voter_eligibility(election_id, has_voted);
      CREATE INDEX idx_voter_eligibility_user_eligible ON voter_eligibility(user_id, is_eligible);
      CREATE INDEX idx_voter_eligibility_active_lockouts ON voter_eligibility(lockout_until) 
        WHERE lockout_until IS NOT NULL;

      -- Create trigger to update updated_at timestamp
      CREATE TRIGGER update_voter_eligibility_updated_at 
        BEFORE UPDATE ON voter_eligibility 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();

      -- Create function to check if voter is currently locked out
      CREATE OR REPLACE FUNCTION is_voter_locked_out(p_user_id UUID, p_election_id UUID)
      RETURNS BOOLEAN AS $$
      DECLARE
        lockout_time TIMESTAMP;
      BEGIN
        SELECT lockout_until INTO lockout_time
        FROM voter_eligibility
        WHERE user_id = p_user_id AND election_id = p_election_id;
        
        RETURN (lockout_time IS NOT NULL AND lockout_time > CURRENT_TIMESTAMP);
      END;
      $$ LANGUAGE plpgsql;

      -- Create function to get voter status summary
      CREATE OR REPLACE FUNCTION get_voter_status(p_user_id UUID, p_election_id UUID)
      RETURNS TABLE (
        is_eligible BOOLEAN,
        has_voted BOOLEAN,
        is_locked_out BOOLEAN,
        lockout_until TIMESTAMP,
        eligibility_reason TEXT,
        lockout_reason TEXT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          ve.is_eligible,
          ve.has_voted,
          (ve.lockout_until IS NOT NULL AND ve.lockout_until > CURRENT_TIMESTAMP) as is_locked_out,
          ve.lockout_until,
          ve.eligibility_reason,
          ve.lockout_reason
        FROM voter_eligibility ve
        WHERE ve.user_id = p_user_id AND ve.election_id = p_election_id;
      END;
      $$ LANGUAGE plpgsql;
    `);
  },

  async down(client: PoolClient): Promise<void> {
    await client.query(`
      DROP FUNCTION IF EXISTS get_voter_status(UUID, UUID);
      DROP FUNCTION IF EXISTS is_voter_locked_out(UUID, UUID);
      DROP TRIGGER IF EXISTS update_voter_eligibility_updated_at ON voter_eligibility;
      DROP TABLE IF EXISTS voter_eligibility CASCADE;
    `);
  }
};

export default migration;