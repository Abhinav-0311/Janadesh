/// <reference types="jest" />
import request from 'supertest';
import App from '../../app';
import database from '../../config/database';
import { repositories } from '../../repositories';
import jwt from 'jsonwebtoken';
import config from '../../config';

describe('Comprehensive Unit Tests - API Endpoints', () => {
    let app: App;
    let server: any;
    let adminToken: string;
    let creatorToken: string;
    let voterToken: string;
    let adminUserId: string;
    let creatorUserId: string;
    let voterUserId: string;
    let testElectionId: string | undefined;

    beforeAll(async () => {
        app = new App();
        await app.initialize();
        server = app.app;

        // Create test users with different roles
        const adminUser = await repositories.user.create({
            wallet_address: '0x1111111111111111111111111111111111111111',
            email: 'admin@unit.test',
            username: 'admin_unit',
            first_name: 'Admin',
            last_name: 'Unit',
            registration_number: 'REG-ADMIN-UNIT-001',
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
            email: 'creator@unit.test',
            username: 'creator_unit',
            first_name: 'Creator',
            last_name: 'Unit',
            registration_number: 'REG-CREATOR-UNIT-001',
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
            email: 'voter@unit.test',
            username: 'voter_unit',
            first_name: 'Voter',
            last_name: 'Unit',
            registration_number: 'REG-VOTER-UNIT-001',
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
    });

    afterAll(async () => {
        // Clean up test data
        await database.query('DELETE FROM candidates WHERE election_id IN (SELECT id FROM elections WHERE title LIKE \'%Unit Test%\')');
        await database.query('DELETE FROM elections WHERE title LIKE \'%Unit Test%\'');
        await database.query('DELETE FROM users WHERE email LIKE \'%unit.test%\'');
        await app.shutdown();
    });

    describe('Authentication Endpoints', () => {
        describe('POST /api/v1/auth/register', () => {
            it('should register new user with valid data', async () => {
                const userData = {
                    email: 'newuser@unit.test',
                    username: 'newuser_unit',
                    firstName: 'New',
                    lastName: 'User',
                    registrationNumber: 'REG-NEW-UNIT-001'
                };

                const response = await request(server)
                    .post('/api/v1/auth/register')
                    .send(userData)
                    .expect(201);

                expect(response.body.success).toBe(true);
                expect(response.body.data.user.email).toBe(userData.email);
                expect(response.body.data.verificationRequired).toBe(true);
            });

            it('should reject registration with invalid email format', async () => {
                const userData = {
                    email: 'invalid-email-format',
                    username: 'invalid_unit',
                    registrationNumber: 'REG-INVALID-001'
                };

                const response = await request(server)
                    .post('/api/v1/auth/register')
                    .send(userData)
                    .expect(400);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('VALIDATION_ERROR');
            });

            it('should reject registration with missing required fields', async () => {
                const userData = {
                    email: 'incomplete@unit.test'
                    // Missing username and registrationNumber
                };

                const response = await request(server)
                    .post('/api/v1/auth/register')
                    .send(userData)
                    .expect(400);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('VALIDATION_ERROR');
            });

            it('should reject duplicate email registration', async () => {
                const userData = {
                    email: 'duplicate@unit.test',
                    username: 'duplicate1_unit',
                    registrationNumber: 'REG-DUP1-001'
                };

                // First registration
                await request(server)
                    .post('/api/v1/auth/register')
                    .send(userData)
                    .expect(201);

                // Duplicate registration
                const duplicateData = {
                    ...userData,
                    username: 'duplicate2_unit',
                    registrationNumber: 'REG-DUP2-001'
                };

                const response = await request(server)
                    .post('/api/v1/auth/register')
                    .send(duplicateData)
                    .expect(409);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('CONFLICT');
            });
        });

        describe('POST /api/v1/auth/login', () => {
            it('should initiate login for verified user', async () => {
                const response = await request(server)
                    .post('/api/v1/auth/login')
                    .send({ email: 'admin@unit.test' })
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.requiresOtp).toBe(true);
                expect(response.body.data.userId).toBe(adminUserId);
            });

            it('should reject login for non-existent user', async () => {
                const response = await request(server)
                    .post('/api/v1/auth/login')
                    .send({ email: 'nonexistent@unit.test' })
                    .expect(401);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
            });
        });

        describe('GET /api/v1/auth/profile', () => {
            it('should return user profile with valid token', async () => {
                const response = await request(server)
                    .get('/api/v1/auth/profile')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.user.id).toBe(adminUserId);
                expect(response.body.data.user.email).toBe('admin@unit.test');
            });

            it('should reject request without token', async () => {
                const response = await request(server)
                    .get('/api/v1/auth/profile')
                    .expect(401);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
            });

            it('should reject request with invalid token', async () => {
                const response = await request(server)
                    .get('/api/v1/auth/profile')
                    .set('Authorization', 'Bearer invalid-token')
                    .expect(401);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
            });
        });
    });

    describe('Election Management Endpoints', () => {

        describe('POST /api/v1/elections', () => {
            it('should create election as admin', async () => {
                const electionData = {
                    title: 'Unit Test Election Admin',
                    description: 'Election created by admin for unit testing',
                    electionType: 'single_choice',
                    startTime: new Date(Date.now() + 60000).toISOString(),
                    endTime: new Date(Date.now() + 3600000).toISOString(),
                    isPublic: true,
                    candidates: [
                        { name: 'Admin Candidate 1', description: 'First candidate' },
                        { name: 'Admin Candidate 2', description: 'Second candidate' }
                    ]
                };

                const response = await request(server)
                    .post('/api/v1/elections')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(electionData)
                    .expect(201);

                expect(response.body.success).toBe(true);
                expect(response.body.data.election.title).toBe(electionData.title);
                expect(response.body.data.candidates).toHaveLength(2);
                testElectionId = response.body.data.election.id;
            });

            it('should create election as creator', async () => {
                const electionData = {
                    title: 'Unit Test Election Creator',
                    description: 'Election created by creator for unit testing',
                    electionType: 'single_choice',
                    startTime: new Date(Date.now() + 60000).toISOString(),
                    endTime: new Date(Date.now() + 3600000).toISOString(),
                    isPublic: true,
                    candidates: [
                        { name: 'Creator Candidate 1', description: 'Creator candidate' }
                    ]
                };

                const response = await request(server)
                    .post('/api/v1/elections')
                    .set('Authorization', `Bearer ${creatorToken}`)
                    .send(electionData)
                    .expect(201);

                expect(response.body.success).toBe(true);
                expect(response.body.data.election.creator_id).toBe(creatorUserId);
            });

            it('should reject election creation by voter', async () => {
                const electionData = {
                    title: 'Unit Test Election Voter',
                    description: 'Election attempted by voter',
                    electionType: 'single_choice',
                    startTime: new Date(Date.now() + 60000).toISOString(),
                    endTime: new Date(Date.now() + 3600000).toISOString(),
                    isPublic: true,
                    candidates: [
                        { name: 'Voter Candidate', description: 'Should not be created' }
                    ]
                };

                const response = await request(server)
                    .post('/api/v1/elections')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .send(electionData)
                    .expect(403);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('FORBIDDEN');
            });

            it('should validate election time constraints', async () => {
                const electionData = {
                    title: 'Invalid Time Election',
                    description: 'Election with invalid time constraints',
                    electionType: 'single_choice',
                    startTime: new Date(Date.now() + 3600000).toISOString(), // Start after end
                    endTime: new Date(Date.now() + 60000).toISOString(),
                    isPublic: true,
                    candidates: [
                        { name: 'Invalid Time Candidate', description: 'Should not be created' }
                    ]
                };

                const response = await request(server)
                    .post('/api/v1/elections')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(electionData)
                    .expect(400);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('VALIDATION_ERROR');
            });
        });

        describe('GET /api/v1/elections', () => {
            it('should get paginated elections list', async () => {
                const response = await request(server)
                    .get('/api/v1/elections?page=1&limit=10')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.elections).toBeDefined();
                expect(response.body.data.pagination).toBeDefined();
                expect(response.body.data.pagination.page).toBe(1);
                expect(response.body.data.pagination.limit).toBe(10);
            });

            it('should filter elections by status', async () => {
                const response = await request(server)
                    .get('/api/v1/elections?status=pending')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.elections).toBeDefined();
            });

            it('should search elections by title', async () => {
                const response = await request(server)
                    .get('/api/v1/elections?search=Unit Test')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.elections).toBeDefined();
            });
        });

        describe('GET /api/v1/elections/:id', () => {
            it('should get election details by ID', async () => {
                if (testElectionId) {
                    const response = await request(server)
                        .get(`/api/v1/elections/${testElectionId}`)
                        .set('Authorization', `Bearer ${adminToken}`)
                        .expect(200);

                    expect(response.body.success).toBe(true);
                    expect(response.body.data.election.id).toBe(testElectionId);
                    expect(response.body.data.candidates).toBeDefined();
                }
            });

            it('should return 404 for non-existent election', async () => {
                const fakeId = '123e4567-e89b-12d3-a456-426614174000';
                const response = await request(server)
                    .get(`/api/v1/elections/${fakeId}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(404);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('NOT_FOUND');
            });

            it('should validate UUID format', async () => {
                const response = await request(server)
                    .get('/api/v1/elections/invalid-uuid')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(400);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('VALIDATION_ERROR');
            });
        });
    });

    describe('User Management Endpoints', () => {
        describe('GET /api/v1/users/profile', () => {
            it('should get current user profile', async () => {
                const response = await request(server)
                    .get('/api/v1/users/profile')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.user.id).toBe(voterUserId);
                expect(response.body.data.user.role).toBe('voter');
            });
        });

        describe('PUT /api/v1/users/profile', () => {
            it('should update user profile', async () => {
                const updateData = {
                    firstName: 'Updated',
                    lastName: 'Name'
                };

                const response = await request(server)
                    .put('/api/v1/users/profile')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .send(updateData)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.user.first_name).toBe(updateData.firstName);
                expect(response.body.data.user.last_name).toBe(updateData.lastName);
            });

            it('should validate profile update data', async () => {
                const invalidData = {
                    email: 'invalid-email-format'
                };

                const response = await request(server)
                    .put('/api/v1/users/profile')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .send(invalidData)
                    .expect(400);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('VALIDATION_ERROR');
            });
        });
    });

    describe('Voting Endpoints', () => {
        describe('GET /api/v1/voting/history', () => {
            it('should get user voting history', async () => {
                const response = await request(server)
                    .get('/api/v1/voting/history')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.votes).toBeDefined();
                expect(Array.isArray(response.body.data.votes)).toBe(true);
            });

            it('should paginate voting history', async () => {
                const response = await request(server)
                    .get('/api/v1/voting/history?page=1&limit=5')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.pagination).toBeDefined();
                expect(response.body.data.pagination.page).toBe(1);
                expect(response.body.data.pagination.limit).toBe(5);
            });
        });

        describe('GET /api/v1/voting/eligibility/:electionId', () => {
            it('should check voting eligibility', async () => {
                if (testElectionId) {
                    const response = await request(server)
                        .get(`/api/v1/voting/eligibility/${testElectionId}`)
                        .set('Authorization', `Bearer ${voterToken}`)
                        .expect(200);

                    expect(response.body.success).toBe(true);
                    expect(response.body.data.eligibility).toBeDefined();
                    expect(typeof response.body.data.eligibility.isEligible).toBe('boolean');
                }
            });

            it('should validate election ID format', async () => {
                const response = await request(server)
                    .get('/api/v1/voting/eligibility/invalid-uuid')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .expect(400);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('VALIDATION_ERROR');
            });
        });
    });

    describe('Analytics Endpoints', () => {
        describe('GET /api/v1/analytics/system', () => {
            it('should get system analytics for admin', async () => {
                const response = await request(server)
                    .get('/api/v1/analytics/system')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.metrics).toBeDefined();
            });

            it('should reject system analytics for non-admin', async () => {
                const response = await request(server)
                    .get('/api/v1/analytics/system')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .expect(403);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('FORBIDDEN');
            });
        });

        describe('GET /api/v1/analytics/elections/:id', () => {
            it('should get election analytics for admin', async () => {
                if (testElectionId) {
                    const response = await request(server)
                        .get(`/api/v1/analytics/elections/${testElectionId}`)
                        .set('Authorization', `Bearer ${adminToken}`)
                        .expect(200);

                    expect(response.body.success).toBe(true);
                    expect(response.body.data.analytics).toBeDefined();
                }
            });

            it('should reject election analytics for non-admin', async () => {
                if (testElectionId) {
                    const response = await request(server)
                        .get(`/api/v1/analytics/elections/${testElectionId}`)
                        .set('Authorization', `Bearer ${voterToken}`)
                        .expect(403);

                    expect(response.body.success).toBe(false);
                    expect(response.body.error.code).toBe('FORBIDDEN');
                }
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle malformed JSON requests', async () => {
            const response = await request(server)
                .post('/api/v1/auth/register')
                .set('Content-Type', 'application/json')
                .send('{"invalid": json}')
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should handle missing Content-Type header', async () => {
            const response = await request(server)
                .post('/api/v1/auth/register')
                .send('invalid data')
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should handle oversized request payloads', async () => {
            const largePayload = {
                description: 'x'.repeat(10000) // Very large description
            };

            const response = await request(server)
                .post('/api/v1/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(largePayload)
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should return proper error format', async () => {
            const response = await request(server)
                .get('/api/v1/nonexistent-endpoint')
                .expect(404);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code');
            expect(response.body.error).toHaveProperty('message');
            expect(response.body).toHaveProperty('timestamp');
        });
    });

    describe('Security Headers', () => {
        it('should include security headers in responses', async () => {
            const response = await request(server)
                .get('/health')
                .expect(200);

            expect(response.headers).toHaveProperty('x-content-type-options');
            expect(response.headers).toHaveProperty('x-frame-options');
            expect(response.headers).toHaveProperty('x-xss-protection');
        });

        it('should include CORS headers', async () => {
            const response = await request(server)
                .options('/api/v1/elections/public')
                .expect(204);

            expect(response.headers).toHaveProperty('access-control-allow-origin');
            expect(response.headers).toHaveProperty('access-control-allow-methods');
            expect(response.headers).toHaveProperty('access-control-allow-headers');
        });

        it('should include request ID in responses', async () => {
            const response = await request(server)
                .get('/health')
                .expect(200);

            expect(response.headers).toHaveProperty('x-request-id');
            expect(typeof response.headers['x-request-id']).toBe('string');
        });
    });
});