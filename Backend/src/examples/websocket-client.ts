/**
 * WebSocket Client Example
 * 
 * This example demonstrates how to connect to the WebSocket server
 * and handle different types of messages.
 */

import WebSocket from 'ws';

// Example JWT token (replace with actual token from authentication)
const EXAMPLE_TOKEN = 'your-jwt-token-here';
const WS_URL = `ws://localhost:3002?token=${EXAMPLE_TOKEN}`;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

  constructor() {
    this.connect();
  }

  private connect(): void {
    try {
      console.log('Connecting to WebSocket server...');
      this.ws = new WebSocket(WS_URL);

      this.ws.on('open', () => {
        console.log('✅ Connected to WebSocket server');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;

        // Join public room to receive general updates
        this.joinRoom('public');

        // Example: Join an election room
        // this.joinRoom('election:your-election-id');
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('❌ Error parsing message:', error);
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        console.log(`🔌 WebSocket connection closed: ${code} - ${reason.toString()}`);
        this.handleReconnect();
      });

      this.ws.on('error', (error: Error) => {
        console.error('❌ WebSocket error:', error);
      });

    } catch (error) {
      console.error('❌ Failed to connect:', error);
      this.handleReconnect();
    }
  }

  private handleMessage(message: any): void {
    console.log(`📨 Received message: ${message.type}`);

    switch (message.type) {
      case 'connection_established':
        console.log('🎉 Connection established for user:', message.data.userId);
        break;

      case 'election_status_update':
        console.log('🗳️  Election status update:', {
          electionId: message.data.electionId,
          status: message.data.status,
          title: message.data.title,
          startTime: message.data.startTime,
          endTime: message.data.endTime
        });
        break;

      case 'vote_confirmation':
        console.log('✅ Vote confirmation:', {
          electionId: message.data.electionId,
          transactionHash: message.data.transactionHash,
          status: message.data.status,
          timestamp: message.data.timestamp
        });
        break;

      case 'system_notification':
        console.log(`🔔 System notification (${message.data.type}):`, {
          title: message.data.title,
          message: message.data.message,
          persistent: message.data.persistent
        });
        break;

      case 'room_joined':
        console.log('🏠 Joined room:', message.data.room);
        break;

      case 'room_left':
        console.log('🚪 Left room:', message.data.room);
        break;

      case 'room_join_denied':
        console.log('🚫 Room join denied:', message.data.room, '-', message.data.reason);
        break;

      case 'error':
        console.error('❌ Server error:', message.data.message);
        break;

      case 'pong':
        console.log('🏓 Pong received');
        break;

      default:
        console.log('❓ Unknown message type:', message.type, message.data);
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay}ms...`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);

      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    } else {
      console.error('❌ Max reconnection attempts reached. Giving up.');
    }
  }

  public joinRoom(room: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'join_room',
        data: { room },
        timestamp: new Date().toISOString()
      }));
    }
  }

  public leaveRoom(room: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'leave_room',
        data: { room },
        timestamp: new Date().toISOString()
      }));
    }
  }

  public ping(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'ping',
        data: {},
        timestamp: new Date().toISOString()
      }));
    }
  }

  public close(): void {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Example usage
if (require.main === module) {
  console.log('🚀 Starting WebSocket client example...');
  console.log('📝 Make sure to replace EXAMPLE_TOKEN with a valid JWT token');
  
  const client = new WebSocketClient();

  // Example: Send a ping every 30 seconds
  setInterval(() => {
    client.ping();
  }, 30000);

  // Example: Join an election room after 5 seconds
  setTimeout(() => {
    client.joinRoom('election:example-election-id');
  }, 5000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down WebSocket client...');
    client.close();
    process.exit(0);
  });
}

export default WebSocketClient;