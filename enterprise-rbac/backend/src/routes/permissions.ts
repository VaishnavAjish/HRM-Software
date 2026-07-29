import { Router } from 'express';
import {
  getPermissions,
  getPermissionById,
  createPermission,
  updatePermission,
  deletePermission,
  getPermissionGroups,
  createPermissionGroup,
  updatePermissionGroup,
  deletePermissionGroup,
} from '../controllers/permissionController';
import { authenticateJWT } from '../middlewares/auth';
import { requirePermission } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { permissionValidator, permissionGroupValidator } from '../validators/permission.validators';

const router = Router();

router.use(authenticateJWT);

router.get('/groups', requirePermission('permission_groups', 'read'), getPermissionGroups);
router.post('/groups', requirePermission('permission_groups', 'create'), permissionGroupValidator, validate, createPermissionGroup);
router.put('/groups/:id', requirePermission('permission_groups', 'edit'), permissionGroupValidator, validate, updatePermissionGroup);
router.delete('/groups/:id', requirePermission('permission_groups', 'delete'), deletePermissionGroup);

router.get('/', requirePermission('permissions', 'read'), getPermissions);
router.get('/:id', requirePermission('permissions', 'read'), getPermissionById);
router.post('/', requirePermission('permissions', 'create'), permissionValidator, validate, createPermission);
router.put('/:id', requirePermission('permissions', 'edit'), permissionValidator, validate, updatePermission);
router.delete('/:id', requirePermission('permissions', 'delete'), deletePermission);

export default router;
