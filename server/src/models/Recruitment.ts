import mongoose, { Document, Schema, Types } from 'mongoose';
import { SoftDeleteModel, softDeletePlugin } from '../plugins/softDelete';

export enum JobStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  INTERNAL = 'INTERNAL',
  ON_HOLD = 'ON_HOLD',
  CLOSED = 'CLOSED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
}

export enum EmploymentType {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  CONTRACT = 'CONTRACT',
  TEMPORARY = 'TEMPORARY',
  INTERN = 'INTERN',
  FREELANCE = 'FREELANCE',
}

export enum ExperienceLevel {
  ENTRY = 'ENTRY',
  JUNIOR = 'JUNIOR',
  MID = 'MID',
  SENIOR = 'SENIOR',
  LEAD = 'LEAD',
  MANAGER = 'MANAGER',
  DIRECTOR = 'DIRECTOR',
  EXECUTIVE = 'EXECUTIVE',
}

export enum JobPostingSource {
  COMPANY_WEBSITE = 'COMPANY_WEBSITE',
  LINKEDIN = 'LINKEDIN',
  NAUKRI = 'NAUKRI',
  INDEED = 'INDEED',
  REFERRAL = 'REFERRAL',
  AGENCY = 'AGENCY',
  CAMPUS = 'CAMPUS',
  WALK_IN = 'WALK_IN',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  OTHER = 'OTHER',
}

export interface IJobRequirements {
  minExperience: number;
  maxExperience?: number;
  education: string[];
  skills: string[];
  certifications?: string[];
  languages?: string[];
  location?: string;
  travelRequired?: boolean;
  travelPercentage?: number;
}

export interface IJobBenefits {
  healthInsurance?: boolean;
  lifeInsurance?: boolean;
  dentalInsurance?: boolean;
  visionInsurance?: boolean;
  retirementPlan?: boolean;
  stockOptions?: boolean;
  bonus?: boolean;
  flexibleHours?: boolean;
  remoteWork?: boolean;
  paidTimeOff?: number;
  parentalLeave?: boolean;
  wellnessProgram?: boolean;
  learningBudget?: number;
  other?: string[];
}

export interface IApplicationStage {
  _id: Types.ObjectId;
  name: string;
  order: number;
  description?: string;
  isActive: boolean;
  slaDays?: number;
  evaluators: Types.ObjectId[];
  evaluationFormId?: Types.ObjectId;
}

export interface IJobPosting extends Document {
  _id: Types.ObjectId;
  jobId: string;
  title: string;
  slug: string;
  departmentId: Types.ObjectId;
  branchId?: Types.ObjectId;
  designationId?: Types.ObjectId;
  hiringManagerId: Types.ObjectId;
  recruiterId?: Types.ObjectId;
  status: JobStatus;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  numberOfPositions: number;
  filledPositions: number;
  description: string;
  responsibilities: string[];
  requirements: IJobRequirements;
  benefits: IJobBenefits;
  salaryRange: {
    min: number;
    max: number;
    currency: string;
    period: string;
    isNegotiable: boolean;
  };
  location: string;
  workMode: 'ONSITE' | 'REMOTE' | 'HYBRID';
  postingSources: JobPostingSource[];
  applicationDeadline?: Date;
  postedAt?: Date;
  closedAt?: Date;
  stages: IApplicationStage[];
  currentStage: number;
  tags: string[];
  isConfidential: boolean;
  externalUrl?: string;
  customFields: Map<string, any>;
  notes?: string;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
  isOpen: boolean;
  applicationCount: number;
}

const jobRequirementsSchema = new Schema<IJobRequirements>({
  minExperience: { type: Number, required: true, min: 0 },
  maxExperience: { type: Number, min: 0 },
  education: [{ type: String, trim: true }],
  skills: [{ type: String, trim: true }],
  certifications: [{ type: String, trim: true }],
  languages: [{ type: String, trim: true }],
  location: { type: String, trim: true },
  travelRequired: { type: Boolean, default: false },
  travelPercentage: { type: Number, min: 0, max: 100 },
}, { _id: false });

