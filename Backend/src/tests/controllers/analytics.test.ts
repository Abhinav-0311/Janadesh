/// <reference types="jest" />
import request from 'supertest';
import App from '../../app';
import database from '../../config/database';
import UserRepository from '../../repositories/UserRepository';
import ElectionRepository from '../../repositories/ElectionRepository';
import CandidateRepository from '../../repositories/CandidateRepository';
import VoteCacheRepository from '../../repositories/VoteCacheRepository';
import jwt from 'jsonwebtoken';
import config from '../../config';

describe('Analytics Controller', () => {
    let app: App;
    let server: any;
    let adminToken: string;
    let voterToken: string;
    let adminUserId: string;
    let voterUserId: string;
    let testElectionId: string;
    let testCandidateIds: string[] = [];

    beforeAll(async () => {
        app = new App();
        await app.initialize();
        server = app.app;

        // Create test users
        const adminUser = await UserRepository.create({
            wallet_address: '0x1111111111111111111111111111111111111111',
            email: 'admin@analytics.test',
            username: 'analyticsadmin',
            first_name: 'Analytics',
            last_name: 'Admin',
            registration_number: 'REG-ANALYTICS-ADMIN',
            role: 'admin',
            voter_status: 'eligible'
        });
        adminUserId = adminUser.id;
        adminToken = jwt.sign(
            { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        const voterUser = await UserRepository.create({
            wallet_address: '0x2222222222222222222222222222222222222222',
            email: 'voter@analytics.test',
            username: 'analyticsvoter',
            first_name: 'Analytics',
            last_name: 'Voter',
            registration_number: 'REG-ANALYTICS-VOTER',
            role: 'voter',
            voter_status: 'eligible'
        });
        voterUserId = voterUser.id;
        voterToken = jwt.sign(
            { userId: voterUser.id, email: voterUser.email, role: voterUser.role },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        // Create test election with candidates and votes
        const election = await ElectionRepository.create({
            title: 'Analytics Test Election',
            description: 'Election for analytics testing',
            creator_id: adminUserId,
            election_type: 'single_choice',
            start_time: new Date(Date.now() - 3600000), // Started 1 hour ago
            end_time: new Date(Date.now() + 3600000), // Ends in 1 hour
            is_public: true,
            status: 'active'
        });
        testElectionId = election.id;

        // Create candidates
        const candidate1 = await CandidateRepository.create({
            election_id: testElectionId,
            name: 'Analytics Candidate 1',
            description: 'First candidate for analytics',
            position: 1
        });
        testCandidateIds.push(candidate1.id);

        const candidate2 = await CandidateRepository.create({
            election_id: testElectionId,
            name: 'Analytics Candidate 2',
            description: 'Second candidate for analytics',
            position: 2
        });
        testCandidateIds.push(candidate2.id);

        // Create some vote cache entries for analytics
        await VoteCacheRepository.create({
            election_id: testElectionId,
            voter_address: '0x3333333333333333333333333333333333333333',
            voter_id: voterUserId,
            candidate_id: candidate1.id,
            transaction_hash: '0xabc123',
            block_number: 12345
        });

        await VoteCacheRepository.create({
            election_id: testElectionId,
            voter_address: '0x4444444444444444444444444444444444444444',
            voter_id: adminUserId,
            candidate_id: candidate2.id,
            transaction_hash: '0xdef456',
            block_number: 12346
        });
    });

    afterAll(async () => {
        // Clean up test data
        await database.query('DELETE FROM votes_cache WHERE election_id IN (SELECT id FROM elections WHERE title LIKE \'%Analytics%\')');
        await database.query('DELETE FROM candidates WHERE election_id IN (SELECT id FROM elections WHERE title LIKE \'%Analytics%\')');
        await database.query('DELETE FROM elections WHERE title LIKE \'%Analytics%\'');
        await database.query('DELETE FROM users WHERE email LIKE \'%analytics.test%\'');
        await app.shutdown();
    });

    describe('GET /api/v1/analytics/elections', () => {
        it('should get election statistics for admin', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.statistics).toBeDefined();
            expect(response.body.data.statistics.totalElections).toBeGreaterThanOrEqual(1);
            expect(response.body.data.statistics.activeElections).toBeGreaterThanOrEqual(0);
            expect(response.body.data.statistics.completedElections).toBeGreaterThanOrEqual(0);
            expect(response.body.data.statistics.pendingElections).toBeGreaterThanOrEqual(0);
        });

        it('should get election statistics with date range', async () => {
            const startDate = new Date(Date.now() - 86400000).toISOString(); // 24 hours ago
            const endDate = new Date().toISOString();

            const response = await request(server)
                .get(`/api/v1/analytics/elections?startDate=${startDate}&endDate=${endDate}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.statistics).toBeDefined();
        });

        it('should reject access for non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/elections')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should reject unauthenticated requests', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/elections')
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });
    });

    describe('GET /api/v1/analytics/elections/:id', () => {
        it('should get detailed election analytics for admin', async () => {
            const response = await request(server)
                .get(`/api/v1/analytics/elections/${testElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.election).toBeDefined();
            expect(response.body.data.analytics).toBeDefined();
            expect(response.body.data.analytics.totalVotes).toBeGreaterThanOrEqual(0);
            expect(response.body.data.analytics.candidateResults).toBeDefined();
            expect(Array.isArray(response.body.data.analytics.candidateResults)).toBe(true);
        });

        it('should include voting patterns in analytics', async () => {
            const response = await request(server)
                .get(`/api/v1/analytics/elections/${testElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.analytics.votingPatterns).toBeDefined();
            expect(response.body.data.analytics.timeDistribution).toBeDefined();
        });

        it('should return 404 for non-existent election', async () => {
            const fakeId = '123e4567-e89b-12d3-a456-426614174000';
            const response = await request(server)
                .get(`/api/v1/analytics/elections/${fakeId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(['NOT_FOUND', 'ELECTION_NOT_FOUND']).toContain(response.body.error.code);
        });

        it('should validate UUID format', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/elections/invalid-uuid')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('GET /api/v1/analytics/votes', () => {
        it('should get voting statistics for admin', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/votes')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.statistics).toBeDefined();
            expect(response.body.data.statistics.totalVotes).toBeGreaterThanOrEqual(0);
            expect(response.body.data.statistics.uniqueVoters).toBeGreaterThanOrEqual(0);
        });

        it('should filter votes by election', async () => {
            const response = await request(server)
                .get(`/api/v1/analytics/votes?electionId=${testElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.statistics).toBeDefined();
        });

        it('should get voting trends over time', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/votes?includeTrends=true')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.trends).toBeDefined();
            expect(Array.isArray(response.body.data.trends)).toBe(true);
        });

        it('should reject access for non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/votes')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('GET /api/v1/analytics/users', () => {
        it('should get user statistics for admin', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.statistics).toBeDefined();
            expect(response.body.data.statistics.totalUsers).toBeGreaterThanOrEqual(2);
            expect(response.body.data.statistics.verifiedUsers).toBeGreaterThanOrEqual(0);
            expect(response.body.data.statistics.activeUsers).toBeGreaterThanOrEqual(0);
        });

        it('should get user registration trends', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/users?includeTrends=true')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.registrationTrends).toBeDefined();
            expect(Array.isArray(response.body.data.registrationTrends)).toBe(true);
        });

        it('should get user role distribution', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.statistics.roleDistribution).toBeDefined();
            expect(response.body.data.statistics.roleDistribution.admin).toBeGreaterThanOrEqual(1);
            expect(response.body.data.statistics.roleDistribution.voter).toBeGreaterThanOrEqual(1);
        });

        it('should reject access for non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/users')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('GET /api/v1/analytics/system', () => {
        it('should get system performance metrics for admin', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/system')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.metrics).toBeDefined();
            expect(response.body.data.metrics.uptime).toBeDefined();
            expect(response.body.data.metrics.memoryUsage).toBeDefined();
            expect(response.body.data.metrics.databaseConnections).toBeDefined();
        });

        it('should get blockchain connectivity status', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/system')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.blockchain).toBeDefined();
            expect(response.body.data.blockchain.connected).toBeDefined();
            expect(response.body.data.blockchain.networkId).toBeDefined();
        });

        it('should reject access for non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/system')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('GET /api/v1/analytics/dashboard', () => {
        it('should get dashboard summary for admin', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/dashboard')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.summary).toBeDefined();
            expect(response.body.data.summary.elections).toBeDefined();
            expect(response.body.data.summary.votes).toBeDefined();
            expect(response.body.data.summary.users).toBeDefined();
            expect(response.body.data.summary.system).toBeDefined();
        });

        it('should include recent activity in dashboard', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/dashboard')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.recentActivity).toBeDefined();
            expect(Array.isArray(response.body.data.recentActivity)).toBe(true);
        });

        it('should include alerts and notifications', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/dashboard')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.alerts).toBeDefined();
            expect(Array.isArray(response.body.data.alerts)).toBe(true);
        });

        it('should reject access for non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/dashboard')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('Error Handling', () => {
        it('should handle database connection errors gracefully', async () => {
            // Mock only analytics election stats query path and keep auth queries working
            const originalQuery = database.query.bind(database);
            const querySpy = jest.spyOn(database, 'query').mockImplementation(((text: string, params?: unknown[]) => {
                if (typeof text === 'string' && text.includes('FROM elections')) {
                    return Promise.reject(new Error('Database connection lost'));
                }
                return originalQuery(text, params);
            }) as any);

            const response = await request(server)
                .get('/api/v1/analytics/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');

            // Restore original function
            querySpy.mockRestore();
        });

        it('should validate query parameters', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/elections?startDate=invalid-date')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should handle large dataset queries with pagination', async () => {
            const response = await request(server)
                .get('/api/v1/analytics/votes?page=1&limit=1000')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.pagination).toBeDefined();
        });
    });
});
