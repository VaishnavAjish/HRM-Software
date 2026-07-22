import { Request, Response, NextFunction } from 'express';
import mongoose, { Types, FilterQuery } from 'mongoose';

import { LeaveRequest, ILeaveRequest, LeaveRequestStatus, LeaveSession } from '../models/Leave';
import { LeaveType, LeaveCategory, ILeaveTypeConfig } from '../models/LeaveType';
import { Employee } from '../models/Employee';
import { LeaveBalance } from '../models/LeaveBalance';

import { asyncHandler, AppError, NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '../middleware/error.middleware';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { PaginationMeta, PaginationParams } from '../types/api';

interface LeaveQueryParams extends PaginationParams {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  employeeId?: string;
  branchId?: string;
  departmentId?: string;
  leaveTypeId?: string;
  status?: LeaveRequestStatus;
  startDate?: string;
  endDate?: string;
  isEmergency?: string;
}

interface CreateLeaveRequestInput {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  session: LeaveSession;
  reason: string;
  contactDuringLeave?: { phone?: string; email?: string; address?: string };
  handoverTo?: string;
  handoverNotes?: string;
  attachments?: Array<{ name: string; fileUrl: string; fileType: string; fileSize: number }>;
  isEmergency?: boolean;
}

interface UpdateLeaveRequestInput {
  leaveTypeId?: string;
  startDate?: string;
  endDate?: string;
  session?: LeaveSession;
  reason?: string;
  contactDuringLeave?: { phone?: string; email?: string; address?: string };
  handoverTo?: string;
  handoverNotes?: string;
  isEmergency?: boolean;
}

interface ApproveRejectInput {
  action: 'APPROVE' | 'REJECT' | 'DELEGATE';
  comments?: string;
  delegatedTo?: string;
}

interface LeaveBalanceQueryParams extends PaginationParams {
  employeeId?: string;
  year?: number;
  leaveTypeId?: string;
}

const buildLeaveFilter = async (query: LeaveQueryParams, user: AuthenticatedRequest['user']): Promise<FilterQuery<ILeaveRequest>> => {
  const filter: FilterQuery<ILeaveRequest> = { isDeleted: { $ne: true } };

  if (query.employeeId && Types.ObjectId.isValid(query.employeeId)) {
    filter.employeeId = new Types.ObjectId(query.employeeId);
  }

  if (query.leaveTypeId && Types.ObjectId.isValid(query.leaveTypeId)) {
    filter.leaveTypeId = new Types.ObjectId(query.leaveTypeId);
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.isEmergency !== undefined) {
    filter.isEmergency = query.isEmergency === 'true';
  }

  if (query.startDate || query.endDate) {
    filter.$and = [];
    if (query.startDate) {
      filter.$and.push({ endDate: { $gte: new Date(query.startDate) } });
    }
    if (query.endDate) {
      filter.$and.push({ startDate: { $lte: new Date(query.endDate) } });
    }
    if (filter.$and.length === 0) delete filter.$and;
  }

  if (user) {
    const userRole = user.role;
    const userId = user._id;

    if (userRole === 'EMPLOYEE') {
      const employee = await Employee.findOne({ 'employmentDetails.userId': userId });
      if (employee) {
        filter.employeeId = employee._id;
      }
    } else if (userRole === 'DEPT_HEAD') {
      const employeeIds = await Employee.find({ 'employmentDetails.departmentId': user.departmentId, isDeleted: { $ne: true } })
        .select('_id')
        .lean();
      filter.employeeId = { $in: employeeIds.map(e => e._id) };
      filter.status = { $in: [LeaveRequestStatus.SUBMITTED, LeaveRequestStatus.PENDING_APPROVAL] };
    } else if (userRole === 'HR_MANAGER') {
      if (user.branchId) {
        const employeeIds = await Employee.find({ 'employmentDetails.branchId': user.branchId, isDeleted: { $ne: true } })
          .select('_id')
          .lean();
        filter.employeeId = { $in: employeeIds.map(e => e._id) };
      }
    } else if (userRole === 'REPORTING_MANAGER') {
      const employeeIds = await Employee.find({ 'employmentDetails.reportingManagerId': userId, isDeleted: { $ne: true } })
        .select('_id')
        .lean();
      filter.employeeId = { $in: employeeIds.map(e => e._id) };
      filter.status = { $in: [LeaveRequestStatus.SUBMITTED, LeaveRequestStatus.PENDING_APPROVAL] };
    }
  }

  return filter;
};

const buildSortStage = (sortBy?: string, sortOrder?: 'asc' | 'desc'): { [key: string]: 1 | -1 } => {
  const sortField = sortBy || 'appliedAt';
  const order = sortOrder === 'asc' ? 1 : -1;
  const sortMap: Record<string, string> = {
    employeeId: 'employeeId',
    leaveTypeId: 'leaveTypeId',
    startDate: 'startDate',
    endDate: 'endDate',
    status: 'status',
    appliedAt: 'appliedAt',
    submittedAt: 'submittedAt',
    createdAt: 'createdAt',
  };
  return { [sortMap[sortField] || sortField]: order };
};

const buildPaginationMeta = (page: number, limit: number, total: number): PaginationMeta => {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
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

export const getLeaveRequests = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = req.query as unknown as LeaveQueryParams;
    const user = (req as AuthenticatedRequest).user;

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const filter = await buildLeaveFilter(query, user);
    const sort = buildSortStage(query.sortBy, query.sortOrder);

    const [requests, total] = await Promise.all([
      LeaveRequest.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('employeeId', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId employmentDetails.departmentId employmentDetails.designationId')
        .populate('leaveTypeId', 'code name category config.color')
        .populate('handoverTo', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId')
        .populate('approvalWorkflow.approverId', 'profile.firstName profile.lastName')
        .populate('approvalWorkflow.delegatedTo', 'profile.firstName profile.lastName')
        .populate('createdBy', 'profile.firstName profile.lastName')
        .lean(),
      LeaveRequest.countDocuments(filter),
    ]);

    const meta = buildPaginationMeta(page, limit, total);
    sendResponse(res, 200, true, 'Leave requests retrieved successfully', requests, meta);
  } catch (error) {
    logger.error({ error, query: req.query }, 'Error fetching leave requests');
    next(error);
  }
});

export const createLeaveRequest = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const input = req.body as CreateLeaveRequestInput;

    let employeeId: Types.ObjectId;
    const employee = await Employee.findOne({ 'employmentDetails.userId': user!._id });
    if (!employee) throw new NotFoundError('Employee profile not found');
    employeeId = employee._id;

    if (!Types.ObjectId.isValid(input.leaveTypeId)) {
      throw new BadRequestError('Invalid leave type ID');
    }

    const leaveType = await LeaveType.findById(input.leaveTypeId);
    if (!leaveType || leaveType.isDeleted) {
      throw new NotFoundError('Leave type not found');
    }

    if (!leaveType.isActive) {
      throw new BadRequestError('Leave type is not active');
    }

    const isApplicable = await leaveType.isApplicableToEmployee(employeeId);
    if (!isApplicable) {
      throw new ForbiddenError('This leave type is not applicable to you');
    }

    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    if (startDate > endDate) {
      throw new BadRequestError('Start date cannot be after end date');
    }

    if (input.session !== LeaveSession.FULL_DAY && startDate !== endDate) {
      throw new BadRequestError('Half-day leave can only be for a single day');
    }

    const overlappingLeave = await LeaveRequest.findOne({
      employeeId,
      status: { $in: [LeaveRequestStatus.SUBMITTED, LeaveRequestStatus.PENDING_APPROVAL, LeaveRequestStatus.APPROVED, LeaveRequestStatus.AUTO_APPROVED] },
      $or: [
        { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
      ],
    });

    if (overlappingLeave) {
      throw new ConflictError('Overlapping leave request exists');
    }

    if (leaveType.config.advanceNoticeDays && startDate < new Date(Date.now() + leaveType.config.advanceNoticeDays * 24 * 60 * 60 * 1000)) {
      if (!input.isEmergency && leaveType.config.requiresApproval) {
        throw new BadRequestError(`This leave type requires ${leaveType.config.advanceNoticeDays} days advance notice`);
      }
    }

    if (leaveType.config.maxConsecutiveDays) {
      let consecutiveDays = 0;
      const current = new Date(startDate);
      while (current <= endDate) {
        const dayOfWeek = current.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) consecutiveDays++;
        current.setDate(current.getDate() + 1);
      }
      if (consecutiveDays > leaveType.config.maxConsecutiveDays) {
        throw new BadRequestError(`Maximum consecutive days allowed: ${leaveType.config.maxConsecutiveDays}`);
      }
    }

    let approvalWorkflow: any[] = [];
    if (leaveType.config.requiresApproval) {
      const approvers = await getApproversForLeave(employee, leaveType);
      approvalWorkflow = approvers.map((approverId, index) => ({
        approverId,
        level: index + 1,
        status: 'PENDING',
      }));
    }

    const leaveRequest = await LeaveRequest.create({
      employeeId,
      leaveTypeId: new Types.ObjectId(input.leaveTypeId),
      leaveTypeCode: leaveType.code,
      status: leaveType.config.requiresApproval ? LeaveRequestStatus.PENDING_APPROVAL : LeaveRequestStatus.AUTO_APPROVED,
      startDate,
      endDate,
      totalDays: 0,
      session: input.session || LeaveSession.FULL_DAY,
      reason: input.reason,
      contactDuringLeave: input.contactDuringLeave,
      handoverTo: input.handoverTo ? new Types.ObjectId(input.handoverTo) : undefined,
      handoverNotes: input.handoverNotes,
      attachments: input.attachments?.map(a => ({ ...a, uploadedAt: new Date(), uploadedBy: user._id })) || [],
      approvalWorkflow,
      currentApprovalLevel: 1,
      appliedAt: new Date(),
      submittedAt: leaveType.config.requiresApproval ? new Date() : undefined,
      approvedAt: leaveType.config.requiresApproval ? undefined : new Date(),
      isEmergency: input.isEmergency || false,
      isHalfDay: input.session !== LeaveSession.FULL_DAY,
      createdBy: user._id,
    });

    if (!leaveType.config.requiresApproval) {
      await updateLeaveBalance(employeeId, leaveType._id, leaveRequest.totalDays, 'deduct');
    }

    const populatedRequest = await LeaveRequest.findById(leaveRequest._id)
      .populate('employeeId', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId')
      .populate('leaveTypeId', 'code name category config.color')
      .populate('handoverTo', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId')
      .populate('approvalWorkflow.approverId', 'profile.firstName profile.lastName')
      .populate('createdBy', 'profile.firstName profile.lastName');

    logger.info({ leaveRequestId: leaveRequest._id, employeeId, leaveType: leaveType.code }, 'Leave request created');
    sendResponse(res, 201, true, leaveType.config.requiresApproval ? 'Leave request submitted for approval' : 'Leave request auto-approved', populatedRequest);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error creating leave request');
    next(error);
  }
});

