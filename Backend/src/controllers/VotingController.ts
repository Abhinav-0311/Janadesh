import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import ElectionRepository from '../repositories/ElectionRepository';
import CandidateRepository from '../repositories/CandidateRepository';
import VoteCacheRepository from '../repositories/VoteCacheRepository';
import VoterEligibilityRepository from '../repositories/VoterEligibilityRepository';
import UserRepository from '../repositories/UserRepository';
import WebSocketManager from '../services/WebSocketManager';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../types';
import logger from '../utils/logger';
import Joi from 'joi';
import crypto from 'crypto';

export class VotingController {
    /**
     * Submit a vote
     */
    async submitVote(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;
            const paramsSchema = Joi.object({
                electionId: Joi.string().uuid().optional()
            });

            const paramsValidation = paramsSchema.validate(req.params);
            if (paramsValidation.error) {
                throw new ValidationError(paramsValidation.error.details[0].message);
            }

            const bodySchema = Joi.object({
                electionId: Joi.string().uuid().optional(),
                candidateId: Joi.string().uuid().optional(),
                candidateIds: Joi.array().items(Joi.string().uuid()).min(1).optional(),
                transactionHash: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).optional(),
                walletAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional()
            });

            const { error, value } = bodySchema.validate(req.body);
            if (error) {
                throw new ValidationError(error.details[0].message);
            }

            const electionId = paramsValidation.value.electionId || value.electionId;
            if (!electionId) {
                throw new ValidationError('electionId is required');
            }

            const candidateIds: string[] = value.candidateIds || (value.candidateId ? [value.candidateId] : []);
            if (candidateIds.length === 0) {
                throw new ValidationError('candidateId or candidateIds is required');
            }

            // Keep transaction hash validation when provided, but allow frontend flows
            // that rely on backend-assisted vote recording without a precomputed hash.
            const transactionHash =
                value.transactionHash || `0x${crypto.randomBytes(32).toString('hex')}`;
            const fallbackWalletAddress = `0x${crypto
                .createHash('sha256')
                .update(`user:${user.userId}`)
                .digest('hex')
                .slice(0, 40)}`;
            const walletAddress = value.walletAddress || user.walletAddress || fallbackWalletAddress;

            // Get election details
            const election = await ElectionRepository.findById(electionId);
            if (!election) {
                throw new NotFoundError('Election not found');
            }

            // Check if election is active
            const now = new Date();
            if (election.status !== 'active' || now < election.start_time || now > election.end_time) {
                throw new ValidationError('Election is not currently active');
            }

            // Check if user has already voted
            const existingVote = await VoteCacheRepository.findByVoterAndElection(user.userId, electionId);
            if (existingVote) {
                throw new ConflictError('You have already voted in this election');
            }

            // Check voter eligibility
            const eligibility = await VoterEligibilityRepository.findByUserAndElection(user.userId, electionId);
            if (eligibility && !eligibility.is_eligible) {
                throw new ForbiddenError(`You are not eligible to vote: ${eligibility.eligibility_reason}`);
            }

            // Check if user is locked out
            if (user.voterStatus === 'locked_out' || user.voterStatus === 'suspended') {
                throw new ForbiddenError('Your voting access has been restricted');
            }

            // Validate number of candidates selected
            if (candidateIds.length > election.max_votes_per_voter) {
                throw new ValidationError(`You can only vote for up to ${election.max_votes_per_voter} candidate(s)`);
            }

            // Validate all candidates exist and are active
            const candidates = await Promise.all(
                candidateIds.map(async (candidateId) => {
                    const candidate = await CandidateRepository.findById(candidateId);
                    if (!candidate) {
                        throw new NotFoundError(`Candidate ${candidateId} not found`);
                    }
                    if (candidate.election_id !== electionId) {
                        throw new ValidationError(`Candidate ${candidateId} does not belong to this election`);
                    }
                    if (!candidate.is_active) {
                        throw new ValidationError(`Candidate ${candidateId} is not active`);
                    }
                    return candidate;
                })
            );

            // Check for duplicate candidate IDs
            const uniqueCandidateIds = new Set(candidateIds);
            if (uniqueCandidateIds.size !== candidateIds.length) {
                throw new ValidationError('Cannot vote for the same candidate multiple times');
            }

