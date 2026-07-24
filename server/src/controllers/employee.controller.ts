import { Request, Response, NextFunction } from 'express';
import mongoose, { Types, PipelineStage, FilterQuery } from 'mongoose';

import { Employee, IEmployee, EmploymentStatus, EmploymentType, PayFrequency } from '../models/Employee';
import { User, UserRole } from '../models/User';
import { LeaveType } from '../models/LeaveType';
import { Attendance, AttendanceStatus } from '../models/Attendance';
import { Payroll, PayrollStatus } from '../models/Payroll';
import { Department } from '../models/Department';
import { Branch } from '../models/Branch';
import { Designation } from '../models/Designation';

import { asyncHandler, AppError, NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '../middleware/error.middleware';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { PaginationMeta, PaginationParams } from '../types/api';

interface EmployeeQueryParams extends PaginationParams {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  branchId?: string;
  departmentId?: string;
  employmentStatus?: EmploymentStatus;
  employmentType?: EmploymentType;
  startDate?: string;
  endDate?: string;
}

interface EmployeeListItem {
  _id: Types.ObjectId;
  personalInfo: {
    firstName: string;
    middleName?: string;
    lastName: string;
    email: string;
    phone: string;
  };
  employmentDetails: {
    employeeId: string;
    branchId: Types.ObjectId;
    departmentId: Types.ObjectId;
    designationId: Types.ObjectId;
    reportingManagerId?: Types.ObjectId;
    employmentType: EmploymentType;
    employmentStatus: EmploymentStatus;
    joiningDate: Date;
    workLocation: string;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  fullName: string;
  age: number;
  tenure: number;
  isCurrentEmployee: boolean;
}

interface PopulatedEmployee extends Omit<IEmployee, 'employmentDetails'> {
  employmentDetails: {
    employeeId: string;
    branchId: { _id: Types.ObjectId; name: string; code: string };
    departmentId: { _id: Types.ObjectId; name: string; code: string };
    designationId: { _id: Types.ObjectId; title: string; code: string };
    reportingManagerId?: { _id: Types.ObjectId; personalInfo: { firstName: string; lastName: string }; employmentDetails: { employeeId: string } };
    employmentType: EmploymentType;
    employmentStatus: EmploymentStatus;
    joiningDate: Date;
    confirmationDate?: Date;
    probationEndDate?: Date;
    contractEndDate?: Date;
    resignationDate?: Date;
    lastWorkingDay?: Date;
    terminationDate?: Date;
    terminationReason?: string;
    noticePeriodDays: number;
    payFrequency: PayFrequency;
    currentSalary?: { _id: Types.ObjectId; code: string; name: string; ctc: number };
    workLocation: string;
    shiftId?: Types.ObjectId;
    employeeGrade?: string;
    employeeCategory?: string;
  };
  createdBy: { _id: Types.ObjectId; profile: { firstName: string; lastName: string } };
  updatedBy?: { _id: Types.ObjectId; profile: { firstName: string; lastName: string } };
  userId?: { _id: Types.ObjectId; email: string; username: string; role: string; status: string };
  fullName: string;
  age: number;
  tenure: number;
  isCurrentEmployee: boolean;
}

const buildEmployeeFilter = (query: EmployeeQueryParams, user: AuthenticatedRequest['user']): FilterQuery<IEmployee> => {
  const filter: FilterQuery<IEmployee> = { isDeleted: { $ne: true } };

  if (query.search) {
    const searchRegex = new RegExp(query.search, 'i');
    filter.$or = [
      { 'personalInfo.firstName': searchRegex },
      { 'personalInfo.lastName': searchRegex },
      { 'personalInfo.email': searchRegex },
      { 'employmentDetails.employeeId': searchRegex },
    ];
  }

  if (query.branchId && Types.ObjectId.isValid(query.branchId)) {
    filter['employmentDetails.branchId'] = new Types.ObjectId(query.branchId);
  }

  if (query.departmentId && Types.ObjectId.isValid(query.departmentId)) {
    filter['employmentDetails.departmentId'] = new Types.ObjectId(query.departmentId);
  }

  if (query.employmentStatus) {
    filter['employmentDetails.employmentStatus'] = query.employmentStatus;
  }

  if (query.employmentType) {
    filter['employmentDetails.employmentType'] = query.employmentType;
  }

  if (query.startDate || query.endDate) {
    filter['employmentDetails.joiningDate'] = {};
    if (query.startDate) {
      filter['employmentDetails.joiningDate'].$gte = new Date(query.startDate);
    }
    if (query.endDate) {
      filter['employmentDetails.joiningDate'].$lte = new Date(query.endDate);
    }
  }

  // Role-based filtering
  if (user) {
    const userRole = user.role;
    const userId = user._id;

    if (userRole === UserRole.EMPLOYEE) {
      filter['employmentDetails.userId'] = userId;
    } else if (userRole === UserRole.DEPT_HEAD) {
      filter['employmentDetails.departmentId'] = user.departmentId;
    } else if (userRole === UserRole.HR_MANAGER) {
      if (user.branchId) {
        filter['employmentDetails.branchId'] = user.branchId;
      }
    }
  }

  return filter;
};

const buildSortStage = (sortBy?: string, sortOrder?: 'asc' | 'desc'): { [key: string]: 1 | -1 } => {
  const sortField = sortBy || 'createdAt';
  const order = sortOrder === 'asc' ? 1 : -1;
  const sortMap: Record<string, string> = {
    'firstName': 'personalInfo.firstName',
    'lastName': 'personalInfo.lastName',
    'email': 'personalInfo.email',
    'employeeId': 'employmentDetails.employeeId',
    'joiningDate': 'employmentDetails.joiningDate',
    'employmentStatus': 'employmentDetails.employmentStatus',
    'branch': 'employmentDetails.branchId',
    'department': 'employmentDetails.departmentId',
    'createdAt': 'createdAt',
    'updatedAt': 'updatedAt',
  };
  return { [sortMap[sortField] || sortField]: order };
};

const populateEmployeeQuery = (query: mongoose.Query<PopulatedEmployee[], IEmployee>): mongoose.Query<PopulatedEmployee[], IEmployee> => {
  return query
    .populate('employmentDetails.branchId', 'name code')
    .populate('employmentDetails.departmentId', 'name code')
    .populate('employmentDetails.designationId', 'title code')
    .populate({
      path: 'employmentDetails.reportingManagerId',
      select: 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId',
      model: 'Employee',
    })
    .populate({
      path: 'employmentDetails.currentSalary',
      select: 'code name ctc',
      model: 'SalaryStructure',
    })
    .populate('createdBy', 'profile.firstName profile.lastName')
    .populate('updatedBy', 'profile.firstName profile.lastName')
    .populate({
      path: 'employmentDetails.userId',
      select: 'email username role status',
      model: 'User',
    });
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

export const getEmployees = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = req.query as unknown as EmployeeQueryParams;
    const user = (req as AuthenticatedRequest).user;

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const filter = buildEmployeeFilter(query, user);
    const sort = buildSortStage(query.sortBy, query.sortOrder);

    const [employees, total] = await Promise.all([
      Employee.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select('-bankDetails -statutoryDetails -documents -familyDetails -education -experience -skills -languages -customFields -notes -__v')
        .populate('employmentDetails.branchId', 'name code')
        .populate('employmentDetails.departmentId', 'name code')
        .populate('employmentDetails.designationId', 'title code')
        .lean(),
      Employee.countDocuments(filter),
    ]);

    const meta = buildPaginationMeta(page, limit, total);
    sendResponse(res, 200, true, 'Employees retrieved successfully', employees as EmployeeListItem[], meta);
  } catch (error) {
    logger.error({ error, query: req.query }, 'Error fetching employees');
    next(error);
  }
});

