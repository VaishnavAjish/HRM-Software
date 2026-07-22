import { Request, Response, NextFunction } from 'express';
import mongoose, { Types, FilterQuery } from 'mongoose';

import { Branch, IBranch, BranchStatus, BranchType } from '../models/Branch';
import { Employee } from '../models/Employee';
import { Department } from '../models/Department';

import { asyncHandler, AppError, NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '../middleware/error.middleware';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { PaginationMeta, PaginationParams } from '../types/api';

interface BranchQueryParams extends PaginationParams {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: BranchStatus;
  type?: BranchType;
  managerId?: string;
  parentBranchId?: string;
}

interface BranchListItem {
  _id: Types.ObjectId;
  code: string;
  name: string;
  displayName?: string;
  type: BranchType;
  status: BranchStatus;
  address: { city: string; state: string; country: string; postalCode: string };
  contact: { phone: string; email: string };
  managerId?: Types.ObjectId;
  parentBranchId?: Types.ObjectId;
  isHeadOffice: boolean;
  capacity?: number;
  createdAt: Date;
  updatedAt: Date;
  fullName: string;
}

interface PopulatedBranch extends Omit<IBranch, 'managerId' | 'parentBranchId'> {
  managerId?: { _id: Types.ObjectId; personalInfo: { firstName: string; lastName: string }; employmentDetails: { employeeId: string } };
  parentBranchId?: { _id: Types.ObjectId; code: string; name: string };
  childBranches: PopulatedBranch[];
  departments: { _id: Types.ObjectId; code: string; name: string }[];
  employees: { _id: Types.ObjectId; personalInfo: { firstName: string; lastName: string }; employmentDetails: { employeeId: string } }[];
  createdBy: { _id: Types.ObjectId; profile: { firstName: string; lastName: string } };
  updatedBy?: { _id: Types.ObjectId; profile: { firstName: string; lastName: string } };
  fullName: string;
}

const buildBranchFilter = async (query: BranchQueryParams, user: AuthenticatedRequest['user']): Promise<FilterQuery<IBranch>> => {
  const filter: FilterQuery<IBranch> = { isDeleted: { $ne: true } };

  if (query.search) {
    const searchRegex = new RegExp(query.search, 'i');
    filter.$or = [
      { code: searchRegex },
      { name: searchRegex },
      { displayName: searchRegex },
      { 'address.city': searchRegex },
      { 'address.state': searchRegex },
    ];
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.type) {
    filter.type = query.type;
  }

  if (query.managerId && Types.ObjectId.isValid(query.managerId)) {
    filter.managerId = new Types.ObjectId(query.managerId);
  }

  if (query.parentBranchId && Types.ObjectId.isValid(query.parentBranchId)) {
    filter.parentBranchId = new Types.ObjectId(query.parentBranchId);
  }

  if (user) {
    const userRole = user.role;
    const userId = user._id;

    if (userRole === 'EMPLOYEE') {
      const employee = await Employee.findOne({ 'employmentDetails.userId': userId });
      if (employee) {
        filter._id = employee.employmentDetails.branchId;
      }
    } else if (userRole === 'DEPT_HEAD') {
      if (user.branchId) {
        filter._id = user.branchId;
      }
    } else if (userRole === 'HR_MANAGER') {
      if (user.branchId) {
        filter._id = user.branchId;
      }
    }
  }

  return filter;
};

const buildSortStage = (sortBy?: string, sortOrder?: 'asc' | 'desc'): { [key: string]: 1 | -1 } => {
  const sortField = sortBy || 'createdAt';
  const order = sortOrder === 'asc' ? 1 : -1;
  const sortMap: Record<string, string> = {
    code: 'code',
    name: 'name',
    type: 'type',
    status: 'status',
    city: 'address.city',
    state: 'address.state',
    isHeadOffice: 'isHeadOffice',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  };
  return { [sortMap[sortField] || sortField]: order };
};

const populateBranchQuery = (query: mongoose.Query<PopulatedBranch[], IBranch>): mongoose.Query<PopulatedBranch[], IBranch> => {
  return query
    .populate({
      path: 'managerId',
      select: 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId',
      model: 'Employee',
    })
    .populate({
      path: 'parentBranchId',
      select: 'code name',
      model: 'Branch',
    })
    .populate({
      path: 'childBranches',
      select: 'code name type status',
      match: { isDeleted: { $ne: true } },
      model: 'Branch',
    })
    .populate({
      path: 'departments',
      select: 'code name status',
      match: { isDeleted: { $ne: true } },
      model: 'Department',
    })
    .populate({
      path: 'employees',
      select: 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId employmentDetails.employmentStatus',
      match: { isDeleted: { $ne: true }, isActive: true },
      model: 'Employee',
    })
    .populate('createdBy', 'profile.firstName profile.lastName')
    .populate('updatedBy', 'profile.firstName profile.lastName');
};

const buildPaginationMeta = (page: number, limit: number, total: number): PaginationMeta => {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

const sendResponse = <T>(
  res: Response,
  statusCode: number,
  success: boolean,
  message: string,
  data?: T,
  meta?: PaginationMeta
): void => {
  const response: { success: boolean; message: string; data?: T; meta?: PaginationMeta } = { success, message };
  if (data !== undefined) response.data = data;
  if (meta !== undefined) response.meta = meta;
  res.status(statusCode).json(response);
};

export const getBranches = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = req.query as unknown as BranchQueryParams;
    const user = (req as AuthenticatedRequest).user;

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const filter = await buildBranchFilter(query, user);
    const sort = buildSortStage(query.sortBy, query.sortOrder);

    const [branches, total] = await Promise.all([
      Branch.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select('-customFields -notes -__v')
        .populate('managerId', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId')
        .populate('parentBranchId', 'code name')
        .lean(),
      Branch.countDocuments(filter),
    ]);

    const meta = buildPaginationMeta(page, limit, total);
    sendResponse(res, 200, true, 'Branches retrieved successfully', branches as BranchListItem[], meta);
  } catch (error) {
    logger.error({ error, query: req.query }, 'Error fetching branches');
    next(error);
  }
});

