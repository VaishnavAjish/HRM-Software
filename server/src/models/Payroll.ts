import mongoose, { Document, Schema, Types } from 'mongoose';
import { SoftDeleteModel, softDeletePlugin } from '../plugins/softDelete';

export enum PayrollStatus {
  DRAFT = 'DRAFT',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  ON_HOLD = 'ON_HOLD',
}

export enum PayrollFrequency {
  WEEKLY = 'WEEKLY',
  BI_WEEKLY = 'BI_WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUALLY = 'ANNUALLY',
}

export interface IPayrollComponent {
  salaryComponentId: Types.ObjectId;
  name: string;
  type: 'EARNING' | 'DEDUCTION' | 'REIMBURSEMENT' | 'STATUTORY';
  amount: number;
  taxable: boolean;
  isFixed: boolean;
  calculationType: 'FIXED' | 'PERCENTAGE' | 'FORMULA' | 'ATTENDANCE_BASED';
  formula?: string;
  dependsOn?: Types.ObjectId[];
}

export interface IEmployeePayroll {
  employeeId: Types.ObjectId;
  employeeCode: string;
  employeeName: string;
  branchId: Types.ObjectId;
  departmentId: Types.ObjectId;
  designationId: Types.ObjectId;
  joiningDate: Date;
  bankAccountId?: Types.ObjectId;
  panNumber?: string;
  uanNumber?: string;
  esicNumber?: string;
  workingDays: number;
  paidDays: number;
  lopDays: number;
  components: IPayrollComponent[];
  grossEarnings: number;
  grossDeductions: number;
  netPay: number;
  taxDeducted: number;
  tdsAmount: number;
  pfEmployee: number;
  pfEmployer: number;
  esicEmployee: number;
  esicEmployer: number;
  professionalTax: number;
  arrearsAmount: number;
  bonusAmount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID' | 'ON_HOLD';
  remarks?: string;
}

export interface IForm16Data {
  financialYear: string;
  quarter: number;
  tanNumber: string;
  employerName: string;
  employerAddress: string;
  employeeName: string;
  employeePan: string;
  employeeAddress: string;
  grossSalary: number;
  allowancesExempt: number;
  deductions: {
    section80C: number;
    section80D: number;
    section80CCD: number;
    other: number;
  };
  totalDeductions: number;
  taxableIncome: number;
  taxPayable: number;
  educationCess: number;
  totalTax: number;
  tdsDeducted: number;
  tdsDeposited: number;
  balanceTax: number;
}

export interface IPayroll extends Document {
  _id: Types.ObjectId;
  runNumber: string;
  name: string;
  description?: string;
  frequency: PayrollFrequency;
  status: PayrollStatus;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  branchId?: Types.ObjectId;
  departmentId?: Types.ObjectId;
  processedBy?: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  paidBy?: Types.ObjectId;
  employees: IEmployeePayroll[];
  totalEmployees: number;
  totalGrossEarnings: number;
  totalGrossDeductions: number;
  totalNetPay: number;
  totalTax: number;
  totalPf: number;
  totalEsic: number;
  totalProfessionalTax: number;
  bankFileGenerated: boolean;
  bankFileGeneratedAt?: Date;
  bankFileUrl?: string;
  payslipGenerated: boolean;
  payslipGeneratedAt?: Date;
  payslipUrl?: string;
  form16Generated: boolean;
  form16Data?: IForm16Data;
  form16Url?: string;
  notes?: string;
  customFields: Map<string, any>;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
}

const payrollComponentSchema = new Schema<IPayrollComponent>({
  salaryComponentId: { type: Schema.Types.ObjectId, ref: 'SalaryComponent', required: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['EARNING', 'DEDUCTION', 'REIMBURSEMENT', 'STATUTORY'], required: true },
  amount: { type: Number, required: true },
  taxable: { type: Boolean, default: true },
  isFixed: { type: Boolean, default: true },
  calculationType: { type: String, enum: ['FIXED', 'PERCENTAGE', 'FORMULA', 'ATTENDANCE_BASED'], required: true },
  formula: { type: String, trim: true },
  dependsOn: [{ type: Schema.Types.ObjectId, ref: 'SalaryComponent' }],
}, { _id: false });

