import { Router } from 'express';
import ElectionController from '../controllers/ElectionController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// Public routes (no authentication required)
router.get('/public', ElectionController.getActiveElections);
router.get('/upcoming', ElectionController.getUpcomingElections);

// Protected routes (authentication required)
router.use(authenticate);

// Get all elections with filtering
router.get('/', ElectionController.getAllElections);

// Get specific election by ID
router.get('/:electionId', ElectionController.getElectionById);

// Get election results
router.get('/:electionId/results', ElectionController.getElectionResults);

// Create new election (creators and admins only)
router.post('/', requireRole(['creator', 'admin']), ElectionController.createElection);
router.post('/:electionId/candidates', requireRole(['creator', 'admin']), ElectionController.addCandidate);
router.put('/:electionId/candidates/:candidateId', requireRole(['creator', 'admin']), ElectionController.updateCandidate);
router.delete('/:electionId/candidates/:candidateId', requireRole(['creator', 'admin']), ElectionController.deleteCandidate);

// Update election (creators and admins only, own elections or admin)
router.put('/:electionId', requireRole(['creator', 'admin']), ElectionController.updateElection);

// Delete/cancel election (creators and admins only, own elections or admin)
router.delete('/:electionId', requireRole(['creator', 'admin']), ElectionController.deleteElection);

// Update election status (creators and admins only, own elections or admin)
router.patch('/:electionId/status', requireRole(['creator', 'admin']), ElectionController.updateElectionStatus);

export default router;
