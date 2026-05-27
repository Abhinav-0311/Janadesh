import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import ElectionRepository from '../repositories/ElectionRepository';
import CandidateRepository from '../repositories/CandidateRepository';
import VoteCacheRepository from '../repositories/VoteCacheRepository';
import UserRepository from '../repositories/UserRepository';
import VoterEligibilityRepository from '../repositories/VoterEligibilityRepository';
import { ValidationError, ForbiddenError } from '../types';
import logger from '../utils/logger';
import Joi from 'joi';
import database from '../config/database';
import config from '../config';

export class AnalyticsController {
    /**
     * Get system overview statistics (admin only)
     */
    async getSystemStats(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;

            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access system statistics');
            }

            // Get statistics from all repositories
            const [
                electionStats,
                userStats,
                candidateStats,
                eligibilityStats
            ] = await Promise.all([
                ElectionRepository.getElectionStats(),
                UserRepository.getUserStats(),
                CandidateRepository.getCandidateStats(),
                VoterEligibilityRepository.getEligibilityStats()
            ]);

            // Get recent activity
            const recentVotes = await VoteCacheRepository.getRecentVotes(10);

            res.json({
                success: true,
                data: {
                    overview: {
                        totalElections: electionStats.total,
                        activeElections: electionStats.active,
                        totalUsers: userStats.total,
                        totalVotes: electionStats.total_votes,
                        systemUptime: process.uptime()
                    },
                    elections: electionStats,
                    users: userStats,
                    candidates: candidateStats,
                    eligibility: eligibilityStats,
                    recentActivity: {
                        recentVotes: recentVotes.map(vote => ({
                            id: vote.id,
                            voterUsername: (vote as any).username || 'Unknown',
                            electionTitle: (vote as any).election_title || 'Unknown',
                            candidateName: (vote as any).candidate_name || 'Unknown',
                            votedAt: vote.voted_at,
                            isVerified: vote.is_verified
                        }))
                    }
                },
                timestamp: new Date().toISOString()
            });

