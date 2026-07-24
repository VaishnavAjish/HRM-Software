import mongoose, { Document, Schema, Types } from 'mongoose';
import { SoftDeleteModel, softDeletePlugin } from '../plugins/softDelete';

export enum LeaveTypeEnum {
  ANNUAL = 'ANNUAL',
  SICK = 'SICK',
  CASUAL = 'CASUAL',
  MATERNITY = 'MATERNITY',
  PATERNITY = 'PATERNITY',
  MARRIAGE = 'MARRIAGE',
  BEREAVEMENT = 'BEREAVEMENT',
  COMP_OFF = 'COMP_OFF',
  UNPAID = 'UNPAID',
  STUDY = 'STUDY',
  SABBATICAL = 'SABBATICAL',
  MEDICAL = 'MEDICAL',
  EMERGENCY = 'EMERGENCY',
}

export enum LeaveCategory {
  PAID = 'PAID',
  UNPAID = 'UNPAID',
  STATUTORY = 'STATUTORY',
  SPECIAL = 'SPECIAL',
}

export enum AccrualFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  HALF_YEARLY = 'HALF_YEARLY',
  YEARLY = 'YEARLY',
  ON_JOINING = 'ON_JOINING',
}

export enum CarryForwardType {
  NONE = 'NONE',
  FULL = 'FULL',
  LIMITED = 'LIMITED',
  EXPIRES = 'EXPIRES',
}

export enum GenderApplicability {
  ALL = 'ALL',
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export interface IAccrualRule {
  frequency: AccrualFrequency;
  accrualRate: number;
  maxAccrualPerPeriod?: number;
  eligibilityDays?: number;
  proRata: boolean;
  accrualDayOfMonth?: number;
  accrualDayOfWeek?: number;
}

export interface ICarryForwardRule {
  type: CarryForwardType;
  maxDays?: number;
  maxPercentage?: number;
  expiryMonths?: number;
  requiresApproval: boolean;
}

export interface ILeaveTypeConfig {
  minDaysPerRequest?: number;
  maxDaysPerRequest?: number;
  maxDaysPerYear?: number;
  requiresApproval: boolean;
  approvalLevels: number;
  allowHalfDay: boolean;
  allowHourly: boolean;
  advanceNoticeDays?: number;
  maxConsecutiveDays?: number;
  requireMedicalCertificateAfterDays?: number;
  genderApplicability: GenderApplicability;
  minAge?: number;
  maxAge?: number;
  maritalStatusApplicability?: string[];
  employmentTypesApplicable: string[];
  probationPeriodApplicable: boolean;
  noticePeriodDays?: number;
  isEncashable: boolean;
  encashmentMaxDays?: number;
  encashmentFrequency?: AccrualFrequency;
  isCompensable: boolean;
  compensatoryOffExpiryMonths?: number;
  color: string;
  icon?: string;
}

export interface ILeaveType extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  description?: string;
  category: LeaveCategory;
  isActive: boolean;
  isSystem: boolean;
  accrualRule: IAccrualRule;
  carryForwardRule: ICarryForwardRule;
  config: ILeaveTypeConfig;
  applicableBranches: Types.ObjectId[];
  applicableDepartments: Types.ObjectId[];
  applicableDesignations: Types.ObjectId[];
  applicableEmployeeTypes: string[];
  effectiveFrom: Date;
  effectiveTo?: Date;
  displayOrder: number;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
  getAvailableBalance(employeeId: Types.ObjectId, date: Date): Promise<number>;
  isApplicableToEmployee(employeeId: Types.ObjectId, date?: Date): Promise<boolean>;
}

const accrualRuleSchema = new Schema<IAccrualRule>({
  frequency: { type: String, enum: Object.values(AccrualFrequency), required: true },
  accrualRate: { type: Number, required: true, min: 0 },
  maxAccrualPerPeriod: { type: Number, min: 0 },
  eligibilityDays: { type: Number, min: 0, default: 0 },
  proRata: { type: Boolean, default: true },
  accrualDayOfMonth: { type: Number, min: 1, max: 31 },
  accrualDayOfWeek: { type: Number, min: 0, max: 6 },
}, { _id: false });

const carryForwardRuleSchema = new Schema<ICarryForwardRule>({
  type: { type: String, enum: Object.values(CarryForwardType), default: CarryForwardType.NONE, required: true },
  maxDays: { type: Number, min: 0 },
  maxPercentage: { type: Number, min: 0, max: 100 },
  expiryMonths: { type: Number, min: 0 },
  requiresApproval: { type: Boolean, default: true },
}, { _id: false });

