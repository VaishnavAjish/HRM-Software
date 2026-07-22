import { z } from 'zod';
import { PayrollStatus, PayrollFrequency } from '../models/Payroll';
import { SalaryStructureStatus } from '../models/SalaryStructure';
import { SalaryComponentType, CalculationType, ComponentCategory } from '../models/SalaryComponent';

export const createPayrollRunSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    frequency: z.nativeEnum(PayrollFrequency),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    payDate: z.string().datetime(),
    branchId: z.string().optional(),
    departmentId: z.string().optional(),
    employees: z.array(z.object({
      employeeId: z.string().min(1, 'Employee ID is required'),
      salaryStructureId: z.string().optional(),
      workingDays: z.number().min(0).optional(),
      paidDays: z.number().min(0).optional(),
      lopDays: z.number().min(0).default(0),
      components: z.array(z.object({
        salaryComponentId: z.string().min(1),
        name: z.string().min(1),
        type: z.enum(['EARNING', 'DEDUCTION', 'REIMBURSEMENT', 'STATUTORY']),
        amount: z.number(),
        taxable: z.boolean().default(true),
        isFixed: z.boolean().default(true),
        calculationType: z.enum(['FIXED', 'PERCENTAGE', 'FORMULA', 'ATTENDANCE_BASED']),
        formula: z.string().optional(),
        dependsOn: z.array(z.string()).optional(),
      })).optional(),
      remarks: z.string().optional(),
    })).optional(),
    notes: z.string().max(2000).optional(),
  }).refine((data) => new Date(data.periodStart) <= new Date(data.periodEnd), {
    message: 'Period start date must be before or equal to period end date',
    path: ['periodStart'],
  }).refine((data) => new Date(data.periodEnd) <= new Date(data.payDate), {
    message: 'Pay date must be after period end date',
    path: ['payDate'],
  }),
});

export const updatePayrollRunSchema = z.object({
  body: z.object({
    name: z.string().max(200).optional(),
    description: z.string().max(1000).optional(),
    status: z.nativeEnum(PayrollStatus).optional(),
    periodStart: z.string().datetime().optional(),
    periodEnd: z.string().datetime().optional(),
    payDate: z.string().datetime().optional(),
    branchId: z.string().optional(),
    departmentId: z.string().optional(),
    processedBy: z.string().optional(),
    approvedBy: z.string().optional(),
    paidBy: z.string().optional(),
    employees: z.array(z.object({
      employeeId: z.string().min(1),
      employeeCode: z.string().optional(),
      employeeName: z.string().optional(),
      branchId: z.string().optional(),
      departmentId: z.string().optional(),
      designationId: z.string().optional(),
      joiningDate: z.string().datetime().optional(),
      bankAccountId: z.string().optional(),
      panNumber: z.string().optional(),
      uanNumber: z.string().optional(),
      esicNumber: z.string().optional(),
      workingDays: z.number().min(0).optional(),
      paidDays: z.number().min(0).optional(),
      lopDays: z.number().min(0).optional(),
      components: z.array(z.object({
        salaryComponentId: z.string().min(1),
        name: z.string().min(1),
        type: z.enum(['EARNING', 'DEDUCTION', 'REIMBURSEMENT', 'STATUTORY']),
        amount: z.number(),
        taxable: z.boolean().default(true),
        isFixed: z.boolean().default(true),
        calculationType: z.enum(['FIXED', 'PERCENTAGE', 'FORMULA', 'ATTENDANCE_BASED']),
        formula: z.string().optional(),
        dependsOn: z.array(z.string()).optional(),
      })).optional(),
      grossEarnings: z.number().optional(),
      grossDeductions: z.number().optional(),
      netPay: z.number().optional(),
      taxDeducted: z.number().optional(),
      tdsAmount: z.number().optional(),
      pfEmployee: z.number().optional(),
      pfEmployer: z.number().optional(),
      esicEmployee: z.number().optional(),
      esicEmployer: z.number().optional(),
      professionalTax: z.number().optional(),
      arrearsAmount: z.number().optional(),
      bonusAmount: z.number().optional(),
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'PAID', 'ON_HOLD']).optional(),
      remarks: z.string().optional(),
    })).optional(),
    bankFileGenerated: z.boolean().optional(),
    bankFileGeneratedAt: z.string().datetime().optional(),
    bankFileUrl: z.string().url().optional(),
    payslipGenerated: z.boolean().optional(),
    payslipGeneratedAt: z.string().datetime().optional(),
    payslipUrl: z.string().url().optional(),
    form16Generated: z.boolean().optional(),
    form16Data: z.object({
      financialYear: z.string(),
      quarter: z.number().min(1).max(4),
      tanNumber: z.string(),
      employerName: z.string(),
      employerAddress: z.string(),
      employeeName: z.string(),
      employeePan: z.string(),
      employeeAddress: z.string(),
      grossSalary: z.number().min(0),
      allowancesExempt: z.number().default(0),
      deductions: z.object({
        section80C: z.number().default(0),
        section80D: z.number().default(0),
        section80CCD: z.number().default(0),
        other: z.number().default(0),
      }).optional(),
      totalDeductions: z.number().default(0),
      taxableIncome: z.number().default(0),
      taxPayable: z.number().default(0),
      educationCess: z.number().default(0),
      totalTax: z.number().default(0),
      tdsDeducted: z.number().default(0),
      tdsDeposited: z.number().default(0),
      balanceTax: z.number().default(0),
    }).optional(),
    form16Url: z.string().url().optional(),
    notes: z.string().max(2000).optional(),
  }),
});

