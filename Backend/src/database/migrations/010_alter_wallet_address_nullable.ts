import { PoolClient } from 'pg';
import { Migration } from './index';

const migration: Migration = {
    id: '010_alter_wallet_address_nullable',
    name: 'Make wallet_address nullable and handle unique constraint',

    async up(client: PoolClient): Promise<void> {
        await client.query(`
      -- First, update any empty string wallet addresses to NULL
      UPDATE users SET wallet_address = NULL WHERE wallet_address = '';
      
      -- Drop the unique constraint on wallet_address
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_wallet_address_key;
      
      -- Make wallet_address nullable
      ALTER TABLE users ALTER COLUMN wallet_address DROP NOT NULL;
      
      -- Add a partial unique index that only applies to non-NULL values
      CREATE UNIQUE INDEX users_wallet_address_unique_idx 
        ON users(wallet_address) 
        WHERE wallet_address IS NOT NULL;
      
      -- Drop the old index if it exists
      DROP INDEX IF EXISTS idx_users_wallet_address;
      
      -- Create a new index that includes NULL values for lookups
      CREATE INDEX idx_users_wallet_address ON users(wallet_address);
    `);
    },

    async down(client: PoolClient): Promise<void> {
        await client.query(`
      -- Remove the partial unique index
      DROP INDEX IF EXISTS users_wallet_address_unique_idx;
      
      -- Update NULL values to empty string
      UPDATE users SET wallet_address = '' WHERE wallet_address IS NULL;
      
      -- Make wallet_address NOT NULL again
      ALTER TABLE users ALTER COLUMN wallet_address SET NOT NULL;
      
      -- Recreate the unique constraint
      ALTER TABLE users ADD CONSTRAINT users_wallet_address_key UNIQUE (wallet_address);
    `);
    }
};

export default migration;
