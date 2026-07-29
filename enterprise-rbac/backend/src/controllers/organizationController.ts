import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { recordAudit } from '../utils/audit';
import {
  companyService,
  branchService,
  locationService,
  departmentService,
  teamService,
  designationService,
} from '../services/organizationService';

type CrudService = typeof companyService;

function buildControllers(service: CrudService, resource: string) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const { page = '1', limit = '20', search = '', ...filters } = req.query as Record<string, string>;
      const result = await service.list({ page: Number(page), limit: Number(limit), search, filters });
      res.json(result);
    }),

    getById: asyncHandler(async (req: Request, res: Response) => {
      const record = await service.getById(req.params.id as string);
      res.json(record);
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const record = await service.create(req.body);
      await recordAudit({ req, action: 'CREATE', resource, resourceId: record.id, newValues: req.body });
      res.status(201).json(record);
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
      const id = req.params.id as string;
      const before = await service.getById(id);
      const record = await service.update(id, req.body);
      await recordAudit({ req, action: 'UPDATE', resource, resourceId: record.id, oldValues: before, newValues: req.body });
      res.json(record);
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      const id = req.params.id as string;
      const before = await service.getById(id);
      await service.remove(id);
      await recordAudit({ req, action: 'DELETE', resource, resourceId: id, oldValues: before });
      res.status(204).send();
    }),
  };
}

export const companyController = buildControllers(companyService, 'companies');
export const branchController = buildControllers(branchService, 'branches');
export const locationController = buildControllers(locationService, 'locations');
export const departmentController = buildControllers(departmentService, 'departments');
export const teamController = buildControllers(teamService, 'teams');
export const designationController = buildControllers(designationService, 'designations');
