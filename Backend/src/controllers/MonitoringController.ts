import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { ForbiddenError } from '../types';
import logger from '../utils/logger';
import database from '../config/database';
import redisClient from '../config/redis';
import WebSocketManager from '../services/WebSocketManager';
import config from '../config';
import os from 'os';
import process from 'process';

export class MonitoringController {
    /**
     * Get comprehensive system health status
     */
    async getSystemHealth(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;

            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access system health monitoring');
            }

            // Get health status from all services
            const [dbHealth, redisHealth] = await Promise.all([
                database.healthCheck(),
                redisClient.healthCheck()
            ]);

            const wsManager = WebSocketManager.getInstance();
            const wsStats = wsManager.getStats();
            const wsHealth = {
                status: wsManager.isInitialized() ? 'healthy' : 'unhealthy',
                connections: wsStats?.totalConnections || 0,
                stats: wsStats,
            };

            // System metrics
            const systemMetrics = {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: {
                    loadAverage: os.loadavg(),
                    cpuCount: os.cpus().length,
                    platform: os.platform(),
                    arch: os.arch()
                },
                system: {
                    totalMemory: os.totalmem(),
                    freeMemory: os.freemem(),
                    hostname: os.hostname(),
                    nodeVersion: process.version
                }
            };

            // Overall health status
            const overallStatus =
                dbHealth.status === 'healthy' &&
                    redisHealth.status === 'healthy' &&
                    wsHealth.status === 'healthy'
                    ? 'healthy' : 'unhealthy';

            const healthReport = {
                status: overallStatus,
                timestamp: new Date().toISOString(),
                version: config.server.apiVersion,
                environment: config.server.env,
                services: {
                    database: dbHealth,
                    redis: redisHealth,
                    websocket: wsHealth,
                },
                system: systemMetrics,
                checks: {
                    databaseConnectivity: dbHealth.status === 'healthy',
                    redisConnectivity: redisHealth.status === 'healthy',
                    websocketService: wsHealth.status === 'healthy',
                    memoryUsage: (systemMetrics.memory.heapUsed / systemMetrics.memory.heapTotal) < 0.9,
                    diskSpace: true, // Would need actual disk space check
                }
            };

            // Always return 200 for successful health check requests
            // The actual health status is in the response body
            res.status(200).json({
                success: true,
                data: healthReport,
                timestamp: new Date().toISOString()
            });

