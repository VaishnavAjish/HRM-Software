import { body } from 'express-validator';

export const createUserValidator = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('roleIds').optional().isArray(),
];

export const updateUserValidator = [
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('roleIds').optional().isArray(),
];

export const permissionOverridesValidator = [
  body('overrides').isArray().withMessage('overrides must be an array'),
  body('overrides.*.permissionId').isString().notEmpty(),
  body('overrides.*.isRevoked').isBoolean(),
];
