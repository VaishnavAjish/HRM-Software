import mongoose, { Document, Schema, Types, Query, FilterQuery, Model } from 'mongoose';
import softDeletePlugin, { SoftDeleteModel, ISoftDelete } from '../plugins/softDelete';

export enum EmploymentStatus {
  ACTIVE = 'ACTIVE',
  PROBATION = 'PROBATION',
  CONTRACT = 'CONTRACT',
  PART_TIME = 'PART_TIME',
  INTERN = 'INTERN',
  TERMINATED = 'TERMINATED',
  RESIGNED = 'RESIGNED',
  RETIRED = 'RETIRED',
  ON_LEAVE = 'ON_LEAVE',
  SUSPENDED = 'SUSPENDED',
}

export enum EmploymentType {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  CONTRACT = 'CONTRACT',
  TEMPORARY = 'TEMPORARY',
  INTERN = 'INTERN',
  FREELANCE = 'FREELANCE',
}

export enum PayFrequency {
  WEEKLY = 'WEEKLY',
  BI_WEEKLY = 'BI_WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUALLY = 'ANNUALLY',
}

export interface IPersonalInfo {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  personalEmail?: string;
  phone: string;
  alternatePhone?: string;
  dateOfBirth: Date;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  maritalStatus: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED';
  nationality: string;
  bloodGroup?: string;
  religion?: string;
  profilePhoto?: string;
  address: IAddress;
  emergencyContact: IEmergencyContact;
}

export interface IAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  isCurrent: boolean;
}

export interface IEmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  address?: string;
}

export interface IEmploymentDetails {
  employeeId: string;
  userId?: Types.ObjectId;
  branchId: Types.ObjectId;
  departmentId: Types.ObjectId;
  designationId: Types.ObjectId;
  reportingManagerId?: Types.ObjectId;
  employmentType: EmploymentType;
  employmentStatus: EmploymentStatus;
  joiningDate: Date;
  confirmationDate?: Date;
  probationEndDate?: Date;
  contractEndDate?: Date;
  resignationDate?: Date;
  lastWorkingDay?: Date;
  terminationDate?: Date;
  terminationReason?: string;
  noticePeriodDays: number;
  payFrequency: PayFrequency;
  currentSalary?: Types.ObjectId;
  workLocation: 'OFFICE' | 'REMOTE' | 'HYBRID';
  shiftId?: Types.ObjectId;
  employeeGrade?: string;
  employeeCategory?: string;
}

export interface IDocuments {
  idProof?: IDocument;
  addressProof?: IDocument;
  educationProofs?: IDocument[];
  experienceLetters?: IDocument[];
  offerLetter?: IDocument;
  appointmentLetter?: IDocument;
  relievingLetter?: IDocument;
  experienceCertificate?: IDocument;
  otherDocuments?: IDocument[];
}

export interface IDocument {
  name: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedAt: Date;
  verified: boolean;
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;
}

export interface IBankDetails {
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  branchName: string;
  accountType: 'SAVINGS' | 'CURRENT';
  isPrimary: boolean;
  upiId?: string;
}

export interface IStatutoryDetails {
  panNumber?: string;
  aadhaarNumber?: string;
  uanNumber?: string;
  esicNumber?: string;
  pfNumber?: string;
  passportNumber?: string;
  passportExpiry?: Date;
  drivingLicenseNumber?: string;
  drivingLicenseExpiry?: Date;
  voterId?: string;
}

export interface IFamilyDetails {
  spouse?: IFamilyMember;
  children?: IFamilyMember[];
  father?: IFamilyMember;
  mother?: IFamilyMember;
}

export interface IFamilyMember {
  name: string;
  dateOfBirth?: Date;
  relationship: string;
  occupation?: string;
  contactNumber?: string;
  isDependent: boolean;
}

export interface IEducation {
  degree: string;
  specialization?: string;
  institution: string;
  university?: string;
  startDate: Date;
  endDate: Date;
  percentage?: number;
  cgpa?: number;
  grade?: string;
  isHighestQualification: boolean;
  document?: IDocument;
}

