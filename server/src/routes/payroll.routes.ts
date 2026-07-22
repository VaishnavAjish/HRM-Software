import { Router } from 'express';
import { UserRole } from '../models/User';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, requireAnyRole } from '../middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware';
import payrollController from '../controllers/payroll.controller';
import { 
  salaryStructureSchema,
  updateSalaryStructureSchema,
  salaryStructureQuerySchema,
  salaryStructureParamsSchema,
  payrollComponentSchema,
  updatePayrollComponentSchema,
  payrollComponentQuerySchema,
  payrollComponentParamsSchema,
  payrollRunIdSchema,
} from '../validators/payroll.validator';

const router = Router();

router.use(authenticate);

const canViewSalary = (req: any, res: any, next: any) => next();

// Salary Structures
router.get('/structures', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(salaryStructureQuerySchema),
  payrollController.getSalaryStructures
);

router.post('/structures', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(salaryStructureSchema),
  payrollController.createSalaryStructure
);

router.get('/structures/:id', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(salaryStructureParamsSchema),
  payrollController.getPayrollById
);

router.put('/structures/:id', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(salaryStructureParamsSchema),
  validateBody(updateSalaryStructureSchema),
  payrollController.updatePayroll
);

router.delete('/structures/:id', 
  authorize(UserRole.ADMIN),
  validateParams(salaryStructureParamsSchema),
  payrollController.deletePayroll
);

// Salary Components
router.get('/components/list', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(payrollComponentQuerySchema),
  payrollController.getSalaryComponents
);

router.post('/components', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(payrollComponentSchema),
  payrollController.createSalaryComponent
);

router.get('/components/:id', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(payrollComponentParamsSchema),
  payrollController.getPayrollById
);

router.put('/components/:id', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(payrollComponentParamsSchema),
  validateBody(updatePayrollComponentSchema),
  payrollController.updatePayroll
);

router.delete('/components/:id', 
  authorize(UserRole.ADMIN),
  validateParams(payrollComponentParamsSchema),
  payrollController.deletePayroll
);

// Employee Payroll History
router.get('/employee/:employeeId', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.EMPLOYEE),
  canViewSalary,
  payrollController.getEmployeePayrollHistory
);

export default router;