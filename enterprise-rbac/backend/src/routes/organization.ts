import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth';
import { requirePermission } from '../middlewares/rbac';
import { validate } from '../middlewares/validate';
import {
  companyController,
  branchController,
  locationController,
  departmentController,
  teamController,
  designationController,
} from '../controllers/organizationController';
import {
  companyValidator,
  branchValidator,
  locationValidator,
  departmentValidator,
  teamValidator,
  designationValidator,
} from '../validators/organization.validators';

function buildResourceRouter(
  resource: string,
  controller: typeof companyController,
  validators: any[]
) {
  const router = Router();
  router.use(authenticateJWT);

  router.get('/', requirePermission(resource, 'read'), controller.list);
  router.get('/:id', requirePermission(resource, 'read'), controller.getById);
  router.post('/', requirePermission(resource, 'create'), validators, validate, controller.create);
  router.put('/:id', requirePermission(resource, 'edit'), validators, validate, controller.update);
  router.delete('/:id', requirePermission(resource, 'delete'), controller.remove);

  return router;
}

const router = Router();

router.use('/companies', buildResourceRouter('companies', companyController, companyValidator));
router.use('/branches', buildResourceRouter('branches', branchController, branchValidator));
router.use('/locations', buildResourceRouter('locations', locationController, locationValidator));
router.use('/departments', buildResourceRouter('departments', departmentController, departmentValidator));
router.use('/teams', buildResourceRouter('teams', teamController, teamValidator));
router.use('/designations', buildResourceRouter('designations', designationController, designationValidator));

export default router;
