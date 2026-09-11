import { Router } from 'express';
import healthRoutes from './health.routes';

const router = Router();

router.use('/health', healthRoutes);

// Phase 2+:
// router.use('/auth', authRoutes);
// router.use('/employees', employeeRoutes);
// router.use('/projects', projectRoutes);
// router.use('/tasks', taskRoutes);
// router.use('/bugs', bugRoutes);
// router.use('/client-issues', clientIssueRoutes);
// router.use('/ai', aiAgentRoutes);
// router.use('/approvals', approvalRoutes);
// router.use('/ai-usage', aiUsageRoutes);
// router.use('/aws-usage', awsUsageRoutes);
// router.use('/reports', reportRoutes);
// router.use('/audit-logs', auditLogRoutes);

export default router;
