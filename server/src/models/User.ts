import mongoose, { Document, Schema, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import { SoftDeleteModel, softDeletePlugin } from '../plugins/softDelete';

export enum UserRole {
  ADMIN = 'ADMIN',
  HR_MANAGER = 'HR_MANAGER',
  DEPT_HEAD = 'DEPT_HEAD',
  EMPLOYEE = 'EMPLOYEE',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}

export interface IUserProfile {
  firstName: string;
  lastName: string;
  middleName?: string;
  displayName?: string;
  avatar?: string;
  phone?: string;
  alternatePhone?: string;
  dateOfBirth?: Date;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  maritalStatus?: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED';
  nationality?: string;
}

export interface IUserAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface IUserPreferences {
  theme?: 'LIGHT' | 'DARK' | 'SYSTEM';
  language?: string;
  timezone?: string;
  dateFormat?: string;
  timeFormat?: '12H' | '24H';
  notifications?: {
    email?: boolean;
    push?: boolean;
    sms?: boolean;
    inApp?: boolean;
  };
  dashboardLayout?: Record<string, unknown>;
}

export interface ISecuritySettings {
  passwordLastChanged?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  emailVerificationToken?: string;
  emailVerified?: boolean;
  emailVerifiedAt?: Date;
  phoneVerificationToken?: string;
  phoneVerified?: boolean;
  phoneVerifiedAt?: Date;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  twoFactorBackupCodes?: string[];
  lastLoginAt?: Date;
  lastLoginIp?: string;
  lastLoginDevice?: string;
  failedLoginAttempts?: number;
  lockedUntil?: Date;
  sessionTokens?: string[];
}

export interface IUser extends Document {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  email: string;
  username: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  profile: IUserProfile;
  address?: IUserAddress;
  preferences: IUserPreferences;
  security: ISecuritySettings;
  branchId?: Types.ObjectId;
  departmentId?: Types.ObjectId;
  reportingManagerId?: Types.ObjectId;
  permissions: string[];
  lastActiveAt?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  
  comparePassword(candidatePassword: string): Promise<boolean>;
  generatePasswordResetToken(): string;
  generateEmailVerificationToken(): string;
  generateTwoFactorSecret(): string;
  verifyTwoFactorToken(token: string): boolean;
  generateBackupCodes(): string[];
}

const userProfileSchema = new Schema<IUserProfile>({
  firstName: { type: String, required: true, trim: true, maxlength: 50 },
  lastName: { type: String, required: true, trim: true, maxlength: 50 },
  middleName: { type: String, trim: true, maxlength: 50 },
  displayName: { type: String, trim: true, maxlength: 100 },
  avatar: { type: String, trim: true },
  phone: { type: String, trim: true, maxlength: 20 },
  alternatePhone: { type: String, trim: true, maxlength: 20 },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'] },
  maritalStatus: { type: String, enum: ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'] },
  nationality: { type: String, trim: true, maxlength: 50, default: 'Indian' },
}, { _id: false });

const userAddressSchema = new Schema<IUserAddress>({
  line1: { type: String, trim: true, maxlength: 200 },
  line2: { type: String, trim: true, maxlength: 200 },
  city: { type: String, trim: true, maxlength: 100 },
  state: { type: String, trim: true, maxlength: 100 },
  postalCode: { type: String, trim: true, maxlength: 20 },
  country: { type: String, trim: true, maxlength: 100, default: 'India' },
}, { _id: false });

const userPreferencesSchema = new Schema<IUserPreferences>({
  theme: { type: String, enum: ['LIGHT', 'DARK', 'SYSTEM'], default: 'SYSTEM' },
  language: { type: String, trim: true, default: 'en' },
  timezone: { type: String, trim: true, default: 'Asia/Kolkata' },
  dateFormat: { type: String, trim: true, default: 'DD/MM/YYYY' },
  timeFormat: { type: String, enum: ['12H', '24H'], default: '24H' },
  notifications: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    inApp: { type: Boolean, default: true },
  },
  dashboardLayout: { type: Schema.Types.Mixed, default: {} },
}, { _id: false });

const securitySettingsSchema = new Schema<ISecuritySettings>({
  passwordLastChanged: { type: Date, default: Date.now },
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  emailVerificationToken: { type: String, select: false },
  emailVerified: { type: Boolean, default: false },
  emailVerifiedAt: { type: Date },
  phoneVerificationToken: { type: String, select: false },
  phoneVerified: { type: Boolean, default: false },
  phoneVerifiedAt: { type: Date },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String, select: false },
  twoFactorBackupCodes: { type: [String], select: false },
  lastLoginAt: { type: Date },
  lastLoginIp: { type: String, trim: true },
  lastLoginDevice: { type: String, trim: true },
  failedLoginAttempts: { type: Number, default: 0, min: 0 },
  lockedUntil: { type: Date, select: false },
  sessionTokens: { type: [String], select: false, default: [] },
}, { _id: false });

