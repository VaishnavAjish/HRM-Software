import { Request, Response, NextFunction } from 'express';
import mongoose, { Types, FilterQuery } from 'mongoose';

import { Payroll, IPayroll, PayrollStatus, PayrollFrequency } from '../models/Payroll';
import { SalaryStructure, SalaryStructureStatus } from '../models/SalaryStructure';
import { SalaryComponent, ComponentCategory } from '../models/SalaryComponent';
import { Employee } from '../models/Employee';
import { Attendance, AttendanceStatus } from '../models/Attendance';
import { LeaveRequest, LeaveRequestStatus } from '../models/Leave';

import { asyncHandler, AppError, NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '../middleware/error.middleware';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { PaginationMeta, PaginationParams } from '../types/api';

interface PayrollQueryParams extends PaginationParams {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: PayrollStatus;
  frequency?: PayrollFrequency;
  branchId?: string;
  departmentId?: string;
  startDate?: string;
  endDate?: string;
}

interface CreatePayrollInput {
  name: string;
  description?: string;
  frequency: PayrollFrequency;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  branchId?: string;
  departmentId?: string;
  employeeIds?: string[];
}

interface ProcessPayrollInput {
  payrollId: string;
  employeeIds?: string[];
}

interface EmployeePayrollInput {
  employeeId: string;
  workingDays: number;
  paidDays: number;
  lopDays: number;
  components: Array<{
    salaryComponentId: string;
    name: string;
    type: 'EARNING' | 'DEDUCTION' | 'REIMBURSEMENT' | 'STATUTORY';
    amount: number;
    taxable: boolean;
    isFixed: boolean;
    calculationType: 'FIXED' | 'PERCENTAGE' | 'FORMULA' | 'ATTENDANCE_BASED';
    formula?: string;
    dependsOn?: string[];
  }>;
  remarks?: string;
}

interface Form16Input {
  payrollId: string;
  financialYear: string;
  quarter: number;
  tanNumber: string;
}

const buildPayrollFilter = (query: PayrollQueryParams, user: AuthenticatedRequest['user']): FilterQuery<IPayroll> => {
  const filter: FilterQuery<IPayroll> = { isDeleted: { $ne: true } };

  if (query.search) {
    const searchRegex = new RegExp(query.search, 'i');
    filter.$or = [
      { runNumber: searchRegex },
      { name: searchRegex },
      { description: searchRegex },
    ];
  }

  if (query.status) filter.status = query.status;
  if (query.frequency) filter.frequency = query.frequency;
  if (query.branchId && Types.ObjectId.isValid(query.branchId)) filter.branchId = new Types.ObjectId(query.branchId);
  if (query.departmentId && Types.ObjectId.isValid(query.departmentId)) filter.departmentId = new Types.ObjectId(query.departmentId);

  if (query.startDate || query.endDate) {
    filter.periodStart = {};
    if (query.startDate) filter.periodStart.$gte = new Date(query.startDate);
    if (query.endDate) filter.periodStart.$lte = new Date(query.endDate);
  }

  if (user) {
    const userRole = user.role;
    if (userRole === 'HR_MANAGER' && user.branchId) {
      filter.branchId = user.branchId;
    }
  }

  return filter;
};

const buildSortStage = (sortBy?: string, sortOrder?: 'asc' | 'desc'): { [key: string]: 1 | -1 } => {
  const sortField = sortBy || 'periodStart';
  const order = sortOrder === 'asc' ? 1 : -1;
  const sortMap: Record<string, string> = {
    runNumber: 'runNumber',
    name: 'name',
    status: 'status',
    frequency: 'frequency',
    periodStart: 'periodStart',
    periodEnd: 'periodEnd',
    payDate: 'payDate',
    totalNetPay: 'totalNetPay',
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

export const getPayrolls = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = req.query as unknown as PayrollQueryParams;
    const user = (req as AuthenticatedRequest).user;

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const filter = buildPayrollFilter(query, user);
    const sort = buildSortStage(query.sortBy, query.sortOrder);

    const [payrolls, total] = await Promise.all([
      Payroll.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('branchId', 'code name')
        .populate('departmentId', 'code name')
        .populate('processedBy', 'profile.firstName profile.lastName')
        .populate('approvedBy', 'profile.firstName profile.lastName')
        .populate('paidBy', 'profile.firstName profile.lastName')
        .populate('createdBy', 'profile.firstName profile.lastName')
        .lean(),
      Payroll.countDocuments(filter),
    ]);

    const meta = buildPaginationMeta(page, limit, total);
    sendResponse(res, 200, true, 'Payroll runs retrieved successfully', payrolls, meta);
  } catch (error) {
    logger.error({ error, query: req.query }, 'Error fetching payrolls');
    next(error);
  }
});

