#!/usr/bin/env ts-node

import { Command } from 'commander';
import databaseInitializer from '../database/init';
import migrationRunner from '../database/migrations/index';
import seedRunner from '../database/seeds/index';
import database from '../config/database';
import logger from '../utils/logger';

const program = new Command();

program
  .name('database')
  .description('Database management CLI')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize database with migrations')
  .option('--seeds', 'Run seeds after migrations')
  .action(async (options) => {
    try {
      await databaseInitializer.initialize(options.seeds);
      process.exit(0);
    } catch (error) {
      logger.error('Database initialization failed:', error);
      process.exit(1);
    }
  });

program
  .command('migrate')
  .description('Run pending migrations')
  .action(async () => {
    try {
      await migrationRunner.runMigrations();
      process.exit(0);
    } catch (error) {
      logger.error('Migration failed:', error);
      process.exit(1);
    }
  });

program
  .command('rollback')
  .description('Rollback last migration')
  .action(async () => {
    try {
      await migrationRunner.rollbackLastMigration();
      process.exit(0);
    } catch (error) {
      logger.error('Rollback failed:', error);
      process.exit(1);
    }
  });

program
  .command('seed')
  .description('Run database seeds')
  .action(async () => {
    try {
      await seedRunner.runSeeds();
      process.exit(0);
    } catch (error) {
      logger.error('Seeding failed:', error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show database status')
  .action(async () => {
    try {
      const status = await databaseInitializer.getStatus();
      console.log('\n=== Database Status ===');
      console.log(`Connected: ${status.connected}`);
      console.log(`\nMigrations:`);
      console.log(`  Total: ${status.migrations.total}`);
      console.log(`  Executed: ${status.migrations.executed}`);
      console.log(`  Pending: ${status.migrations.pending.length}`);
      if (status.migrations.pending.length > 0) {
        console.log(`  Pending migrations: ${status.migrations.pending.join(', ')}`);
      }
      console.log(`\nHealth:`);
      console.log(`  Status: ${status.health.status}`);
      console.log(`  Total Connections: ${status.health.totalConnections}`);
      console.log(`  Idle Connections: ${status.health.idleConnections}`);
      console.log(`  Waiting Connections: ${status.health.waitingConnections}`);
      process.exit(0);
    } catch (error) {
      logger.error('Failed to get database status:', error);
      process.exit(1);
    }
  });

program
  .command('reset')
  .description('Reset database (WARNING: This will drop all data!)')
  .option('--confirm', 'Confirm the reset operation')
  .action(async (options) => {
    if (!options.confirm) {
      console.log('This operation will drop all database tables and data!');
      console.log('Use --confirm flag to proceed.');
      process.exit(1);
    }

    try {
      await databaseInitializer.reset();
      console.log('Database reset completed');
      process.exit(0);
    } catch (error) {
      logger.error('Database reset failed:', error);
      process.exit(1);
    }
  });

program
  .command('cleanup')
  .description('Run database cleanup tasks')
  .action(async () => {
    try {
      await databaseInitializer.cleanup();
      process.exit(0);
    } catch (error) {
      logger.error('Database cleanup failed:', error);
      process.exit(1);
    }
  });

program
  .command('health')
  .description('Run database health check')
  .action(async () => {
    try {
      const client = await database.getClient();
      try {
        const result = await client.query('SELECT * FROM database_health_check()');
        console.log('\n=== Database Health Check ===');
        result.rows.forEach(row => {
          console.log(`${row.metric}: ${row.value} (${row.status})`);
        });
      } finally {
        client.release();
      }
      process.exit(0);
    } catch (error) {
      logger.error('Health check failed:', error);
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show database statistics')
  .action(async () => {
    try {
      const client = await database.getClient();
      try {
        const result = await client.query('SELECT * FROM get_database_statistics()');
        console.log('\n=== Database Statistics ===');
        console.log('Table Name'.padEnd(30) + 'Rows'.padEnd(15) + 'Table Size'.padEnd(15) + 'Index Size'.padEnd(15) + 'Total Size');
        console.log('-'.repeat(90));
        result.rows.forEach(row => {
          console.log(
            row.table_name.padEnd(30) +
            row.row_count.toString().padEnd(15) +
            row.table_size.padEnd(15) +
            row.index_size.padEnd(15) +
            row.total_size
          );
        });
      } finally {
        client.release();
      }
      process.exit(0);
    } catch (error) {
      logger.error('Failed to get database statistics:', error);
      process.exit(1);
    }
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

program.parse();