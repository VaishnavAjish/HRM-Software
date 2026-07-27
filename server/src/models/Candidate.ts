import mongoose, { Document, Schema, Types } from 'mongoose';
import { SoftDeleteModel, softDeletePlugin } from '../plugins/softDelete';

export enum CandidateStatus {
  NEW = 'NEW',
  SCREENING = 'SCREENING',
  SHORTLISTED = 'SHORTLISTED',
  INTERVIEW_SCHEDULED = 'INTERVIEW_SCHEDULED',
  INTERVIEWED = 'INTERVIEWED',
  OFFER_EXTENDED = 'OFFER_EXTENDED',
  OFFER_ACCEPTED = 'OFFER_ACCEPTED',
  OFFER_DECLINED = 'OFFER_DECLINED',
  HIRED = 'HIRED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
  ON_HOLD = 'ON_HOLD',
  TALENT_POOL = 'TALENT_POOL',
}

export enum CandidateSource {
  JOB_PORTAL = 'JOB_PORTAL',
  COMPANY_WEBSITE = 'COMPANY_WEBSITE',
  REFERRAL = 'REFERRAL',
  LINKEDIN = 'LINKEDIN',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  RECRUITMENT_AGENCY = 'RECRUITMENT_AGENCY',
  CAMPUS_DRIVE = 'CAMPUS_DRIVE',
  WALK_IN = 'WALK_IN',
  EMPLOYEE_REFERRAL = 'EMPLOYEE_REFERRAL',
  INTERNAL = 'INTERNAL',
  OTHER = 'OTHER',
}

export interface IPersonalInfo {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  alternatePhone?: string;
  dateOfBirth?: Date;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  maritalStatus?: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED';
  nationality?: string;
  currentAddress: IAddress;
  permanentAddress?: IAddress;
  profilePhoto?: string;
  linkedInUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
}

export interface IAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface IEducation {
  _id: Types.ObjectId;
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
  document?: IDocumentRef;
}

export interface IExperience {
  _id: Types.ObjectId;
  companyName: string;
  designation: string;
  startDate: Date;
  endDate?: Date;
  isCurrent: boolean;
  location?: string;
  description?: string;
  salary?: number;
  noticePeriodDays?: number;
  document?: IDocumentRef;
}

export interface ISkill {
  _id: Types.ObjectId;
  name: string;
  proficiency: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  yearsOfExperience: number;
  certified: boolean;
  certificationDetails?: string;
  lastUsed?: Date;
}

export interface ILanguage {
  _id: Types.ObjectId;
  language: string;
  proficiency: 'BASIC' | 'CONVERSATIONAL' | 'FLUENT' | 'NATIVE';
  read: boolean;
  write: boolean;
  speak: boolean;
}

export interface ICertification {
  _id: Types.ObjectId;
  name: string;
  issuingOrganization: string;
  issueDate: Date;
  expiryDate?: Date;
  credentialId?: string;
  credentialUrl?: string;
  document?: IDocumentRef;
}

export interface IDocumentRef {
  name: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedAt: Date;
  verified: boolean;
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;
}

export interface IPreference {
  preferredLocations: string[];
  preferredDepartments: Types.ObjectId[];
  preferredDesignations: Types.ObjectId[];
  expectedSalaryMin?: number;
  expectedSalaryMax?: number;
  expectedSalaryCurrency: string;
  noticePeriodDays: number;
  willingToRelocate: boolean;
  willingToTravel: boolean;
  workModePreference: 'ONSITE' | 'REMOTE' | 'HYBRID';
  joinTimeframe: 'IMMEDIATE' | '15_DAYS' | '30_DAYS' | '60_DAYS' | '90_DAYS' | 'NEGOTIABLE';
}

export interface ICommunication {
  _id: Types.ObjectId;
  type: 'EMAIL' | 'PHONE' | 'SMS' | 'WHATSAPP' | 'IN_PERSON' | 'VIDEO_CALL' | 'NOTE';
  direction: 'INBOUND' | 'OUTBOUND';
  subject?: string;
  content: string;
  senderId: Types.ObjectId;
  senderName: string;
  recipientId?: Types.ObjectId;
  recipientName?: string;
  attachments?: IDocumentRef[];
  sentAt: Date;
  readAt?: Date;
  repliedAt?: Date;
  metadata?: Record<string, any>;
}

export interface IInterviewFeedback {
  _id: Types.ObjectId;
  interviewId: Types.ObjectId;
  interviewerId: Types.ObjectId;
  interviewerName: string;
  stage: string;
  rating: number;
  strengths?: string[];
  weaknesses?: string[];
  comments: string;
  recommendation: 'STRONG_HIRE' | 'HIRE' | 'NO_HIRE' | 'STRONG_NO_HIRE' | 'HOLD';
  submittedAt: Date;
}

