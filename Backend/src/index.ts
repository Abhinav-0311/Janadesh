import App from './app';
import config from './config';
import logger from './utils/logger';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: {
        userId: string;
        walletAddress: string;
        role: string;
        voterStatus: string;
        isVerified: boolean;
        isEmailVerified: boolean;
        email?: string;
        username?: string;
      };
    }
  }
}

async function startServer(): Promise<void> {
  try {
    const app = new App();
    
    // Initialize the application (database, redis, etc.)
    await app.initialize();

    // Start the server
    const server = app.app.listen(config.server.port, () => {
      logger.info(`Server running on port ${config.server.port} in ${config.server.env} mode`);
      logger.info(`API version: ${config.server.apiVersion}`);
      logger.info(`Health check available at: http://localhost:${config.server.port}/health`);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          await app.shutdown();
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  logger.error('Server startup failed:', error);
  process.exit(1);
});