import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from '../middleware/error.middleware';
import { User, UserRole } from '../models/User';
import { verifyAccessToken } from '../utils/jwt';

export interface AuthenticatedRequest extends Request {
  user?: User & { role: UserRole };
  userId?: string;
  userRole?: UserRole;
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token required');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.userId).select('+role');
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive');
    }

    req.user = user as User & { role: UserRole };
    req.userId = user._id.toString();
    req.userRole = user.role;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Access token expired'));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid access token'));
    } else {
      next(error);
    }
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.userId).select('+role');
    if (user && user.isActive) {
      req.user = user as User & { role: UserRole };
      req.userId = user._id.toString();
      req.userRole = user.role;
    }

    next();
  } catch {
    next();
  }
};

export const requireAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }
  next();
};

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(`Access denied. Required roles: ${allowedRoles.join(', ')}`)
      );
    }

    next();
  };
};

export const requirePermission = (...requiredPermissions: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const userPermissions = getPermissionsForRole(req.user.role);
    const hasPermission = requiredPermissions.every((perm) =>
      userPermissions.includes(perm)
    );

    if (!hasPermission) {
      return next(
        new ForbiddenError(
          `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`
        )
      );
    }

    next();
  };
};

const rolePermissions: Record<UserRole, string[]> = {
  [UserRole.ADMIN]: ['*'],
  [UserRole.HR_MANAGER]: [
    'employees:read',
    'employees:write',
    'employees:delete',
    'departments:read',
    'departments:write',
    'leaves:read',
    'leaves:write',
    'leaves:approve',
    'attendance:read',
    'attendance:write',
    'payroll:read',
    'payroll:write',
    'reports:read',
    'reports:write',
  ],
  [UserRole.DEPT_HEAD]: [
    'employees:read',
    'leaves:read',
    'leaves:approve',
    'attendance:read',
    'reports:read',
  ],
  [UserRole.EMPLOYEE]: [
    'profile:read',
    'profile:write',
    'leaves:read',
    'leaves:write',
    'attendance:read',
    'payslips:read',
  ],
};

export const getPermissionsForRole = (role: UserRole): string[] => {
  return rolePermissions[role] || [];
};

export const canAccessBranch = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  if (req.user.role === UserRole.ADMIN) {
    return next();
  }

  const targetBranchId = req.params.branchId || req.body.branchId || req.query.branchId;
  
  if (!targetBranchId) {
    return next();
  }

  if (req.user.branchId?.toString() !== targetBranchId.toString()) {
    return next(new ForbiddenError('Access denied to this branch'));
  }

  next();
};

export const canAccessDepartment = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  if (req.user.role === UserRole.ADMIN || req.user.role === UserRole.HR_MANAGER) {
    return next();
  }

  const targetDeptId = req.params.departmentId || req.body.departmentId || req.query.departmentId;
  
  if (!targetDeptId) {
    return next();
  }

  if (req.user.departmentId?.toString() !== targetDeptId.toString()) {
    return next(new ForbiddenError('Access denied to this department'));
  }

  next();
};

export const canAccessOwnDataOrBranch = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  if (req.user.role === UserRole.ADMIN || req.user.role === UserRole.HR_MANAGER) {
    return next();
  }

  const targetUserId = req.params.userId || req.params.id || req.body.userId;
  
  if (targetUserId && req.user._id.toString() === targetUserId.toString()) {
    return next();
  }

  if (req.user.role === UserRole.DEPT_HEAD && req.user.departmentId) {
    return next();
  }

  if (req.user.branchId) {
    return next();
  }

  return next(new ForbiddenError('Access denied'));
};

export const requireSelfOrBranchAccess = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  const targetUserId = req.params.userId || req.params.id;
  
  if (targetUserId && req.user._id.toString() === targetUserId.toString()) {
    return next();
  }

  if (req.user.role === UserRole.ADMIN || req.user.role === UserRole.HR_MANAGER) {
    return next();
  }

  if (req.user.role === UserRole.DEPT_HEAD) {
    return next();
  }

  return next(new ForbiddenError('Access denied'));
};