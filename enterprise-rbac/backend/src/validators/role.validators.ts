import { body } from 'express-validator';

export const roleValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').optional().isString(),
  body('permissionIds').optional().isArray(),
];
