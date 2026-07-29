import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/apiError';

const SUPER_ADMIN_ROLE = 'Super Admin';

function isSuperAdmin(user: any): boolean {
  return user.roles.some((ur: any) => ur.role.name === SUPER_ADMIN_ROLE);
}

/**
 * Resolves whether a user has a given `resource.action` permission, honoring
 * explicit UserPermission overrides (grant or revoke) over role-derived permissions.
 */
export function resolvePermission(user: any, resource: string, action: string): boolean {
  if (isSuperAdmin(user)) return true;

  const override = (user.permissions ?? []).find(
    (up: any) => up.permission.resource === resource && (up.permission.action === action || up.permission.action === '*')
  );
  if (override) {
    return !override.isRevoked;
  }

  for (const userRole of user.roles) {
    for (const rolePerm of userRole.role.permissions) {
      const p = rolePerm.permission;
      if (p.resource === resource && (p.action === action || p.action === '*')) {
        return true;
      }
    }
  }

  return false;
}

export const requirePermission = (resource: string, action: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) throw ApiError.unauthorized();

    if (!resolvePermission(user, resource, action)) {
      throw ApiError.forbidden(`Requires ${action} permission on ${resource}`);
    }

    next();
  };
};

export const requireRole = (...roleNames: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) throw ApiError.unauthorized();

    if (isSuperAdmin(user) || user.roles.some((ur: any) => roleNames.includes(ur.role.name))) {
      return next();
    }

    throw ApiError.forbidden(`Requires one of roles: ${roleNames.join(', ')}`);
  };
};