export const createEmployee = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const input = req.body;

    if (input.employmentDetails?.reportingManagerId) {
      const manager = await Employee.findById(input.employmentDetails.reportingManagerId);
      if (!manager) {
        throw new NotFoundError('Reporting manager not found');
      }
    }

    const existingEmployee = await Employee.findOne({
      'employmentDetails.employeeId': input.employmentDetails?.employeeId?.toUpperCase(),
    });

    if (existingEmployee) {
      throw new ConflictError('Employee ID already exists');
    }

    const existingEmail = await Employee.findOne({
      'personalInfo.email': input.personalInfo?.email?.toLowerCase(),
    });

    if (existingEmail) {
      throw new ConflictError('Email already registered');
    }

    const employee = await Employee.create({
      ...input,
      employmentDetails: {
        ...input.employmentDetails,
        employeeId: input.employmentDetails?.employeeId?.toUpperCase(),
        branchId: new Types.ObjectId(input.employmentDetails?.branchId),
        departmentId: new Types.ObjectId(input.employmentDetails?.departmentId),
        designationId: new Types.ObjectId(input.employmentDetails?.designationId),
        reportingManagerId: input.employmentDetails?.reportingManagerId
          ? new Types.ObjectId(input.employmentDetails.reportingManagerId)
          : undefined,
        joiningDate: new Date(input.employmentDetails?.joiningDate),
        confirmationDate: input.employmentDetails?.confirmationDate ? new Date(input.employmentDetails.confirmationDate) : undefined,
        probationEndDate: input.employmentDetails?.probationEndDate ? new Date(input.employmentDetails.probationEndDate) : undefined,
        contractEndDate: input.employmentDetails?.contractEndDate ? new Date(input.employmentDetails.contractEndDate) : undefined,
      },
      bankDetails: input.bankDetails?.map((bd: any) => ({
        ...bd,
        ifscCode: bd.ifscCode?.toUpperCase(),
      })) || [],
      statutoryDetails: {
        ...input.statutoryDetails,
        panNumber: input.statutoryDetails?.panNumber?.toUpperCase(),
        aadhaarNumber: input.statutoryDetails?.aadhaarNumber,
        uanNumber: input.statutoryDetails?.uanNumber?.toUpperCase(),
        esicNumber: input.statutoryDetails?.esicNumber?.toUpperCase(),
        pfNumber: input.statutoryDetails?.pfNumber?.toUpperCase(),
        passportNumber: input.statutoryDetails?.passportNumber?.toUpperCase(),
        passportExpiry: input.statutoryDetails?.passportExpiry ? new Date(input.statutoryDetails.passportExpiry) : undefined,
        drivingLicenseNumber: input.statutoryDetails?.drivingLicenseNumber?.toUpperCase(),
        drivingLicenseExpiry: input.statutoryDetails?.drivingLicenseExpiry ? new Date(input.statutoryDetails.drivingLicenseExpiry) : undefined,
      },
      personalInfo: {
        ...input.personalInfo,
        email: input.personalInfo?.email?.toLowerCase(),
        personalEmail: input.personalInfo?.personalEmail?.toLowerCase(),
        dateOfBirth: new Date(input.personalInfo?.dateOfBirth),
      },
      createdBy: user._id,
    });

    const populatedEmployee = await Employee.findById(employee._id)
      .populate('employmentDetails.branchId', 'name code')
      .populate('employmentDetails.departmentId', 'name code')
      .populate('employmentDetails.designationId', 'title code')
      .populate({
        path: 'employmentDetails.reportingManagerId',
        select: 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId',
        model: 'Employee',
      });

    logger.info({ employeeId: employee._id, createdBy: user._id }, 'Employee created successfully');
    sendResponse(res, 201, true, 'Employee created successfully', populatedEmployee);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error creating employee');
    next(error);
  }
});