export const createBranch = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const input = req.body;

    if (input.code) {
      const existingCode = await Branch.findOne({ code: input.code.toUpperCase() });
      if (existingCode) {
        throw new ConflictError('Branch code already exists');
      }
    }

    if (input.managerId) {
      const manager = await Employee.findById(input.managerId);
      if (!manager) {
        throw new NotFoundError('Manager (employee) not found');
      }
    }

    if (input.parentBranchId) {
      const parentBranch = await Branch.findById(input.parentBranchId);
      if (!parentBranch) {
        throw new NotFoundError('Parent branch not found');
      }
    }

    if (input.isHeadOffice) {
      const existingHeadOffice = await Branch.findOne({ isHeadOffice: true });
      if (existingHeadOffice) {
        throw new ConflictError('Only one head office is allowed');
      }
    }

    const branch = await Branch.create({
      ...input,
      code: input.code?.toUpperCase(),
      address: input.address,
      contact: input.contact,
      operatingHours: input.operatingHours || [],
      facilities: input.facilities || [],
      customFields: input.customFields || {},
      createdBy: user._id,
    });

    const populatedBranch = await Branch.findById(branch._id)
      .populate('managerId', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId')
      .populate('parentBranchId', 'code name')
      .populate('childBranches', 'code name type status')
      .populate('departments', 'code name status')
      .populate('employees', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId employmentDetails.employmentStatus')
      .populate('createdBy', 'profile.firstName profile.lastName');

    logger.info({ branchId: branch._id, createdBy: user._id }, 'Branch created successfully');
    sendResponse(res, 201, true, 'Branch created successfully', populatedBranch);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error creating branch');
    next(error);
  }
});

export const getBranchById = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid branch ID');
    }

    const branch = await Branch.findById(id)
      .populate('managerId', 'personalInfo.firstName personalInfo.lastName personalInfo.email employmentDetails.employeeId employmentDetails.departmentId')
      .populate({
        path: 'parentBranchId',
        select: 'code name type status address.city address.state',
        model: 'Branch',
      })
      .populate({
        path: 'childBranches',
        select: 'code name type status address.city address.state managerId',
        match: { isDeleted: { $ne: true } },
        populate: {
          path: 'managerId',
          select: 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId',
          model: 'Employee',
        },
        model: 'Branch',
      })
      .populate({
        path: 'departments',
        select: 'code name description status headId',
        match: { isDeleted: { $ne: true } },
        populate: {
          path: 'headId',
          select: 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId',
          model: 'Employee',
        },
        model: 'Department',
      })
      .populate({
        path: 'employees',
        select: 'personalInfo.firstName personalInfo.lastName personalInfo.email employmentDetails.employeeId employmentDetails.designationId employmentDetails.employmentStatus',
        match: { isDeleted: { $ne: true }, isActive: true },
        populate: {
          path: 'employmentDetails.designationId',
          select: 'title code',
          model: 'Designation',
        },
        model: 'Employee',
      })
      .populate('createdBy', 'profile.firstName profile.lastName email')
      .populate('updatedBy', 'profile.firstName profile.lastName email');

    if (!branch || branch.isDeleted) {
      throw new NotFoundError('Branch not found');
    }

    if (user?.role === 'EMPLOYEE') {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user._id });
      if (!employee || !employee.employmentDetails.branchId.equals(branch._id)) {
        throw new ForbiddenError('You can only view your own branch');
      }
    }

    const employeeCount = await Employee.countDocuments({
      'employmentDetails.branchId': branch._id,
      isDeleted: { $ne: true },
      isActive: true,
    });

    const departmentCount = await Department.countDocuments({
      branchId: branch._id,
      isDeleted: { $ne: true },
    });

    sendResponse(res, 200, true, 'Branch retrieved successfully', {
      ...branch.toObject(),
      employeeCount,
      departmentCount,
    });
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error fetching branch by ID');
    next(error);
  }
});

