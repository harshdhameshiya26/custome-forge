/* eslint-env node */

import mongoose from 'mongoose';
import crypto from 'node:crypto';

/**
  * Valid Print File status values matching the Prisma PrintFileStatus enum.
  */
export const PRINT_FILE_STATUSES = Object.freeze([
  'PENDING',
  'COMPLETED',
  'FAILED',
]);

/**
  * Supported production print formats.
  */
export const PRINT_FILE_FORMATS = Object.freeze([
  'HIGH_RES_PNG',
  'PDF',
  'TIFF',
  'SVG',
]);

/**
  * Mongoose schema for PrintFile.
  * Mirrors the Prisma PrintFile model for MongoDB data layer compatibility.
  */
const printFileSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      default: () => crypto.randomUUID(),
      unique: true,
      index: true,
    },
    orderId: {
      type: String,
      required: [true, 'orderId is required'],
      trim: true,
      index: true,
    },
    designId: {
      type: String,
      required: [true, 'designId is required'],
      trim: true,
      index: true,
    },
    fileUrl: {
      type: String,
      required: [true, 'fileUrl is required'],
      trim: true,
    },
    format: {
      type: String,
      enum: PRINT_FILE_FORMATS,
      default: 'HIGH_RES_PNG',
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: PRINT_FILE_STATUSES,
      default: 'PENDING',
      index: true,
    },
    widthMm: {
      type: Number,
      min: 1,
      default: 280,
    },
    heightMm: {
      type: Number,
      min: 1,
      default: 350,
    },
    dpi: {
      type: Number,
      default: 300,
      min: 72,
      max: 2400,
    },
    bleedMm: {
      type: Number,
      default: 0,
      min: 0,
    },
    colorProfile: {
      type: String,
      default: 'sRGB',
      trim: true,
    },
    fileSizeBytes: {
      type: Number,
      default: 0,
    },
    fileName: {
      type: String,
      trim: true,
    },
    secureDownloadToken: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    secureDownloadUrl: {
      type: String,
      trim: true,
    },
    errorMessage: {
      type: String,
      default: null,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'tbl_print_files',
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

const PrintFile =
  mongoose.models.PrintFile || mongoose.model('PrintFile', printFileSchema);

export default PrintFile;
