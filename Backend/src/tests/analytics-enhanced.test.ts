/// <reference types="jest" />
import request from 'supertest';
import App from '../app';
import database from '../config/database';
import UserRepository from '../repositories/UserRepository';
import ElectionRepository from '../repositories/ElectionRepository';
import jwt from 'jsonwebtoken';
import config from '../config';

describe('Enhanced Analytics Endpoints', () => {
    let app: App;
    let server: any;
    let adminToken: string;
    let userToken: string;
    let adminUserId: string;
    let regularUserId: string;
    let testElectionId: string;

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

        // Create test election
        const testElectionData = {
            contract_address: '0x1111111111111111111111111111111111111111',
            title: 'Test Election for Analytics',
            description: 'Test election for analytics testing',
            election_type: 'single_choice' as const,
            start_time: new Date(Date.now() + 60000), // 1 minute from now
            end_time: new Date(Date.now() + 3600000), // 1 hour from now
            creator_id: adminUserId,
            is_public: true
        };

        const testElection = await ElectionRepository.create(testElectionData);
        testElectionId = testElection.id;
    });

    afterAll(async () => {
        // Clean up test data
        await database.query('DELETE FROM elections WHERE title LIKE \'%Test%\'');
        await database.query('DELETE FROM users WHERE email LIKE \'%test%\'');
        await app.shutdown();
    });

    describe('GET /api/v1/analytics/realtime', () => {
        it('should return real-time statistics for admin', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/realtime')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('timestamp');
            expect(response.body.data).toHaveProperty('overview');
            expect(response.body.data).toHaveProperty('activity');
            expect(response.body.data).toHaveProperty('elections');
            expect(response.body.data).toHaveProperty('users');

            // Verify overview structure
            expect(response.body.data.overview).toHaveProperty('activeElections');
            expect(response.body.data.overview).toHaveProperty('totalUsers');
            expect(response.body.data.overview).toHaveProperty('totalVotes');
            expect(response.body.data.overview).toHaveProperty('systemUptime');

            // Verify activity structure
            expect(response.body.data.activity).toHaveProperty('recentVotes');
            expect(response.body.data.activity).toHaveProperty('votesLastHour');
            expect(response.body.data.activity).toHaveProperty('votesLast24Hours');

            // Verify elections structure
            expect(response.body.data.elections).toHaveProperty('pending');
            expect(response.body.data.elections).toHaveProperty('active');
            expect(response.body.data.elections).toHaveProperty('ended');
            expect(response.body.data.elections).toHaveProperty('total');

            // Verify users structure
            expect(response.body.data.users).toHaveProperty('total');
            expect(response.body.data.users).toHaveProperty('verified');
            expect(response.body.data.users).toHaveProperty('eligible');
            expect(response.body.data.users).toHaveProperty('voted');
        });

        it('should deny access to non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/realtime')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should require authentication', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/realtime')
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/v1/analytics/alerts', () => {
        it('should return system alerts for admin', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/alerts')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('timestamp');
            expect(response.body.data).toHaveProperty('summary');
            expect(response.body.data).toHaveProperty('alerts');

            // Verify summary structure
            expect(response.body.data.summary).toHaveProperty('total');
            expect(response.body.data.summary).toHaveProperty('errors');
            expect(response.body.data.summary).toHaveProperty('warnings');
            expect(response.body.data.summary).toHaveProperty('info');

            // Verify alerts structure
            expect(response.body.data.alerts).toHaveProperty('errors');
            expect(response.body.data.alerts).toHaveProperty('warnings');
            expect(response.body.data.alerts).toHaveProperty('info');
            expect(Array.isArray(response.body.data.alerts.errors)).toBe(true);
            expect(Array.isArray(response.body.data.alerts.warnings)).toBe(true);
            expect(Array.isArray(response.body.data.alerts.info)).toBe(true);

            // Verify alert structure if any alerts exist
            const allAlerts = [
                ...response.body.data.alerts.errors,
                ...response.body.data.alerts.warnings,
                ...response.body.data.alerts.info
            ];

            if (allAlerts.length > 0) {
                const alert = allAlerts[0];
                expect(alert).toHaveProperty('id');
                expect(alert).toHaveProperty('level');
                expect(alert).toHaveProperty('title');
                expect(alert).toHaveProperty('message');
                expect(alert).toHaveProperty('timestamp');
            }
        });

        it('should deny access to non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/alerts')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('GET /api/v1/analytics/system', () => {
        it('should return comprehensive system statistics for admin', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/system')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('overview');
            expect(response.body.data).toHaveProperty('elections');
            expect(response.body.data).toHaveProperty('users');
            expect(response.body.data).toHaveProperty('candidates');
            expect(response.body.data).toHaveProperty('eligibility');
            expect(response.body.data).toHaveProperty('recentActivity');

            // Verify overview structure
            expect(response.body.data.overview).toHaveProperty('totalElections');
            expect(response.body.data.overview).toHaveProperty('activeElections');
            expect(response.body.data.overview).toHaveProperty('totalUsers');
            expect(response.body.data.overview).toHaveProperty('totalVotes');
            expect(response.body.data.overview).toHaveProperty('systemUptime');

            // Verify recent activity structure
            expect(response.body.data.recentActivity).toHaveProperty('recentVotes');
            expect(Array.isArray(response.body.data.recentActivity.recentVotes)).toBe(true);
        });

        it('should deny access to non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/system')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('GET /api/v1/analytics/patterns', () => {
        it('should return voting patterns for admin', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/patterns')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('timeframe');
            expect(response.body.data).toHaveProperty('activity');
            expect(response.body.data).toHaveProperty('patterns');
            expect(response.body.data).toHaveProperty('summary');

            // Verify patterns structure
            expect(response.body.data.patterns).toHaveProperty('hourlyDistribution');
            expect(response.body.data.patterns).toHaveProperty('dailyDistribution');
            expect(Array.isArray(response.body.data.patterns.hourlyDistribution)).toBe(true);
            expect(Array.isArray(response.body.data.patterns.dailyDistribution)).toBe(true);

            // Verify hourly distribution structure
            if (response.body.data.patterns.hourlyDistribution.length > 0) {
                const hourData = response.body.data.patterns.hourlyDistribution[0];
                expect(hourData).toHaveProperty('hour');
                expect(hourData).toHaveProperty('count');
                expect(hourData).toHaveProperty('percentage');
            }

            // Verify daily distribution structure
            if (response.body.data.patterns.dailyDistribution.length > 0) {
                const dayData = response.body.data.patterns.dailyDistribution[0];
                expect(dayData).toHaveProperty('day');
                expect(dayData).toHaveProperty('count');
                expect(dayData).toHaveProperty('percentage');
            }

            // Verify summary structure
            expect(response.body.data.summary).toHaveProperty('totalVotesAnalyzed');
            expect(response.body.data.summary).toHaveProperty('peakHour');
            expect(response.body.data.summary).toHaveProperty('peakDay');
        });

        it('should accept timeframe parameter', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/patterns?timeframe=hour')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.timeframe).toBe('hour');
        });

        it('should accept electionId parameter', async () => {
            const response = await request(server)
                .get(`/api/v1/analytics/patterns?electionId=${testElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.electionId).toBe(testElectionId);
        });

        it('should validate timeframe parameter', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/patterns?timeframe=invalid')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should deny access to non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/patterns')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('GET /api/v1/analytics/engagement', () => {
        it('should return user engagement metrics for admin', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/engagement')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('period');
            expect(response.body.data).toHaveProperty('dateRange');
            expect(response.body.data).toHaveProperty('engagement');
            expect(response.body.data).toHaveProperty('userBreakdown');

            // Verify engagement structure
            expect(response.body.data.engagement).toHaveProperty('totalUsers');
            expect(response.body.data.engagement).toHaveProperty('activeUsers');
            expect(response.body.data.engagement).toHaveProperty('votersWhoVoted');
            expect(response.body.data.engagement).toHaveProperty('engagementRate');

            // Verify user breakdown structure
            expect(response.body.data.userBreakdown).toHaveProperty('byRole');
            expect(response.body.data.userBreakdown).toHaveProperty('byStatus');
            expect(response.body.data.userBreakdown).toHaveProperty('byVerification');

            // Verify date range structure
            expect(response.body.data.dateRange).toHaveProperty('start');
            expect(response.body.data.dateRange).toHaveProperty('end');
        });

        it('should accept period parameter', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/engagement?period=week')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.period).toBe('week');
        });

        it('should validate period parameter', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/engagement?period=invalid')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should deny access to non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/engagement')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });
});