async function getApproversForLeave(employee: any, leaveType: any): Promise<Types.ObjectId[]> {
  const approvers: Types.ObjectId[] = [];
  
  if (employee.employmentDetails.reportingManagerId) {
    const manager = await Employee.findById(employee.employmentDetails.reportingManagerId).populate('employmentDetails.userId');
    if (manager?.employmentDetails.userId) {
      approvers.push(manager.employmentDetails.userId);
    }
  }

  if (leaveType.config.approvalLevels > 1 && approvers.length) {
    const lastApprover = await Employee.findById(approvers[approvers.length - 1]);
    if (lastApprover?.employmentDetails.reportingManagerId) {
      const higherManager = await Employee.findById(lastApprover.employmentDetails.reportingManagerId).populate('employmentDetails.userId');
      if (higherManager?.employmentDetails.userId) {
        approvers.push(higherManager.employmentDetails.userId);
      }
    }
  }

  if (approvers.length === 0) {
    const hrManagers = await Employee.find({ 
      'employmentDetails.designationId': { $in: await getHRDesignationIds() },
      isDeleted: { $ne: true },
      isActive: true,
    }).populate('employmentDetails.userId');
    
    for (const hr of hrManagers) {
      if (hr.employmentDetails.userId) approvers.push(hr.employmentDetails.userId as Types.ObjectId);
    }
  }

  return approvers.slice(0, leaveType.config.approvalLevels);
}