export const getEmployeeById = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid employee ID');
    }

    const employee = await Employee.findById(id)
      .populate('employmentDetails.branchId', 'name code address')
      .populate('employmentDetails.departmentId', 'name code description')
      .populate('employmentDetails.designationId', 'title code description level')
      .populate({
        path: 'employmentDetails.reportingManagerId',
        select: 'personalInfo.firstName personalInfo.lastName personalInfo.email employmentDetails.employeeId employmentDetails.departmentId',
        populate: {
          path: 'employmentDetails.departmentId',
          select: 'name code',
        },
      })
      .populate({
        path: 'employmentDetails.currentSalary',
        select: 'code name ctc grossSalary netSalary components',
      })
      .populate({
        path: 'employmentDetails.shiftId',
        select: 'name code startTime endTime',
      })
      .populate('createdBy', 'profile.firstName profile.lastName email')
      .populate('updatedBy', 'profile.firstName profile.lastName email')
      .populate({
        path: 'employmentDetails.userId',
        select: 'email username role status profile.firstName profile.lastName',
      });

    if (!employee || employee.isDeleted) {
      throw new NotFoundError('Employee not found');
    }

    if (user?.role === UserRole.EMPLOYEE) {
      const userEmployee = await Employee.findOne({ 'employmentDetails.userId': user._id });
      if (!userEmployee || !userEmployee._id.equals(employee._id)) {
        throw new ForbiddenError('You can only view your own profile');
      }
    }

    sendResponse(res, 200, true, 'Employee retrieved successfully', employee);
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error fetching employee by ID');
    next(error);
  }
});

