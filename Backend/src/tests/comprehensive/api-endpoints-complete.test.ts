/// <reference types="jest" />
import request from 'supertest';
import App from '../../app';
import database from '../../config/database';
import { repositories } from '../../repositories';
import jwt from 'jsonwebtoken';
import config from '../../config';

describe('Complete API Endpoints Testing', () => {
    let app: App;
    let server: any;
    let adminToken: string;
    let creatorToken: string;
    let voterToken: string;
    let adminUserId: string;
    let creatorUserId: string;
    let voterUserId: string;
    let testElectionId: string;

    beforeAll(async () => {
        app = new App();
        await app.initialize();
        server = app.app;

        // Create test users with different roles
        const adminUser = await repositories.user.create({
            wallet_address: '0x1111111111111111111111111111111111111111',
            email: 'admin@complete.test',
            username: 'admin_complete',
            first_name: 'Admin',
            last_name: 'Complete',
            registration_number: 'REG-ADMIN-COMPLETE-001',
            role: 'admin',
            voter_status: 'eligible',
            is_verified: true,
            is_email_verified: true
        });
        adminUserId = adminUser.id;
        adminToken = jwt.sign(
            { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        const creatorUser = await repositories.user.create({
            wallet_address: '0x2222222222222222222222222222222222222222',
            email: 'creator@complete.test',
            username: 'creator_complete',
            first_name: 'Creator',
            last_name: 'Complete',
            registration_number: 'REG-CREATOR-COMPLETE-001',
            role: 'creator',
            voter_status: 'eligible',
            is_verified: true,
            is_email_verified: true
        });
        creatorUserId = creatorUser.id;
        creatorToken = jwt.sign(
            { userId: creatorUser.id, email: creatorUser.email, role: creatorUser.role },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        const voterUser = await repositories.user.create({
            wallet_address: '0x3333333333333333333333333333333333333333',
            email: 'voter@complete.test',
            username: 'voter_complete',
            first_name: 'Voter',
            last_name: 'Complete',
            registration_number: 'REG-VOTER-COMPLETE-001',
            role: 'voter',
            voter_status: 'eligible',
            is_verified: true,
            is_email_verified: true
        });
        voterUserId = voterUser.id;
        voterToken = jwt.sign(
            { userId: voterUser.id, email: voterUser.email, role: voterUser.role },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        // Create test election
        const election = await repositories.election.create({
            contract_address: '0x1234567890123456789012345678901234567890',
            title: 'Complete Test Election',
            description: 'Election for complete API testing',
            creator_id: creatorUserId,
            election_type: 'single_choice',
            start_time: new Date(Date.now() + 60000),
            end_time: new Date(Date.now() + 3600000),
            is_public: true,
            status: 'pending'
        });
        testElectionId = election.id;

        // Create test candidates
        await repositories.candidate.create({
            election_id: testElectionId,
            name: 'Complete Candidate 1',
            description: 'First candidate for complete testing',
            position: 1
        });

        await repositories.candidate.create({
            election_id: testElectionId,
            name: 'Complete Candidate 2',
            description: 'Second candidate for complete testing',
            position: 2
        });
    });

    afterAll(async () => {
        // Clean up test data
        await database.query('DELETE FROM candidates WHERE election_id IN (SELECT id FROM elections WHERE title LIKE \'%Complete Test%\')');
        await database.query('DELETE FROM elections WHERE title LIKE \'%Complete Test%\'');
        await database.query('DELETE FROM users WHERE email LIKE \'%complete.test%\'');
        await app.shutdown();
    });

    describe('Complete API Endpoint Coverage', () => {
        it('should test all authentication endpoints', async () => {
            // Test registration
            const registerResponse = await request(server)
                .post('/api/v1/auth/register')
                .send({
                    email: 'newuser@complete.test',
                    username: 'newuser_complete',
                    firstName: 'New',
                    lastName: 'User',
                    registrationNumber: 'REG-NEW-COMPLETE-001'
                })
                .expect(201);

            expect(registerResponse.body.success).toBe(true);

            // Test login initiation
            const loginInitResponse = await request(server)
                .post('/api/v1/auth/login')
                .send({ email: 'admin@complete.test' })
                .expect(200);

            expect(loginInitResponse.body.success).toBe(true);
            expect(loginInitResponse.body.data.requiresOtp).toBe(true);

            // Test profile access
            const profileResponse = await request(server)
                .get('/api/v1/auth/profile')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(profileResponse.body.success).toBe(true);
            expect(profileResponse.body.data.user.id).toBe(adminUserId);
        });

        it('should test all election management endpoints', async () => {
            // Test election creation
            const createResponse = await request(server)
                .post('/api/v1/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    title: 'API Test Election',
                    description: 'Election for API testing',
                    electionType: 'single_choice',
                    startTime: new Date(Date.now() + 60000).toISOString(),
                    endTime: new Date(Date.now() + 3600000).toISOString(),
                    isPublic: true,
                    candidates: [
                        { name: 'API Candidate 1', description: 'First API candidate' },
                        { name: 'API Candidate 2', description: 'Second API candidate' }
                    ]
                })
                .expect(201);

            const newElectionId = createResponse.body.data.election.id;

            // Test election listing
            const listResponse = await request(server)
                .get('/api/v1/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(listResponse.body.success).toBe(true);
            expect(listResponse.body.data.elections).toBeDefined();

            // Test election details
            const detailsResponse = await request(server)
                .get(`/api/v1/elections/${newElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(detailsResponse.body.success).toBe(true);
            expect(detailsResponse.body.data.election.id).toBe(newElectionId);

            // Test election update
            const updateResponse = await request(server)
                .put(`/api/v1/elections/${newElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Updated description' })
                .expect(200);

            expect(updateResponse.body.success).toBe(true);

            // Test election deletion
            const deleteResponse = await request(server)
                .delete(`/api/v1/elections/${newElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(deleteResponse.body.success).toBe(true);
        });

        it('should test all voting endpoints', async () => {
            // Test voting eligibility
            const eligibilityResponse = await request(server)
                .get(`/api/v1/voting/eligibility/${testElectionId}`)
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(200);

            expect(eligibilityResponse.body.success).toBe(true);
            expect(eligibilityResponse.body.data.eligibility).toBeDefined();

            // Test voting history
            const historyResponse = await request(server)
                .get('/api/v1/voting/history')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(200);

            expect(historyResponse.body.success).toBe(true);
            expect(historyResponse.body.data.votes).toBeDefined();
        });

        it('should test all analytics endpoints', async () => {
            // Test system analytics (admin only)
            const systemAnalyticsResponse = await request(server)
                .get('/api/v1/analytics/system')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(systemAnalyticsResponse.body.success).toBe(true);
            expect(systemAnalyticsResponse.body.data.metrics).toBeDefined();

            // Test election analytics (admin only)
            const electionAnalyticsResponse = await request(server)
                .get(`/api/v1/analytics/elections/${testElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(electionAnalyticsResponse.body.success).toBe(true);
            expect(electionAnalyticsResponse.body.data.analytics).toBeDefined();
        });

        it('should test all user management endpoints', async () => {
            // Test user profile
            const profileResponse = await request(server)
                .get('/api/v1/users/profile')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(200);

            expect(profileResponse.body.success).toBe(true);
            expect(profileResponse.body.data.user.id).toBe(voterUserId);

            // Test profile update
            const updateResponse = await request(server)
                .put('/api/v1/users/profile')
                .set('Authorization', `Bearer ${voterToken}`)
                .send({
                    firstName: 'Updated',
                    lastName: 'Name'
                })
                .expect(200);

            expect(updateResponse.body.success).toBe(true);
        });

        it('should test all monitoring endpoints', async () => {
            // Test system health
            const healthResponse = await request(server)
                .get('/health')
                .expect(200);

            expect(['healthy', 'degraded']).toContain(healthResponse.body.status);

            // Test system monitoring (admin only)
            const monitoringResponse = await request(server)
                .get('/api/v1/monitoring/system')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(monitoringResponse.body.success).toBe(true);
            expect(monitoringResponse.body.data.status).toBeDefined();
        });

        it('should test error handling across all endpoints', async () => {
            // Test 404 errors
            const notFoundResponse = await request(server)
                .get('/api/v1/nonexistent')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);

            expect(notFoundResponse.body.success).toBe(false);
            expect(notFoundResponse.body.error.code).toBe('NOT_FOUND');

            // Test unauthorized access
            const unauthorizedResponse = await request(server)
                .get('/api/v1/auth/profile')
                .expect(401);

            expect(unauthorizedResponse.body.success).toBe(false);
            expect(unauthorizedResponse.body.error.code).toBe('UNAUTHORIZED');

            // Test forbidden access
            const forbiddenResponse = await request(server)
                .get('/api/v1/analytics/system')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(403);

            expect(forbiddenResponse.body.success).toBe(false);
            expect(forbiddenResponse.body.error.code).toBe('FORBIDDEN');
        });
    });
});