const leaveTypeConfigSchema = new Schema<ILeaveTypeConfig>({
  minDaysPerRequest: { type: Number, min: 0.5, default: 0.5 },
  maxDaysPerRequest: { type: Number, min: 1 },
  maxDaysPerYear: { type: Number, min: 1 },
  requiresApproval: { type: Boolean, default: true },
  approvalLevels: { type: Number, min: 1, max: 5, default: 1 },
  allowHalfDay: { type: Boolean, default: true },
  allowHourly: { type: Boolean, default: false },
  advanceNoticeDays: { type: Number, min: 0 },
  maxConsecutiveDays: { type: Number, min: 1 },
  requireMedicalCertificateAfterDays: { type: Number, min: 1 },
  genderApplicability: { type: String, enum: Object.values(GenderApplicability), default: GenderApplicability.ALL },
  minAge: { type: Number, min: 0 },
  maxAge: { type: Number, min: 0 },
  maritalStatusApplicability: [{ type: String, trim: true }],
  employmentTypesApplicable: [{ type: String, trim: true }],
  probationPeriodApplicable: { type: Boolean, default: true },
  noticePeriodDays: { type: Number, min: 0 },
  isEncashable: { type: Boolean, default: false },
  encashmentMaxDays: { type: Number, min: 0 },
  encashmentFrequency: { type: String, enum: Object.values(AccrualFrequency) },
  isCompensable: { type: Boolean, default: false },
  compensatoryOffExpiryMonths: { type: Number, min: 0 },
  color: { type: String, required: true, match: /^#[0-9A-Fa-f]{6}$/ },
  icon: { type: String, trim: true },
}, { _id: false });

const leaveTypeSchema = new Schema<ILeaveType>({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500 },
  category: { type: String, enum: Object.values(LeaveCategory), required: true },
  isActive: { type: Boolean, default: true },
  isSystem: { type: Boolean, default: false },
  accrualRule: { type: accrualRuleSchema, required: true },
  carryForwardRule: { type: carryForwardRuleSchema, required: true },
  config: { type: leaveTypeConfigSchema, required: true },
  applicableBranches: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
  applicableDepartments: [{ type: Schema.Types.ObjectId, ref: 'Department' }],
  applicableDesignations: [{ type: Schema.Types.ObjectId, ref: 'Designation' }],
  applicableEmployeeTypes: [{ type: String, trim: true }],
  effectiveFrom: { type: Date, required: true },
  effectiveTo: { type: Date },
  displayOrder: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

leaveTypeSchema.index({ category: 1, isActive: 1 });
leaveTypeSchema.index({ effectiveFrom: 1, effectiveTo: 1 });
leaveTypeSchema.index({ applicableBranches: 1, applicableDepartments: 1 });

leaveTypeSchema.virtual('isCurrent').get(function (this: ILeaveType) {
  const now = new Date();
  return this.effectiveFrom <= now && (!this.effectiveTo || this.effectiveTo >= now);
});

leaveTypeSchema.methods.getAvailableBalance = async function (employeeId: Types.ObjectId, date: Date): Promise<number> {
  const LeaveBalance = this.model('LeaveBalance');
  const balance = await LeaveBalance.findOne({ 
    employeeId, 
    leaveTypeId: this._id, 
    year: date.getFullYear() 
  });
  return balance?.available || 0;
};

leaveTypeSchema.methods.isApplicableToEmployee = async function (employeeId: Types.ObjectId, date: Date = new Date()): Promise<boolean> {
  const Employee = this.model('Employee');
  const employee = await Employee.findById(employeeId).populate('employmentDetails');
  if (!employee) return false;
  
  const emp = employee.employmentDetails;
  
  if (this.applicableBranches.length && !this.applicableBranches.some((b: Types.ObjectId) => b.equals(emp.branchId))) return false;
  if (this.applicableDepartments.length && !this.applicableDepartments.some((d: Types.ObjectId) => d.equals(emp.departmentId))) return false;
  if (this.applicableDesignations.length && !this.applicableDesignations.some((d: Types.ObjectId) => d.equals(emp.designationId))) return false;
  if (this.applicableEmployeeTypes.length && !this.applicableEmployeeTypes.includes(emp.employmentType)) return false;
  
  if (this.config.genderApplicability !== GenderApplicability.ALL && 
      this.config.genderApplicability !== employee.personalInfo.gender) return false;
  
  if (this.config.minAge && employee.age < this.config.minAge) return false;
  if (this.config.maxAge && employee.age > this.config.maxAge) return false;
  
  if (this.config.maritalStatusApplicability?.length && 
      !this.config.maritalStatusApplicability.includes(employee.personalInfo.maritalStatus)) return false;
  
  const joiningDate = new Date(emp.joiningDate);
  const daysSinceJoining = Math.floor((date.getTime() - joiningDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceJoining < (this.accrualRule.eligibilityDays || 0)) return false;
  
  if (!this.config.probationPeriodApplicable && emp.employmentStatus === 'PROBATION') return false;
  
  return true;
};

leaveTypeSchema.plugin(softDeletePlugin);

export const LeaveType = mongoose.model<ILeaveType, SoftDeleteModel<ILeaveType>>('LeaveType', leaveTypeSchema);
export default LeaveType;