export const updateBranch = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const input = req.body;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid branch ID');
    }

    const branch = await Branch.findById(id);
    if (!branch || branch.isDeleted) {
      throw new NotFoundError('Branch not found');
    }

    if (input.code && input.code.toUpperCase() !== branch.code) {
      const existingCode = await Branch.findOne({ code: input.code.toUpperCase(), _id: { $ne: id } });
      if (existingCode) {
        throw new ConflictError('Branch code already exists');
      }
    }

    if (input.managerId) {
      if (input.managerId === '') {
        input.managerId = null;
      } else if (Types.ObjectId.isValid(input.managerId)) {
        const manager = await Employee.findById(input.managerId);
        if (!manager) {
          throw new NotFoundError('Manager (employee) not found');
        }
      } else {
        throw new BadRequestError('Invalid manager ID');
      }
    }

    if (input.parentBranchId) {
      if (input.parentBranchId === id) {
        throw new BadRequestError('Branch cannot be its own parent');
      }
      if (Types.ObjectId.isValid(input.parentBranchId)) {
        const parentBranch = await Branch.findById(input.parentBranchId);
        if (!parentBranch) {
          throw new NotFoundError('Parent branch not found');
        }
      } else {
        throw new BadRequestError('Invalid parent branch ID');
      }
    }

    if (input.isHeadOffice === true && branch.isHeadOffice === false) {
      const existingHeadOffice = await Branch.findOne({ isHeadOffice: true, _id: { $ne: id } });
      if (existingHeadOffice) {
        throw new ConflictError('Only one head office is allowed');
      }
    }

    const updateData: Record<string, any> = { updatedBy: user._id };

    const allowedFields = [
      'name', 'displayName', 'type', 'status', 'address', 'contact', 'operatingHours',
      'timezone', 'currency', 'language', 'gstNumber', 'panNumber', 'tanNumber',
      'registrationNumber', 'establishedDate', 'capacity', 'facilities', 'customFields', 'notes',
    ];

    for (const field of allowedFields) {
      if (input[field] !== undefined) {
        updateData[field] = input[field];
      }
    }

    if (input.code) updateData.code = input.code.toUpperCase();
    if (input.managerId !== undefined) updateData.managerId = input.managerId ? new Types.ObjectId(input.managerId) : null;
    if (input.parentBranchId !== undefined) updateData.parentBranchId = input.parentBranchId ? new Types.ObjectId(input.parentBranchId) : null;
    if (input.isHeadOffice !== undefined) updateData.isHeadOffice = input.isHeadOffice;

    const updatedBranch = await Branch.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('managerId', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId')
      .populate('parentBranchId', 'code name')
      .populate('childBranches', 'code name type status')
      .populate('departments', 'code name status')
      .populate('createdBy', 'profile.firstName profile.lastName')
      .populate('updatedBy', 'profile.firstName profile.lastName');

    if (!updatedBranch) {
      throw new NotFoundError('Branch not found after update');
    }

    logger.info({ branchId: id, updatedBy: user._id }, 'Branch updated successfully');
    sendResponse(res, 200, true, 'Branch updated successfully', updatedBranch);
  } catch (error) {
    logger.error({ error, params: req.params, body: req.body }, 'Error updating branch');
    next(error);
  }
});

export const deleteBranch = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid branch ID');
    }

    const branch = await Branch.findById(id);
    if (!branch || branch.isDeleted) {
      throw new NotFoundError('Branch not found');
    }

    if (branch.isHeadOffice) {
      throw new BadRequestError('Cannot delete head office');
    }

    const childBranches = await Branch.countDocuments({ parentBranchId: id, isDeleted: { $ne: true } });
    if (childBranches > 0) {
      throw new BadRequestError(`Cannot delete branch. ${childBranches} child branches exist. Please reassign or delete them first.`);
    }

    const departments = await Department.countDocuments({ branchId: id, isDeleted: { $ne: true } });
    if (departments > 0) {
      throw new BadRequestError(`Cannot delete branch. ${departments} departments exist. Please reassign or delete them first.`);
    }

    const employees = await Employee.countDocuments({ 'employmentDetails.branchId': id, isDeleted: { $ne: true }, isActive: true });
    if (employees > 0) {
      throw new BadRequestError(`Cannot delete branch. ${employees} active employees exist. Please reassign them first.`);
    }

    await branch.softDelete(user._id);

    logger.info({ branchId: id, deletedBy: user._id }, 'Branch soft deleted successfully');
    sendResponse(res, 200, true, 'Branch deleted successfully');
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error deleting branch');
    next(error);
  }
});

