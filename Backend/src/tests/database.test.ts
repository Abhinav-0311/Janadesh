import database from '../config/database';
import databaseInitializer from '../database/init';
import migrationRunner from '../database/migrations/index';
import { repositories } from '../repositories';

describe('Database Schema and Models', () => {
  beforeAll(async () => {
    // Initialize database for testing
    await databaseInitializer.initialize(true);
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
  });

  afterAll(async () => {
    // Clean up
    await database.close();
  });

  describe('Database Connection', () => {
    test('should connect to database successfully', async () => {
      const isConnected = await database.testConnection();
      expect(isConnected).toBe(true);
    });

    test('should perform health check', async () => {
      const health = await database.healthCheck();
      expect(health.status).toBe('healthy');
      expect(typeof health.totalConnections).toBe('number');
    });
  });

  describe('Migrations', () => {
    test('should have all migrations executed', async () => {
      const status = await migrationRunner.getStatus();
      expect(status.pending.length).toBe(0);
      expect(status.executed).toBeGreaterThan(0);
    });

    test('should have created all required tables', async () => {
      const client = await database.getClient();
      try {
        const result = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `);
        
        const tableNames = result.rows.map(row => row.table_name);
        const expectedTables = [
          'users',
          'elections', 
          'candidates',
          'votes_cache',
          'voter_registrations',
          'otp_tokens',
          'voter_eligibility',
          'audit_logs',
          'migrations',
          'seeds'
        ];

        expectedTables.forEach(table => {
          expect(tableNames).toContain(table);
        });
      } finally {
        client.release();
      }
    });
  });

  describe('User Repository', () => {
    test('should create and find user', async () => {
      const userData = {
        wallet_address: '0x1234567890123456789012345678901234567890',
        email: 'test@example.com',
        username: 'testuser',
        registration_number: 'TEST001',
        role: 'voter' as const,
        voter_status: 'eligible' as const
      };

      const user = await repositories.user.create(userData);
      expect(user.id).toBeDefined();
      expect(user.email).toBe(userData.email);

      const foundUser = await repositories.user.findByEmail(userData.email);
      expect(foundUser).toBeTruthy();
      expect(foundUser?.id).toBe(user.id);
    });

    test('should find user by wallet address', async () => {
      const walletAddress = '0x2345678901234567890123456789012345678901';
      const userData = {
        wallet_address: walletAddress,
        email: 'wallet@example.com',
        username: 'walletuser',
        registration_number: 'WALLET001',
        role: 'voter' as const,
        voter_status: 'eligible' as const
      };

      await repositories.user.create(userData);
      const foundUser = await repositories.user.findByWalletAddress(walletAddress);
      expect(foundUser).toBeTruthy();
      expect(foundUser?.wallet_address).toBe(walletAddress);
    });
  });

  describe('Election Repository', () => {
    test('should create and find election', async () => {
      // First create a user to be the creator
      const creator = await repositories.user.create({
        wallet_address: '0x3456789012345678901234567890123456789012',
        email: 'creator@example.com',
        username: 'creator',
        registration_number: 'CREATOR001',
        role: 'creator',
        voter_status: 'eligible'
      });

      const electionData = {
        contract_address: '0x1111111111111111111111111111111111111111',
        title: 'Test Election',
        description: 'A test election',
        creator_id: creator.id,
        election_type: 'single_choice' as const,
        start_time: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        end_time: new Date(Date.now() + 48 * 60 * 60 * 1000), // Day after tomorrow
        status: 'pending' as const
      };

      const election = await repositories.election.create(electionData);
      expect(election.id).toBeDefined();
      expect(election.title).toBe(electionData.title);

      const foundElection = await repositories.election.findByContractAddress(electionData.contract_address);
      expect(foundElection).toBeTruthy();
      expect(foundElection?.id).toBe(election.id);
    });
  });

  describe('OTP Token Repository', () => {
    test('should generate and verify OTP token', async () => {
      // Create a user first
      const user = await repositories.user.create({
        wallet_address: '0x4567890123456789012345678901234567890123',
        email: 'otp@example.com',
        username: 'otpuser',
        registration_number: 'OTP001',
        role: 'voter',
        voter_status: 'eligible'
      });

      // Generate token
      const otpToken = await repositories.otpToken.generateToken(
        user.id,
        'email_verification',
        15 // 15 minutes
      );

      expect(otpToken.token).toBeDefined();
      expect(otpToken.token_type).toBe('email_verification');
      expect(otpToken.is_used).toBe(false);

      // Verify token
      const verification = await repositories.otpToken.verifyToken(
        otpToken.token,
        'email_verification',
        user.id
      );

      expect(verification.valid).toBe(true);
      expect(verification.otpToken?.is_used).toBe(true);
    });
  });

  describe('Database Functions', () => {
    test('should execute database health check function', async () => {
      const client = await database.getClient();
      try {
        const result = await client.query('SELECT * FROM database_health_check()');
        expect(result.rows.length).toBeGreaterThan(0);
        
        const metrics = result.rows.map(row => row.metric);
        expect(metrics).toContain('Active Connections');
        expect(metrics).toContain('Database Size');
      } finally {
        client.release();
      }
    });

    test('should execute database statistics function', async () => {
      const client = await database.getClient();
      try {
        const result = await client.query('SELECT * FROM get_database_statistics()');
        expect(result.rows.length).toBeGreaterThan(0);
        
        // Should have stats for our tables
        const tableNames = result.rows.map(row => row.table_name);
        expect(tableNames.some(name => name.includes('users'))).toBe(true);
      } finally {
        client.release();
      }
    });
  });

  describe('Audit Logging', () => {
    test('should log audit events', async () => {
      const client = await database.getClient();
      try {
        const result = await client.query(`
          SELECT log_audit_event(
            NULL,
            'test_action',
            'system',
            NULL,
            NULL,
            '{"test": "data"}',
            '127.0.0.1'::inet,
            'test-agent',
            true,
            NULL,
            '{"context": "test"}'
          )
        `);
        
        expect(result.rows[0].log_audit_event).toBeDefined();
        
        // Verify the log was created
        const logResult = await client.query(
          'SELECT * FROM audit_logs WHERE id = $1',
          [result.rows[0].log_audit_event]
        );
        
        expect(logResult.rows.length).toBe(1);
        expect(logResult.rows[0].action).toBe('test_action');
      } finally {
        client.release();
      }
    });
  });

  describe('Materialized Views', () => {
    test('should refresh election statistics view', async () => {
      const client = await database.getClient();
      try {
        // This should not throw an error
        await client.query('SELECT refresh_election_statistics()');
        
        // Check if view exists and can be queried
        const result = await client.query('SELECT COUNT(*) FROM election_statistics');
        expect(result.rows[0].count).toBeDefined();
      } finally {
        client.release();
      }
    });
  });
});