export interface IOfferDetails {
  offeredSalary: number;
  salaryCurrency: string;
  salaryBreakdown?: Record<string, number>;
  joiningBonus?: number;
  stockOptions?: string;
  benefits?: string[];
  offerDate: Date;
  expiryDate: Date;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'NEGOTIATING';
  acceptedAt?: Date;
  declinedAt?: Date;
  declineReason?: string;
  offerLetterUrl?: string;
  negotiatedSalary?: number;
  negotiatedAt?: Date;
}

export interface ICandidate extends Document {
  _id: Types.ObjectId;
  candidateId: string;
  jobPostingId?: Types.ObjectId;
  applicationId?: Types.ObjectId;
  source: CandidateSource;
  sourceDetails?: string;
  referredBy?: Types.ObjectId;
  status: CandidateStatus;
  currentStage?: string;
  personalInfo: IPersonalInfo;
  education: IEducation[];
  experience: IExperience[];
  skills: ISkill[];
  languages: ILanguage[];
  certifications: ICertification[];
  preferences: IPreference;
  resume?: IDocumentRef;
  coverLetter?: IDocumentRef;
  otherDocuments: IDocumentRef[];
  communications: ICommunication[];
  interviewFeedbacks: IInterviewFeedback[];
  offerDetails?: IOfferDetails;
  tags: string[];
  notes?: string;
  rating?: number;
  isBlacklisted: boolean;
  blacklistReason?: string;
  consentGiven: boolean;
  consentDate?: Date;
  dataRetentionUntil?: Date;
  assignedRecruiterId?: Types.ObjectId;
  assignedHiringManagerId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
  fullName: string;
  totalExperienceYears: number;
  isActive: boolean;
  getLatestCommunication(): ICommunication | null;
  getAverageRating(): number;
  addCommunication(communication: Partial<ICommunication>): Promise<ICandidate>;
}

const addressSchema = new Schema<IAddress>({
  line1: { type: String, required: true, trim: true, maxlength: 200 },
  line2: { type: String, trim: true, maxlength: 200 },
  city: { type: String, required: true, trim: true, maxlength: 100 },
  state: { type: String, required: true, trim: true, maxlength: 100 },
  country: { type: String, required: true, trim: true, maxlength: 100, default: 'India' },
  postalCode: { type: String, required: true, trim: true, maxlength: 20 },
}, { _id: false });

const personalInfoSchema = new Schema<IPersonalInfo>({
  firstName: { type: String, required: true, trim: true, maxlength: 50 },
  middleName: { type: String, trim: true, maxlength: 50 },
  lastName: { type: String, required: true, trim: true, maxlength: 50 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 100 },
  phone: { type: String, required: true, trim: true, maxlength: 20 },
  alternatePhone: { type: String, trim: true, maxlength: 20 },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'] },
  maritalStatus: { type: String, enum: ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'] },
  nationality: { type: String, trim: true, maxlength: 50, default: 'Indian' },
  currentAddress: { type: addressSchema, required: true },
  permanentAddress: { type: addressSchema },
  profilePhoto: { type: String, trim: true },
  linkedInUrl: { type: String, trim: true },
  portfolioUrl: { type: String, trim: true },
  githubUrl: { type: String, trim: true },
}, { _id: false });

const documentRefSchema = new Schema<IDocumentRef>({
  name: { type: String, required: true, trim: true },
  fileUrl: { type: String, required: true, trim: true },
  fileType: { type: String, required: true, trim: true },
  fileSize: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now },
  verified: { type: Boolean, default: false },
  verifiedAt: { type: Date },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: true });

const educationSchema = new Schema<IEducation>({
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
  document: documentRefSchema,
}, { _id: true });

