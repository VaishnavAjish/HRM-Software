import { z } from 'zod';
import { LeaveRequestStatus, LeaveSession } from '../models/Leave';
import { LeaveType, LeaveCategory, AccrualFrequency, CarryForwardType, GenderApplicability } from '../models/LeaveType';

export const createLeaveSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1, 'Employee ID is required'),
    leaveTypeId: z.string().min(1, 'Leave type ID is required'),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    session: z.nativeEnum(LeaveSession).default(LeaveSession.FULL_DAY),
    reason: z.string().min(1, 'Reason is required').max(2000),
    contactDuringLeave: z.object({
      phone: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
    }).optional(),
    handoverTo: z.string().optional(),
    handoverNotes: z.string().max(1000).optional(),
    attachments: z.array(z.object({
      name: z.string().min(1),
      fileUrl: z.string().url(),
      fileType: z.string().min(1),
      fileSize: z.number().positive(),
    })).optional(),
    isEmergency: z.boolean().default(false),
    notes: z.string().max(1000).optional(),
  }).refine((data) => new Date(data.startDate) <= new Date(data.endDate), {
    message: 'Start date must be before or equal to end date',
    path: ['startDate'],
  }).refine((data) => {
    const start = new Date(data.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return start >= today || data.isEmergency;
  }, {
    message: 'Start date cannot be in the past unless it is an emergency leave',
    path: ['startDate'],
  }),
});

export const updateLeaveSchema = z.object({
  body: z.object({
    leaveTypeId: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    session: z.nativeEnum(LeaveSession).optional(),
    reason: z.string().max(2000).optional(),
    contactDuringLeave: z.object({
      phone: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
    }).optional(),
    handoverTo: z.string().optional(),
    handoverNotes: z.string().max(1000).optional(),
    attachments: z.array(z.object({
      name: z.string().min(1),
      fileUrl: z.string().url(),
      fileType: z.string().min(1),
      fileSize: z.number().positive(),
    })).optional(),
    isEmergency: z.boolean().optional(),
    notes: z.string().max(1000).optional(),
  }).refine((data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  }, {
    message: 'Start date must be before or equal to end date',
    path: ['startDate'],
  }),
});

export const leaveQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    employeeId: z.string().optional(),
    leaveTypeId: z.string().optional(),
    status: z.nativeEnum(LeaveRequestStatus).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    appliedStartDate: z.string().datetime().optional(),
    appliedEndDate: z.string().datetime().optional(),
    isEmergency: z.coerce.boolean().optional(),
    isHalfDay: z.coerce.boolean().optional(),
    branchId: z.string().optional(),
    departmentId: z.string().optional(),
  }),
});

export const leaveParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Leave request ID is required'),
  }),
});

export const leaveIdSchema = z.object({
  params: z.object({
    leaveId: z.string().min(1, 'Leave request ID is required'),
  }),
});

export const approveLeaveSchema = z.object({
  body: z.object({
    action: z.enum(['APPROVE', 'REJECT', 'DELEGATE']),
    level: z.number().int().positive(),
    comments: z.string().max(1000).optional(),
    delegatedTo: z.string().optional(),
  }),
});

export const cancelLeaveSchema = z.object({
  body: z.object({
    cancellationReason: z.string().min(1, 'Cancellation reason is required').max(500),
  }),
});

export const leaveBalanceQuerySchema = z.object({
  query: z.object({
    employeeId: z.string().min(1, 'Employee ID is required'),
    leaveTypeId: z.string().optional(),
    year: z.coerce.number().int().positive().optional(),
  }),
});

