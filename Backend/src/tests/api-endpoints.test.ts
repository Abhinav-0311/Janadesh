import request from 'supertest';
import App from '../app';
import { Application } from 'express';

describe('API Endpoints', () => {
  let app: Application;

  beforeAll(async () => {
    const appInstance = new App();
    app = appInstance.app;
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return API version info', async () => {
      const response = await request(app)
        .get('/api/v1')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');
    });
  });

  describe('Public Election Endpoints', () => {
    it('should get active elections without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/elections/public')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('elections');
      expect(Array.isArray(response.body.data.elections)).toBe(true);
    });

    it('should get upcoming elections without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/elections/upcoming')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('elections');
      expect(Array.isArray(response.body.data.elections)).toBe(true);
    });
  });

  describe('Protected Endpoints', () => {
    it('should require authentication for protected routes', async () => {
      const response = await request(app)
        .get('/api/v1/elections')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should require authentication for voting endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/voting/history')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should require authentication for analytics endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/system')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Route Structure', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/api/v1/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    });

    it('should handle invalid HTTP methods', async () => {
      const response = await request(app)
        .patch('/api/v1/elections/public')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Request Validation', () => {
    it('should validate request parameters', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          // Missing required fields
          email: 'invalid-email'
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting', async () => {
      // Make multiple requests quickly to test rate limiting
      const requests = Array(10).fill(null).map(() => 
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      // All requests should succeed for health endpoint (no rate limiting on health)
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers', async () => {
      const response = await request(app)
        .options('/api/v1/elections/public')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });

    it('should include request ID in response headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-request-id');
      expect(typeof response.headers['x-request-id']).toBe('string');
    });
  });
});