async function getHRDesignationIds(): Promise<Types.ObjectId[]> {
  const designations = await mongoose.model('Designation').find({ 
    title: { $in: ['HR Manager', 'HR Director', 'HR Head', 'Chief Human Resources Officer'] },
    isDeleted: { $ne: true },
  }).select('_id').lean();
  return designations.map(d => d._id);
}

async function updateLeaveBalance(employeeId: Types.ObjectId, leaveTypeId: Types.ObjectId, days: number, action: 'deduct' | 'add'): Promise<void> {
  const year = new Date().getFullYear();
  const balance = await LeaveBalance.findOne({ employeeId, leaveTypeId, year });
  
  if (balance) {
    if (action === 'deduct') {
      balance.used += days;
      balance.available = Math.max(0, balance.accrued - balance.used - balance.encashed + balance.carriedForward);
    } else {
      balance.available += days;
    }
    await balance.save();
  }
}

export const getLeaveRequestById = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid leave request ID');
    }

    const leaveRequest = await LeaveRequest.findById(id)
      .populate('employeeId', 'personalInfo employmentDetails')
      .populate('leaveTypeId', 'code name category config')
      .populate('handoverTo', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId')
      .populate('approvalWorkflow.approverId', 'profile.firstName profile.lastName email')
      .populate('approvalWorkflow.delegatedTo', 'profile.firstName profile.lastName email')
      .populate('cancelledBy', 'profile.firstName profile.lastName')
      .populate('createdBy', 'profile.firstName profile.lastName')
      .populate('updatedBy', 'profile.firstName profile.lastName');

    if (!leaveRequest || leaveRequest.isDeleted) {
      throw new NotFoundError('Leave request not found');
    }

    if (user?.role === 'EMPLOYEE') {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user._id });
      if (!employee || !employee._id.equals(leaveRequest.employeeId)) {
        throw new ForbiddenError('You can only view your own leave requests');
      }
    }

    const balance = await LeaveBalance.findOne({
      employeeId: leaveRequest.employeeId._id,
      leaveTypeId: leaveRequest.leaveTypeId._id,
      year: new Date(leaveRequest.startDate).getFullYear(),
    }).populate('leaveTypeId', 'code name category config');

    sendResponse(res, 200, true, 'Leave request retrieved successfully', {
      ...leaveRequest.toObject(),
      currentBalance: balance ? {
        accrued: balance.accrued,
        used: balance.used,
        available: balance.available,
        carriedForward: balance.carriedForward,
      } : null,
    });
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error fetching leave request by ID');
    next(error);
  }
});

