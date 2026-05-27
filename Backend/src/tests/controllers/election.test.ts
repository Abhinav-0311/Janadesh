/// <reference types="jest" />
import request from 'supertest';
import App from '../../app';
import database from '../../config/database';
import UserRepository from '../../repositories/UserRepository';
import ElectionRepository from '../../repositories/ElectionRepository';
import CandidateRepository from '../../repositories/CandidateRepository';
import jwt from 'jsonwebtoken';
import config from '../../config';

describe('Election Controller', () => {
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
        const adminUser = await UserRepository.create({
            wallet_address: '0x1111111111111111111111111111111111111111',
            email: 'admin@election.test',
            username: 'admin',
            first_name: 'Admin',
            last_name: 'User',
            registration_number: 'REG-ADMIN-001',
            role: 'admin',
            voter_status: 'eligible'
        });
        adminUserId = adminUser.id;
        adminToken = jwt.sign(
            { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        const creatorUser = await UserRepository.create({
            wallet_address: '0x2222222222222222222222222222222222222222',
            email: 'creator@election.test',
            username: 'creator',
            first_name: 'Creator',
            last_name: 'User',
            registration_number: 'REG-CREATOR-001',
            role: 'creator',
            voter_status: 'eligible'
        });
        creatorUserId = creatorUser.id;
        creatorToken = jwt.sign(
            { userId: creatorUser.id, email: creatorUser.email, role: creatorUser.role },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        const voterUser = await UserRepository.create({
            wallet_address: '0x3333333333333333333333333333333333333333',
            email: 'voter@election.test',
            username: 'voter',
            first_name: 'Voter',
            last_name: 'User',
            registration_number: 'REG-VOTER-001',
            role: 'voter',
            voter_status: 'eligible'
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
        await database.query('DELETE FROM candidates WHERE election_id IN (SELECT id FROM elections WHERE title LIKE \'%Test%\')');
        await database.query('DELETE FROM elections WHERE title LIKE \'%Test%\'');
        await database.query('DELETE FROM users WHERE email LIKE \'%election.test%\'');
        await app.shutdown();
    });

    describe('POST /api/v1/elections', () => {
        it('should create election as admin', async () => {
            const electionData = {
                title: 'Test Election Admin',
                description: 'Test election created by admin',
                electionType: 'single_choice',
                startTime: new Date(Date.now() + 60000).toISOString(),
                endTime: new Date(Date.now() + 3600000).toISOString(),
                isPublic: true,
                candidates: [
                    { name: 'Candidate 1', description: 'First candidate' },
                    { name: 'Candidate 2', description: 'Second candidate' }
                ]
            };

            const response = await request(server)
                .post('/api/v1/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(electionData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.election.title).toBe(electionData.title);
            expect(response.body.data.election.creator_id).toBe(adminUserId);
            expect(response.body.data.candidates).toHaveLength(2);
            testElectionId = response.body.data.election.id;
        });

        it('should create election as creator', async () => {
            const electionData = {
                title: 'Test Election Creator',
                description: 'Test election created by creator',
                electionType: 'single_choice',
                startTime: new Date(Date.now() + 60000).toISOString(),
                endTime: new Date(Date.now() + 3600000).toISOString(),
                isPublic: true,
                candidates: [
                    { name: 'Candidate A', description: 'First candidate' }
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
                title: 'Test Election Voter',
                description: 'Test election created by voter',
                electionType: 'single_choice',
                startTime: new Date(Date.now() + 60000).toISOString(),
                endTime: new Date(Date.now() + 3600000).toISOString(),
                isPublic: true,
                candidates: [
                    { name: 'Candidate X', description: 'Candidate' }
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

        it('should validate required fields', async () => {
            const invalidData = {
                title: '', // Empty title
                electionType: 'invalid_type',
                startTime: 'invalid_date',
                candidates: [] // No candidates
            };

            const response = await request(server)
                .post('/api/v1/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should validate time constraints', async () => {
            const invalidTimeData = {
                title: 'Invalid Time Election',
                description: 'Test election with invalid times',
                electionType: 'single_choice',
                startTime: new Date(Date.now() + 3600000).toISOString(), // Start after end
                endTime: new Date(Date.now() + 60000).toISOString(),
                isPublic: true,
                candidates: [
                    { name: 'Candidate 1', description: 'Test candidate' }
                ]
            };

            const response = await request(server)
                .post('/api/v1/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidTimeData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('GET /api/v1/elections', () => {
        it('should get all elections for admin', async () => {
            const response = await request(server)
                .get('/api/v1/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.elections).toBeDefined();
            expect(Array.isArray(response.body.data.elections)).toBe(true);
            expect(response.body.data.pagination).toBeDefined();
        });

        it('should filter elections by status', async () => {
            const response = await request(server)
                .get('/api/v1/elections?status=pending')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.elections).toBeDefined();
        });

        it('should paginate results', async () => {
            const response = await request(server)
                .get('/api/v1/elections?page=1&limit=5')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.pagination.page).toBe(1);
            expect(response.body.data.pagination.limit).toBe(5);
        });

        it('should search elections by title', async () => {
            const response = await request(server)
                .get('/api/v1/elections?search=Test')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.elections).toBeDefined();
        });
    });

    describe('GET /api/v1/elections/public', () => {
        it('should get public elections without authentication', async () => {
            const response = await request(server)
                .get('/api/v1/elections/public')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.elections).toBeDefined();
            expect(Array.isArray(response.body.data.elections)).toBe(true);
        });

        it('should only return public elections', async () => {
            const response = await request(server)
                .get('/api/v1/elections/public')
                .expect(200);

            expect(response.body.success).toBe(true);
            // All returned elections should be public
            response.body.data.elections.forEach((election: any) => {
                expect(election.is_public).toBe(true);
            });
        });
    });

    describe('GET /api/v1/elections/:id', () => {
        it('should get election details by ID', async () => {
            const response = await request(server)
                .get(`/api/v1/elections/${testElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.election.id).toBe(testElectionId);
            expect(response.body.data.candidates).toBeDefined();
            expect(Array.isArray(response.body.data.candidates)).toBe(true);
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

    describe('PUT /api/v1/elections/:id', () => {
        it('should update election as creator', async () => {
            const updateData = {
                title: 'Updated Test Election',
                description: 'Updated description'
            };

            const response = await request(server)
                .put(`/api/v1/elections/${testElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.election.title).toBe(updateData.title);
            expect(response.body.data.election.description).toBe(updateData.description);
        });

        it('should reject update by non-creator', async () => {
            const updateData = {
                title: 'Unauthorized Update'
            };

            const response = await request(server)
                .put(`/api/v1/elections/${testElectionId}`)
                .set('Authorization', `Bearer ${voterToken}`)
                .send(updateData)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should prevent updating active elections', async () => {
            // First, create an active election
            const activeElectionData = {
                title: 'Active Election',
                description: 'Active election for testing',
                electionType: 'single_choice',
                startTime: new Date(Date.now() - 60000).toISOString(), // Started 1 minute ago
                endTime: new Date(Date.now() + 3600000).toISOString(),
                isPublic: true,
                candidates: [
                    { name: 'Active Candidate', description: 'Test candidate' }
                ]
            };

            const createResponse = await request(server)
                .post('/api/v1/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(activeElectionData);

            const activeElectionId = createResponse.body.data.election.id;

            // Try to update the active election
            const updateData = {
                title: 'Updated Active Election'
            };

            const response = await request(server)
                .put(`/api/v1/elections/${activeElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('DELETE /api/v1/elections/:id', () => {
        let deletableElectionId: string;

        beforeEach(async () => {
            // Create an election to delete
            const electionData = {
                title: 'Deletable Election',
                description: 'Election for deletion testing',
                electionType: 'single_choice',
                startTime: new Date(Date.now() + 60000).toISOString(),
                endTime: new Date(Date.now() + 3600000).toISOString(),
                isPublic: true,
                candidates: [
                    { name: 'Deletable Candidate', description: 'Test candidate' }
                ]
            };

            const response = await request(server)
                .post('/api/v1/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(electionData);

            deletableElectionId = response.body.data.election.id;
        });

        it('should delete election as admin', async () => {
            const response = await request(server)
                .delete(`/api/v1/elections/${deletableElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.message).toContain('deleted');

            // Verify election is deleted
            const getResponse = await request(server)
                .get(`/api/v1/elections/${deletableElectionId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);
        });

        it('should reject deletion by non-admin', async () => {
            const response = await request(server)
                .delete(`/api/v1/elections/${deletableElectionId}`)
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('POST /api/v1/elections/:id/candidates', () => {
        it('should add candidate to election', async () => {
            const candidateData = {
                name: 'New Candidate',
                description: 'Newly added candidate',
                imageUrl: 'https://example.com/image.jpg'
            };

            const response = await request(server)
                .post(`/api/v1/elections/${testElectionId}/candidates`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(candidateData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.candidate.name).toBe(candidateData.name);
            expect(response.body.data.candidate.election_id).toBe(testElectionId);
        });

        it('should reject adding candidate by non-creator', async () => {
            const candidateData = {
                name: 'Unauthorized Candidate',
                description: 'Should not be added'
            };

            const response = await request(server)
                .post(`/api/v1/elections/${testElectionId}/candidates`)
                .set('Authorization', `Bearer ${voterToken}`)
                .send(candidateData)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('GET /api/v1/elections/:id/results', () => {
        it('should get election results for ended election', async () => {
            // Create an ended election
            const endedElectionData = {
                title: 'Ended Election',
                description: 'Election for results testing',
                electionType: 'single_choice',
                startTime: new Date(Date.now() - 7200000).toISOString(), // Started 2 hours ago
                endTime: new Date(Date.now() - 3600000).toISOString(), // Ended 1 hour ago
                isPublic: true,
                candidates: [
                    { name: 'Winner Candidate', description: 'Winning candidate' },
                    { name: 'Loser Candidate', description: 'Losing candidate' }
                ]
            };

            const createResponse = await request(server)
                .post('/api/v1/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(endedElectionData);

            const endedElectionId = createResponse.body.data.election.id;

            const response = await request(server)
                .get(`/api/v1/elections/${endedElectionId}/results`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.results).toBeDefined();
            expect(response.body.data.election).toBeDefined();
            expect(response.body.data.candidates).toBeDefined();
        });

        it('should reject results for active election (non-admin)', async () => {
            const response = await request(server)
                .get(`/api/v1/elections/${testElectionId}/results`)
                .set('Authorization', `Bearer ${voterToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('Error Handling', () => {
        it('should handle database errors gracefully', async () => {
            // Mock a database error by using an invalid election ID format
            const response = await request(server)
                .get('/api/v1/elections/invalid-format')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBeDefined();
        });

        it('should handle missing authentication', async () => {
            const response = await request(server)
                .get('/api/v1/elections')
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });

        it('should handle invalid JSON in request body', async () => {
            const response = await request(server)
                .post('/api/v1/elections')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('Content-Type', 'application/json')
                .send('{"invalid": json}')
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });
});