const userSchema = new Schema<IUser>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: false, unique: true, sparse: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 255 },
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 50 },
    password: { type: String, required: true, select: false, minlength: 8 },
    role: { type: String, enum: Object.values(UserRole), required: true, default: UserRole.EMPLOYEE },
    status: { type: String, enum: Object.values(UserStatus), required: true, default: UserStatus.PENDING_VERIFICATION },
    profile: { type: userProfileSchema, required: true },
    address: { type: userAddressSchema, default: () => ({}) },
    preferences: { type: userPreferencesSchema, default: () => ({}) },
    security: { type: securitySettingsSchema, default: () => ({}) },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    reportingManagerId: { type: Schema.Types.ObjectId, ref: 'User' },
    permissions: { type: [String], default: [] },
    lastActiveAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ branchId: 1, departmentId: 1 });
userSchema.index({ reportingManagerId: 1 });
userSchema.index({ status: 1, role: 1 });
userSchema.index({ email: 'text', username: 'text', 'profile.firstName': 'text', 'profile.lastName': 'text' });

userSchema.virtual('fullName').get(function (this: IUser) {
  const { firstName, middleName, lastName } = this.profile;
  return [firstName, middleName, lastName].filter(Boolean).join(' ');
});

userSchema.virtual('employee', {
  ref: 'Employee',
  localField: 'employeeId',
  foreignField: '_id',
  justOne: true,
});

userSchema.virtual('branch', {
  ref: 'Branch',
  localField: 'branchId',
  foreignField: '_id',
  justOne: true,
});

userSchema.virtual('department', {
  ref: 'Department',
  localField: 'departmentId',
  foreignField: '_id',
  justOne: true,
});

userSchema.virtual('reportingManager', {
  ref: 'User',
  localField: 'reportingManagerId',
  foreignField: '_id',
  justOne: true,
});

userSchema.virtual('directReports', {
  ref: 'User',
  localField: '_id',
  foreignField: 'reportingManagerId',
});

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  
  if (!this.profile.displayName) {
    this.profile.displayName = this.profile.firstName + ' ' + this.profile.lastName;
  }
  
  if (this.isModified('security.failedLoginAttempts') && this.security.failedLoginAttempts >= 5) {
    this.security.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
  }
  
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generatePasswordResetToken = function (): string {
  const token = crypto.randomBytes(32).toString('hex');
  this.security.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  this.security.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  return token;
};

userSchema.methods.generateEmailVerificationToken = function (): string {
  const token = crypto.randomBytes(32).toString('hex');
  this.security.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  return token;
};

userSchema.methods.generateTwoFactorSecret = function (): string {
  const secret = speakeasy.generateSecret({ length: 20 });
  this.security.twoFactorSecret = secret.base32;
  return secret.base32;
};

userSchema.methods.verifyTwoFactorToken = function (token: string): boolean {
  return speakeasy.totp.verify({
    secret: this.security.twoFactorSecret!,
    encoding: 'base32',
    token,
    window: 2,
  });
};

userSchema.methods.generateBackupCodes = function (): string[] {
  const codes = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
  this.security.twoFactorBackupCodes = codes.map(code => crypto.createHash('sha256').update(code).digest('hex'));
  return codes;
};

userSchema.plugin(softDeletePlugin);

export const User = mongoose.model<IUser, SoftDeleteModel<IUser>>('User', userSchema);
export default User;