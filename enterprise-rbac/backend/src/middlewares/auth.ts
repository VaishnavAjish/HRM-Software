import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { verifyAccessToken } from '../utils/tokens';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const userInclude = {
  roles: {
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
          pagePermissions: true,
          rowPolicies: true,
        },
      },
    },
  },
  permissions: { include: { permission: true } },
} as const;

export const authenticateJWT = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing bearer token');
  }

  const token = authHeader.split(' ')[1];

  let payload: { userId: string };
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.forbidden('Invalid or expired token');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: userInclude,
  });

  if (!user) {
    throw ApiError.unauthorized('User not found');
  }

  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden('User account is not active');
  }

  req.user = user;
  next();
});