export const updateEmployee = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const input = req.body;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid employee ID');
    }

    const employee = await Employee.findById(id);
    if (!employee || employee.isDeleted) {
      throw new NotFoundError('Employee not found');
    }

    if (input.employmentDetails?.reportingManagerId) {
      const manager = await Employee.findById(input.employmentDetails.reportingManagerId);
      if (!manager) {
        throw new NotFoundError('Reporting manager not found');
      }
      if (manager._id.equals(employee._id)) {
        throw new BadRequestError('Employee cannot be their own reporting manager');
      }
    }

    const updateData: Record<string, any> = { updatedBy: user._id };

    if (input.personalInfo) {
      const pi = input.personalInfo;
      if (pi.firstName) updateData['personalInfo.firstName'] = pi.firstName;
      if (pi.lastName) updateData['personalInfo.lastName'] = pi.lastName;
      if (pi.middleName !== undefined) updateData['personalInfo.middleName'] = pi.middleName;
      if (pi.personalEmail !== undefined) updateData['personalInfo.personalEmail'] = pi.personalEmail?.toLowerCase();
      if (pi.phone) updateData['personalInfo.phone'] = pi.phone;
      if (pi.alternatePhone !== undefined) updateData['personalInfo.alternatePhone'] = pi.alternatePhone;
      if (pi.bloodGroup !== undefined) updateData['personalInfo.bloodGroup'] = pi.bloodGroup;
      if (pi.religion !== undefined) updateData['personalInfo.religion'] = pi.religion;
      if (pi.address) {
        Object.entries(pi.address).forEach(([key, value]) => {
          if (value !== undefined) updateData[`personalInfo.address.${key}`] = value;
        });
      }
      if (pi.emergencyContact) {
        Object.entries(pi.emergencyContact).forEach(([key, value]) => {
          if (value !== undefined) updateData[`personalInfo.emergencyContact.${key}`] = value;
        });
      }
    }

    if (input.employmentDetails) {
      const ed = input.employmentDetails;
      if (ed.branchId) updateData['employmentDetails.branchId'] = new Types.ObjectId(ed.branchId);
      if (ed.departmentId) updateData['employmentDetails.departmentId'] = new Types.ObjectId(ed.departmentId);
      if (ed.designationId) updateData['employmentDetails.designationId'] = new Types.ObjectId(ed.designationId);
      if (ed.reportingManagerId !== undefined) {
        updateData['employmentDetails.reportingManagerId'] = ed.reportingManagerId
          ? new Types.ObjectId(ed.reportingManagerId)
          : null;
      }
      if (ed.employmentType) updateData['employmentDetails.employmentType'] = ed.employmentType;
      if (ed.employmentStatus) updateData['employmentDetails.employmentStatus'] = ed.employmentStatus;
      if (ed.confirmationDate) updateData['employmentDetails.confirmationDate'] = new Date(ed.confirmationDate);
      if (ed.probationEndDate) updateData['employmentDetails.probationEndDate'] = new Date(ed.probationEndDate);
      if (ed.contractEndDate) updateData['employmentDetails.contractEndDate'] = new Date(ed.contractEndDate);
      if (ed.resignationDate) updateData['employmentDetails.resignationDate'] = new Date(ed.resignationDate);
      if (ed.lastWorkingDay) updateData['employmentDetails.lastWorkingDay'] = new Date(ed.lastWorkingDay);
      if (ed.terminationDate) updateData['employmentDetails.terminationDate'] = new Date(ed.terminationDate);
      if (ed.terminationReason !== undefined) updateData['employmentDetails.terminationReason'] = ed.terminationReason;
      if (ed.noticePeriodDays !== undefined) updateData['employmentDetails.noticePeriodDays'] = ed.noticePeriodDays;
      if (ed.payFrequency) updateData['employmentDetails.payFrequency'] = ed.payFrequency;
      if (ed.currentSalary !== undefined) updateData['employmentDetails.currentSalary'] = ed.currentSalary ? new Types.ObjectId(ed.currentSalary) : null;
      if (ed.workLocation) updateData['employmentDetails.workLocation'] = ed.workLocation;
      if (ed.shiftId !== undefined) updateData['employmentDetails.shiftId'] = ed.shiftId ? new Types.ObjectId(ed.shiftId) : null;
      if (ed.employeeGrade !== undefined) updateData['employmentDetails.employeeGrade'] = ed.employeeGrade;
      if (ed.employeeCategory !== undefined) updateData['employmentDetails.employeeCategory'] = ed.employeeCategory;
    }

    if (input.bankDetails) {
      updateData.bankDetails = input.bankDetails.map((bd: any) => ({
        ...bd,
        ifscCode: bd.ifscCode?.toUpperCase(),
      }));
    }

    if (input.statutoryDetails) {
      const sd = input.statutoryDetails;
      if (sd.panNumber !== undefined) updateData['statutoryDetails.panNumber'] = sd.panNumber?.toUpperCase();
      if (sd.aadhaarNumber !== undefined) updateData['statutoryDetails.aadhaarNumber'] = sd.aadhaarNumber;
      if (sd.uanNumber !== undefined) updateData['statutoryDetails.uanNumber'] = sd.uanNumber?.toUpperCase();
      if (sd.esicNumber !== undefined) updateData['statutoryDetails.esicNumber'] = sd.esicNumber?.toUpperCase();
      if (sd.pfNumber !== undefined) updateData['statutoryDetails.pfNumber'] = sd.pfNumber?.toUpperCase();
      if (sd.passportNumber !== undefined) updateData['statutoryDetails.passportNumber'] = sd.passportNumber?.toUpperCase();
      if (sd.passportExpiry) updateData['statutoryDetails.passportExpiry'] = new Date(sd.passportExpiry);
      if (sd.drivingLicenseNumber !== undefined) updateData['statutoryDetails.drivingLicenseNumber'] = sd.drivingLicenseNumber?.toUpperCase();
      if (sd.drivingLicenseExpiry) updateData['statutoryDetails.drivingLicenseExpiry'] = new Date(sd.drivingLicenseExpiry);
      if (sd.voterId !== undefined) updateData['statutoryDetails.voterId'] = sd.voterId;
    }

    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.notes !== undefined) updateData.notes = input.notes;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;

    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('employmentDetails.branchId', 'name code')
      .populate('employmentDetails.departmentId', 'name code')
      .populate('employmentDetails.designationId', 'title code')
      .populate({
        path: 'employmentDetails.reportingManagerId',
        select: 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId',
      });

    if (!updatedEmployee) {
      throw new NotFoundError('Employee not found after update');
    }

    logger.info({ employeeId: id, updatedBy: user._id }, 'Employee updated successfully');
    sendResponse(res, 200, true, 'Employee updated successfully', updatedEmployee);
  } catch (error) {
    logger.error({ error, params: req.params, body: req.body }, 'Error updating employee');
    next(error);
  }
});

