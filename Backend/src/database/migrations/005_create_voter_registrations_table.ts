import { PoolClient } from 'pg';
import { Migration } from './index';

const migration: Migration = {
  id: '005_create_voter_registrations_table',
  name: 'Create voter registrations table for election-specific registration tracking',
  
  async up(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE voter_registrations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
        registration_number VARCHAR(100) NOT NULL,
        registration_status VARCHAR(20) DEFAULT 'pending' CHECK (
          registration_status IN ('pending', 'approved', 'rejected', 'expired')
        ),
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP,
        approved_by UUID REFERENCES users(id),
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        CONSTRAINT unique_user_election_registration UNIQUE (user_id, election_id),
        CONSTRAINT unique_election_registration_number UNIQUE (election_id, registration_number),
        CONSTRAINT valid_approval_data CHECK (
          (registration_status = 'approved' AND approved_at IS NOT NULL AND approved_by IS NOT NULL) OR
          (registration_status != 'approved')
        ),
        CONSTRAINT valid_rejection_data CHECK (
          (registration_status = 'rejected' AND rejection_reason IS NOT NULL) OR
          (registration_status != 'rejected')
        )
      );

      -- Create indexes for performance
      CREATE INDEX idx_voter_registrations_user_id ON voter_registrations(user_id);
      CREATE INDEX idx_voter_registrations_election_id ON voter_registrations(election_id);
      CREATE INDEX idx_voter_registrations_status ON voter_registrations(registration_status);
      CREATE INDEX idx_voter_registrations_registration_number ON voter_registrations(registration_number);
      CREATE INDEX idx_voter_registrations_registered_at ON voter_registrations(registered_at);
      CREATE INDEX idx_voter_registrations_approved_by ON voter_registrations(approved_by);

      -- Composite indexes for common queries
      CREATE INDEX idx_voter_registrations_election_status ON voter_registrations(election_id, registration_status);
      CREATE INDEX idx_voter_registrations_user_status ON voter_registrations(user_id, registration_status);

      -- Create trigger to update updated_at timestamp
      CREATE TRIGGER update_voter_registrations_updated_at 
        BEFORE UPDATE ON voter_registrations 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    `);
  },

  async down(client: PoolClient): Promise<void> {
    await client.query(`
      DROP TRIGGER IF EXISTS update_voter_registrations_updated_at ON voter_registrations;
      DROP TABLE IF EXISTS voter_registrations CASCADE;
    `);
  }
};

export default migration;