import mongoose, { Document, Schema, Types } from 'mongoose';
import { SoftDeleteModel, softDeletePlugin } from '../plugins/softDelete';

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  HALF_DAY = 'HALF_DAY',
  ON_LEAVE = 'ON_LEAVE',
  HOLIDAY = 'HOLIDAY',
  WEEKLY_OFF = 'WEEKLY_OFF',
  WORK_FROM_HOME = 'WORK_FROM_HOME',
  ON_DUTY = 'ON_DUTY',
  COMP_OFF = 'COMP_OFF',
}

export enum PunchType {
  CHECK_IN = 'CHECK_IN',
  CHECK_OUT = 'CHECK_OUT',
  BREAK_START = 'BREAK_START',
  BREAK_END = 'BREAK_END',
}

export enum AttendanceSource {
  BIOMETRIC = 'BIOMETRIC',
  FACE_RECOGNITION = 'FACE_RECOGNITION',
  MOBILE_APP = 'MOBILE_APP',
  WEB_PORTAL = 'WEB_PORTAL',
  MANUAL = 'MANUAL',
  RFID = 'RFID',
  GEOFENCE = 'GEOFENCE',
}

export interface IPunchRecord {
  _id: Types.ObjectId;
  punchType: PunchType;
  timestamp: Date;
  source: AttendanceSource;
  deviceId?: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
    accuracy?: number;
  };
  ipAddress?: string;
  deviceInfo?: string;
  isManualEntry: boolean;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  note?: string;
}

export interface IBreakRecord {
  _id: Types.ObjectId;
  breakType: 'LUNCH' | 'SHORT' | 'CUSTOM';
  startTime: Date;
  endTime?: Date;
  durationMinutes?: number;
  isPaid: boolean;
  approvedBy?: Types.ObjectId;
}

export interface IOvertimeRecord {
  _id: Types.ObjectId;
  date: Date;
  hours: number;
  rate: number;
  amount: number;
  reason: string;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface IAttendance extends Document, { deletedAt?: Date; isDeleted: boolean } {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  date: Date;
  shiftId?: Types.ObjectId;
  status: AttendanceStatus;
  scheduledInTime?: Date;
  scheduledOutTime?: Date;
  punches: IPunchRecord[];
  breaks: IBreakRecord[];
  overtime: IOvertimeRecord[];
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  workLocation: 'OFFICE' | 'REMOTE' | 'HYBRID' | 'FIELD';
  ipAddress?: string;
  deviceId?: string;
  geoLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  isManualEntry: boolean;
  manualEntryBy?: Types.ObjectId;
  manualEntryReason?: string;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  rejectionReason?: string;
  leaveRequestId?: Types.ObjectId;
  compensatoryOffId?: Types.ObjectId;
  notes?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
  isLate: boolean;
  isEarlyDeparture: boolean;
  hasOvertime: boolean;
  effectiveWorkHours: number;
}

const punchRecordSchema = new Schema<IPunchRecord>({
  punchType: { type: String, enum: Object.values(PunchType), required: true },
  timestamp: { type: Date, required: true },
  source: { type: String, enum: Object.values(AttendanceSource), required: true },
  deviceId: { type: String, trim: true },
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String, trim: true },
    accuracy: { type: Number },
  },
  ipAddress: { type: String, trim: true },
  deviceInfo: { type: String, trim: true },
  isManualEntry: { type: Boolean, default: false },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  note: { type: String, trim: true, maxlength: 500 },
}, { _id: true });

