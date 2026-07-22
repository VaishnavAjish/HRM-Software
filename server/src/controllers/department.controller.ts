import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Department } from '../models/Department';
import { Employee } from '../models/Employee';
import { asyncHandler, NotFoundError, ConflictError } from '../middleware/error.middleware';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

export const getDepartments = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { search, branchId, status } = req.query;
    const filter: Record<string, any> = { isDeleted: { $ne: true } };

    if (search) {
      filter.$or = [
        { code: new RegExp(String(search), 'i') },
        { name: new RegExp(String(search), 'i') },
      ];
    }
    if (branchId && Types.ObjectId.isValid(String(branchId))) {
      filter.branchId = new Types.ObjectId(String(branchId));
    }
    if (status) {
      filter.status = status;
    }

    const departments = await Department.find(filter)
      .populate('branchId', 'code name')
      .populate('headId', 'personalInfo.firstName personalInfo.lastName')
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      message: 'Departments retrieved successfully',
      data: departments,
    });
  } catch (error) {
    logger.error(`Error fetching departments: ${(error as Error).message}`);
    next(error);
  }
});

export const createDepartment = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const input = req.body;

    const existingCode = await Department.findOne({ code: input.code?.toUpperCase(), branchId: input.branchId });
    if (existingCode) {
      throw new ConflictError('Department code already exists in this branch');
    }

    const department = await Department.create({
      ...input,
      code: input.code?.toUpperCase(),
      createdBy: user._id,
    });

    const populated = await Department.findById(department._id)
      .populate('branchId', 'code name')
      .populate('headId', 'personalInfo.firstName personalInfo.lastName');

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: populated,
    });
  } catch (error) {
    logger.error(`Error creating department: ${(error as Error).message}`);
    next(error);
  }
});

export const getDepartmentById = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const department = await Department.findById(id)
      .populate('branchId', 'code name')
      .populate('headId', 'personalInfo.firstName personalInfo.lastName');

    if (!department || department.isDeleted) {
      throw new NotFoundError('Department not found');
    }

    const employeeCount = await Employee.countDocuments({
      'employmentDetails.departmentId': department._id,
      isDeleted: { $ne: true },
      isActive: true,
    });

    res.status(200).json({
      success: true,
      message: 'Department retrieved successfully',
      data: {
        ...department.toObject(),
        employeeCount,
      },
    });
  } catch (error) {
    logger.error(`Error fetching department: ${(error as Error).message}`);
    next(error);
  }
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const input = req.body;

    const department = await Department.findById(id);
    if (!department || department.isDeleted) {
      throw new NotFoundError('Department not found');
    }

    const updatedDepartment = await Department.findByIdAndUpdate(
      id,
      { $set: { ...input, updatedBy: user._id } },
      { new: true, runValidators: true }
    )
      .populate('branchId', 'code name')
      .populate('headId', 'personalInfo.firstName personalInfo.lastName');

    res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      data: updatedDepartment,
    });
  } catch (error) {
    logger.error(`Error updating department: ${(error as Error).message}`);
    next(error);
  }
});

export const deleteDepartment = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const department = await Department.findById(id);
    if (!department || department.isDeleted) {
      throw new NotFoundError('Department not found');
    }

    department.isDeleted = true;
    department.deletedAt = new Date();
    await department.save();

    res.status(200).json({
      success: true,
      message: 'Department deleted successfully',
    });
  } catch (error) {
    logger.error(`Error deleting department: ${(error as Error).message}`);
    next(error);
  }
});

export default {
  getDepartments,
  createDepartment,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
};