export const updateLeaveRequest = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const input = req.body as UpdateLeaveRequestInput;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid leave request ID');
    }

    const leaveRequest = await LeaveRequest.findById(id);
    if (!leaveRequest || leaveRequest.isDeleted) {
      throw new NotFoundError('Leave request not found');
    }

    if (!leaveRequest.canBeModified()) {
      throw new BadRequestError('Leave request cannot be modified in current status');
    }

    if (user?.role === 'EMPLOYEE') {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user._id });
      if (!employee || !employee._id.equals(leaveRequest.employeeId)) {
        throw new ForbiddenError('You can only modify your own leave requests');
      }
    }

    const updateData: Record<string, any> = { updatedBy: user._id };

    if (input.leaveTypeId && Types.ObjectId.isValid(input.leaveTypeId)) {
      const leaveType = await LeaveType.findById(input.leaveTypeId);
      if (!leaveType || leaveType.isDeleted) throw new NotFoundError('Leave type not found');
      const isApplicable = await leaveType.isApplicableToEmployee(leaveRequest.employeeId);
      if (!isApplicable) throw new ForbiddenError('This leave type is not applicable');
      updateData.leaveTypeId = new Types.ObjectId(input.leaveTypeId);
      updateData.leaveTypeCode = leaveType.code;
    }

    if (input.startDate) updateData.startDate = new Date(input.startDate);
    if (input.endDate) updateData.endDate = new Date(input.endDate);
    if (input.session) updateData.session = input.session;
    if (input.reason) updateData.reason = input.reason;
    if (input.contactDuringLeave) updateData.contactDuringLeave = input.contactDuringLeave;
    if (input.handoverTo !== undefined) updateData.handoverTo = input.handoverTo ? new Types.ObjectId(input.handoverTo) : null;
    if (input.handoverNotes !== undefined) updateData.handoverNotes = input.handoverNotes;
    if (input.isEmergency !== undefined) updateData.isEmergency = input.isEmergency;

    const updatedRequest = await LeaveRequest.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true })
      .populate('employeeId', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId')
      .populate('leaveTypeId', 'code name category config.color')
      .populate('handoverTo', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId');

    sendResponse(res, 200, true, 'Leave request updated successfully', updatedRequest);
  } catch (error) {
    logger.error({ error, params: req.params, body: req.body }, 'Error updating leave request');
    next(error);
  }
});

export const submitLeaveRequest = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;

    if (!Types.ObjectId.isValid(id)) throw new BadRequestError('Invalid leave request ID');

    const leaveRequest = await LeaveRequest.findById(id);
    if (!leaveRequest || leaveRequest.isDeleted) throw new NotFoundError('Leave request not found');

    if (leaveRequest.status !== LeaveRequestStatus.DRAFT) {
      throw new BadRequestError('Only draft leave requests can be submitted');
    }

    if (user?.role === 'EMPLOYEE') {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user._id });
      if (!employee || !employee._id.equals(leaveRequest.employeeId)) {
        throw new ForbiddenError('You can only submit your own leave requests');
      }
    }

    const leaveType = await LeaveType.findById(leaveRequest.leaveTypeId);
    if (!leaveType) throw new NotFoundError('Leave type not found');

    leaveRequest.status = leaveType.config.requiresApproval ? LeaveRequestStatus.PENDING_APPROVAL : LeaveRequestStatus.AUTO_APPROVED;
    leaveRequest.submittedAt = new Date();
    
    if (!leaveType.config.requiresApproval) {
      leaveRequest.approvedAt = new Date();
      await updateLeaveBalance(leaveRequest.employeeId, leaveRequest.leaveTypeId, leaveRequest.totalDays, 'deduct');
    }

    if (leaveType.config.requiresApproval && leaveRequest.approvalWorkflow.length > 0) {
      leaveRequest.currentApprovalLevel = 1;
      leaveRequest.approvalWorkflow[0].status = 'PENDING';
    }

    await leaveRequest.save();

    const populatedRequest = await LeaveRequest.findById(id)
      .populate('employeeId', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId')
      .populate('leaveTypeId', 'code name category config.color')
      .populate('approvalWorkflow.approverId', 'profile.firstName profile.lastName');

    sendResponse(res, 200, true, leaveType.config.requiresApproval ? 'Leave request submitted for approval' : 'Leave request auto-approved', populatedRequest);
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error submitting leave request');
    next(error);
  }
});

