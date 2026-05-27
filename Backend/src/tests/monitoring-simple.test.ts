/// <reference types="jest" />
import request from 'supertest';
import App from '../app';

describe('Monitoring Endpoints - Simple Test', () => {
    let app: App;
    let server: any;

    beforeAll(async () => {
        app = new App();
        await app.initialize();
        server = app.app;
    });

    afterAll(async () => {
        try {
            await app.shutdown();
        } catch (error) {
            // Ignore shutdown errors for this test
        }
    });

    describe('GET /api/v1/monitoring/health', () => {
        it('should require authentication', async () => {
            const response = await request(server)
                .get('/api/v1/monitoring/health')
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });
});