export const payrollRunQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    status: z.nativeEnum(PayrollStatus).optional(),
    frequency: z.nativeEnum(PayrollFrequency).optional(),
    branchId: z.string().optional(),
    departmentId: z.string().optional(),
    periodStart: z.string().datetime().optional(),
    periodEnd: z.string().datetime().optional(),
    payDate: z.string().datetime().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});

export const payrollRunParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Payroll run ID is required'),
  }),
});

export const payrollRunIdSchema = z.object({
  params: z.object({
    payrollId: z.string().min(1, 'Payroll run ID is required'),
  }),
});

export const salaryStructureSchema = z.object({
  body: z.object({
    code: z.string().min(1).max(20).toUpperCase(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    status: z.nativeEnum(SalaryStructureStatus).default(SalaryStructureStatus.DRAFT),
    employeeType: z.array(z.string()).min(1, 'At least one employee type is required'),
    grade: z.string().max(20).optional(),
    effectiveFrom: z.string().datetime(),
    effectiveTo: z.string().datetime().optional(),
    components: z.array(z.object({
      componentId: z.string().min(1),
      componentCode: z.string().min(1),
      componentName: z.string().min(1),
      type: z.enum(['EARNING', 'DEDUCTION', 'REIMBURSEMENT', 'STATUTORY']),
      category: z.string().min(1),
      calculationType: z.enum(['FIXED', 'PERCENTAGE', 'FORMULA', 'SLAB', 'PER_DAY', 'PER_HOUR']),
      value: z.number(),
      formula: z.string().optional(),
      conditions: z.array(z.any()).optional(),
      isFlexible: z.boolean().default(false),
      displayOrder: z.number().int().default(0),
    })).min(1, 'At least one component is required'),
    ctc: z.number().min(0),
    grossSalary: z.number().min(0),
    netSalary: z.number().min(0),
    totalEarnings: z.number().default(0),
    totalDeductions: z.number().default(0),
    totalReimbursements: z.number().default(0),
    totalStatutory: z.number().default(0),
    payFrequency: z.enum(['MONTHLY', 'SEMI_MONTHLY', 'WEEKLY', 'DAILY']).default('MONTHLY'),
    currency: z.string().max(3).default('INR'),
    applicableBranches: z.array(z.string()).optional(),
    applicableDepartments: z.array(z.string()).optional(),
    applicableDesignations: z.array(z.string()).optional(),
    isDefault: z.boolean().default(false),
    version: z.number().int().min(1).default(1),
    previousVersionId: z.string().optional(),
    approvedBy: z.string().optional(),
    approvedAt: z.string().datetime().optional(),
  }).refine((data) => !data.effectiveTo || new Date(data.effectiveFrom) <= new Date(data.effectiveTo!), {
    message: 'Effective from date must be before or equal to effective to date',
    path: ['effectiveFrom'],
  }),
});

export const updateSalaryStructureSchema = z.object({
  body: z.object({
    name: z.string().max(100).optional(),
    description: z.string().max(500).optional(),
    status: z.nativeEnum(SalaryStructureStatus).optional(),
    employeeType: z.array(z.string()).optional(),
    grade: z.string().max(20).optional(),
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime().optional(),
    components: z.array(z.object({
      componentId: z.string().min(1),
      componentCode: z.string().min(1),
      componentName: z.string().min(1),
      type: z.enum(['EARNING', 'DEDUCTION', 'REIMBURSEMENT', 'STATUTORY']),
      category: z.string().min(1),
      calculationType: z.enum(['FIXED', 'PERCENTAGE', 'FORMULA', 'SLAB', 'PER_DAY', 'PER_HOUR']),
      value: z.number(),
      formula: z.string().optional(),
      conditions: z.array(z.any()).optional(),
      isFlexible: z.boolean().optional(),
      displayOrder: z.number().int().optional(),
    })).optional(),
    ctc: z.number().min(0).optional(),
    grossSalary: z.number().min(0).optional(),
    netSalary: z.number().min(0).optional(),
    totalEarnings: z.number().optional(),
    totalDeductions: z.number().optional(),
    totalReimbursements: z.number().optional(),
    totalStatutory: z.number().optional(),
    payFrequency: z.enum(['MONTHLY', 'SEMI_MONTHLY', 'WEEKLY', 'DAILY']).optional(),
    currency: z.string().max(3).optional(),
    applicableBranches: z.array(z.string()).optional(),
    applicableDepartments: z.array(z.string()).optional(),
    applicableDesignations: z.array(z.string()).optional(),
    isDefault: z.boolean().optional(),
    version: z.number().int().min(1).optional(),
    previousVersionId: z.string().optional(),
    approvedBy: z.string().optional(),
    approvedAt: z.string().datetime().optional(),
  }),
});

export const salaryStructureQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    status: z.nativeEnum(SalaryStructureStatus).optional(),
    employeeType: z.string().optional(),
    grade: z.string().optional(),
    isDefault: z.coerce.boolean().optional(),
    branchId: z.string().optional(),
    departmentId: z.string().optional(),
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime().optional(),
  }),
});

