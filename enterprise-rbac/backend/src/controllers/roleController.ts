import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { recordAudit } from '../utils/audit';
import { roleService } from '../services/roleService';

export const getRoles = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '20', search = '' } = req.query as Record<string, string>;
  const result = await roleService.list({ page: Number(page), limit: Number(limit), search });
  res.json(result);
});

export const getRoleById = asyncHandler(async (req: Request, res: Response) => {
  const role = await roleService.getById(req.params.id as string);
  res.json(role);
});

export const createRole = asyncHandler(async (req: Request, res: Response) => {
  const role = await roleService.create(req.body);
  await recordAudit({ req, action: 'CREATE', resource: 'roles', resourceId: role.id, newValues: req.body });
  res.status(201).json(role);
});

export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const before = await roleService.getById(id);
  const role = await roleService.update(id, req.body);
  await recordAudit({ req, action: 'UPDATE', resource: 'roles', resourceId: id, oldValues: before, newValues: req.body });
  res.json(role);
});

export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const before = await roleService.getById(id);
  await roleService.remove(id);
  await recordAudit({ req, action: 'DELETE', resource: 'roles', resourceId: id, oldValues: before });
  res.status(204).send();
});