export const approveRejectLeaveRequest = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const input = req.body as ApproveRejectInput;

    if (!Types.ObjectId.isValid(id)) throw new BadRequestError('Invalid leave request ID');

    const leaveRequest = await LeaveRequest.findById(id);
    if (!leaveRequest || leaveRequest.isDeleted) throw new NotFoundError('Leave request not found');

    const currentApproval = leaveRequest.approvalWorkflow[leaveRequest.currentApprovalLevel - 1];
    if (!currentApproval) throw new BadRequestError('No pending approval found');

    if (!currentApproval.approverId.equals(user._id)) {
      throw new ForbiddenError('You are not authorized to approve this request');
    }

    if (currentApproval.status !== 'PENDING') {
      throw new BadRequestError('This approval has already been processed');
    }

    if (input.action === 'APPROVE') {
      currentApproval.status = 'APPROVED';
      currentApproval.actionAt = new Date();
      currentApproval.comments = input.comments;

      if (leaveRequest.currentApprovalLevel >= leaveRequest.approvalWorkflow.length) {
        leaveRequest.status = LeaveRequestStatus.APPROVED;
        leaveRequest.approvedAt = new Date();
        await updateLeaveBalance(leaveRequest.employeeId, leaveRequest.leaveTypeId, leaveRequest.totalDays, 'deduct');
      } else {
        leaveRequest.currentApprovalLevel++;
        leaveRequest.approvalWorkflow[leaveRequest.currentApprovalLevel - 1].status = 'PENDING';
      }
    } else if (input.action === 'REJECT') {
      currentApproval.status = 'REJECTED';
      currentApproval.actionAt = new Date();
      currentApproval.comments = input.comments;
      leaveRequest.status = LeaveRequestStatus.REJECTED;
      leaveRequest.rejectedAt = new Date();
    } else if (input.action === 'DELEGATE') {
      if (!input.delegatedTo || !Types.ObjectId.isValid(input.delegatedTo)) {
        throw new BadRequestError('Valid delegatedTo user ID required');
      }
      const delegatedUser = await mongoose.model('User').findById(input.delegatedTo);
      if (!delegatedUser) throw new NotFoundError('Delegated user not found');
      currentApproval.status = 'DELEGATED';
      currentApproval.delegatedTo = new Types.ObjectId(input.delegatedTo);
      currentApproval.actionAt = new Date();
      currentApproval.comments = input.comments;
    }

    await leaveRequest.save();

    const populatedRequest = await LeaveRequest.findById(id)
      .populate('employeeId', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId')
      .populate('leaveTypeId', 'code name category config.color')
      .populate('approvalWorkflow.approverId', 'profile.firstName profile.lastName')
      .populate('approvalWorkflow.delegatedTo', 'profile.firstName profile.lastName');

    sendResponse(res, 200, true, `Leave request ${input.action.toLowerCase()}d successfully`, populatedRequest);
  } catch (error) {
    logger.error({ error, params: req.params, body: req.body }, 'Error approving/rejecting leave request');
    next(error);
  }
});

export const cancelLeaveRequest = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const { cancellationReason } = req.body;

    if (!Types.ObjectId.isValid(id)) throw new BadRequestError('Invalid leave request ID');

    const leaveRequest = await LeaveRequest.findById(id);
    if (!leaveRequest || leaveRequest.isDeleted) throw new NotFoundError('Leave request not found');

    if (!leaveRequest.canBeCancelled()) {
      throw new BadRequestError('Leave request cannot be cancelled in current status');
    }

    if (user?.role === 'EMPLOYEE') {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user._id });
      if (!employee || !employee._id.equals(leaveRequest.employeeId)) {
        throw new ForbiddenError('You can only cancel your own leave requests');
      }
    }

    if (leaveRequest.status === LeaveRequestStatus.APPROVED || leaveRequest.status === LeaveRequestStatus.AUTO_APPROVED) {
      await updateLeaveBalance(leaveRequest.employeeId, leaveRequest.leaveTypeId, leaveRequest.totalDays, 'add');
    }

    leaveRequest.status = LeaveRequestStatus.CANCELLED;
    leaveRequest.cancelledAt = new Date();
    leaveRequest.cancelledBy = user._id;
    leaveRequest.cancellationReason = cancellationReason;
    await leaveRequest.save();

    sendResponse(res, 200, true, 'Leave request cancelled successfully', leaveRequest);
  } catch (error) {
    logger.error({ error, params: req.params, body: req.body }, 'Error cancelling leave request');
    next(error);
  }
});

