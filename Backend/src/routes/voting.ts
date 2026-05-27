import { Router } from 'express';
import VotingController from '../controllers/VotingController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// All voting routes require authentication
router.use(authenticate);

// Preferred and legacy-compatible vote submission routes
router.post('/vote', VotingController.submitVote);
router.post('/submit', VotingController.submitVote);

// Preferred and legacy-compatible status/eligibility routes
router.get('/status/:electionId', VotingController.getVoteStatus);
router.get('/eligibility/:electionId', VotingController.checkEligibility);
router.get('/history', VotingController.getVotingHistory);

// User-facing vote verification helpers
router.post('/verify', VotingController.verifyVoteTransaction);
router.get('/confirmation/:transactionHash', VotingController.getVoteConfirmation);

// Submit a vote
router.post('/:electionId/vote', VotingController.submitVote);

// Get vote status for an election
router.get('/:electionId/status', VotingController.getVoteStatus);

// Check voter eligibility for an election
router.get('/:electionId/eligibility', VotingController.checkEligibility);

// Get live results (admin/creator only)
router.get('/:electionId/live-results', requireRole(['admin', 'creator']), VotingController.getLiveResults);

// Verify vote (admin only)
router.put('/votes/:voteId/verify', requireRole(['admin']), VotingController.verifyVote);

export default router;