export const salaryStructureParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Salary structure ID is required'),
  }),
});

export const form16Schema = z.object({
  body: z.object({
    financialYear: z.string().min(1).max(10),
    quarter: z.number().int().min(1).max(4),
    tanNumber: z.string().min(1).max(20).toUpperCase(),
    employerName: z.string().min(1).max(200),
    employerAddress: z.string().min(1).max(500),
    employeeName: z.string().min(1).max(100),
    employeePan: z.string().min(1).max(10).toUpperCase(),
    employeeAddress: z.string().min(1).max(500),
    grossSalary: z.number().min(0),
    allowancesExempt: z.number().min(0).default(0),
    deductions: z.object({
      section80C: z.number().min(0).default(0),
      section80D: z.number().min(0).default(0),
      section80CCD: z.number().min(0).default(0),
      other: z.number().min(0).default(0),
    }).optional(),
    totalDeductions: z.number().min(0).default(0),
    taxableIncome: z.number().min(0).default(0),
    taxPayable: z.number().min(0).default(0),
    educationCess: z.number().min(0).default(0),
    totalTax: z.number().min(0).default(0),
    tdsDeducted: z.number().min(0).default(0),
    tdsDeposited: z.number().min(0).default(0),
    balanceTax: z.number().min(0).default(0),
  }),
});

export const form16QuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    financialYear: z.string().optional(),
    quarter: z.coerce.number().int().min(1).max(4).optional(),
    employeeId: z.string().optional(),
    branchId: z.string().optional(),
    departmentId: z.string().optional(),
  }),
});

export const form16ParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Form16 ID is required'),
  }),
});

