import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import databaseInitializer from '../database/init';
import logger from '../utils/logger';

export default async function globalSetup(): Promise<void> {
  // Load test environment variables
  loadEnv({ path: resolve(__dirname, '../../.env.test') });

  logger.info('===== Global Test Setup Started =====');

  try {
    // Initialize test database
    logger.info('Initializing test database...');
    await databaseInitializer.reset();
    await databaseInitializer.initialize(false); // Recreate schema without sample seed data

    logger.info('Test database initialized successfully');
    logger.info('===== Global Test Setup Completed =====');
  } catch (error) {
    logger.error('Global test setup failed:', error);
    throw error;
  }
}
