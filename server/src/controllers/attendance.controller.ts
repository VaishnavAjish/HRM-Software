import { Request, Response, NextFunction } from 'express';
import mongoose, { Types, FilterQuery } from 'mongoose';

import { Attendance, IAttendance, AttendanceStatus, PunchType, AttendanceSource } from '../models/Attendance';
import { Employee } from '../models/Employee';
import { Shift } from '../models/Shift';
import { LeaveRequest, LeaveRequestStatus } from '../models/Leave';
import { CompensatoryOff } from '../models/CompensatoryOff';

import { asyncHandler, AppError, NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '../middleware/error.middleware';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { PaginationMeta, PaginationParams } from '../types/api';

interface AttendanceQueryParams extends PaginationParams {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  employeeId?: string;
  branchId?: string;
  departmentId?: string;
  status?: AttendanceStatus;
  startDate?: string;
  endDate?: string;
  shiftId?: string;
  workLocation?: 'OFFICE' | 'REMOTE' | 'HYBRID' | 'FIELD';
}

interface CheckInInput {
  employeeId?: string;
  punchType: PunchType.CHECK_IN;
  source: AttendanceSource;
  deviceId?: string;
  location?: { latitude: number; longitude: number; address?: string; accuracy?: number };
  ipAddress?: string;
  deviceInfo?: string;
  note?: string;
}

interface CheckOutInput {
  employeeId?: string;
  punchType: PunchType.CHECK_OUT;
  source: AttendanceSource;
  deviceId?: string;
  location?: { latitude: number; longitude: number; address?: string; accuracy?: number };
  ipAddress?: string;
  deviceInfo?: string;
  note?: string;
}

interface BulkAttendanceInput {
  records: Array<{
    employeeId: string;
    date: string;
    status: AttendanceStatus;
    shiftId?: string;
    scheduledInTime?: string;
    scheduledOutTime?: string;
    workLocation?: 'OFFICE' | 'REMOTE' | 'HYBRID' | 'FIELD';
    totalWorkMinutes?: number;
    totalBreakMinutes?: number;
    overtimeMinutes?: number;
    lateMinutes?: number;
    earlyDepartureMinutes?: number;
    notes?: string;
  }>;
}

interface AttendanceReportParams {
  startDate: string;
  endDate: string;
  branchId?: string;
  departmentId?: string;
  employeeId?: string;
  groupBy?: 'employee' | 'department' | 'branch' | 'date' | 'status';
}

const buildAttendanceFilter = async (query: AttendanceQueryParams, user: AuthenticatedRequest['user']): Promise<FilterQuery<IAttendance>> => {
  const filter: FilterQuery<IAttendance> = { isDeleted: { $ne: true } };

  if (query.employeeId && Types.ObjectId.isValid(query.employeeId)) {
    filter.employeeId = new Types.ObjectId(query.employeeId);
  }

  if (query.branchId && Types.ObjectId.isValid(query.branchId)) {
    const employeeIds = await Employee.find({ 'employmentDetails.branchId': new Types.ObjectId(query.branchId), isDeleted: { $ne: true } })
      .select('_id')
      .lean();
    filter.employeeId = { $in: employeeIds.map(e => e._id) };
  }

  if (query.departmentId && Types.ObjectId.isValid(query.departmentId)) {
    const employeeIds = await Employee.find({ 'employmentDetails.departmentId': new Types.ObjectId(query.departmentId), isDeleted: { $ne: true } })
      .select('_id')
      .lean();
    filter.employeeId = { $in: employeeIds.map(e => e._id) };
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.workLocation) {
    filter.workLocation = query.workLocation;
  }

  if (query.shiftId && Types.ObjectId.isValid(query.shiftId)) {
    filter.shiftId = new Types.ObjectId(query.shiftId);
  }

  if (query.startDate || query.endDate) {
    filter.date = {};
    if (query.startDate) filter.date.$gte = new Date(query.startDate);
    if (query.endDate) filter.date.$lte = new Date(query.endDate);
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
    } else if (userRole === 'HR_MANAGER') {
      if (user.branchId) {
        const employeeIds = await Employee.find({ 'employmentDetails.branchId': user.branchId, isDeleted: { $ne: true } })
          .select('_id')
          .lean();
        filter.employeeId = { $in: employeeIds.map(e => e._id) };
      }
    }
  }

  return filter;
};

