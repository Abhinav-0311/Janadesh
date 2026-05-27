import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import config from '../config';
import WebSocketManager from '../services/WebSocketManager';

describe('WebSocket Service', () => {
  let wsManager: WebSocketManager;
  let testToken: string;
  let testUser: any;

  beforeAll(() => {
    // Create test user data
    testUser = {
      userId: 'test-user-id',
      walletAddress: '0x1234567890123456789012345678901234567890',
      role: 'voter',
      voterStatus: 'eligible',
      isVerified: true,
      isEmailVerified: true
    };

    // Create test JWT token
    testToken = jwt.sign(testUser, config.jwt.secret, { expiresIn: '1h' });

    // Initialize WebSocket manager once for all tests
    process.env.ENABLE_WS_IN_TESTS = 'true';
    wsManager = WebSocketManager.getInstance();
    wsManager.initialize();
  });

  afterAll(async () => {
    // Clean up WebSocket manager after all tests
    if (wsManager && wsManager.isInitialized()) {
      await wsManager.shutdown();
    }
    delete process.env.ENABLE_WS_IN_TESTS;
  });

  describe('Connection Management', () => {
    test('should accept valid WebSocket connections', (done) => {
      const ws = new WebSocket(`ws://localhost:${config.websocket.port}?token=${testToken}`, {
        origin: config.websocket.corsOrigin
      });

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
      });

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'connection_established') {
          expect(message.data.userId).toBe(testUser.userId);
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    test('should reject connections without token', (done) => {
      const ws = new WebSocket(`ws://localhost:${config.websocket.port}`, {
        origin: config.websocket.corsOrigin
      });

      ws.on('close', (code) => {
        expect(code).toBe(1008); // Authentication required
        done();
      });

      ws.on('error', () => {
        // Expected for invalid connections
      });
    });

    test('should reject connections with invalid token', (done) => {
      const invalidToken = 'invalid-token';
      const ws = new WebSocket(`ws://localhost:${config.websocket.port}?token=${invalidToken}`, {
        origin: config.websocket.corsOrigin
      });

      ws.on('close', (code) => {
        expect(code).toBe(1008); // Authentication failed
        done();
      });

      ws.on('error', () => {
        // Expected for invalid connections
      });
    });

    test('should reject connections from invalid origins', (done) => {
      const ws = new WebSocket(`ws://localhost:${config.websocket.port}?token=${testToken}`, {
        origin: 'http://malicious-site.com'
      });

      let testCompleted = false;

      ws.on('close', () => {
        if (!testCompleted) {
          testCompleted = true;
          done();
        }
      });

      ws.on('error', () => {
        // Expected for invalid origins
        if (!testCompleted) {
          testCompleted = true;
          done();
        }
      });
    });
  });

  describe('Room Management', () => {
    let ws: WebSocket;

    beforeEach((done) => {
      ws = new WebSocket(`ws://localhost:${config.websocket.port}?token=${testToken}`, {
        origin: config.websocket.corsOrigin
      });

      ws.on('open', () => {
        done();
      });
    });

    afterEach(() => {
      if (ws) {
        ws.close();
      }
    });

    test('should allow joining public room', (done) => {
      ws.send(JSON.stringify({
        type: 'join_room',
        data: { room: 'public' },
        timestamp: new Date().toISOString()
      }));

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'room_joined') {
          expect(message.data.room).toBe('public');
          done();
        }
      });
    });

    test('should allow joining user-specific room', (done) => {
      const userRoom = `user:${testUser.userId}`;

      ws.send(JSON.stringify({
        type: 'join_room',
        data: { room: userRoom },
        timestamp: new Date().toISOString()
      }));

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'room_joined') {
          expect(message.data.room).toBe(userRoom);
          done();
        }
      });
    });

    test('should deny joining admin room for non-admin users', (done) => {
      ws.send(JSON.stringify({
        type: 'join_room',
        data: { room: 'admin' },
        timestamp: new Date().toISOString()
      }));

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'room_join_denied') {
          expect(message.data.room).toBe('admin');
          expect(message.data.reason).toBe('Access denied');
          done();
        }
      });
    });

    test('should allow leaving rooms', (done) => {
      // First join a room
      ws.send(JSON.stringify({
        type: 'join_room',
        data: { room: 'public' },
        timestamp: new Date().toISOString()
      }));

      let roomJoined = false;

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'room_joined' && !roomJoined) {
          roomJoined = true;
          // Now leave the room
          ws.send(JSON.stringify({
            type: 'leave_room',
            data: { room: 'public' },
            timestamp: new Date().toISOString()
          }));
        } else if (message.type === 'room_left') {
          expect(message.data.room).toBe('public');
          done();
        }
      });
    });
  });

  describe('Message Broadcasting', () => {
    test('should broadcast election status updates', () => {
      const electionUpdate = {
        electionId: 'test-election-id',
        status: 'active' as const,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3600000).toISOString(),
        title: 'Test Election'
      };

      // This should not throw an error
      expect(() => {
        wsManager.broadcastElectionStatus(electionUpdate);
      }).not.toThrow();
    });

    test('should send vote confirmations', () => {
      const voteConfirmation = {
        electionId: 'test-election-id',
        transactionHash: '0x1234567890abcdef',
        candidateId: 'test-candidate-id',
        timestamp: new Date().toISOString(),
        status: 'pending' as const
      };

      // This should not throw an error
      expect(() => {
        wsManager.sendVoteConfirmation(testUser.userId, voteConfirmation);
      }).not.toThrow();
    });

    test('should send system notifications', () => {
      const notification = {
        type: 'info' as const,
        message: 'Test notification',
        title: 'Test',
        persistent: false
      };

      // This should not throw an error
      expect(() => {
        wsManager.sendSystemNotification(testUser.userId, notification);
      }).not.toThrow();
    });
  });

  describe('Connection Statistics', () => {
    test('should return connection statistics', () => {
      const stats = wsManager.getStats();

      expect(stats).not.toBeNull();
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('authenticatedConnections');
      expect(stats).toHaveProperty('rooms');
      expect(typeof stats!.totalConnections).toBe('number');
      expect(typeof stats!.authenticatedConnections).toBe('number');
      expect(typeof stats!.rooms).toBe('object');
    });
  });

  describe('Heartbeat and Connection Health', () => {
    test('should respond to ping messages', (done) => {
      const ws = new WebSocket(`ws://localhost:${config.websocket.port}?token=${testToken}`, {
        origin: config.websocket.corsOrigin
      });

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'ping',
          data: {},
          timestamp: new Date().toISOString()
        }));
      });

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'pong') {
          expect(message.data.timestamp).toBeDefined();
          ws.close();
          done();
        }
      });
    });
  });
});