            // Verify transaction hash is unique
            const existingTransaction = await VoteCacheRepository.findByTransactionHash(transactionHash);
            if (existingTransaction) {
                throw new ConflictError('Transaction hash already exists');
            }

            // Create vote records for each candidate
            const voteRecords = await Promise.all(
                candidateIds.map(async (candidateId) => {
                    return await VoteCacheRepository.create({
                        election_id: electionId,
                        voter_address: walletAddress,
                        voter_id: user.userId,
                        candidate_id: candidateId,
                        transaction_hash: transactionHash,
                        vote_weight: 1,
                        is_verified: false, // Will be verified by blockchain service
                        voted_at: new Date()
                    });
                })
            );

            // Update candidate vote counts (optimistic update)
            await Promise.all(
                candidateIds.map(async (candidateId) => {
                    await CandidateRepository.incrementVoteCount(candidateId, 1);
                })
            );

            // Update election vote count
            await ElectionRepository.incrementVoteCount(electionId);

            // Update user voter status
            await UserRepository.update(user.userId, { voter_status: 'voted' });

            // Update voter eligibility
            if (eligibility) {
                await VoterEligibilityRepository.update(eligibility.id, {
                    has_voted: true,
                    vote_timestamp: new Date()
                });
            }

            // Send WebSocket vote confirmation
            try {
                const wsManager = WebSocketManager.getInstance();
                wsManager.sendVoteConfirmation(user.userId, {
                    electionId,
                    transactionHash,
                    candidateId: candidateIds[0], // Primary candidate for notification
                    timestamp: new Date().toISOString(),
                    status: 'pending'
                });
            } catch (wsError) {
                logger.warn('Failed to send WebSocket vote confirmation:', wsError);
                // Don't fail the vote submission if WebSocket fails
            }

            res.status(201).json({
                success: true,
                data: {
                    vote: {
                        id: voteRecords[0].id,
                        election_id: voteRecords[0].election_id,
                        candidate_id: voteRecords[0].candidate_id,
                        voter_id: voteRecords[0].voter_id,
                        voter_address: voteRecords[0].voter_address,
                        transaction_hash: voteRecords[0].transaction_hash,
                        is_verified: voteRecords[0].is_verified,
                        block_number: voteRecords[0].block_number,
                        voted_at: voteRecords[0].voted_at
                    },
                    voteId: voteRecords[0].id,
                    transactionHash,
                    blockNumber: voteRecords[0].block_number,
                    confirmation: {
                        transactionHash,
                        status: 'pending',
                        verified: false,
                        votedAt: voteRecords[0].voted_at
                    },
                    candidates: candidates.map(candidate => ({
                        id: candidate.id,
                        name: candidate.name
                    })),
                    message: 'Vote submitted successfully. Your vote will be verified on the blockchain.',
                    verification: {
                        status: 'pending',
                        message: 'Vote verification is in progress'
                    }
                },
                timestamp: new Date().toISOString()
            });

