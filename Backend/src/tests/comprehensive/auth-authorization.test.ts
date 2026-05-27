/// <reference types="jest" />
import request from 'supertest';
import App from '../../app';
import database from '../../config/database';
import { repositories } from '../../repositories';
import jwt from 'jsonwebtoken';
import config from '../../config';

describe('Comprehensive Authentication and Authorization Tests', () => {
    let app: App;
    let server: any;
    let adminToken: string;
    let creatorToken: string;
    let voterToken: string;
    let expiredToken: string;
    let invalidToken: string;
    let adminUserId: string;
    let creatorUserId: string;
    let voterUserId: string;
    let testElectionId: string;

    beforeAll(async () => {
        app = new App();
        await app.initialize();
        server = app.app;

        // Clean up any existing test data from previous runs
        try {
            await database.query('DELETE FROM candidates WHERE election_id IN (SELECT id FROM elections WHERE title LIKE \'%Auth Test%\' OR title LIKE \'%Integration%\')');
            await database.query('DELETE FROM elections WHERE title LIKE \'%Auth Test%\' OR title LIKE \'%Integration%\'');
            await database.query('DELETE FROM users WHERE email LIKE \'%authtest.com%\' OR email LIKE \'%integration.test%\'');
        } catch (error) {
            console.log('Cleanup error (expected if no data exists):', error);
        }

        // Create test users with different roles
        const adminUser = await repositories.user.create({
            wallet_address: '0x1111111111111111111111111111111111111111',
            email: 'admin@authtest.com',
            username: 'admin_auth',
            first_name: 'Admin',
            last_name: 'Auth',
            registration_number: 'REG-ADMIN-AUTH-001',
            role: 'admin',
            voter_status: 'eligible',
            is_verified: true,
            is_email_verified: true
        });
        adminUserId = adminUser.id;
        adminToken = jwt.sign(
            {
                userId: adminUser.id,
                walletAddress: adminUser.wallet_address || '',
                role: adminUser.role,
                voterStatus: adminUser.voter_status,
                isVerified: adminUser.is_verified,
                isEmailVerified: adminUser.is_email_verified,
                type: 'access'
            },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        const creatorUser = await repositories.user.create({
            wallet_address: '0x2222222222222222222222222222222222222222',
            email: 'creator@authtest.com',
            username: 'creator_auth',
            first_name: 'Creator',
            last_name: 'Auth',
            registration_number: 'REG-CREATOR-AUTH-001',
            role: 'creator',
            voter_status: 'eligible',
            is_verified: true,
            is_email_verified: true
        });
        creatorUserId = creatorUser.id;
        creatorToken = jwt.sign(
            {
                userId: creatorUser.id,
                walletAddress: creatorUser.wallet_address || '',
                role: creatorUser.role,
                voterStatus: creatorUser.voter_status,
                isVerified: creatorUser.is_verified,
                isEmailVerified: creatorUser.is_email_verified,
                type: 'access'
            },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        const voterUser = await repositories.user.create({
            wallet_address: '0x3333333333333333333333333333333333333333',
            email: 'voter@authtest.com',
            username: 'voter_auth',
            first_name: 'Voter',
            last_name: 'Auth',
            registration_number: 'REG-VOTER-AUTH-001',
            role: 'voter',
            voter_status: 'eligible',
            is_verified: true,
            is_email_verified: true
        });
        voterUserId = voterUser.id;
        voterToken = jwt.sign(
            {
                userId: voterUser.id,
                walletAddress: voterUser.wallet_address || '',
                role: voterUser.role,
                voterStatus: voterUser.voter_status,
                isVerified: voterUser.is_verified,
                isEmailVerified: voterUser.is_email_verified,
                type: 'access'
            },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        // Create expired token
        expiredToken = jwt.sign(
            {
                userId: voterUser.id,
                walletAddress: voterUser.wallet_address || '',
                role: voterUser.role,
                voterStatus: voterUser.voter_status,
                isVerified: voterUser.is_verified,
                isEmailVerified: voterUser.is_email_verified,
                type: 'access'
            },
            config.jwt.secret,
            { expiresIn: '-1h' } // Expired 1 hour ago
        );

        // Create invalid token
        invalidToken = jwt.sign(
            {
                userId: voterUser.id,
                walletAddress: voterUser.wallet_address || '',
                role: voterUser.role,
                voterStatus: voterUser.voter_status,
                isVerified: voterUser.is_verified,
                isEmailVerified: voterUser.is_email_verified,
                type: 'access'
            },
            'wrong-secret',
            { expiresIn: '1h' }
        );

        // Create test election
        const election = await repositories.election.create({
            title: 'Auth Test Election',
            description: 'Election for authentication testing',
            creator_id: creatorUserId,
            election_type: 'single_choice',
            start_time: new Date(Date.now() + 60000),
            end_time: new Date(Date.now() + 3600000),
            is_public: true,
            status: 'pending',
            contract_address: '0x' + '1'.repeat(40) // Mock contract address for testing
        });
        testElectionId = election.id;
    });

    afterAll(async () => {
        // Clean up test data
        await database.query('DELETE FROM candidates WHERE election_id IN (SELECT id FROM elections WHERE title LIKE \'%Auth Test%\')');
        await database.query('DELETE FROM elections WHERE title LIKE \'%Auth Test%\'');
        await database.query('DELETE FROM users WHERE email LIKE \'%authtest.com%\'');
        await app.shutdown();
    });

    describe('Authentication Mechanisms', () => {
        describe('JWT Token Validation', () => {
            it('should accept valid JWT tokens', async () => {
                const response = await request(server)
                    .get('/api/v1/auth/profile')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.user.id).toBe(voterUserId);
            });

            it('should reject expired JWT tokens', async () => {
                const response = await request(server)
                    .get('/api/v1/auth/profile')
                    .set('Authorization', `Bearer ${expiredToken}`)
                    .expect(401);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
                expect(response.body.error.message).toContain('expired');
            });

            it('should reject invalid JWT tokens', async () => {
                const response = await request(server)
                    .get('/api/v1/auth/profile')
                    .set('Authorization', `Bearer ${invalidToken}`)
                    .expect(401);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
            });

            it('should reject malformed JWT tokens', async () => {
                const response = await request(server)
                    .get('/api/v1/auth/profile')
                    .set('Authorization', 'Bearer malformed.token.here')
                    .expect(401);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
            });

            it('should reject missing Authorization header', async () => {
                const response = await request(server)
                    .get('/api/v1/auth/profile')
                    .expect(401);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
            });

            it('should reject invalid Authorization header format', async () => {
                const response = await request(server)
                    .get('/api/v1/auth/profile')
                    .set('Authorization', 'InvalidFormat token')
                    .expect(401);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
            });
        });

        describe('OTP-based Authentication', () => {
            let testUserId: string;

            beforeEach(async () => {
                // Create a test user for OTP testing
                const testUser = await repositories.user.create({
                    wallet_address: '0x4444444444444444444444444444444444444444',
                    email: 'otp@authtest.com',
                    username: 'otp_auth',
                    registration_number: 'REG-OTP-AUTH-001',
                    role: 'voter',
                    voter_status: 'eligible',
                    is_verified: true,
                    is_email_verified: true
                });
                testUserId = testUser.id;
            });

            afterEach(async () => {
                // Clean up OTP test user
                await repositories.user.delete(testUserId);
            });

            it('should generate OTP for valid login request', async () => {
                const response = await request(server)
                    .post('/api/v1/auth/login/initiate')
                    .send({ email: 'voter@authtest.com' })
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.requiresOtp).toBe(true);

                // Verify OTP token was created in database
                const otpToken = await repositories.otpToken.findActiveToken(voterUserId, 'login');
                expect(otpToken).not.toBeNull();
                expect(otpToken!.token).toMatch(/^\d{6}$/); // 6-digit OTP
            });

            it('should complete login with valid OTP', async () => {
                // Initiate login
                await request(server)
                    .post('/api/v1/auth/login/initiate')
                    .send({ email: 'voter@authtest.com' });

                // Get OTP token
                const otpToken = await repositories.otpToken.findActiveToken(voterUserId, 'login');
                expect(otpToken).not.toBeNull();

                // Complete login with OTP
                const response = await request(server)
                    .post('/api/v1/auth/login/complete')
                    .send({
                        email: 'voter@authtest.com',
                        otpToken: otpToken!.token
                    })
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.tokens).toBeDefined();
                expect(response.body.data.tokens.accessToken).toBeDefined();
                expect(response.body.data.tokens.refreshToken).toBeDefined();
            });

            it('should reject invalid OTP', async () => {
                // Initiate login
                await request(server)
                    .post('/api/v1/auth/login/initiate')
                    .send({ email: 'voter@authtest.com' });

                // Try with invalid OTP
                const response = await request(server)
                    .post('/api/v1/auth/login/complete')
                    .send({
                        email: 'voter@authtest.com',
                        otpToken: '999999'
                    })
                    .expect(401);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
            });

            it('should reject expired OTP', async () => {
                // Create OTP token with very short expiry (1 second)
                const expiredOtp = await repositories.otpToken.create({
                    user_id: voterUserId,
                    token: '123456',
                    token_type: 'login',
                    expires_at: new Date(Date.now() + 100) // Expires in 100ms
                });

                // Wait for token to expire
                await new Promise(resolve => setTimeout(resolve, 200));

                const response = await request(server)
                    .post('/api/v1/auth/login/complete')
                    .send({
                        email: 'voter@authtest.com',
                        otpToken: expiredOtp.token
                    })
                    .expect(401);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
            });

            it('should prevent OTP reuse', async () => {
                // Initiate login
                await request(server)
                    .post('/api/v1/auth/login/initiate')
                    .send({ email: 'voter@authtest.com' });

                // Get OTP token
                const otpToken = await repositories.otpToken.findActiveToken(voterUserId, 'login');
                expect(otpToken).not.toBeNull();

                // Use OTP once
                await request(server)
                    .post('/api/v1/auth/login/complete')
                    .send({
                        email: 'voter@authtest.com',
                        otpToken: otpToken!.token
                    })
                    .expect(200);

                // Try to use same OTP again
                const response = await request(server)
                    .post('/api/v1/auth/login/complete')
                    .send({
                        email: 'voter@authtest.com',
                        otpToken: otpToken!.token
                    })
                    .expect(401);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
            });
        });

        describe('Refresh Token Mechanism', () => {
            let refreshToken: string;

            beforeEach(async () => {
                // Get refresh token through login
                await request(server)
                    .post('/api/v1/auth/login/initiate')
                    .send({ email: 'voter@authtest.com' });

                const otpToken = await repositories.otpToken.findActiveToken(voterUserId, 'login');
                const loginResponse = await request(server)
                    .post('/api/v1/auth/login/complete')
                    .send({
                        email: 'voter@authtest.com',
                        otpToken: otpToken!.token
                    });

                refreshToken = loginResponse.body.data.tokens.refreshToken;
            });

            it('should refresh access token with valid refresh token', async () => {
                const response = await request(server)
                    .post('/api/v1/auth/refresh-token')
                    .send({ refreshToken })
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.tokens).toBeDefined();
                expect(response.body.data.tokens.accessToken).toBeDefined();
                expect(response.body.data.tokens.refreshToken).toBeDefined();
            });

            it('should reject invalid refresh token', async () => {
                const response = await request(server)
                    .post('/api/v1/auth/refresh-token')
                    .send({ refreshToken: 'invalid-refresh-token' })
                    .expect(401);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
            });

            it('should invalidate refresh token after use', async () => {
                // Use refresh token once
                await request(server)
                    .post('/api/v1/auth/refresh-token')
                    .send({ refreshToken })
                    .expect(200);

                // Try to use same refresh token again
                const response = await request(server)
                    .post('/api/v1/auth/refresh-token')
                    .send({ refreshToken })
                    .expect(401);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
            });
        });
    });

    describe('Role-Based Authorization', () => {
        describe('Admin Role Permissions', () => {
            it('should allow admin to access all election endpoints', async () => {
                // Create election
                const createResponse = await request(server)
                    .post('/api/v1/elections')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        title: 'Admin Test Election',
                        description: 'Test election by admin',
                        electionType: 'single_choice',
                        startTime: new Date(Date.now() + 60000).toISOString(),
                        endTime: new Date(Date.now() + 3600000).toISOString(),
                        isPublic: true,
                        candidates: [
                            { name: 'Admin Candidate 1', description: 'Test' },
                            { name: 'Admin Candidate 2', description: 'Test' }
                        ]
                    })
                    .expect(201);

                const electionId = createResponse.body.data.election.id;

                // Read election
                await request(server)
                    .get(`/api/v1/elections/${electionId}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);

                // Update election
                await request(server)
                    .put(`/api/v1/elections/${electionId}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ description: 'Updated by admin' })
                    .expect(200);

                // Delete election
                await request(server)
                    .delete(`/api/v1/elections/${electionId}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);
            });

            it('should allow admin to access system analytics', async () => {
                const response = await request(server)
                    .get('/api/v1/analytics/system')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.metrics).toBeDefined();
            });

            it('should allow admin to access user management', async () => {
                const response = await request(server)
                    .get('/api/v1/users')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.users).toBeDefined();
            });

            it('should allow admin to access monitoring endpoints', async () => {
                const response = await request(server)
                    .get('/api/v1/monitoring/system')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.status).toBeDefined();
            });
        });

        describe('Creator Role Permissions', () => {
            it('should allow creator to create elections', async () => {
                const response = await request(server)
                    .post('/api/v1/elections')
                    .set('Authorization', `Bearer ${creatorToken}`)
                    .send({
                        title: 'Creator Test Election',
                        description: 'Test election by creator',
                        electionType: 'single_choice',
                        startTime: new Date(Date.now() + 60000).toISOString(),
                        endTime: new Date(Date.now() + 3600000).toISOString(),
                        isPublic: true,
                        candidates: [
                            { name: 'Creator Candidate 1', description: 'Test' },
                            { name: 'Creator Candidate 2', description: 'Test' }
                        ]
                    })
                    .expect(201);

                expect(response.body.success).toBe(true);
                expect(response.body.data.election.creator_id).toBe(creatorUserId);
            });

            it('should allow creator to manage their own elections', async () => {
                // Update own election
                const response = await request(server)
                    .put(`/api/v1/elections/${testElectionId}`)
                    .set('Authorization', `Bearer ${creatorToken}`)
                    .send({ description: 'Updated by creator' })
                    .expect(200);

                expect(response.body.success).toBe(true);
            });

            it('should prevent creator from managing other users elections', async () => {
                // Create election by admin
                const adminElectionResponse = await request(server)
                    .post('/api/v1/elections')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        title: 'Admin Election for Creator Test',
                        description: 'Election created by admin',
                        electionType: 'single_choice',
                        startTime: new Date(Date.now() + 60000).toISOString(),
                        endTime: new Date(Date.now() + 3600000).toISOString(),
                        isPublic: true,
                        candidates: [
                            { name: 'Admin Candidate 1', description: 'Test' },
                            { name: 'Admin Candidate 2', description: 'Test' }
                        ]
                    });

                const adminElectionId = adminElectionResponse.body.data.election.id;

                // Try to update admin's election as creator
                const response = await request(server)
                    .put(`/api/v1/elections/${adminElectionId}`)
                    .set('Authorization', `Bearer ${creatorToken}`)
                    .send({ description: 'Unauthorized update' })
                    .expect(403);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('FORBIDDEN');

                // Clean up
                await request(server)
                    .delete(`/api/v1/elections/${adminElectionId}`)
                    .set('Authorization', `Bearer ${adminToken}`);
            });

            it('should prevent creator from accessing system analytics', async () => {
                const response = await request(server)
                    .get('/api/v1/analytics/system')
                    .set('Authorization', `Bearer ${creatorToken}`)
                    .expect(403);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('FORBIDDEN');
            });

            it('should prevent creator from deleting elections', async () => {
                const response = await request(server)
                    .delete(`/api/v1/elections/${testElectionId}`)
                    .set('Authorization', `Bearer ${creatorToken}`)
                    .expect(403);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('FORBIDDEN');
            });
        });

        describe('Voter Role Permissions', () => {
            it('should allow voter to view public elections', async () => {
                const response = await request(server)
                    .get('/api/v1/elections/public')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.elections).toBeDefined();
            });

            it('should allow voter to check voting eligibility', async () => {
                const response = await request(server)
                    .get(`/api/v1/voting/${testElectionId}/eligibility`)
                    .set('Authorization', `Bearer ${voterToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.eligibility).toBeDefined();
            });

            it('should allow voter to view voting history', async () => {
                const response = await request(server)
                    .get('/api/v1/voting/history')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.votes).toBeDefined();
            });

            it('should prevent voter from creating elections', async () => {
                const response = await request(server)
                    .post('/api/v1/elections')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .send({
                        title: 'Voter Test Election',
                        description: 'Should not be allowed',
                        electionType: 'single_choice',
                        startTime: new Date(Date.now() + 60000).toISOString(),
                        endTime: new Date(Date.now() + 3600000).toISOString(),
                        isPublic: true,
                        candidates: [
                            { name: 'Voter Candidate 1', description: 'Test' },
                            { name: 'Voter Candidate 2', description: 'Test' }
                        ]
                    })
                    .expect(403);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('FORBIDDEN');
            });

            it('should prevent voter from accessing system analytics', async () => {
                const response = await request(server)
                    .get('/api/v1/analytics/system')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .expect(403);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('FORBIDDEN');
            });

            it('should prevent voter from accessing user management', async () => {
                const response = await request(server)
                    .get('/api/v1/users')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .expect(403);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('FORBIDDEN');
            });
        });
    });

    describe('Resource-Based Authorization', () => {
        it('should allow users to access their own profile', async () => {
            const response = await request(server)
                .get('/api/v1/auth/profile')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.user.id).toBe(voterUserId);
        });

        it('should prevent users from accessing other users profiles', async () => {
            const response = await request(server)
                .get(`/api/v1/users/${adminUserId}`)
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should allow election creators to manage their elections', async () => {
            const response = await request(server)
                .get(`/api/v1/elections/${testElectionId}`)
                .set('Authorization', `Bearer ${creatorToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.election.creator_id).toBe(creatorUserId);
        });

        it('should prevent unauthorized access to private elections', async () => {
            // Create private election
            const privateElectionResponse = await request(server)
                .post('/api/v1/elections')
                .set('Authorization', `Bearer ${creatorToken}`)
                .send({
                    title: 'Private Election',
                    description: 'Private election for testing',
                    electionType: 'single_choice',
                    startTime: new Date(Date.now() + 60000).toISOString(),
                    endTime: new Date(Date.now() + 3600000).toISOString(),
                    isPublic: false,
                    candidates: [
                        { name: 'Private Candidate 1', description: 'Test' },
                        { name: 'Private Candidate 2', description: 'Test' }
                    ]
                });

            const privateElectionId = privateElectionResponse.body.data.election.id;

            // Try to access private election as different user
            const response = await request(server)
                .get(`/api/v1/elections/${privateElectionId}`)
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');

            // Clean up
            await request(server)
                .delete(`/api/v1/elections/${privateElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`);
        });
    });

    describe('Security Edge Cases', () => {
        it('should handle concurrent authentication attempts', async () => {
            const promises: Promise<any>[] = [];

            // Make multiple concurrent authentication requests
            for (let i = 0; i < 10; i++) {
                promises.push(
                    request(server)
                        .get('/api/v1/auth/profile')
                        .set('Authorization', `Bearer ${voterToken}`)
                );
            }

            const responses = await Promise.all(promises);

            // All should succeed
            responses.forEach((response: any) => {
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
            });
        });

        it('should handle token with modified payload', async () => {
            // Create token with modified role
            const modifiedToken = jwt.sign(
                {
                    userId: voterUserId,
                    walletAddress: '0x3333333333333333333333333333333333333333',
                    role: 'admin',
                    voterStatus: 'eligible',
                    isVerified: true,
                    isEmailVerified: true,
                    type: 'access'
                },
                config.jwt.secret,
                { expiresIn: '1h' }
            );

            // The token is valid but the user role in database should be checked
            const response = await request(server)
                .get('/api/v1/analytics/system')
                .set('Authorization', `Bearer ${modifiedToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should handle user account lockout scenarios', async () => {
            // Create test user for lockout testing
            const testUser = await repositories.user.create({
                wallet_address: '0x5555555555555555555555555555555555555555',
                email: 'lockout@authtest.com',
                username: 'lockout_auth',
                registration_number: 'REG-LOCKOUT-001',
                role: 'voter',
                voter_status: 'locked_out',
                is_verified: true,
                is_email_verified: true
            });

            const response = await request(server)
                .post('/api/v1/auth/login/initiate')
                .send({ email: 'nonexistent@authtest.com' })
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');

            // Clean up
            await repositories.user.delete(testUser.id);
        });

        it('should handle session hijacking attempts', async () => {
            // Create token for different user but try to access another user's data
            const hijackToken = jwt.sign(
                {
                    userId: adminUserId,
                    walletAddress: '0x1111111111111111111111111111111111111111',
                    role: 'voter',
                    voterStatus: 'eligible',
                    isVerified: true,
                    isEmailVerified: true,
                    type: 'access'
                }, // Mismatched data
                config.jwt.secret,
                { expiresIn: '1h' }
            );

            const response = await request(server)
                .get('/api/v1/auth/profile')
                .set('Authorization', `Bearer ${hijackToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should validate token signature integrity', async () => {
            // Tamper with token signature
            const tamperedToken = adminToken.slice(0, -10) + 'tampered123';

            const response = await request(server)
                .get('/api/v1/auth/profile')
                .set('Authorization', `Bearer ${tamperedToken}`)
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });
    });

    describe('Permission Inheritance and Escalation', () => {
        it('should prevent privilege escalation through role modification', async () => {
            // Try to update user role through profile update
            const response = await request(server)
                .put('/api/v1/users/profile')
                .set('Authorization', `Bearer ${voterToken}`)
                .send({ role: 'admin' })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should enforce hierarchical permissions', async () => {
            // Admin should be able to access creator resources
            const response = await request(server)
                .get(`/api/v1/elections/${testElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
        });

        it('should prevent lateral privilege movement', async () => {
            // Create another creator
            const creator2 = await repositories.user.create({
                wallet_address: '0x6666666666666666666666666666666666666666',
                email: 'creator2@authtest.com',
                username: 'creator2_auth',
                registration_number: 'REG-CREATOR2-001',
                role: 'creator',
                voter_status: 'eligible',
                is_verified: true,
                is_email_verified: true
            });

            const creator2Token = jwt.sign(
                {
                    userId: creator2.id,
                    walletAddress: creator2.wallet_address || '',
                    role: creator2.role,
                    voterStatus: creator2.voter_status,
                    isVerified: creator2.is_verified,
                    isEmailVerified: creator2.is_email_verified,
                    type: 'access'
                },
                config.jwt.secret,
                { expiresIn: '1h' }
            );

            // Creator2 should not be able to modify creator1's election
            const response = await request(server)
                .put(`/api/v1/elections/${testElectionId}`)
                .set('Authorization', `Bearer ${creator2Token}`)
                .send({ description: 'Unauthorized modification' })
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');

            // Clean up
            await repositories.user.delete(creator2.id);
        });
    });

    describe('Multi-Factor Authentication Scenarios', () => {
        it('should handle OTP expiration gracefully', async () => {
            const testUser = await repositories.user.create({
                wallet_address: '0x7777777777777777777777777777777777777777',
                email: 'mfa@authtest.com',
                username: 'mfa_auth',
                registration_number: 'REG-MFA-001',
                role: 'voter',
                voter_status: 'eligible',
                is_verified: true,
                is_email_verified: true
            });

            // Create OTP with very short expiry
            const expiredOtp = await repositories.otpToken.create({
                user_id: testUser.id,
                token: '123456',
                token_type: 'login',
                expires_at: new Date(Date.now() + 100) // Expires in 100ms
            });

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 200));

            const response = await request(server)
                .post('/api/v1/auth/login/complete')
                .send({
                    email: 'mfa@authtest.com',
                    otpToken: expiredOtp.token
                })
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');

            // Clean up
            await repositories.user.delete(testUser.id);
        });

        it('should prevent OTP brute force attacks', async () => {
            const testUser = await repositories.user.create({
                wallet_address: '0x8888888888888888888888888888888888888888',
                email: 'bruteforce@authtest.com',
                username: 'bruteforce_auth',
                registration_number: 'REG-BRUTE-001',
                role: 'voter',
                voter_status: 'eligible',
                is_verified: true,
                is_email_verified: true
            });

            // Initiate login to generate OTP
            await request(server)
                .post('/api/v1/auth/login/initiate')
                .send({ email: 'bruteforce@authtest.com' });

            // Try multiple wrong OTPs
            const promises: Promise<any>[] = [];
            for (let i = 0; i < 10; i++) {
                promises.push(
                    request(server)
                        .post('/api/v1/auth/login/complete')
                        .send({
                            email: 'bruteforce@authtest.com',
                            otpToken: `${i.toString().padStart(6, '0')}`
                        })
                );
            }

            const responses = await Promise.all(promises);

            // All should fail
            responses.forEach((response: any) => {
                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);
            });

            // Clean up
            await repositories.user.delete(testUser.id);
        });
    });

    describe('Cross-Origin and CSRF Protection', () => {
        it('should include proper CORS headers', async () => {
            const response = await request(server)
                .options('/api/v1/elections/public')
                .expect(204);

            expect(response.headers).toHaveProperty('access-control-allow-origin');
            expect(response.headers).toHaveProperty('access-control-allow-methods');
            expect(response.headers).toHaveProperty('access-control-allow-headers');
        });

        it('should validate request origin', async () => {
            const response = await request(server)
                .get('/api/v1/elections/public')
                .set('Origin', 'https://malicious-site.com')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(200);

            // Should still work but with proper CORS headers
            expect(response.headers).toHaveProperty('access-control-allow-origin');
        });

        it('should handle preflight requests correctly', async () => {
            const response = await request(server)
                .options('/api/v1/elections')
                .set('Origin', 'http://localhost:3000')
                .set('Access-Control-Request-Method', 'POST')
                .set('Access-Control-Request-Headers', 'Authorization, Content-Type')
                .expect(204);

            expect(response.headers['access-control-allow-methods']).toContain('POST');
            expect(response.headers['access-control-allow-headers']).toContain('Authorization');
        });
    });

    describe('API Security Headers', () => {
        it('should include security headers in all responses', async () => {
            const response = await request(server)
                .get('/health')
                .expect(200);

            expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
            expect(response.headers).toHaveProperty('x-frame-options');
            expect(response.headers).toHaveProperty('x-xss-protection');
            expect(response.headers).toHaveProperty('content-security-policy');
        });

        it('should prevent clickjacking attacks', async () => {
            const response = await request(server)
                .get('/api/v1/elections/public')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(200);

            expect(response.headers['x-frame-options']).toBeDefined();
        });

        it('should prevent MIME type sniffing', async () => {
            const response = await request(server)
                .get('/api/v1/elections/public')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(200);

            expect(response.headers['x-content-type-options']).toBe('nosniff');
        });
    });

    describe('Advanced Security Tests', () => {
        it('should handle case-sensitive role checks', async () => {
            // Create token with uppercase role
            const uppercaseRoleToken = jwt.sign(
                {
                    userId: adminUserId,
                    walletAddress: '0x1111111111111111111111111111111111111111',
                    role: 'ADMIN',
                    voterStatus: 'eligible',
                    isVerified: true,
                    isEmailVerified: true,
                    type: 'access'
                },
                config.jwt.secret,
                { expiresIn: '1h' }
            );

            const response = await request(server)
                .get('/api/v1/analytics/system')
                .set('Authorization', `Bearer ${uppercaseRoleToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should prevent privilege escalation through parameter manipulation', async () => {
            // Try to access admin endpoint by manipulating user ID in request
            const response = await request(server)
                .get(`/api/v1/users/${adminUserId}`)
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should handle missing user in database for valid token', async () => {
            // Create token for non-existent user
            const nonExistentUserToken = jwt.sign(
                {
                    userId: '123e4567-e89b-12d3-a456-426614174000',
                    walletAddress: '0x9999999999999999999999999999999999999999',
                    role: 'voter',
                    voterStatus: 'eligible',
                    isVerified: true,
                    isEmailVerified: true,
                    type: 'access'
                },
                config.jwt.secret,
                { expiresIn: '1h' }
            );

            const response = await request(server)
                .get('/api/v1/auth/profile')
                .set('Authorization', `Bearer ${nonExistentUserToken}`)
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });
    });

    describe('Session Management', () => {
        it('should track active sessions', async () => {
            // Login to create session
            await request(server)
                .post('/api/v1/auth/login/initiate')
                .send({ email: 'voter@authtest.com' });

            const otpToken = await repositories.otpToken.findActiveToken(voterUserId, 'login');
            const loginResponse = await request(server)
                .post('/api/v1/auth/login/complete')
                .send({
                    email: 'voter@authtest.com',
                    otpToken: otpToken!.token
                });

            const accessToken = loginResponse.body.data.tokens.accessToken;

            // Check session status
            const response = await request(server)
                .get('/api/v1/auth/session')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.session).toBeDefined();
            expect(response.body.data.session.active).toBe(true);
        });

        it('should handle session logout', async () => {
            // Login to create session
            await request(server)
                .post('/api/v1/auth/login/initiate')
                .send({ email: 'voter@authtest.com' });

            const otpToken = await repositories.otpToken.findActiveToken(voterUserId, 'login');
            const loginResponse = await request(server)
                .post('/api/v1/auth/login/complete')
                .send({
                    email: 'voter@authtest.com',
                    otpToken: otpToken!.token
                });

            const accessToken = loginResponse.body.data.tokens.accessToken;

            // Logout
            const logoutResponse = await request(server)
                .post('/api/v1/auth/logout')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(logoutResponse.body.success).toBe(true);

            // Try to use token after logout
            const response = await request(server)
                .get('/api/v1/auth/profile')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });
    });
});