export const payrollComponentSchema = z.object({
  body: z.object({
    code: z.string().min(1).max(20).toUpperCase(),
    name: z.string().min(1).max(100),
    displayName: z.string().max(100).optional(),
    description: z.string().max(500).optional(),
    type: z.nativeEnum(SalaryComponentType),
    category: z.nativeEnum(ComponentCategory),
    calculationType: z.nativeEnum(CalculationType),
    formula: z.object({
      expression: z.string().min(1),
      variables: z.array(z.string()).optional(),
      description: z.string().optional(),
    }).optional(),
    slabs: z.array(z.object({
      min: z.number(),
      max: z.number().optional(),
      value: z.number(),
      type: z.enum(['AMOUNT', 'PERCENTAGE']),
    })).optional(),
    conditions: z.array(z.object({
      field: z.string().min(1),
      operator: z.enum(['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'GREATER_EQUAL', 'LESS_EQUAL', 'IN', 'NOT_IN', 'CONTAINS']),
      value: z.any(),
    })).optional(),
    defaultValue: z.number().default(0),
    minValue: z.number().optional(),
    maxValue: z.number().optional(),
    isTaxable: z.boolean().default(true),
    isStatutory: z.boolean().default(false),
    isActive: z.boolean().default(true),
    effectiveFrom: z.string().datetime(),
    effectiveTo: z.string().datetime().optional(),
    displayOrder: z.number().int().default(0),
    showInPayslip: z.boolean().default(true),
    showInCTC: z.boolean().default(true),
    dependsOn: z.array(z.string()).optional(),
    glCode: z.string().max(50).optional(),
    taxSection: z.string().max(50).optional(),
    exemptionLimit: z.number().min(0).optional(),
  }),
});

export const updatePayrollComponentSchema = z.object({
  body: z.object({
    name: z.string().max(100).optional(),
    displayName: z.string().max(100).optional(),
    description: z.string().max(500).optional(),
    type: z.nativeEnum(SalaryComponentType).optional(),
    category: z.nativeEnum(ComponentCategory).optional(),
    calculationType: z.nativeEnum(CalculationType).optional(),
    formula: z.object({
      expression: z.string().min(1),
      variables: z.array(z.string()).optional(),
      description: z.string().optional(),
    }).optional(),
    slabs: z.array(z.object({
      min: z.number(),
      max: z.number().optional(),
      value: z.number(),
      type: z.enum(['AMOUNT', 'PERCENTAGE']),
    })).optional(),
    conditions: z.array(z.object({
      field: z.string().min(1),
      operator: z.enum(['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'GREATER_EQUAL', 'LESS_EQUAL', 'IN', 'NOT_IN', 'CONTAINS']),
      value: z.any(),
    })).optional(),
    defaultValue: z.number().optional(),
    minValue: z.number().optional(),
    maxValue: z.number().optional(),
    isTaxable: z.boolean().optional(),
    isStatutory: z.boolean().optional(),
    isActive: z.boolean().optional(),
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime().optional(),
    displayOrder: z.number().int().optional(),
    showInPayslip: z.boolean().optional(),
    showInCTC: z.boolean().optional(),
    dependsOn: z.array(z.string()).optional(),
    glCode: z.string().max(50).optional(),
    taxSection: z.string().max(50).optional(),
    exemptionLimit: z.number().min(0).optional(),
  }),
});

export const payrollComponentQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    type: z.nativeEnum(SalaryComponentType).optional(),
    category: z.nativeEnum(ComponentCategory).optional(),
    calculationType: z.nativeEnum(CalculationType).optional(),
    isActive: z.coerce.boolean().optional(),
    isStatutory: z.coerce.boolean().optional(),
  }),
});

export const payrollComponentParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Salary component ID is required'),
  }),
});

export const payrollProcessSchema = z.object({
  body: z.object({
    payrollRunId: z.string().min(1, 'Payroll run ID is required'),
    employeeIds: z.array(z.string()).optional(),
    recalculate: z.boolean().default(false),
    processAttendance: z.boolean().default(true),
    processLeaves: z.boolean().default(true),
    processOvertime: z.boolean().default(true),
    processArrears: z.boolean().default(false),
  }),
});

export const payrollApprovalSchema = z.object({
  body: z.object({
    action: z.enum(['APPROVE', 'REJECT', 'ON_HOLD']),
    remarks: z.string().max(1000).optional(),
    employeeIds: z.array(z.string()).optional(),
  }),
});

export const payrollPaymentSchema = z.object({
  body: z.object({
    payrollRunId: z.string().min(1, 'Payroll run ID is required'),
    paymentMode: z.enum(['BANK_TRANSFER', 'CHEQUE', 'CASH', 'UPI']),
    bankFileFormat: z.string().optional(),
    paidBy: z.string().min(1, 'Paid by is required'),
    paidAt: z.string().datetime().optional(),
    employeePayments: z.array(z.object({
      employeeId: z.string().min(1),
      amount: z.number().min(0),
      referenceNumber: z.string().optional(),
      bankAccountId: z.string().optional(),
    })).optional(),
  }),
});

export const salarySlipQuerySchema = z.object({
  query: z.object({
    employeeId: z.string().optional(),
    payrollRunId: z.string().optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).optional(),
    branchId: z.string().optional(),
    departmentId: z.string().optional(),
    format: z.enum(['json', 'pdf', 'excel']).default('json'),
  }),
});