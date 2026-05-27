import { PoolClient } from 'pg';
import { Migration } from './index';

const migration: Migration = {
  id: '002_create_elections_table',
  name: 'Create elections table with advanced features',
  
  async up(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE elections (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        contract_address VARCHAR(42) UNIQUE NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        election_type VARCHAR(20) NOT NULL CHECK (election_type IN ('single_choice', 'multiple_choice', 'ranked_voting')),
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        is_public BOOLEAN DEFAULT TRUE,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'ended', 'cancelled')),
        max_votes_per_voter INTEGER DEFAULT 1,
        requires_registration BOOLEAN DEFAULT FALSE,
        registration_deadline TIMESTAMP,
        total_registered_voters INTEGER DEFAULT 0,
        total_votes_cast INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        CONSTRAINT valid_time_range CHECK (end_time > start_time),
        CONSTRAINT valid_registration_deadline CHECK (
          registration_deadline IS NULL OR 
          (requires_registration = TRUE AND registration_deadline <= start_time)
        ),
        CONSTRAINT valid_max_votes CHECK (max_votes_per_voter > 0)
      );

      -- Create indexes for performance
      CREATE INDEX idx_elections_contract_address ON elections(contract_address);
      CREATE INDEX idx_elections_creator_id ON elections(creator_id);
      CREATE INDEX idx_elections_status ON elections(status);
      CREATE INDEX idx_elections_start_time ON elections(start_time);
      CREATE INDEX idx_elections_end_time ON elections(end_time);
      CREATE INDEX idx_elections_is_public ON elections(is_public);
      CREATE INDEX idx_elections_election_type ON elections(election_type);
      CREATE INDEX idx_elections_created_at ON elections(created_at);

      -- Composite indexes for common queries
      CREATE INDEX idx_elections_status_start_time ON elections(status, start_time);
      CREATE INDEX idx_elections_public_status ON elections(is_public, status);

      -- Create trigger to update updated_at timestamp
      CREATE TRIGGER update_elections_updated_at 
        BEFORE UPDATE ON elections 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    `);
  },

  async down(client: PoolClient): Promise<void> {
    await client.query(`
      DROP TRIGGER IF EXISTS update_elections_updated_at ON elections;
      DROP TABLE IF EXISTS elections CASCADE;
    `);
  }
};

export default migration;