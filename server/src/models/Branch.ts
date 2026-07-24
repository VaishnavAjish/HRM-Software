import mongoose, { Document, Schema, Types } from 'mongoose';
import { SoftDeleteModel, softDeletePlugin } from '../plugins/softDelete';

export enum BranchStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  UNDER_MAINTENANCE = 'UNDER_MAINTENANCE',
  CLOSED = 'CLOSED',
}

export enum BranchType {
  HEAD_OFFICE = 'HEAD_OFFICE',
  BRANCH_OFFICE = 'BRANCH_OFFICE',
  REGIONAL_OFFICE = 'REGIONAL_OFFICE',
  WAREHOUSE = 'WAREHOUSE',
  REMOTE = 'REMOTE',
}

export interface IAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  landmark?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface IContactInfo {
  phone: string;
  alternatePhone?: string;
  email: string;
  alternateEmail?: string;
  fax?: string;
  website?: string;
}

export interface IOperatingHours {
  day: string;
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
  breakStartTime?: string;
  breakEndTime?: string;
  timezone: string;
}

export interface IBranch extends Document, { deletedAt?: Date; isDeleted: boolean } {
  _id: Types.ObjectId;
  code: string;
  name: string;
  displayName?: string;
  type: BranchType;
  status: BranchStatus;
  address: IAddress;
  contact: IContactInfo;
  operatingHours: IOperatingHours[];
  managerId?: Types.ObjectId;
  parentBranchId?: Types.ObjectId;
  timezone: string;
  currency: string;
  language: string;
  isHeadOffice: boolean;
  gstNumber?: string;
  panNumber?: string;
  tanNumber?: string;
  registrationNumber?: string;
  establishedDate?: Date;
  capacity?: number;
  facilities: string[];
  customFields: Map<string, any>;
  notes?: string;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
  fullName: string;
  childBranches: IBranch[];
}

const addressSchema = new Schema<IAddress>({
  line1: { type: String, required: true, trim: true, maxlength: 200 },
  line2: { type: String, trim: true, maxlength: 200 },
  city: { type: String, required: true, trim: true, maxlength: 100 },
  state: { type: String, required: true, trim: true, maxlength: 100 },
  country: { type: String, required: true, trim: true, maxlength: 100, default: 'India' },
  postalCode: { type: String, required: true, trim: true, maxlength: 20 },
  landmark: { type: String, trim: true, maxlength: 200 },
  coordinates: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
  },
}, { _id: false });

const contactInfoSchema = new Schema<IContactInfo>({
  phone: { type: String, required: true, trim: true, maxlength: 20 },
  alternatePhone: { type: String, trim: true, maxlength: 20 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 100 },
  alternateEmail: { type: String, lowercase: true, trim: true, maxlength: 100 },
  fax: { type: String, trim: true, maxlength: 20 },
  website: { type: String, trim: true, maxlength: 200 },
}, { _id: false });

const operatingHoursSchema = new Schema<IOperatingHours>({
  day: { type: String, required: true, enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] },
  isOpen: { type: Boolean, default: true },
  openTime: { type: String, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
  closeTime: { type: String, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
  breakStartTime: { type: String, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
  breakEndTime: { type: String, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
  timezone: { type: String, default: 'Asia/Kolkata' },
}, { _id: false });

const branchSchema = new Schema<IBranch>(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    displayName: { type: String, trim: true, maxlength: 150 },
    type: { type: String, enum: Object.values(BranchType), default: BranchType.BRANCH_OFFICE, required: true },
    status: { type: String, enum: Object.values(BranchStatus), default: BranchStatus.ACTIVE, required: true },
    address: { type: addressSchema, required: true },
    contact: { type: contactInfoSchema, required: true },
    operatingHours: { type: [operatingHoursSchema], default: [] },
    managerId: { type: Schema.Types.ObjectId, ref: 'Employee', sparse: true },
    parentBranchId: { type: Schema.Types.ObjectId, ref: 'Branch', sparse: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    currency: { type: String, default: 'INR', maxlength: 3 },
    language: { type: String, default: 'en', maxlength: 10 },
    isHeadOffice: { type: Boolean, default: false },
    gstNumber: { type: String, trim: true, uppercase: true, sparse: true, maxlength: 15 },
    panNumber: { type: String, trim: true, uppercase: true, sparse: true, maxlength: 10 },
    tanNumber: { type: String, trim: true, uppercase: true, sparse: true, maxlength: 10 },
    registrationNumber: { type: String, trim: true, maxlength: 50 },
    establishedDate: { type: Date },
    capacity: { type: Number, min: 1 },
    facilities: [{ type: String, trim: true }],
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

branchSchema.index({ code: 1 });
branchSchema.index({ name: 1 });
branchSchema.index({ type: 1, status: 1 });
branchSchema.index({ parentBranchId: 1 });
branchSchema.index({ managerId: 1 });
branchSchema.index({ 'address.city': 1, 'address.state': 1 });
branchSchema.index({ isHeadOffice: 1 });

branchSchema.virtual('fullName').get(function (this: IBranch) {
  return this.displayName || `${this.code} - ${this.name}`;
});

branchSchema.virtual('childBranches', {
  ref: 'Branch',
  localField: '_id',
  foreignField: 'parentBranchId',
});

branchSchema.virtual('manager', {
  ref: 'Employee',
  localField: 'managerId',
  foreignField: '_id',
  justOne: true,
});

branchSchema.virtual('departments', {
  ref: 'Department',
  localField: '_id',
  foreignField: 'branchId',
});

branchSchema.virtual('employees', {
  ref: 'Employee',
  localField: '_id',
  foreignField: 'employmentDetails.branchId',
});

branchSchema.pre('save', async function (next) {
  if (this.isHeadOffice) {
    const existingHeadOffice = await this.constructor.findOne({ isHeadOffice: true, _id: { $ne: this._id } });
    if (existingHeadOffice) {
      throw new Error('Only one head office is allowed');
    }
  }
  next();
});

branchSchema.plugin(softDeletePlugin);

export const Branch = mongoose.model<IBranch, SoftDeleteModel<IBranch>>('Branch', branchSchema);
export default Branch;