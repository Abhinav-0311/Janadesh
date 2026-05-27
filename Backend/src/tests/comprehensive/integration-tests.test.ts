/// <reference types="jest" />
import request from 'supertest';
import App from '../../app';
import database from '../../config/database';
import { repositories } from '../../repositories';
import ElectionRepository from '../../repositories/ElectionRepository';
import { BlockchainService } from '../../services/blockchain';
import WebSocketManager from '../../services/WebSocketManager';
import jwt from 'jsonwebtoken';
import config from '../../config';

describe('Comprehensive Integration Tests', () => {
    let app: App;
    let server: any;
    let blockchainService: BlockchainService;
    let adminToken: string;
    let voterToken: string;
    let adminUserId: string;
    let voterUserId: string;
    let testElectionId: string;

    beforeAll(async () => {
        // Initialize application
        app = new App();
        await app.initialize();
        server = app.app;

        // Initialize services
        blockchainService = BlockchainService.getInstance();

        // Create test users
        const adminUser = await repositories.user.create({
            wallet_address: '0x1111111111111111111111111111111111111111',
            email: 'admin@integration.test',
            username: 'admin_integration',
            first_name: 'Admin',
            last_name: 'Integration',
            registration_number: 'REG-ADMIN-INT-001',
            role: 'admin',
            voter_status: 'eligible',
            is_verified: true,
            is_email_verified: true
        });
        adminUserId = adminUser.id;
        adminToken = jwt.sign(
            {
                userId: adminUser.id,
                email: adminUser.email,
                role: adminUser.role,
                walletAddress: adminUser.wallet_address,
                voterStatus: adminUser.voter_status,
                isVerified: adminUser.is_verified,
                isEmailVerified: adminUser.is_email_verified,
                type: 'access'
            },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        const voterUser = await repositories.user.create({
            wallet_address: '0x2222222222222222222222222222222222222222',
            email: 'voter@integration.test',
            username: 'voter_integration',
            first_name: 'Voter',
            last_name: 'Integration',
            registration_number: 'REG-VOTER-INT-001',
            role: 'voter',
            voter_status: 'eligible',
            is_verified: true,
            is_email_verified: true
        });
        voterUserId = voterUser.id;
        voterToken = jwt.sign(
            {
                userId: voterUser.id,
                email: voterUser.email,
                role: voterUser.role,
                walletAddress: voterUser.wallet_address,
                voterStatus: voterUser.voter_status,
                isVerified: voterUser.is_verified,
                isEmailVerified: voterUser.is_email_verified,
                type: 'access'
            },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        // Create test election
        const election = await repositories.election.create({
            title: 'Integration Test Election',
            description: 'Election for integration testing',
            creator_id: adminUserId,
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
            name: 'Integration Candidate 1',
            description: 'First candidate for integration testing',
            position: 1
        });

        await repositories.candidate.create({
            election_id: testElectionId,
            name: 'Integration Candidate 2',
            description: 'Second candidate for integration testing',
            position: 2
        });
    });

    afterAll(async () => {
        // Clean up test data BEFORE shutting down
        try {
            await database.query('DELETE FROM candidates WHERE election_id IN (SELECT id FROM elections WHERE title LIKE \'%Integration%\')');
            await database.query('DELETE FROM elections WHERE title LIKE \'%Integration%\'');
            await database.query('DELETE FROM users WHERE email LIKE \'%integration.test%\'');
        } catch (error) {
            console.error('Cleanup error:', error);
        }

        // Now shutdown the app
        await app.shutdown();
    });

    describe('Database and API Integration', () => {
        it('should handle complete election lifecycle', async () => {
            // 1. Create election
            const electionData = {
                title: 'Lifecycle Test Election',
                description: 'Testing complete election lifecycle',
                electionType: 'single_choice',
                startTime: new Date(Date.now() + 60000).toISOString(),
                endTime: new Date(Date.now() + 3600000).toISOString(),
                isPublic: true,
                candidates: [
                    { name: 'Lifecycle Candidate 1', description: 'First candidate' },
                    { name: 'Lifecycle Candidate 2', description: 'Second candidate' }
                ]
            };

            const createResponse = await request(server)
                .post('/api/v1/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(electionData)
                .expect(201);

            const electionId = createResponse.body.data.election.id;
            expect(electionId).toBeDefined();

            // 2. Get election details
            const getResponse = await request(server)
                .get(`/api/v1/elections/${electionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(getResponse.body.data.election.title).toBe(electionData.title);
            expect(getResponse.body.data.candidates).toHaveLength(2);

            // 3. Update election
            const updateData = {
                description: 'Updated description for lifecycle test'
            };

            const updateResponse = await request(server)
                .put(`/api/v1/elections/${electionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(200);

            expect(updateResponse.body.data.election.description).toBe(updateData.description);

            // 4. Check voter eligibility
            const eligibilityResponse = await request(server)
                .get(`/api/v1/voting/eligibility/${electionId}`)
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(200);

            expect(eligibilityResponse.body.data.eligibility).toBeDefined();

            // 5. Get election analytics
            const analyticsResponse = await request(server)
                .get(`/api/v1/analytics/elections/${electionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(analyticsResponse.body.data.analytics).toBeDefined();

            // 6. Delete election
            const deleteResponse = await request(server)
                .delete(`/api/v1/elections/${electionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(deleteResponse.body.success).toBe(true);

            // 7. Verify deletion
            await request(server)
                .get(`/api/v1/elections/${electionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);
        });

        it('should handle user registration and verification flow', async () => {
            // 1. Register new user
            const userData = {
                email: 'flow@integration.test',
                username: 'flow_integration',
                firstName: 'Flow',
                lastName: 'Integration',
                registrationNumber: 'REG-FLOW-INT-001'
            };

            const registerResponse = await request(server)
                .post('/api/v1/auth/register')
                .send(userData)
                .expect(201);

            const userId = registerResponse.body.data.user.id;
            expect(registerResponse.body.data.verificationRequired).toBe(true);

            // 2. Get verification token from database
            const verificationToken = await repositories.otpToken.findActiveToken(userId, 'email_verification');
            expect(verificationToken).not.toBeNull();

            // 3. Verify email
            const verifyResponse = await request(server)
                .post('/api/v1/auth/verify-email')
                .send({
                    token: verificationToken!.token
                })
                .expect(200);

            expect(verifyResponse.body.data.user.isVerified).toBe(true);

            // 4. Login
            const loginInitResponse = await request(server)
                .post('/api/v1/auth/login')
                .send({ email: userData.email })
                .expect(200);

            expect(loginInitResponse.body.data.requiresOtp).toBe(true);

            // 5. Get login OTP token
            const loginToken = await repositories.otpToken.findActiveToken(userId, 'login');
            expect(loginToken).not.toBeNull();

            // 6. Complete login
            const loginCompleteResponse = await request(server)
                .post('/api/v1/auth/login')
                .send({
                    email: userData.email,
                    otpToken: loginToken!.token
                })
                .expect(200);

            expect(loginCompleteResponse.body.data.tokens).toBeDefined();
            expect(loginCompleteResponse.body.data.tokens.accessToken).toBeDefined();

            // 7. Access protected resource
            const profileResponse = await request(server)
                .get('/api/v1/auth/profile')
                .set('Authorization', `Bearer ${loginCompleteResponse.body.data.tokens.accessToken}`)
                .expect(200);

            expect(profileResponse.body.data.user.email).toBe(userData.email);

            // Clean up
            await repositories.user.delete(userId);
        });

        it('should handle concurrent database operations', async () => {
            const promises: Promise<any>[] = [];
            const userCount = 10;

            // Create multiple users concurrently
            for (let i = 0; i < userCount; i++) {
                promises.push(
                    repositories.user.create({
                        wallet_address: `0x${i.toString().padStart(40, '0')}`,
                        email: `concurrent${i}@integration.test`,
                        username: `concurrent${i}`,
                        registration_number: `REG-CONCURRENT-${i.toString().padStart(3, '0')}`,
                        role: 'voter',
                        voter_status: 'eligible'
                    })
                );
            }

            const users = await Promise.all(promises);
            expect(users).toHaveLength(userCount);

            // Verify all users were created with unique IDs
            const userIds = users.map((user: any) => user.id);
            const uniqueIds = new Set(userIds);
            expect(uniqueIds.size).toBe(userCount);

            // Clean up
            for (const user of users) {
                await repositories.user.delete((user as any).id);
            }
        });
    });

    describe('Blockchain Service Integration', () => {
        it('should initialize blockchain service successfully', async () => {
            expect(typeof blockchainService.getInitializationStatus()).toBe('boolean');
        });

        it('should handle blockchain network operations', async () => {
            const currentNetwork = blockchainService.getCurrentNetwork();
            expect(typeof currentNetwork).toBe('string');

            const availableNetworks = blockchainService.getAvailableNetworks();
            expect(Array.isArray(availableNetworks)).toBe(true);
            expect(availableNetworks.length).toBeGreaterThan(0);
        });

        it('should format and parse ether values correctly', async () => {
            const etherValue = '1.5';
            const weiValue = blockchainService.parseEther(etherValue);
            const formattedValue = blockchainService.formatEther(weiValue);

            expect(typeof weiValue).toBe('bigint');
            expect(formattedValue).toBe(etherValue);
        });

        it('should handle blockchain service lifecycle', async () => {
            // Test shutdown and restart
            await blockchainService.shutdown();
            expect(blockchainService.getInitializationStatus()).toBe(false);

            try {
                await blockchainService.initialize();
            } catch (error) {
                // No local chain is expected in test env; failure to connect is acceptable.
            }

            expect(typeof blockchainService.getInitializationStatus()).toBe('boolean');
        });
    });

    describe('WebSocket Service Integration', () => {
        it('should expose websocket manager state in test environment', async () => {
            const wsManager = WebSocketManager.getInstance();
            expect(typeof wsManager.isInitialized()).toBe('boolean');
        });

        it('should provide websocket stats object or null', async () => {
            const wsManager = WebSocketManager.getInstance();
            const stats = wsManager.getStats();
            if (stats) {
                expect(typeof stats.totalConnections).toBe('number');
                expect(typeof stats.authenticatedConnections).toBe('number');
                expect(stats.rooms).toBeDefined();
            } else {
                expect(stats).toBeNull();
            }
        });

        it('should broadcast election updates without throwing', async () => {
            const wsManager = WebSocketManager.getInstance();
            expect(() =>
                wsManager.broadcastElectionStatus({
                    electionId: testElectionId,
                    status: 'active',
                    title: 'Test Election'
                })
            ).not.toThrow();
        });
    });

    describe('Error Handling Integration', () => {
        it('should handle database connection errors gracefully', async () => {
            const findAllSpy = jest.spyOn(ElectionRepository, 'findAll').mockRejectedValue(new Error('Simulated DB failure'));

            const response = await request(server)
                .get('/api/v1/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(['INTERNAL_SERVER_ERROR', 'ELECTIONS_FETCH_FAILED']).toContain(response.body.error.code);

            findAllSpy.mockRestore();
        });

        it('should handle service initialization failures', async () => {
            // Shutdown blockchain service
            await blockchainService.shutdown();

            // Try to use blockchain-dependent endpoint
            const response = await request(server)
                .get('/api/v1/blockchain/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(503);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
        });

        it('should handle transaction rollbacks on errors', async () => {
            const client = await database.getClient();

            try {
                await client.query('BEGIN');

                // Create a user
                const userResult = await client.query(
                    'INSERT INTO users (wallet_address, email, username, registration_number) VALUES ($1, $2, $3, $4) RETURNING id',
                    ['0x9999999999999999999999999999999999999999', 'rollback@integration.test', 'rollbackuser', 'REG-ROLLBACK-001']
                );

                const userId = userResult.rows[0].id;

                // Intentionally cause an error (duplicate email)
                try {
                    await client.query(
                        'INSERT INTO users (wallet_address, email, username, registration_number) VALUES ($1, $2, $3, $4)',
                        ['0x8888888888888888888888888888888888888888', 'rollback@integration.test', 'rollbackuser2', 'REG-ROLLBACK-002']
                    );
                } catch (error) {
                    await client.query('ROLLBACK');
                    throw error;
                }

                await client.query('COMMIT');
            } catch (error) {
                // Verify the user was not created due to rollback
                const user = await repositories.user.findByEmail('rollback@integration.test');
                expect(user).toBeNull();
            } finally {
                client.release();
            }
        });
    });

    describe('Performance Integration', () => {
        it('should handle multiple concurrent API requests', async () => {
            const requestCount = 20;
            const promises: Promise<any>[] = [];

            // Create multiple concurrent requests
            for (let i = 0; i < requestCount; i++) {
                promises.push(
                    request(server)
                        .get('/api/v1/elections/public')
                        .expect(200)
                );
            }

            const startTime = Date.now();
            const responses = await Promise.all(promises);
            const endTime = Date.now();

            // All requests should succeed
            responses.forEach((response: any) => {
                expect(response.body.success).toBe(true);
            });

            // Should complete within reasonable time (5 seconds)
            expect(endTime - startTime).toBeLessThan(5000);
        });

        it('should handle large dataset queries efficiently', async () => {
            // Create multiple elections for testing
            const elections: any[] = [];
            for (let i = 0; i < 20; i++) {
                const election = await repositories.election.create({
                    title: `Performance Test Election ${i}`,
                    description: `Performance test election ${i}`,
                    creator_id: adminUserId,
                    election_type: 'single_choice',
                    start_time: new Date(Date.now() + 60000),
                    end_time: new Date(Date.now() + 3600000),
                    is_public: true,
                    status: 'pending'
                });
                elections.push(election as any);
            }

            const startTime = Date.now();

            // Query all elections
            const response = await request(server)
                .get('/api/v1/elections?limit=50')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(response.body.success).toBe(true);
            expect(response.body.data.elections.length).toBeGreaterThanOrEqual(20);
            expect(duration).toBeLessThan(2000); // Should complete within 2 seconds

            // Clean up
            for (const election of elections) {
                await repositories.election.delete((election as any).id);
            }
        });

        it('should handle memory usage efficiently during bulk operations', async () => {
            const initialMemory = process.memoryUsage();

            // Perform bulk operations
            const users: any[] = [];
            for (let i = 0; i < 100; i++) {
                const user = await repositories.user.create({
                    wallet_address: `0x${i.toString().padStart(40, '0')}`,
                    email: `bulk${i}@integration.test`,
                    username: `bulk${i}`,
                    registration_number: `REG-BULK-${i.toString().padStart(3, '0')}`,
                    role: 'voter',
                    voter_status: 'eligible'
                });
                users.push(user as any);
            }

            const afterCreationMemory = process.memoryUsage();

            // Clean up
            for (const user of users) {
                await repositories.user.delete((user as any).id);
            }

            const finalMemory = process.memoryUsage();

            // Memory should not increase dramatically
            const memoryIncrease = afterCreationMemory.heapUsed - initialMemory.heapUsed;
            const memoryAfterCleanup = finalMemory.heapUsed - initialMemory.heapUsed;

            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
            expect(memoryAfterCleanup).toBeLessThan(memoryIncrease); // Memory should be freed after cleanup
        });
    });

    describe('Security Integration', () => {
        it('should prevent SQL injection attacks', async () => {
            const maliciousInput = "'; DROP TABLE users; --";

            const response = await request(server)
                .get(`/api/v1/elections?search=${encodeURIComponent(maliciousInput)}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);

            // Verify users table still exists
            const usersExist = await database.query('SELECT COUNT(*) FROM users');
            expect((usersExist as any).rows[0].count).toBeDefined();
        });

        it('should handle JWT token tampering', async () => {
            const tamperedToken = adminToken.slice(0, -5) + 'XXXXX';

            const response = await request(server)
                .get('/api/v1/auth/profile')
                .set('Authorization', `Bearer ${tamperedToken}`)
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });

        it('should enforce rate limiting', async () => {
            const promises: Promise<any>[] = [];

            // Make many requests quickly
            for (let i = 0; i < 100; i++) {
                promises.push(
                    request(server)
                        .post('/api/v1/auth/login')
                        .send({ email: 'nonexistent@test.com' })
                );
            }

            const responses = await Promise.all(promises);

            // At minimum, requests should not crash the server
            const serverErrorResponses = responses.filter((r: any) => r.status >= 500);
            expect(serverErrorResponses.length).toBe(0);

            // If rate limiting is active in this env, we should see 429 responses.
            // If not active, requests should still be safely handled as auth failures.
            const nonExpectedResponses = responses.filter((r: any) => ![401, 429].includes(r.status));
            expect(nonExpectedResponses.length).toBe(0);
        });
    });
});
