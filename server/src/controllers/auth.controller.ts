import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

import { User, UserRole, UserStatus, IUser } from '../models/User';
import { Employee } from '../models/Employee';
import {
  generateTokenPair,
  verifyRefreshToken,
  createSessionPayload,
  refreshAccessToken,
  extractTokenFromHeader,
} from '../utils/jwt';
import {
  verifyPassword,
  checkPasswordStrength,
  validatePassword,
  generateSecurePassword,
} from '../utils/password';
import {
  sendEmail,
  welcomeEmail,
  passwordResetEmail,
  emailVerificationEmail,
} from '../utils/email';
import { config } from '../config/environment';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  BadRequestError,
  TooManyRequestsError,
} from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

interface RegisterInput {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  phone?: string;
  employeeId?: string;
}

interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

interface RefreshTokenInput {
  refreshToken: string;
}

interface ForgotPasswordInput {
  email: string;
}

interface ResetPasswordInput {
  token: string;
  password: string;
  confirmPassword: string;
}

interface VerifyEmailInput {
  token: string;
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phone?: string;
  alternatePhone?: string;
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  maritalStatus?: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED';
  nationality?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
}

interface Enable2FAInput {
  password: string;
}

interface Verify2FAInput {
  token: string;
  password: string;
}

interface Disable2FAInput {
  password: string;
  token?: string;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: Record<string, unknown>;
}

const sendResponse = <T>(
  res: Response,
  statusCode: number,
  success: boolean,
  message: string,
  data?: T,
  meta?: Record<string, unknown>
): void => {
  const response: ApiResponse<T> = { success, message };
  if (data !== undefined) response.data = data;
  if (meta !== undefined) response.meta = meta;
  res.status(statusCode).json(response);
};

const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
  accessTokenExpiry: number,
  refreshTokenExpiry: number,
  rememberMe: boolean = false
): void => {
  const isProduction = config.isProduction;
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' as const : 'lax' as const,
    domain: isProduction ? config.clientUrl.replace(/^https?:\/\//, '') : undefined,
  };

  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: accessTokenExpiry - Date.now(),
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : refreshTokenExpiry - Date.now(),
    path: '/api/v1/auth/refresh',
  });
};

const clearAuthCookies = (res: Response): void => {
  const isProduction = config.isProduction;
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' as const : 'lax' as const,
    domain: isProduction ? config.clientUrl.replace(/^https?:\/\//, '') : undefined,
  };

  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', { ...cookieOptions, path: '/api/v1/auth/refresh' });
};

const generateSessionId = (): string => {
  return crypto.randomBytes(16).toString('hex');
};

