import mongoose from 'mongoose';

const designFeedbackSchema = new mongoose.Schema(
  {
    designId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    shop: {
      type: String,
      required: true,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 80,
      default: 'Guest',
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'tbl_design_feedback',
  },
);

designFeedbackSchema.index({ designId: 1, status: 1, createdAt: -1 });

const DesignFeedback =
  mongoose.models.tbl_DesignFeedback ||
  mongoose.model('tbl_DesignFeedback', designFeedbackSchema);

export default DesignFeedback;