            logger.info(`System statistics retrieved by admin ${user.userId}`);
        } catch (error) {
            logger.error('Get system stats controller error:', error);

            if (error instanceof ForbiddenError) {
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
                        code: 'SYSTEM_STATS_FAILED',
                        message: 'Failed to fetch system statistics'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Get system analytics (admin only) - simplified version for tests
     */
    async getSystemAnalytics(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;

            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access system analytics');
            }

            // Get basic metrics plus legacy dashboard sections for compatibility
            const [electionStats, userStats, candidateStats, eligibilityStats, recentVotes, dbHealth] = await Promise.all([
                ElectionRepository.getElectionStats(),
                UserRepository.getUserStats(),
                CandidateRepository.getCandidateStats(),
                VoterEligibilityRepository.getEligibilityStats(),
                VoteCacheRepository.getRecentVotes(10),
                database.healthCheck()
            ]);

            const metrics = {
                totalUsers: userStats.total || 0,
                totalElections: electionStats.total || 0,
                activeElections: electionStats.active || 0,
                totalVotes: electionStats.total_votes || 0,
                uptime: process.uptime(),
                systemUptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                databaseConnections: {
                    total: dbHealth.totalConnections,
                    idle: dbHealth.idleConnections,
                    waiting: dbHealth.waitingConnections
                },
                timestamp: new Date().toISOString()
            };

            res.json({
                success: true,
                data: {
                    // Current analytics contract
                    metrics,
                    blockchain: {
                        connected: Boolean(config.blockchain.rpcUrl),
                        networkId: config.blockchain.network
                    },
                    // Legacy analytics contract used by enhanced/comprehensive suites
                    overview: {
                        totalElections: electionStats.total || 0,
                        activeElections: electionStats.active || 0,
                        totalUsers: userStats.total || 0,
                        totalVotes: electionStats.total_votes || 0,
                        systemUptime: process.uptime()
                    },
                    elections: electionStats,
                    users: userStats,
                    candidates: candidateStats,
                    eligibility: eligibilityStats,
                    recentActivity: {
                        recentVotes: recentVotes.map(vote => ({
                            id: vote.id,
                            voterUsername: (vote as any).username || 'Unknown',
                            electionTitle: (vote as any).election_title || 'Unknown',
                            candidateName: (vote as any).candidate_name || 'Unknown',
                            votedAt: vote.voted_at,
                            isVerified: vote.is_verified
                        }))
                    },
                },
                timestamp: new Date().toISOString()
            });

            logger.info(`System analytics retrieved by admin ${user.userId}`);
        } catch (error) {
            logger.error('Get system analytics controller error:', error);

            if (error instanceof ForbiddenError) {
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
                        code: 'ANALYTICS_FETCH_FAILED',
                        message: 'Failed to fetch system analytics'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Legacy endpoint: get aggregate election statistics (admin only)
     */
    async getElectionStatistics(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;
            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access election statistics');
            }

            const schema = Joi.object({
                startDate: Joi.date().iso().optional(),
                endDate: Joi.date().iso().optional()
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                throw new ValidationError(error.details[0].message);
            }

            if (value.startDate && value.endDate && new Date(value.startDate) > new Date(value.endDate)) {
                throw new ValidationError('"startDate" must be less than or equal to "endDate"');
            }

            let whereClause = '';
            const params: unknown[] = [];

            if (value.startDate && value.endDate) {
                whereClause = 'WHERE created_at BETWEEN $1 AND $2';
                params.push(new Date(value.startDate), new Date(value.endDate));
            } else if (value.startDate) {
                whereClause = 'WHERE created_at >= $1';
                params.push(new Date(value.startDate));
            } else if (value.endDate) {
                whereClause = 'WHERE created_at <= $1';
                params.push(new Date(value.endDate));
            }

            const result = await database.query(
                `SELECT
                    COUNT(*)::int AS total_elections,
                    COUNT(*) FILTER (WHERE status = 'active')::int AS active_elections,
                    COUNT(*) FILTER (WHERE status = 'ended')::int AS completed_elections,
                    COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_elections
                 FROM elections
                 ${whereClause}`,
                params
            ) as any;

            const row = result.rows[0] || {
                total_elections: 0,
                active_elections: 0,
                completed_elections: 0,
                pending_elections: 0
            };

            res.json({
                success: true,
                data: {
                    statistics: {
                        totalElections: row.total_elections || 0,
                        activeElections: row.active_elections || 0,
                        completedElections: row.completed_elections || 0,
                        pendingElections: row.pending_elections || 0
                    }
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Get election statistics controller error:', error);

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
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to fetch election statistics'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Legacy endpoint: vote analytics (admin only)
     */
    async getVoteAnalytics(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;
            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access vote analytics');
            }

            const schema = Joi.object({
                electionId: Joi.string().uuid().optional(),
                includeTrends: Joi.boolean().truthy('true').falsy('false').default(false),
                page: Joi.number().integer().min(1).default(1),
                limit: Joi.number().integer().min(1).max(1000).default(50)
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                throw new ValidationError(error.details[0].message);
            }

            const whereClause = value.electionId ? 'WHERE election_id = $1' : '';
            const params: unknown[] = value.electionId ? [value.electionId] : [];

            const statsResult = await database.query(
                `SELECT
                    COUNT(*)::int AS total_votes,
                    COUNT(*) FILTER (WHERE is_verified = true)::int AS verified_votes,
                    COUNT(*) FILTER (WHERE is_verified = false)::int AS unverified_votes,
                    COUNT(DISTINCT voter_id)::int AS unique_voters
                 FROM votes_cache
                 ${whereClause}`,
                params
            ) as any;

            const stats = statsResult.rows[0] || {
                total_votes: 0,
                verified_votes: 0,
                unverified_votes: 0,
                unique_voters: 0
            };

            let trends: Array<{ period: string; voteCount: number }> = [];
            if (value.includeTrends) {
                const trendsResult = await database.query(
                    `SELECT
                        DATE_TRUNC('hour', voted_at) AS period,
                        COUNT(*)::int AS vote_count
                     FROM votes_cache
                     ${whereClause}
                     GROUP BY DATE_TRUNC('hour', voted_at)
                     ORDER BY period DESC
                     LIMIT 24`,
                    params
                ) as any;

                trends = trendsResult.rows.map((row: any) => ({
                    period: row.period,
                    voteCount: row.vote_count
                }));
            }

            res.json({
                success: true,
                data: {
                    statistics: {
                        totalVotes: stats.total_votes || 0,
                        verifiedVotes: stats.verified_votes || 0,
                        unverifiedVotes: stats.unverified_votes || 0,
                        uniqueVoters: stats.unique_voters || 0
                    },
                    trends,
                    pagination: {
                        page: value.page,
                        limit: value.limit,
                        total: stats.total_votes || 0
                    }
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Get vote analytics controller error:', error);

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
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to fetch vote analytics'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Legacy endpoint: user analytics (admin only)
     */
    async getUserAnalytics(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;
            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access user analytics');
            }

            const schema = Joi.object({
                includeTrends: Joi.boolean().truthy('true').falsy('false').default(false)
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                throw new ValidationError(error.details[0].message);
            }

            const userStats = await UserRepository.getUserStats();

            let registrationTrends: Array<{ date: string; count: number }> = [];
            if (value.includeTrends) {
                const trendsResult = await database.query(
                    `SELECT
                        DATE(created_at) AS date,
                        COUNT(*)::int AS count
                     FROM users
                     WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
                     GROUP BY DATE(created_at)
                     ORDER BY date DESC`
                ) as any;

                registrationTrends = trendsResult.rows.map((row: any) => ({
                    date: row.date,
                    count: row.count
                }));
            }

            res.json({
                success: true,
                data: {
                    statistics: {
                        totalUsers: userStats.total,
                        verifiedUsers: userStats.verified,
                        activeUsers: userStats.voted,
                        roleDistribution: {
                            admin: userStats.by_role?.admin || 0,
                            creator: userStats.by_role?.creator || 0,
                            voter: userStats.by_role?.voter || 0
                        }
                    },
                    registrationTrends
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Get user analytics controller error:', error);

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
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to fetch user analytics'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Legacy endpoint: dashboard analytics (admin only)
     */
    async getDashboardAnalytics(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;
            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access dashboard analytics');
            }

            const [electionStats, userStats, recentVotes] = await Promise.all([
                ElectionRepository.getElectionStats(),
                UserRepository.getUserStats(),
                VoteCacheRepository.getRecentVotes(10)
            ]);

            const summary = {
                elections: {
                    total: electionStats.total,
                    active: electionStats.active,
                    pending: electionStats.pending,
                    ended: electionStats.ended
                },
                votes: {
                    total: electionStats.total_votes,
                    registrations: electionStats.total_registrations
                },
                users: {
                    total: userStats.total,
                    verified: userStats.verified,
                    voted: userStats.voted
                },
                system: {
                    uptime: process.uptime(),
                    timestamp: new Date().toISOString()
                }
            };

            const recentActivity = recentVotes.map((vote: any) => ({
                id: vote.id,
                type: 'vote_cast',
                electionId: vote.election_id,
                candidateId: vote.candidate_id,
                votedAt: vote.voted_at
            }));

            const alerts: Array<{ level: string; message: string }> = [];

            res.json({
                success: true,
                data: {
                    summary,
                    recentActivity,
                    alerts
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Get dashboard analytics controller error:', error);

            if (error instanceof ForbiddenError) {
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
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to fetch dashboard analytics'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Get election analytics
     */
    async getElectionAnalytics(req: Request, res: Response): Promise<void> {
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
                res.status(404).json({
                    success: false,
                    error: {
                        code: 'ELECTION_NOT_FOUND',
                        message: 'Election not found'
                    },
                    timestamp: new Date().toISOString()
                });
                return;
            }

            // Check permissions - only admin, creator, or after election ends
            const isAdmin = user.role === 'admin';
            const isCreator = election.creator_id === user.userId;
            const electionEnded = election.status === 'ended' || new Date() > election.end_time;

            if (!isAdmin && !isCreator && !electionEnded) {
                throw new ForbiddenError('Analytics are only available to administrators, creators, or after the election ends');
            }

            // Get comprehensive analytics
            const [
                voteStats,
                candidateStats,
                eligibilityStats,
                votingActivity
            ] = await Promise.all([
                VoteCacheRepository.getElectionVoteStats(value.electionId),
                CandidateRepository.getCandidateStats(value.electionId),
                VoterEligibilityRepository.getEligibilityStats(value.electionId),
                VoteCacheRepository.getVotingActivity(value.electionId, 'hour')
            ]);

            // Get candidate results
            const candidates = await CandidateRepository.getElectionResults(value.electionId);

            const candidateResults = candidates.map((candidate, index) => ({
                position: index + 1,
                id: candidate.id,
                name: candidate.name,
                voteCount: candidate.vote_count,
                percentage: election.total_votes_cast > 0
                    ? ((candidate.vote_count / election.total_votes_cast) * 100).toFixed(2)
                    : '0.00'
            }));

            res.json({
                success: true,
                data: {
                    election: {
                        id: election.id,
                        title: election.title,
                        status: election.status,
                        startTime: election.start_time,
                        endTime: election.end_time,
                        totalRegisteredVoters: election.total_registered_voters,
                        totalVotesCast: election.total_votes_cast
                    },
                    voting: {
                        ...voteStats,
                        turnoutRate: election.total_registered_voters > 0
                            ? ((voteStats.verified_votes / election.total_registered_voters) * 100).toFixed(2)
                            : '0.00'
                    },
                    candidates: {
                        ...candidateStats,
                        results: candidateResults
                    },
                    eligibility: eligibilityStats,
                    activity: {
                        votingPattern: votingActivity,
                        peakVotingHour: votingActivity.length > 0
                            ? votingActivity.reduce((max, current) =>
                                current.vote_count > max.vote_count ? current : max
                            )
                            : null
                    },
                    // Legacy response contract used by older test suites/clients.
                    analytics: {
                        totalVotes: voteStats.total_votes,
                        verifiedVotes: voteStats.verified_votes,
                        unverifiedVotes: voteStats.unverified_votes,
                        uniqueVoters: voteStats.unique_voters,
                        candidateResults,
                        votingPatterns: votingActivity,
                        timeDistribution: votingActivity
                    }
                },
                timestamp: new Date().toISOString()
            });

            logger.info(`Election analytics retrieved for ${value.electionId} by user ${user.userId}`);
        } catch (error) {
            logger.error('Get election analytics controller error:', error);

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
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'ELECTION_ANALYTICS_FAILED',
                        message: 'Failed to fetch election analytics'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Get voting patterns and trends
     */
    async getVotingPatterns(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;

            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access voting patterns');
            }

            const schema = Joi.object({
                timeframe: Joi.string().valid('hour', 'day', 'week').default('day'),
                electionId: Joi.string().uuid().optional()
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                throw new ValidationError(error.details[0].message);
            }

            let votingActivity;
            if (value.electionId) {
                votingActivity = await VoteCacheRepository.getVotingActivity(value.electionId, value.timeframe);
            } else {
                // Get system-wide voting activity (would need to implement this method)
                votingActivity = [];
            }

            // Get recent votes for pattern analysis
            const recentVotes = await VoteCacheRepository.getRecentVotes(50);

            // Analyze patterns
            const hourlyDistribution = new Array(24).fill(0);
            const dailyDistribution = new Array(7).fill(0);

            recentVotes.forEach(vote => {
                const voteDate = new Date(vote.voted_at);
                hourlyDistribution[voteDate.getHours()]++;
                dailyDistribution[voteDate.getDay()]++;
            });

            res.json({
                success: true,
                data: {
                    timeframe: value.timeframe,
                    electionId: value.electionId,
                    activity: votingActivity,
                    patterns: {
                        hourlyDistribution: hourlyDistribution.map((count, hour) => ({
                            hour,
                            count,
                            percentage: recentVotes.length > 0 ? ((count / recentVotes.length) * 100).toFixed(2) : '0.00'
                        })),
                        dailyDistribution: dailyDistribution.map((count, day) => ({
                            day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day],
                            count,
                            percentage: recentVotes.length > 0 ? ((count / recentVotes.length) * 100).toFixed(2) : '0.00'
                        }))
                    },
                    summary: {
                        totalVotesAnalyzed: recentVotes.length,
                        peakHour: hourlyDistribution.indexOf(Math.max(...hourlyDistribution)),
                        peakDay: dailyDistribution.indexOf(Math.max(...dailyDistribution))
                    }
                },
                timestamp: new Date().toISOString()
            });

            logger.info(`Voting patterns retrieved by admin ${user.userId}`);
        } catch (error) {
            logger.error('Get voting patterns controller error:', error);

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
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'VOTING_PATTERNS_FAILED',
                        message: 'Failed to fetch voting patterns'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Get user engagement metrics (admin only)
     */
    async getUserEngagement(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;

            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access user engagement metrics');
            }

            const schema = Joi.object({
                period: Joi.string().valid('week', 'month', 'quarter', 'year').default('month')
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                throw new ValidationError(error.details[0].message);
            }

            // Calculate date range based on period
            const now = new Date();
            let startDate = new Date();

            switch (value.period) {
                case 'week':
                    startDate.setDate(now.getDate() - 7);
                    break;
                case 'month':
                    startDate.setMonth(now.getMonth() - 1);
                    break;
                case 'quarter':
                    startDate.setMonth(now.getMonth() - 3);
                    break;
                case 'year':
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
            }

            // Get user statistics
            const userStats = await UserRepository.getUserStats();

            // Get engagement metrics (simplified version)
            const engagementMetrics = {
                totalUsers: userStats.total,
                activeUsers: userStats.verified, // Users who have verified their accounts
                votersWhoVoted: userStats.voted,
                newRegistrations: userStats.total, // Would need date filtering in real implementation
                engagementRate: userStats.total > 0 ? ((userStats.voted / userStats.total) * 100).toFixed(2) : '0.00'
            };

            res.json({
                success: true,
                data: {
                    period: value.period,
                    dateRange: {
                        start: startDate.toISOString(),
                        end: now.toISOString()
                    },
                    engagement: engagementMetrics,
                    userBreakdown: {
                        byRole: {
                            voters: userStats.by_role?.voter || 0,
                            creators: userStats.by_role?.creator || 0,
                            admins: userStats.by_role?.admin || 0
                        },
                        byStatus: {
                            eligible: userStats.eligible,
                            voted: userStats.voted,
                            lockedOut: userStats.locked_out,
                            suspended: 0 // Not available in current stats
                        },
                        byVerification: {
                            verified: userStats.verified,
                            unverified: userStats.total - userStats.verified
                        }
                    }
                },
                timestamp: new Date().toISOString()
            });

            logger.info(`User engagement metrics retrieved by admin ${user.userId} for period ${value.period}`);
        } catch (error) {
            logger.error('Get user engagement controller error:', error);

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
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'USER_ENGAGEMENT_FAILED',
                        message: 'Failed to fetch user engagement metrics'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Get real-time system statistics for admin dashboard
     */
    async getRealtimeStats(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;

            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access real-time statistics');
            }

            // Get current system statistics
            const [
                electionStats,
                userStats,
                recentActivity
            ] = await Promise.all([
                ElectionRepository.getElectionStats(),
                UserRepository.getUserStats(),
                VoteCacheRepository.getRecentVotes(5)
            ]);

            // Calculate real-time metrics
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            const realtimeData = {
                timestamp: now.toISOString(),
                overview: {
                    activeElections: electionStats.active,
                    totalUsers: userStats.total,
                    totalVotes: electionStats.total_votes,
                    systemUptime: process.uptime()
                },
                activity: {
                    recentVotes: recentActivity.length,
                    lastVoteTime: recentActivity.length > 0 ? recentActivity[0].voted_at : null,
                    votesLastHour: recentActivity.filter(vote =>
                        new Date(vote.voted_at) > oneHourAgo
                    ).length,
                    votesLast24Hours: recentActivity.filter(vote =>
                        new Date(vote.voted_at) > oneDayAgo
                    ).length
                },
                elections: {
                    pending: electionStats.pending || 0,
                    active: electionStats.active || 0,
                    ended: electionStats.ended || 0,
                    total: electionStats.total || 0
                },
                users: {
                    total: userStats.total,
                    verified: userStats.verified,
                    eligible: userStats.eligible,
                    voted: userStats.voted
                }
            };

            res.json({
                success: true,
                data: realtimeData,
                timestamp: new Date().toISOString()
            });

            logger.info(`Real-time statistics retrieved by admin ${user.userId}`);
        } catch (error) {
            logger.error('Get real-time stats controller error:', error);

            if (error instanceof ForbiddenError) {
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
                        code: 'REALTIME_STATS_FAILED',
                        message: 'Failed to fetch real-time statistics'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Get system alerts and notifications for admin dashboard
     */
    async getSystemAlerts(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as AuthenticatedRequest).user;

            if (user.role !== 'admin') {
                throw new ForbiddenError('Only administrators can access system alerts');
            }

            // Generate system alerts based on current conditions
            const alerts: any[] = [];
            const warnings: any[] = [];
            const info: any[] = [];

            // Check system health
            const [electionStats, userStats] = await Promise.all([
                ElectionRepository.getElectionStats(),
                UserRepository.getUserStats()
            ]);

            // Memory usage alert
            const memoryUsage = process.memoryUsage();
            const heapUtilization = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

            if (heapUtilization > 90) {
                alerts.push({
                    id: 'high-memory-usage',
                    level: 'error',
                    title: 'High Memory Usage',
                    message: `Heap memory utilization is at ${heapUtilization.toFixed(1)}%`,
                    timestamp: new Date().toISOString(),
                    action: 'Consider restarting the application or investigating memory leaks'
                });
            } else if (heapUtilization > 75) {
                warnings.push({
                    id: 'elevated-memory-usage',
                    level: 'warning',
                    title: 'Elevated Memory Usage',
                    message: `Heap memory utilization is at ${heapUtilization.toFixed(1)}%`,
                    timestamp: new Date().toISOString(),
                    action: 'Monitor memory usage closely'
                });
            }

            // Active elections alert
            if (electionStats.active > 10) {
                warnings.push({
                    id: 'many-active-elections',
                    level: 'warning',
                    title: 'High Number of Active Elections',
                    message: `${electionStats.active} elections are currently active`,
                    timestamp: new Date().toISOString(),
                    action: 'Monitor system performance during high activity'
                });
            }

            // User growth info
            if (userStats.total > 0) {
                info.push({
                    id: 'user-stats',
                    level: 'info',
                    title: 'User Statistics',
                    message: `${userStats.total} total users, ${userStats.verified} verified`,
                    timestamp: new Date().toISOString(),
                    action: null
                });
            }

            const alertsData = {
                timestamp: new Date().toISOString(),
                summary: {
                    total: alerts.length + warnings.length + info.length,
                    errors: alerts.length,
                    warnings: warnings.length,
                    info: info.length
                },
                alerts: {
                    errors: alerts,
                    warnings: warnings,
                    info: info
                }
            };

            res.json({
                success: true,
                data: alertsData,
                timestamp: new Date().toISOString()
            });

            logger.info(`System alerts retrieved by admin ${user.userId}`);
        } catch (error) {
            logger.error('Get system alerts controller error:', error);

            if (error instanceof ForbiddenError) {
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
                        code: 'SYSTEM_ALERTS_FAILED',
                        message: 'Failed to fetch system alerts'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Export election data (admin/creator only)
     */
    async exportElectionData(req: Request, res: Response): Promise<void> {
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
                res.status(404).json({
                    success: false,
                    error: {
                        code: 'ELECTION_NOT_FOUND',
                        message: 'Election not found'
                    },
                    timestamp: new Date().toISOString()
                });
                return;
            }

            // Check permissions
            const isAdmin = user.role === 'admin';
            const isCreator = election.creator_id === user.userId;

            if (!isAdmin && !isCreator) {
                throw new ForbiddenError('Only administrators and election creators can export election data');
            }

            // Get all election data
            const [candidates, votes, voteStats] = await Promise.all([
                CandidateRepository.findByElection(value.electionId, false),
                VoteCacheRepository.findByElection(value.electionId, true), // Only verified votes
                VoteCacheRepository.getElectionVoteStats(value.electionId)
            ]);

            const exportData = {
                election: {
                    id: election.id,
                    title: election.title,
                    description: election.description,
                    electionType: election.election_type,
                    startTime: election.start_time,
                    endTime: election.end_time,
                    status: election.status,
                    totalVotesCast: election.total_votes_cast,
                    exportedAt: new Date().toISOString(),
                    exportedBy: user.userId
                },
                candidates: candidates.map(candidate => ({
                    id: candidate.id,
                    name: candidate.name,
                    description: candidate.description,
                    position: candidate.position,
                    voteCount: candidate.vote_count,
                    isActive: candidate.is_active
                })),
                statistics: voteStats,
                votes: votes.map(vote => ({
                    id: vote.id,
                    candidateId: vote.candidate_id,
                    transactionHash: vote.transaction_hash,
                    blockNumber: vote.block_number,
                    votedAt: vote.voted_at,
                    isVerified: vote.is_verified
                    // Note: voter_id and voter_address are excluded for privacy
                }))
            };

            res.json({
                success: true,
                data: exportData,
                timestamp: new Date().toISOString()
            });

            logger.info(`Election data exported for ${value.electionId} by user ${user.userId}`);
        } catch (error) {
            logger.error('Export election data controller error:', error);

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
                res.status(500).json({
                    success: false,
                    error: {
                        code: 'EXPORT_FAILED',
                        message: 'Failed to export election data'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    }
}

export default new AnalyticsController();
