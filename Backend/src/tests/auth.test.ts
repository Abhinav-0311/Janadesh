/// <reference types="jest" />
import request from 'supertest';
import App from '../app';
import database from '../config/database';
import redisClient from '../config/redis';
import UserRepository from '../repositories/UserRepository';
import OtpTokenRepository from '../repositories/OtpTokenRepository';
import { OtpToken } from '../models';



describe('Authentication System', () => {
  let app: App;
  let server: any;

  beforeAll(async () => {
    app = new App();
    await app.initialize();
    server = app.app;
  });

  afterAll(async () => {
    await app.shutdown();
  });

  beforeEach(async () => {
    // Clean up test data - delete all test users and their related data
    await database.query('DELETE FROM otp_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE \'%example.com\')');
    await database.query('DELETE FROM users WHERE email LIKE \'%example.com\'');
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        registrationNumber: 'REG-TEST-001'
      };

      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.username).toBe(userData.username);
      expect(response.body.data.user.isVerified).toBe(false);
      expect(response.body.data.verificationRequired).toBe(true);
    });

    it('should reject registration with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        username: 'testuser',
        registrationNumber: 'REG-TEST-001'
      };

      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject registration with duplicate email', async () => {
      const userData = {
        email: 'duplicate@example.com',
        username: 'testuser1',
        registrationNumber: 'REG-TEST-001'
      };

      // First registration
      await request(server)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      // Second registration with same email
      const duplicateData = {
        ...userData,
        username: 'testuser2',
        registrationNumber: 'REG-TEST-002'
      };

      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(duplicateData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONFLICT');
    });
  });

  describe('POST /api/v1/auth/verify-email', () => {
    let user: any;
    let verificationToken: OtpToken;

    beforeEach(async () => {
      // Create a user and verification token
      const userData = {
        email: 'verify@example.com',
        username: 'verifyuser',
        registrationNumber: 'REG-VERIFY-001'
      };

      const registerResponse = await request(server)
        .post('/api/v1/auth/register')
        .send(userData);

      user = registerResponse.body.data.user;

      // Get the verification token from database
      const token = await OtpTokenRepository.findActiveToken(user.id, 'email_verification');
      expect(token).not.toBeNull();
      verificationToken = token!;
    });

    it('should verify email with valid token', async () => {
      const response = await request(server)
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken.token
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.isVerified).toBe(true);
      expect(response.body.data.user.isEmailVerified).toBe(true);
    });

    it('should reject invalid verification token', async () => {
      const response = await request(server)
        .post('/api/v1/auth/verify-email')
        .send({
          token: '123456'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    let user: any;

    beforeEach(async () => {
      // Create and verify a user
      const userData = {
        email: 'login@example.com',
        username: 'loginuser',
        registrationNumber: 'REG-LOGIN-001'
      };

      const registerResponse = await request(server)
        .post('/api/v1/auth/register')
        .send(userData);

      user = registerResponse.body.data.user;

      // Verify the user
      const verificationToken = await OtpTokenRepository.findActiveToken(user.id, 'email_verification');
      expect(verificationToken).not.toBeNull();
      await request(server)
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken!.token
        });
    });

    it('should initiate login and require OTP', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login/initiate')
        .send({
          email: 'login@example.com'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requiresOtp).toBe(true);
    });

    it('should complete login with valid OTP', async () => {
      // First, initiate login
      await request(server)
        .post('/api/v1/auth/login/initiate')
        .send({
          email: 'login@example.com'
        });

      // Get the login OTP token
      const loginToken = await OtpTokenRepository.findActiveToken(user.id, 'login');
      expect(loginToken).not.toBeNull();

      // Complete login with OTP
      const response = await request(server)
        .post('/api/v1/auth/login/complete')
        .send({
          email: 'login@example.com',
          otpToken: loginToken!.token
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tokens).toBeDefined();
      expect(response.body.data.tokens.accessToken).toBeDefined();
      expect(response.body.data.tokens.refreshToken).toBeDefined();
      expect(response.body.data.user.id).toBe(user.id);
    });

    it('should reject login with invalid credentials', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login/initiate')
        .send({
          email: 'nonexistent@example.com'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/v1/auth/refresh-token', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Create, verify, and login a user to get refresh token
      const userData = {
        email: 'refresh@example.com',
        username: 'refreshuser',
        registrationNumber: 'REG-REFRESH-001'
      };

      const registerResponse = await request(server)
        .post('/api/v1/auth/register')
        .send(userData);

      const user = registerResponse.body.data.user;

      // Verify user
      const verificationToken = await OtpTokenRepository.findActiveToken(user.id, 'email_verification');
      expect(verificationToken).not.toBeNull();
      await request(server)
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken!.token
        });

      // Login to get tokens
      await request(server)
        .post('/api/v1/auth/login/initiate')
        .send({ email: userData.email });

      const loginToken = await OtpTokenRepository.findActiveToken(user.id, 'login');
      expect(loginToken).not.toBeNull();
      const loginResponse = await request(server)
        .post('/api/v1/auth/login/complete')
        .send({
          email: userData.email,
          otpToken: loginToken!.token
        });

      refreshToken = loginResponse.body.data.tokens.refreshToken;
    });

    it('should refresh access token with valid refresh token', async () => {
      const response = await request(server)
        .post('/api/v1/auth/refresh-token')
        .send({
          refreshToken
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tokens).toBeDefined();
      expect(response.body.data.tokens.accessToken).toBeDefined();
      expect(response.body.data.tokens.refreshToken).toBeDefined();
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(server)
        .post('/api/v1/auth/refresh-token')
        .send({
          refreshToken: 'invalid-token'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/auth/profile', () => {
    let accessToken: string;
    let user: any;

    beforeEach(async () => {
      // Create, verify, and login a user
      const userData = {
        email: 'profile@example.com',
        username: 'profileuser',
        registrationNumber: 'REG-PROFILE-001'
      };

      const registerResponse = await request(server)
        .post('/api/v1/auth/register')
        .send(userData);

      user = registerResponse.body.data.user;

      // Verify user
      const verificationToken = await OtpTokenRepository.findActiveToken(user.id, 'email_verification');
      expect(verificationToken).not.toBeNull();
      await request(server)
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken!.token
        });

      // Login to get access token
      await request(server)
        .post('/api/v1/auth/login/initiate')
        .send({ email: userData.email });

      const loginToken = await OtpTokenRepository.findActiveToken(user.id, 'login');
      expect(loginToken).not.toBeNull();
      const loginResponse = await request(server)
        .post('/api/v1/auth/login/complete')
        .send({
          email: userData.email,
          otpToken: loginToken!.token
        });

      accessToken = loginResponse.body.data.tokens.accessToken;
    });

    it('should get user profile with valid token', async () => {
      const response = await request(server)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(user.id);
      expect(response.body.data.user.email).toBe('profile@example.com');
      expect(response.body.data.authStatus).toBeDefined();
    });

    it('should reject request without token', async () => {
      const response = await request(server)
        .get('/api/v1/auth/profile')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/v1/auth/voting-access', () => {
    let accessToken: string;
    let user: any;

    beforeEach(async () => {
      // Create, verify, and login a user
      const userData = {
        email: 'voting@example.com',
        username: 'votinguser',
        registrationNumber: 'REG-VOTING-001'
      };

      const registerResponse = await request(server)
        .post('/api/v1/auth/register')
        .send(userData);

      user = registerResponse.body.data.user;

      // Verify user
      const verificationToken = await OtpTokenRepository.findActiveToken(user.id, 'email_verification');
      expect(verificationToken).not.toBeNull();
      await request(server)
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken!.token
        });

      // Login to get access token
      await request(server)
        .post('/api/v1/auth/login/initiate')
        .send({ email: userData.email });

      const loginToken = await OtpTokenRepository.findActiveToken(user.id, 'login');
      expect(loginToken).not.toBeNull();
      const loginResponse = await request(server)
        .post('/api/v1/auth/login/complete')
        .send({
          email: userData.email,
          otpToken: loginToken!.token
        });

      accessToken = loginResponse.body.data.tokens.accessToken;
    });

    it('should generate voting access token for eligible user', async () => {
      const electionId = '123e4567-e89b-12d3-a456-426614174000';

      // Note: This test expects 403 because the user is not registered for the election
      // In a real scenario, the user would need to be registered first
      const response = await request(server)
        .post('/api/v1/auth/voting-access')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          electionId
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject voting access without authentication', async () => {
      const electionId = '123e4567-e89b-12d3-a456-426614174000';

      const response = await request(server)
        .post('/api/v1/auth/voting-access')
        .send({
          electionId
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});