const buildSortStage = (sortBy?: string, sortOrder?: 'asc' | 'desc'): { [key: string]: 1 | -1 } => {
  const sortField = sortBy || 'date';
  const order = sortOrder === 'asc' ? 1 : -1;
  const sortMap: Record<string, string> = {
    employeeId: 'employeeId',
    date: 'date',
    status: 'status',
    shiftId: 'shiftId',
    totalWorkMinutes: 'totalWorkMinutes',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
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

export const getAttendance = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = req.query as unknown as AttendanceQueryParams;
    const user = (req as AuthenticatedRequest).user;

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const filter = await buildAttendanceFilter(query, user);
    const sort = buildSortStage(query.sortBy, query.sortOrder);

    const [records, total] = await Promise.all([
      Attendance.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('employeeId', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId employmentDetails.departmentId employmentDetails.designationId')
        .populate('shiftId', 'name code startTime endTime')
        .populate('approvedBy', 'profile.firstName profile.lastName')
        .populate('manualEntryBy', 'profile.firstName profile.lastName')
        .populate('leaveRequestId', 'leaveTypeCode startDate endDate status')
        .lean(),
      Attendance.countDocuments(filter),
    ]);

    const meta = buildPaginationMeta(page, limit, total);
    sendResponse(res, 200, true, 'Attendance records retrieved successfully', records, meta);
  } catch (error) {
    logger.error({ error, query: req.query }, 'Error fetching attendance');
    next(error);
  }
});

export const checkIn = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const input = req.body as CheckInInput;

    let employeeId: Types.ObjectId;
    if (input.employeeId) {
      if (!Types.ObjectId.isValid(input.employeeId)) {
        throw new BadRequestError('Invalid employee ID');
      }
      employeeId = new Types.ObjectId(input.employeeId);
      
      if (user?.role === 'EMPLOYEE') {
        const userEmployee = await Employee.findOne({ 'employmentDetails.userId': user._id });
        if (!userEmployee || !userEmployee._id.equals(employeeId)) {
          throw new ForbiddenError('You can only check in for yourself');
        }
      }
    } else {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user!._id });
      if (!employee) {
        throw new NotFoundError('Employee profile not found');
      }
      employeeId = employee._id;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let attendance = await Attendance.findOne({ employeeId, date: today });

    if (attendance) {
      const existingCheckIn = attendance.punches.find(p => p.punchType === PunchType.CHECK_IN);
      if (existingCheckIn) {
        throw new ConflictError('Already checked in today');
      }
    } else {
      const employee = await Employee.findById(employeeId).populate('employmentDetails.shiftId');
      if (!employee || employee.isDeleted) {
        throw new NotFoundError('Employee not found');
      }

      const shift = employee.employmentDetails.shiftId as any;
      
      attendance = new Attendance({
        employeeId,
        date: today,
        shiftId: shift?._id,
        status: AttendanceStatus.PRESENT,
        scheduledInTime: shift ? new Date(today.getTime() + new Date(`1970-01-01T${shift.startTime}`).getTime()) : undefined,
        scheduledOutTime: shift ? new Date(today.getTime() + new Date(`1970-01-01T${shift.endTime}`).getTime()) : undefined,
        workLocation: input.location ? 'OFFICE' : 'REMOTE',
        punches: [],
        breaks: [],
        overtime: [],
        totalWorkMinutes: 0,
        totalBreakMinutes: 0,
        overtimeMinutes: 0,
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        isManualEntry: input.source === AttendanceSource.MANUAL,
        manualEntryBy: input.source === AttendanceSource.MANUAL ? user?._id : undefined,
      });
    }

    const punchRecord = {
      punchType: PunchType.CHECK_IN,
      timestamp: new Date(),
      source: input.source,
      deviceId: input.deviceId,
      location: input.location,
      ipAddress: input.ipAddress || req.ip,
      deviceInfo: input.deviceInfo || req.get('user-agent'),
      isManualEntry: input.source === AttendanceSource.MANUAL,
      note: input.note,
    };

    attendance.punches.push(punchRecord);
    await attendance.save();

    const populatedAttendance = await Attendance.findById(attendance._id)
      .populate('employeeId', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId')
      .populate('shiftId', 'name code startTime endTime');

    logger.info({ attendanceId: attendance._id, employeeId, source: input.source }, 'Check-in recorded');
    sendResponse(res, 201, true, 'Check-in successful', populatedAttendance);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error recording check-in');
    next(error);
  }
});

