import mongoose, { Document, Schema, Types } from 'mongoose';
import { softDeletePlugin, SoftDeleteModel } from '../plugins/softDelete';

export interface ILeaveBalance extends Document {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  year: number;
  accrued: number;
  used: number;
  available: number;
  carriedForward: number;
  encashed: number;
  isDeleted?: boolean;
}

const leaveBalanceSchema = new Schema<ILeaveBalance>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  leaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  year: { type: Number, required: true },
  accrued: { type: Number, default: 0 },
  used: { type: Number, default: 0 },
  available: { type: Number, default: 0 },
  carriedForward: { type: Number, default: 0 },
  encashed: { type: Number, default: 0 },
}, { timestamps: true });

leaveBalanceSchema.index({ employeeId: 1, leaveTypeId: 1, year: 1 }, { unique: true });

leaveBalanceSchema.plugin(softDeletePlugin);

export const LeaveBalance = mongoose.model<ILeaveBalance, SoftDeleteModel<ILeaveBalance>>('LeaveBalance', leaveBalanceSchema);
export default LeaveBalance;
