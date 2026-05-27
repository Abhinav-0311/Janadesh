/// <reference types="jest" />
import database from '../../config/database';
import databaseInitializer from '../../database/init';
import UserRepository from '../../repositories/UserRepository';
import ElectionRepository from '../../repositories/ElectionRepository';
import CandidateRepository from '../../repositories/CandidateRepository';
import VoteCacheRepository from '../../repositories/VoteCacheRepository';
import VoterEligibilityRepository from '../../repositories/VoterEligibilityRepository';
import OtpTokenRepository from '../../repositories/OtpTokenRepository';

describe('Database Integration Tests', () => {
    let testUserId: string;
    let testElectionId: string;
    let testCandidateId: string;

    beforeAll(async () => {
        // Ensure database is initialized
        await databaseInitializer.initialize(true);
    });

    afterAll(async () => {
        // Clean up test data
        await database.query('DELETE FROM votes_cache WHERE voter_address LIKE \'%test%\'');
        await database.query('DELETE FROM voter_eligibility WHERE user_id IN (SELECT id FROM users WHERE email LIKE \'%integration.test%\')');
        await database.query('DELETE FROM otp_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE \'%integration.test%\')');
        await database.query('DELETE FROM candidates WHERE election_id IN (SELECT id FROM elections WHERE title LIKE \'%Integration%\')');
        await database.query('DELETE FROM elections WHERE title LIKE \'%Integration%\'');
        await database.query('DELETE FROM users WHERE email LIKE \'%integration.test%\'');
    });

    describe('User Repository Integration', () => {
        it('should create and retrieve user', async () => {
            const timestamp = Date.now();
            const userData = {
                wallet_address: `0x1234567890123456789012345678901234567${timestamp.toString().slice(-3)}`,
                email: `user-${timestamp}@integration.test`,
                username: `integrationuser-${timestamp}`,
                first_name: 'Integration',
                last_name: 'User',
                registration_number: `REG-INT-${timestamp}`,
                role: 'voter' as const,
                voter_status: 'eligible' as const
            };

            const user = await UserRepository.create(userData);
            testUserId = user.id;

            expect(user.id).toBeDefined();
            expect(user.email).toBe(userData.email);
            expect(user.username).toBe(userData.username);

            // Retrieve user
            const retrievedUser = await UserRepository.findById(user.id);
            expect(retrievedUser).not.toBeNull();
            expect(retrievedUser!.email).toBe(userData.email);
        });

        it('should update user information', async () => {
            const updateData = {
                first_name: 'Updated',
                last_name: 'Name',
                is_verified: true
            };

            const updatedUser = await UserRepository.update(testUserId, updateData);
            expect(updatedUser?.first_name).toBe(updateData.first_name);
            expect(updatedUser?.last_name).toBe(updateData.last_name);
            expect(updatedUser?.is_verified).toBe(true);
        });

        it('should find user by email', async () => {
            const createdUser = await UserRepository.findById(testUserId);
            const user = await UserRepository.findByEmail(createdUser!.email);
            expect(user).not.toBeNull();
            expect(user!.id).toBe(testUserId);
        });

        it('should find user by wallet address', async () => {
            const createdUser = await UserRepository.findById(testUserId);
            if (createdUser?.wallet_address) {
                const user = await UserRepository.findByWalletAddress(createdUser.wallet_address);
                expect(user).not.toBeNull();
                expect(user!.id).toBe(testUserId);
            } else {
                // Skip test if wallet address is not set
                expect(createdUser).toBeDefined();
            }
        });
    });

    describe('Election Repository Integration', () => {
        beforeAll(async () => {
            // Ensure we have a test user for election tests
            if (!testUserId) {
                const timestamp = Date.now();
                const userData = {
                    wallet_address: `0x1234567890123456789012345678901234567${timestamp.toString().slice(-3)}`,
                    email: `election-user-${timestamp}@integration.test`,
                    username: `electionuser-${timestamp}`,
                    first_name: 'Election',
                    last_name: 'User',
                    registration_number: `REG-ELECTION-${timestamp}`,
                    role: 'creator' as const,
                    voter_status: 'eligible' as const
                };
                const user = await UserRepository.create(userData);
                testUserId = user.id;
            }
        });

        it('should create and retrieve election', async () => {
            const electionData = {
                title: 'Integration Test Election',
                description: 'Test election for integration testing',
                creator_id: testUserId,
                election_type: 'single_choice' as const,
                start_time: new Date(Date.now() + 60000),
                end_time: new Date(Date.now() + 3600000),
                is_public: true,
                status: 'pending' as const,
                contract_address: '0x1234567890123456789012345678901234567890'
            };

            const election = await ElectionRepository.create(electionData);
            testElectionId = election.id;

            expect(election.id).toBeDefined();
            expect(election.title).toBe(electionData.title);
            expect(election.creator_id).toBe(testUserId);

            // Retrieve election
            const retrievedElection = await ElectionRepository.findById(election.id);
            expect(retrievedElection).not.toBeNull();
            expect(retrievedElection!.title).toBe(electionData.title);
        });

        it('should update election status', async () => {
            const updatedElection = await ElectionRepository.update(testElectionId, {
                status: 'active'
            });
            expect(updatedElection?.status).toBe('active');
        });

        it('should find elections by creator', async () => {
            const elections = await ElectionRepository.findByCreator(testUserId);
            expect(elections.length).toBeGreaterThan(0);
            expect(elections[0].creator_id).toBe(testUserId);
        });

        it('should find public elections', async () => {
            const elections = await ElectionRepository.findPublicElections();
            expect(elections.length).toBeGreaterThan(0);
            elections.forEach(election => {
                expect(election.is_public).toBe(true);
            });
        });
    });

    describe('Candidate Repository Integration', () => {
        beforeAll(async () => {
            // Ensure we have a test election for candidate tests
            if (!testElectionId) {
                // Create user if needed
                if (!testUserId) {
                    const timestamp = Date.now();
                    const userData = {
                        wallet_address: `0x1234567890123456789012345678901234567${timestamp.toString().slice(-3)}`,
                        email: `candidate-user-${timestamp}@integration.test`,
                        username: `candidateuser-${timestamp}`,
                        first_name: 'Candidate',
                        last_name: 'User',
                        registration_number: `REG-CANDIDATE-${timestamp}`,
                        role: 'creator' as const,
                        voter_status: 'eligible' as const
                    };
                    const user = await UserRepository.create(userData);
                    testUserId = user.id;
                }

                // Create election
                const electionData = {
                    title: 'Candidate Test Election',
                    description: 'Test election for candidate testing',
                    creator_id: testUserId,
                    election_type: 'single_choice' as const,
                    start_time: new Date(Date.now() + 60000),
                    end_time: new Date(Date.now() + 3600000),
                    is_public: true,
                    status: 'pending' as const,
                    contract_address: '0x2234567890123456789012345678901234567890'
                };
                const election = await ElectionRepository.create(electionData);
                testElectionId = election.id;
            }
        });

        it('should create and retrieve candidate', async () => {
            const candidateData = {
                election_id: testElectionId,
                name: 'Integration Test Candidate',
                description: 'Test candidate for integration testing',
                image_url: 'https://example.com/candidate.jpg',
                position: 1
            };

            const candidate = await CandidateRepository.create(candidateData);
            testCandidateId = candidate.id;

            expect(candidate.id).toBeDefined();
            expect(candidate.name).toBe(candidateData.name);
            expect(candidate.election_id).toBe(testElectionId);

            // Retrieve candidate
            const retrievedCandidate = await CandidateRepository.findById(candidate.id);
            expect(retrievedCandidate).not.toBeNull();
            expect(retrievedCandidate!.name).toBe(candidateData.name);
        });

        it('should find candidates by election', async () => {
            const candidates = await CandidateRepository.findByElection(testElectionId);
            expect(candidates.length).toBeGreaterThan(0);
            expect(candidates[0].election_id).toBe(testElectionId);
        });

        it('should update candidate information', async () => {
            const updateData = {
                name: 'Updated Candidate Name',
                description: 'Updated description'
            };

            const updatedCandidate = await CandidateRepository.update(testCandidateId, updateData);
            expect(updatedCandidate?.name).toBe(updateData.name);
            expect(updatedCandidate?.description).toBe(updateData.description);
        });
    });

    describe('Vote Cache Repository Integration', () => {
        beforeAll(async () => {
            // Ensure we have test data for vote cache tests
            if (!testUserId || !testElectionId || !testCandidateId) {
                const timestamp = Date.now();

                // Create user if needed
                if (!testUserId) {
                    const userData = {
                        wallet_address: `0x1234567890123456789012345678901234567${timestamp.toString().slice(-3)}`,
                        email: `vote-user-${timestamp}@integration.test`,
                        username: `voteuser-${timestamp}`,
                        first_name: 'Vote',
                        last_name: 'User',
                        registration_number: `REG-VOTE-${timestamp}`,
                        role: 'creator' as const,
                        voter_status: 'eligible' as const
                    };
                    const user = await UserRepository.create(userData);
                    testUserId = user.id;
                }

                // Create election if needed
                if (!testElectionId) {
                    const electionData = {
                        title: 'Vote Test Election',
                        description: 'Test election for vote testing',
                        creator_id: testUserId,
                        election_type: 'single_choice' as const,
                        start_time: new Date(Date.now() + 60000),
                        end_time: new Date(Date.now() + 3600000),
                        is_public: true,
                        status: 'pending' as const,
                        contract_address: '0x3234567890123456789012345678901234567890'
                    };
                    const election = await ElectionRepository.create(electionData);
                    testElectionId = election.id;
                }

                // Create candidate if needed
                if (!testCandidateId) {
                    const candidateData = {
                        election_id: testElectionId,
                        name: 'Vote Test Candidate',
                        description: 'Test candidate for vote testing',
                        image_url: 'https://example.com/vote-candidate.jpg',
                        position: 1
                    };
                    const candidate = await CandidateRepository.create(candidateData);
                    testCandidateId = candidate.id;
                }
            }
        });

        it('should create and retrieve vote cache entry', async () => {
            const voteData = {
                election_id: testElectionId,
                voter_address: '0x1234567890123456789012345678901234567890',
                voter_id: testUserId,
                candidate_id: testCandidateId,
                transaction_hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
                block_number: 12345
            };

            const vote = await VoteCacheRepository.create(voteData);

            expect(vote.id).toBeDefined();
            expect(vote.election_id).toBe(testElectionId);
            expect(vote.voter_address).toBe(voteData.voter_address);

            // Retrieve vote
            const retrievedVote = await VoteCacheRepository.findById(vote.id);
            expect(retrievedVote).not.toBeNull();
            expect(retrievedVote!.transaction_hash).toBe(voteData.transaction_hash);
        });

        it('should find votes by election', async () => {
            const votes = await VoteCacheRepository.findByElection(testElectionId);
            expect(votes.length).toBeGreaterThan(0);
            expect(votes[0].election_id).toBe(testElectionId);
        });

        it('should check if voter has voted', async () => {
            const vote = await VoteCacheRepository.findByVoterAndElection(
                testUserId,
                testElectionId
            );
            expect(vote).toBeTruthy();
        });
    });

    describe('Voter Eligibility Repository Integration', () => {
        beforeAll(async () => {
            // Ensure we have test data for voter eligibility tests
            if (!testUserId || !testElectionId) {
                const timestamp = Date.now();

                // Create user if needed
                if (!testUserId) {
                    const userData = {
                        wallet_address: `0x1234567890123456789012345678901234567${timestamp.toString().slice(-3)}`,
                        email: `eligibility-user-${timestamp}@integration.test`,
                        username: `eligibilityuser-${timestamp}`,
                        first_name: 'Eligibility',
                        last_name: 'User',
                        registration_number: `REG-ELIGIBILITY-${timestamp}`,
                        role: 'voter' as const,
                        voter_status: 'eligible' as const
                    };
                    const user = await UserRepository.create(userData);
                    testUserId = user.id;
                }

                // Create election if needed
                if (!testElectionId) {
                    const electionData = {
                        title: 'Eligibility Test Election',
                        description: 'Test election for eligibility testing',
                        creator_id: testUserId,
                        election_type: 'single_choice' as const,
                        start_time: new Date(Date.now() + 60000),
                        end_time: new Date(Date.now() + 3600000),
                        is_public: true,
                        status: 'pending' as const,
                        contract_address: '0x4234567890123456789012345678901234567890'
                    };
                    const election = await ElectionRepository.create(electionData);
                    testElectionId = election.id;
                }
            }
        });

        it('should create and retrieve voter eligibility', async () => {
            const eligibilityData = {
                user_id: testUserId,
                election_id: testElectionId,
                is_eligible: true,
                eligibility_reason: 'Registered voter',
                verified_at: new Date()
            };

            const eligibility = await VoterEligibilityRepository.create(eligibilityData);

            expect(eligibility.id).toBeDefined();
            expect(eligibility.user_id).toBe(testUserId);
            expect(eligibility.election_id).toBe(testElectionId);
            expect(eligibility.is_eligible).toBe(true);
        });

        it('should check voter eligibility', async () => {
            const eligibility = await VoterEligibilityRepository.findByUserAndElection(testUserId, testElectionId);
            expect(eligibility?.is_eligible).toBe(true);
        });

        it('should find eligibility by user and election', async () => {
            const eligibility = await VoterEligibilityRepository.findByUserAndElection(
                testUserId,
                testElectionId
            );
            expect(eligibility).not.toBeNull();
            expect(eligibility!.is_eligible).toBe(true);
        });
    });

    describe('OTP Token Repository Integration', () => {
        beforeAll(async () => {
            // Ensure we have a test user for OTP token tests
            if (!testUserId) {
                const timestamp = Date.now();
                const userData = {
                    wallet_address: `0x1234567890123456789012345678901234567${timestamp.toString().slice(-3)}`,
                    email: `otp-user-${timestamp}@integration.test`,
                    username: `otpuser-${timestamp}`,
                    first_name: 'OTP',
                    last_name: 'User',
                    registration_number: `REG-OTP-${timestamp}`,
                    role: 'voter' as const,
                    voter_status: 'eligible' as const
                };
                const user = await UserRepository.create(userData);
                testUserId = user.id;
            }
        });

        it('should create and retrieve OTP token', async () => {
            const tokenData = {
                user_id: testUserId,
                token: '123456',
                token_type: 'login' as const,
                expires_at: new Date(Date.now() + 300000) // 5 minutes
            };

            const otpToken = await OtpTokenRepository.create(tokenData);

            expect(otpToken.id).toBeDefined();
            expect(otpToken.user_id).toBe(testUserId);
            expect(otpToken.token).toBe(tokenData.token);
            expect(otpToken.token_type).toBe(tokenData.token_type);
        });

        it('should find active token', async () => {
            const activeToken = await OtpTokenRepository.findActiveToken(testUserId, 'login');
            expect(activeToken).not.toBeNull();
            expect(activeToken!.token).toBe('123456');
        });

        it('should validate token', async () => {
            const result = await OtpTokenRepository.verifyToken('123456', 'login', testUserId);
            expect(result.valid).toBe(true);

            // Invalid token should return false
            const invalidResult = await OtpTokenRepository.verifyToken('999999', 'login', testUserId);
            expect(invalidResult.valid).toBe(false);
        });

        it('should invalidate token', async () => {
            await OtpTokenRepository.invalidateUserTokens(testUserId, 'login');

            const result = await OtpTokenRepository.verifyToken('123456', 'login', testUserId);
            expect(result.valid).toBe(false);
        });
    });

    describe('Database Transaction Handling', () => {
        it('should handle transaction rollback on error', async () => {
            const client = await database.getClient();

            try {
                await client.query('BEGIN');

                // Create a user
                const result = await client.query(
                    'INSERT INTO users (wallet_address, email, username, registration_number) VALUES ($1, $2, $3, $4) RETURNING id',
                    ['0x9999999999999999999999999999999999999999', 'rollback@integration.test', 'rollbackuser', 'REG-ROLLBACK-001']
                );

                const userId = result.rows[0].id;

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
                const user = await UserRepository.findByEmail('rollback@integration.test');
                expect(user).toBeNull();
            } finally {
                client.release();
            }
        });

        it('should handle concurrent access correctly', async () => {
            const promises: Promise<any>[] = [];

            // Create multiple concurrent operations
            for (let i = 0; i < 5; i++) {
                promises.push(
                    UserRepository.create({
                        // Avoid collisions with seeded sample wallets (e.g. 0x...0001)
                        wallet_address: `0x9${i.toString(16).padStart(39, '0')}`,
                        email: `concurrent${i}@integration.test`,
                        username: `concurrent${i}`,
                        registration_number: `REG-CONCURRENT-${i.toString().padStart(3, '0')}`,
                        role: 'voter',
                        voter_status: 'eligible'
                    })
                );
            }

            const users = await Promise.all(promises);

            // Verify all users were created successfully
            expect(users).toHaveLength(5);
            users.forEach((user: any, index: number) => {
                expect(user.email).toBe(`concurrent${index}@integration.test`);
            });

            // Clean up
            for (const user of users) {
                await UserRepository.delete((user as any).id);
            }
        });
    });

    describe('Database Performance', () => {
        it('should handle large dataset queries efficiently', async () => {
            const startTime = Date.now();

            // Create multiple elections
            const elections: any[] = [];
            for (let i = 0; i < 10; i++) {
                const election = await ElectionRepository.create({
                    title: `Performance Test Election ${i}`,
                    description: `Performance test election ${i}`,
                    creator_id: testUserId,
                    election_type: 'single_choice',
                    start_time: new Date(Date.now() + 60000),
                    end_time: new Date(Date.now() + 3600000),
                    is_public: true,
                    status: 'pending',
                    contract_address: `0x${i.toString().padStart(40, '0')}`
                });
                elections.push(election as any);
            }

            // Query all elections
            const allElections = await ElectionRepository.findAll();

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(allElections.data.length).toBeGreaterThanOrEqual(10);
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

            // Clean up
            for (const election of elections) {
                await ElectionRepository.delete((election as any).id);
            }
        });
    });
});
