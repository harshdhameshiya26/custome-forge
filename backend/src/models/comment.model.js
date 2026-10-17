/* eslint-env node */

import mongoose from 'mongoose';
import crypto from 'node:crypto';

/**
 * Valid author roles for threaded design comments.
 */
export const AUTHOR_ROLES = Object.freeze(['CUSTOMER', 'MERCHANT']);

/**
 * Comment Schema (Feature 7 — Customer-Merchant Design Comments)
 * Scoped directly to a specific proof / revision, supporting threaded replies.
 */
const commentSchema = new mongoose.Schema(
  {
    commentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomUUID(),
    },
    proofId: {
      type: String,
      required: [true, 'proofId is required'],
      trim: true,
      index: true,
    },
    parentCommentId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    authorId: {
      type: String,
      required: [true, 'authorId is required'],
      trim: true,
      index: true,
    },
    authorName: {
      type: String,
      trim: true,
      default: null,
    },
    authorRole: {
      type: String,
      enum: AUTHOR_ROLES,
      required: [true, 'authorRole is required'],
      default: 'CUSTOMER',
    },
    content: {
      type: String,
      required: [true, 'content is required'],
      trim: true,
      minlength: [1, 'Comment content cannot be empty'],
      maxlength: [5000, 'Comment content cannot exceed 5000 characters'],
    },
    attachments: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'tbl_ProofComments',
  },
);

// Compound indexes for optimal threaded queries and sorting
commentSchema.index({ proofId: 1, createdAt: 1 });
commentSchema.index({ proofId: 1, parentCommentId: 1 });

export const Comment =
  mongoose.models.Comment || mongoose.model('Comment', commentSchema);

export default Comment;