export const createPayroll = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const input = req.body as CreatePayrollInput;

    const existingRunNumber = await Payroll.countDocuments({});
    const runNumber = `PR-${new Date().getFullYear()}-${String(existingRunNumber + 1).padStart(4, '0')}`;

    let employeeFilter: FilterQuery<typeof Employee> = { isDeleted: { $ne: true }, isActive: true, 'employmentDetails.employmentStatus': { $in: ['ACTIVE', 'CONFIRMED'] } };
    
    if (input.employeeIds && input.employeeIds.length > 0) {
      employeeFilter._id = { $in: input.employeeIds.map(id => new Types.ObjectId(id)) };
    } else {
      if (input.branchId && Types.ObjectId.isValid(input.branchId)) {
        employeeFilter['employmentDetails.branchId'] = new Types.ObjectId(input.branchId);
      }
      if (input.departmentId && Types.ObjectId.isValid(input.departmentId)) {
        employeeFilter['employmentDetails.departmentId'] = new Types.ObjectId(input.departmentId);
      }
    }

    const employees = await Employee.find(employeeFilter)
      .populate('employmentDetails.currentSalary')
      .populate('employmentDetails.designationId')
      .populate('employmentDetails.departmentId')
      .populate('employmentDetails.branchId')
      .lean();

    if (!employees.length) {
      throw new BadRequestError('No eligible employees found for payroll');
    }

    const payrollEmployees = employees.map(emp => {
      const salaryStructure = emp.employmentDetails.currentSalary as any;
      return {
        employeeId: emp._id,
        employeeCode: emp.employmentDetails.employeeId,
        employeeName: emp.fullName,
        branchId: emp.employmentDetails.branchId,
        departmentId: emp.employmentDetails.departmentId,
        designationId: emp.employmentDetails.designationId,
        joiningDate: emp.employmentDetails.joiningDate,
        bankAccountId: emp.bankDetails?.find((b: any) => b.isPrimary)?.bankAccountId,
        panNumber: emp.statutoryDetails.panNumber,
        uanNumber: emp.statutoryDetails.uanNumber,
        esicNumber: emp.statutoryDetails.esicNumber,
        workingDays: 0,
        paidDays: 0,
        lopDays: 0,
        components: [],
        grossEarnings: 0,
        grossDeductions: 0,
        netPay: 0,
        taxDeducted: 0,
        tdsAmount: 0,
        pfEmployee: 0,
        pfEmployer: 0,
        esicEmployee: 0,
        esicEmployer: 0,
        professionalTax: 0,
        arrearsAmount: 0,
        bonusAmount: 0,
        status: 'PENDING' as const,
      };
    });

    const payroll = await Payroll.create({
      runNumber,
      name: input.name,
      description: input.description,
      frequency: input.frequency,
      status: PayrollStatus.DRAFT,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      payDate: new Date(input.payDate),
      branchId: input.branchId ? new Types.ObjectId(input.branchId) : undefined,
      departmentId: input.departmentId ? new Types.ObjectId(input.departmentId) : undefined,
      employees: payrollEmployees,
      totalEmployees: payrollEmployees.length,
      totalGrossEarnings: 0,
      totalGrossDeductions: 0,
      totalNetPay: 0,
      totalTax: 0,
      totalPf: 0,
      totalEsic: 0,
      totalProfessionalTax: 0,
      bankFileGenerated: false,
      payslipGenerated: false,
      form16Generated: false,
      createdBy: user._id,
    });

    const populatedPayroll = await Payroll.findById(payroll._id)
      .populate('branchId', 'code name')
      .populate('departmentId', 'code name')
      .populate('createdBy', 'profile.firstName profile.lastName');

    logger.info({ payrollId: payroll._id, runNumber, createdBy: user._id }, 'Payroll created successfully');
    sendResponse(res, 201, true, 'Payroll created successfully', populatedPayroll);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error creating payroll');
    next(error);
  }
});