export interface IExperience {
  companyName: string;
  designation: string;
  startDate: Date;
  endDate?: Date;
  isCurrent: boolean;
  location?: string;
  description?: string;
  salary?: number;
  document?: IDocument;
}

export interface ISkill {
  name: string;
  proficiency: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  yearsOfExperience: number;
  certified: boolean;
  certificationDetails?: string;
}

export interface ILanguage {
  language: string;
  proficiency: 'BASIC' | 'CONVERSATIONAL' | 'FLUENT' | 'NATIVE';
  read: boolean;
  write: boolean;
  speak: boolean;
}

export interface IEmployee extends Document, ISoftDelete {
  _id: Types.ObjectId;
  personalInfo: IPersonalInfo;
  employmentDetails: IEmploymentDetails;
  documents: IDocuments;
  bankDetails: IBankDetails[];
  statutoryDetails: IStatutoryDetails;
  familyDetails: IFamilyDetails;
  education: IEducation[];
  experience: IExperience[];
  skills: ISkill[];
  languages: ILanguage[];
  customFields: Map<string, any>;
  tags: string[];
  notes: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
  fullName: string;
  age: number;
  tenure: number;
  isCurrentEmployee: boolean;
  getReportingManager(): Promise<IEmployee | null>;
  getDirectReports(): Promise<IEmployee[]>;
  getDepartment(): Promise<any>;
  getBranch(): Promise<any>;
}

const addressSchema = new Schema<IAddress>(
  {
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'India' },
    postalCode: { type: String, required: true, trim: true },
    isCurrent: { type: Boolean, default: true },
  },
  { _id: false }
);

const emergencyContactSchema = new Schema<IEmergencyContact>(
  {
    name: { type: String, required: true, trim: true },
    relationship: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
  },
  { _id: false }
);

const personalInfoSchema = new Schema<IPersonalInfo>(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 50 },
    middleName: { type: String, trim: true, maxlength: 50 },
    lastName: { type: String, required: true, trim: true, maxlength: 50 },
    email: { type: String, required: true, lowercase: true, trim: true },
    personalEmail: { type: String, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    alternatePhone: { type: String, trim: true },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], required: true },
    maritalStatus: {
      type: String,
      enum: ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'],
      required: true,
    },
    nationality: { type: String, required: true, trim: true, default: 'Indian' },
    bloodGroup: { type: String, trim: true },
    religion: { type: String, trim: true },
    profilePhoto: { type: String },
    address: { type: addressSchema, required: true },
    emergencyContact: { type: emergencyContactSchema, required: true },
  },
  { _id: false }
);

