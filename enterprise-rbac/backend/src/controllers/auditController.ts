import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';

export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '25', resource, userId, action } = req.query as Record<string, string>;
  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  const where: any = {
    ...(resource && { resource }),
    ...(userId && { userId }),
    ...(action && { action }),
  };

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (pageNumber - 1) * limitNumber,
      take: limitNumber,
      include: { user: { select: { id: true, fullName: true, username: true } } },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ data, meta: { total, page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) || 1 } });
});

export const getLoginHistory = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '25', userId, status } = req.query as Record<string, string>;
  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  const where: any = { ...(userId && { userId }), ...(status && { status }) };

  const [data, total] = await Promise.all([
    prisma.loginHistory.findMany({
      where,
      skip: (pageNumber - 1) * limitNumber,
      take: limitNumber,
      include: { user: { select: { id: true, fullName: true, username: true } } },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.loginHistory.count({ where }),
  ]);

  res.json({ data, meta: { total, page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) || 1 } });
});

export const getSessions = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '25', userId } = req.query as Record<string, string>;
  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  const where: any = { ...(userId && { userId }), isRevoked: false, expiresAt: { gt: new Date() } };

  const [data, total] = await Promise.all([
    prisma.session.findMany({
      where,
      skip: (pageNumber - 1) * limitNumber,
      take: limitNumber,
      include: { user: { select: { id: true, fullName: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.session.count({ where }),
  ]);

  res.json({ data, meta: { total, page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) || 1 } });
});

export const revokeSession = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await prisma.session.update({ where: { id }, data: { isRevoked: true } });
  res.status(204).send();
});
