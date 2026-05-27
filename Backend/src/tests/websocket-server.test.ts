import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import config from '../config';
import WebSocketManager from '../services/WebSocketManager';

// Mock the logger to avoid console output during tests
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('WebSocket Server Integration', () => {
  let wsManager: WebSocketManager;
  let testToken: string;

  beforeAll(async () => {
    // Create test JWT token
    const testUser = {
      userId: 'test-user-id',
      walletAddress: '0x1234567890123456789012345678901234567890',
      role: 'voter',
      voterStatus: 'eligible',
      isVerified: true,
      isEmailVerified: true
    };

    testToken = jwt.sign(testUser, config.jwt.secret, { expiresIn: '1h' });

    // Initialize WebSocket manager once for all tests
    process.env.ENABLE_WS_IN_TESTS = 'true';
    wsManager = WebSocketManager.getInstance();
    wsManager.initialize();
    // Give server time to start listening
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    // Clean up WebSocket manager after all tests
    if (wsManager && wsManager.isInitialized()) {
      await wsManager.shutdown();
    }
    delete process.env.ENABLE_WS_IN_TESTS;
  });

  test('should start WebSocket server on configured port', (done) => {
    let timeoutId: NodeJS.Timeout | undefined;
    // Try to connect to the WebSocket server
    const ws = new WebSocket(`ws://localhost:${config.websocket.port}?token=${testToken}`, {
      origin: config.websocket.corsOrigin
    });

    ws.on('open', () => {
      clearTimeout(timeoutId);
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
      done();
    });

    ws.on('error', (error) => {
      clearTimeout(timeoutId);
      done(error);
    });

    // Set timeout to fail test if connection doesn't work
    timeoutId = setTimeout(() => {
      ws.close();
      done(new Error('WebSocket connection timeout'));
    }, 5000);
  });

  test('should authenticate valid JWT tokens', (done) => {
    let timeoutId: NodeJS.Timeout | undefined;
    const ws = new WebSocket(`ws://localhost:${config.websocket.port}?token=${testToken}`, {
      origin: config.websocket.corsOrigin
    });

    ws.on('message', (data: Buffer) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'connection_established') {
        clearTimeout(timeoutId);
        expect(message.data.userId).toBe('test-user-id');
        ws.close();
        done();
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeoutId);
      done(error);
    });

    timeoutId = setTimeout(() => {
      ws.close();
      done(new Error('Authentication test timeout'));
    }, 5000);
  });

  test('should reject invalid JWT tokens', (done) => {
    let timeoutId: NodeJS.Timeout | undefined;
    const invalidToken = 'invalid-token';
    const ws = new WebSocket(`ws://localhost:${config.websocket.port}?token=${invalidToken}`, {
      origin: config.websocket.corsOrigin
    });

    let testCompleted = false;
    let connectionOpened = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
    };

    ws.on('close', (code) => {
      if (!testCompleted) {
        testCompleted = true;
        cleanup();
        // Connection should close with authentication error code
        expect(code).toBe(1008); // Authentication failed
        // Connection may open briefly before being closed by server
        done();
      }
    });

    ws.on('error', () => {
      // Expected for invalid tokens
      if (!testCompleted) {
        testCompleted = true;
        cleanup();
        done(); // Test passes if connection fails
      }
    });

    ws.on('open', () => {
      // Connection opens briefly, but should be closed immediately by server
      connectionOpened = true;
    });

    timeoutId = setTimeout(() => {
      if (!testCompleted) {
        testCompleted = true;
        ws.close();
        done(new Error('Invalid token test timeout - connection was not closed by server'));
      }
    }, 3000);
  });

  test('should handle room joining', (done) => {
    let timeoutId: NodeJS.Timeout | undefined;
    const ws = new WebSocket(`ws://localhost:${config.websocket.port}?token=${testToken}`, {
      origin: config.websocket.corsOrigin
    });

    let connectionEstablished = false;

    ws.on('message', (data: Buffer) => {
      const message = JSON.parse(data.toString());

      if (message.type === 'connection_established' && !connectionEstablished) {
        connectionEstablished = true;
        // Try to join public room
        ws.send(JSON.stringify({
          type: 'join_room',
          data: { room: 'public' },
          timestamp: new Date().toISOString()
        }));
      } else if (message.type === 'room_joined') {
        clearTimeout(timeoutId);
        expect(message.data.room).toBe('public');
        ws.close();
        done();
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeoutId);
      done(error);
    });

    timeoutId = setTimeout(() => {
      ws.close();
      done(new Error('Room joining test timeout'));
    }, 5000);
  });

  test('should handle ping-pong', (done) => {
    let timeoutId: NodeJS.Timeout | undefined;
    const ws = new WebSocket(`ws://localhost:${config.websocket.port}?token=${testToken}`, {
      origin: config.websocket.corsOrigin
    });

    let connectionEstablished = false;

    ws.on('message', (data: Buffer) => {
      const message = JSON.parse(data.toString());

      if (message.type === 'connection_established' && !connectionEstablished) {
        connectionEstablished = true;
        // Send ping
        ws.send(JSON.stringify({
          type: 'ping',
          data: {},
          timestamp: new Date().toISOString()
        }));
      } else if (message.type === 'pong') {
        clearTimeout(timeoutId);
        expect(message.data.timestamp).toBeDefined();
        ws.close();
        done();
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeoutId);
      done(error);
    });

    timeoutId = setTimeout(() => {
      ws.close();
      done(new Error('Ping-pong test timeout'));
    }, 5000);
  });

  test('should provide connection statistics', () => {
    const stats = wsManager.getStats();

    expect(stats).not.toBeNull();
    expect(stats).toHaveProperty('totalConnections');
    expect(stats).toHaveProperty('authenticatedConnections');
    expect(stats).toHaveProperty('rooms');
    expect(typeof stats!.totalConnections).toBe('number');
    expect(typeof stats!.authenticatedConnections).toBe('number');
    expect(typeof stats!.rooms).toBe('object');
  });

  test('should handle multiple concurrent connections', (done) => {
    let timeoutId: NodeJS.Timeout | undefined;
    const connections: WebSocket[] = [];
    const expectedConnections = 3;
    let establishedCount = 0;
    let statsChecks = 0;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      connections.forEach(conn => {
        if (conn.readyState === WebSocket.OPEN || conn.readyState === WebSocket.CONNECTING) {
          conn.close();
        }
      });
    };

    const assertStatsWithRetry = () => {
      const stats = wsManager.getStats();
      if (stats && stats.authenticatedConnections >= expectedConnections) {
        cleanup();
        done();
        return;
      }

      statsChecks++;
      if (statsChecks >= 20) {
        cleanup();
        done(new Error(`Expected >= ${expectedConnections} authenticated connections, got ${stats?.authenticatedConnections ?? 0}`));
        return;
      }

      setTimeout(assertStatsWithRetry, 50);
    };

    // Create multiple connections
    for (let i = 0; i < expectedConnections; i++) {
      const testUserData = {
        userId: `test-user-${i}`,
        walletAddress: `0x123456789012345678901234567890123456789${i}`,
        role: 'voter',
        voterStatus: 'eligible',
        isVerified: true,
        isEmailVerified: true
      };

      const token = jwt.sign(testUserData, config.jwt.secret, { expiresIn: '1h' });
      const ws = new WebSocket(`ws://localhost:${config.websocket.port}?token=${token}`, {
        origin: config.websocket.corsOrigin
      });

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'connection_established') {
          establishedCount++;
        }

        if (establishedCount === expectedConnections) {
          assertStatsWithRetry();
        }
      });

      ws.on('error', (error) => {
        cleanup();
        done(error);
      });

      connections.push(ws);
    }

    timeoutId = setTimeout(() => {
      cleanup();
      done(new Error('Multiple connections test timeout'));
    }, 10000);
  });
});