export const getPayrollById = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid payroll ID');
    }

    const payroll = await Payroll.findById(id)
      .populate('branchId', 'code name address')
      .populate('departmentId', 'code name')
      .populate('processedBy', 'profile.firstName profile.lastName')
      .populate('approvedBy', 'profile.firstName profile.lastName')
      .populate('paidBy', 'profile.firstName profile.lastName')
      .populate('createdBy', 'profile.firstName profile.lastName')
      .populate('employees.employeeId', 'personalInfo.firstName personalInfo.lastName employmentDetails.employeeId');

    if (!payroll || payroll.isDeleted) {
      throw new NotFoundError('Payroll not found');
    }

    sendResponse(res, 200, true, 'Payroll retrieved successfully', payroll);
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error fetching payroll by ID');
    next(error);
  }
});

export const updatePayroll = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const input = req.body;

    if (!Types.ObjectId.isValid(id)) throw new BadRequestError('Invalid payroll ID');

    const payroll = await Payroll.findById(id);
    if (!payroll || payroll.isDeleted) throw new NotFoundError('Payroll not found');

    if (!payroll.isProcessable) throw new BadRequestError('Payroll cannot be modified in current status');

    const updateData: Record<string, any> = { updatedBy: user._id };
    const allowedFields = ['name', 'description', 'payDate', 'notes', 'customFields'];
    
    for (const field of allowedFields) {
      if (input[field] !== undefined) {
        if (field === 'payDate') updateData[field] = new Date(input[field]);
        else updateData[field] = input[field];
      }
    }

    if (input.employees && Array.isArray(input.employees)) {
      for (const empInput of input.employees) {
        const existingEmp = payroll.employees.find(e => e.employeeId.equals(empInput.employeeId));
        if (existingEmp) {
          const allowedEmpFields = ['workingDays', 'paidDays', 'lopDays', 'components', 'remarks', 'bankAccountId'];
          for (const field of allowedEmpFields) {
            if (empInput[field] !== undefined) {
              (existingEmp as any)[field] = empInput[field];
            }
          }
        }
      }
      payroll.calculateTotals();
    }

    const updatedPayroll = await Payroll.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true })
      .populate('branchId', 'code name')
      .populate('departmentId', 'code name')
      .populate('processedBy', 'profile.firstName profile.lastName')
      .populate('approvedBy', 'profile.firstName profile.lastName')
      .populate('paidBy', 'profile.firstName profile.lastName');

    if (!updatedPayroll) throw new NotFoundError('Payroll not found after update');

    logger.info({ payrollId: id, updatedBy: user._id }, 'Payroll updated successfully');
    sendResponse(res, 200, true, 'Payroll updated successfully', updatedPayroll);
  } catch (error) {
    logger.error({ error, params: req.params, body: req.body }, 'Error updating payroll');
    next(error);
  }
});

export const deletePayroll = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;

    if (!Types.ObjectId.isValid(id)) throw new BadRequestError('Invalid payroll ID');

    const payroll = await Payroll.findById(id);
    if (!payroll || payroll.isDeleted) throw new NotFoundError('Payroll not found');

    if (payroll.status !== PayrollStatus.DRAFT && payroll.status !== PayrollStatus.ON_HOLD) {
      throw new BadRequestError('Only draft or on-hold payrolls can be deleted');
    }

    await payroll.softDelete(user._id);
    logger.info({ payrollId: id, deletedBy: user._id }, 'Payroll deleted successfully');
    sendResponse(res, 200, true, 'Payroll deleted successfully');
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error deleting payroll');
    next(error);
  }
});