const sanitizeUser = (user: IUser): Partial<IUser> => {
  const userObj = user.toObject();
  delete userObj.password;
  delete userObj.security?.passwordResetToken;
  delete userObj.security?.passwordResetExpires;
  delete userObj.security?.emailVerificationToken;
  delete userObj.security?.phoneVerificationToken;
  delete userObj.security?.twoFactorSecret;
  delete userObj.security?.twoFactorBackupCodes;
  delete userObj.security?.sessionTokens;
  return userObj;
};

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input = req.body as RegisterInput;

    const existingUser = await User.findOne({
      $or: [{ email: input.email.toLowerCase() }, { username: input.username }],
    });

    if (existingUser) {
      if (existingUser.email === input.email.toLowerCase()) {
        throw new ConflictError('Email already registered');
      }
      throw new ConflictError('Username already taken');
    }

    const passwordValidation = validatePassword(input.password);
    if (!passwordValidation.isValid) {
      throw new ValidationError('Password validation failed', passwordValidation.errors.map(e => ({ field: 'password', message: e, code: 'INVALID_PASSWORD' })));
    }

    const strength = checkPasswordStrength(input.password);
    if (!strength.isValid) {
      throw new ValidationError('Password is too weak', strength.feedback.map(f => ({ field: 'password', message: f, code: 'WEAK_PASSWORD' })));
    }

    let employee: typeof Employee.prototype | null = null;
    if (input.employeeId) {
      employee = await Employee.findOne({ 'employmentDetails.employeeId': input.employeeId.toUpperCase() });
      if (!employee) {
        throw new NotFoundError('Employee not found');
      }
      if (employee.employmentDetails.userId) {
        throw new ConflictError('Employee already has a user account');
      }
    }

    const sessionId = generateSessionId();
    const tempPassword = generateSecurePassword(16);

    const user = await User.create({
      email: input.email.toLowerCase(),
      username: input.username.toLowerCase(),
      password: input.password,
      role: UserRole.EMPLOYEE,
      status: UserStatus.PENDING_VERIFICATION,
      profile: {
        firstName: input.firstName,
        lastName: input.lastName,
        middleName: input.middleName,
        phone: input.phone,
      },
      employeeId: employee?._id,
      permissions: [],
      createdBy: employee?._id || undefined,
    });

    if (employee) {
      employee.employmentDetails.userId = user._id;
      await employee.save();
    }

    const emailToken = user.generateEmailVerificationToken();
    await user.save();

    try {
      const verificationUrl = `${config.clientUrl}/verify-email?token=${emailToken}`;
      await sendEmail({
        to: input.email,
        subject: 'Verify Your Email - HRFlow Pro',
        html: emailVerificationEmail({
          firstName: input.firstName,
          verificationUrl,
          expireHours: 24,
        }),
      });
    } catch (emailError) {
      logger.error({ error: emailError, userId: user._id }, 'Failed to send verification email');
    }

    const payload = createSessionPayload(
      user._id,
      user.email,
      user.role,
      user.permissions,
      sessionId
    );
    const tokens = generateTokenPair(payload);

    user.security.sessionTokens = [sessionId];
    user.security.lastLoginAt = new Date();
    user.security.lastLoginIp = req.ip;
    user.security.lastLoginDevice = req.get('user-agent');
    await user.save();

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken, tokens.accessTokenExpiry, tokens.refreshTokenExpiry);

    const sanitizedUser = sanitizeUser(user);
    sendResponse(res, 201, true, 'Registration successful. Please verify your email.', {
      user: sanitizedUser,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input = req.body as LoginInput;

    const user = await User.findOne({ email: input.email.toLowerCase() }).select('+password +security');
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (user.security.lockedUntil && user.security.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.security.lockedUntil.getTime() - Date.now()) / 60000);
      throw new TooManyRequestsError(`Account locked. Try again in ${minutesLeft} minutes`);
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenError('Account suspended. Contact administrator');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new ForbiddenError('Account deactivated. Contact administrator');
    }

    const isPasswordValid = await user.comparePassword(input.password);
    if (!isPasswordValid) {
      user.security.failedLoginAttempts += 1;
      if (user.security.failedLoginAttempts >= 5) {
        user.security.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      }
      await user.save();
      throw new UnauthorizedError('Invalid email or password');
    }

    user.security.failedLoginAttempts = 0;
    user.security.lockedUntil = undefined;

    const sessionId = generateSessionId();
    const payload = createSessionPayload(
      user._id,
      user.email,
      user.role,
      user.permissions,
      sessionId
    );
    const tokens = generateTokenPair(payload);

    user.security.sessionTokens = [...(user.security.sessionTokens || []), sessionId].slice(-10);
    user.security.lastLoginAt = new Date();
    user.security.lastLoginIp = req.ip;
    user.security.lastLoginDevice = req.get('user-agent');
    user.lastActiveAt = new Date();
    await user.save();

    setAuthCookies(
      res,
      tokens.accessToken,
      tokens.refreshToken,
      tokens.accessTokenExpiry,
      tokens.refreshTokenExpiry,
      input.rememberMe
    );

    const employee = user.employeeId ? await Employee.findById(user.employeeId) : null;

    const sanitizedUser = sanitizeUser(user);
    sendResponse(res, 200, true, 'Login successful', {
      user: sanitizedUser,
      employee,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input = req.body as RefreshTokenInput;

    let refreshToken = input.refreshToken;
    if (!refreshToken) {
      const cookies = req.headers.cookie?.split('; ') || [];
      const refreshCookie = cookies.find(c => c.startsWith('refreshToken='));
      if (refreshCookie) {
        refreshToken = refreshCookie.split('=')[1];
      }
    }

    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token required');
    }

    const decoded = verifyRefreshToken(refreshToken);

    const user = await User.findById(decoded.userId).select('+security');
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedError('User not found or inactive');
    }

    const sessionValid = user.security.sessionTokens?.includes(decoded.sessionId || '');
    if (!sessionValid) {
      throw new UnauthorizedError('Session invalid or revoked');
    }

    const newPayload = createSessionPayload(
      user._id,
      user.email,
      user.role,
      user.permissions,
      decoded.sessionId
    );
    const { accessToken, accessTokenExpiry } = refreshAccessToken(refreshToken);

    const refreshTokenDecoded = jwt.decode(refreshToken) as { exp?: number } | null;
    const refreshTokenExpiry = refreshTokenDecoded?.exp ? refreshTokenDecoded.exp * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000;

    setAuthCookies(res, accessToken, refreshToken, accessTokenExpiry, refreshTokenExpiry);

    const sanitizedUser = sanitizeUser(user);
    sendResponse(res, 200, true, 'Token refreshed successfully', {
      user: sanitizedUser,
      accessToken,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;
    if (user) {
      const cookies = req.headers.cookie?.split('; ') || [];
      const refreshCookie = cookies.find(c => c.startsWith('refreshToken='));
      if (refreshCookie) {
        const refreshToken = refreshCookie.split('=')[1];
        try {
          const decoded = verifyRefreshToken(refreshToken);
          if (decoded.sessionId) {
            user.security.sessionTokens = (user.security.sessionTokens || []).filter(t => t !== decoded.sessionId);
            await user.save();
          }
        } catch {
          // Ignore invalid/expired refresh token during logout
        }
      }
    }

    clearAuthCookies(res);

    sendResponse(res, 200, true, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input = req.body as ForgotPasswordInput;

    const user = await User.findOne({ email: input.email.toLowerCase() });
    if (!user) {
      sendResponse(res, 200, true, 'If the email exists, a reset link has been sent');
      return;
    }

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.INACTIVE) {
      sendResponse(res, 200, true, 'If the email exists, a reset link has been sent');
      return;
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save();

    try {
      const resetUrl = `${config.clientUrl}/reset-password?token=${resetToken}`;
      await sendEmail({
        to: user.email,
        subject: 'Reset Your Password - HRFlow Pro',
        html: passwordResetEmail({
          firstName: user.profile.firstName,
          resetUrl,
          expireMinutes: 60,
          ipAddress: req.ip,
        }),
      });
    } catch (emailError) {
      logger.error({ error: emailError, userId: user._id }, 'Failed to send password reset email');
      throw new AppError('Failed to send reset email. Please try again.', 500);
    }

    sendResponse(res, 200, true, 'If the email exists, a reset link has been sent');
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input = req.body as ResetPasswordInput;

    const hashedToken = crypto.createHash('sha256').update(input.token).digest('hex');

    const user = await User.findOne({
      'security.passwordResetToken': hashedToken,
      'security.passwordResetExpires': { $gt: new Date() },
    }).select('+password +security');

    if (!user) {
      throw new BadRequestError('Invalid or expired reset token');
    }

    const passwordValidation = validatePassword(input.password);
    if (!passwordValidation.isValid) {
      throw new ValidationError('Password validation failed', passwordValidation.errors.map(e => ({ field: 'password', message: e, code: 'INVALID_PASSWORD' })));
    }

    const strength = checkPasswordStrength(input.password);
    if (!strength.isValid) {
      throw new ValidationError('Password is too weak', strength.feedback.map(f => ({ field: 'password', message: f, code: 'WEAK_PASSWORD' })));
    }

    user.password = input.password;
    user.security.passwordResetToken = undefined;
    user.security.passwordResetExpires = undefined;
    user.security.passwordLastChanged = new Date();
    user.security.sessionTokens = [];
    await user.save();

    clearAuthCookies(res);

    sendResponse(res, 200, true, 'Password reset successful. Please log in with your new password.');
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input = req.body as VerifyEmailInput;

    const hashedToken = crypto.createHash('sha256').update(input.token).digest('hex');

    const user = await User.findOne({
      'security.emailVerificationToken': hashedToken,
    });

    if (!user) {
      throw new BadRequestError('Invalid or expired verification token');
    }

    if (user.security.emailVerified) {
      sendResponse(res, 200, true, 'Email already verified');
      return;
    }

    user.security.emailVerified = true;
    user.security.emailVerifiedAt = new Date();
    user.security.emailVerificationToken = undefined;
    user.status = UserStatus.ACTIVE;
    await user.save();

    try {
      await sendEmail({
        to: user.email,
        subject: 'Welcome to HRFlow Pro!',
        html: welcomeEmail({
          firstName: user.profile.firstName,
          lastName: user.profile.lastName,
          email: user.email,
          loginUrl: `${config.clientUrl}/login`,
        }),
      });
    } catch (emailError) {
      logger.error({ error: emailError, userId: user._id }, 'Failed to send welcome email');
    }

    sendResponse(res, 200, true, 'Email verified successfully');
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await User.findById(req.userId)
      .populate('employeeId')
      .populate('branchId')
      .populate('departmentId')
      .populate('reportingManagerId');

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const sanitizedUser = sanitizeUser(user);
    sendResponse(res, 200, true, 'Profile retrieved successfully', {
      user: sanitizedUser,
      employee: user.employeeId,
      branch: user.branchId,
      department: user.departmentId,
      reportingManager: user.reportingManagerId,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input = req.body as UpdateProfileInput;
    const userId = req.userId!;

    const allowedFields = [
      'firstName',
      'lastName',
      'middleName',
      'phone',
      'alternatePhone',
      'dateOfBirth',
      'gender',
      'maritalStatus',
      'nationality',
      'address',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (input[field as keyof UpdateProfileInput] !== undefined) {
        if (field === 'address' && input.address) {
          updateData['address'] = input.address;
        } else if (field === 'dateOfBirth' && input.dateOfBirth) {
          updateData['profile.dateOfBirth'] = new Date(input.dateOfBirth);
        } else {
          updateData[`profile.${field}`] = input[field as keyof UpdateProfileInput];
        }
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const sanitizedUser = sanitizeUser(user);
    sendResponse(res, 200, true, 'Profile updated successfully', { user: sanitizedUser });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input = req.body as ChangePasswordInput;
    const userId = req.userId!;

    const user = await User.findById(userId).select('+password +security');
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isCurrentPasswordValid = await user.comparePassword(input.currentPassword);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const passwordValidation = validatePassword(input.newPassword);
    if (!passwordValidation.isValid) {
      throw new ValidationError('Password validation failed', passwordValidation.errors.map(e => ({ field: 'newPassword', message: e, code: 'INVALID_PASSWORD' })));
    }

    const strength = checkPasswordStrength(input.newPassword);
    if (!strength.isValid) {
      throw new ValidationError('Password is too weak', strength.feedback.map(f => ({ field: 'newPassword', message: f, code: 'WEAK_PASSWORD' })));
    }

    const isSameAsCurrent = await verifyPassword(input.newPassword, user.password);
    if (isSameAsCurrent) {
      throw new BadRequestError('New password must be different from current password');
    }

    user.password = input.newPassword;
    user.security.passwordLastChanged = new Date();
    user.security.sessionTokens = [];
    await user.save();

    clearAuthCookies(res);

    sendResponse(res, 200, true, 'Password changed successfully. Please log in again.');
  } catch (error) {
    next(error);
  }
};

export const enable2FA = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input = req.body as Enable2FAInput;
    const userId = req.userId!;

    const user = await User.findById(userId).select('+password +security');
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isPasswordValid = await user.comparePassword(input.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid password');
    }

    if (user.security.twoFactorEnabled) {
      throw new BadRequestError('2FA is already enabled');
    }

    const secret = user.generateTwoFactorSecret();
    await user.save();

    const otpauthUrl = speakeasy.otpauthURL({
      secret: user.security.twoFactorSecret!,
      label: `HRFlow Pro (${user.email})`,
      issuer: 'HRFlow Pro',
      encoding: 'base32',
    });

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    sendResponse(res, 200, true, '2FA setup initiated. Scan QR code and verify to enable.', {
      secret: user.security.twoFactorSecret,
      qrCode: qrCodeDataUrl,
    });
  } catch (error) {
    next(error);
  }
};

export const verify2FA = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input = req.body as Verify2FAInput;
    const userId = req.userId!;

    const user = await User.findById(userId).select('+password +security');
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isPasswordValid = await user.comparePassword(input.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid password');
    }

    if (!user.security.twoFactorSecret) {
      throw new BadRequestError('2FA not initialized. Call enable2FA first.');
    }

    const verified = user.verifyTwoFactorToken(input.token);
    if (!verified) {
      throw new UnauthorizedError('Invalid 2FA token');
    }

    const backupCodes = user.generateBackupCodes();
    user.security.twoFactorEnabled = true;
    await user.save();

    sendResponse(res, 200, true, '2FA enabled successfully', {
      backupCodes,
    });
  } catch (error) {
    next(error);
  }
};

export const disable2FA = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input = req.body as Disable2FAInput;
    const userId = req.userId!;

    const user = await User.findById(userId).select('+password +security');
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.security.twoFactorEnabled) {
      sendResponse(res, 200, true, '2FA is not enabled');
      return;
    }

    const isPasswordValid = await user.comparePassword(input.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid password');
    }

    if (input.token && user.security.twoFactorSecret) {
      const verified = user.verifyTwoFactorToken(input.token);
      if (!verified) {
        throw new UnauthorizedError('Invalid 2FA token');
      }
    }

    user.security.twoFactorEnabled = false;
    user.security.twoFactorSecret = undefined;
    user.security.twoFactorBackupCodes = undefined;
    await user.save();

    sendResponse(res, 200, true, '2FA disabled successfully');
  } catch (error) {
    next(error);
  }
};

export default {
  register,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  getProfile,
  updateProfile,
  changePassword,
  enable2FA,
  verify2FA,
  disable2FA,
};