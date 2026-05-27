import { PoolClient } from 'pg';
import database from '../../config/database';
import logger from '../../utils/logger';

export interface Migration {
  id: string;
  name: string;
  up: (client: PoolClient) => Promise<void>;
  down: (client: PoolClient) => Promise<void>;
}

class MigrationRunner {
  private migrations: Migration[] = [];

  constructor() {
    // Import all migrations here
    this.loadMigrations();
  }

  private loadMigrations() {
    // Migrations will be loaded in order
    const migrationFiles = [
      require('./001_create_users_table'),
      require('./002_create_elections_table'),
      require('./003_create_candidates_table'),
      require('./004_create_votes_cache_table'),
      require('./005_create_voter_registrations_table'),
      require('./006_create_otp_tokens_table'),
      require('./007_create_voter_eligibility_table'),
      require('./008_create_audit_logs_table'),
      require('./009_create_indexes'),
      require('./010_alter_wallet_address_nullable'),
      require('./011_create_refresh_tokens_table'),
      require('./012_create_token_blacklist_table'),
      require('./013_alter_contract_address_nullable'),
    ];

    this.migrations = migrationFiles.map(file => file.default);
  }

  async createMigrationsTable(): Promise<void> {
    const client = await database.getClient();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      logger.info('Migrations table created or already exists');
    } catch (error) {
      logger.error('Error creating migrations table:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getExecutedMigrations(): Promise<string[]> {
    const client = await database.getClient();
    try {
      const result = await client.query('SELECT id FROM migrations ORDER BY executed_at');
      return result.rows.map(row => row.id);
    } catch (error) {
      logger.error('Error getting executed migrations:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async executeMigration(migration: Migration): Promise<void> {
    const client = await database.getClient();
    try {
      await client.query('BEGIN');

      // Execute the migration
      await migration.up(client);

      // Record the migration as executed
      await client.query(
        'INSERT INTO migrations (id, name) VALUES ($1, $2)',
        [migration.id, migration.name]
      );

      await client.query('COMMIT');
      logger.info(`Migration ${migration.id} executed successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error executing migration ${migration.id}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async rollbackMigration(migration: Migration): Promise<void> {
    const client = await database.getClient();
    try {
      await client.query('BEGIN');

      // Execute the rollback
      await migration.down(client);

      // Remove the migration record
      await client.query('DELETE FROM migrations WHERE id = $1', [migration.id]);

      await client.query('COMMIT');
      logger.info(`Migration ${migration.id} rolled back successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error rolling back migration ${migration.id}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async runMigrations(): Promise<void> {
    try {
      await this.createMigrationsTable();
      const executedMigrations = await this.getExecutedMigrations();

      const pendingMigrations = this.migrations.filter(
        migration => !executedMigrations.includes(migration.id)
      );

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations to execute');
        return;
      }

      logger.info(`Executing ${pendingMigrations.length} pending migrations`);

      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }

      logger.info('All migrations executed successfully');
    } catch (error) {
      logger.error('Error running migrations:', error);
      throw error;
    }
  }

  async rollbackLastMigration(): Promise<void> {
    try {
      const executedMigrations = await this.getExecutedMigrations();

      if (executedMigrations.length === 0) {
        logger.info('No migrations to rollback');
        return;
      }

      const lastMigrationId = executedMigrations[executedMigrations.length - 1];
      const migration = this.migrations.find(m => m.id === lastMigrationId);

      if (!migration) {
        throw new Error(`Migration ${lastMigrationId} not found`);
      }

      await this.rollbackMigration(migration);
      logger.info('Last migration rolled back successfully');
    } catch (error) {
      logger.error('Error rolling back migration:', error);
      throw error;
    }
  }

  async getStatus(): Promise<{
    total: number;
    executed: number;
    pending: string[];
  }> {
    const executedMigrations = await this.getExecutedMigrations();
    const pendingMigrations = this.migrations
      .filter(migration => !executedMigrations.includes(migration.id))
      .map(migration => migration.id);

    return {
      total: this.migrations.length,
      executed: executedMigrations.length,
      pending: pendingMigrations,
    };
  }
}

export default new MigrationRunner();