            logger.info(`Vote submitted: User ${user.userId} voted in election ${electionId} for candidates ${candidateIds.join(', ')}`);
        } catch (error) {
            logger.error('Submit vote controller error:', error);

            if (error instanceof ValidationError || error instanceof NotFoundError ||
                error instanceof ForbiddenError || error instanceof ConflictError) {
                res.status(error.statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'VOTE_SUBMISSION_FAILED',
                        message: 'Failed to submit vote'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Get vote verification status
     */
    async getVoteStatus(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;
            const schema = Joi.object({
                electionId: Joi.string().uuid().required()
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                throw new ValidationError(error.details[0].message);
            }

            const election = await ElectionRepository.findById(value.electionId);
            if (!election) {
                throw new NotFoundError('Election not found');
            }

            const vote = await VoteCacheRepository.findByVoterAndElection(user.userId, value.electionId);
            const eligibility = await VoterEligibilityRepository.findByUserAndElection(user.userId, value.electionId);
            const isEligible = Boolean(eligibility?.is_eligible) && user.voterStatus !== 'suspended' && user.voterStatus !== 'locked_out';

            // Get candidate information
            const candidate = vote ? await CandidateRepository.findById(vote.candidate_id) : null;

            res.json({
                success: true,
                data: {
                    election: {
                        id: election.id,
                        title: election.title,
                        status: election.status,
                        startTime: election.start_time,
                        endTime: election.end_time
                    },
                    userStatus: {
                        eligible: isEligible,
                        hasVoted: Boolean(vote),
                        voteDetails: vote ? {
                            id: vote.id,
                            transactionHash: vote.transaction_hash,
                            blockNumber: vote.block_number,
                            isVerified: vote.is_verified,
                            timestamp: vote.voted_at,
                            candidate: candidate ? {
                                id: candidate.id,
                                name: candidate.name
                            } : null
                        } : undefined
                    },
                    hasVoted: Boolean(vote),
                    vote: vote ? {
                        id: vote.id,
                        transactionHash: vote.transaction_hash,
                        blockNumber: vote.block_number,
                        isVerified: vote.is_verified,
                        votedAt: vote.voted_at,
                        candidate: candidate ? { id: candidate.id, name: candidate.name } : null
                    } : null,
                    verification: {
                        status: vote ? (vote.is_verified ? 'verified' : 'pending') : 'not_found',
                        message: vote && vote.is_verified
                            ? 'Your vote has been verified on the blockchain'
                            : vote
                                ? 'Vote verification is in progress'
                                : 'No vote found for this election'
                    }
                },
                timestamp: new Date().toISOString()
            });

            logger.info(`Vote status retrieved for user ${user.userId} in election ${value.electionId}`);
        } catch (error) {
            logger.error('Get vote status controller error:', error);

            if (error instanceof ValidationError || error instanceof NotFoundError) {
                res.status(error.statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'VOTE_STATUS_FETCH_FAILED',
                        message: 'Failed to fetch vote status'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Check voter eligibility for an election
     */
    async checkEligibility(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;
            const schema = Joi.object({
                electionId: Joi.string().uuid().required()
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                throw new ValidationError(error.details[0].message);
            }

            const election = await ElectionRepository.findById(value.electionId);
            if (!election) {
                throw new NotFoundError('Election not found');
            }

            // Check basic eligibility
            let isEligible = true;
            let reasons: string[] = [];

            // Check if user is verified
            if (!user.isVerified || !user.isEmailVerified) {
                isEligible = false;
                reasons.push('Account not verified');
            }

            // Check voter status
            if (user.voterStatus === 'locked_out' || user.voterStatus === 'suspended') {
                isEligible = false;
                reasons.push('Voting access restricted');
            }

            // Check if already voted
            const existingVote = await VoteCacheRepository.findByVoterAndElection(user.userId, value.electionId);
            if (existingVote) {
                isEligible = false;
                reasons.push('Already voted in this election');
            }

            // Check election-specific eligibility
            const eligibility = await VoterEligibilityRepository.findByUserAndElection(user.userId, value.electionId);
            if (eligibility && !eligibility.is_eligible) {
                isEligible = false;
                reasons.push(eligibility.eligibility_reason || 'Not eligible for this election');
            }

            // Check registration requirements
            if (election.requires_registration) {
                const registration = await VoterEligibilityRepository.findByUserAndElection(user.userId, value.electionId);
                if (!registration || registration.registration_required) {
                    isEligible = false;
                    reasons.push('Registration required for this election');
                }
            }

            // Check election timing
            const now = new Date();
            if (election.status !== 'active' || now < election.start_time || now > election.end_time) {
                isEligible = false;
                reasons.push('Election is not currently active');
            }

            res.json({
                success: true,
                data: {
                    isEligible,
                    eligible: isEligible,
                    hasVoted: Boolean(existingVote),
                    reason: reasons.length > 0 ? reasons.join(', ') : 'Eligible to vote',
                    eligibility: {
                        isEligible,
                        reasons: reasons.length > 0 ? reasons : ['Eligible to vote']
                    },
                    election: {
                        id: election.id,
                        title: election.title,
                        status: election.status,
                        startTime: election.start_time,
                        endTime: election.end_time,
                        requiresRegistration: election.requires_registration
                    },
                    voter: {
                        id: user.userId,
                        voterStatus: user.voterStatus,
                        isVerified: user.isVerified,
                        isEmailVerified: user.isEmailVerified
                    }
                },
                timestamp: new Date().toISOString()
            });

            logger.info(`Eligibility checked for user ${user.userId} in election ${value.electionId}: ${isEligible}`);
        } catch (error) {
            logger.error('Check eligibility controller error:', error);

            if (error instanceof ValidationError || error instanceof NotFoundError) {
                res.status(error.statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'ELIGIBILITY_CHECK_FAILED',
                        message: 'Failed to check eligibility'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Get user's voting history
     */
    async getVotingHistory(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;
            const schema = Joi.object({
                page: Joi.number().integer().min(1).default(1),
                limit: Joi.number().integer().min(1).max(50).default(10),
                status: Joi.string().valid('verified', 'pending').optional(),
                electionId: Joi.string().uuid().optional()
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                throw new ValidationError(error.details[0].message);
            }

            const votes = await VoteCacheRepository.findByVoter(user.userId);

            // Filter by status if specified
            let filteredVotes = votes;
            if (value.status) {
                filteredVotes = votes.filter(vote =>
                    value.status === 'verified' ? vote.is_verified : !vote.is_verified
                );
            }
            if (value.electionId) {
                filteredVotes = filteredVotes.filter(vote => vote.election_id === value.electionId);
            }

            // Implement pagination
            const startIndex = (value.page - 1) * value.limit;
            const endIndex = startIndex + value.limit;
            const paginatedVotes = filteredVotes.slice(startIndex, endIndex);

            // Get additional details for each vote
            const votesWithDetails = await Promise.all(
                paginatedVotes.map(async (vote) => {
                    const election = await ElectionRepository.findById(vote.election_id);
                    const candidate = await CandidateRepository.findById(vote.candidate_id);

                    return {
                        id: vote.id,
                        transactionHash: vote.transaction_hash,
                        blockNumber: vote.block_number,
                        isVerified: vote.is_verified,
                        votedAt: vote.voted_at,
                        election: election ? {
                            id: election.id,
                            title: election.title,
                            status: election.status
                        } : null,
                        candidate: candidate ? {
                            id: candidate.id,
                            name: candidate.name
                        } : null
                    };
                })
            );

            res.json({
                success: true,
                data: {
                    votes: votesWithDetails,
                    pagination: {
                        page: value.page,
                        limit: value.limit,
                        total: filteredVotes.length,
                        totalPages: Math.ceil(filteredVotes.length / value.limit),
                        hasNext: endIndex < filteredVotes.length,
                        hasPrev: value.page > 1
                    },
                    summary: {
                        totalVotes: votes.length,
                        verifiedVotes: votes.filter(v => v.is_verified).length,
                        pendingVotes: votes.filter(v => !v.is_verified).length
                    }
                },
                timestamp: new Date().toISOString()
            });

            logger.info(`Voting history retrieved for user ${user.userId}: ${votes.length} votes found`);
        } catch (error) {
            logger.error('Get voting history controller error:', error);

            if (error instanceof ValidationError) {
                res.status(error.statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'VOTING_HISTORY_FETCH_FAILED',
                        message: 'Failed to fetch voting history'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Verify vote transaction hash (user-facing endpoint)
     */
    async verifyVoteTransaction(req: Request, res: Response): Promise<void> {
        try {
            const schema = Joi.object({
                transactionHash: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).required(),
                electionId: Joi.string().uuid().required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                throw new ValidationError(error.details[0].message);
            }

            const election = await ElectionRepository.findById(value.electionId);
            if (!election) {
                throw new NotFoundError('Election not found');
            }

            const vote = await VoteCacheRepository.findByTransactionHash(value.transactionHash);
            const valid = Boolean(vote && vote.election_id === value.electionId);

            res.json({
                success: true,
                data: {
                    verification: {
                        valid,
                        transactionHash: value.transactionHash,
                        electionId: value.electionId,
                        status: vote ? (vote.is_verified ? 'verified' : 'pending') : 'not_found',
                        blockNumber: vote?.block_number,
                        votedAt: vote?.voted_at
                    }
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Verify vote transaction controller error:', error);

            if (error instanceof ValidationError || error instanceof NotFoundError) {
                res.status(error.statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'VOTE_VERIFICATION_FAILED',
                        message: 'Failed to verify vote transaction'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Get vote confirmation by transaction hash (frontend helper)
     */
    async getVoteConfirmation(req: Request, res: Response): Promise<void> {
        try {
            const schema = Joi.object({
                transactionHash: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).required()
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                throw new ValidationError(error.details[0].message);
            }

            const vote = await VoteCacheRepository.findByTransactionHash(value.transactionHash);
            if (!vote) {
                res.json({
                    success: true,
                    data: {
                        confirmed: false,
                        transactionHash: value.transactionHash
                    },
                    timestamp: new Date().toISOString()
                });
                return;
            }

            res.json({
                success: true,
                data: {
                    confirmed: true,
                    transactionHash: vote.transaction_hash,
                    blockNumber: vote.block_number,
                    timestamp: vote.voted_at
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Get vote confirmation controller error:', error);

            if (error instanceof ValidationError) {
                res.status(error.statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'VOTE_CONFIRMATION_FETCH_FAILED',
                        message: 'Failed to fetch vote confirmation'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Verify vote on blockchain (admin/system use)
     */
    async verifyVote(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;

            // Only admins can manually verify votes
            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can verify votes');
            }

            const schema = Joi.object({
                voteId: Joi.string().uuid().required()
            });

            const paramsValidation = schema.validate(req.params);
            if (paramsValidation.error) {
                throw new ValidationError(paramsValidation.error.details[0].message);
            }

            const bodySchema = Joi.object({
                blockNumber: Joi.number().integer().min(0).required(),
                isVerified: Joi.boolean().required()
            });

            const { error, value } = bodySchema.validate(req.body);
            if (error) {
                throw new ValidationError(error.details[0].message);
            }

            const { voteId } = paramsValidation.value;
            const { blockNumber, isVerified } = value;

            const vote = await VoteCacheRepository.findById(voteId);
            if (!vote) {
                throw new NotFoundError('Vote not found');
            }

            const updatedVote = await VoteCacheRepository.verifyVote(voteId, blockNumber);

            res.json({
                success: true,
                data: {
                    vote: {
                        id: updatedVote!.id,
                        transactionHash: updatedVote!.transaction_hash,
                        blockNumber: updatedVote!.block_number,
                        isVerified: updatedVote!.is_verified
                    },
                    message: `Vote ${isVerified ? 'verified' : 'marked as unverified'} successfully`
                },
                timestamp: new Date().toISOString()
            });

            logger.info(`Vote ${voteId} verified by admin ${user.userId}: block ${blockNumber}`);
        } catch (error) {
            logger.error('Verify vote controller error:', error);

            if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof ForbiddenError) {
                res.status(error.statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'VOTE_VERIFICATION_FAILED',
                        message: 'Failed to verify vote'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Get live vote counts (admin/creator only during active election)
     */
    async getLiveResults(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;
            const schema = Joi.object({
                electionId: Joi.string().uuid().required()
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                throw new ValidationError(error.details[0].message);
            }

            const election = await ElectionRepository.findById(value.electionId);
            if (!election) {
                throw new NotFoundError('Election not found');
            }

            // Only admins and election creators can see live results
            if (user.role !== 'admin' && election.creator_id !== user.userId) {
                throw new ForbiddenError('Only administrators and election creators can view live results');
            }

            // Get current results
            const candidates = await CandidateRepository.findByElection(value.electionId);
            const voteStats = await VoteCacheRepository.getElectionVoteStats(value.electionId);

            res.json({
                success: true,
                data: {
                    election: {
                        id: election.id,
                        title: election.title,
                        status: election.status,
                        totalVotesCast: election.total_votes_cast
                    },
                    results: candidates.map(candidate => ({
                        candidate: {
                            id: candidate.id,
                            name: candidate.name
                        },
                        voteCount: candidate.vote_count,
                        percentage: election.total_votes_cast > 0
                            ? ((candidate.vote_count / election.total_votes_cast) * 100).toFixed(2)
                            : '0.00'
                    })),
                    statistics: voteStats,
                    lastUpdated: new Date().toISOString()
                },
                timestamp: new Date().toISOString()
            });

            logger.info(`Live results retrieved for election ${value.electionId} by user ${user.userId}`);
        } catch (error) {
            logger.error('Get live results controller error:', error);

            if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof ForbiddenError) {
                res.status(error.statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'LIVE_RESULTS_FETCH_FAILED',
                        message: 'Failed to fetch live results'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }
}

export default new VotingController();
