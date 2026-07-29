import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { recordAudit } from '../utils/audit';
import { signAccessToken, generateRefreshToken } from '../utils/tokens';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const REFRESH_COOKIE = 'refreshToken';

function sanitizeUser(user: any) {
  const { passwordHash, mfaSecret, ...rest } = user;
  return rest;
}

async function logLogin(userId: string | null, req: Request, status: 'SUCCESS' | 'FAILED' | 'LOCKED') {
  if (!userId) return;
  await prisma.loginHistory.create({
    data: {
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status,
    },
  });
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body;

  const user = await prisma.user.findFirst({
    where: { OR: [{ username }, { email: username }] },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  });

  if (!user) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await logLogin(user.id, req, 'LOCKED');
    throw ApiError.forbidden(`Account locked until ${user.lockedUntil.toISOString()}`);
  }

  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden('Account is inactive or suspended');
  }

  const isMatch = await bcrypt.compare(password ?? '', user.passwordHash);

  if (!isMatch) {
    const failedAttempts = user.failedAttempts + 1;
    const shouldLock = failedAttempts >= MAX_FAILED_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : undefined,
      },
    });

    await logLogin(user.id, req, shouldLock ? 'LOCKED' : 'FAILED');
    throw ApiError.unauthorized('Invalid credentials');
  }

  const accessToken = signAccessToken(user.id);
  const { token: refreshToken, expiresAt } = generateRefreshToken();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLogin: new Date() },
    }),
    prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        expiresAt,
      },
    }),
  ]);

  await logLogin(user.id, req, 'SUCCESS');
  await recordAudit({ req, userId: user.id, action: 'LOGIN', resource: 'auth', resourceId: user.id });

  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires: expiresAt,
    path: '/api/v1/auth',
  });

  const roleNames = user.roles.map((ur) => ur.role.name);
  const permissions = Array.from(
    new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.name)))
  );

  res.json({
    accessToken,
    user: { ...sanitizeUser(user), roles: roleNames, permissions },
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('Missing refresh token');

  const session = await prisma.session.findUnique({ where: { refreshToken: token } });

  if (!session || session.isRevoked || session.expiresAt < new Date()) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== 'ACTIVE') {
    throw ApiError.unauthorized('User is not active');
  }

  // Rotate refresh token
  const { token: newRefreshToken, expiresAt } = generateRefreshToken();
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshToken: newRefreshToken, expiresAt },
  });

  const accessToken = signAccessToken(user.id);

  res.cookie(REFRESH_COOKIE, newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires: expiresAt,
    path: '/api/v1/auth',
  });

  res.json({ accessToken });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    await prisma.session.updateMany({ where: { refreshToken: token }, data: { isRevoked: true } });
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  res.status(204).send();
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  const roleNames = user.roles.map((ur: any) => ur.role.name);
  const permissions = Array.from(
    new Set(user.roles.flatMap((ur: any) => ur.role.permissions.map((rp: any) => rp.permission.name)))
  );
  res.json({ ...sanitizeUser(user), roles: roleNames, permissions });
});
