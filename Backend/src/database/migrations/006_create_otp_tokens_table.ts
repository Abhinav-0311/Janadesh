import { PoolClient } from 'pg';
import { Migration } from './index';

const migration: Migration = {
  id: '006_create_otp_tokens_table',
  name: 'Create OTP tokens table for authentication and verification',
  
  async up(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE otp_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(10) NOT NULL,
        token_type VARCHAR(30) NOT NULL CHECK (
          token_type IN ('email_verification', 'login', 'password_reset', 'voting_access')
        ),
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        used_at TIMESTAMP,
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        purpose_data TEXT, -- JSON string for additional context
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        CONSTRAINT valid_token_length CHECK (LENGTH(token) >= 4 AND LENGTH(token) <= 10),
        CONSTRAINT valid_max_attempts CHECK (max_attempts > 0),
        CONSTRAINT valid_attempts CHECK (attempts >= 0 AND attempts <= max_attempts),
        CONSTRAINT valid_used_data CHECK (
          (is_used = TRUE AND used_at IS NOT NULL) OR
          (is_used = FALSE AND used_at IS NULL)
        ),
        CONSTRAINT valid_expiry CHECK (expires_at > created_at)
      );

      -- Create indexes for performance
      CREATE INDEX idx_otp_tokens_user_id ON otp_tokens(user_id);
      CREATE INDEX idx_otp_tokens_token ON otp_tokens(token);
      CREATE INDEX idx_otp_tokens_token_type ON otp_tokens(token_type);
      CREATE INDEX idx_otp_tokens_expires_at ON otp_tokens(expires_at);
      CREATE INDEX idx_otp_tokens_is_used ON otp_tokens(is_used);
      CREATE INDEX idx_otp_tokens_created_at ON otp_tokens(created_at);

      -- Composite indexes for common queries
      CREATE INDEX idx_otp_tokens_user_type ON otp_tokens(user_id, token_type);
      CREATE INDEX idx_otp_tokens_token_type_used ON otp_tokens(token, token_type, is_used);
      CREATE INDEX idx_otp_tokens_user_type_used ON otp_tokens(user_id, token_type, is_used);
      CREATE INDEX idx_otp_tokens_active ON otp_tokens(user_id, token_type, is_used, expires_at) 
        WHERE is_used = FALSE;

      -- Create trigger to update updated_at timestamp
      CREATE TRIGGER update_otp_tokens_updated_at 
        BEFORE UPDATE ON otp_tokens 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();

      -- Create function to clean up expired tokens
      CREATE OR REPLACE FUNCTION cleanup_expired_otp_tokens()
      RETURNS INTEGER AS $$
      DECLARE
        deleted_count INTEGER;
      BEGIN
        DELETE FROM otp_tokens 
        WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '24 hours';
        
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        RETURN deleted_count;
      END;
      $$ LANGUAGE plpgsql;
    `);
  },

  async down(client: PoolClient): Promise<void> {
    await client.query(`
      DROP FUNCTION IF EXISTS cleanup_expired_otp_tokens();
      DROP TRIGGER IF EXISTS update_otp_tokens_updated_at ON otp_tokens;
      DROP TABLE IF EXISTS otp_tokens CASCADE;
    `);
  }
};

export default migration;