export const checkOut = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const input = req.body as CheckOutInput;

    let employeeId: Types.ObjectId;
    if (input.employeeId) {
      if (!Types.ObjectId.isValid(input.employeeId)) {
        throw new BadRequestError('Invalid employee ID');
      }
      employeeId = new Types.ObjectId(input.employeeId);
      
      if (user?.role === 'EMPLOYEE') {
        const userEmployee = await Employee.findOne({ 'employmentDetails.userId': user._id });
        if (!userEmployee || !userEmployee._id.equals(employeeId)) {
          throw new ForbiddenError('You can only check out for yourself');
        }
      }
    } else {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user!._id });
      if (!employee) {
        throw new NotFoundError('Employee profile not found');
      }
      employeeId = employee._id;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({ employeeId, date: today });
    if (!attendance) {
      throw new NotFoundError('No check-in record found for today');
    }

    const existingCheckOut = attendance.punches.find(p => p.punchType === PunchType.CHECK_OUT);
    if (existingCheckOut) {
      throw new ConflictError('Already checked out today');
    }

    const checkInPunch = attendance.punches.find(p => p.punchType === PunchType.CHECK_IN);
    if (!checkInPunch) {
      throw new BadRequestError('No check-in record found for today');
    }

    const punchRecord = {
      punchType: PunchType.CHECK_OUT,
      timestamp: new Date(),
      source: input.source,
      deviceId: input.deviceId,
      location: input.location,
      ipAddress: input.ipAddress || req.ip,
      deviceInfo: input.deviceInfo || req.get('user-agent'),
      isManualEntry: input.source === AttendanceSource.MANUAL,
      note: input.note,
    };

    attendance.punches.push(punchRecord);
    attendance.calculateWorkHours();
    
    if (attendance.totalWorkMinutes > 0 && attendance.scheduledOutTime) {
      const checkOut = attendance.punches.find(p => p.punchType === PunchType.CHECK_OUT);
      if (checkOut && checkOut.timestamp < attendance.scheduledOutTime) {
        attendance.status = AttendanceStatus.PRESENT;
      }
    }

    await attendance.save();

    const populatedAttendance = await Attendance.findById(attendance._id)
      .populate('employeeId', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId')
      .populate('shiftId', 'name code startTime endTime');

    logger.info({ attendanceId: attendance._id, employeeId, source: input.source }, 'Check-out recorded');
    sendResponse(res, 200, true, 'Check-out successful', populatedAttendance);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error recording check-out');
    next(error);
  }
});

export const addBreak = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const { employeeId, breakType, startTime, endTime, isPaid } = req.body;

    let empId: Types.ObjectId;
    if (employeeId) {
      if (!Types.ObjectId.isValid(employeeId)) throw new BadRequestError('Invalid employee ID');
      empId = new Types.ObjectId(employeeId);
    } else {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user!._id });
      if (!employee) throw new NotFoundError('Employee profile not found');
      empId = employee._id;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({ employeeId: empId, date: today });
    if (!attendance) throw new NotFoundError('No attendance record found for today');

    const breakRecord = {
      breakType: breakType || 'LUNCH',
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : undefined,
      durationMinutes: endTime ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000) : undefined,
      isPaid: isPaid !== false,
    };

    attendance.breaks.push(breakRecord);
    attendance.calculateWorkHours();
    await attendance.save();

    sendResponse(res, 200, true, 'Break added successfully', attendance);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error adding break');
    next(error);
  }
});