export const leaveTypeSchema = z.object({
  body: z.object({
    code: z.string().min(1).max(20).toUpperCase(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    category: z.nativeEnum(LeaveCategory),
    isActive: z.boolean().default(true),
    isSystem: z.boolean().default(false),
    accrualRule: z.object({
      frequency: z.nativeEnum(AccrualFrequency),
      accrualRate: z.number().min(0),
      maxAccrualPerPeriod: z.number().min(0).optional(),
      eligibilityDays: z.number().min(0).default(0),
      proRata: z.boolean().default(true),
      accrualDayOfMonth: z.number().min(1).max(31).optional(),
      accrualDayOfWeek: z.number().min(0).max(6).optional(),
    }),
    carryForwardRule: z.object({
      type: z.nativeEnum(CarryForwardType),
      maxDays: z.number().min(0).optional(),
      maxPercentage: z.number().min(0).max(100).optional(),
      expiryMonths: z.number().min(0).optional(),
      requiresApproval: z.boolean().default(true),
    }),
    config: z.object({
      minDaysPerRequest: z.number().min(0.5).default(0.5),
      maxDaysPerRequest: z.number().min(1).optional(),
      maxDaysPerYear: z.number().min(1).optional(),
      requiresApproval: z.boolean().default(true),
      approvalLevels: z.number().min(1).max(5).default(1),
      allowHalfDay: z.boolean().default(true),
      allowHourly: z.boolean().default(false),
      advanceNoticeDays: z.number().min(0).optional(),
      maxConsecutiveDays: z.number().min(1).optional(),
      requireMedicalCertificateAfterDays: z.number().min(1).optional(),
      genderApplicability: z.nativeEnum(GenderApplicability).default(GenderApplicability.ALL),
      minAge: z.number().min(0).optional(),
      maxAge: z.number().min(0).optional(),
      maritalStatusApplicability: z.array(z.string()).optional(),
      employmentTypesApplicable: z.array(z.string()).optional(),
      probationPeriodApplicable: z.boolean().default(true),
      noticePeriodDays: z.number().min(0).optional(),
      isEncashable: z.boolean().default(false),
      encashmentMaxDays: z.number().min(0).optional(),
      encashmentFrequency: z.nativeEnum(AccrualFrequency).optional(),
      isCompensable: z.boolean().default(false),
      compensatoryOffExpiryMonths: z.number().min(0).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      icon: z.string().optional(),
    }),
    applicableBranches: z.array(z.string()).optional(),
    applicableDepartments: z.array(z.string()).optional(),
    applicableDesignations: z.array(z.string()).optional(),
    applicableEmployeeTypes: z.array(z.string()).optional(),
    effectiveFrom: z.string().datetime(),
    effectiveTo: z.string().datetime().optional(),
    displayOrder: z.number().int().default(0),
  }),
});

export const updateLeaveTypeSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    category: z.nativeEnum(LeaveCategory).optional(),
    isActive: z.boolean().optional(),
    accrualRule: z.object({
      frequency: z.nativeEnum(AccrualFrequency).optional(),
      accrualRate: z.number().min(0).optional(),
      maxAccrualPerPeriod: z.number().min(0).optional(),
      eligibilityDays: z.number().min(0).optional(),
      proRata: z.boolean().optional(),
      accrualDayOfMonth: z.number().min(1).max(31).optional(),
      accrualDayOfWeek: z.number().min(0).max(6).optional(),
    }).optional(),
    carryForwardRule: z.object({
      type: z.nativeEnum(CarryForwardType).optional(),
      maxDays: z.number().min(0).optional(),
      maxPercentage: z.number().min(0).max(100).optional(),
      expiryMonths: z.number().min(0).optional(),
      requiresApproval: z.boolean().optional(),
    }).optional(),
    config: z.object({
      minDaysPerRequest: z.number().min(0.5).optional(),
      maxDaysPerRequest: z.number().min(1).optional(),
      maxDaysPerYear: z.number().min(1).optional(),
      requiresApproval: z.boolean().optional(),
      approvalLevels: z.number().min(1).max(5).optional(),
      allowHalfDay: z.boolean().optional(),
      allowHourly: z.boolean().optional(),
      advanceNoticeDays: z.number().min(0).optional(),
      maxConsecutiveDays: z.number().min(1).optional(),
      requireMedicalCertificateAfterDays: z.number().min(1).optional(),
      genderApplicability: z.nativeEnum(GenderApplicability).optional(),
      minAge: z.number().min(0).optional(),
      maxAge: z.number().min(0).optional(),
      maritalStatusApplicability: z.array(z.string()).optional(),
      employmentTypesApplicable: z.array(z.string()).optional(),
      probationPeriodApplicable: z.boolean().optional(),
      noticePeriodDays: z.number().min(0).optional(),
      isEncashable: z.boolean().optional(),
      encashmentMaxDays: z.number().min(0).optional(),
      encashmentFrequency: z.nativeEnum(AccrualFrequency).optional(),
      isCompensable: z.boolean().optional(),
      compensatoryOffExpiryMonths: z.number().min(0).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      icon: z.string().optional(),
    }).optional(),
    applicableBranches: z.array(z.string()).optional(),
    applicableDepartments: z.array(z.string()).optional(),
    applicableDesignations: z.array(z.string()).optional(),
    applicableEmployeeTypes: z.array(z.string()).optional(),
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime().optional(),
    displayOrder: z.number().int().optional(),
  }),
});

export const leaveTypeQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    category: z.nativeEnum(LeaveCategory).optional(),
    isActive: z.coerce.boolean().optional(),
    isSystem: z.coerce.boolean().optional(),
  }),
});

export const leaveTypeParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Leave type ID is required'),
  }),
});

export const leaveBalanceAdjustmentSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1, 'Employee ID is required'),
    leaveTypeId: z.string().min(1, 'Leave type ID is required'),
    year: z.number().int().positive(),
    adjustment: z.number(),
    reason: z.string().min(1).max(500),
    adjustmentType: z.enum(['ADD', 'DEDUCT', 'SET']),
  }),
});

export const compensatoryOffSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1, 'Employee ID is required'),
    workedOnDate: z.string().datetime(),
    reason: z.string().min(1).max(500),
    hoursWorked: z.number().min(0.5).max(24),
    compensatoryOffTypeId: z.string().optional(),
    expiresOn: z.string().datetime().optional(),
  }),
});

export const leaveReportQuerySchema = z.object({
  query: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    employeeId: z.string().optional(),
    branchId: z.string().optional(),
    departmentId: z.string().optional(),
    leaveTypeId: z.string().optional(),
    status: z.nativeEnum(LeaveRequestStatus).optional(),
    groupBy: z.enum(['employee', 'branch', 'department', 'leaveType', 'month']).optional(),
    format: z.enum(['json', 'csv', 'excel']).default('json'),
  }),
});