export const getLeaveTypes = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = req.query as Record<string, string>;
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<typeof LeaveType> = { isDeleted: { $ne: true } };
    if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
    if (query.category) filter.category = query.category as any;
    if (query.search) {
      const searchRegex = new RegExp(query.search, 'i');
      filter.$or = [{ code: searchRegex }, { name: searchRegex }, { description: searchRegex }];
    }

    const [leaveTypes, total] = await Promise.all([
      LeaveType.find(filter).sort({ displayOrder: 1, name: 1 }).skip(skip).limit(limit).lean(),
      LeaveType.countDocuments(filter),
    ]);

    const meta = buildPaginationMeta(page, limit, total);
    sendResponse(res, 200, true, 'Leave types retrieved successfully', leaveTypes, meta);
  } catch (error) {
    logger.error({ error, query: req.query }, 'Error fetching leave types');
    next(error);
  }
});

export const createLeaveType = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const input = req.body;

    if (input.code) {
      const existing = await LeaveType.findOne({ code: input.code.toUpperCase() });
      if (existing) throw new ConflictError('Leave type code already exists');
    }

    const leaveType = await LeaveType.create({
      ...input,
      code: input.code?.toUpperCase(),
      config: {
        ...input.config,
        color: input.config?.color || '#000000',
      },
      createdBy: user._id,
    });

    sendResponse(res, 201, true, 'Leave type created successfully', leaveType);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error creating leave type');
    next(error);
  }
});

export const updateLeaveType = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const input = req.body;

    if (!Types.ObjectId.isValid(id)) throw new BadRequestError('Invalid leave type ID');

    const leaveType = await LeaveType.findById(id);
    if (!leaveType || leaveType.isDeleted) throw new NotFoundError('Leave type not found');

    if (leaveType.isSystem) throw new ForbiddenError('Cannot modify system leave types');

    const updateData: Record<string, any> = { updatedBy: user._id };
    const allowedFields = ['name', 'description', 'category', 'isActive', 'accrualRule', 'carryForwardRule', 'config', 'applicableBranches', 'applicableDepartments', 'applicableDesignations', 'applicableEmployeeTypes', 'effectiveFrom', 'effectiveTo', 'displayOrder'];
    
    for (const field of allowedFields) {
      if (input[field] !== undefined) updateData[field] = input[field];
    }
    if (input.code) updateData.code = input.code.toUpperCase();

    const updatedLeaveType = await LeaveType.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true });
    sendResponse(res, 200, true, 'Leave type updated successfully', updatedLeaveType);
  } catch (error) {
    logger.error({ error, params: req.params, body: req.body }, 'Error updating leave type');
    next(error);
  }
});

export const getLeaveTypeById = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) throw new BadRequestError('Invalid leave type ID');

    const leaveType = await LeaveType.findById(id);
    if (!leaveType || leaveType.isDeleted) throw new NotFoundError('Leave type not found');

    sendResponse(res, 200, true, 'Leave type retrieved successfully', leaveType);
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error fetching leave type by ID');
    next(error);
  }
});

export const deleteLeaveType = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;
    if (!Types.ObjectId.isValid(id)) throw new BadRequestError('Invalid leave type ID');

    const leaveType = await LeaveType.findById(id);
    if (!leaveType || leaveType.isDeleted) throw new NotFoundError('Leave type not found');
    if (leaveType.isSystem) throw new ForbiddenError('Cannot delete system leave types');

    await leaveType.softDelete(user._id);
    sendResponse(res, 200, true, 'Leave type deleted successfully');
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error deleting leave type');
    next(error);
  }
});

export const getLeaveBalances = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = req.query as unknown as LeaveBalanceQueryParams;
    const user = (req as AuthenticatedRequest).user;

    let employeeId: Types.ObjectId;
    if (query.employeeId && Types.ObjectId.isValid(query.employeeId)) {
      employeeId = new Types.ObjectId(query.employeeId);
      
      if (user?.role === 'EMPLOYEE') {
        const userEmployee = await Employee.findOne({ 'employmentDetails.userId': user._id });
        if (!userEmployee || !userEmployee._id.equals(employeeId)) {
          throw new ForbiddenError('You can only view your own leave balance');
        }
      }
    } else {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user!._id });
      if (!employee) throw new NotFoundError('Employee profile not found');
      employeeId = employee._id;
    }

    const year = query.year || new Date().getFullYear();

    const balances = await LeaveBalance.find({ employeeId, year }).populate('leaveTypeId', 'code name category config.color').lean();
    const leaveTypes = await LeaveType.find({ isActive: true, isDeleted: { $ne: true } }).select('code name category config.color').lean();

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

    const employee = await Employee.findById(employeeId).select('personalInfo employmentDetails');
    sendResponse(res, 200, true, 'Leave balances retrieved successfully', {
      employeeId: employee!._id,
      employeeCode: employee!.employmentDetails.employeeId,
      employeeName: employee!.fullName,
      year,
      balances: result,
    });
  } catch (error) {
    logger.error({ error, query: req.query }, 'Error fetching leave balances');
    next(error);
  }
});

