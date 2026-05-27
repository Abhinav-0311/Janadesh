import { Router } from 'express';
import MonitoringController from '../controllers/MonitoringController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// All monitoring routes require authentication and admin role
router.use(authenticate);
router.use(requireRole(['admin']));

// System health monitoring
router.get('/health', MonitoringController.getSystemHealth);
router.get('/system', MonitoringController.getSystemHealth);

// Performance metrics
router.get('/performance', MonitoringController.getPerformanceMetrics);

// Application logs
router.get('/logs', MonitoringController.getApplicationLogs);

// Administrative dashboard data
router.get('/dashboard', MonitoringController.getDashboardData);

// System configuration
router.get('/config', MonitoringController.getSystemConfiguration);

export default router;