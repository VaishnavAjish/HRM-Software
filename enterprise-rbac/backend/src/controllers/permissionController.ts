import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { recordAudit } from '../utils/audit';
import { permissionService, permissionGroupService } from '../services/permissionService';

export const getPermissions = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '50', search = '', resource, groupId } = req.query as Record<string, string>;
  const result = await permissionService.list({ page: Number(page), limit: Number(limit), search, filters: { resource, groupId } });
  res.json(result);
});

export const getPermissionById = asyncHandler(async (req: Request, res: Response) => {
  const permission = await permissionService.getById(req.params.id as string);
  res.json(permission);
});

export const createPermission = asyncHandler(async (req: Request, res: Response) => {
  const permission = await permissionService.create(req.body);
  await recordAudit({ req, action: 'CREATE', resource: 'permissions', resourceId: permission.id, newValues: req.body });
  res.status(201).json(permission);
});

export const updatePermission = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const before = await permissionService.getById(id);
  const permission = await permissionService.update(id, req.body);
  await recordAudit({ req, action: 'UPDATE', resource: 'permissions', resourceId: id, oldValues: before, newValues: req.body });
  res.json(permission);
});

export const deletePermission = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const before = await permissionService.getById(id);
  await permissionService.remove(id);
  await recordAudit({ req, action: 'DELETE', resource: 'permissions', resourceId: id, oldValues: before });
  res.status(204).send();
});

export const getPermissionGroups = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '50', search = '' } = req.query as Record<string, string>;
  const result = await permissionGroupService.list({ page: Number(page), limit: Number(limit), search });
  res.json(result);
});

export const createPermissionGroup = asyncHandler(async (req: Request, res: Response) => {
  const group = await permissionGroupService.create(req.body);
  await recordAudit({ req, action: 'CREATE', resource: 'permission_groups', resourceId: group.id, newValues: req.body });
  res.status(201).json(group);
});

export const updatePermissionGroup = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const before = await permissionGroupService.getById(id);
  const group = await permissionGroupService.update(id, req.body);
  await recordAudit({ req, action: 'UPDATE', resource: 'permission_groups', resourceId: id, oldValues: before, newValues: req.body });
  res.json(group);
});

export const deletePermissionGroup = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const before = await permissionGroupService.getById(id);
  await permissionGroupService.remove(id);
  await recordAudit({ req, action: 'DELETE', resource: 'permission_groups', resourceId: id, oldValues: before });
  res.status(204).send();
});