export const endBreak = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const { employeeId, breakId } = req.body;

    let empId: Types.ObjectId;
    if (employeeId) {
      if (!Types.ObjectId.isValid(employeeId)) throw new BadRequestError('Invalid employee ID');
      empId = new Types.ObjectId(employeeId);
    } else {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user!._id });
      if (!employee) throw new NotFoundError('Employee profile not found');
      empId = employee._id;
    }

    if (!Types.ObjectId.isValid(breakId)) throw new BadRequestError('Invalid break ID');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({ employeeId: empId, date: today });
    if (!attendance) throw new NotFoundError('No attendance record found for today');

    const breakRecord = attendance.breaks.id(breakId);
    if (!breakRecord) throw new NotFoundError('Break record not found');
    if (breakRecord.endTime) throw new BadRequestError('Break already ended');

    breakRecord.endTime = new Date();
    breakRecord.durationMinutes = Math.round((breakRecord.endTime.getTime() - breakRecord.startTime.getTime()) / 60000);

    attendance.calculateWorkHours();
    await attendance.save();

    sendResponse(res, 200, true, 'Break ended successfully', attendance);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error ending break');
    next(error);
  }
});

export const requestOvertime = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const { employeeId, date, hours, rate, reason } = req.body;

    let empId: Types.ObjectId;
    if (employeeId) {
      if (!Types.ObjectId.isValid(employeeId)) throw new BadRequestError('Invalid employee ID');
      empId = new Types.ObjectId(employeeId);
    } else {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user!._id });
      if (!employee) throw new NotFoundError('Employee profile not found');
      empId = employee._id;
    }

    if (!Types.ObjectId.isValid(employeeId)) throw new BadRequestError('Invalid employee ID');

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    let attendance = await Attendance.findOne({ employeeId: empId, date: attendanceDate });
    if (!attendance) {
      attendance = new Attendance({
        employeeId: empId,
        date: attendanceDate,
        status: AttendanceStatus.PRESENT,
        punches: [],
        breaks: [],
        overtime: [],
        totalWorkMinutes: 0,
        totalBreakMinutes: 0,
        overtimeMinutes: 0,
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        workLocation: 'OFFICE',
      });
    }

    const overtimeRecord = {
      date: attendanceDate,
      hours,
      rate,
      amount: hours * rate,
      reason,
      status: 'PENDING',
    };

    attendance.overtime.push(overtimeRecord);
    attendance.overtimeMinutes += Math.round(hours * 60);
    await attendance.save();

    sendResponse(res, 201, true, 'Overtime request submitted successfully', attendance);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error requesting overtime');
    next(error);
  }
});

export const approveOvertime = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const { attendanceId, overtimeId, status, rejectionReason } = req.body;

    if (!Types.ObjectId.isValid(attendanceId) || !Types.ObjectId.isValid(overtimeId)) {
      throw new BadRequestError('Invalid attendance or overtime ID');
    }

    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) throw new NotFoundError('Attendance record not found');

    const overtime = attendance.overtime.id(overtimeId);
    if (!overtime) throw new NotFoundError('Overtime record not found');

    if (overtime.status !== 'PENDING') {
      throw new BadRequestError('Overtime already processed');
    }

    overtime.status = status;
    overtime.approvedBy = user._id;
    overtime.approvedAt = new Date();
    
    if (status === 'REJECTED') {
      attendance.overtimeMinutes -= Math.round(overtime.hours * 60);
    }

    await attendance.save();

    sendResponse(res, 200, true, `Overtime ${status.toLowerCase()} successfully`, attendance);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error approving overtime');
    next(error);
  }
});

