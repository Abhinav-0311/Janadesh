import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import ElectionRepository from '../repositories/ElectionRepository';
import CandidateRepository from '../repositories/CandidateRepository';
import VoteCacheRepository from '../repositories/VoteCacheRepository';
import WebSocketManager from '../services/WebSocketManager';
import { ValidationError, NotFoundError, ForbiddenError } from '../types';
import logger from '../utils/logger';
import Joi from 'joi';

export class ElectionController {
  /**
   * Get all elections with filtering and pagination
   */
  async getAllElections(req: Request, res: Response): Promise<void> {
    try {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        status: Joi.string().valid('pending', 'active', 'ended', 'cancelled').optional(),
        type: Joi.string().valid('single_choice', 'multiple_choice', 'ranked_voting').optional(),
        isPublic: Joi.boolean().optional(),
        creatorId: Joi.string().uuid().optional(),
        search: Joi.string().max(100).optional()
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      // Get all elections for filtering
      const paginatedResult = await ElectionRepository.findAll({ page: 1, limit: 10000 });
      let elections = paginatedResult.data;

      // Apply filters
      if (value.status) {
        elections = elections.filter(election => election.status === value.status);
      }

      if (value.type) {
        elections = elections.filter(election => election.election_type === value.type);
      }

      if (value.isPublic !== undefined) {
        elections = elections.filter(election => election.is_public === value.isPublic);
      }

      if (value.creatorId) {
        elections = elections.filter(election => election.creator_id === value.creatorId);
      }

      if (value.search) {
        const searchTerm = value.search.toLowerCase();
        elections = elections.filter(election =>
          election.title.toLowerCase().includes(searchTerm) ||
          (election.description && election.description.toLowerCase().includes(searchTerm))
        );
      }

      // Implement pagination
      const startIndex = (value.page - 1) * value.limit;
      const endIndex = startIndex + value.limit;
      const paginatedElections = elections.slice(startIndex, endIndex);

      // Get candidates for each election
      const electionsWithCandidates = await Promise.all(
        paginatedElections.map(async (election) => {
          const candidates = await CandidateRepository.findByElection(election.id);
          return {
            ...election,
            candidateCount: candidates.length,
            candidates: candidates.map(candidate => ({
              id: candidate.id,
              name: candidate.name,
              description: candidate.description,
              imageUrl: candidate.image_url,
              position: candidate.position,
              voteCount: candidate.vote_count,
              isActive: candidate.is_active
            }))
          };
        })
      );

      res.json({
        success: true,
        data: {
          elections: electionsWithCandidates,
          pagination: {
            page: value.page,
            limit: value.limit,
            total: elections.length,
            totalPages: Math.ceil(elections.length / value.limit),
            hasNext: endIndex < elections.length,
            hasPrev: value.page > 1
          }
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Elections list retrieved with ${elections.length} results`);
    } catch (error) {
      logger.error('Get all elections controller error:', error);

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
            code: 'ELECTIONS_FETCH_FAILED',
            message: 'Failed to fetch elections'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Get election by ID with full details
   */
  async getElectionById(req: Request, res: Response): Promise<void> {
    try {
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

      // Check if election is private and user has access
      const user = (req as AuthenticatedRequest).user;
      if (!election.is_public) {
        // Only creator and admin can access private elections
        if (user.role !== 'admin' && election.creator_id !== user.userId) {
          throw new ForbiddenError('Access denied to private election');
        }
      }

      // Get candidates
      const candidates = await CandidateRepository.findByElection(election.id);

      // Get vote statistics
      const voteStats = await VoteCacheRepository.getElectionVoteStats(election.id);

      res.json({
        success: true,
        data: {
          election: {
            id: election.id,
            contract_address: election.contract_address,
            title: election.title,
            description: election.description,
            creator_id: election.creator_id,
            election_type: election.election_type,
            start_time: election.start_time,
            end_time: election.end_time,
            is_public: election.is_public,
            status: election.status,
            max_votes_per_voter: election.max_votes_per_voter,
            requires_registration: election.requires_registration,
            registration_deadline: election.registration_deadline,
            total_registered_voters: election.total_registered_voters,
            total_votes_cast: election.total_votes_cast,
            created_at: election.created_at,
            updated_at: election.updated_at
          },
          candidates: candidates.map(candidate => ({
            id: candidate.id,
            name: candidate.name,
            description: candidate.description,
            imageUrl: candidate.image_url,
            position: candidate.position,
            voteCount: candidate.vote_count,
            isActive: candidate.is_active
          })),
          statistics: voteStats
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Election details retrieved: ${election.id}`);
    } catch (error) {
      logger.error('Get election by ID controller error:', error);

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
            code: 'ELECTION_FETCH_FAILED',
            message: 'Failed to fetch election'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Create new election
   */
  async createElection(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthenticatedRequest).user;

      // Only creators and admins can create elections
      if (user.role !== 'creator' && user.role !== 'admin') {
        throw new ForbiddenError('Only creators and admins can create elections');
      }

      const schema = Joi.object({
        title: Joi.string().min(3).max(200).required(),
        description: Joi.string().max(1000).optional(),
        electionType: Joi.string().valid('single_choice', 'multiple_choice', 'ranked_voting').default('single_choice'),
        startTime: Joi.date().iso().required(),
        endTime: Joi.date().iso().greater(Joi.ref('startTime')).required(),
        isPublic: Joi.boolean().default(true),
        maxVotesPerVoter: Joi.number().integer().min(1).default(1),
        requiresRegistration: Joi.boolean().default(false),
        registrationDeadline: Joi.date().iso().when('requiresRegistration', {
          is: true,
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        candidates: Joi.array().items(
          Joi.object({
            name: Joi.string().min(1).max(200).required(),
            description: Joi.string().max(500).optional(),
            imageUrl: Joi.string().uri().optional()
          })
        ).min(1).required()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      const startTime = new Date(value.startTime);
      const endTime = new Date(value.endTime);
      const now = new Date();
      let computedStatus: 'pending' | 'active' | 'ended' = 'pending';
      if (endTime <= now) {
        computedStatus = 'ended';
      } else if (startTime <= now) {
        computedStatus = 'active';
      }

      // Create election (contract address will be set later by blockchain service)
      const election = await ElectionRepository.create({
        contract_address: undefined, // Will be updated after contract deployment
        title: value.title,
        description: value.description,
        creator_id: user.userId,
        election_type: value.electionType,
        start_time: startTime,
        end_time: endTime,
        is_public: value.isPublic,
        status: computedStatus,
        max_votes_per_voter: value.maxVotesPerVoter,
        requires_registration: value.requiresRegistration,
        registration_deadline: value.registrationDeadline ? new Date(value.registrationDeadline) : undefined,
        total_registered_voters: 0,
        total_votes_cast: 0
      });

      // Create candidates
      const candidates = await Promise.all(
        value.candidates.map(async (candidateData: any, index: number) => {
          return await CandidateRepository.create({
            election_id: election.id,
            name: candidateData.name,
            description: candidateData.description,
            image_url: candidateData.imageUrl,
            position: index + 1,
            vote_count: 0,
            is_active: true
          });
        })
      );

      res.status(201).json({
        success: true,
        data: {
          election: {
            id: election.id,
            title: election.title,
            description: election.description,
            creator_id: election.creator_id,
            election_type: election.election_type,
            start_time: election.start_time,
            end_time: election.end_time,
            is_public: election.is_public,
            status: election.status,
            created_at: election.created_at
          },
          candidates: candidates.map(candidate => ({
            id: candidate.id,
            election_id: candidate.election_id,
            name: candidate.name,
            description: candidate.description,
            imageUrl: candidate.image_url,
            position: candidate.position
          })),
          message: 'Election created successfully. Smart contract deployment will be initiated.'
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Election created: ${election.id} by user ${user.userId}`);
    } catch (error: any) {
      logger.error('Create election controller error:', error);

      if (error instanceof ValidationError || error instanceof ForbiddenError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      } else {
        // Handle database and other errors with descriptive messages
        const errorMessage = error.message || 'Failed to create election';
        const errorCode = error.code || 'ELECTION_CREATION_FAILED';

        res.status(500).json({
          success: false,
          error: {
            code: errorCode,
            message: `Failed to create election: ${errorMessage}`
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Update election
   */
  async updateElection(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthenticatedRequest).user;
      const schema = Joi.object({
        electionId: Joi.string().uuid().required()
      });

      const paramsValidation = schema.validate(req.params);
      if (paramsValidation.error) {
        throw new ValidationError(paramsValidation.error.details[0].message);
      }

      const { electionId } = paramsValidation.value;

      // Get existing election
      const election = await ElectionRepository.findById(electionId);
      if (!election) {
        throw new NotFoundError('Election not found');
      }

      // Check permissions
      if (user.role !== 'admin' && election.creator_id !== user.userId) {
        throw new ForbiddenError('You can only update your own elections');
      }

      // Cannot update active or ended elections
      if (election.status === 'active' || election.status === 'ended') {
        throw new ValidationError('Cannot update active or ended elections');
      }

      const updateSchema = Joi.object({
        title: Joi.string().min(3).max(200).optional(),
        description: Joi.string().max(1000).optional(),
        startTime: Joi.date().iso().greater('now').optional(),
        endTime: Joi.date().iso().optional(),
        isPublic: Joi.boolean().optional(),
        maxVotesPerVoter: Joi.number().integer().min(1).optional(),
        requiresRegistration: Joi.boolean().optional(),
        registrationDeadline: Joi.date().iso().optional()
      });

      const { error, value } = updateSchema.validate(req.body);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      // Validate end time is after start time
      const startTime = value.startTime ? new Date(value.startTime) : election.start_time;
      const endTime = value.endTime ? new Date(value.endTime) : election.end_time;

      if (endTime <= startTime) {
        throw new ValidationError('End time must be after start time');
      }

      // Only include defined values in update
      const updateData: any = {};
      if (value.title !== undefined) updateData.title = value.title;
      if (value.description !== undefined) updateData.description = value.description;
      if (value.startTime !== undefined) updateData.start_time = new Date(value.startTime);
      if (value.endTime !== undefined) updateData.end_time = new Date(value.endTime);
      if (value.isPublic !== undefined) updateData.is_public = value.isPublic;
      if (value.maxVotesPerVoter !== undefined) updateData.max_votes_per_voter = value.maxVotesPerVoter;
      if (value.requiresRegistration !== undefined) updateData.requires_registration = value.requiresRegistration;
      if (value.registrationDeadline !== undefined) updateData.registration_deadline = new Date(value.registrationDeadline);

      const updatedElection = await ElectionRepository.update(electionId, updateData);

      res.json({
        success: true,
        data: {
          election: {
            id: updatedElection!.id,
            title: updatedElection!.title,
            description: updatedElection!.description,
            startTime: updatedElection!.start_time,
            endTime: updatedElection!.end_time,
            isPublic: updatedElection!.is_public,
            status: updatedElection!.status,
            updatedAt: updatedElection!.updated_at
          },
          message: 'Election updated successfully'
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Election updated: ${electionId} by user ${user.userId}`);
    } catch (error: any) {
      logger.error('Update election controller error:', error);

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
        // Handle database and other errors with descriptive messages
        const errorMessage = error.message || 'Failed to update election';
        const errorCode = error.code || 'ELECTION_UPDATE_FAILED';

        res.status(500).json({
          success: false,
          error: {
            code: errorCode,
            message: `Failed to update election: ${errorMessage}`
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Delete election
   */
  async deleteElection(req: Request, res: Response): Promise<void> {
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

      // Only admins can delete elections
      if (user.role !== 'admin') {
        throw new ForbiddenError('Only administrators can delete elections');
      }

      // Cannot delete active elections
      if (election.status === 'active') {
        throw new ValidationError('Cannot delete active elections');
      }

      // Hard delete election and related rows via FK cascades
      await ElectionRepository.delete(value.electionId);

      res.json({
        success: true,
        data: {
          message: 'Election deleted successfully'
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Election deleted: ${value.electionId} by user ${user.userId}`);
    } catch (error) {
      logger.error('Delete election controller error:', error);

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
            code: 'ELECTION_DELETE_FAILED',
            message: 'Failed to delete election'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Get election results
   */
  async getElectionResults(req: Request, res: Response): Promise<void> {
    try {
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

      // Results are only available after election ends or for admins
      const user = (req as AuthenticatedRequest).user;
      const isAdmin = user?.role === 'admin';
      const isCreator = user?.userId === election.creator_id;
      const electionEnded = election.status === 'ended' || new Date() > election.end_time;

      if (!electionEnded && !isAdmin && !isCreator) {
        throw new ForbiddenError('Results are only available after the election ends');
      }

      // Get candidates with vote counts
      const results = await CandidateRepository.getElectionResults(value.electionId);

      // Get detailed vote statistics
      const voteStats = await VoteCacheRepository.getElectionVoteStats(value.electionId);

      // Get voting activity
      const votingActivity = await VoteCacheRepository.getVotingActivity(value.electionId, 'hour');

      res.json({
        success: true,
        data: {
          election: {
            id: election.id,
            title: election.title,
            status: election.status,
            startTime: election.start_time,
            endTime: election.end_time,
            totalVotesCast: election.total_votes_cast
          },
          results: results.map((candidate, index) => ({
            position: index + 1,
            candidate: {
              id: candidate.id,
              name: candidate.name,
              description: candidate.description,
              imageUrl: candidate.image_url
            },
            voteCount: candidate.vote_count,
            percentage: election.total_votes_cast > 0
              ? ((candidate.vote_count / election.total_votes_cast) * 100).toFixed(2)
              : '0.00'
          })),
          candidates: results.map(candidate => ({
            id: candidate.id,
            election_id: candidate.election_id,
            name: candidate.name,
            description: candidate.description,
            image_url: candidate.image_url,
            vote_count: candidate.vote_count,
            is_active: candidate.is_active,
            position: candidate.position
          })),
          statistics: {
            ...voteStats,
            votingActivity
          },
          isLive: election.status === 'active' && (isAdmin || isCreator)
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Election results retrieved: ${value.electionId}`);
    } catch (error) {
      logger.error('Get election results controller error:', error);

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
            code: 'RESULTS_FETCH_FAILED',
            message: 'Failed to fetch election results'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Get active elections
   */
  async getActiveElections(req: Request, res: Response): Promise<void> {
    try {
      const elections = await ElectionRepository.findActiveElections();

      const electionsWithCandidates = await Promise.all(
        elections.map(async (election) => {
          const candidates = await CandidateRepository.findByElection(election.id);
          return {
            id: election.id,
            title: election.title,
            description: election.description,
            electionType: election.election_type,
            startTime: election.start_time,
            endTime: election.end_time,
            isPublic: election.is_public,
            is_public: election.is_public,
            totalVotesCast: election.total_votes_cast,
            candidateCount: candidates.length
          };
        })
      );

      res.json({
        success: true,
        data: {
          elections: electionsWithCandidates,
          count: electionsWithCandidates.length
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Active elections retrieved: ${electionsWithCandidates.length} found`);
    } catch (error) {
      logger.error('Get active elections controller error:', error);

      res.status(500).json({
        success: false,
        error: {
          code: 'ACTIVE_ELECTIONS_FETCH_FAILED',
          message: 'Failed to fetch active elections'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get upcoming elections
   */
  async getUpcomingElections(req: Request, res: Response): Promise<void> {
    try {
      const elections = await ElectionRepository.findUpcomingElections();

      const electionsWithCandidates = await Promise.all(
        elections.map(async (election) => {
          const candidates = await CandidateRepository.findByElection(election.id);
          return {
            id: election.id,
            title: election.title,
            description: election.description,
            electionType: election.election_type,
            startTime: election.start_time,
            endTime: election.end_time,
            isPublic: election.is_public,
            requiresRegistration: election.requires_registration,
            registrationDeadline: election.registration_deadline,
            candidateCount: candidates.length
          };
        })
      );

      res.json({
        success: true,
        data: {
          elections: electionsWithCandidates,
          count: electionsWithCandidates.length
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Upcoming elections retrieved: ${electionsWithCandidates.length} found`);
    } catch (error) {
      logger.error('Get upcoming elections controller error:', error);

      res.status(500).json({
        success: false,
        error: {
          code: 'UPCOMING_ELECTIONS_FETCH_FAILED',
          message: 'Failed to fetch upcoming elections'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Helper method to broadcast election status changes via WebSocket
   */
  private broadcastElectionStatusChange(election: any, newStatus: string): void {
    try {
      const wsManager = WebSocketManager.getInstance();
      wsManager.broadcastElectionStatus({
        electionId: election.id,
        status: newStatus as 'pending' | 'active' | 'ended' | 'cancelled',
        startTime: election.start_time?.toISOString(),
        endTime: election.end_time?.toISOString(),
        title: election.title
      });
    } catch (error) {
      logger.warn('Failed to broadcast election status change:', error);
      // Don't fail the operation if WebSocket fails
    }
  }

  /**
   * Update election status (admin only)
   */
  async updateElectionStatus(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthenticatedRequest).user;
      const schema = Joi.object({
        electionId: Joi.string().uuid().required()
      });

      const paramsValidation = schema.validate(req.params);
      if (paramsValidation.error) {
        throw new ValidationError(paramsValidation.error.details[0].message);
      }

      const bodySchema = Joi.object({
        status: Joi.string().valid('pending', 'active', 'ended', 'cancelled').required()
      });

      const { error, value } = bodySchema.validate(req.body);
      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      const { electionId } = paramsValidation.value;
      const { status } = value;

      // Get existing election
      const election = await ElectionRepository.findById(electionId);
      if (!election) {
        throw new NotFoundError('Election not found');
      }

      // Check permissions - only admin or creator can change status
      if (user.role !== 'admin' && election.creator_id !== user.userId) {
        throw new ForbiddenError('You can only update your own elections');
      }

      // Validate status transitions
      const validTransitions: { [key: string]: string[] } = {
        'pending': ['active', 'cancelled'],
        'active': ['ended', 'cancelled'],
        'ended': [], // Cannot change from ended
        'cancelled': ['pending'] // Can reactivate cancelled elections
      };

      if (!validTransitions[election.status]?.includes(status)) {
        throw new ValidationError(`Cannot change status from ${election.status} to ${status}`);
      }

      // Update election status
      const updatedElection = await ElectionRepository.update(electionId, { status });

      // Broadcast status change via WebSocket
      this.broadcastElectionStatusChange(updatedElection, status);

      res.json({
        success: true,
        data: {
          election: {
            id: updatedElection!.id,
            title: updatedElection!.title,
            status: updatedElection!.status,
            startTime: updatedElection!.start_time,
            endTime: updatedElection!.end_time,
            updatedAt: updatedElection!.updated_at
          },
          message: `Election status updated to ${status}`
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Election status updated: ${electionId} changed to ${status} by user ${user.userId}`);
    } catch (error) {
      logger.error('Update election status controller error:', error);

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
            code: 'STATUS_UPDATE_FAILED',
            message: 'Failed to update election status'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Add candidate to an election
   */
  async addCandidate(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthenticatedRequest).user;
      const paramsSchema = Joi.object({
        electionId: Joi.string().uuid().required()
      });

      const { error: paramsError, value: params } = paramsSchema.validate(req.params);
      if (paramsError) {
        throw new ValidationError(paramsError.details[0].message);
      }

      const bodySchema = Joi.object({
        name: Joi.string().min(1).max(200).required(),
        description: Joi.string().max(500).optional(),
        imageUrl: Joi.string().uri().optional()
      });

      const { error: bodyError, value } = bodySchema.validate(req.body);
      if (bodyError) {
        throw new ValidationError(bodyError.details[0].message);
      }

      const election = await ElectionRepository.findById(params.electionId);
      if (!election) {
        throw new NotFoundError('Election not found');
      }

      if (user.role !== 'admin' && election.creator_id !== user.userId) {
        throw new ForbiddenError('You can only manage your own elections');
      }

      if (election.status === 'active' || election.status === 'ended') {
        throw new ValidationError('Cannot add candidates to active or ended elections');
      }

      const nextPosition = await CandidateRepository.getNextPosition(params.electionId);
      const candidate = await CandidateRepository.create({
        election_id: params.electionId,
        name: value.name,
        description: value.description,
        image_url: value.imageUrl,
        position: nextPosition,
        vote_count: 0,
        is_active: true
      });

      res.status(201).json({
        success: true,
        data: {
          candidate: {
            id: candidate.id,
            election_id: candidate.election_id,
            name: candidate.name,
            description: candidate.description,
            image_url: candidate.image_url,
            imageUrl: candidate.image_url,
            position: candidate.position,
            vote_count: candidate.vote_count,
            is_active: candidate.is_active
          },
          message: 'Candidate added successfully'
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Candidate added to election ${params.electionId} by user ${user.userId}`);
    } catch (error) {
      logger.error('Add candidate controller error:', error);

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
            code: 'CANDIDATE_CREATE_FAILED',
            message: 'Failed to add candidate'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Update candidate in an election
   */
  async updateCandidate(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthenticatedRequest).user;
      const paramsSchema = Joi.object({
        electionId: Joi.string().uuid().required(),
        candidateId: Joi.string().uuid().required()
      });

      const { error: paramsError, value: params } = paramsSchema.validate(req.params);
      if (paramsError) {
        throw new ValidationError(paramsError.details[0].message);
      }

      const bodySchema = Joi.object({
        name: Joi.string().min(1).max(200).optional(),
        description: Joi.string().allow('').max(500).optional(),
        imageUrl: Joi.string().allow('').uri().optional(),
        isActive: Joi.boolean().optional()
      }).min(1);

      const { error: bodyError, value } = bodySchema.validate(req.body);
      if (bodyError) {
        throw new ValidationError(bodyError.details[0].message);
      }

      const election = await ElectionRepository.findById(params.electionId);
      if (!election) {
        throw new NotFoundError('Election not found');
      }

      const candidate = await CandidateRepository.findById(params.candidateId);
      if (!candidate || candidate.election_id !== params.electionId) {
        throw new NotFoundError('Candidate not found');
      }

      if (user.role !== 'admin' && election.creator_id !== user.userId) {
        throw new ForbiddenError('You can only manage your own elections');
      }

      if (election.status === 'active' || election.status === 'ended') {
        throw new ValidationError('Cannot update candidates in active or ended elections');
      }

      const updateData: any = {};
      if (value.name !== undefined) updateData.name = value.name;
      if (value.description !== undefined) updateData.description = value.description;
      if (value.imageUrl !== undefined) updateData.image_url = value.imageUrl || null;
      if (value.isActive !== undefined) updateData.is_active = value.isActive;

      const updatedCandidate = await CandidateRepository.update(params.candidateId, updateData);
      if (!updatedCandidate) {
        throw new NotFoundError('Candidate not found');
      }

      res.json({
        success: true,
        data: {
          candidate: {
            id: updatedCandidate.id,
            election_id: updatedCandidate.election_id,
            name: updatedCandidate.name,
            description: updatedCandidate.description,
            image_url: updatedCandidate.image_url,
            imageUrl: updatedCandidate.image_url,
            position: updatedCandidate.position,
            vote_count: updatedCandidate.vote_count,
            is_active: updatedCandidate.is_active
          },
          message: 'Candidate updated successfully'
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Candidate ${params.candidateId} updated in election ${params.electionId} by user ${user.userId}`);
    } catch (error) {
      logger.error('Update candidate controller error:', error);

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
            code: 'CANDIDATE_UPDATE_FAILED',
            message: 'Failed to update candidate'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Delete candidate from an election
   */
  async deleteCandidate(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthenticatedRequest).user;
      const paramsSchema = Joi.object({
        electionId: Joi.string().uuid().required(),
        candidateId: Joi.string().uuid().required()
      });

      const { error: paramsError, value: params } = paramsSchema.validate(req.params);
      if (paramsError) {
        throw new ValidationError(paramsError.details[0].message);
      }

      const election = await ElectionRepository.findById(params.electionId);
      if (!election) {
        throw new NotFoundError('Election not found');
      }

      const candidate = await CandidateRepository.findById(params.candidateId);
      if (!candidate || candidate.election_id !== params.electionId) {
        throw new NotFoundError('Candidate not found');
      }

      if (user.role !== 'admin' && election.creator_id !== user.userId) {
        throw new ForbiddenError('You can only manage your own elections');
      }

      if (election.status === 'active' || election.status === 'ended') {
        throw new ValidationError('Cannot delete candidates from active or ended elections');
      }

      const deleted = await CandidateRepository.delete(params.candidateId);
      if (!deleted) {
        throw new NotFoundError('Candidate not found');
      }

      res.json({
        success: true,
        data: {
          message: 'Candidate deleted successfully'
        },
        timestamp: new Date().toISOString()
      });

      logger.info(`Candidate ${params.candidateId} deleted from election ${params.electionId} by user ${user.userId}`);
    } catch (error) {
      logger.error('Delete candidate controller error:', error);

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
            code: 'CANDIDATE_DELETE_FAILED',
            message: 'Failed to delete candidate'
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }
}

export default new ElectionController();
