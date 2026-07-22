import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, requireAnyRole, canAccessBranch } from '../middleware/role.middleware';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.middleware';
import { 
  createBranchSchema, 
  updateBranchSchema, 
  branchQuerySchema, 
  branchParamsSchema,
  branchIdSchema 
} from '../validators/branch.validator';
import * as branchController from '../controllers/branch.controller';
import { UserRole } from '../models/User';

const router = Router();

router.use(authenticate);

router.get('/', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(branchQuerySchema), 
  branchController.getBranches
);

router.post('/', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createBranchSchema), 
  branchController.createBranch
);

router.get('/:id', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(branchParamsSchema), 
  canAccessBranch,
  branchController.getBranchById
);

router.put('/:id', 
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(branchParamsSchema), 
  validateBody(updateBranchSchema),
  canAccessBranch,
  branchController.updateBranch
);

router.delete('/:id', 
  authorize(UserRole.ADMIN),
  validateParams(branchParamsSchema),
  branchController.deleteBranch
);

router.get('/:id/stats', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(branchParamsSchema),
  canAccessBranch,
  branchController.getBranchStats
);

router.get('/:id/hierarchy', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(branchParamsSchema),
  branchController.getBranchHierarchy
);

router.get('/managers/list', 
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  branchController.getBranchManagers
);

export default router;