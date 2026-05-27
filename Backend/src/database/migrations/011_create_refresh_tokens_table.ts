import { PoolClient } from 'pg';

export default {
    id: '011_create_refresh_tokens_table',
    name: 'Create refresh tokens table',

    up: async (client: PoolClient): Promise<void> => {
        await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL UNIQUE,
        is_used BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        used_at TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
    `);
    },

    down: async (client: PoolClient): Promise<void> => {
        await client.query(`
      DROP INDEX IF EXISTS idx_refresh_tokens_expires_at;
      DROP INDEX IF EXISTS idx_refresh_tokens_user_id;
      DROP INDEX IF EXISTS idx_refresh_tokens_token_hash;
      DROP TABLE IF EXISTS refresh_tokens;
    `);
    }
};
