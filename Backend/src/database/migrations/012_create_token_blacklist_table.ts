import { PoolClient } from 'pg';

export default {
    id: '012_create_token_blacklist_table',
    name: 'Create token blacklist table',

    up: async (client: PoolClient): Promise<void> => {
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_blacklist (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                token_hash VARCHAR(255) NOT NULL UNIQUE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_token_blacklist_token_hash ON token_blacklist(token_hash);
            CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist(expires_at);
        `);
    },

    down: async (client: PoolClient): Promise<void> => {
        await client.query(`
            DROP INDEX IF EXISTS idx_token_blacklist_expires_at;
            DROP INDEX IF EXISTS idx_token_blacklist_token_hash;
            DROP TABLE IF EXISTS token_blacklist;
        `);
    }
};
