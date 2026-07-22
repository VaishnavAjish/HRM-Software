import mongoose, { Document, Schema, Types } from 'mongoose';
import { SoftDeleteModel, softDeletePlugin } from '../plugins/softDelete';

export enum DepartmentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export interface IDepartment extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  displayName?: string;
  description?: string;
  branchId: Types.ObjectId;
  parentDepartmentId?: Types.ObjectId;
  headId?: Types.ObjectId;
  status: DepartmentStatus;
  costCenterCode?: string;
  budget?: {
    allocated: number;
    spent: number;
    fiscalYear: string;
    currency: string;
  };
  location?: string;
  email?: string;
  phone?: string;
  customFields: Map<string, any>;
  notes?: string;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
  fullName: string;
  level: number;
  children: IDepartment[];
}

const departmentSchema = new Schema<IDepartment>(
  {
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    displayName: { type: String, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 1000 },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    parentDepartmentId: { type: Schema.Types.ObjectId, ref: 'Department', sparse: true },
    headId: { type: Schema.Types.ObjectId, ref: 'Employee', sparse: true },
    status: { type: String, enum: Object.values(DepartmentStatus), default: DepartmentStatus.ACTIVE, required: true },
    costCenterCode: { type: String, trim: true, uppercase: true, maxlength: 30 },
    budget: {
      allocated: { type: Number, default: 0, min: 0 },
      spent: { type: Number, default: 0, min: 0 },
      fiscalYear: { type: String, trim: true, maxlength: 10 },
      currency: { type: String, default: 'INR', maxlength: 3 },
    },
    location: { type: String, trim: true, maxlength: 200 },
    email: { type: String, trim: true, lowercase: true, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 20 },
    customFields: { type: Map, of: Schema.Types.Mixed, default: {} },
    notes: { type: String, trim: true, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

departmentSchema.index({ code: 1, branchId: 1 }, { unique: true });
departmentSchema.index({ name: 1, branchId: 1 });
departmentSchema.index({ branchId: 1, status: 1 });
departmentSchema.index({ parentDepartmentId: 1 });
departmentSchema.index({ headId: 1 });

departmentSchema.virtual('fullName').get(function (this: IDepartment) {
  return this.displayName || `${this.code} - ${this.name}`;
});

departmentSchema.virtual('level').get(function (this: IDepartment) {
  return 0;
});

departmentSchema.virtual('children', {
  ref: 'Department',
  localField: '_id',
  foreignField: 'parentDepartmentId',
});

departmentSchema.virtual('head', {
  ref: 'Employee',
  localField: 'headId',
  foreignField: '_id',
  justOne: true,
});

departmentSchema.virtual('branch', {
  ref: 'Branch',
  localField: 'branchId',
  foreignField: '_id',
  justOne: true,
});

departmentSchema.virtual('employees', {
  ref: 'Employee',
  localField: '_id',
  foreignField: 'employmentDetails.departmentId',
});

departmentSchema.pre('save', function (next) {
  if (this.parentDepartmentId && this.parentDepartmentId.equals(this._id)) {
    throw new Error('Department cannot be its own parent');
  }
  next();
});

departmentSchema.plugin(softDeletePlugin);

export const Department = mongoose.model<IDepartment, SoftDeleteModel<IDepartment>>('Department', departmentSchema);
export default Department;