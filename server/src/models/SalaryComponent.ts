import mongoose, { Document, Schema, Types } from 'mongoose';
import { SoftDeleteModel, softDeletePlugin } from '../plugins/softDelete';

export enum SalaryComponentType {
  EARNING = 'EARNING',
  DEDUCTION = 'DEDUCTION',
  REIMBURSEMENT = 'REIMBURSEMENT',
  STATUTORY = 'STATUTORY',
}

export enum CalculationType {
  FIXED = 'FIXED',
  PERCENTAGE = 'PERCENTAGE',
  FORMULA = 'FORMULA',
  SLAB = 'SLAB',
  PER_DAY = 'PER_DAY',
  PER_HOUR = 'PER_HOUR',
}

export enum PayFrequency {
  MONTHLY = 'MONTHLY',
  SEMI_MONTHLY = 'SEMI_MONTHLY',
  WEEKLY = 'WEEKLY',
  DAILY = 'DAILY',
}

export enum ComponentCategory {
  BASIC = 'BASIC',
  ALLOWANCE = 'ALLOWANCE',
  REIMBURSEMENT = 'REIMBURSEMENT',
  BONUS = 'BONUS',
  OVERTIME = 'OVERTIME',
  ARREARS = 'ARREARS',
  PROVIDENT_FUND = 'PROVIDENT_FUND',
  ESI = 'ESI',
  PROFESSIONAL_TAX = 'PROFESSIONAL_TAX',
  TDS = 'TDS',
  INSURANCE = 'INSURANCE',
  LOAN = 'LOAN',
  ADVANCE = 'ADVANCE',
  OTHER_DEDUCTION = 'OTHER_DEDUCTION',
}

export interface ISalaryComponentFormula {
  expression: string;
  variables: string[];
  description?: string;
}

export interface ISalaryComponentSlab {
  _id: Types.ObjectId;
  min: number;
  max?: number;
  value: number;
  type: 'AMOUNT' | 'PERCENTAGE';
}

export interface ISalaryComponentCondition {
  field: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'GREATER_EQUAL' | 'LESS_EQUAL' | 'IN' | 'NOT_IN' | 'CONTAINS';
  value: any;
}

export interface ISalaryComponent extends Document, { deletedAt?: Date; isDeleted: boolean } {
  _id: Types.ObjectId;
  code: string;
  name: string;
  displayName?: string;
  description?: string;
  type: SalaryComponentType;
  category: ComponentCategory;
  calculationType: CalculationType;
  formula?: ISalaryComponentFormula;
  slabs?: ISalaryComponentSlab[];
  conditions?: ISalaryComponentCondition[];
  defaultValue: number;
  minValue?: number;
  maxValue?: number;
  isTaxable: boolean;
  isStatutory: boolean;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo?: Date;
  displayOrder: number;
  showInPayslip: boolean;
  showInCTC: boolean;
  dependsOn: Types.ObjectId[];
  glCode?: string;
  taxSection?: string;
  exemptionLimit?: number;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
}

const salaryComponentFormulaSchema = new Schema<ISalaryComponentFormula>({
  expression: { type: String, required: true, trim: true },
  variables: [{ type: String, trim: true }],
  description: { type: String, trim: true },
}, { _id: false });

const salaryComponentSlabSchema = new Schema<ISalaryComponentSlab>({
  min: { type: Number, required: true },
  max: { type: Number },
  value: { type: Number, required: true },
  type: { type: String, enum: ['AMOUNT', 'PERCENTAGE'], required: true },
}, { _id: true });

const salaryComponentConditionSchema = new Schema<ISalaryComponentCondition>({
  field: { type: String, required: true, trim: true },
  operator: { type: String, enum: ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'GREATER_EQUAL', 'LESS_EQUAL', 'IN', 'NOT_IN', 'CONTAINS'], required: true },
  value: { type: Schema.Types.Mixed, required: true },
}, { _id: false });

const salaryComponentSchema = new Schema<ISalaryComponent>({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  displayName: { type: String, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500 },
  type: { type: String, enum: Object.values(SalaryComponentType), required: true },
  category: { type: String, enum: Object.values(ComponentCategory), required: true },
  calculationType: { type: String, enum: Object.values(CalculationType), required: true },
  formula: { type: salaryComponentFormulaSchema },
  slabs: [salaryComponentSlabSchema],
  conditions: [salaryComponentConditionSchema],
  defaultValue: { type: Number, required: true, default: 0 },
  minValue: { type: Number },
  maxValue: { type: Number },
  isTaxable: { type: Boolean, default: true },
  isStatutory: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  effectiveFrom: { type: Date, required: true },
  effectiveTo: { type: Date },
  displayOrder: { type: Number, default: 0 },
  showInPayslip: { type: Boolean, default: true },
  showInCTC: { type: Boolean, default: true },
  dependsOn: [{ type: Schema.Types.ObjectId, ref: 'SalaryComponent' }],
  glCode: { type: String, trim: true, maxlength: 50 },
  taxSection: { type: String, trim: true, maxlength: 50 },
  exemptionLimit: { type: Number, min: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

salaryComponentSchema.index({ code: 1 });
salaryComponentSchema.index({ type: 1, category: 1, isActive: 1 });
salaryComponentSchema.index({ effectiveFrom: 1, effectiveTo: 1 });

salaryComponentSchema.virtual('isCurrent').get(function (this: ISalaryComponent) {
  const now = new Date();
  return this.effectiveFrom <= now && (!this.effectiveTo || this.effectiveTo >= now);
});

salaryComponentSchema.methods.calculate = function (context: Record<string, number>): number {
  switch (this.calculationType) {
    case CalculationType.FIXED:
      return this.defaultValue;
    case CalculationType.PERCENTAGE:
      const base = context[this.formula?.variables[0] || 'basic'] || 0;
      return (base * this.defaultValue) / 100;
    case CalculationType.FORMULA:
      if (this.formula?.expression) {
        const vars = { ...context };
        for (const [key, value] of Object.entries(vars)) {
          if (typeof value === 'number') {
            vars[key] = value;
          }
        }
        return eval(this.formula.expression);
      }
      return this.defaultValue;
    case CalculationType.SLAB:
      const amount = context[this.formula?.variables[0] || 'gross'] || 0;
      for (const slab of this.slabs || []) {
        if (amount >= slab.min && (!slab.max || amount <= slab.max)) {
          return slab.type === 'PERCENTAGE' ? (amount * slab.value) / 100 : slab.value;
        }
      }
      return this.defaultValue;
    case CalculationType.PER_DAY:
      const dailyRate = (context['basic'] || 0) / (context['workingDays'] || 30);
      return dailyRate * (context['daysWorked'] || 0);
    case CalculationType.PER_HOUR:
      const hourlyRate = (context['basic'] || 0) / (context['workingHours'] || 160);
      return hourlyRate * (context['hoursWorked'] || 0);
    default:
      return this.defaultValue;
  }
};

salaryComponentSchema.plugin(softDeletePlugin);

export const SalaryComponent = mongoose.model<ISalaryComponent, SoftDeleteModel<ISalaryComponent>>('SalaryComponent', salaryComponentSchema);
export default SalaryComponent;