export const processPayroll = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const input = req.body as ProcessPayrollInput;

    if (!Types.ObjectId.isValid(input.payrollId)) throw new BadRequestError('Invalid payroll ID');

    const payroll = await Payroll.findById(input.payrollId);
    if (!payroll || payroll.isDeleted) throw new NotFoundError('Payroll not found');

    if (payroll.status !== PayrollStatus.DRAFT && payroll.status !== PayrollStatus.ON_HOLD) {
      throw new BadRequestError('Payroll already processed or in non-processable state');
    }

    payroll.status = PayrollStatus.PROCESSING;
    payroll.processedBy = user._id;
    await payroll.save();

    const employeeIds = input.employeeIds 
      ? input.employeeIds.map(id => new Types.ObjectId(id))
      : payroll.employees.map(e => e.employeeId);

    for (const empPayroll of payroll.employees) {
      if (!employeeIds.some(id => id.equals(empPayroll.employeeId))) continue;

      const employee = await Employee.findById(empPayroll.employeeId)
        .populate('employmentDetails.currentSalary')
        .populate('employmentDetails.shiftId');
      
      if (!employee || employee.isDeleted) continue;

      const attendance = await Attendance.find({
        employeeId: empPayroll.employeeId,
        date: { $gte: payroll.periodStart, $lte: payroll.periodEnd },
        isDeleted: { $ne: true },
      }).lean();

      const presentDays = attendance.filter(a => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE || a.status === AttendanceStatus.WORK_FROM_HOME).length;
      const halfDays = attendance.filter(a => a.status === AttendanceStatus.HALF_DAY).length;
      const leaveDays = attendance.filter(a => a.status === AttendanceStatus.ON_LEAVE).length;
      const weeklyOffs = attendance.filter(a => a.status === AttendanceStatus.WEEKLY_OFF).length;
      const holidays = attendance.filter(a => a.status === AttendanceStatus.HOLIDAY).length;

      empPayroll.workingDays = presentDays + halfDays * 0.5;
      empPayroll.paidDays = empPayroll.workingDays + leaveDays + weeklyOffs + holidays;
      empPayroll.lopDays = Math.max(0, (payroll.periodEnd.getDate() - payroll.periodStart.getDate() + 1) - empPayroll.paidDays);

      const salaryStructure = employee.employmentDetails.currentSalary as any;
      if (salaryStructure && salaryStructure.components) {
        const components = [];
        for (const comp of salaryStructure.components) {
          const calculatedValue = salaryStructure.calculateComponent(comp, { 
            basic: salaryStructure.components.find(c => c.componentCode === 'BASIC')?.value || 0,
            gross: salaryStructure.grossSalary,
            workingDays: empPayroll.workingDays,
            paidDays: empPayroll.paidDays,
          });
          
          components.push({
            salaryComponentId: comp.componentId,
            name: comp.componentName,
            type: comp.type,
            amount: calculatedValue,
            taxable: comp.type !== 'REIMBURSEMENT',
            isFixed: comp.calculationType === 'FIXED',
            calculationType: comp.calculationType,
            formula: comp.formula,
            dependsOn: comp.dependsOn,
          });
        }
        empPayroll.components = components;
      }

      const grossEarnings = empPayroll.components.filter(c => c.type === 'EARNING').reduce((sum, c) => sum + c.amount, 0);
      const grossDeductions = empPayroll.components.filter(c => c.type === 'DEDUCTION').reduce((sum, c) => sum + c.amount, 0);
      
      empPayroll.grossEarnings = grossEarnings;
      empPayroll.grossDeductions = grossDeductions;
      empPayroll.netPay = grossEarnings - grossDeductions;

      const pfComp = empPayroll.components.find(c => c.name.includes('PF') || c.name.includes('Provident'));
      if (pfComp) {
        empPayroll.pfEmployee = pfComp.amount;
        empPayroll.pfEmployer = pfComp.amount;
      }
      const esicComp = empPayroll.components.find(c => c.name.includes('ESI') || c.name.includes('ESIC'));
      if (esicComp) {
        empPayroll.esicEmployee = esicComp.amount * 0.75;
        empPayroll.esicEmployer = esicComp.amount * 3.25;
      }
      const ptComp = empPayroll.components.find(c => c.name.includes('Professional') || c.name.includes('PT'));
      if (ptComp) empPayroll.professionalTax = ptComp.amount;
    }

    payroll.calculateTotals();
    payroll.status = PayrollStatus.COMPLETED;
    await payroll.save();

    const populatedPayroll = await Payroll.findById(payroll._id)
      .populate('branchId', 'code name')
      .populate('departmentId', 'code name')
      .populate('processedBy', 'profile.firstName profile.lastName');

    logger.info({ payrollId: payroll._id, processedBy: user._id }, 'Payroll processed successfully');
    sendResponse(res, 200, true, 'Payroll processed successfully', populatedPayroll);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error processing payroll');
    next(error);
  }
});

