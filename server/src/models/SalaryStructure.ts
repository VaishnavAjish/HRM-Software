import mongoose, { Document, Schema, Types } from 'mongoose';
import { SoftDeleteModel, softDeletePlugin } from '../plugins/softDelete';

export enum SalaryStructureStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export interface ISalaryStructureComponent {
  _id: Types.ObjectId;
  componentId: Types.ObjectId;
  componentCode: string;
  componentName: string;
  type: string;
  category: string;
  calculationType: string;
  value: number;
  formula?: string;
  conditions?: any[];
  isFlexible: boolean;
  displayOrder: number;
}

export interface ISalaryStructure extends Document, { deletedAt?: Date; isDeleted: boolean } {
  _id: Types.ObjectId;
  code: string;
  name: string;
  description?: string;
  status: SalaryStructureStatus;
  employeeType: string[];
  grade?: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  components: ISalaryStructureComponent[];
  ctc: number;
  grossSalary: number;
  netSalary: number;
  totalEarnings: number;
  totalDeductions: number;
  totalReimbursements: number;
  totalStatutory: number;
  payFrequency: string;
  currency: string;
  applicableBranches: Types.ObjectId[];
  applicableDepartments: Types.ObjectId[];
  applicableDesignations: Types.ObjectId[];
  isDefault: boolean;
  version: number;
  previousVersionId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
  isCurrent: boolean;
}

const salaryStructureComponentSchema = new Schema<ISalaryStructureComponent>({
  componentId: { type: Schema.Types.ObjectId, ref: 'SalaryComponent', required: true },
  componentCode: { type: String, required: true, trim: true },
  componentName: { type: String, required: true, trim: true },
  type: { type: String, enum: ['EARNING', 'DEDUCTION', 'REIMBURSEMENT', 'STATUTORY'], required: true },
  category: { type: String, required: true, trim: true },
  calculationType: { type: String, enum: ['FIXED', 'PERCENTAGE', 'FORMULA', 'SLAB', 'PER_DAY', 'PER_HOUR'], required: true },
  value: { type: Number, required: true },
  formula: { type: String, trim: true },
  conditions: [{ type: Schema.Types.Mixed }],
  isFlexible: { type: Boolean, default: false },
  displayOrder: { type: Number, default: 0 },
}, { _id: true });

const salaryStructureSchema = new Schema<ISalaryStructure>({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500 },
  status: { type: String, enum: Object.values(SalaryStructureStatus), default: SalaryStructureStatus.DRAFT, required: true },
  employeeType: [{ type: String, trim: true, required: true }],
  grade: { type: String, trim: true, maxlength: 20 },
  effectiveFrom: { type: Date, required: true },
  effectiveTo: { type: Date },
  components: [salaryStructureComponentSchema],
  ctc: { type: Number, required: true, min: 0 },
  grossSalary: { type: Number, required: true, min: 0 },
  netSalary: { type: Number, required: true, min: 0 },
  totalEarnings: { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  totalReimbursements: { type: Number, default: 0 },
  totalStatutory: { type: Number, default: 0 },
  payFrequency: { type: String, enum: ['MONTHLY', 'SEMI_MONTHLY', 'WEEKLY', 'DAILY'], default: 'MONTHLY' },
  currency: { type: String, default: 'INR', maxlength: 3 },
  applicableBranches: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
  applicableDepartments: [{ type: Schema.Types.ObjectId, ref: 'Department' }],
  applicableDesignations: [{ type: Schema.Types.ObjectId, ref: 'Designation' }],
  isDefault: { type: Boolean, default: false },
  version: { type: Number, default: 1, min: 1 },
  previousVersionId: { type: Schema.Types.ObjectId, ref: 'SalaryStructure', sparse: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

salaryStructureSchema.index({ code: 1 });
salaryStructureSchema.index({ status: 1, effectiveFrom: 1, effectiveTo: 1 });
salaryStructureSchema.index({ employeeType: 1, grade: 1 });
salaryStructureSchema.index({ applicableBranches: 1, applicableDepartments: 1 });
salaryStructureSchema.index({ isDefault: 1 });

salaryStructureSchema.virtual('isCurrent').get(function (this: ISalaryStructure) {
  const now = new Date();
  return this.effectiveFrom <= now && (!this.effectiveTo || this.effectiveTo >= now) && this.status === SalaryStructureStatus.ACTIVE;
});

salaryStructureSchema.pre('save', function (next) {
  let earnings = 0, deductions = 0, reimbursements = 0, statutory = 0;
  
  for (const comp of this.components) {
    const value = comp.value || 0;
    switch (comp.type) {
      case 'EARNING':
        earnings += value;
        break;
      case 'DEDUCTION':
        deductions += value;
        break;
      case 'REIMBURSEMENT':
        reimbursements += value;
        break;
      case 'STATUTORY':
        statutory += value;
        break;
    }
  }
  
  this.totalEarnings = earnings;
  this.totalDeductions = deductions;
  this.totalReimbursements = reimbursements;
  this.totalStatutory = statutory;
  this.grossSalary = earnings + reimbursements;
  this.netSalary = this.grossSalary - deductions;
  this.ctc = this.grossSalary + statutory;
  
  next();
});

salaryStructureSchema.methods.calculateForEmployee = async function (employeeId: Types.ObjectId) {
  const Employee = this.model('Employee');
  const employee = await Employee.findById(employeeId);
  if (!employee) throw new Error('Employee not found');
  
  let result = {
    ctc: this.ctc,
    gross: this.grossSalary,
    net: this.netSalary,
    components: [] as any[],
  };
  
  for (const comp of this.components) {
    let value = comp.value;
    
    if (comp.calculationType === 'PERCENTAGE' && comp.formula) {
      const baseComponent = this.components.find(c => c.componentCode === comp.formula);
      if (baseComponent) value = (baseComponent.value * comp.value) / 100;
    } else if (comp.calculationType === 'FORMULA' && comp.formula) {
      try {
        const vars: Record<string, number> = {};
        for (const c of this.components) {
          vars[c.componentCode] = c.value;
        }
        value = Function('"use strict"; return (' + comp.formula + ')')().call(vars);
      } catch {
        value = comp.value;
      }
    }
    
    result.components.push({
      ...comp.toObject(),
      calculatedValue: value,
    });
  }
  
  return result;
};

salaryStructureSchema.plugin(softDeletePlugin);

export const SalaryStructure = mongoose.model<ISalaryStructure, SoftDeleteModel<ISalaryStructure>>('SalaryStructure', salaryStructureSchema);
export default SalaryStructure;