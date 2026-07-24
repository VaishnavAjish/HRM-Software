import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, requireAnyRole, canApproveLeaves } from '../middleware/role.middleware';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.middleware';
import { 
  createLeaveSchema, 
  updateLeaveSchema, 
  leaveQuerySchema, 
  leaveParamsSchema,
  approveLeaveSchema,
  cancelLeaveSchema,
  leaveBalanceQuerySchema,
  leaveTypeSchema,
  updateLeaveTypeSchema,
  leaveTypeQuerySchema,
  leaveTypeParamsSchema,
  leaveReportQuerySchema
} from '../validators/leave.validator';
import * as leaveController from '../controllers/leave.controller';
import { UserRole } from '../models/User';

const router = Router();

router.use(authenticate);

router.get('/', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(leaveQuerySchema), 
  leaveController.getLeaveRequests
);

router.post('/', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateBody(createLeaveSchema), 
  leaveController.createLeaveRequest
);

router.get('/stats', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(leaveReportQuerySchema),
  leaveController.getLeaveStats
);

router.get('/types', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(leaveTypeQuerySchema),
  leaveController.getLeaveTypes
);

router.post('/types', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(leaveTypeSchema), 
  leaveController.createLeaveType
);

router.get('/types/:id', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(leaveTypeParamsSchema),
  leaveController.getLeaveTypeById
);

router.put('/types/:id', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(leaveTypeParamsSchema), 
  validateBody(updateLeaveTypeSchema),
  leaveController.updateLeaveType
);

router.delete('/types/:id', 
  authorize(UserRole.ADMIN),
  validateParams(leaveTypeParamsSchema),
  leaveController.deleteLeaveType
);

router.get('/balance', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(leaveBalanceQuerySchema),
  leaveController.getLeaveBalances
);

router.get('/balance/:employeeId/:leaveTypeId', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  leaveController.getLeaveBalanceByType
);

router.post('/accrue', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  leaveController.accrueLeaveBalances
);

router.post('/carry-forward', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  leaveController.carryForwardLeaveBalances
);

router.get('/:id', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(leaveParamsSchema), 
  leaveController.getLeaveRequestById
);

router.put('/:id', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(leaveParamsSchema), 
  validateBody(updateLeaveSchema),
  leaveController.updateLeaveRequest
);

router.post('/:id/submit', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(leaveParamsSchema), 
  leaveController.submitLeaveRequest
);

router.post('/:id/approve-reject', 
  canApproveLeaves,
  validateParams(leaveParamsSchema),
  validateBody(approveLeaveSchema), 
  leaveController.approveRejectLeaveRequest
);

router.post('/:id/cancel', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(leaveParamsSchema), 
  validateBody(cancelLeaveSchema),
  leaveController.cancelLeaveRequest
);

export default router;