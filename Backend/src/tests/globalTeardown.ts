import database from '../config/database';
import logger from '../utils/logger';

export default async function globalTeardown(): Promise<void> {
    logger.info('===== Global Test Teardown Started =====');

    try {
        // Check if pool is still active before closing
        if (database && database.getPool() && !database.getPool().ending) {
            await database.close();
        }

        // Give some time for cleanup
        await new Promise(resolve => setTimeout(resolve, 500));

        logger.info('===== Global Test Teardown Completed =====');
    } catch (error) {
        logger.error('Global test teardown error:', error);
        // Don't throw - we want tests to exit even if cleanup fails
    }
}
