/// <reference types="jest" />
import request from 'supertest';
import App from '../../app';
import database from '../../config/database';
import { repositories } from '../../repositories';
import jwt from 'jsonwebtoken';
import config from '../../config';

describe('Monitoring Controller', () => {
  let app: App;
  let server: any;
  let adminToken: string;
  let voterToken: string;

  beforeAll(async () => {
    app = new App();
    await app.initialize();
    server = app.app;

    const adminUser = await repositories.user.create({
      wallet_address: '0x1111111111111111111111111111111111111111',
      email: 'admin@monitoring-controller.test',
      username: 'admin_monitoring_controller',
      first_name: 'Admin',
      last_name: 'Monitoring',
      registration_number: 'REG-MONITORING-CONTROLLER-ADMIN',
      role: 'admin',
      voter_status: 'eligible',
      is_verified: true,
      is_email_verified: true,
    });

    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    const voterUser = await repositories.user.create({
      wallet_address: '0x2222222222222222222222222222222222222222',
      email: 'voter@monitoring-controller.test',
      username: 'voter_monitoring_controller',
      first_name: 'Voter',
      last_name: 'Monitoring',
      registration_number: 'REG-MONITORING-CONTROLLER-VOTER',
      role: 'voter',
      voter_status: 'eligible',
      is_verified: true,
      is_email_verified: true,
    });

    voterToken = jwt.sign(
      { userId: voterUser.id, email: voterUser.email, role: voterUser.role },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await database.query("DELETE FROM users WHERE email LIKE '%monitoring-controller.test%'");
    await app.shutdown();
  });

  describe('GET /api/v1/monitoring/health', () => {
    it('should return system health for admin', async () => {
      const response = await request(server)
        .get('/api/v1/monitoring/health')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBeDefined();
      expect(response.body.data.services).toBeDefined();
      expect(response.body.data.services.database).toBeDefined();
      expect(response.body.data.services.redis).toBeDefined();
      expect(response.body.data.services.websocket).toBeDefined();
      expect(response.body.data.system).toBeDefined();
      expect(response.body.data.checks).toBeDefined();
    });

    it('should expose the same health payload on /system', async () => {
      const response = await request(server)
        .get('/api/v1/monitoring/system')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBeDefined();
      expect(response.body.data.services).toBeDefined();
    });

    it('should reject non-admin access', async () => {
      const response = await request(server)
        .get('/api/v1/monitoring/health')
        .set('Authorization', `Bearer ${voterToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject unauthenticated access', async () => {
      const response = await request(server)
        .get('/api/v1/monitoring/health')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/monitoring/performance', () => {
    it('should return performance metrics for admin', async () => {
      const response = await request(server)
        .get('/api/v1/monitoring/performance')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.timestamp).toBeDefined();
      expect(response.body.data.memory).toBeDefined();
      expect(response.body.data.cpu).toBeDefined();
      expect(response.body.data.database).toBeDefined();
      expect(response.body.data.websocket).toBeDefined();
      expect(response.body.data.process).toBeDefined();
    });

    it('should reject non-admin access', async () => {
      const response = await request(server)
        .get('/api/v1/monitoring/performance')
        .set('Authorization', `Bearer ${voterToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/monitoring/dashboard', () => {
    it('should return dashboard data for admin', async () => {
      const response = await request(server)
        .get('/api/v1/monitoring/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.overview).toBeDefined();
      expect(response.body.data.services).toBeDefined();
      expect(response.body.data.performance).toBeDefined();
      expect(Array.isArray(response.body.data.alerts)).toBe(true);
    });
  });

  describe('GET /api/v1/monitoring/config', () => {
    it('should return sanitized configuration for admin', async () => {
      const response = await request(server)
        .get('/api/v1/monitoring/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.configuration).toBeDefined();
      expect(response.body.data.configuration.database.password).toBeUndefined();
      expect(response.body.data.configuration.redis.password).toBeUndefined();
      expect(response.body.data.configuration.jwt.secret).toBeUndefined();
    });
  });

  describe('GET /api/v1/monitoring/logs', () => {
    it('should return log payload for admin', async () => {
      const response = await request(server)
        .get('/api/v1/monitoring/logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.logs)).toBe(true);
      expect(response.body.data.message).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should report unhealthy database when query checks fail', async () => {
      const healthCheckSpy = jest.spyOn(database, 'healthCheck').mockResolvedValue({
        status: 'unhealthy',
        totalConnections: 0,
        idleConnections: 0,
        waitingConnections: 0,
      });

      const response = await request(server)
        .get('/api/v1/monitoring/health')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.services.database.status).toBe('unhealthy');

      healthCheckSpy.mockRestore();
    });
  });
});