export const getLeaveBalanceByType = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employeeId, leaveTypeId } = req.params;
    const { year } = req.query;
    const user = (req as AuthenticatedRequest).user;

    if (!Types.ObjectId.isValid(employeeId) || !Types.ObjectId.isValid(leaveTypeId)) {
      throw new BadRequestError('Invalid employee ID or leave type ID');
    }

    if (user?.role === 'EMPLOYEE') {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user._id });
      if (!employee || !employee._id.equals(employeeId)) {
        throw new ForbiddenError('You can only view your own leave balance');
      }
    }

    const targetYear = year ? parseInt(year as string, 10) : new Date().getFullYear();

    const balance = await LeaveBalance.findOne({ employeeId, leaveTypeId, year: targetYear }).populate('leaveTypeId', 'code name category config accrualRule carryForwardRule');
    const leaveType = await LeaveType.findById(leaveTypeId).select('code name category config accrualRule carryForwardRule');

    if (!leaveType) throw new NotFoundError('Leave type not found');

    sendResponse(res, 200, true, 'Leave balance retrieved successfully', {
      leaveType: {
        _id: leaveType._id,
        code: leaveType.code,
        name: leaveType.name,
        category: leaveType.category,
        config: leaveType.config,
        accrualRule: leaveType.accrualRule,
        carryForwardRule: leaveType.carryForwardRule,
      },
      balance: balance || {
        accrued: 0,
        used: 0,
        available: 0,
        carriedForward: 0,
        encashed: 0,
      },
      year: targetYear,
    });
  } catch (error) {
    logger.error({ error, params: req.params, query: req.query }, 'Error fetching leave balance by type');
    next(error);
  }
});

export const accrueLeaveBalances = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const { year, leaveTypeIds, employeeIds } = req.body;

    const targetYear = year || new Date().getFullYear();
    const leaveTypes = await LeaveType.find({ 
      _id: { $in: leaveTypeIds || [] }, 
      isActive: true, 
      isDeleted: { $ne: true } 
    }).lean();

    const employees = await Employee.find({ 
      _id: { $in: employeeIds || [] }, 
      isDeleted: { $ne: true },
      isActive: true,
    }).lean();

    let processed = 0;
    for (const leaveType of leaveTypes) {
      for (const employee of employees) {
        const isApplicable = await leaveType.isApplicableToEmployee(employee._id);
        if (!isApplicable) continue;

        let balance = await LeaveBalance.findOne({ employeeId: employee._id, leaveTypeId: leaveType._id, year: targetYear });
        
        if (!balance) {
          balance = new LeaveBalance({
            employeeId: employee._id,
            leaveTypeId: leaveType._id,
            year: targetYear,
            accrued: 0,
            used: 0,
            available: 0,
            carriedForward: 0,
            encashed: 0,
          });
        }

        const accrualAmount = calculateAccrual(leaveType, employee, targetYear);
        balance.accrued += accrualAmount;
        balance.available += accrualAmount;
        
        await balance.save();
        processed++;
      }
    }

    sendResponse(res, 200, true, 'Leave accrual processed successfully', { processed, year: targetYear });
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error accruing leave balances');
    next(error);
  }
});

