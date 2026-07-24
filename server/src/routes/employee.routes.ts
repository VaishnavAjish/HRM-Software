import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, requireAnyRole, canAccessBranch, canAccessDepartment, canManageResource } from '../middleware/role.middleware';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.middleware';
import { 
  createEmployeeSchema, 
  updateEmployeeSchema, 
  employeeQuerySchema, 
  employeeParamsSchema,
  employeeIdSchema 
} from '../validators/employee.validator';
import * as employeeController from '../controllers/employee.controller';
import { UserRole } from '../models/User';

const router = Router();

router.use(authenticate);

router.get('/', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(employeeQuerySchema), 
  employeeController.getEmployees
);

router.post('/', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createEmployeeSchema), 
  employeeController.createEmployee
);

router.get('/:id', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(employeeParamsSchema), 
  canAccessBranch,
  canAccessDepartment,
  employeeController.getEmployeeById
);

router.put('/:id', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(employeeParamsSchema), 
  validateBody(updateEmployeeSchema),
  canAccessBranch,
  canAccessDepartment,
  employeeController.updateEmployee
);

router.delete('/:id', 
  authorize(UserRole.ADMIN),
  validateParams(employeeParamsSchema),
  employeeController.deleteEmployee
);

router.get('/:employeeId/documents', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.EMPLOYEE),
  validateParams(employeeIdSchema),
  employeeController.getEmployeeDocuments
);

router.post('/:employeeId/documents', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(employeeIdSchema),
  employeeController.uploadDocument
);

router.get('/:employeeId/leave-balance', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(employeeIdSchema),
  employeeController.getLeaveBalance
);

router.get('/:employeeId/attendance', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(employeeIdSchema),
  employeeController.getAttendance
);

router.get('/:employeeId/payroll', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(employeeIdSchema),
  employeeController.getPayroll
);

router.get('/:employeeId/reporting-manager', 
  validateParams(employeeParamsSchema),
  employeeController.getReportingManager
);

router.get('/:employeeId/direct-reports', 
  validateParams(employeeParamsSchema),
  employeeController.getDirectReports
);

export default router;