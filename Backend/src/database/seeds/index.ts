import { PoolClient } from 'pg';
import database from '../../config/database';
import logger from '../../utils/logger';
import bcrypt from 'bcryptjs';

export interface Seed {
  id: string;
  name: string;
  run: (client: PoolClient) => Promise<void>;
}

class SeedRunner {
  private seeds: Seed[] = [];

  constructor() {
    this.loadSeeds();
  }

  private loadSeeds() {
    // Load seeds in order
    this.seeds = [
      {
        id: 'create_admin_user',
        name: 'Create default admin user',
        run: this.createAdminUser
      },
      {
        id: 'create_sample_users',
        name: 'Create sample voter users',
        run: this.createSampleUsers
      }
    ];
  }

  private async createAdminUser(client: PoolClient): Promise<void> {
    const adminEmail = 'admin@voting.local';
    const adminPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    await client.query(`
      INSERT INTO users (
        wallet_address, email, username, first_name, last_name,
        registration_number, is_verified, is_email_verified, role, voter_status
      ) VALUES (
        '0x0000000000000000000000000000000000000001',
        $1, 'admin', 'System', 'Administrator',
        'ADMIN001', true, true, 'admin', 'eligible'
      ) ON CONFLICT (email) DO NOTHING
    `, [adminEmail]);

    logger.info('Admin user created or already exists');
  }

  private async createSampleUsers(client: PoolClient): Promise<void> {
    const sampleUsers = [
      {
        wallet: '0x1234567890123456789012345678901234567890',
        email: 'voter1@voting.local',
        username: 'voter1',
        firstName: 'John',
        lastName: 'Doe',
        regNumber: 'REG001'
      },
      {
        wallet: '0x2345678901234567890123456789012345678901',
        email: 'voter2@voting.local',
        username: 'voter2',
        firstName: 'Jane',
        lastName: 'Smith',
        regNumber: 'REG002'
      },
      {
        wallet: '0x3456789012345678901234567890123456789012',
        email: 'creator1@voting.local',
        username: 'creator1',
        firstName: 'Alice',
        lastName: 'Johnson',
        regNumber: 'CRT001'
      }
    ];

    for (const user of sampleUsers) {
      const role = user.username.startsWith('creator') ? 'creator' : 'voter';
      
      await client.query(`
        INSERT INTO users (
          wallet_address, email, username, first_name, last_name,
          registration_number, is_verified, is_email_verified, role, voter_status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, true, true, $7, 'eligible'
        ) ON CONFLICT (email) DO NOTHING
      `, [
        user.wallet, user.email, user.username, user.firstName, 
        user.lastName, user.regNumber, role
      ]);
    }

    logger.info('Sample users created or already exist');
  }

  async createSeedsTable(): Promise<void> {
    const client = await database.getClient();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS seeds (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      logger.info('Seeds table created or already exists');
    } catch (error) {
      logger.error('Error creating seeds table:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getExecutedSeeds(): Promise<string[]> {
    const client = await database.getClient();
    try {
      const result = await client.query('SELECT id FROM seeds ORDER BY executed_at');
      return result.rows.map(row => row.id);
    } catch (error) {
      logger.error('Error getting executed seeds:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async executeSeed(seed: Seed): Promise<void> {
    const client = await database.getClient();
    try {
      await client.query('BEGIN');
      
      // Execute the seed
      await seed.run(client);
      
      // Record the seed as executed
      await client.query(
        'INSERT INTO seeds (id, name) VALUES ($1, $2)',
        [seed.id, seed.name]
      );
      
      await client.query('COMMIT');
      logger.info(`Seed ${seed.id} executed successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error executing seed ${seed.id}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async runSeeds(): Promise<void> {
    try {
      await this.createSeedsTable();
      const executedSeeds = await this.getExecutedSeeds();
      
      const pendingSeeds = this.seeds.filter(
        seed => !executedSeeds.includes(seed.id)
      );

      if (pendingSeeds.length === 0) {
        logger.info('No pending seeds to execute');
        return;
      }

      logger.info(`Executing ${pendingSeeds.length} pending seeds`);
      
      for (const seed of pendingSeeds) {
        await this.executeSeed(seed);
      }
      
      logger.info('All seeds executed successfully');
    } catch (error) {
      logger.error('Error running seeds:', error);
      throw error;
    }
  }
}

export default new SeedRunner();