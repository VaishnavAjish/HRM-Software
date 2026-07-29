import { body } from 'express-validator';

export const permissionValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('resource').trim().notEmpty().withMessage('Resource is required'),
  body('action').trim().notEmpty().withMessage('Action is required'),
  body('groupId').optional().isString(),
];

export const permissionGroupValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').optional().isString(),
];
