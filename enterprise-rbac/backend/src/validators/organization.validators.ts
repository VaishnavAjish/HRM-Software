import { body } from 'express-validator';

export const companyValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('code').trim().notEmpty().withMessage('Code is required'),
  body('currency').optional().isString(),
];

export const branchValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('code').trim().notEmpty().withMessage('Code is required'),
  body('companyId').trim().notEmpty().withMessage('companyId is required'),
];

export const locationValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('type').trim().notEmpty().withMessage('Type is required'),
  body('branchId').trim().notEmpty().withMessage('branchId is required'),
];

export const departmentValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('code').trim().notEmpty().withMessage('Code is required'),
];

export const teamValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('departmentId').trim().notEmpty().withMessage('departmentId is required'),
];

export const designationValidator = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('level').optional().isInt(),
];
