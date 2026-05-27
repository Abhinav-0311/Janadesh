import { PoolClient } from 'pg';
import { Migration } from './index';

const migration: Migration = {
  id: '003_create_candidates_table',
  name: 'Create candidates table with position tracking',
  
  async up(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE candidates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        image_url VARCHAR(500),
        position INTEGER NOT NULL,
        vote_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        CONSTRAINT valid_position CHECK (position >= 0),
        CONSTRAINT valid_vote_count CHECK (vote_count >= 0),
        CONSTRAINT unique_election_position UNIQUE (election_id, position)
      );

      -- Create indexes for performance
      CREATE INDEX idx_candidates_election_id ON candidates(election_id);
      CREATE INDEX idx_candidates_position ON candidates(position);
      CREATE INDEX idx_candidates_is_active ON candidates(is_active);
      CREATE INDEX idx_candidates_vote_count ON candidates(vote_count);
      CREATE INDEX idx_candidates_created_at ON candidates(created_at);

      -- Composite indexes for common queries
      CREATE INDEX idx_candidates_election_active ON candidates(election_id, is_active);
      CREATE INDEX idx_candidates_election_position ON candidates(election_id, position);

      -- Create trigger to update updated_at timestamp
      CREATE TRIGGER update_candidates_updated_at 
        BEFORE UPDATE ON candidates 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    `);
  },

  async down(client: PoolClient): Promise<void> {
    await client.query(`
      DROP TRIGGER IF EXISTS update_candidates_updated_at ON candidates;
      DROP TABLE IF EXISTS candidates CASCADE;
    `);
  }
};

export default migration;