// Simple test to verify TypeScript compilation and imports
import config from './config';
import logger from './utils/logger';
import database from './config/database';
import redisClient from './config/redis';

console.log('Testing backend setup...');
console.log('Config loaded:', !!config);
console.log('Logger loaded:', !!logger);
console.log('Database loaded:', !!database);
console.log('Redis client loaded:', !!redisClient);
console.log('Backend setup test completed successfully!');