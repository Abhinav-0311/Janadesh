import request from 'supertest';
import App from '../../app';

// Mock database and redis to avoid connection requirements
jest.mock('../../config/database', () => ({
  testConnection: jest.fn().mockResolvedValue(true),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
  close: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../config/redis', () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
  disconnect: jest.fn().mockResolvedValue(undefined),
}));

describe('Load Testing', () => {
  let app: any;

  beforeAll(async () => {
    const appInstance = new App();
    await appInstance.initialize();
    app = appInstance.app;
  });

  it('should handle basic load test', async () => {
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 10; i++) {
      const promise = request(app)
        .get('/health');
      promises.push(promise);
    }
    
    const results = await Promise.all(promises);
    expect(results).toHaveLength(10);
    results.forEach((result: any) => {
      expect(result.status).toBe(200);
    });
  });
});