const experienceSchema = new Schema<IExperience>({
  companyName: { type: String, required: true, trim: true },
  designation: { type: String, required: true, trim: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  isCurrent: { type: Boolean, default: false },
  location: { type: String, trim: true },
  description: { type: String, trim: true },
  salary: { type: Number, min: 0 },
  noticePeriodDays: { type: Number, min: 0 },
  document: documentRefSchema,
}, { _id: true });

const skillSchema = new Schema<ISkill>({
  name: { type: String, required: true, trim: true },
  proficiency: {
    type: String,
    enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'],
    required: true,
  },
  yearsOfExperience: { type: Number, required: true, min: 0 },
  certified: { type: Boolean, default: false },
  certificationDetails: { type: String, trim: true },
  lastUsed: { type: Date },
}, { _id: true });

const languageSchema = new Schema<ILanguage>({
  language: { type: String, required: true, trim: true },
  proficiency: {
    type: String,
    enum: ['BASIC', 'CONVERSATIONAL', 'FLUENT', 'NATIVE'],
    required: true,
  },
  read: { type: Boolean, default: false },
  write: { type: Boolean, default: false },
  speak: { type: Boolean, default: false },
}, { _id: true });

const certificationSchema = new Schema<ICertification>({
  name: { type: String, required: true, trim: true },
  issuingOrganization: { type: String, required: true, trim: true },
  issueDate: { type: Date, required: true },
  expiryDate: { type: Date },
  credentialId: { type: String, trim: true },
  credentialUrl: { type: String, trim: true },
  document: documentRefSchema,
}, { _id: true });

const preferenceSchema = new Schema<IPreference>({
  preferredLocations: [{ type: String, trim: true }],
  preferredDepartments: [{ type: Schema.Types.ObjectId, ref: 'Department' }],
  preferredDesignations: [{ type: Schema.Types.ObjectId, ref: 'Designation' }],
  expectedSalaryMin: { type: Number, min: 0 },
  expectedSalaryMax: { type: Number, min: 0 },
  expectedSalaryCurrency: { type: String, default: 'INR', maxlength: 3 },
  noticePeriodDays: { type: Number, default: 30, min: 0 },
  willingToRelocate: { type: Boolean, default: false },
  willingToTravel: { type: Boolean, default: false },
  workModePreference: {
    type: String,
    enum: ['ONSITE', 'REMOTE', 'HYBRID'],
    default: 'ONSITE',
  },
  joinTimeframe: {
    type: String,
    enum: ['IMMEDIATE', '15_DAYS', '30_DAYS', '60_DAYS', '90_DAYS', 'NEGOTIABLE'],
    default: '30_DAYS',
  },
}, { _id: false });

const communicationSchema = new Schema<ICommunication>({
  type: {
    type: String,
    enum: ['EMAIL', 'PHONE', 'SMS', 'WHATSAPP', 'IN_PERSON', 'VIDEO_CALL', 'NOTE'],
    required: true,
  },
  direction: {
    type: String,
    enum: ['INBOUND', 'OUTBOUND'],
    required: true,
  },
  subject: { type: String, trim: true, maxlength: 200 },
  content: { type: String, required: true, trim: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true, trim: true },
  recipientId: { type: Schema.Types.ObjectId, ref: 'User' },
  recipientName: { type: String, trim: true },
  attachments: [documentRefSchema],
  sentAt: { type: Date, default: Date.now },
  readAt: { type: Date },
  repliedAt: { type: Date },
  metadata: { type: Schema.Types.Mixed },
}, { _id: true });

const interviewFeedbackSchema = new Schema<IInterviewFeedback>({
  interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
  interviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  interviewerName: { type: String, required: true, trim: true },
  stage: { type: String, required: true, trim: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  strengths: [{ type: String, trim: true }],
  weaknesses: [{ type: String, trim: true }],
  comments: { type: String, required: true, trim: true, maxlength: 2000 },
  recommendation: {
    type: String,
    enum: ['STRONG_HIRE', 'HIRE', 'NO_HIRE', 'STRONG_NO_HIRE', 'HOLD'],
    required: true,
  },
  submittedAt: { type: Date, default: Date.now },
}, { _id: true });

const offerDetailsSchema = new Schema<IOfferDetails>({
  offeredSalary: { type: Number, required: true, min: 0 },
  salaryCurrency: { type: String, default: 'INR', maxlength: 3 },
  salaryBreakdown: { type: Schema.Types.Mixed },
  joiningBonus: { type: Number, min: 0 },
  stockOptions: { type: String, trim: true },
  benefits: [{ type: String, trim: true }],
  offerDate: { type: Date, default: Date.now },
  expiryDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'NEGOTIATING'],
    default: 'DRAFT',
  },
  acceptedAt: { type: Date },
  declinedAt: { type: Date },
  declineReason: { type: String, trim: true, maxlength: 1000 },
  offerLetterUrl: { type: String, trim: true },
  negotiatedSalary: { type: Number, min: 0 },
  negotiatedAt: { type: Date },
}, { _id: false });

