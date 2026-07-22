import mongoose, { Document, Schema, Types } from 'mongoose';
import { softDeletePlugin, SoftDeleteModel } from '../plugins/softDelete';

export interface IDesignation extends Document {
  _id: Types.ObjectId;
  code: string;
  title: string;
  description?: string;
  level: number;
  departmentId?: Types.ObjectId;
  isActive: boolean;
  isDeleted?: boolean;
}

const designationSchema = new Schema<IDesignation>({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  level: { type: Number, default: 1 },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

designationSchema.plugin(softDeletePlugin);

export const Designation = mongoose.model<IDesignation, SoftDeleteModel<IDesignation>>('Designation', designationSchema);
export default Designation;
