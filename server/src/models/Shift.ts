import mongoose, { Document, Schema, Types } from 'mongoose';
import { softDeletePlugin, SoftDeleteModel } from '../plugins/softDelete';

export interface IShift extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  breakDurationMinutes: number;
  isNightShift: boolean;
  isActive: boolean;
  isDeleted?: boolean;
}

const shiftSchema = new Schema<IShift>({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  breakDurationMinutes: { type: Number, default: 60 },
  isNightShift: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

shiftSchema.plugin(softDeletePlugin);

export const Shift = mongoose.model<IShift, SoftDeleteModel<IShift>>('Shift', shiftSchema);
export default Shift;
