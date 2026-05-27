import database from '../config/database';
import migrationRunner from './migrations/index';
import seedRunner from './seeds/index';
import logger from '../utils/logger';

export class DatabaseInitializer {
  async initialize(runSeeds: boolean = false): Promise<void> {
    try {
      logger.info('Starting database initialization...');

      // Test database connection
      const isConnected = await database.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to database');
      }

      // Run migrations
      logger.info('Running database migrations...');
      await migrationRunner.runMigrations();

      // Run seeds if requested
      if (runSeeds) {
        logger.info('Running database seeds...');
        await seedRunner.runSeeds();
      }

      // Refresh materialized views
      logger.info('Refreshing materialized views...');
      await this.refreshMaterializedViews();

      logger.info('Database initialization completed successfully');
    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  async refreshMaterializedViews(): Promise<void> {
    try {
      const client = await database.getClient();
      try {
        // Check if materialized view exists before refreshing
        const result = await client.query(`
          SELECT EXISTS (
            SELECT 1 FROM pg_matviews 
            WHERE matviewname = 'election_statistics'
          );
        `);

        if (result.rows[0].exists) {
          await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY election_statistics');
          logger.info('Materialized views refreshed');
        } else {
          logger.info('No materialized views to refresh yet');
        }
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error refreshing materialized views:', error);
      // Don't throw error for materialized view refresh failures
    }
  }

  async getStatus(): Promise<{
    connected: boolean;
    migrations: {
      total: number;
      executed: number;
      pending: string[];
    };
    health: any;
  }> {
    try {
      const connected = await database.testConnection();
      const migrationStatus = await migrationRunner.getStatus();
      const health = await database.healthCheck();

      return {
        connected,
        migrations: migrationStatus,
        health
      };
    } catch (error) {
      logger.error('Error getting database status:', error);
      return {
        connected: false,
        migrations: { total: 0, executed: 0, pending: [] },
        health: { status: 'unhealthy' }
      };
    }
  }

  async reset(): Promise<void> {
    logger.warn('Resetting database - this will drop all tables!');
    
    const client = await database.getClient();
    try {
      await client.query('BEGIN');

      // Drop all tables in reverse dependency order
      const tables = [
        'audit_logs',
        'voter_eligibility', 
        'otp_tokens',
        'voter_registrations',
        'votes_cache',
        'candidates',
        'elections',
        'users',
        'seeds',
        'migrations'
      ];

      for (const table of tables) {
        await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      }

      // Drop materialized views
      await client.query('DROP MATERIALIZED VIEW IF EXISTS election_statistics');

      // Drop functions
      const functions = [
        'update_updated_at_column()',
        'cleanup_expired_otp_tokens()',
        'is_voter_locked_out(UUID, UUID)',
        'get_voter_status(UUID, UUID)',
        'log_audit_event(UUID, VARCHAR, VARCHAR, UUID, TEXT, TEXT, INET, TEXT, BOOLEAN, TEXT, TEXT)',
        'cleanup_old_audit_logs(INTEGER)',
        'refresh_election_statistics()',
        'get_database_statistics()',
        'database_health_check()'
      ];

      for (const func of functions) {
        await client.query(`DROP FUNCTION IF EXISTS ${func}`);
      }

      // Drop views
      await client.query('DROP VIEW IF EXISTS recent_audit_activity');

      await client.query('COMMIT');
      logger.info('Database reset completed');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error resetting database:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Running database cleanup tasks...');
    
    const client = await database.getClient();
    try {
      // Clean up expired OTP tokens
      const otpResult = await client.query('SELECT cleanup_expired_otp_tokens()');
      const otpDeleted = otpResult.rows[0].cleanup_expired_otp_tokens;
      logger.info(`Cleaned up ${otpDeleted} expired OTP tokens`);

      // Clean up old audit logs (keep last 365 days)
      const auditResult = await client.query('SELECT cleanup_old_audit_logs(365)');
      const auditDeleted = auditResult.rows[0].cleanup_old_audit_logs;
      logger.info(`Cleaned up ${auditDeleted} old audit log entries`);

      // Refresh materialized views
      await this.refreshMaterializedViews();

      logger.info('Database cleanup completed');
    } catch (error) {
      logger.error('Error during database cleanup:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new DatabaseInitializer();