            logger.info(`System health check performed by admin ${user.userId}, status: ${overallStatus}`);
        } catch (error) {
            logger.error('System health check controller error:', error);

            if (error instanceof ForbiddenError) {
                res.status(error.statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'HEALTH_CHECK_FAILED',
                        message: 'Failed to perform system health check'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Get performance metrics
     */
    async getPerformanceMetrics(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;

            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access performance metrics');
            }

            // Memory metrics
            const memoryUsage = process.memoryUsage();
            const systemMemory = {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem()
            };

            // CPU metrics
            const cpuUsage = process.cpuUsage();
            const loadAverage = os.loadavg();

            // Database performance metrics
            const dbStats = await database.healthCheck();

            // WebSocket metrics
            const wsManager = WebSocketManager.getInstance();
            const wsStats = wsManager.getStats();

            // Process metrics
            const processMetrics = {
                pid: process.pid,
                uptime: process.uptime(),
                version: process.version,
                platform: process.platform,
                arch: process.arch
            };

            const performanceData = {
                timestamp: new Date().toISOString(),
                memory: {
                    process: {
                        rss: memoryUsage.rss,
                        heapTotal: memoryUsage.heapTotal,
                        heapUsed: memoryUsage.heapUsed,
                        external: memoryUsage.external,
                        arrayBuffers: memoryUsage.arrayBuffers,
                        heapUtilization: (memoryUsage.heapUsed / memoryUsage.heapTotal * 100).toFixed(2)
                    },
                    system: {
                        total: systemMemory.total,
                        free: systemMemory.free,
                        used: systemMemory.used,
                        utilization: ((systemMemory.used / systemMemory.total) * 100).toFixed(2)
                    }
                },
                cpu: {
                    usage: {
                        user: cpuUsage.user,
                        system: cpuUsage.system
                    },
                    loadAverage: {
                        '1min': loadAverage[0],
                        '5min': loadAverage[1],
                        '15min': loadAverage[2]
                    },
                    cores: os.cpus().length
                },
                database: {
                    status: dbStats.status,
                    connections: {
                        total: dbStats.totalConnections,
                        idle: dbStats.idleConnections,
                        waiting: dbStats.waitingConnections
                    }
                },
                websocket: {
                    status: wsManager.isInitialized() ? 'active' : 'inactive',
                    connections: wsStats?.totalConnections || 0,
                    stats: wsStats
                },
                process: processMetrics
            };

            res.json({
                success: true,
                data: performanceData,
                timestamp: new Date().toISOString()
            });

            logger.info(`Performance metrics retrieved by admin ${user.userId}`);
        } catch (error) {
            logger.error('Performance metrics controller error:', error);

            if (error instanceof ForbiddenError) {
                res.status(error.statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'PERFORMANCE_METRICS_FAILED',
                        message: 'Failed to retrieve performance metrics'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Get application logs (admin only)
     */
    async getApplicationLogs(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;

            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access application logs');
            }

            // This is a simplified implementation
            // In a real application, you would read from log files or a logging service
            const logData = {
                timestamp: new Date().toISOString(),
                message: 'Log retrieval endpoint - implementation depends on logging infrastructure',
                logs: [
                    {
                        level: 'info',
                        timestamp: new Date().toISOString(),
                        message: 'Application logs endpoint accessed',
                        userId: user.userId
                    }
                ],
                note: 'This endpoint would typically integrate with your logging infrastructure (e.g., Winston file transport, ELK stack, etc.)'
            };

            res.json({
                success: true,
                data: logData,
                timestamp: new Date().toISOString()
            });

            logger.info(`Application logs accessed by admin ${user.userId}`);
        } catch (error) {
            logger.error('Application logs controller error:', error);

            if (error instanceof ForbiddenError) {
                res.status(error.statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'LOGS_RETRIEVAL_FAILED',
                        message: 'Failed to retrieve application logs'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Get administrative dashboard data
     */
    async getDashboardData(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;

            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access dashboard data');
            }

            // Get comprehensive dashboard data
            const [dbHealth, redisHealth] = await Promise.all([
                database.healthCheck(),
                redisClient.healthCheck()
            ]);

            const wsManager = WebSocketManager.getInstance();
            const memoryUsage = process.memoryUsage();
            const systemMemory = {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem()
            };

            const dashboardData = {
                timestamp: new Date().toISOString(),
                overview: {
                    systemStatus: dbHealth.status === 'healthy' && redisHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
                    uptime: process.uptime(),
                    version: config.server.apiVersion,
                    environment: config.server.env
                },
                services: {
                    database: {
                        status: dbHealth.status,
                        connections: dbHealth.totalConnections,
                        responseTime: 'N/A' // Would need to implement timing
                    },
                    redis: {
                        status: redisHealth.status,
                        latency: redisHealth.latency,
                        memory: redisHealth.memory
                    },
                    websocket: {
                        status: wsManager.isInitialized() ? 'active' : 'inactive',
                        connections: wsManager.getStats()?.totalConnections || 0,
                        stats: wsManager.getStats()
                    }
                },
                performance: {
                    memory: {
                        heapUsed: memoryUsage.heapUsed,
                        heapTotal: memoryUsage.heapTotal,
                        heapUtilization: (memoryUsage.heapUsed / memoryUsage.heapTotal * 100).toFixed(2),
                        systemUtilization: ((systemMemory.used / systemMemory.total) * 100).toFixed(2)
                    },
                    cpu: {
                        loadAverage: os.loadavg(),
                        cores: os.cpus().length
                    }
                },
                alerts: [
                    // Dynamic alerts based on system status
                    ...(dbHealth.status === 'unhealthy' ? [{
                        level: 'error',
                        message: 'Database connection is unhealthy',
                        timestamp: new Date().toISOString()
                    }] : []),
                    ...(redisHealth.status === 'unhealthy' ? [{
                        level: 'warning',
                        message: 'Redis connection is unhealthy',
                        timestamp: new Date().toISOString()
                    }] : []),
                    ...((memoryUsage.heapUsed / memoryUsage.heapTotal) > 0.9 ? [{
                        level: 'warning',
                        message: 'High memory usage detected',
                        timestamp: new Date().toISOString()
                    }] : [])
                ]
            };

            res.json({
                success: true,
                data: dashboardData,
                timestamp: new Date().toISOString()
            });

            logger.info(`Dashboard data retrieved by admin ${user.userId}`);
        } catch (error) {
            logger.error('Dashboard data controller error:', error);

            if (error instanceof ForbiddenError) {
                res.status(error.statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'DASHBOARD_DATA_FAILED',
                        message: 'Failed to retrieve dashboard data'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Get system configuration (admin only)
     */
    async getSystemConfiguration(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;

            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access system configuration');
            }

            // Return non-sensitive configuration information
            const configData = {
                server: {
                    port: config.server.port,
                    env: config.server.env,
                    apiVersion: config.server.apiVersion
                },
                database: {
                    host: config.database.host,
                    port: config.database.port,
                    name: config.database.name,
                    // Don't expose sensitive data like passwords
                    ssl: config.database.ssl
                },
                redis: {
                    host: config.redis.host,
                    port: config.redis.port,
                    db: config.redis.db,
                    ttl: config.redis.ttl
                    // Don't expose password
                },
                blockchain: {
                    network: config.blockchain.network,
                    // Don't expose private keys or sensitive data
                },
                jwt: {
                    expiresIn: config.jwt.expiresIn,
                    refreshExpiresIn: config.jwt.refreshExpiresIn
                    // Don't expose secrets
                }
            };

            res.json({
                success: true,
                data: {
                    configuration: configData,
                    timestamp: new Date().toISOString(),
                    note: 'Sensitive configuration values are hidden for security'
                },
                timestamp: new Date().toISOString()
            });

            logger.info(`System configuration accessed by admin ${user.userId}`);
        } catch (error) {
            logger.error('System configuration controller error:', error);

            if (error instanceof ForbiddenError) {
                res.status(error.statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'CONFIGURATION_FAILED',
                        message: 'Failed to retrieve system configuration'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }
}

export default new MonitoringController();