import { PoolClient } from 'pg';
import { Migration } from './index';

const migration: Migration = {
  id: '001_create_users_table',
  name: 'Create users table with registration tracking',
  
  async up(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        wallet_address VARCHAR(42) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        registration_number VARCHAR(50) UNIQUE NOT NULL,
        is_verified BOOLEAN DEFAULT FALSE,
        is_email_verified BOOLEAN DEFAULT FALSE,
        role VARCHAR(20) DEFAULT 'voter' CHECK (role IN ('voter', 'admin', 'creator')),
        voter_status VARCHAR(20) DEFAULT 'eligible' CHECK (voter_status IN ('eligible', 'voted', 'locked_out', 'suspended')),
        last_login TIMESTAMP,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for performance
      CREATE INDEX idx_users_wallet_address ON users(wallet_address);
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_registration_number ON users(registration_number);
      CREATE INDEX idx_users_voter_status ON users(voter_status);
      CREATE INDEX idx_users_role ON users(role);
      CREATE INDEX idx_users_created_at ON users(created_at);

      -- Create trigger to update updated_at timestamp
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      CREATE TRIGGER update_users_updated_at 
        BEFORE UPDATE ON users 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    `);
  },

  async down(client: PoolClient): Promise<void> {
    await client.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      DROP FUNCTION IF EXISTS update_updated_at_column();
      DROP TABLE IF EXISTS users CASCADE;
    `);
  }
};

export default migration;