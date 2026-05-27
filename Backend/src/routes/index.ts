import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import electionRoutes from './elections';
import votingRoutes from './voting';
import analyticsRoutes from './analytics';
import websocketRoutes from './websocket';
import monitoringRoutes from './monitoring';
import blockchainRoutes from './blockchain';

const router = Router();

// Mount route modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/elections', electionRoutes);
router.use('/voting', votingRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/websocket', websocketRoutes);
router.use('/monitoring', monitoringRoutes);
router.use('/blockchain', blockchainRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'Advanced Voting Platform API'
    }
  });
});

export default router;
