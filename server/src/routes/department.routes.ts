import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, requireAnyRole } from '../middleware/role.middleware';
import * as departmentController from '../controllers/department.controller';
import { UserRole } from '../models/User';

const router = Router();

router.use(authenticate);

router.get('/', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  departmentController.getDepartments
);

router.post('/', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  departmentController.createDepartment
);

router.get('/:id', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  departmentController.getDepartmentById
);

router.put('/:id', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  departmentController.updateDepartment
);

router.delete('/:id', 
  authorize(UserRole.ADMIN),
  departmentController.deleteDepartment
);

export default router;