const breakRecordSchema = new Schema<IBreakRecord>({
  breakType: { type: String, enum: ['LUNCH', 'SHORT', 'CUSTOM'], required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  durationMinutes: { type: Number, min: 0 },
  isPaid: { type: Boolean, default: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: true });

const overtimeRecordSchema = new Schema<IOvertimeRecord>({
  date: { type: Date, required: true },
  hours: { type: Number, required: true, min: 0 },
  rate: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
}, { _id: true });

const attendanceSchema = new Schema<IAttendance>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  date: { type: Date, required: true, index: true },
  shiftId: { type: Schema.Types.ObjectId, ref: 'Shift', sparse: true },
  status: { type: String, enum: Object.values(AttendanceStatus), required: true, default: AttendanceStatus.ABSENT },
  scheduledInTime: { type: Date },
  scheduledOutTime: { type: Date },
  punches: [punchRecordSchema],
  breaks: [breakRecordSchema],
  overtime: [overtimeRecordSchema],
  totalWorkMinutes: { type: Number, default: 0, min: 0 },
  totalBreakMinutes: { type: Number, default: 0, min: 0 },
  overtimeMinutes: { type: Number, default: 0, min: 0 },
  lateMinutes: { type: Number, default: 0, min: 0 },
  earlyDepartureMinutes: { type: Number, default: 0, min: 0 },
  workLocation: { type: String, enum: ['OFFICE', 'REMOTE', 'HYBRID', 'FIELD'], default: 'OFFICE' },
  ipAddress: { type: String, trim: true },
  deviceId: { type: String, trim: true },
  geoLocation: {
    latitude: { type: Number },
    longitude: { type: Number },
    address: { type: String, trim: true },
  },
  isManualEntry: { type: Boolean, default: false },
  manualEntryBy: { type: Schema.Types.ObjectId, ref: 'User' },
  manualEntryReason: { type: String, trim: true, maxlength: 500 },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  rejectionReason: { type: String, trim: true, maxlength: 500 },
  leaveRequestId: { type: Schema.Types.ObjectId, ref: 'LeaveRequest', sparse: true },
  compensatoryOffId: { type: Schema.Types.ObjectId, ref: 'CompensatoryOff', sparse: true },
  notes: { type: String, trim: true, maxlength: 1000 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ shiftId: 1, date: 1 });
attendanceSchema.index({ 'punches.timestamp': 1 });

attendanceSchema.virtual('isLate').get(function (this: IAttendance) {
  return this.lateMinutes > 0;
});

attendanceSchema.virtual('isEarlyDeparture').get(function (this: IAttendance) {
  return this.earlyDepartureMinutes > 0;
});

attendanceSchema.virtual('hasOvertime').get(function (this: IAttendance) {
  return this.overtimeMinutes > 0;
});

attendanceSchema.virtual('effectiveWorkHours').get(function (this: IAttendance) {
  return Math.max(0, (this.totalWorkMinutes - this.totalBreakMinutes) / 60);
});

attendanceSchema.methods.calculateWorkHours = function (): void {
  const checkIn = this.punches.find((p: IPunchRecord) => p.punchType === PunchType.CHECK_IN);
  const checkOut = this.punches.find((p: IPunchRecord) => p.punchType === PunchType.CHECK_OUT);
  
  if (checkIn && checkOut) {
    const totalMinutes = Math.round((checkOut.timestamp.getTime() - checkIn.timestamp.getTime()) / 60000);
    this.totalWorkMinutes = totalMinutes;
    
    const totalBreakMinutes = this.breaks.reduce((sum: number, b: IBreakRecord) => 
      sum + (b.durationMinutes || 0), 0
    );
    this.totalBreakMinutes = totalBreakMinutes;
    
    const effectiveMinutes = totalMinutes - totalBreakMinutes;
    const scheduledMinutes = this.scheduledInTime && this.scheduledOutTime
      ? Math.round((this.scheduledOutTime.getTime() - this.scheduledInTime.getTime()) / 60000)
      : 480;
    
    if (effectiveMinutes > scheduledMinutes) {
      this.overtimeMinutes = effectiveMinutes - scheduledMinutes;
    }
    
    if (this.scheduledInTime && checkIn.timestamp > this.scheduledInTime) {
      this.lateMinutes = Math.round((checkIn.timestamp.getTime() - this.scheduledInTime.getTime()) / 60000);
    }
    
    if (this.scheduledOutTime && checkOut.timestamp < this.scheduledOutTime) {
      this.earlyDepartureMinutes = Math.round((this.scheduledOutTime.getTime() - checkOut.timestamp.getTime()) / 60000);
    }
  }
};

attendanceSchema.plugin(softDeletePlugin);

export const Attendance = mongoose.model<IAttendance, SoftDeleteModel<IAttendance>>('Attendance', attendanceSchema);
export default Attendance;