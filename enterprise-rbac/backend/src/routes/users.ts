import { Router } from 'express';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  setUserPermissionOverrides,
  unlockUser,
} from '../controllers/userController';
import { authenticateJWT } from '../middlewares/auth';
import { requirePermission } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import { createUserValidator, updateUserValidator, permissionOverridesValidator } from '../validators/user.validators';

const router = Router();

router.use(authenticateJWT);

router.get('/', requirePermission('users', 'read'), getUsers);
router.get('/:id', requirePermission('users', 'read'), getUserById);
router.post('/', requirePermission('users', 'create'), createUserValidator, validate, createUser);
router.put('/:id', requirePermission('users', 'edit'), updateUserValidator, validate, updateUser);
router.delete('/:id', requirePermission('users', 'delete'), deleteUser);

router.put(
  '/:id/permissions',
  requirePermission('users', 'edit'),
  permissionOverridesValidator,
  validate,
  setUserPermissionOverrides
);
router.post('/:id/unlock', requirePermission('users', 'edit'), unlockUser);

export default router;
