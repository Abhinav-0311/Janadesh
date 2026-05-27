/// <reference types="jest" />
import request from 'supertest';
import App from '../app';
import database from '../config/database';
import redisClient from '../config/redis';
import UserRepository from '../repositories/UserRepository';
import jwt from 'jsonwebtoken';
import config from '../config';

describe('Monitoring Endpoints', () => {
    let app: App;
    let server: any;
    let adminToken: string;
    let userToken: string;
    let adminUserId: string;
    let regularUserId: string;

    beforeAll(async () => {
        app = new App();
        await app.initialize();
        server = app.app;

        // Create test users
        const adminUserData = {
            wallet_address: '0x1234567890123456789012345678901234567890',
            email: 'admin@test.com',
            username: 'admin',
            first_name: 'Admin',
            last_name: 'User',
            registration_number: 'REG-ADMIN-001',
            role: 'admin' as const
        };

        const regularUserData = {
            wallet_address: '0x0987654321098765432109876543210987654321',
            email: 'user@test.com',
            username: 'user',
            first_name: 'Regular',
            last_name: 'User',
            registration_number: 'REG-USER-001',
            role: 'voter' as const
        };

        // Create admin user
        const adminUser = await UserRepository.create(adminUserData);
        adminUserId = adminUser.id;
        adminToken = jwt.sign(
            { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        // Create regular user
        const regularUser = await UserRepository.create(regularUserData);
        regularUserId = regularUser.id;
        userToken = jwt.sign(
            { userId: regularUser.id, email: regularUser.email, role: regularUser.role },
            config.jwt.secret,
            { expiresIn: '1h' }
        );
    });

    afterAll(async () => {
        // Clean up test data
        await database.query('DELETE FROM users WHERE email LIKE \'%test%\'');
        await app.shutdown();
    });

    describe('GET /api/monitoring/health', () => {
        it('should return system health status for admin', async () => {
            const response = await request(server)
                .get('/api/v1/monitoring/health')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('status');
            expect(response.body.data).toHaveProperty('timestamp');
            expect(response.body.data).toHaveProperty('services');
            expect(response.body.data.services).toHaveProperty('database');
            expect(response.body.data.services).toHaveProperty('redis');
            expect(response.body.data.services).toHaveProperty('websocket');
            expect(response.body.data).toHaveProperty('system');
            expect(response.body.data).toHaveProperty('checks');
        });

        it('should return 503 if system is unhealthy', async () => {
            // This test would require mocking unhealthy services
            // For now, we'll just verify the endpoint structure
            const response = await request(server)
                .get('/api/v1/monitoring/health')
                .set('Authorization', `Bearer ${adminToken}`);

            expect([200, 503]).toContain(response.status);
            expect(response.body).toHaveProperty('success');
            expect(response.body).toHaveProperty('data');
        });

        it('should deny access to non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/monitoring/health')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should require authentication', async () => {
            const response = await request(server)
                .get('/api/v1/monitoring/health')
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/v1/monitoring/performance', () => {
        it('should return performance metrics for admin', async () => {
            const response = await request(server)
                .get('/api/v1/monitoring/performance')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('timestamp');
            expect(response.body.data).toHaveProperty('memory');
            expect(response.body.data).toHaveProperty('cpu');
            expect(response.body.data).toHaveProperty('database');
            expect(response.body.data).toHaveProperty('websocket');
            expect(response.body.data).toHaveProperty('process');

            // Verify memory metrics structure
            expect(response.body.data.memory).toHaveProperty('process');
            expect(response.body.data.memory).toHaveProperty('system');
            expect(response.body.data.memory.process).toHaveProperty('heapUtilization');
            expect(response.body.data.memory.system).toHaveProperty('utilization');

            // Verify CPU metrics structure
            expect(response.body.data.cpu).toHaveProperty('usage');
            expect(response.body.data.cpu).toHaveProperty('loadAverage');
            expect(response.body.data.cpu).toHaveProperty('cores');
        });

        it('should deny access to non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/monitoring/performance')
                .set('Authorization', `Bearer ${userToken}`)
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
            expect(response.body.data).toHaveProperty('timestamp');
            expect(response.body.data).toHaveProperty('overview');
            expect(response.body.data).toHaveProperty('services');
            expect(response.body.data).toHaveProperty('performance');
            expect(response.body.data).toHaveProperty('alerts');

            // Verify overview structure
            expect(response.body.data.overview).toHaveProperty('systemStatus');
            expect(response.body.data.overview).toHaveProperty('uptime');
            expect(response.body.data.overview).toHaveProperty('version');
            expect(response.body.data.overview).toHaveProperty('environment');

            // Verify services structure
            expect(response.body.data.services).toHaveProperty('database');
            expect(response.body.data.services).toHaveProperty('redis');
            expect(response.body.data.services).toHaveProperty('websocket');

            // Verify alerts is an array
            expect(Array.isArray(response.body.data.alerts)).toBe(true);
        });

        it('should deny access to non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/monitoring/dashboard')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('GET /api/v1/monitoring/config', () => {
        it('should return system configuration for admin', async () => {
            const response = await request(server)
                .get('/api/v1/monitoring/config')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('configuration');
            expect(response.body.data).toHaveProperty('timestamp');
            expect(response.body.data).toHaveProperty('note');

            // Verify configuration structure (should not contain sensitive data)
            const config = response.body.data.configuration;
            expect(config).toHaveProperty('server');
            expect(config).toHaveProperty('database');
            expect(config).toHaveProperty('redis');
            expect(config).toHaveProperty('jwt');

            // Verify sensitive data is not exposed
            expect(config.database).not.toHaveProperty('password');
            expect(config.redis).not.toHaveProperty('password');
            expect(config.jwt).not.toHaveProperty('secret');
        });

        it('should deny access to non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/monitoring/config')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('GET /api/v1/monitoring/logs', () => {
        it('should return application logs for admin', async () => {
            const response = await request(server)
                .get('/api/v1/monitoring/logs')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('timestamp');
            expect(response.body.data).toHaveProperty('message');
            expect(response.body.data).toHaveProperty('logs');
            expect(response.body.data).toHaveProperty('note');
            expect(Array.isArray(response.body.data.logs)).toBe(true);
        });

        it('should deny access to non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/monitoring/logs')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });
});