export const approvePayroll = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;

    if (!Types.ObjectId.isValid(id)) throw new BadRequestError('Invalid payroll ID');

    const payroll = await Payroll.findById(id);
    if (!payroll || payroll.isDeleted) throw new NotFoundError('Payroll not found');

    if (payroll.status !== PayrollStatus.COMPLETED && payroll.status !== PayrollStatus.DRAFT) {
      throw new BadRequestError('Payroll cannot be approved in current status');
    }

    payroll.status = PayrollStatus.APPROVED;
    payroll.approvedBy = user._id;
    await payroll.save();

    sendResponse(res, 200, true, 'Payroll approved successfully', payroll);
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error approving payroll');
    next(error);
  }
});

export const generatePayslips = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;

    if (!Types.ObjectId.isValid(id)) throw new BadRequestError('Invalid payroll ID');

    const payroll = await Payroll.findById(id);
    if (!payroll || payroll.isDeleted) throw new NotFoundError('Payroll not found');

    if (payroll.status !== PayrollStatus.APPROVED && payroll.status !== PayrollStatus.PAID) {
      throw new BadRequestError('Payroll must be approved before generating payslips');
    }

    payroll.payslipGenerated = true;
    payroll.payslipGeneratedAt = new Date();
    payroll.payslipUrl = `/api/v1/payroll/${id}/payslips/bulk`;
    await payroll.save();

    sendResponse(res, 200, true, 'Payslips generated successfully', { payslipUrl: payroll.payslipUrl });
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error generating payslips');
    next(error);
  }
});

export const getEmployeePayslip = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { payrollId, employeeId } = req.params;
    const user = (req as AuthenticatedRequest).user;

    if (!Types.ObjectId.isValid(payrollId) || !Types.ObjectId.isValid(employeeId)) {
      throw new BadRequestError('Invalid payroll or employee ID');
    }

    if (user?.role === 'EMPLOYEE') {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user._id });
      if (!employee || !employee._id.equals(employeeId)) {
        throw new ForbiddenError('You can only view your own payslip');
      }
    }

    const payroll = await Payroll.findById(payrollId);
    if (!payroll || payroll.isDeleted) throw new NotFoundError('Payroll not found');

    const empPayroll = payroll.employees.find(e => e.employeeId.toString() === employeeId);
    if (!empPayroll) throw new NotFoundError('Employee not found in this payroll run');

    const employee = await Employee.findById(employeeId)
      .populate('employmentDetails.branchId', 'name code')
      .populate('employmentDetails.departmentId', 'name code')
      .populate('employmentDetails.designationId', 'title code')
      .populate('bankDetails');

    sendResponse(res, 200, true, 'Payslip retrieved successfully', {
      payroll: {
        runNumber: payroll.runNumber,
        name: payroll.name,
        periodStart: payroll.periodStart,
        periodEnd: payroll.periodEnd,
        payDate: payroll.payDate,
      },
      employee: {
        employeeId: employee!._id,
        employeeCode: employee!.employmentDetails.employeeId,
        fullName: employee!.fullName,
        branch: employee!.employmentDetails.branchId,
        department: employee!.employmentDetails.departmentId,
        designation: employee!.employmentDetails.designationId,
        joiningDate: employee!.employmentDetails.joiningDate,
        bankDetails: employee!.bankDetails?.find((b: any) => b.isPrimary),
        panNumber: employee!.statutoryDetails.panNumber,
        uanNumber: employee!.statutoryDetails.uanNumber,
        esicNumber: employee!.statutoryDetails.esicNumber,
      },
      workingDays: empPayroll.workingDays,
      paidDays: empPayroll.paidDays,
      lopDays: empPayroll.lopDays,
      components: empPayroll.components,
      grossEarnings: empPayroll.grossEarnings,
      grossDeductions: empPayroll.grossDeductions,
      netPay: empPayroll.netPay,
      taxDeducted: empPayroll.taxDeducted,
      pfEmployee: empPayroll.pfEmployee,
      pfEmployer: empPayroll.pfEmployer,
      esicEmployee: empPayroll.esicEmployee,
      esicEmployer: empPayroll.esicEmployer,
      professionalTax: empPayroll.professionalTax,
      arrearsAmount: empPayroll.arrearsAmount,
      bonusAmount: empPayroll.bonusAmount,
    });
  } catch (error) {
    logger.error({ error, params: req.params }, 'Error fetching employee payslip');
    next(error);
  }
});

