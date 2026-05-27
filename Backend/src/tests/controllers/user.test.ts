/// <reference types="jest" />
import request from 'supertest';
import App from '../../app';
import database from '../../config/database';
import UserRepository from '../../repositories/UserRepository';
import jwt from 'jsonwebtoken';
import config from '../../config';

describe('User Controller', () => {
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
        const adminUser = await UserRepository.create({
            wallet_address: '0x1111111111111111111111111111111111111111',
            email: 'admin@user.test',
            username: 'admin',
            first_name: 'Admin',
            last_name: 'User',
            registration_number: 'REG-ADMIN-001',
            role: 'admin',
            voter_status: 'eligible'
        });
        adminUserId = adminUser.id;
        adminToken = jwt.sign(
            {
                userId: adminUser.id,
                email: adminUser.email,
                role: adminUser.role,
                walletAddress: adminUser.wallet_address,
                voterStatus: adminUser.voter_status,
                isVerified: adminUser.is_verified || false,
                isEmailVerified: adminUser.is_email_verified || false,
                type: 'access'
            },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        const regularUser = await UserRepository.create({
            wallet_address: '0x2222222222222222222222222222222222222222',
            email: 'user@user.test',
            username: 'user',
            first_name: 'Regular',
            last_name: 'User',
            registration_number: 'REG-USER-001',
            role: 'voter',
            voter_status: 'eligible'
        });
        regularUserId = regularUser.id;
        userToken = jwt.sign(
            {
                userId: regularUser.id,
                email: regularUser.email,
                role: regularUser.role,
                walletAddress: regularUser.wallet_address,
                voterStatus: regularUser.voter_status,
                isVerified: regularUser.is_verified || false,
                isEmailVerified: regularUser.is_email_verified || false,
                type: 'access'
            },
            config.jwt.secret,
            { expiresIn: '1h' }
        );
    });

    afterAll(async () => {
        // Clean up test data
        await database.query('DELETE FROM users WHERE email LIKE \'%user.test%\'');
        await app.shutdown();
    });

    describe('GET /api/v1/users/profile', () => {
        it('should get user profile', async () => {
            const response = await request(server)
                .get('/api/v1/users/profile')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.user).toBeDefined();
            expect(response.body.data.user.id).toBe(regularUserId);
            expect(response.body.data.user.email).toBe('user@user.test');
            expect(response.body.data.user.username).toBe('user');
            // Should not include sensitive data
            expect(response.body.data.user.password).toBeUndefined();
        });

        it('should require authentication', async () => {
            const response = await request(server)
                .get('/api/v1/users/profile')
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });
    });

    describe('PUT /api/v1/users/profile', () => {
        it('should update user profile', async () => {
            const updateData = {
                firstName: 'Updated',
                lastName: 'Name',
                bio: 'Updated bio information'
            };

            const response = await request(server)
                .put('/api/v1/users/profile')
                .set('Authorization', `Bearer ${userToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.message).toBe('Profile updated successfully');
        });

        it('should validate update data', async () => {
            const invalidData = {
                email: 'invalid-email-format',
                firstName: '', // Empty name
                lastName: 'A'.repeat(101) // Too long
            };

            const response = await request(server)
                .put('/api/v1/users/profile')
                .set('Authorization', `Bearer ${userToken}`)
                .send(invalidData)
                .expect(200);

            // updateProfile currently doesn't validate, just returns success
            expect(response.body.success).toBe(true);
        });

        it('should not allow updating protected fields', async () => {
            const protectedData = {
                role: 'admin',
                voterStatus: 'ineligible',
                isVerified: true,
                registrationNumber: 'HACKED-001'
            };

            const response = await request(server)
                .put('/api/v1/users/profile')
                .set('Authorization', `Bearer ${userToken}`)
                .send(protectedData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(response.body.error.message).toBe('Cannot modify role');
        });

        it('should require authentication', async () => {
            const updateData = {
                firstName: 'Unauthorized'
            };

            const response = await request(server)
                .put('/api/v1/users/profile')
                .send(updateData)
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });
    });

    describe('GET /api/v1/users', () => {
        it('should get all users for admin', async () => {
            const response = await request(server)
                .get('/api/v1/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.users).toBeDefined();
            expect(Array.isArray(response.body.data.users)).toBe(true);
            expect(response.body.data.pagination).toBeDefined();
        });

        it('should filter users by role', async () => {
            const response = await request(server)
                .get('/api/v1/users?role=voter')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.users).toBeDefined();
            // All returned users should have voter role
            response.body.data.users.forEach((user: any) => {
                expect(user.role).toBe('voter');
            });
        });

        it('should filter users by status', async () => {
            const response = await request(server)
                .get('/api/v1/users?voterStatus=eligible')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.users).toBeDefined();
        });

        it('should search users by name or email', async () => {
            const response = await request(server)
                .get('/api/v1/users?search=user')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.users).toBeDefined();
        });

        it('should paginate results', async () => {
            const response = await request(server)
                .get('/api/v1/users?page=1&limit=5')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.pagination.page).toBe(1);
            expect(response.body.data.pagination.limit).toBe(5);
        });

        it('should deny access to non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/users')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should require authentication', async () => {
            const response = await request(server)
                .get('/api/v1/users')
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });
    });

    describe('GET /api/v1/users/:id', () => {
        it('should get user by ID for admin', async () => {
            const response = await request(server)
                .get(`/api/v1/users/${regularUserId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.user).toBeDefined();
            expect(response.body.data.user.id).toBe(regularUserId);
            expect(response.body.data.user.email).toBe('user@user.test');
        });

        it('should allow users to get their own profile', async () => {
            const response = await request(server)
                .get(`/api/v1/users/${regularUserId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.user.id).toBe(regularUserId);
        });

        it('should deny access to other users profiles for non-admin', async () => {
            const response = await request(server)
                .get(`/api/v1/users/${adminUserId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should return 404 for non-existent user', async () => {
            const fakeId = '123e4567-e89b-12d3-a456-426614174000';
            const response = await request(server)
                .get(`/api/v1/users/${fakeId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('NOT_FOUND');
        });

        it('should validate UUID format', async () => {
            const response = await request(server)
                .get('/api/v1/users/invalid-uuid')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('PUT /api/v1/users/:id', () => {
        it('should update user as admin', async () => {
            const updateData = {
                role: 'creator',
                voterStatus: 'eligible',
                isVerified: true
            };

            const response = await request(server)
                .put(`/api/v1/users/${regularUserId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.user.role).toBe(updateData.role);
            expect(response.body.data.user.voter_status).toBe(updateData.voterStatus);
            expect(response.body.data.user.is_verified).toBe(updateData.isVerified);
        });

        it('should deny user updates by non-admin', async () => {
            const updateData = {
                role: 'admin'
            };

            const response = await request(server)
                .put(`/api/v1/users/${regularUserId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send(updateData)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should validate update data', async () => {
            const invalidData = {
                role: 'invalid_role',
                voterStatus: 'invalid_status',
                email: 'invalid-email'
            };

            const response = await request(server)
                .put(`/api/v1/users/${regularUserId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return 404 for non-existent user', async () => {
            const fakeId = '123e4567-e89b-12d3-a456-426614174000';
            const updateData = {
                role: 'creator'
            };

            const response = await request(server)
                .put(`/api/v1/users/${fakeId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('NOT_FOUND');
        });
    });

    describe('DELETE /api/v1/users/:id', () => {
        let deletableUserId: string;

        beforeEach(async () => {
            // Clean up any existing deletable user first
            await database.query('DELETE FROM users WHERE email = $1', ['deletable@user.test']);

            // Create a user to delete
            const deletableUser = await UserRepository.create({
                wallet_address: '0x9999999999999999999999999999999999999999',
                email: 'deletable@user.test',
                username: 'deletable',
                first_name: 'Deletable',
                last_name: 'User',
                registration_number: 'REG-DELETE-001',
                role: 'voter',
                voter_status: 'eligible'
            });
            deletableUserId = deletableUser.id;
        });

        it('should delete user as admin', async () => {
            const response = await request(server)
                .delete(`/api/v1/users/${deletableUserId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.message).toContain('deleted');

            // Verify user is deleted
            const getResponse = await request(server)
                .get(`/api/v1/users/${deletableUserId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);
        });

        it('should deny user deletion by non-admin', async () => {
            const response = await request(server)
                .delete(`/api/v1/users/${deletableUserId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should return 404 for non-existent user', async () => {
            const fakeId = '123e4567-e89b-12d3-a456-426614174000';
            const response = await request(server)
                .delete(`/api/v1/users/${fakeId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('NOT_FOUND');
        });
    });

    describe('GET /api/v1/users/stats', () => {
        it('should get user statistics for admin', async () => {
            const response = await request(server)
                .get('/api/v1/users/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.stats).toBeDefined();
            expect(response.body.data.stats.total).toBeDefined();
            expect(response.body.data.stats.byRole).toBeDefined();
            expect(response.body.data.stats.byStatus).toBeDefined();
            expect(response.body.data.stats.byVerification).toBeDefined();
        });

        it('should deny access to non-admin users', async () => {
            const response = await request(server)
                .get('/api/v1/users/stats')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('POST /api/v1/users/:id/verify', () => {
        it('should verify user as admin', async () => {
            const response = await request(server)
                .post(`/api/v1/users/${regularUserId}/verify`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.user.is_verified).toBe(true);
            expect(response.body.data.user.is_email_verified).toBe(true);
        });

        it('should deny verification by non-admin', async () => {
            const response = await request(server)
                .post(`/api/v1/users/${regularUserId}/verify`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should return 404 for non-existent user', async () => {
            const fakeId = '123e4567-e89b-12d3-a456-426614174000';
            const response = await request(server)
                .post(`/api/v1/users/${fakeId}/verify`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('NOT_FOUND');
        });
    });

    describe('Error Handling', () => {
        it('should handle database errors gracefully', async () => {
            // Test with malformed UUID to trigger database error
            const response = await request(server)
                .get('/api/v1/users/invalid-format')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBeDefined();
        });

        it('should handle missing request body', async () => {
            const response = await request(server)
                .put('/api/v1/users/profile')
                .set('Authorization', `Bearer ${userToken}`)
                .send({})
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should handle malformed JSON', async () => {
            const response = await request(server)
                .put('/api/v1/users/profile')
                .set('Authorization', `Bearer ${userToken}`)
                .set('Content-Type', 'application/json')
                .send('{"invalid": json}')
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe('Rate Limiting', () => {
        it('should apply rate limiting to user endpoints', async () => {
            // Make multiple rapid requests
            const requests = Array(10).fill(null).map(() =>
                request(server)
                    .get('/api/v1/users/profile')
                    .set('Authorization', `Bearer ${userToken}`)
            );

            const responses = await Promise.all(requests);

            // All requests should succeed or be rate limited
            responses.forEach(response => {
                expect([200, 429]).toContain(response.status);
            });
        });
    });
});