import mongoose, { Document, Schema, Types } from 'mongoose';
import { SoftDeleteModel, softDeletePlugin } from '../plugins/softDelete';

export enum LeaveRequestStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  AUTO_APPROVED = 'AUTO_APPROVED',
  EXPIRED = 'EXPIRED',
}

export enum LeaveSession {
  FULL_DAY = 'FULL_DAY',
  FIRST_HALF = 'FIRST_HALF',
  SECOND_HALF = 'SECOND_HALF',
}

export interface ILeaveApproval {
  _id: Types.ObjectId;
  approverId: Types.ObjectId;
  level: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELEGATED';
  actionAt?: Date;
  comments?: string;
  delegatedTo?: Types.ObjectId;
}

export interface ILeaveAttachment {
  _id: Types.ObjectId;
  name: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedBy: Types.ObjectId;
}

export interface ILeaveRequest extends Document {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  leaveTypeCode: string;
  status: LeaveRequestStatus;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  session: LeaveSession;
  reason: string;
  contactDuringLeave?: {
    phone?: string;
    email?: string;
    address?: string;
  };
  handoverTo?: Types.ObjectId;
  handoverNotes?: string;
  attachments: ILeaveAttachment[];
  approvalWorkflow: ILeaveApproval[];
  currentApprovalLevel: number;
  appliedAt: Date;
  submittedAt?: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: Types.ObjectId;
  cancellationReason?: string;
  isEmergency: boolean;
  isHalfDay: boolean;
  compensatoryOffId?: Types.ObjectId;
  adjustedAgainstLeaveTypeId?: Types.ObjectId;
  notes?: string;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
  isPending: boolean;
  isActive: boolean;
  durationInHours: number;
}

const leaveAttachmentSchema = new Schema<ILeaveAttachment>({
  name: { type: String, required: true, trim: true },
  fileUrl: { type: String, required: true, trim: true },
  fileType: { type: String, required: true, trim: true },
  fileSize: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { _id: true });

const leaveApprovalSchema = new Schema<ILeaveApproval>({
  approverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  level: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'DELEGATED'], default: 'PENDING' },
  actionAt: { type: Date },
  comments: { type: String, trim: true, maxlength: 1000 },
  delegatedTo: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: true });

const leaveRequestSchema = new Schema<ILeaveRequest>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  leaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  leaveTypeCode: { type: String, required: true, trim: true, uppercase: true },
  status: { 
    type: String, 
    enum: Object.values(LeaveRequestStatus), 
    default: LeaveRequestStatus.DRAFT, 
    required: true,
    index: true
  },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  totalDays: { type: Number, required: true, min: 0.5 },
  session: { type: String, enum: Object.values(LeaveSession), default: LeaveSession.FULL_DAY, required: true },
  reason: { type: String, required: true, trim: true, maxlength: 2000 },
  contactDuringLeave: {
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
  },
  handoverTo: { type: Schema.Types.ObjectId, ref: 'Employee', sparse: true },
  handoverNotes: { type: String, trim: true, maxlength: 1000 },
  attachments: [leaveAttachmentSchema],
  approvalWorkflow: [leaveApprovalSchema],
  currentApprovalLevel: { type: Number, default: 1, min: 1 },
  appliedAt: { type: Date, default: Date.now },
  submittedAt: { type: Date },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  cancelledAt: { type: Date },
  cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  cancellationReason: { type: String, trim: true, maxlength: 500 },
  isEmergency: { type: Boolean, default: false },
  isHalfDay: { type: Boolean, default: false },
  compensatoryOffId: { type: Schema.Types.ObjectId, ref: 'CompensatoryOff', sparse: true },
  adjustedAgainstLeaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', sparse: true },
  notes: { type: String, trim: true, maxlength: 1000 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

leaveRequestSchema.index({ employeeId: 1, startDate: 1, endDate: 1 });
leaveRequestSchema.index({ leaveTypeId: 1, status: 1 });
leaveRequestSchema.index({ 'approvalWorkflow.approverId': 1, status: 1 });
leaveRequestSchema.index({ submittedAt: 1 });

leaveRequestSchema.virtual('isPending').get(function (this: ILeaveRequest) {
  return [LeaveRequestStatus.SUBMITTED, LeaveRequestStatus.PENDING_APPROVAL].includes(this.status);
});

leaveRequestSchema.virtual('isActive').get(function (this: ILeaveRequest) {
  return [LeaveRequestStatus.APPROVED, LeaveRequestStatus.AUTO_APPROVED].includes(this.status);
});

leaveRequestSchema.virtual('durationInHours').get(function (this: ILeaveRequest) {
  const hoursPerDay = 8;
  return this.totalDays * hoursPerDay;
});

leaveRequestSchema.pre('save', function (next) {
  if (this.startDate && this.endDate) {
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    let days = 0;
    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        days += this.session === LeaveSession.FULL_DAY ? 1 : 0.5;
      }
      current.setDate(current.getDate() + 1);
    }
    this.totalDays = days;
    this.isHalfDay = this.session !== LeaveSession.FULL_DAY;
  }
  next();
});

leaveRequestSchema.methods.canBeCancelled = function (): boolean {
  return [LeaveRequestStatus.DRAFT, LeaveRequestStatus.SUBMITTED, LeaveRequestStatus.PENDING_APPROVAL, LeaveRequestStatus.APPROVED].includes(this.status);
};

leaveRequestSchema.methods.canBeModified = function (): boolean {
  return [LeaveRequestStatus.DRAFT, LeaveRequestStatus.SUBMITTED].includes(this.status);
};

leaveRequestSchema.plugin(softDeletePlugin);

export const LeaveRequest = mongoose.model<ILeaveRequest, SoftDeleteModel<ILeaveRequest>>('LeaveRequest', leaveRequestSchema);
export default LeaveRequest;