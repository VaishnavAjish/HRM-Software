import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { recordAudit } from '../utils/audit';
import { userService } from '../services/userService';

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '20', search = '', roleId, departmentId, locationId, companyId, branchId, status } =
    req.query as Record<string, string>;

  const result = await userService.list({
    page: Number(page),
    limit: Number(limit),
    search,
    filters: { roleId, departmentId, locationId, companyId, branchId, status },
  });

  res.json(result);
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const user = await userService.getById(id);
  res.json(user);
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.create(req.body);
  await recordAudit({ req, action: 'CREATE', resource: 'users', resourceId: user.id, newValues: { ...req.body, password: undefined } });
  res.status(201).json(user);
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const before = await userService.getById(id);
  const user = await userService.update(id, req.body);
  await recordAudit({
    req,
    action: 'UPDATE',
    resource: 'users',
    resourceId: user.id,
    oldValues: before,
    newValues: { ...req.body, password: undefined },
  });
  res.json(user);
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const before = await userService.getById(id);
  await userService.remove(id);
  await recordAudit({ req, action: 'DELETE', resource: 'users', resourceId: id, oldValues: before });
  res.status(204).send();
});

export const setUserPermissionOverrides = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const user = await userService.setPermissionOverrides(id, req.body.overrides ?? []);
  await recordAudit({ req, action: 'ASSIGN', resource: 'user_permissions', resourceId: id, newValues: req.body.overrides });
  res.json(user);
});

export const unlockUser = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const user = await userService.unlockAccount(id);
  await recordAudit({ req, action: 'UPDATE', resource: 'users', resourceId: id, newValues: { unlocked: true } });
  res.json(user);
});