export const getBranchStats = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid branch ID');
    }

    const branch = await Branch.findById(id);
    if (!branch || branch.isDeleted) {
      throw new NotFoundError('Branch not found');
    }

    const [employeeStats, departmentStats, headcountByStatus, headcountByType] = await Promise.all([
      Employee.aggregate([
        { $match: { 'employmentDetails.branchId': new Types.ObjectId(id), isDeleted: { $ne: true } } },
        { $group: { _id: '$isActive', count: { $sum: 1 } } },
      ]),
      Department.aggregate([
        { $match: { branchId: new Types.ObjectId(id), isDeleted: { $ne: true } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Employee.aggregate([
        { $match: { 'employmentDetails.branchId': new Types.ObjectId(id), isDeleted: { $ne: true } } },
        { $group: { _id: '$employmentDetails.employmentStatus', count: { $sum: 1 } } },
      ]),
      Employee.aggregate([
        { $match: { 'employmentDetails.branchId': new Types.ObjectId(id), isDeleted: { $ne: true } } },
        { $group: { _id: '$employmentDetails.employmentType', count: { $sum: 1 } } },
      ]),
    ]);

    sendResponse(res, 200, true, 'Branch statistics retrieved successfully', {
      branchId: branch._id,
      branchCode: branch.code,
      branchName: branch.name,
      employees: employeeStats.reduce((acc, item) => ({ ...acc, [item._id.toString()]: item.count }), {}),
      departments: departmentStats.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
      employmentStatus: headcountByStatus.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
      employmentType: headcountByType.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
    });
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error fetching branch stats');
    next(error);
  }
});

export const getBranchHierarchy = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid branch ID');
    }

    const branch = await Branch.findById(id)
      .populate({
        path: 'childBranches',
        match: { isDeleted: { $ne: true } },
        populate: {
          path: 'childBranches',
          match: { isDeleted: { $ne: true } },
          model: 'Branch',
        },
        model: 'Branch',
      })
      .select('code name type status managerId parentBranchId');

    if (!branch || branch.isDeleted) {
      throw new NotFoundError('Branch not found');
    }

    const buildTree = (b: any, level = 0): any => ({
      _id: b._id,
      code: b.code,
      name: b.name,
      type: b.type,
      status: b.status,
      managerId: b.managerId,
      level,
      children: b.childBranches?.map((child: any) => buildTree(child, level + 1)) || [],
    });

    sendResponse(res, 200, true, 'Branch hierarchy retrieved successfully', buildTree(branch));
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error fetching branch hierarchy');
    next(error);
  }
});

export const getBranchManagers = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = req.query as Record<string, string>;
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<typeof Employee> = {
      isDeleted: { $ne: true },
      isActive: true,
      'employmentDetails.employmentStatus': { $in: ['ACTIVE', 'CONFIRMED'] },
    };

    if (query.search) {
      const searchRegex = new RegExp(query.search, 'i');
      filter.$or = [
        { 'personalInfo.firstName': searchRegex },
        { 'personalInfo.lastName': searchRegex },
        { 'employmentDetails.employeeId': searchRegex },
      ];
    }

    if (query.branchId && Types.ObjectId.isValid(query.branchId)) {
      filter['employmentDetails.branchId'] = new Types.ObjectId(query.branchId);
    }

    const [managers, total] = await Promise.all([
      Employee.find(filter)
        .sort({ 'personalInfo.firstName': 1 })
        .skip(skip)
        .limit(limit)
        .select('personalInfo.firstName personalInfo.lastName personalInfo.email employmentDetails.employeeId employmentDetails.designationId employmentDetails.departmentId')
        .populate('employmentDetails.designationId', 'title code')
        .populate('employmentDetails.departmentId', 'name code')
        .lean(),
      Employee.countDocuments(filter),
    ]);

    const meta = buildPaginationMeta(page, limit, total);
    sendResponse(res, 200, true, 'Potential branch managers retrieved successfully', managers, meta);
  } catch (error) {
    logger.error({ error, query: req.query }, 'Error fetching branch managers');
    next(error);
  }
});

export default {
  getBranches,
  createBranch,
  getBranchById,
  updateBranch,
  deleteBranch,
  getBranchStats,
  getBranchHierarchy,
  getBranchManagers,
};