import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import employeeRoutes from './employee.routes';
import projectRoutes from './project.routes';
import taskRoutes from './task.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/employees', employeeRoutes);
router.use('/projects', projectRoutes);
router.use('/tasks', taskRoutes);

// Phase 3.4+:
// router.use('/bugs', bugRoutes);
// router.use('/client-issues', clientIssueRoutes);
// router.use('/ai', aiAgentRoutes);
// router.use('/approvals', approvalRoutes);
// router.use('/ai-usage', aiUsageRoutes);
// router.use('/aws-usage', awsUsageRoutes);
// router.use('/reports', reportRoutes);
// router.use('/audit-logs', auditLogRoutes);

export default router;