const jobBenefitsSchema = new Schema<IJobBenefits>({
  healthInsurance: { type: Boolean, default: true },
  lifeInsurance: { type: Boolean, default: false },
  dentalInsurance: { type: Boolean, default: false },
  visionInsurance: { type: Boolean, default: false },
  retirementPlan: { type: Boolean, default: true },
  stockOptions: { type: Boolean, default: false },
  bonus: { type: Boolean, default: true },
  flexibleHours: { type: Boolean, default: false },
  remoteWork: { type: Boolean, default: false },
  paidTimeOff: { type: Number, default: 20 },
  parentalLeave: { type: Boolean, default: true },
  wellnessProgram: { type: Boolean, default: false },
  learningBudget: { type: Number },
  other: [{ type: String, trim: true }],
}, { _id: false });

const applicationStageSchema = new Schema<IApplicationStage>({
  name: { type: String, required: true, trim: true },
  order: { type: Number, required: true, min: 1 },
  description: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  slaDays: { type: Number, min: 1 },
  evaluators: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  evaluationFormId: { type: Schema.Types.ObjectId, ref: 'EvaluationForm' },
}, { _id: true });

const jobPostingSchema = new Schema<IJobPosting>({
  jobId: { type: String, required: true, unique: true, trim: true, uppercase: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  designationId: { type: Schema.Types.ObjectId, ref: 'Designation' },
  hiringManagerId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  recruiterId: { type: Schema.Types.ObjectId, ref: 'Employee' },
  status: { type: String, enum: Object.values(JobStatus), default: JobStatus.DRAFT, required: true },
  employmentType: { type: String, enum: Object.values(EmploymentType), required: true },
  experienceLevel: { type: String, enum: Object.values(ExperienceLevel), required: true },
  numberOfPositions: { type: Number, required: true, min: 1, default: 1 },
  filledPositions: { type: Number, default: 0, min: 0 },
  description: { type: String, required: true, trim: true },
  responsibilities: [{ type: String, trim: true }],
  requirements: { type: jobRequirementsSchema, required: true },
  benefits: { type: jobBenefitsSchema, default: () => ({}) },
  salaryRange: {
    min: { type: Number, required: true, min: 0 },
    max: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', maxlength: 3 },
    period: { type: String, enum: ['ANNUAL', 'MONTHLY', 'HOURLY'], default: 'ANNUAL' },
    isNegotiable: { type: Boolean, default: true },
  },
  location: { type: String, required: true, trim: true },
  workMode: { type: String, enum: ['ONSITE', 'REMOTE', 'HYBRID'], default: 'ONSITE' },
  postingSources: [{ type: String, enum: Object.values(JobPostingSource) }],
  applicationDeadline: { type: Date },
  postedAt: { type: Date },
  closedAt: { type: Date },
  stages: [applicationStageSchema],
  currentStage: { type: Number, default: 0, min: 0 },
  tags: [{ type: String, trim: true }],
  isConfidential: { type: Boolean, default: false },
  externalUrl: { type: String, trim: true },
  customFields: { type: Map, of: Schema.Types.Mixed, default: {} },
  notes: { type: String, trim: true, maxlength: 2000 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

jobPostingSchema.index({ jobId: 1 });
jobPostingSchema.index({ slug: 1 });
jobPostingSchema.index({ status: 1, postedAt: -1 });
jobPostingSchema.index({ departmentId: 1, branchId: 1 });
jobPostingSchema.index({ hiringManagerId: 1 });
jobPostingSchema.index({ title: 'text', description: 'text' });
jobPostingSchema.index({ applicationDeadline: 1, status: 1 });

jobPostingSchema.virtual('isOpen').get(function (this: IJobPosting) {
  return this.status === JobStatus.PUBLISHED && 
         this.filledPositions < this.numberOfPositions &&
         (!this.applicationDeadline || this.applicationDeadline > new Date());
});

jobPostingSchema.virtual('applicationCount').get(async function (this: IJobPosting) {
  const Application = this.model('Application');
  return Application.countDocuments({ jobPostingId: this._id });
});

jobPostingSchema.virtual('applications', {
  ref: 'Application',
  localField: '_id',
  foreignField: 'jobPostingId',
});

jobPostingSchema.pre('save', function (next) {
  if (this.isNew && !this.jobId) {
    const dept = this.departmentId.toString().slice(0, 3).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();
    this.jobId = `JOB-${dept}-${timestamp}`;
  }
  if (this.isModified('title') && !this.slug) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  next();
});

jobPostingSchema.plugin(softDeletePlugin);

export const JobPosting = mongoose.model<IJobPosting, SoftDeleteModel<IJobPosting>>('JobPosting', jobPostingSchema);
export default JobPosting;