export const generateForm16 = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const input = req.body as Form16Input;

    if (!Types.ObjectId.isValid(id)) throw new BadRequestError('Invalid payroll ID');

    const payroll = await Payroll.findById(id);
    if (!payroll || payroll.isDeleted) throw new NotFoundError('Payroll not found');

    if (payroll.status !== PayrollStatus.PAID) {
      throw new BadRequestError('Form 16 can only be generated for paid payrolls');
    }

    payroll.form16Generated = true;
    payroll.form16Data = {
      financialYear: input.financialYear,
      quarter: input.quarter,
      tanNumber: input.tanNumber,
      employerName: 'HRFlow Pro Organization',
      employerAddress: 'Registered Office Address',
      employeeName: '',
      employeePan: '',
      employeeAddress: '',
      grossSalary: payroll.totalGrossEarnings,
      allowancesExempt: 0,
      deductions: { section80C: 0, section80D: 0, section80CCD: 0, other: 0 },
      totalDeductions: 0,
      taxableIncome: 0,
      taxPayable: 0,
      educationCess: 0,
      totalTax: 0,
      tdsDeducted: payroll.totalTax,
      tdsDeposited: payroll.totalTax,
      balanceTax: 0,
    };
    payroll.form16Url = `/api/v1/payroll/${id}/form16`;
    await payroll.save();

    sendResponse(res, 200, true, 'Form 16 generated successfully', { form16Url: payroll.form16Url });
  } catch (error) {
    logger.error({ error, params: req.params, body: req.body }, 'Error generating Form 16');
    next(error);
  }
});

export const getSalaryStructures = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = req.query as Record<string, string>;
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<typeof SalaryStructure> = { isDeleted: { $ne: true } };
    if (query.status) filter.status = query.status;
    if (query.employeeType) filter.employeeType = query.employeeType;
    if (query.grade) filter.grade = query.grade;
    if (query.isDefault !== undefined) filter.isDefault = query.isDefault === 'true';

    const [structures, total] = await Promise.all([
      SalaryStructure.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('applicableBranches', 'code name')
        .populate('applicableDepartments', 'code name')
        .populate('applicableDesignations', 'title code')
        .populate('createdBy', 'profile.firstName profile.lastName')
        .populate('approvedBy', 'profile.firstName profile.lastName')
        .lean(),
      SalaryStructure.countDocuments(filter),
    ]);

    const meta = buildPaginationMeta(page, limit, total);
    sendResponse(res, 200, true, 'Salary structures retrieved successfully', structures, meta);
  } catch (error) {
    logger.error({ error, query: req.query }, 'Error fetching salary structures');
    next(error);
  }
});

export const createSalaryStructure = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const input = req.body;

    if (input.code) {
      const existing = await SalaryStructure.findOne({ code: input.code.toUpperCase() });
      if (existing) throw new ConflictError('Salary structure code already exists');
    }

    const structure = await SalaryStructure.create({
      ...input,
      code: input.code?.toUpperCase(),
      createdBy: user._id,
    });

    const populated = await SalaryStructure.findById(structure._id)
      .populate('applicableBranches', 'code name')
      .populate('applicableDepartments', 'code name')
      .populate('applicableDesignations', 'title code')
      .populate('createdBy', 'profile.firstName profile.lastName');

    logger.info({ structureId: structure._id, createdBy: user._id }, 'Salary structure created');
    sendResponse(res, 201, true, 'Salary structure created successfully', populated);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error creating salary structure');
    next(error);
  }
});

export const getSalaryComponents = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = req.query as Record<string, string>;
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<typeof SalaryComponent> = { isDeleted: { $ne: true } };
    if (query.type) filter.type = query.type;
    if (query.category) filter.category = query.category;
    if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
    if (query.isTaxable !== undefined) filter.isTaxable = query.isTaxable === 'true';
    if (query.isStatutory !== undefined) filter.isStatutory = query.isStatutory === 'true';

    const [components, total] = await Promise.all([
      SalaryComponent.find(filter)
        .sort({ displayOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('dependsOn', 'code name')
        .populate('createdBy', 'profile.firstName profile.lastName')
        .lean(),
      SalaryComponent.countDocuments(filter),
    ]);

    const meta = buildPaginationMeta(page, limit, total);
    sendResponse(res, 200, true, 'Salary components retrieved successfully', components, meta);
  } catch (error) {
    logger.error({ error, query: req.query }, 'Error fetching salary components');
    next(error);
  }
});

