import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
    password: z.string().min(12).max(128),
    confirmPassword: z.string(),
    firstName: z.string().min(1).max(50),
    lastName: z.string().min(1).max(50),
    middleName: z.string().max(50).optional(),
    phone: z.string().max(20).optional(),
    employeeId: z.string().optional(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
    rememberMe: z.boolean().optional(),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: z.string().min(12).max(128),
    confirmPassword: z.string(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Verification token is required'),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(12).max(128),
    confirmPassword: z.string(),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    middleName: z.string().max(50).optional(),
    phone: z.string().max(20).optional(),
    alternatePhone: z.string().max(20).optional(),
    dateOfBirth: z.string().datetime().optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    maritalStatus: z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(),
    nationality: z.string().max(50).optional(),
    address: z.object({
      line1: z.string().max(200).optional(),
      line2: z.string().max(200).optional(),
      city: z.string().max(100).optional(),
      state: z.string().max(100).optional(),
      postalCode: z.string().max(20).optional(),
      country: z.string().max(100).optional(),
    }).optional(),
  }),
});