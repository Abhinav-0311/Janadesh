import { createClient, RedisClientType } from 'redis';
import config from './index';
import logger from '../utils/logger';

class RedisClient {
  private client: RedisClientType;
  private static instance: RedisClient;

  private constructor() {
    // Skip Redis client creation if disabled
    if (config.redis.host === 'disabled') {
      // Create a mock client that doesn't connect
      this.client = null as any;
      return;
    }

    const redisConfig = {
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password,
      database: config.redis.db,
    };

    this.client = createClient(redisConfig);

    // Handle Redis events only if client exists
    if (this.client) {
      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
      });

      this.client.on('error', (err: Error) => {
        logger.error('Redis client error:', err);
      });

      this.client.on('end', () => {
        logger.info('Redis client connection ended');
      });

      this.client.on('reconnecting', () => {
        logger.info('Redis client reconnecting');
      });
    }
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  public async connect(): Promise<void> {
    try {
      // Skip Redis connection if host is disabled
      if (config.redis.host === 'disabled') {
        logger.info('Redis is disabled, skipping connection');
        return;
      }

      if (this.client && !this.client.isOpen) {
        await this.client.connect();
        logger.info('Redis connection established');
      }
    } catch (error) {
      logger.warn('Failed to connect to Redis (continuing without Redis):', error);
      // Don't throw error - allow app to continue without Redis
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (config.redis.host === 'disabled' || !this.client) {
        logger.info('Redis is disabled, skipping disconnect');
        return;
      }
      
      if (this.client.isOpen) {
        await this.client.disconnect();
        logger.info('Redis connection closed');
      }
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }

  public getClient(): RedisClientType {
    return this.client;
  }

  // Cache operations
  public async set(key: string, value: string | object, ttl?: number): Promise<void> {
    try {
      if (config.redis.host === 'disabled' || !this.client || !this.client.isOpen) {
        logger.debug(`Cache set skipped (Redis disabled): ${key}`);
        return;
      }

      const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
      const expiration = ttl || config.redis.ttl;
      
      await this.client.setEx(key, expiration, serializedValue);
      logger.debug(`Cache set: ${key}`);
    } catch (error) {
      logger.warn(`Error setting cache key ${key} (continuing without cache):`, error);
      // Don't throw error - allow app to continue without Redis
    }
  }

  public async get(key: string): Promise<string | null> {
    try {
      if (config.redis.host === 'disabled' || !this.client || !this.client.isOpen) {
        logger.debug(`Cache get skipped (Redis disabled): ${key}`);
        return null;
      }

      const value = await this.client.get(key);
      logger.debug(`Cache get: ${key} - ${value ? 'hit' : 'miss'}`);
      return value;
    } catch (error) {
      logger.warn(`Error getting cache key ${key} (returning null):`, error);
      return null;
    }
  }

  public async getObject<T>(key: string): Promise<T | null> {
    try {
      const value = await this.get(key);
      if (!value) return null;
      
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Error parsing cached object for key ${key}:`, error);
      return null;
    }
  }

  public async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
      logger.debug(`Cache deleted: ${key}`);
    } catch (error) {
      logger.error(`Error deleting cache key ${key}:`, error);
      throw error;
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Error checking cache key existence ${key}:`, error);
      return false;
    }
  }

  public async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.client.expire(key, seconds);
      logger.debug(`Cache expiration set: ${key} - ${seconds}s`);
    } catch (error) {
      logger.error(`Error setting expiration for key ${key}:`, error);
      throw error;
    }
  }

  public async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error(`Error getting TTL for key ${key}:`, error);
      return -1;
    }
  }

  // Session management operations
  public async setSession(sessionId: string, sessionData: object, ttl?: number): Promise<void> {
    const key = `session:${sessionId}`;
    await this.set(key, sessionData, ttl);
  }

  public async getSession<T>(sessionId: string): Promise<T | null> {
    const key = `session:${sessionId}`;
    return await this.getObject<T>(key);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await this.del(key);
  }

  public async extendSession(sessionId: string, ttl: number): Promise<void> {
    const key = `session:${sessionId}`;
    await this.expire(key, ttl);
  }

  // Rate limiting operations
  public async incrementRateLimit(key: string, windowMs: number): Promise<number> {
    try {
      const multi = this.client.multi();
      multi.incr(key);
      multi.expire(key, Math.ceil(windowMs / 1000));
      const results = await multi.exec();
      
      return results?.[0] as number || 0;
    } catch (error) {
      logger.error(`Error incrementing rate limit for key ${key}:`, error);
      throw error;
    }
  }

  // Health check
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    latency: number;
    memory: object | null;
  }> {
    try {
      // If Redis is disabled, return disabled status
      if (config.redis.host === 'disabled') {
        return {
          status: 'unhealthy',
          latency: -1,
          memory: { status: 'disabled' },
        };
      }

      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;

      const memory = await this.client.sendCommand(['MEMORY', 'USAGE']);

      return {
        status: 'healthy',
        latency,
        memory: memory as object || null,
      };
    } catch (error) {
      logger.warn('Redis health check failed (Redis disabled):', error);
      return {
        status: 'unhealthy',
        latency: -1,
        memory: { status: 'unavailable' },
      };
    }
  }

  // Utility methods
  public async flushAll(): Promise<void> {
    try {
      await this.client.flushAll();
      logger.info('Redis cache flushed');
    } catch (error) {
      logger.error('Error flushing Redis cache:', error);
      throw error;
    }
  }

  public async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error(`Error getting keys with pattern ${pattern}:`, error);
      return [];
    }
  }
}

export default RedisClient.getInstance();