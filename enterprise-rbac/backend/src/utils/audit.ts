import { Request } from 'express';
import { prisma } from '../config/db';

interface AuditParams {
  req: Request;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'ASSIGN' | 'REVOKE';
  resource: string;
  resourceId: string;
  oldValues?: unknown;
  newValues?: unknown;
  userId?: string;
}

export async function recordAudit({ req, action, resource, resourceId, oldValues, newValues, userId }: AuditParams) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? req.user?.id ?? null,
        action,
        resource,
        resourceId,
        oldValues: oldValues === undefined ? undefined : (oldValues as any),
        newValues: newValues === undefined ? undefined : (newValues as any),
        ipAddress: req.ip,
      },
    });
  } catch (err) {
    console.error('Failed to record audit log:', err);
  }
}