export const bulkUploadAttendance = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const input = req.body as BulkAttendanceInput;

    if (!input.records || !input.records.length) {
      throw new BadRequestError('No attendance records provided');
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ index: number; employeeId: string; error: string }>,
    };

    for (let i = 0; i < input.records.length; i++) {
      const record = input.records[i];
      try {
        if (!Types.ObjectId.isValid(record.employeeId)) {
          results.errors.push({ index: i, employeeId: record.employeeId, error: 'Invalid employee ID' });
          results.failed++;
          continue;
        }

        const employee = await Employee.findById(record.employeeId);
        if (!employee || employee.isDeleted) {
          results.errors.push({ index: i, employeeId: record.employeeId, error: 'Employee not found' });
          results.failed++;
          continue;
        }

        const date = new Date(record.date);
        date.setHours(0, 0, 0, 0);

        const existing = await Attendance.findOne({ employeeId: record.employeeId, date });
        if (existing) {
          results.errors.push({ index: i, employeeId: record.employeeId, error: 'Attendance already exists for this date' });
          results.failed++;
          continue;
        }

        const shift = record.shiftId ? await Shift.findById(record.shiftId) : null;

        await Attendance.create({
          employeeId: record.employeeId,
          date,
          shiftId: record.shiftId ? new Types.ObjectId(record.shiftId) : shift?._id,
          status: record.status || AttendanceStatus.PRESENT,
          scheduledInTime: record.scheduledInTime ? new Date(record.scheduledInTime) : shift ? new Date(date.getTime() + new Date(`1970-01-01T${shift.startTime}`).getTime()) : undefined,
          scheduledOutTime: record.scheduledOutTime ? new Date(record.scheduledOutTime) : shift ? new Date(date.getTime() + new Date(`1970-01-01T${shift.endTime}`).getTime()) : undefined,
          workLocation: record.workLocation || 'OFFICE',
          punches: [],
          breaks: [],
          overtime: [],
          totalWorkMinutes: record.totalWorkMinutes || 0,
          totalBreakMinutes: record.totalBreakMinutes || 0,
          overtimeMinutes: record.overtimeMinutes || 0,
          lateMinutes: record.lateMinutes || 0,
          earlyDepartureMinutes: record.earlyDepartureMinutes || 0,
          isManualEntry: true,
          manualEntryBy: user._id,
          notes: record.notes,
          createdBy: user._id,
        });

        results.success++;
      } catch (err) {
        results.errors.push({ index: i, employeeId: record.employeeId, error: err instanceof Error ? err.message : 'Unknown error' });
        results.failed++;
      }
    }

    logger.info({ results, uploadedBy: user._id }, 'Bulk attendance upload completed');
    sendResponse(res, 200, true, `Bulk upload completed: ${results.success} successful, ${results.failed} failed`, results);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error in bulk attendance upload');
    next(error);
  }
});

export const getAttendanceReport = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const params = req.query as unknown as AttendanceReportParams;
    const user = (req as AuthenticatedRequest).user;

    if (!params.startDate || !params.endDate) {
      throw new BadRequestError('Start date and end date are required');
    }

    const startDate = new Date(params.startDate);
    const endDate = new Date(params.endDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    let employeeFilter: FilterQuery<typeof Employee> = { isDeleted: { $ne: true }, isActive: true };

    if (params.employeeId && Types.ObjectId.isValid(params.employeeId)) {
      employeeFilter._id = new Types.ObjectId(params.employeeId);
    } else {
      if (params.branchId && Types.ObjectId.isValid(params.branchId)) {
        employeeFilter['employmentDetails.branchId'] = new Types.ObjectId(params.branchId);
      } else if (user?.role === 'HR_MANAGER' && user.branchId) {
        employeeFilter['employmentDetails.branchId'] = user.branchId;
      } else if (user?.role === 'DEPT_HEAD' && user.departmentId) {
        employeeFilter['employmentDetails.departmentId'] = user.departmentId;
      }

      if (params.departmentId && Types.ObjectId.isValid(params.departmentId)) {
        employeeFilter['employmentDetails.departmentId'] = new Types.ObjectId(params.departmentId);
      }
    }

    const employees = await Employee.find(employeeFilter).select('_id personalInfo.firstName personalInfo.lastName employmentDetails.employeeId employmentDetails.departmentId employmentDetails.branchId employmentDetails.designationId').lean();
    const employeeIds = employees.map(e => e._id);

    const groupBy = params.groupBy || 'employee';

    let groupStage: any;
    switch (groupBy) {
      case 'department':
        groupStage = {
          _id: '$employeeId',
          employee: { $first: '$$ROOT' },
          records: { $push: '$$ROOT' },
        };
        break;
      case 'branch':
        groupStage = {
          _id: '$employeeId',
          employee: { $first: '$$ROOT' },
          records: { $push: '$$ROOT' },
        };
        break;
      case 'date':
        groupStage = {
          _id: '$date',
          records: { $push: '$$ROOT' },
        };
        break;
      case 'status':
        groupStage = {
          _id: '$status',
          count: { $sum: 1 },
          records: { $push: '$$ROOT' },
        };
        break;
      default:
        groupStage = {
          _id: '$employeeId',
          employee: { $first: '$$ROOT' },
          records: { $push: '$$ROOT' },
        };
    }

    const pipeline: any[] = [
      {
        $match: {
          employeeId: { $in: employeeIds },
          date: { $gte: startDate, $lte: endDate },
          isDeleted: { $ne: true },
        },
      },
      {
        $lookup: {
          from: 'employees',
          localField: 'employeeId',
          foreignField: '_id',
          as: 'employee',
        },
      },
      { $unwind: '$employee' },
      {
        $lookup: {
          from: 'departments',
          localField: 'employee.employmentDetails.departmentId',
          foreignField: '_id',
          as: 'department',
        },
      },
      { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'branches',
          localField: 'employee.employmentDetails.branchId',
          foreignField: '_id',
          as: 'branch',
        },
      },
      { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
      { $sort: { date: 1, 'employee.personalInfo.firstName': 1 } },
    ];

    const rawData = await Attendance.aggregate(pipeline);

    let summary: any = {};
    if (groupBy === 'status') {
      summary = rawData.reduce((acc, item) => {
        acc[item._id] = { count: item.count };
        return acc;
      }, {});
    } else if (groupBy === 'date') {
      summary = rawData.reduce((acc, item) => {
        const dateStr = item._id.toISOString().split('T')[0];
        acc[dateStr] = { count: item.records.length, present: item.records.filter((r: any) => r.status === 'PRESENT').length };
        return acc;
      }, {});
    } else {
      summary = {
        totalEmployees: employees.length,
        totalRecords: rawData.length,
        present: rawData.filter((r: any) => r.status === 'PRESENT').length,
        absent: rawData.filter((r: any) => r.status === 'ABSENT').length,
        late: rawData.filter((r: any) => r.status === 'LATE').length,
        onLeave: rawData.filter((r: any) => r.status === 'ON_LEAVE').length,
        workFromHome: rawData.filter((r: any) => r.status === 'WORK_FROM_HOME').length,
      };
    }

    sendResponse(res, 200, true, 'Attendance report generated successfully', {
      period: { startDate, endDate },
      groupBy,
      summary,
      data: groupBy !== 'employee' ? rawData : undefined,
    });
  } catch (error) {
    logger.error({ error, query: req.query }, 'Error generating attendance report');
    next(error);
  }
});

