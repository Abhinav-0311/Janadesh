import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { BlockchainService } from '../services/blockchain';

const router = Router();

router.use(authenticate);

router.get('/status', async (_req, res) => {
  try {
    const blockchainService = BlockchainService.getInstance();
    const initialized = blockchainService.getInitializationStatus();

    if (!initialized) {
      res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Blockchain service is not available'
        },
        timestamp: new Date().toISOString()
      });
      return;
    }

    res.json({
      success: true,
      data: {
        initialized: true,
        network: blockchainService.getCurrentNetwork()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'Failed to fetch blockchain status'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
