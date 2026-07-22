import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from './error.middleware';
import { UserRole } from '../models/User';
import { getPermissionsForRole } from './auth.middleware';

export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(user.role)) {
      return next(
        new ForbiddenError(
          `Access denied. Required roles: ${allowedRoles.join(', ')}`
        )
      );
    }

    next();
  };
};

export const authorizePermission = (...requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const userPermissions = getPermissionsForRole(user.role);

    if (userPermissions.includes('*')) {
      return next();
    }

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

export const canAccessBranch = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const user = (req as any).user;

  if (!user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  if (user.role === UserRole.ADMIN) {
    return next();
  }

  const targetBranchId = req.params.branchId || req.body.branchId || req.query.branchId;
  
  if (!targetBranchId) {
    return next();
  }

  if (user.branchId?.toString() !== targetBranchId.toString()) {
    return next(new ForbiddenError('Access denied to this branch'));
  }

  next();
};

export const canAccessDepartment = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const user = (req as any).user;

  if (!user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  if (user.role === UserRole.ADMIN || user.role === UserRole.HR_MANAGER) {
    return next();
  }

  const targetDeptId = req.params.departmentId || req.body.departmentId || req.query.departmentId;
  
  if (!targetDeptId) {
    return next();
  }

  if (user.departmentId?.toString() !== targetDeptId.toString()) {
    return next(new ForbiddenError('Access denied to this department'));
  }

  next();
};

export const canAccessOwnData = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const user = (req as any).user;

  if (!user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  const targetUserId = req.params.userId || req.params.id || req.body.userId;
  
  if (targetUserId && user._id.toString() === targetUserId.toString()) {
    return next();
  }

  if (user.role === UserRole.ADMIN || user.role === UserRole.HR_MANAGER) {
    return next();
  }

  return next(new ForbiddenError('Access denied'));
};

export const canManageResource = (resourceUserIdField: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (user.role === UserRole.ADMIN || user.role === UserRole.HR_MANAGER) {
      return next();
    }

    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
    
    if (resourceUserId && user._id.toString() === resourceUserId.toString()) {
      return next();
    }

    return next(new ForbiddenError('Access denied to this resource'));
  };
};

export const canViewSalary = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const user = (req as any).user;

  if (!user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  if (user.role === UserRole.ADMIN || user.role === UserRole.HR_MANAGER) {
    return next();
  }

  const targetUserId = req.params.userId || req.params.id;
  
  if (targetUserId && user._id.toString() === targetUserId.toString()) {
    return next();
  }

  return next(new ForbiddenError('Access denied to salary information'));
};

export const canManagePayroll = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const user = (req as any).user;

  if (!user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  if (user.role === UserRole.ADMIN || user.role === UserRole.HR_MANAGER) {
    return next();
  }

  return next(new ForbiddenError('Access denied to payroll management'));
};

export const canApproveLeaves = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const user = (req as any).user;

  if (!user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  if (user.role === UserRole.ADMIN || user.role === UserRole.HR_MANAGER) {
    return next();
  }

  if (user.role === UserRole.DEPT_HEAD) {
    return next();
  }

  return next(new ForbiddenError('Insufficient permissions to approve leaves'));
};

export const canManageAttendance = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const user = (req as any).user;

  if (!user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  if (user.role === UserRole.ADMIN || user.role === UserRole.HR_MANAGER) {
    return next();
  }

  if (user.role === UserRole.DEPT_HEAD) {
    return next();
  }

  return next(new ForbiddenError('Insufficient permissions to manage attendance'));
};

export const canViewReports = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const user = (req as any).user;

  if (!user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  if (user.role === UserRole.ADMIN || user.role === UserRole.HR_MANAGER) {
    return next();
  }

  if (user.role === UserRole.DEPT_HEAD) {
    return next();
  }

  return next(new ForbiddenError('Insufficient permissions to view reports'));
};

export const requireAnyRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!roles.includes(user.role)) {
      return next(
        new ForbiddenError(`Access denied. Allowed roles: ${roles.join(', ')}`)
      );
    }

    next();
  };
};

export const requireAllPermissions = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const userPermissions = getPermissionsForRole(user.role);

    if (userPermissions.includes('*')) {
      return next();
    }

    const hasAll = permissions.every((p) => userPermissions.includes(p));

    if (!hasAll) {
      return next(
        new ForbiddenError(`Missing required permissions: ${permissions.join(', ')}`)
      );
    }

    next();
  };
};

export const requireAnyPermission = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const userPermissions = getPermissionsForRole(user.role);

    if (userPermissions.includes('*')) {
      return next();
    }

    const hasAny = permissions.some((p) => userPermissions.includes(p));

    if (!hasAny) {
      return next(
        new ForbiddenError(`At least one permission required: ${permissions.join(', ')}`)
      );
    }

    next();
  };
};