export const createSalaryComponent = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const input = req.body;

    if (input.code) {
      const existing = await SalaryComponent.findOne({ code: input.code.toUpperCase() });
      if (existing) throw new ConflictError('Salary component code already exists');
    }

    const component = await SalaryComponent.create({
      ...input,
      code: input.code?.toUpperCase(),
      createdBy: user._id,
    });

    const populated = await SalaryComponent.findById(component._id)
      .populate('dependsOn', 'code name')
      .populate('createdBy', 'profile.firstName profile.lastName');

    logger.info({ componentId: component._id, createdBy: user._id }, 'Salary component created');
    sendResponse(res, 201, true, 'Salary component created successfully', populated);
  } catch (error) {
    logger.error({ error, body: req.body }, 'Error creating salary component');
    next(error);
  }
});

export const getPayrollStats = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate, branchId, departmentId } = req.query;
    const user = (req as AuthenticatedRequest).user;

    let branchFilter = {};
    if (branchId && Types.ObjectId.isValid(branchId as string)) {
      branchFilter = { branchId: new Types.ObjectId(branchId as string) };
    } else if (user?.role === 'HR_MANAGER' && user.branchId) {
      branchFilter = { branchId: user.branchId };
    }

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate as string) : new Date();

    const stats = await Payroll.aggregate([
      { $match: { ...branchFilter, periodStart: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalEmployees: { $sum: '$totalEmployees' },
          totalGrossEarnings: { $sum: '$totalGrossEarnings' },
          totalGrossDeductions: { $sum: '$totalGrossDeductions' },
          totalNetPay: { $sum: '$totalNetPay' },
          totalTax: { $sum: '$totalTax' },
          totalPf: { $sum: '$totalPf' },
          totalEsic: { $sum: '$totalEsic' },
          totalProfessionalTax: { $sum: '$totalProfessionalTax' },
        },
      },
    ]);

    const monthly = await Payroll.aggregate([
      { $match: { ...branchFilter, periodStart: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$periodStart' } },
          count: { $sum: 1 },
          totalEmployees: { $sum: '$totalEmployees' },
          totalNetPay: { $sum: '$totalNetPay' },
          totalTax: { $sum: '$totalTax' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    sendResponse(res, 200, true, 'Payroll statistics retrieved successfully', {
      period: { startDate: start, endDate: end },
      byStatus: stats.reduce((acc, item) => ({ ...acc, [item._id]: item }), {}),
      monthly,
    });
  } catch (error) {
    logger.error({ error, query: req.query }, 'Error fetching payroll stats');
    next(error);
  }
});

export const getEmployeePayrollHistory = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const query = req.query as Record<string, string>;
    const user = (req as AuthenticatedRequest).user;

    if (!Types.ObjectId.isValid(employeeId)) throw new BadRequestError('Invalid employee ID');

    if (user?.role === 'EMPLOYEE') {
      const employee = await Employee.findOne({ 'employmentDetails.userId': user._id });
      if (!employee || !employee._id.equals(employeeId)) {
        throw new ForbiddenError('You can only view your own payroll history');
      }
    }

    const employee = await Employee.findById(employeeId).select('personalInfo employmentDetails');
    if (!employee || employee.isDeleted) throw new NotFoundError('Employee not found');

    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<typeof Payroll> = {
      'employees.employeeId': new Types.ObjectId(employeeId),
      isDeleted: { $ne: true },
    };

    if (query.status) filter.status = query.status;
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
    sendResponse(res, 200, true, 'Employee payroll history retrieved successfully', {
      employeeId: employee._id,
      employeeCode: employee.employmentDetails.employeeId,
      employeeName: employee.fullName,
      payrolls: employeePayrolls,
    }, meta);
  } catch (error) {
    logger.error({ error, params: req.params, query: req.query }, 'Error fetching employee payroll history');
    next(error);
  }
});

export default {
  getPayrolls,
  createPayroll,
  getPayrollById,
  updatePayroll,
  deletePayroll,
  processPayroll,
  approvePayroll,
  generatePayslips,
  getEmployeePayslip,
  generateForm16,
  getSalaryStructures,
  createSalaryStructure,
  getSalaryComponents,
  createSalaryComponent,
  getPayrollStats,
  getEmployeePayrollHistory,
};