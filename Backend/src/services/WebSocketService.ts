import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import jwt from 'jsonwebtoken';
import config from '../config';
import logger from '../utils/logger';
import { AccessTokenPayload } from './AuthService';

export interface AuthenticatedWebSocket extends WebSocket {
  user?: {
    id: string;
    walletAddress: string;
    role: string;
    voterStatus: string;
    isVerified: boolean;
    isEmailVerified: boolean;
  };
  rooms?: Set<string>;
  isAlive?: boolean;
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
  room?: string;
}

export interface ElectionStatusUpdate {
  electionId: string;
  status: 'pending' | 'active' | 'ended' | 'cancelled';
  startTime?: string;
  endTime?: string;
  title: string;
}

export interface VoteConfirmation {
  electionId: string;
  transactionHash: string;
  candidateId: string;
  timestamp: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface SystemNotification {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  title?: string;
  persistent?: boolean;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, AuthenticatedWebSocket> = new Map();
  private rooms: Map<string, Set<string>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.wss = new WebSocketServer({
      port: config.websocket.port,
      verifyClient: this.verifyClient.bind(this),
    });

    this.setupEventHandlers();
    this.startHeartbeat();

    logger.info(`WebSocket server started on port ${config.websocket.port}`);
  }

  /**
   * Verify client connection and authenticate
   */
  private verifyClient(info: { origin: string; secure: boolean; req: IncomingMessage }): boolean {
    try {
      // Check CORS origin
      const allowedOrigins = [config.websocket.corsOrigin, config.cors.origin];
      if (!allowedOrigins.includes(info.origin)) {
        logger.warn(`WebSocket connection rejected: Invalid origin ${info.origin}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('WebSocket client verification error:', error);
      return false;
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    this.wss.on('connection', (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error: Error) => {
      logger.error('WebSocket server error:', error);
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(ws: AuthenticatedWebSocket, req: IncomingMessage): Promise<void> {
    try {
      // Parse URL to get token
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(1008, 'Authentication token required');
        return;
      }

      // Verify JWT token
      let decoded: AccessTokenPayload;
      try {
        decoded = jwt.verify(token, config.jwt.secret) as AccessTokenPayload;
      } catch (verifyError) {
        logger.error('JWT verification failed:', verifyError);
        ws.close(1008, 'Invalid authentication token');
        return;
      }

      // Set user info on WebSocket
      ws.user = {
        id: decoded.userId,
        walletAddress: decoded.walletAddress,
        role: decoded.role,
        voterStatus: decoded.voterStatus,
        isVerified: decoded.isVerified || false,
        isEmailVerified: decoded.isEmailVerified || false,
      };

      ws.rooms = new Set();
      ws.isAlive = true;

      // Store client connection
      this.clients.set(decoded.userId, ws);

      // Setup message handlers
      ws.on('message', (data: Buffer) => {
        this.handleMessage(ws, data);
      });

      ws.on('close', (code: number, reason: Buffer) => {
        this.handleDisconnection(ws, code, reason);
      });

      ws.on('error', (error: Error) => {
        logger.error(`WebSocket client error for user ${ws.user?.id}:`, error);
      });

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Send welcome message
      this.sendToClient(ws, {
        type: 'connection_established',
        data: {
          userId: ws.user.id,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });

      logger.info(`WebSocket client connected: ${ws.user.id} (${ws.user.walletAddress})`);

    } catch (error) {
      logger.error('WebSocket authentication error:', error);
      ws.close(1008, 'Authentication failed');
    }
  }

  /**
   * Handle incoming messages from clients
   */
  private handleMessage(ws: AuthenticatedWebSocket, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage;

      switch (message.type) {
        case 'join_room':
          this.handleJoinRoom(ws, message.data.room);
          break;
        case 'leave_room':
          this.handleLeaveRoom(ws, message.data.room);
          break;
        case 'ping':
          this.sendToClient(ws, {
            type: 'pong',
            data: { timestamp: new Date().toISOString() },
            timestamp: new Date().toISOString(),
          });
          break;
        default:
          logger.warn(`Unknown message type: ${message.type} from user ${ws.user?.id}`);
      }
    } catch (error) {
      logger.error(`Error handling WebSocket message from user ${ws.user?.id}:`, error);
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Invalid message format' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(ws: AuthenticatedWebSocket, code: number, reason: Buffer): void {
    if (ws.user) {
      // Remove from all rooms
      if (ws.rooms) {
        ws.rooms.forEach(room => {
          this.removeFromRoom(ws.user!.id, room);
        });
      }

      // Remove from clients map
      this.clients.delete(ws.user.id);

      logger.info(`WebSocket client disconnected: ${ws.user.id} (code: ${code}, reason: ${reason.toString()})`);
    }
  }

  /**
   * Handle joining a room
   */
  private handleJoinRoom(ws: AuthenticatedWebSocket, room: string): void {
    if (!ws.user) return;

    // Validate room access
    if (!this.canJoinRoom(ws.user, room)) {
      this.sendToClient(ws, {
        type: 'room_join_denied',
        data: { room, reason: 'Access denied' },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Add to room
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(ws.user.id);
    ws.rooms!.add(room);

    this.sendToClient(ws, {
      type: 'room_joined',
      data: { room },
      timestamp: new Date().toISOString(),
    });

    logger.info(`User ${ws.user.id} joined room: ${room}`);
  }

  /**
   * Handle leaving a room
   */
  private handleLeaveRoom(ws: AuthenticatedWebSocket, room: string): void {
    if (!ws.user) return;

    this.removeFromRoom(ws.user.id, room);
    ws.rooms?.delete(room);

    this.sendToClient(ws, {
      type: 'room_left',
      data: { room },
      timestamp: new Date().toISOString(),
    });

    logger.info(`User ${ws.user.id} left room: ${room}`);
  }

  /**
   * Remove user from room
   */
  private removeFromRoom(userId: string, room: string): void {
    const roomClients = this.rooms.get(room);
    if (roomClients) {
      roomClients.delete(userId);
      if (roomClients.size === 0) {
        this.rooms.delete(room);
      }
    }
  }

  /**
   * Check if user can join a room
   */
  private canJoinRoom(user: any, room: string): boolean {
    // Room naming convention: election:{electionId}, user:{userId}, admin, public
    if (room === 'public') {
      return true;
    }

    if (room === 'admin') {
      return user.role === 'admin';
    }

    if (room.startsWith('user:')) {
      const roomUserId = room.substring(5);
      return user.id === roomUserId || user.role === 'admin';
    }

    if (room.startsWith('election:')) {
      // Users can join election rooms if they're eligible voters or admins
      return user.voterStatus === 'eligible' || user.role === 'admin' || user.role === 'creator';
    }

    return false;
  }

  /**
   * Send message to specific client
   */
  private sendToClient(ws: AuthenticatedWebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send message to specific user
   */
  public sendToUser(userId: string, message: WebSocketMessage): void {
    const client = this.clients.get(userId);
    if (client) {
      this.sendToClient(client, message);
    }
  }

  /**
   * Broadcast message to all clients in a room
   */
  public broadcastToRoom(room: string, message: WebSocketMessage): void {
    const roomClients = this.rooms.get(room);
    if (roomClients) {
      roomClients.forEach(userId => {
        const client = this.clients.get(userId);
        if (client) {
          this.sendToClient(client, { ...message, room });
        }
      });
    }
  }

  /**
   * Broadcast election status update
   */
  public broadcastElectionStatus(update: ElectionStatusUpdate): void {
    const message: WebSocketMessage = {
      type: 'election_status_update',
      data: update,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to election room and public room
    this.broadcastToRoom(`election:${update.electionId}`, message);
    this.broadcastToRoom('public', message);

    logger.info(`Broadcasted election status update: ${update.electionId} - ${update.status}`);
  }

  /**
   * Send vote confirmation to user
   */
  public sendVoteConfirmation(userId: string, confirmation: VoteConfirmation): void {
    const message: WebSocketMessage = {
      type: 'vote_confirmation',
      data: confirmation,
      timestamp: new Date().toISOString(),
    };

    this.sendToUser(userId, message);

    logger.info(`Sent vote confirmation to user ${userId}: ${confirmation.transactionHash}`);
  }

  /**
   * Send system notification
   */
  public sendSystemNotification(userId: string, notification: SystemNotification): void {
    const message: WebSocketMessage = {
      type: 'system_notification',
      data: notification,
      timestamp: new Date().toISOString(),
    };

    this.sendToUser(userId, message);
  }

  /**
   * Broadcast system notification to all users
   */
  public broadcastSystemNotification(notification: SystemNotification): void {
    const message: WebSocketMessage = {
      type: 'system_notification',
      data: notification,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToRoom('public', message);
  }

  /**
   * Start heartbeat to detect dead connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws: AuthenticatedWebSocket) => {
        if (ws.isAlive === false) {
          ws.terminate();
          return;
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds
  }

  /**
   * Get connection statistics
   */
  public getStats(): {
    totalConnections: number;
    authenticatedConnections: number;
    rooms: { [room: string]: number };
  } {
    const rooms: { [room: string]: number } = {};
    this.rooms.forEach((clients, room) => {
      rooms[room] = clients.size;
    });

    return {
      totalConnections: this.wss.clients.size,
      authenticatedConnections: this.clients.size,
      rooms,
    };
  }

  /**
   * Close WebSocket server
   */
  public close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      this.wss.close(() => {
        logger.info('WebSocket server closed');
        resolve();
      });
    });
  }
}

export default WebSocketService;