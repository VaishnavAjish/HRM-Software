import mongoose, { Document, Schema, Types } from 'mongoose';
import { softDeletePlugin, SoftDeleteModel } from '../plugins/softDelete';

export interface ICompensatoryOff extends Document {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  workDate: Date;
  expiryDate: Date;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'USED';
  isDeleted?: boolean;
}

const compOffSchema = new Schema<ICompensatoryOff>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  workDate: { type: Date, required: true },
  expiryDate: { type: Date, required: true },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'USED'], default: 'PENDING' },
}, { timestamps: true });

compOffSchema.plugin(softDeletePlugin);

export const CompensatoryOff = mongoose.model<ICompensatoryOff, SoftDeleteModel<ICompensatoryOff>>('CompensatoryOff', compOffSchema);
export default CompensatoryOff;
