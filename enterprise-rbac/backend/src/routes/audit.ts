import { Router } from 'express';
import { getAuditLogs, getLoginHistory, getSessions, revokeSession } from '../controllers/auditController';
import { authenticateJWT } from '../middlewares/auth';
import { requirePermission } from '../middlewares/rbac';

const router = Router();

router.use(authenticateJWT);

router.get('/logs', requirePermission('audit_logs', 'read'), getAuditLogs);
router.get('/login-history', requirePermission('audit_logs', 'read'), getLoginHistory);
router.get('/sessions', requirePermission('sessions', 'read'), getSessions);
router.delete('/sessions/:id', requirePermission('sessions', 'delete'), revokeSession);

export default router;