export const deleteEmployee = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid employee ID');
    }

    const employee = await Employee.findById(id);
    if (!employee || employee.isDeleted) {
      throw new NotFoundError('Employee not found');
    }

    const directReports = await Employee.countDocuments({
      'employmentDetails.reportingManagerId': id,
      isDeleted: { $ne: true },
    });

    if (directReports > 0) {
      throw new BadRequestError(`Cannot delete employee. ${directReports} direct reports exist. Please reassign them first.`);
    }

    await employee.softDelete(user._id);

    if (employee.employmentDetails.userId) {
      await User.findByIdAndUpdate(employee.employmentDetails.userId, {
        status: 'INACTIVE',
        updatedBy: user._id,
      });
    }

    logger.info({ employeeId: id, deletedBy: user._id }, 'Employee soft deleted successfully');
    sendResponse(res, 200, true, 'Employee deleted successfully');
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error deleting employee');
    next(error);
  }
});

export const getEmployeeDocuments = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const user = (req as AuthenticatedRequest).user;

    if (!Types.ObjectId.isValid(employeeId)) {
      throw new BadRequestError('Invalid employee ID');
    }

    const employee = await Employee.findById(employeeId).select('documents personalInfo.firstName personalInfo.lastName employmentDetails.employeeId');
    if (!employee || employee.isDeleted) {
      throw new NotFoundError('Employee not found');
    }

    if (user?.role === UserRole.EMPLOYEE) {
      const userEmployee = await Employee.findOne({ 'employmentDetails.userId': user._id });
      if (!userEmployee || !userEmployee._id.equals(employee._id)) {
        throw new ForbiddenError('You can only view your own documents');
      }
    }

    sendResponse(res, 200, true, 'Employee documents retrieved successfully', {
      employeeId: employee._id,
      employeeCode: employee.employmentDetails.employeeId,
      employeeName: employee.fullName,
      documents: employee.documents,
    });
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error fetching employee documents');
    next(error);
  }
});

