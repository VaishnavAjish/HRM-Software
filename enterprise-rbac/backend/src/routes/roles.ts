import { Router } from 'express';
import { getRoles, getRoleById, createRole, updateRole, deleteRole } from '../controllers/roleController';
import { authenticateJWT } from '../middlewares/auth';
import { requirePermission } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { roleValidator } from '../validators/role.validators';

const router = Router();

router.use(authenticateJWT);

router.get('/', requirePermission('roles', 'read'), getRoles);
router.get('/:id', requirePermission('roles', 'read'), getRoleById);
router.post('/', requirePermission('roles', 'create'), roleValidator, validate, createRole);
router.put('/:id', requirePermission('roles', 'edit'), roleValidator, validate, updateRole);
router.delete('/:id', requirePermission('roles', 'delete'), deleteRole);

export default router;
