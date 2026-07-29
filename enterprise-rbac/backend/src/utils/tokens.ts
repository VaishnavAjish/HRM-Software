import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_SECRET = process.env.JWT_SECRET;
const ACCESS_EXPIRY = process.env.JWT_EXPIRY || '15m';
const REFRESH_EXPIRY_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS || 7);

if (!ACCESS_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ userId }, ACCESS_SECRET as string, { expiresIn: ACCESS_EXPIRY as any });
}

export function verifyAccessToken(token: string): { userId: string } {
  return jwt.verify(token, ACCESS_SECRET as string) as { userId: string };
}

export function generateRefreshToken(): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  return { token, expiresAt };
}