function calculateAccrual(leaveType: any, employee: any, year: number): number {
  const { frequency, accrualRate, proRata, eligibilityDays } = leaveType.accrualRule || {};
  const joiningDate = new Date(employee.employmentDetails.joiningDate);
  const daysSinceJoining = Math.floor((new Date().getTime() - joiningDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysSinceJoining < (eligibilityDays || 0)) return 0;

  switch (frequency) {
    case 'MONTHLY':
      return accrualRate;
    case 'QUARTERLY':
      return accrualRate / 4;
    case 'HALF_YEARLY':
      return accrualRate / 2;
    case 'YEARLY':
      return accrualRate;
    default:
      return 0;
  }
}

export const carryForwardLeaveBalances = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const { fromYear, toYear, leaveTypeIds, employeeIds } = req.body;

    const leaveTypes = await LeaveType.find({ 
      _id: { $in: leaveTypeIds || [] }, 
      isActive: true, 
      isDeleted: { $ne: true },
      'carryForwardRule.type': { $ne: 'NONE' },
    }).lean();

    const employees = await Employee.find({ 
      _id: { $in: employeeIds || [] }, 
      isDeleted: { $ne: true },
      isActive: true,
    }).lean();

    let processed = 0;
    for (const leaveType of leaveTypes) {
      for (const employee of employees) {
        const fromBalance = await LeaveBalance.findOne({ employeeId: employee._id, leaveTypeId: leaveType._id, year: fromYear });
        if (!fromBalance || fromBalance.available <= 0) continue;

        let carryForwardDays = fromBalance.available;
        const { type, maxDays, maxPercentage, expiryMonths, requiresApproval } = leaveType.carryForwardRule;

        if (type === 'LIMITED') {
          if (maxDays) carryForwardDays = Math.min(carryForwardDays, maxDays);
          if (maxPercentage) carryForwardDays = Math.min(carryForwardDays, (fromBalance.accrued * maxPercentage) / 100);
        } else if (type === 'EXPIRES') {
          carryForwardDays = 0;
        }

        if (carryForwardDays > 0) {
          let toBalance = await LeaveBalance.findOne({ employeeId: employee._id, leaveTypeId: leaveType._id, year: toYear });
          if (!toBalance) {
            toBalance = new LeaveBalance({
              employeeId: employee._id,
              leaveTypeId: leaveType._id,
              year: toYear,
              accrued: 0,
              used: 0,
              available: 0,
              carriedForward: 0,
              encashed: 0,
            });
          }
          toBalance.carriedForward += carryForwardDays;
          toBalance.available += carryForwardDays;
          await toBalance.save();
          processed++;
        }
      }
    }

    sendResponse(res, 200, true, 'Leave carry forward processed successfully', { processed, fromYear, toYear });
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error carrying forward leave balances');
    next(error);
  }
});

export const getLeaveStats = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate, branchId, departmentId, leaveTypeId } = req.query;
    const user = (req as AuthenticatedRequest).user;

    let employeeFilter: FilterQuery<typeof Employee> = { isDeleted: { $ne: true }, isActive: true };
    
    if (branchId && Types.ObjectId.isValid(branchId as string)) {
      employeeFilter['employmentDetails.branchId'] = new Types.ObjectId(branchId as string);
    } else if (user?.role === 'HR_MANAGER' && user.branchId) {
      employeeFilter['employmentDetails.branchId'] = user.branchId;
    } else if (user?.role === 'DEPT_HEAD' && user.departmentId) {
      employeeFilter['employmentDetails.departmentId'] = user.departmentId;
    }

    if (departmentId && Types.ObjectId.isValid(departmentId as string)) {
      employeeFilter['employmentDetails.departmentId'] = new Types.ObjectId(departmentId as string);
    }

    const employees = await Employee.find(employeeFilter).select('_id').lean();
    const employeeIds = employees.map(e => e._id);

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate as string) : new Date();

    const filter: FilterQuery<ILeaveRequest> = {
      employeeId: { $in: employeeIds },
      startDate: { $gte: start },
      endDate: { $lte: end },
      isDeleted: { $ne: true },
    };

    if (leaveTypeId && Types.ObjectId.isValid(leaveTypeId as string)) {
      filter.leaveTypeId = new Types.ObjectId(leaveTypeId as string);
    }

    const stats = await LeaveRequest.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalDays: { $sum: '$totalDays' },
        },
      },
    ]);

    const byType = await LeaveRequest.aggregate([
      { $match: filter },
      {
        $lookup: { from: 'leavetypes', localField: 'leaveTypeId', foreignField: '_id', as: 'leaveType' },
      },
      { $unwind: '$leaveType' },
      {
        $group: {
          _id: '$leaveType.code',
          leaveTypeName: { $first: '$leaveType.name' },
          count: { $sum: 1 },
          totalDays: { $sum: '$totalDays' },
        },
      },
    ]);

    const monthly = await LeaveRequest.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$startDate' } },
          count: { $sum: 1 },
          totalDays: { $sum: '$totalDays' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    sendResponse(res, 200, true, 'Leave statistics retrieved successfully', {
      period: { startDate: start, endDate: end },
      employeeCount: employeeIds.length,
      byStatus: stats.reduce((acc, item) => ({ ...acc, [item._id]: item }), {}),
      byType: byType.reduce((acc, item) => ({ ...acc, [item._id]: item }), {}),
      monthly,
    });
  } catch (error) {
    logger.error({ error, query: req.query }, 'Error fetching leave stats');
    next(error);
  }
});

export default {
  getLeaveRequests,
  createLeaveRequest,
  getLeaveRequestById,
  updateLeaveRequest,
  submitLeaveRequest,
  approveRejectLeaveRequest,
  cancelLeaveRequest,
  getLeaveTypes,
  createLeaveType,
  getLeaveTypeById,
  updateLeaveType,
  deleteLeaveType,
  getLeaveBalances,
  getLeaveBalanceByType,
  accrueLeaveBalances,
  carryForwardLeaveBalances,
  getLeaveStats,
};