const employeePayrollSchema = new Schema<IEmployeePayroll>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeCode: { type: String, required: true, trim: true },
  employeeName: { type: String, required: true, trim: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  designationId: { type: Schema.Types.ObjectId, ref: 'Designation', required: true },
  joiningDate: { type: Date, required: true },
  bankAccountId: { type: Schema.Types.ObjectId, ref: 'BankAccount' },
  panNumber: { type: String, trim: true, uppercase: true },
  uanNumber: { type: String, trim: true, uppercase: true },
  esicNumber: { type: String, trim: true, uppercase: true },
  workingDays: { type: Number, required: true, min: 0 },
  paidDays: { type: Number, required: true, min: 0 },
  lopDays: { type: Number, default: 0, min: 0 },
  components: { type: [payrollComponentSchema], default: [] },
  grossEarnings: { type: Number, default: 0 },
  grossDeductions: { type: Number, default: 0 },
  netPay: { type: Number, default: 0 },
  taxDeducted: { type: Number, default: 0 },
  tdsAmount: { type: Number, default: 0 },
  pfEmployee: { type: Number, default: 0 },
  pfEmployer: { type: Number, default: 0 },
  esicEmployee: { type: Number, default: 0 },
  esicEmployer: { type: Number, default: 0 },
  professionalTax: { type: Number, default: 0 },
  arrearsAmount: { type: Number, default: 0 },
  bonusAmount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'PAID', 'ON_HOLD'],
    default: 'PENDING',
  },
  remarks: { type: String, trim: true },
}, { _id: false });

const form16DataSchema = new Schema<IForm16Data>({
  financialYear: { type: String, required: true, trim: true },
  quarter: { type: Number, required: true, min: 1, max: 4 },
  tanNumber: { type: String, required: true, trim: true, uppercase: true },
  employerName: { type: String, required: true, trim: true },
  employerAddress: { type: String, required: true, trim: true },
  employeeName: { type: String, required: true, trim: true },
  employeePan: { type: String, required: true, trim: true, uppercase: true },
  employeeAddress: { type: String, required: true, trim: true },
  grossSalary: { type: Number, required: true, min: 0 },
  allowancesExempt: { type: Number, default: 0 },
  deductions: {
    section80C: { type: Number, default: 0 },
    section80D: { type: Number, default: 0 },
    section80CCD: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
  },
  totalDeductions: { type: Number, default: 0 },
  taxableIncome: { type: Number, default: 0 },
  taxPayable: { type: Number, default: 0 },
  educationCess: { type: Number, default: 0 },
  totalTax: { type: Number, default: 0 },
  tdsDeducted: { type: Number, default: 0 },
  tdsDeposited: { type: Number, default: 0 },
  balanceTax: { type: Number, default: 0 },
}, { _id: false });

const payrollSchema = new Schema<IPayroll>(
  {
    runNumber: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000 },
    frequency: { type: String, enum: Object.values(PayrollFrequency), required: true },
    status: { type: String, enum: Object.values(PayrollStatus), default: PayrollStatus.DRAFT, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    payDate: { type: Date, required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User' },
    employees: { type: [employeePayrollSchema], default: [] },
    totalEmployees: { type: Number, default: 0, min: 0 },
    totalGrossEarnings: { type: Number, default: 0 },
    totalGrossDeductions: { type: Number, default: 0 },
    totalNetPay: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    totalPf: { type: Number, default: 0 },
    totalEsic: { type: Number, default: 0 },
    totalProfessionalTax: { type: Number, default: 0 },
    bankFileGenerated: { type: Boolean, default: false },
    bankFileGeneratedAt: { type: Date },
    bankFileUrl: { type: String, trim: true },
    payslipGenerated: { type: Boolean, default: false },
    payslipGeneratedAt: { type: Date },
    payslipUrl: { type: String, trim: true },
    form16Generated: { type: Boolean, default: false },
    form16Data: { type: form16DataSchema },
    form16Url: { type: String, trim: true },
    notes: { type: String, trim: true },
    customFields: { type: Map, of: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

payrollSchema.index({ runNumber: 1 });
payrollSchema.index({ status: 1, periodStart: 1, periodEnd: 1 });
payrollSchema.index({ branchId: 1, departmentId: 1 });
payrollSchema.index({ payDate: 1 });
payrollSchema.index({ 'employees.employeeId': 1 });

payrollSchema.virtual('isProcessable').get(function (this: IPayroll) {
  return [PayrollStatus.DRAFT, PayrollStatus.ON_HOLD].includes(this.status);
});

payrollSchema.methods.calculateTotals = function () {
  this.totalEmployees = this.employees.length;
  this.totalGrossEarnings = this.employees.reduce((sum, emp) => sum + emp.grossEarnings, 0);
  this.totalGrossDeductions = this.employees.reduce((sum, emp) => sum + emp.grossDeductions, 0);
  this.totalNetPay = this.employees.reduce((sum, emp) => sum + emp.netPay, 0);
  this.totalTax = this.employees.reduce((sum, emp) => sum + emp.tdsAmount, 0);
  this.totalPf = this.employees.reduce((sum, emp) => sum + emp.pfEmployee + emp.pfEmployer, 0);
  this.totalEsic = this.employees.reduce((sum, emp) => sum + emp.esicEmployee + emp.esicEmployer, 0);
  this.totalProfessionalTax = this.employees.reduce((sum, emp) => sum + emp.professionalTax, 0);
};

payrollSchema.plugin(softDeletePlugin);

export const Payroll = mongoose.model<IPayroll, SoftDeleteModel<IPayroll>>('Payroll', payrollSchema);
export default Payroll;