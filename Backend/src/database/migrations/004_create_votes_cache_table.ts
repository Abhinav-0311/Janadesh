import { PoolClient } from 'pg';
import { Migration } from './index';

const migration: Migration = {
  id: '004_create_votes_cache_table',
  name: 'Create votes cache table for blockchain synchronization',
  
  async up(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE votes_cache (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
        voter_address VARCHAR(42) NOT NULL,
        voter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        transaction_hash VARCHAR(66) NOT NULL,
        block_number BIGINT,
        vote_weight INTEGER DEFAULT 1,
        is_verified BOOLEAN DEFAULT FALSE,
        voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        CONSTRAINT valid_vote_weight CHECK (vote_weight > 0),
        CONSTRAINT unique_voter_election UNIQUE (election_id, voter_address),
        CONSTRAINT unique_transaction_hash UNIQUE (transaction_hash)
      );

      -- Create indexes for performance
      CREATE INDEX idx_votes_cache_election_id ON votes_cache(election_id);
      CREATE INDEX idx_votes_cache_voter_address ON votes_cache(voter_address);
      CREATE INDEX idx_votes_cache_voter_id ON votes_cache(voter_id);
      CREATE INDEX idx_votes_cache_candidate_id ON votes_cache(candidate_id);
      CREATE INDEX idx_votes_cache_transaction_hash ON votes_cache(transaction_hash);
      CREATE INDEX idx_votes_cache_block_number ON votes_cache(block_number);
      CREATE INDEX idx_votes_cache_is_verified ON votes_cache(is_verified);
      CREATE INDEX idx_votes_cache_voted_at ON votes_cache(voted_at);

      -- Composite indexes for common queries
      CREATE INDEX idx_votes_cache_election_verified ON votes_cache(election_id, is_verified);
      CREATE INDEX idx_votes_cache_candidate_verified ON votes_cache(candidate_id, is_verified);
      CREATE INDEX idx_votes_cache_voter_election ON votes_cache(voter_id, election_id);

      -- Create trigger to update updated_at timestamp
      CREATE TRIGGER update_votes_cache_updated_at 
        BEFORE UPDATE ON votes_cache 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    `);
  },

  async down(client: PoolClient): Promise<void> {
    await client.query(`
      DROP TRIGGER IF EXISTS update_votes_cache_updated_at ON votes_cache;
      DROP TABLE IF EXISTS votes_cache CASCADE;
    `);
  }
};

export default migration;