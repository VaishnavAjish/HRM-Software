import jwt, { SignOptions, VerifyOptions, JwtPayload, Secret } from 'jsonwebtoken';
import { config } from '../config/environment';
import { Types } from 'mongoose';

export interface TokenPayload extends JwtPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  sessionId?: string;
  type: 'access' | 'refresh';
}

export interface AccessTokenPayload extends TokenPayload {
  type: 'access';
}

export interface RefreshTokenPayload extends TokenPayload {
  type: 'refresh';
}

export interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: number;
  refreshTokenExpiry: number;
}

const ACCESS_TOKEN_OPTIONS: SignOptions = {
  expiresIn: config.jwt.accessExpiry,
  issuer: config.jwt.issuer,
  audience: config.jwt.audience,
  algorithm: 'HS256',
};

const REFRESH_TOKEN_OPTIONS: SignOptions = {
  expiresIn: config.jwt.refreshExpiry,
  issuer: config.jwt.issuer,
  audience: config.jwt.audience,
  algorithm: 'HS256',
};

const VERIFY_OPTIONS: VerifyOptions = {
  issuer: config.jwt.issuer,
  audience: config.jwt.audience,
  algorithms: ['HS256'],
  clockTolerance: 30,
};

export const generateAccessToken = (payload: Omit<AccessTokenPayload, 'type' | 'iat' | 'exp'>): string => {
  return jwt.sign(
    { ...payload, type: 'access' },
    config.jwt.accessSecret as Secret,
    ACCESS_TOKEN_OPTIONS
  );
};

export const generateRefreshToken = (payload: Omit<RefreshTokenPayload, 'type' | 'iat' | 'exp'>): string => {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    config.jwt.refreshSecret as Secret,
    REFRESH_TOKEN_OPTIONS
  );
};

export const generateTokenPair = (payload: Omit<AccessTokenPayload, 'type' | 'iat' | 'exp'>): TokenPair => {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  const accessTokenDecoded = jwt.decode(accessToken) as DecodedToken;
  const refreshTokenDecoded = jwt.decode(refreshToken) as DecodedToken;

  return {
    accessToken,
    refreshToken,
    accessTokenExpiry: accessTokenDecoded.exp * 1000,
    refreshTokenExpiry: refreshTokenDecoded.exp * 1000,
  };
};

export const verifyAccessToken = (token: string): DecodedToken => {
  try {
    return jwt.verify(token, config.jwt.accessSecret as Secret, VERIFY_OPTIONS) as DecodedToken;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('ACCESS_TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('INVALID_ACCESS_TOKEN');
    }
    throw error;
  }
};

export const verifyRefreshToken = (token: string): DecodedToken => {
  try {
    return jwt.verify(token, config.jwt.refreshSecret as Secret, VERIFY_OPTIONS) as DecodedToken;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('REFRESH_TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('INVALID_REFRESH_TOKEN');
    }
    throw error;
  }
};

export const decodeToken = (token: string): DecodedToken | null => {
  try {
    return jwt.decode(token) as DecodedToken;
  } catch {
    return null;
  }
};

export const getTokenExpiry = (token: string): Date | null => {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return null;
  return new Date(decoded.exp * 1000);
};

export const isTokenExpired = (token: string): boolean => {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true;
  return expiry < new Date();
};

export const extractTokenFromHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
};

export const createSessionPayload = (
  userId: Types.ObjectId | string,
  email: string,
  role: string,
  permissions: string[],
  sessionId?: string
): Omit<AccessTokenPayload, 'type' | 'iat' | 'exp'> => ({
  userId: userId.toString(),
  email,
  role,
  permissions,
  sessionId,
});

export const refreshAccessToken = (refreshToken: string): { accessToken: string; accessTokenExpiry: number } => {
  const decoded = verifyRefreshToken(refreshToken);

  if (decoded.type !== 'refresh') {
    throw new Error('INVALID_TOKEN_TYPE');
  }

  const newPayload: Omit<AccessTokenPayload, 'type' | 'iat' | 'exp'> = {
    userId: decoded.userId,
    email: decoded.email,
    role: decoded.role,
    permissions: decoded.permissions,
    sessionId: decoded.sessionId,
  };

  const accessToken = generateAccessToken(newPayload);
  const accessTokenDecoded = jwt.decode(accessToken) as DecodedToken;

  return {
    accessToken,
    accessTokenExpiry: accessTokenDecoded.exp * 1000,
  };
};

export const revokeToken = (token: string): boolean => {
  const decoded = decodeToken(token);
  if (!decoded) return false;

  const now = Math.floor(Date.now() / 1000);
  return decoded.exp < now;
};

export default {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  getTokenExpiry,
  isTokenExpired,
  extractTokenFromHeader,
  createSessionPayload,
  refreshAccessToken,
  revokeToken,
};