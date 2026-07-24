import mongoose, { Document, Schema, FilterQuery, Query } from 'mongoose';

export interface ISoftDelete extends Document {
  deletedAt?: Date;
  isDeleted: boolean;
}

export interface SoftDeleteModel<T extends Document> extends mongoose.Model<T> {
  findDeleted(filter?: FilterQuery<T>): Query<T[], T>;
  findWithDeleted(filter?: FilterQuery<T>): Query<T[], T>;
  deleteMany(filter?: FilterQuery<T>): Promise<{ deletedCount: number }>;
  deleteOne(filter?: FilterQuery<T>): Promise<{ deletedCount: number }>;
  restore(filter?: FilterQuery<T>): Promise<{ modifiedCount: number }>;
}

export const softDeletePlugin = function (schema: Schema) {
  schema.add({
    deletedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
  });

  schema.index({ isDeleted: 1, deletedAt: 1 });

  schema.pre<Query<any, any>>(/^find/, function () {
    if (!this.getOptions().withDeleted) {
      this.where({ isDeleted: { $ne: true } });
    }
  });

  schema.pre<Query<any, any>>('count', function () {
    if (!this.getOptions().withDeleted) {
      this.where({ isDeleted: { $ne: true } });
    }
  });

  schema.pre<Query<any, any>>('countDocuments', function () {
    if (!this.getOptions().withDeleted) {
      this.where({ isDeleted: { $ne: true } });
    }
  });

  schema.pre<Query<any, any>>('findOneAndUpdate', function () {
    if (!this.getOptions().withDeleted) {
      this.where({ isDeleted: { $ne: true } });
    }
  });

  schema.pre<Query<any, any>>('findOneAndDelete', function () {
    this.setOptions({ withDeleted: true });
  });

  schema.pre<Query<any, any>>('findOneAndRemove', function () {
    this.setOptions({ withDeleted: true });
  });

  schema.methods.softDelete = async function () {
    this.isDeleted = true;
    this.deletedAt = new Date();
    return this.save();
  };

  schema.methods.restore = async function () {
    this.isDeleted = false;
    this.deletedAt = null;
    return this.save();
  };

  schema.statics.findDeleted = function (filter = {}) {
    return this.find({ ...filter, isDeleted: true });
  };

  schema.statics.findWithDeleted = function (filter = {}) {
    return this.find(filter).setOptions({ withDeleted: true });
  };

  schema.statics.softDeleteMany = async function (filter: FilterQuery<any>) {
    const result = await this.updateMany(filter, {
      isDeleted: true,
      deletedAt: new Date(),
    });
    return { deletedCount: result.modifiedCount };
  };

  schema.statics.softDeleteOne = async function (filter: FilterQuery<any>) {
    const result = await this.updateOne(filter, {
      isDeleted: true,
      deletedAt: new Date(),
    });
    return { deletedCount: result.modifiedCount };
  };

  schema.statics.restore = async function (filter: FilterQuery<any>) {
    const result = await this.updateMany(filter, {
      isDeleted: false,
      deletedAt: null,
    });
    return { modifiedCount: result.modifiedCount };
  };

  schema.statics.deleteMany = async function (filter: FilterQuery<any>) {
    const result = await this.deleteMany(filter).setOptions({ withDeleted: true });
    return { deletedCount: result.deletedCount };
  };

  schema.statics.deleteOne = async function (filter: FilterQuery<any>) {
    const result = await this.deleteOne(filter).setOptions({ withDeleted: true });
    return { deletedCount: result.deletedCount };
  };
};

export default softDeletePlugin;