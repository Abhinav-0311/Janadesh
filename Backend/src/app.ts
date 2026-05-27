import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { RateLimiterMemory } from 'rate-limiter-flexible';

import config from './config';
import logger from './utils/logger';
import database from './config/database';
import redisClient from './config/redis';
import WebSocketManager from './services/WebSocketManager';

// Import middleware
import errorHandler from './middleware/errorHandler';

// Import routes
import routes from './routes';

class App {
    public app: Application;
    private rateLimiter: RateLimiterMemory;

    constructor() {
        this.app = express();
        this.rateLimiter = new RateLimiterMemory({
            points: config.security.rateLimit.maxRequests,
            duration: config.security.rateLimit.windowMs / 1000, // Convert to seconds
        });

        this.initializeMiddlewares();
        this.initializeRoutes();
        this.initializeErrorHandling();
    }

    private initializeMiddlewares(): void {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
            crossOriginEmbedderPolicy: false,
        }));

        // CORS configuration
        const defaultAllowedOrigins = [
            config.cors.origin,
            'http://localhost',
            'http://localhost:5173',
            'capacitor://localhost',
            'ionic://localhost',
        ];

        this.app.use(cors({
            origin: (origin, callback) => {
                // Allow non-browser clients (no Origin header)
                if (!origin) {
                    callback(null, '*');
                    return;
                }

                // In non-production, allow all origins to simplify mobile/web testing.
                if (config.server.env !== 'production') {
                    callback(null, origin);
                    return;
                }

                if (defaultAllowedOrigins.includes(origin)) {
                    callback(null, true);
                    return;
                }

                callback(new Error('Not allowed by CORS'));
            },
            credentials: config.server.env === 'production' ? config.cors.credentials : false,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
        }));

        // Compression middleware
        this.app.use(compression());

        // Body parsing middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // HTTP request logging
        this.app.use(morgan('combined', { stream: (logger as any).stream }));

        // Rate limiting middleware (disabled in test environment)
        if (process.env.NODE_ENV !== 'test') {
            this.app.use(async (req: Request, res: Response, next: NextFunction) => {
                try {
                    await this.rateLimiter.consume(req.ip || 'unknown');
                    next();
                } catch (rejRes: any) {
                    const remainingPoints = rejRes?.remainingPoints || 0;
                    const msBeforeNext = rejRes?.msBeforeNext || 0;

                    res.set('Retry-After', Math.round(msBeforeNext / 1000).toString());
                    res.status(429).json({
                        success: false,
                        error: {
                            code: 'RATE_LIMIT_EXCEEDED',
                            message: 'Too many requests, please try again later.',
                            remainingPoints,
                            msBeforeNext,
                        },
                    });
                }
            });
        }

        // Request ID middleware for tracing
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            (req as any).id = Math.random().toString(36).substring(2, 15);
            res.setHeader('X-Request-ID', (req as any).id);
            next();
        });

        // Request logging middleware
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            logger.info(`${req.method} ${req.path}`, {
                requestId: (req as any).id,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
            });
            next();
        });
    }

    private initializeRoutes(): void {
        // Health check endpoint - always returns 200 for basic health
        this.app.get('/health', async (req: Request, res: Response) => {
            try {
                const dbHealth = await database.healthCheck();
                const redisHealth = await redisClient.healthCheck();
                const wsManager = WebSocketManager.getInstance();
                const wsHealth = {
                    status: wsManager.isInitialized() ? 'healthy' : 'unhealthy',
                    stats: wsManager.getStats(),
                };

                const health = {
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    environment: config.server.env,
                    version: config.server.apiVersion,
                    services: {
                        database: dbHealth,
                        redis: redisHealth,
                        websocket: wsHealth,
                    },
                };

                // If any service is unhealthy, mark overall status as unhealthy
                // but still return 200 (service is running, even if degraded)
                if (dbHealth.status === 'unhealthy' || redisHealth.status === 'unhealthy' || wsHealth.status === 'unhealthy') {
                    health.status = 'degraded';
                }

                res.status(200).json(health);
            } catch (error) {
                logger.error('Health check failed:', error);
                // Still return 200 - the service is responding
                res.status(200).json({
                    status: 'degraded',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    error: 'Health check partially failed',
                    requestId: (req as any).id,
                });
            }
        });

        // API version endpoint
        this.app.get(`/api/${config.server.apiVersion}`, (_req: Request, res: Response) => {
            res.json({
                message: 'Advanced Blockchain Voting Platform API',
                version: config.server.apiVersion,
                environment: config.server.env,
                timestamp: new Date().toISOString(),
            });
        });

        // Mount API routes
        this.app.use(`/api/${config.server.apiVersion}`, routes);
    }

    private initializeErrorHandling(): void {
        // 404 handler
        this.app.use((req: Request, res: Response) => {
            res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: `Route ${req.method} ${req.path} not found`,
                },
                timestamp: new Date().toISOString(),
                requestId: (req as any).id,
            });
        });

        // Global error handler
        this.app.use(errorHandler);
    }

    public async initialize(): Promise<void> {
        try {
            // Test database connection
            const dbConnected = await database.testConnection();
            if (!dbConnected) {
                throw new Error('Failed to connect to database');
            }

            // Connect to Redis
            await redisClient.connect();

            // Initialize WebSocket service
            WebSocketManager.getInstance().initialize();

            logger.info('Application initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize application:', error);
            throw error;
        }
    }

    public async shutdown(): Promise<void> {
        try {
            await WebSocketManager.getInstance().shutdown();
            await database.close();
            await redisClient.disconnect();
            logger.info('Application shutdown completed');
        } catch (error) {
            logger.error('Error during application shutdown:', error);
            throw error;
        }
    }
}

export default App;