export const getAttendanceStats = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employeeId, startDate, endDate, branchId, departmentId } = req.query;
    const user = (req as AuthenticatedRequest).user;

    let employeeFilter: FilterQuery<typeof Employee> = { isDeleted: { $ne: true }, isActive: true };

    if (employeeId && Types.ObjectId.isValid(employeeId as string)) {
      employeeFilter._id = new Types.ObjectId(employeeId as string);
    } else {
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
    }

    const employees = await Employee.find(employeeFilter).select('_id').lean();
    const employeeIds = employees.map(e => e._id);

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate as string) : new Date();
    end.setHours(23, 59, 59, 999);

    const stats = await Attendance.aggregate([
      { $match: { employeeId: { $in: employeeIds }, date: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalWorkMinutes: { $sum: '$totalWorkMinutes' },
          totalBreakMinutes: { $sum: '$totalBreakMinutes' },
          overtimeMinutes: { $sum: '$overtimeMinutes' },
          lateMinutes: { $sum: '$lateMinutes' },
          earlyDepartureMinutes: { $sum: '$earlyDepartureMinutes' },
        },
      },
    ]);

    const dailyStats = await Attendance.aggregate([
      { $match: { employeeId: { $in: employeeIds }, date: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'LATE'] }, 1, 0] } },
          onLeave: { $sum: { $cond: [{ $eq: ['$status', 'ON_LEAVE'] }, 1, 0] } },
          workFromHome: { $sum: { $cond: [{ $eq: ['$status', 'WORK_FROM_HOME'] }, 1, 0] } },
          avgWorkMinutes: { $avg: '$totalWorkMinutes' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    sendResponse(res, 200, true, 'Attendance statistics retrieved successfully', {
      period: { startDate: start, endDate: end },
      employeeCount: employeeIds.length,
      byStatus: stats.reduce((acc, item) => ({ ...acc, [item._id]: item }), {}),
      daily: dailyStats,
    });
  } catch (error) {
    logger.error({ error, query: req.query }, 'Error fetching attendance stats');
    next(error);
  }
});