export const uploadDocument = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const { documentType, name, fileUrl, fileType, fileSize } = req.body;

    if (!Types.ObjectId.isValid(employeeId)) {
      throw new BadRequestError('Invalid employee ID');
    }

    const validDocumentTypes = [
      'idProof',
      'addressProof',
      'educationProofs',
      'experienceLetters',
      'offerLetter',
      'appointmentLetter',
      'relievingLetter',
      'experienceCertificate',
      'otherDocuments',
    ];

    if (!validDocumentTypes.includes(documentType)) {
      throw new BadRequestError(`Invalid document type. Valid types: ${validDocumentTypes.join(', ')}`);
    }

    const employee = await Employee.findById(employeeId);
    if (!employee || employee.isDeleted) {
      throw new NotFoundError('Employee not found');
    }

    const document = {
      name,
      fileUrl,
      fileType,
      fileSize,
      uploadedAt: new Date(),
      verified: false,
    };

    const updatePath = `documents.${documentType}`;
    if (['educationProofs', 'experienceLetters', 'otherDocuments'].includes(documentType)) {
      await Employee.findByIdAndUpdate(employeeId, {
        $push: { [updatePath]: document },
        updatedBy: user._id,
      });
    } else {
      await Employee.findByIdAndUpdate(employeeId, {
        $set: { [updatePath]: document },
        updatedBy: user._id,
      });
    }

    const updatedEmployee = await Employee.findById(employeeId).select('documents');
    logger.info({ employeeId, documentType, uploadedBy: user._id }, 'Document uploaded successfully');

    sendResponse(res, 201, true, 'Document uploaded successfully', {
      documentType,
      document: updatedEmployee?.documents?.[documentType as keyof typeof updatedEmployee.documents],
    });
  } catch (error) {
    logger.error({ error, params: req.params, body: req.body }, 'Error uploading document');
    next(error);
  }
});

export const getLeaveBalance = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const { year } = req.query;

    if (!Types.ObjectId.isValid(employeeId)) {
      throw new BadRequestError('Invalid employee ID');
    }

    if (user?.role === UserRole.EMPLOYEE) {
      const userEmployee = await Employee.findOne({ 'employmentDetails.userId': user._id });
      if (!userEmployee || !userEmployee._id.equals(employeeId)) {
        throw new ForbiddenError('You can only view your own leave balance');
      }
    }

    const employee = await Employee.findById(employeeId).select('personalInfo employmentDetails');
    if (!employee || employee.isDeleted) {
      throw new NotFoundError('Employee not found');
    }

    const targetYear = year ? parseInt(year as string, 10) : new Date().getFullYear();

    const LeaveBalance = mongoose.model('LeaveBalance');
    const balances = await LeaveBalance.find({
      employeeId: new Types.ObjectId(employeeId),
      year: targetYear,
    }).populate('leaveTypeId', 'code name category color config');

    const leaveTypes = await LeaveType.find({ isActive: true, isDeleted: { $ne: true } })
      .select('code name category config.color')
      .lean();

    const balanceMap = new Map(balances.map(b => [b.leaveTypeId.toString(), b]));
    const result = leaveTypes.map(lt => {
      const balance = balanceMap.get(lt._id.toString());
      return {
        leaveTypeId: lt._id,
        leaveTypeCode: lt.code,
        leaveTypeName: lt.name,
        category: lt.category,
        color: lt.config?.color || '#000000',
        accrued: balance?.accrued || 0,
        used: balance?.used || 0,
        available: balance?.available || 0,
        carriedForward: balance?.carriedForward || 0,
        encashed: balance?.encashed || 0,
      };
    });

    sendResponse(res, 200, true, 'Leave balance retrieved successfully', {
      employeeId: employee._id,
      employeeCode: employee.employmentDetails.employeeId,
      employeeName: employee.fullName,
      year: targetYear,
      balances: result,
    });
  } catch (error) {
    logger.error({ error, params: req.params, query: req.query }, 'Error fetching leave balance');
    next(error);
  }
});

