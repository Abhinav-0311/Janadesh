import request from 'supertest';
import WebSocketManager from '../services/WebSocketManager';
import App from '../app';
import OtpTokenRepository from '../repositories/OtpTokenRepository';

describe('WebSocket Integration Tests', () => {
  let app: App;
  let server: any;

  beforeAll(async () => {
    // Enable WebSocket for integration tests
    process.env.ENABLE_WS_IN_TESTS = 'true';

    app = new App();
    await app.initialize();
    server = app.app;
  });

  afterAll(async () => {
    await app.shutdown();
    // Clean up environment variable
    delete process.env.ENABLE_WS_IN_TESTS;
  });

  describe('WebSocket API Endpoints', () => {
    let authToken: string;
    let userId: string;
    let email: string;

    beforeAll(async () => {
      const suffix = Date.now();
      email = `websocket_${suffix}@example.com`;

      const registerResponse = await request(server)
        .post('/api/v1/auth/register')
        .send({
          email,
          username: `websocketuser${suffix}`,
          firstName: 'WebSocket',
          lastName: 'User',
          registrationNumber: `WS-${suffix}`
        })
        .expect(201);

      userId = registerResponse.body.data.user.id;

      const verificationToken = await OtpTokenRepository.findActiveToken(userId, 'email_verification');
      expect(verificationToken).not.toBeNull();

      await request(server)
        .post('/api/v1/auth/verify-email')
        .send({ token: verificationToken!.token })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/login/initiate')
        .send({ email })
        .expect(200);

      const loginToken = await OtpTokenRepository.findActiveToken(userId, 'login');
      expect(loginToken).not.toBeNull();

      const loginCompleteResponse = await request(server)
        .post('/api/v1/auth/login/complete')
        .send({ email, otpToken: loginToken!.token })
        .expect(200);

      authToken = loginCompleteResponse.body.data.tokens.accessToken;
    });

    test('should get WebSocket connection token', async () => {
      const response = await request(server)
        .get('/api/v1/websocket/token')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('wsUrl');
      expect(response.body.data).toHaveProperty('userId');
      expect(response.body.data.wsUrl).toContain('ws://localhost:');
    });

    test('should get WebSocket stats (admin only)', async () => {
      const response = await request(server)
        .get('/api/v1/websocket/stats')
        .set('Authorization', `Bearer ${authToken}`);

      // This should fail for non-admin users
      expect(response.status).toBe(403);
    });

    test('should send notification to self', async () => {
      // First get user ID from token endpoint
      const tokenResponse = await request(server)
        .get('/api/v1/websocket/token')
        .set('Authorization', `Bearer ${authToken}`);

      const userIdFromToken = tokenResponse.body.data.userId;

      const response = await request(server)
        .post('/api/v1/websocket/notification')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: userIdFromToken,
          type: 'info',
          message: 'Test notification',
          title: 'Test'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Notification sent successfully');
    });

    test('should not allow sending notification to other users (non-admin)', async () => {
      const response = await request(server)
        .post('/api/v1/websocket/notification')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: '123e4567-e89b-12d3-a456-426614174000',
          type: 'info',
          message: 'Test notification',
          title: 'Test'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should validate notification data', async () => {
      const tokenResponse = await request(server)
        .get('/api/v1/websocket/token')
        .set('Authorization', `Bearer ${authToken}`);

      const userIdFromToken = tokenResponse.body.data.userId;

      const response = await request(server)
        .post('/api/v1/websocket/notification')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: userIdFromToken,
          type: 'invalid_type', // Invalid type
          message: 'Test notification'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('WebSocket Manager Integration', () => {
    test('should be initialized', () => {
      const wsManager = WebSocketManager.getInstance();
      expect(wsManager.isInitialized()).toBe(true);
    });

    test('should return connection stats', () => {
      const wsManager = WebSocketManager.getInstance();
      const stats = wsManager.getStats();

      expect(stats).not.toBeNull();
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('authenticatedConnections');
      expect(stats).toHaveProperty('rooms');
    });

    test('should handle broadcasting without errors', () => {
      const wsManager = WebSocketManager.getInstance();

      expect(() => {
        wsManager.broadcastElectionStatus({
          electionId: 'test-election',
          status: 'active',
          title: 'Test Election',
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 3600000).toISOString()
        });
      }).not.toThrow();

      expect(() => {
        wsManager.sendVoteConfirmation('test-user', {
          electionId: 'test-election',
          transactionHash: '0x123456789abcdef',
          candidateId: 'test-candidate',
          timestamp: new Date().toISOString(),
          status: 'pending'
        });
      }).not.toThrow();

      expect(() => {
        wsManager.sendSystemNotification('test-user', {
          type: 'info',
          message: 'Test notification'
        });
      }).not.toThrow();

      expect(() => {
        wsManager.broadcastSystemNotification({
          type: 'info',
          message: 'Broadcast test notification'
        });
      }).not.toThrow();
    });
  });

  describe('Health Check Integration', () => {
    test('should include WebSocket status in health check', async () => {
      const response = await request(server).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.services).toHaveProperty('websocket');
      expect(response.body.services.websocket.status).toBe('healthy');
      expect(response.body.services.websocket).toHaveProperty('stats');
    });
  });
});
