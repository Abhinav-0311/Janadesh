import { Router } from 'express';
import AnalyticsController from '../controllers/AnalyticsController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// All analytics routes require authentication
router.use(authenticate);

// System statistics (admin only)
router.get('/system', requireRole(['admin']), AnalyticsController.getSystemAnalytics);

// Legacy analytics endpoints (admin only)
router.get('/elections', requireRole(['admin']), AnalyticsController.getElectionStatistics);
router.get('/votes', requireRole(['admin']), AnalyticsController.getVoteAnalytics);
router.get('/users', requireRole(['admin']), AnalyticsController.getUserAnalytics);
router.get('/dashboard', requireRole(['admin']), AnalyticsController.getDashboardAnalytics);

// Voting patterns (admin only)
router.get('/patterns', requireRole(['admin']), AnalyticsController.getVotingPatterns);

// User engagement metrics (admin only)
router.get('/engagement', requireRole(['admin']), AnalyticsController.getUserEngagement);

// Election-specific analytics (admin, creator, or after election ends)
router.get('/elections/:electionId', AnalyticsController.getElectionAnalytics);

// Export election data (admin/creator only)
router.get('/elections/:electionId/export', AnalyticsController.exportElectionData);

// Real-time statistics for admin dashboard (admin only)
router.get('/realtime', requireRole(['admin']), AnalyticsController.getRealtimeStats);

// System alerts and notifications (admin only)
router.get('/alerts', requireRole(['admin']), AnalyticsController.getSystemAlerts);

export default router;