const documentSchema = new Schema<IDocument>(
  {
    name: { type: String, required: true, trim: true },
    fileUrl: { type: String, required: true },
    fileType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const documentsSchema = new Schema<IDocuments>(
  {
    idProof: documentSchema,
    addressProof: documentSchema,
    educationProofs: [documentSchema],
    experienceLetters: [documentSchema],
    offerLetter: documentSchema,
    appointmentLetter: documentSchema,
    relievingLetter: documentSchema,
    experienceCertificate: documentSchema,
    otherDocuments: [documentSchema],
  },
  { _id: false }
);

const employmentDetailsSchema = new Schema<IEmploymentDetails>(
  {
    employeeId: { type: String, required: true, unique: true, uppercase: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', sparse: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    designationId: { type: Schema.Types.ObjectId, ref: 'Designation', required: true },
    reportingManagerId: { type: Schema.Types.ObjectId, ref: 'Employee', sparse: true },
    employmentType: {
      type: String,
      enum: Object.values(EmploymentType),
      default: EmploymentType.FULL_TIME,
      required: true,
    },
    employmentStatus: {
      type: String,
      enum: Object.values(EmploymentStatus),
      default: EmploymentStatus.PROBATION,
      required: true,
    },
    joiningDate: { type: Date, required: true },
    confirmationDate: { type: Date },
    probationEndDate: { type: Date },
    contractEndDate: { type: Date },
    resignationDate: { type: Date },
    lastWorkingDay: { type: Date },
    terminationDate: { type: Date },
    terminationReason: { type: String, trim: true },
    noticePeriodDays: { type: Number, default: 30, min: 0 },
    payFrequency: {
      type: String,
      enum: Object.values(PayFrequency),
      default: PayFrequency.MONTHLY,
      required: true,
    },
    currentSalary: { type: Schema.Types.ObjectId, ref: 'SalaryStructure' },
    workLocation: {
      type: String,
      enum: ['OFFICE', 'REMOTE', 'HYBRID'],
      default: 'OFFICE',
    },
    shiftId: { type: Schema.Types.ObjectId, ref: 'Shift' },
    employeeGrade: { type: String, trim: true },
    employeeCategory: { type: String, trim: true },
  },
  { _id: false }
);

const bankDetailsSchema = new Schema<IBankDetails>(
  {
    accountHolderName: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    ifscCode: { type: String, required: true, trim: true, uppercase: true },
    bankName: { type: String, required: true, trim: true },
    branchName: { type: String, required: true, trim: true },
    accountType: { type: String, enum: ['SAVINGS', 'CURRENT'], required: true },
    isPrimary: { type: Boolean, default: true },
    upiId: { type: String, trim: true, lowercase: true },
  },
  { _id: false }
);

const statutoryDetailsSchema = new Schema<IStatutoryDetails>(
  {
    panNumber: { type: String, trim: true, uppercase: true, sparse: true },
    aadhaarNumber: { type: String, trim: true, sparse: true },
    uanNumber: { type: String, trim: true, sparse: true },
    esicNumber: { type: String, trim: true, sparse: true },
    pfNumber: { type: String, trim: true, sparse: true },
    passportNumber: { type: String, trim: true, sparse: true },
    passportExpiry: { type: Date },
    drivingLicenseNumber: { type: String, trim: true, sparse: true },
    drivingLicenseExpiry: { type: Date },
    voterId: { type: String, trim: true, sparse: true },
  },
  { _id: false }
);

const familyMemberSchema = new Schema<IFamilyMember>(
  {
    name: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date },
    relationship: { type: String, required: true, trim: true },
    occupation: { type: String, trim: true },
    contactNumber: { type: String, trim: true },
    isDependent: { type: Boolean, default: false },
  },
  { _id: false }
);

const familyDetailsSchema = new Schema<IFamilyDetails>(
  {
    spouse: familyMemberSchema,
    children: [familyMemberSchema],
    father: familyMemberSchema,
    mother: familyMemberSchema,
  },
  { _id: false }
);

const educationSchema = new Schema<IEducation>(
  {
    degree: { type: String, required: true, trim: true },
    specialization: { type: String, trim: true },
    institution: { type: String, required: true, trim: true },
    university: { type: String, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    percentage: { type: Number, min: 0, max: 100 },
    cgpa: { type: Number, min: 0, max: 10 },
    grade: { type: String, trim: true },
    isHighestQualification: { type: Boolean, default: false },
    document: documentSchema,
  },
  { _id: false }
);

const experienceSchema = new Schema<IExperience>(
  {
    companyName: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    isCurrent: { type: Boolean, default: false },
    location: { type: String, trim: true },
    description: { type: String, trim: true },
    salary: { type: Number },
    document: documentSchema,
  },
  { _id: false }
);

const skillSchema = new Schema<ISkill>(
  {
    name: { type: String, required: true, trim: true },
    proficiency: {
      type: String,
      enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'],
      required: true,
    },
    yearsOfExperience: { type: Number, required: true, min: 0 },
    certified: { type: Boolean, default: false },
    certificationDetails: { type: String, trim: true },
  },
  { _id: false }
);

const languageSchema = new Schema<ILanguage>(
  {
    language: { type: String, required: true, trim: true },
    proficiency: {
      type: String,
      enum: ['BASIC', 'CONVERSATIONAL', 'FLUENT', 'NATIVE'],
      required: true,
    },
    read: { type: Boolean, default: false },
    write: { type: Boolean, default: false },
    speak: { type: Boolean, default: false },
  },
  { _id: false }
);

const employeeSchema = new Schema<IEmployee>(
  {
    personalInfo: { type: personalInfoSchema, required: true },
    employmentDetails: { type: employmentDetailsSchema, required: true },
    documents: { type: documentsSchema, default: () => ({}) },
    bankDetails: { type: [bankDetailsSchema], default: [] },
    statutoryDetails: { type: statutoryDetailsSchema, default: () => ({}) },
    familyDetails: { type: familyDetailsSchema, default: () => ({}) },
    education: { type: [educationSchema], default: [] },
    experience: { type: [experienceSchema], default: [] },
    skills: { type: [skillSchema], default: [] },
    languages: { type: [languageSchema], default: [] },
    customFields: { type: Map, of: Schema.Types.Mixed, default: {} },
    tags: [{ type: String, trim: true }],
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

employeeSchema.index({ 'personalInfo.email': 1 });
employeeSchema.index({ 'personalInfo.phone': 1 });
employeeSchema.index({ 'employmentDetails.employeeId': 1 });
employeeSchema.index({ 'employmentDetails.branchId': 1, 'employmentDetails.departmentId': 1 });
employeeSchema.index({ 'employmentDetails.employmentStatus': 1 });
employeeSchema.index({ 'employmentDetails.reportingManagerId': 1 });
employeeSchema.index({ 'employmentDetails.joiningDate': 1 });
employeeSchema.index({ tags: 1 });
employeeSchema.index({ 'personalInfo.firstName': 'text', 'personalInfo.lastName': 'text', 'employmentDetails.employeeId': 'text' });

employeeSchema.virtual('fullName').get(function (this: IEmployee) {
  const { firstName, middleName, lastName } = this.personalInfo;
  return [firstName, middleName, lastName].filter(Boolean).join(' ');
});

employeeSchema.virtual('age').get(function (this: IEmployee) {
  const today = new Date();
  const birthDate = new Date(this.personalInfo.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

employeeSchema.virtual('tenure').get(function (this: IEmployee) {
  const startDate = this.employmentDetails.joiningDate;
  const endDate = this.employmentDetails.lastWorkingDay || new Date();
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 365.25));
});

employeeSchema.virtual('isCurrentEmployee').get(function (this: IEmployee) {
  return (
    this.isActive &&
    [EmploymentStatus.ACTIVE, EmploymentStatus.PROBATION, EmploymentStatus.CONTRACT, EmploymentStatus.ON_LEAVE].includes(
      this.employmentDetails.employmentStatus
    )
  );
});

employeeSchema.methods.getReportingManager = async function (): Promise<IEmployee | null> {
  if (!this.employmentDetails.reportingManagerId) return null;
  return this.model('Employee').findById(this.employmentDetails.reportingManagerId);
};

employeeSchema.methods.getDirectReports = async function (): Promise<IEmployee[]> {
  return this.model('Employee').find({ 'employmentDetails.reportingManagerId': this._id });
};

employeeSchema.methods.getDepartment = async function () {
  return this.model('Department').findById(this.employmentDetails.departmentId);
};

employeeSchema.methods.getBranch = async function () {
  return this.model('Branch').findById(this.employmentDetails.branchId);
};

employeeSchema.pre('save', function (next) {
  if (this.isModified('education')) {
    const highest = this.education.reduce(
      (max, edu) => (edu.isHighestQualification ? edu : max),
      null
    );
    if (highest) {
      this.education.forEach((edu) => {
        edu.isHighestQualification = edu === highest;
      });
    }
  }
  next();
});

employeeSchema.plugin(softDeletePlugin);

export const Employee = mongoose.model<IEmployee, SoftDeleteModel<IEmployee>>('Employee', employeeSchema);
export default Employee;