import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';

export const getDashboardStats = asyncHandler(async (_req: Request, res: Response) => {
  const [totalUsers, activeUsers, totalRoles, totalPermissionGroups, totalCompanies, totalBranches, recentAudit] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.role.count(),
      prisma.permissionGroup.count(),
      prisma.company.count(),
      prisma.branch.count(),
      prisma.auditLog.findMany({
        take: 10,
        orderBy: { timestamp: 'desc' },
        include: { user: { select: { fullName: true, username: true } } },
      }),
    ]);

  res.json({
    totalUsers,
    activeUsers,
    totalRoles,
    totalPermissionGroups,
    totalCompanies,
    totalBranches,
    recentActivity: recentAudit,
  });
});