export const getAttendance = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const query = req.query as Record<string, string>;

    if (!Types.ObjectId.isValid(employeeId)) {
      throw new BadRequestError('Invalid employee ID');
    }

    if (user?.role === UserRole.EMPLOYEE) {
      const userEmployee = await Employee.findOne({ 'employmentDetails.userId': user._id });
      if (!userEmployee || !userEmployee._id.equals(employeeId)) {
        throw new ForbiddenError('You can only view your own attendance');
      }
    }

    const employee = await Employee.findById(employeeId).select('personalInfo employmentDetails');
    if (!employee || employee.isDeleted) {
      throw new NotFoundError('Employee not found');
    }

    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<typeof Attendance> = {
      employeeId: new Types.ObjectId(employeeId),
      isDeleted: { $ne: true },
    };

    if (query.startDate || query.endDate) {
      filter.date = {};
      if (query.startDate) filter.date.$gte = new Date(query.startDate);
      if (query.endDate) filter.date.$lte = new Date(query.endDate);
    }

    if (query.status) {
      filter.status = query.status as AttendanceStatus;
    }

    if (query.shiftId && Types.ObjectId.isValid(query.shiftId)) {
      filter.shiftId = new Types.ObjectId(query.shiftId);
    }

    const sortField = query.sortBy || 'date';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const [records, total] = await Promise.all([
      Attendance.find(filter)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .populate('shiftId', 'name code startTime endTime')
        .populate('approvedBy', 'profile.firstName profile.lastName')
        .populate('manualEntryBy', 'profile.firstName profile.lastName')
        .lean(),
      Attendance.countDocuments(filter),
    ]);

    const summary = await Attendance.aggregate([
      { $match: { employeeId: new Types.ObjectId(employeeId), isDeleted: { $ne: true } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalWorkMinutes: { $sum: '$totalWorkMinutes' },
          totalOvertimeMinutes: { $sum: '$overtimeMinutes' },
        },
      },
    ]);

    const meta = buildPaginationMeta(page, limit, total);

    sendResponse(res, 200, true, 'Attendance records retrieved successfully', {
      employeeId: employee._id,
      employeeCode: employee.employmentDetails.employeeId,
      employeeName: employee.fullName,
      records,
      summary: summary.reduce((acc, item) => {
        acc[item._id] = { count: item.count, totalWorkMinutes: item.totalWorkMinutes, totalOvertimeMinutes: item.totalOvertimeMinutes };
        return acc;
      }, {} as Record<string, { count: number; totalWorkMinutes: number; totalOvertimeMinutes: number }>),
    }, meta);
  } catch (error) {
    logger.error({ error, params: req.params, query: req.query }, 'Error fetching attendance');
    next(error);
  }
});

export const getPayroll = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const query = req.query as Record<string, string>;

    if (!Types.ObjectId.isValid(employeeId)) {
      throw new BadRequestError('Invalid employee ID');
    }

    const employee = await Employee.findById(employeeId).select('personalInfo employmentDetails');
    if (!employee || employee.isDeleted) {
      throw new NotFoundError('Employee not found');
    }

    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<typeof Payroll> = {
      'employees.employeeId': new Types.ObjectId(employeeId),
      isDeleted: { $ne: true },
    };

    if (query.status) {
      filter.status = query.status as PayrollStatus;
    }

    if (query.startDate || query.endDate) {
      filter.periodStart = {};
      if (query.startDate) filter.periodStart.$gte = new Date(query.startDate);
      if (query.endDate) filter.periodStart.$lte = new Date(query.endDate);
    }

    const [payrolls, total] = await Promise.all([
      Payroll.find(filter)
        .sort({ periodStart: -1 })
        .skip(skip)
        .limit(limit)
        .populate('processedBy', 'profile.firstName profile.lastName')
        .populate('approvedBy', 'profile.firstName profile.lastName')
        .populate('paidBy', 'profile.firstName profile.lastName')
        .lean(),
      Payroll.countDocuments(filter),
    ]);

    const employeePayrolls = payrolls.map(payroll => {
      const empPayroll = payroll.employees.find(e => e.employeeId.toString() === employeeId);
      return empPayroll ? {
        payrollId: payroll._id,
        runNumber: payroll.runNumber,
        name: payroll.name,
        periodStart: payroll.periodStart,
        periodEnd: payroll.periodEnd,
        payDate: payroll.payDate,
        status: payroll.status,
        workingDays: empPayroll.workingDays,
        paidDays: empPayroll.paidDays,
        lopDays: empPayroll.lopDays,
        grossEarnings: empPayroll.grossEarnings,
        grossDeductions: empPayroll.grossDeductions,
        netPay: empPayroll.netPay,
        taxDeducted: empPayroll.taxDeducted,
        tdsAmount: empPayroll.tdsAmount,
        pfEmployee: empPayroll.pfEmployee,
        pfEmployer: empPayroll.pfEmployer,
        esicEmployee: empPayroll.esicEmployee,
        esicEmployer: empPayroll.esicEmployer,
        professionalTax: empPayroll.professionalTax,
        components: empPayroll.components,
        remarks: empPayroll.remarks,
        bankFileGenerated: payroll.bankFileGenerated,
        payslipGenerated: payroll.payslipGenerated,
        payslipUrl: payroll.payslipUrl,
      } : null;
    }).filter(Boolean);

    const meta = buildPaginationMeta(page, limit, total);

    sendResponse(res, 200, true, 'Payroll records retrieved successfully', {
      employeeId: employee._id,
      employeeCode: employee.employmentDetails.employeeId,
      employeeName: employee.fullName,
      payrolls: employeePayrolls,
    }, meta);
  } catch (error) {
    logger.error({ error, params: req.params, query: req.query }, 'Error fetching payroll');
    next(error);
  }
});