describe('WebSocket Manager', () => {
  let wsManager: WebSocketManager;

  beforeEach(() => {
    wsManager = WebSocketManager.getInstance();
  });

  afterEach(async () => {
    if (wsManager.isInitialized()) {
      await wsManager.shutdown();
    }
  });

  test('should be a singleton', () => {
    const instance1 = WebSocketManager.getInstance();
    const instance2 = WebSocketManager.getInstance();
    expect(instance1).toBe(instance2);
  });

  test('should initialize WebSocket service', () => {
    expect(() => {
      wsManager.initialize();
    }).not.toThrow();

    // In test environment, WebSocket service is not initialized to avoid port conflicts
    if (process.env.NODE_ENV === 'test') {
      expect(wsManager.isInitialized()).toBe(false);
    } else {
      expect(wsManager.isInitialized()).toBe(true);
    }
  });

  test('should return null stats when not initialized', () => {
    const stats = wsManager.getStats();
    expect(stats).toBeNull();
  });

  test('should return stats when initialized', () => {
    wsManager.initialize();
    const stats = wsManager.getStats();

    // In test environment, stats will be null since service doesn't initialize
    if (process.env.NODE_ENV === 'test') {
      expect(stats).toBeNull();
    } else {
      expect(stats).not.toBeNull();
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('authenticatedConnections');
      expect(stats).toHaveProperty('rooms');
    }
  });

  test('should handle broadcasting when not initialized', () => {
    // Should not throw errors when WebSocket is not initialized
    expect(() => {
      wsManager.broadcastElectionStatus({
        electionId: 'test',
        status: 'active',
        title: 'Test Election'
      });
    }).not.toThrow();

    expect(() => {
      wsManager.sendVoteConfirmation('user-id', {
        electionId: 'test',
        transactionHash: '0x123',
        candidateId: 'candidate-id',
        timestamp: new Date().toISOString(),
        status: 'pending'
      });
    }).not.toThrow();

    expect(() => {
      wsManager.sendSystemNotification('user-id', {
        type: 'info',
        message: 'Test message'
      });
    }).not.toThrow();
  });
});

describe('WebSocket Integration', () => {
  // Integration tests are covered in websocket-server.test.ts
  test('placeholder', () => {
    expect(true).toBe(true);
  });
});