export const getEmployeeAttendance = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const query = req.query as Record<string, string>;
    const user = (req as AuthenticatedRequest).user;

    if (!Types.ObjectId.isValid(employeeId)) {
      throw new BadRequestError('Invalid employee ID');
    }

    if (user?.role === 'EMPLOYEE') {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user._id });
      if (!employee || !employee._id.equals(employeeId)) {
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

    const filter: FilterQuery<IAttendance> = {
      employeeId: new Types.ObjectId(employeeId),
      isDeleted: { $ne: true },
    };

    if (query.startDate || query.endDate) {
      filter.date = {};
      if (query.startDate) filter.date.$gte = new Date(query.startDate);
      if (query.endDate) filter.date.$lte = new Date(query.endDate);
    }

    if (query.status) filter.status = query.status as AttendanceStatus;
    if (query.shiftId && Types.ObjectId.isValid(query.shiftId)) filter.shiftId = new Types.ObjectId(query.shiftId);

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
        .populate('leaveRequestId', 'leaveTypeCode startDate endDate status')
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

    sendResponse(res, 200, true, 'Employee attendance retrieved successfully', {
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
    logger.error({ error, params: req.params, query: req.query }, 'Error fetching employee attendance');
    next(error);
  }
});

export const updateAttendance = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const input = req.body;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid attendance ID');
    }

    const attendance = await Attendance.findById(id);
    if (!attendance || attendance.isDeleted) {
      throw new NotFoundError('Attendance record not found');
    }

    const updateData: Record<string, any> = { updatedBy: user._id };

    const allowedFields = [
      'status', 'scheduledInTime', 'scheduledOutTime', 'workLocation',
      'totalWorkMinutes', 'totalBreakMinutes', 'overtimeMinutes', 'lateMinutes', 'earlyDepartureMinutes',
      'notes', 'rejectionReason',
    ];

    for (const field of allowedFields) {
      if (input[field] !== undefined) {
        if (['scheduledInTime', 'scheduledOutTime'].includes(field) && input[field]) {
          updateData[field] = new Date(input[field]);
        } else {
          updateData[field] = input[field];
        }
      }
    }

    if (input.punches) {
      updateData.punches = input.punches;
    }
    if (input.breaks) {
      updateData.breaks = input.breaks;
    }

    const updatedAttendance = await Attendance.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('employeeId', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId')
      .populate('shiftId', 'name code startTime endTime')
      .populate('approvedBy', 'profile.firstName profile.lastName');

    if (!updatedAttendance) {
      throw new NotFoundError('Attendance record not found after update');
    }

    logger.info({ attendanceId: id, updatedBy: user._id }, 'Attendance updated successfully');
    sendResponse(res, 200, true, 'Attendance updated successfully', updatedAttendance);
  } catch (error) {
    logger.error({ error, params: req.params, body: req.body }, 'Error updating attendance');
    next(error);
  }
});

export const approveAttendance = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const { status, rejectionReason } = req.body;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid attendance ID');
    }

    const attendance = await Attendance.findById(id);
    if (!attendance || attendance.isDeleted) {
      throw new NotFoundError('Attendance record not found');
    }

    if (attendance.approvedBy) {
      throw new BadRequestError('Attendance already approved');
    }

    attendance.approvedBy = user._id;
    attendance.approvedAt = new Date();
    attendance.status = status || AttendanceStatus.PRESENT;
    
    if (status === 'REJECTED' && rejectionReason) {
      attendance.rejectionReason = rejectionReason;
      attendance.status = AttendanceStatus.ABSENT;
    }

    await attendance.save();

    sendResponse(res, 200, true, `Attendance ${status || 'approved'} successfully`, attendance);
  } catch (error) {
    logger.error({ error, params: req.params, body: req.body }, 'Error approving attendance');
    next(error);
  }
});

export default {
  getAttendance,
  checkIn,
  checkOut,
  addBreak,
  endBreak,
  requestOvertime,
  approveOvertime,
  bulkUploadAttendance,
  getAttendanceReport,
  getAttendanceStats,
  getEmployeeAttendance,
  updateAttendance,
  approveAttendance,
};