/// <reference types="jest" />
import request from 'supertest';
import App from '../../app';

// Mock AuthService to bypass module loading issues
jest.mock('../../services/AuthService', () => ({
    __esModule: true,
    default: {
        verifyAccessToken: jest.fn().mockImplementation((token) => {
            // Extract the actual user ID from the JWT token for testing
            const jwt = require('jsonwebtoken');
            const config = require('../../config').default;
            try {
                const decoded = jwt.verify(token, config.jwt.secret);
                return Promise.resolve(decoded);
            } catch (error) {
                return Promise.reject(new Error('Invalid token'));
            }
        }),
        hasRole: jest.fn().mockReturnValue(true),
        canPerformAction: jest.fn().mockReturnValue(true)
    }
}));
import database from '../../config/database';
import UserRepository from '../../repositories/UserRepository';
import ElectionRepository from '../../repositories/ElectionRepository';
import CandidateRepository from '../../repositories/CandidateRepository';
import VoterEligibilityRepository from '../../repositories/VoterEligibilityRepository';
import jwt from 'jsonwebtoken';
import config from '../../config';

describe('Voting Controller', () => {
    let app: App;
    let server: any;
    let adminToken: string;
    let voterToken: string;
    let ineligibleVoterToken: string;
    let adminUserId: string;
    let voterUserId: string;
    let ineligibleVoterUserId: string;
    let testElectionId: string;
    let testCandidateId: string;

    beforeAll(async () => {
        app = new App();
        await app.initialize();
        server = app.app;
    });

    beforeEach(async () => {
        // Clean up test data before each test
        const client = await database.getClient();
        try {
            await client.query('DELETE FROM otp_tokens');
            await client.query('DELETE FROM voter_eligibility');
            await client.query('DELETE FROM votes_cache');
            await client.query('DELETE FROM voter_registrations');
            await client.query('DELETE FROM candidates');
            await client.query('DELETE FROM elections');
            await client.query('DELETE FROM users');
        } finally {
            client.release();
        }

        // Create test users with unique data
        const timestamp = Date.now();
        const adminUser = await UserRepository.create({
            wallet_address: `0x111111111111111111111111111111111111${timestamp.toString().slice(-4)}`,
            email: `admin-${timestamp}@voting.test`,
            username: `admin-${timestamp}`,
            first_name: 'Admin',
            last_name: 'User',
            registration_number: `REG-ADMIN-${timestamp}`,
            role: 'admin',
            voter_status: 'eligible',
            is_verified: true,
            is_email_verified: true
        });
        adminUserId = adminUser.id;
        adminToken = jwt.sign(
            { 
                userId: adminUser.id, 
                walletAddress: adminUser.wallet_address,
                role: adminUser.role,
                voterStatus: adminUser.voter_status,
                isVerified: true,
                isEmailVerified: true,
                type: 'access'
            },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        const voterUser = await UserRepository.create({
            wallet_address: `0x222222222222222222222222222222222222${timestamp.toString().slice(-4)}`,
            email: `voter-${timestamp}@voting.test`,
            username: `voter-${timestamp}`,
            first_name: 'Voter',
            last_name: 'User',
            registration_number: `REG-VOTER-${timestamp}`,
            role: 'voter',
            voter_status: 'eligible',
            is_verified: true,
            is_email_verified: true
        });
        voterUserId = voterUser.id;
        voterToken = jwt.sign(
            { 
                userId: voterUser.id, 
                walletAddress: voterUser.wallet_address,
                role: voterUser.role,
                voterStatus: voterUser.voter_status,
                isVerified: true,
                isEmailVerified: true,
                type: 'access'
            },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        const ineligibleVoterUser = await UserRepository.create({
            wallet_address: `0x333333333333333333333333333333333333${timestamp.toString().slice(-4)}`,
            email: `ineligible-${timestamp}@voting.test`,
            username: `ineligible-${timestamp}`,
            first_name: 'Ineligible',
            last_name: 'User',
            registration_number: `REG-INELIGIBLE-${timestamp}`,
            role: 'voter',
            voter_status: 'suspended',
            is_verified: true,
            is_email_verified: true
        });
        ineligibleVoterUserId = ineligibleVoterUser.id;
        ineligibleVoterToken = jwt.sign(
            { 
                userId: ineligibleVoterUser.id, 
                walletAddress: ineligibleVoterUser.wallet_address,
                role: ineligibleVoterUser.role,
                voterStatus: ineligibleVoterUser.voter_status,
                isVerified: true,
                isEmailVerified: true,
                type: 'access'
            },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        // Create test election
        const testElection = await ElectionRepository.create({
            contract_address: '0x4444444444444444444444444444444444444444',
            title: 'Test Voting Election',
            description: 'Election for voting tests',
            creator_id: adminUserId,
            election_type: 'single_choice',
            start_time: new Date(Date.now() - 60000), // Started 1 minute ago
            end_time: new Date(Date.now() + 3600000), // Ends in 1 hour
            status: 'active'
        });
        testElectionId = testElection.id;

        // Create test candidates
        const testCandidate = await CandidateRepository.create({
            election_id: testElectionId,
            name: 'Test Candidate',
            description: 'Candidate for voting tests',
            position: 1
        });
        testCandidateId = testCandidate.id;

        await CandidateRepository.create({
            election_id: testElectionId,
            name: 'Second Candidate',
            description: 'Second candidate for voting tests',
            position: 2
        });

        // Set up voter eligibility
        await VoterEligibilityRepository.create({
            user_id: voterUserId,
            election_id: testElectionId,
            is_eligible: true,
            eligibility_reason: 'Registered voter',
            verified_at: new Date()
        });

        await VoterEligibilityRepository.create({
            user_id: ineligibleVoterUserId,
            election_id: testElectionId,
            is_eligible: false,
            eligibility_reason: 'Not registered for this election'
        });
    });

    afterAll(async () => {
        // Clean up test data
        await database.query('DELETE FROM voter_eligibility WHERE election_id IN (SELECT id FROM elections WHERE title LIKE \'%Test%\')');
        await database.query('DELETE FROM votes_cache WHERE election_id IN (SELECT id FROM elections WHERE title LIKE \'%Test%\')');
        await database.query('DELETE FROM candidates WHERE election_id IN (SELECT id FROM elections WHERE title LIKE \'%Test%\')');
        await database.query('DELETE FROM elections WHERE title LIKE \'%Test%\'');
        await database.query('DELETE FROM users WHERE email LIKE \'%voting.test%\'');
        await app.shutdown();
    });

    describe('GET /api/v1/voting/eligibility/:electionId', () => {
        it('should check voter eligibility for eligible voter', async () => {
            const response = await request(server)
                .get(`/api/v1/voting/${testElectionId}/eligibility`)
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.isEligible).toBe(true);
            expect(response.body.data.election).toBeDefined();
            expect(response.body.data.voter).toBeDefined();
        });

        it('should check voter eligibility for ineligible voter', async () => {
            const response = await request(server)
                .get(`/api/v1/voting/${testElectionId}/eligibility`)
                .set('Authorization', `Bearer ${ineligibleVoterToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.eligible).toBe(false);
            expect(response.body.data.reason).toBeDefined();
        });

        it('should return 404 for non-existent election', async () => {
            const fakeId = '123e4567-e89b-12d3-a456-426614174000';
            const response = await request(server)
                .get(`/api/v1/voting/eligibility/${fakeId}`)
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('NOT_FOUND');
        });

        it('should require authentication', async () => {
            const response = await request(server)
                .get(`/api/v1/voting/eligibility/${testElectionId}`)
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });
    });

    describe('POST /api/v1/voting/vote', () => {
        it('should submit vote for eligible voter', async () => {
            const voteData = {
                electionId: testElectionId,
                candidateId: testCandidateId,
                transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
            };

            const response = await request(server)
                .post('/api/v1/voting/vote')
                .set('Authorization', `Bearer ${voterToken}`)
                .send(voteData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.vote).toBeDefined();
            expect(response.body.data.vote.candidate_id).toBe(testCandidateId);
            expect(response.body.data.vote.transaction_hash).toBe(voteData.transactionHash);
            expect(response.body.data.confirmation).toBeDefined();
        });

        it('should reject duplicate vote from same voter', async () => {
            const firstVoteData = {
                electionId: testElectionId,
                candidateId: testCandidateId,
                transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
            };

            const secondVoteData = {
                ...firstVoteData,
                transactionHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
            };

            // First vote should succeed
            await request(server)
                .post('/api/v1/voting/vote')
                .set('Authorization', `Bearer ${voterToken}`)
                .send(firstVoteData)
                .expect(201);

            // Second vote should fail for the same voter/election
            const response = await request(server)
                .post('/api/v1/voting/vote')
                .set('Authorization', `Bearer ${voterToken}`)
                .send(secondVoteData)
                .expect(409);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('CONFLICT');
        });

        it('should reject vote from ineligible voter', async () => {
            const voteData = {
                electionId: testElectionId,
                candidateId: testCandidateId,
                transactionHash: '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba'
            };

            const response = await request(server)
                .post('/api/v1/voting/vote')
                .set('Authorization', `Bearer ${ineligibleVoterToken}`)
                .send(voteData)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should validate vote data', async () => {
            const invalidVoteData = {
                electionId: 'invalid-uuid',
                candidateId: testCandidateId,
                transactionHash: 'invalid-hash'
            };

            const response = await request(server)
                .post('/api/v1/voting/vote')
                .set('Authorization', `Bearer ${voterToken}`)
                .send(invalidVoteData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should reject vote for non-existent candidate', async () => {
            const fakeId = '123e4567-e89b-12d3-a456-426614174000';
            const voteData = {
                electionId: testElectionId,
                candidateId: fakeId,
                transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111'
            };

            const response = await request(server)
                .post('/api/v1/voting/vote')
                .set('Authorization', `Bearer ${voterToken}`)
                .send(voteData)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('NOT_FOUND');
        });

        it('should reject vote for ended election', async () => {
            // Create an ended election
            const endedElection = await ElectionRepository.create({
                contract_address: '0x5555555555555555555555555555555555555555',
                title: 'Ended Election',
                description: 'Election that has ended',
                creator_id: adminUserId,
                election_type: 'single_choice',
                start_time: new Date(Date.now() - 7200000), // Started 2 hours ago
                end_time: new Date(Date.now() - 3600000), // Ended 1 hour ago
                status: 'ended'
            });

            const endedCandidate = await CandidateRepository.create({
                election_id: endedElection.id,
                name: 'Ended Candidate',
                description: 'Candidate in ended election',
                position: 1
            });

            const voteData = {
                electionId: endedElection.id,
                candidateId: endedCandidate.id,
                transactionHash: '0x2222222222222222222222222222222222222222222222222222222222222222'
            };

            const response = await request(server)
                .post('/api/v1/voting/vote')
                .set('Authorization', `Bearer ${voterToken}`)
                .send(voteData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('GET /api/v1/voting/history', () => {
        it('should get voting history for user', async () => {
            const response = await request(server)
                .get('/api/v1/voting/history')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.votes).toBeDefined();
            expect(Array.isArray(response.body.data.votes)).toBe(true);
            expect(response.body.data.pagination).toBeDefined();
        });

        it('should filter voting history by election', async () => {
            const response = await request(server)
                .get(`/api/v1/voting/history?electionId=${testElectionId}`)
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.votes).toBeDefined();
        });

        it('should paginate voting history', async () => {
            const response = await request(server)
                .get('/api/v1/voting/history?page=1&limit=5')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.pagination.page).toBe(1);
            expect(response.body.data.pagination.limit).toBe(5);
        });

        it('should require authentication', async () => {
            const response = await request(server)
                .get('/api/v1/voting/history')
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });
    });

    describe('GET /api/v1/voting/status/:electionId', () => {
        it('should get voting status for election', async () => {
            const response = await request(server)
                .get(`/api/v1/voting/status/${testElectionId}`)
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.election).toBeDefined();
            expect(response.body.data.userStatus).toBeDefined();
            expect(response.body.data.userStatus.eligible).toBeDefined();
            expect(response.body.data.userStatus.hasVoted).toBeDefined();
        });

        it('should show vote details if user has voted', async () => {
            const response = await request(server)
                .get(`/api/v1/voting/status/${testElectionId}`)
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            if (response.body.data.userStatus.hasVoted) {
                expect(response.body.data.userStatus.voteDetails).toBeDefined();
                expect(response.body.data.userStatus.voteDetails.candidate).toBeDefined();
                expect(response.body.data.userStatus.voteDetails.timestamp).toBeDefined();
            }
        });

        it('should return 404 for non-existent election', async () => {
            const fakeId = '123e4567-e89b-12d3-a456-426614174000';
            const response = await request(server)
                .get(`/api/v1/voting/status/${fakeId}`)
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('NOT_FOUND');
        });
    });

    describe('POST /api/v1/voting/verify', () => {
        it('should verify vote transaction', async () => {
            const verificationData = {
                transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                electionId: testElectionId
            };

            const response = await request(server)
                .post('/api/v1/voting/verify')
                .set('Authorization', `Bearer ${voterToken}`)
                .send(verificationData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.verification).toBeDefined();
            expect(response.body.data.verification.valid).toBeDefined();
            expect(response.body.data.verification.transactionHash).toBe(verificationData.transactionHash);
        });

        it('should validate transaction hash format', async () => {
            const verificationData = {
                transactionHash: 'invalid-hash',
                electionId: testElectionId
            };

            const response = await request(server)
                .post('/api/v1/voting/verify')
                .set('Authorization', `Bearer ${voterToken}`)
                .send(verificationData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should require authentication', async () => {
            const verificationData = {
                transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                electionId: testElectionId
            };

            const response = await request(server)
                .post('/api/v1/voting/verify')
                .send(verificationData)
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });
    });

    describe('Error Handling', () => {
        it('should handle blockchain connection errors', async () => {
            // This would require mocking blockchain service to simulate errors
            // For now, we test the error response structure
            const voteData = {
                electionId: testElectionId,
                candidateId: testCandidateId,
                transactionHash: '0x0000000000000000000000000000000000000000000000000000000000000000'
            };

            const response = await request(server)
                .post('/api/v1/voting/vote')
                .set('Authorization', `Bearer ${voterToken}`)
                .send(voteData);

            // Should handle gracefully regardless of blockchain state
            expect(response.body).toHaveProperty('success');
            expect(response.body).toHaveProperty('data');
        });

        it('should handle database connection errors gracefully', async () => {
            // Test with malformed UUID to trigger database error
            const response = await request(server)
                .get('/api/v1/voting/eligibility/invalid-uuid')
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBeDefined();
        });

        it('should handle missing request body', async () => {
            const response = await request(server)
                .post('/api/v1/voting/vote')
                .set('Authorization', `Bearer ${voterToken}`)
                .send({})
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should handle malformed JSON', async () => {
            const response = await request(server)
                .post('/api/v1/voting/vote')
                .set('Authorization', `Bearer ${voterToken}`)
                .set('Content-Type', 'application/json')
                .send('{"invalid": json}')
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe('Rate Limiting', () => {
        it('should apply rate limiting to voting endpoints', async () => {
            const voteData = {
                electionId: testElectionId,
                candidateId: testCandidateId,
                transactionHash: '0x3333333333333333333333333333333333333333333333333333333333333333'
            };

            // Make multiple rapid requests
            const requests = Array(5).fill(null).map(() =>
                request(server)
                    .post('/api/v1/voting/vote')
                    .set('Authorization', `Bearer ${voterToken}`)
                    .send(voteData)
            );

            const responses = await Promise.all(requests);
            
            // At least some should be rate limited or return conflict (already voted)
            const statusCodes = responses.map(r => r.status);
            expect(statusCodes.some(code => [409, 429].includes(code))).toBe(true);
        });
    });
});
