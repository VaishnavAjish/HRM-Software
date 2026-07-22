import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, requireAnyRole, canAccessBranch, canAccessDepartment, canManageAttendance } from '../middleware/role.middleware';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.middleware';
import { 
  checkInSchema, 
  checkOutSchema, 
  attendanceQuerySchema, 
  attendanceParamsSchema,
  bulkAttendanceSchema,
  attendanceReportSchema
} from '../validators/attendance.validator';
import * as attendanceController from '../controllers/attendance.controller';
import { UserRole } from '../models/User';

const router = Router();

router.use(authenticate);

router.get('/', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(attendanceQuerySchema), 
  attendanceController.getAttendance
);

router.post('/check-in', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateBody(checkInSchema), 
  attendanceController.checkIn
);

router.post('/check-out', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateBody(checkOutSchema), 
  attendanceController.checkOut
);

router.post('/break', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  attendanceController.addBreak
);

router.post('/break/end', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  attendanceController.endBreak
);

router.post('/overtime', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  attendanceController.requestOvertime
);

router.put('/overtime/approve', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  attendanceController.approveOvertime
);

router.post('/bulk', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(bulkAttendanceSchema), 
  attendanceController.bulkUploadAttendance
);

router.get('/report', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(attendanceReportSchema), 
  attendanceController.getAttendanceReport
);

router.get('/stats', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  attendanceController.getAttendanceStats
);

router.get('/employee/:employeeId', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(attendanceParamsSchema), 
  canAccessBranch,
  canAccessDepartment,
  attendanceController.getEmployeeAttendance
);

router.put('/:id', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(attendanceParamsSchema), 
  attendanceController.updateAttendance
);

router.put('/:id/approve', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(attendanceParamsSchema), 
  canManageAttendance,
  attendanceController.approveAttendance
);

export default router;