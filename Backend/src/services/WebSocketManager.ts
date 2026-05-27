import WebSocketService, { ElectionStatusUpdate, VoteConfirmation, SystemNotification } from './WebSocketService';
import logger from '../utils/logger';

/**
 * WebSocket Manager - Singleton pattern for managing WebSocket service
 */
class WebSocketManager {
  private static instance: WebSocketManager;
  private webSocketService: WebSocketService | null = null;

  private constructor() { }

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  /**
   * Initialize WebSocket service
   */
  public initialize(): void {
    try {
      // Skip WebSocket initialization in test environment unless explicitly enabled
      if (process.env.NODE_ENV === 'test' && process.env.ENABLE_WS_IN_TESTS !== 'true') {
        logger.info('WebSocket Manager skipped in test environment');
        return;
      }

      if (this.webSocketService) {
        logger.info('WebSocket Manager already initialized');
        return;
      }

      this.webSocketService = new WebSocketService();
      logger.info('WebSocket Manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize WebSocket Manager:', error);
      // In test environment, don't throw error for WebSocket failures
      if (process.env.NODE_ENV !== 'test') {
        throw error;
      }
    }
  }

  /**
   * Get WebSocket service instance
   */
  public getService(): WebSocketService {
    if (!this.webSocketService) {
      throw new Error('WebSocket service not initialized. Call initialize() first.');
    }
    return this.webSocketService;
  }

  /**
   * Check if WebSocket service is initialized
   */
  public isInitialized(): boolean {
    return this.webSocketService !== null;
  }

  /**
   * Broadcast election status update
   */
  public broadcastElectionStatus(update: ElectionStatusUpdate): void {
    if (this.webSocketService) {
      this.webSocketService.broadcastElectionStatus(update);
    } else {
      logger.warn('WebSocket service not initialized, cannot broadcast election status');
    }
  }

  /**
   * Send vote confirmation to user
   */
  public sendVoteConfirmation(userId: string, confirmation: VoteConfirmation): void {
    if (this.webSocketService) {
      this.webSocketService.sendVoteConfirmation(userId, confirmation);
    } else {
      logger.warn('WebSocket service not initialized, cannot send vote confirmation');
    }
  }

  /**
   * Send system notification to user
   */
  public sendSystemNotification(userId: string, notification: SystemNotification): void {
    if (this.webSocketService) {
      this.webSocketService.sendSystemNotification(userId, notification);
    } else {
      logger.warn('WebSocket service not initialized, cannot send system notification');
    }
  }

  /**
   * Broadcast system notification to all users
   */
  public broadcastSystemNotification(notification: SystemNotification): void {
    if (this.webSocketService) {
      this.webSocketService.broadcastSystemNotification(notification);
    } else {
      logger.warn('WebSocket service not initialized, cannot broadcast system notification');
    }
  }

  /**
   * Get connection statistics
   */
  public getStats(): {
    totalConnections: number;
    authenticatedConnections: number;
    rooms: { [room: string]: number };
  } | null {
    if (this.webSocketService) {
      return this.webSocketService.getStats();
    }
    return null;
  }

  /**
   * Shutdown WebSocket service
   */
  public async shutdown(): Promise<void> {
    if (this.webSocketService) {
      await this.webSocketService.close();
      this.webSocketService = null;
      logger.info('WebSocket Manager shutdown completed');
    }
  }
}

export default WebSocketManager;