const candidateSchema = new Schema<ICandidate>({
  candidateId: { type: String, required: true, unique: true, trim: true, uppercase: true },
  jobPostingId: { type: Schema.Types.ObjectId, ref: 'JobPosting', sparse: true },
  applicationId: { type: Schema.Types.ObjectId, ref: 'Application', sparse: true },
  source: { type: String, enum: Object.values(CandidateSource), required: true },
  sourceDetails: { type: String, trim: true },
  referredBy: { type: Schema.Types.ObjectId, ref: 'Employee', sparse: true },
  status: { type: String, enum: Object.values(CandidateStatus), default: CandidateStatus.NEW, required: true, index: true },
  currentStage: { type: String, trim: true },
  personalInfo: { type: personalInfoSchema, required: true },
  education: { type: [educationSchema], default: [] },
  experience: { type: [experienceSchema], default: [] },
  skills: { type: [skillSchema], default: [] },
  languages: { type: [languageSchema], default: [] },
  certifications: { type: [certificationSchema], default: [] },
  preferences: { type: preferenceSchema, required: true },
  resume: documentRefSchema,
  coverLetter: documentRefSchema,
  otherDocuments: { type: [documentRefSchema], default: [] },
  communications: { type: [communicationSchema], default: [] },
  interviewFeedbacks: { type: [interviewFeedbackSchema], default: [] },
  offerDetails: offerDetailsSchema,
  tags: [{ type: String, trim: true }],
  notes: { type: String, trim: true, maxlength: 5000 },
  rating: { type: Number, min: 1, max: 5 },
  isBlacklisted: { type: Boolean, default: false },
  blacklistReason: { type: String, trim: true },
  consentGiven: { type: Boolean, default: false },
  consentDate: { type: Date },
  dataRetentionUntil: { type: Date },
  assignedRecruiterId: { type: Schema.Types.ObjectId, ref: 'Employee', sparse: true },
  assignedHiringManagerId: { type: Schema.Types.ObjectId, ref: 'Employee', sparse: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

candidateSchema.index({ candidateId: 1 });
candidateSchema.index({ 'personalInfo.email': 1 });
candidateSchema.index({ 'personalInfo.phone': 1 });
candidateSchema.index({ status: 1, assignedRecruiterId: 1 });
candidateSchema.index({ jobPostingId: 1, status: 1 });
candidateSchema.index({ assignedRecruiterId: 1, status: 1 });
candidateSchema.index({ 'personalInfo.firstName': 'text', 'personalInfo.lastName': 'text', 'personalInfo.email': 'text' });
candidateSchema.index({ tags: 1 });
candidateSchema.index({ createdAt: -1 });

candidateSchema.virtual('fullName').get(function (this: ICandidate) {
  const { firstName, middleName, lastName } = this.personalInfo;
  return [firstName, middleName, lastName].filter(Boolean).join(' ');
});

candidateSchema.virtual('totalExperienceYears').get(function (this: ICandidate) {
  let totalMonths = 0;
  for (const exp of this.experience) {
    const start = new Date(exp.startDate);
    const end = exp.isCurrent ? new Date() : new Date(exp.endDate || new Date());
    totalMonths += (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  }
  return Math.round(totalMonths / 12 * 10) / 10;
});

candidateSchema.virtual('isActive').get(function (this: ICandidate) {
  return !this.isBlacklisted && ![CandidateStatus.HIRED, CandidateStatus.REJECTED, CandidateStatus.WITHDRAWN].includes(this.status);
});

candidateSchema.virtual('jobPosting', {
  ref: 'JobPosting',
  localField: 'jobPostingId',
  foreignField: '_id',
  justOne: true,
});

candidateSchema.virtual('application', {
  ref: 'Application',
  localField: 'applicationId',
  foreignField: '_id',
  justOne: true,
});

candidateSchema.virtual('assignedRecruiter', {
  ref: 'Employee',
  localField: 'assignedRecruiterId',
  foreignField: '_id',
  justOne: true,
});

candidateSchema.virtual('assignedHiringManager', {
  ref: 'Employee',
  localField: 'assignedHiringManagerId',
  foreignField: '_id',
  justOne: true,
});

candidateSchema.methods.getLatestCommunication = function (): ICommunication | null {
  if (!this.communications.length) return null;
  return this.communications.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
};

candidateSchema.methods.getAverageRating = function (): number {
  if (!this.interviewFeedbacks.length) return 0;
  const sum = this.interviewFeedbacks.reduce((acc, f) => acc + f.rating, 0);
  return Math.round((sum / this.interviewFeedbacks.length) * 10) / 10;
};

candidateSchema.methods.addCommunication = async function (communication: Partial<ICommunication>) {
  this.communications.push(communication as ICommunication);
  return this.save();
};

candidateSchema.pre('save', function (next) {
  if (this.isNew && !this.candidateId) {
    const timestamp = Date.now().toString(36).toUpperCase();
    this.candidateId = `CAND-${timestamp}`;
  }
  next();
});

candidateSchema.plugin(softDeletePlugin);

export const Candidate = mongoose.model<ICandidate, SoftDeleteModel<ICandidate>>('Candidate', candidateSchema);
export default Candidate;