export const getReportingManager = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid employee ID');
    }

    const employee = await Employee.findById(id).select('employmentDetails.reportingManagerId');
    if (!employee || employee.isDeleted) {
      throw new NotFoundError('Employee not found');
    }

    if (!employee.employmentDetails.reportingManagerId) {
      sendResponse(res, 200, true, 'No reporting manager assigned', null);
      return;
    }

    const manager = await Employee.findById(employee.employmentDetails.reportingManagerId)
      .populate('employmentDetails.branchId', 'name code')
      .populate('employmentDetails.departmentId', 'name code')
      .populate('employmentDetails.designationId', 'title code')
      .select('personalInfo employmentDetails isActive');

    if (!manager || manager.isDeleted) {
      sendResponse(res, 200, true, 'Reporting manager not found', null);
      return;
    }

    sendResponse(res, 200, true, 'Reporting manager retrieved successfully', {
      _id: manager._id,
      employeeCode: manager.employmentDetails.employeeId,
      fullName: manager.fullName,
      email: manager.personalInfo.email,
      phone: manager.personalInfo.phone,
      branch: manager.employmentDetails.branchId,
      department: manager.employmentDetails.departmentId,
      designation: manager.employmentDetails.designationId,
      isActive: manager.isActive,
    });
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error fetching reporting manager');
    next(error);
  }
});

export const getDirectReports = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const query = req.query as Record<string, string>;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid employee ID');
    }

    const employee = await Employee.findById(id);
    if (!employee || employee.isDeleted) {
      throw new NotFoundError('Employee not found');
    }

    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<IEmployee> = {
      'employmentDetails.reportingManagerId': new Types.ObjectId(id),
      isDeleted: { $ne: true },
    };

    if (query.employmentStatus) {
      filter['employmentDetails.employmentStatus'] = query.employmentStatus as EmploymentStatus;
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === 'true';
    }

    const [reports, total] = await Promise.all([
      Employee.find(filter)
        .sort({ 'personalInfo.firstName': 1 })
        .skip(skip)
        .limit(limit)
        .populate('employmentDetails.branchId', 'name code')
        .populate('employmentDetails.departmentId', 'name code')
        .populate('employmentDetails.designationId', 'title code')
        .select('personalInfo employmentDetails isActive createdAt')
        .lean(),
      Employee.countDocuments(filter),
    ]);

    const meta = buildPaginationMeta(page, limit, total);

    sendResponse(res, 200, true, 'Direct reports retrieved successfully', {
      managerId: employee._id,
      managerName: employee.fullName,
      reports: reports.map(r => ({
        _id: r._id,
        employeeCode: r.employmentDetails.employeeId,
        fullName: r.fullName,
        email: r.personalInfo.email,
        phone: r.personalInfo.phone,
        branch: r.employmentDetails.branchId,
        department: r.employmentDetails.departmentId,
        designation: r.employmentDetails.designationId,
        employmentStatus: r.employmentDetails.employmentStatus,
        isActive: r.isActive,
        joiningDate: r.employmentDetails.joiningDate,
        tenure: r.tenure,
      })),
    }, meta);
  } catch (error) {
    logger.error({ error, params: req.params, query: req.query }, 'Error fetching direct reports');
    next(error);
  }
});

export default {
  getEmployees,
  createEmployee,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  getEmployeeDocuments,
  uploadDocument,
  getLeaveBalance,
  getAttendance,
  getPayroll,
  getReportingManager,
  getDirectReports,
};