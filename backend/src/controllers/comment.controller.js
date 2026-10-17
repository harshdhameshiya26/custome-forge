/* eslint-env node */

import crypto from 'node:crypto';
import prisma from '../config/prisma.js';
import Comment, { AUTHOR_ROLES } from '../models/comment.model.js';
import Proof from '../models/proof.model.js';
import { logError, logSuccess, logWarn } from '../utils/logger.js';

/**
 * Custom HTTP Error Helper.
 */
const makeHttpError = (statusCode, message, details = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
};

/**
 * Helper to check if a proof exists by proofId or MongoDB ObjectId.
 */
const findProofByIdentifier = async (proofId) => {
  const cleanId = String(proofId).trim();
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(cleanId);

  // 1. Try Prisma first
  if (prisma?.proof) {
    try {
      const proof = await prisma.proof.findFirst({
        where: {
          OR: [
            { proofId: cleanId },
            ...(isObjectId ? [{ id: cleanId }] : []),
          ],
        },
      });
      if (proof) return { proof, source: 'PRISMA' };
    } catch (err) {
      logWarn(`⚠️ Prisma findProof query warning: ${err.message}`);
    }
  }

  // 2. Mongoose fallback
  try {
    const proof = await Proof.findOne({
      $or: [
        { proofId: cleanId },
        ...(isObjectId ? [{ _id: cleanId }] : []),
      ],
    }).lean();

    if (proof) return { proof, source: 'MONGOOSE' };
  } catch (err) {
    logError(`❌ Mongoose findProof query error: ${err.message}`);
  }

  return null;
};

/**
 * Helper to build a nested threaded tree from a flat array of comments.
 */
const buildThreadTree = (flatComments) => {
  const commentMap = new Map();
  const roots = [];

  // Initialize every comment entry with an empty replies array
  flatComments.forEach((c) => {
    const item = {
      id: c.id || c._id,
      commentId: c.commentId,
      proofId: c.proofId,
      parentCommentId: c.parentCommentId || null,
      authorId: c.authorId,
      authorName: c.authorName || null,
      authorRole: c.authorRole,
      content: c.content,
      attachments: c.attachments || [],
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      replies: [],
    };
    commentMap.set(String(c.commentId), item);
    if (c.id) commentMap.set(String(c.id), item);
    if (c._id) commentMap.set(String(c._id), item);
  });

  // Link children to their respective parents
  flatComments.forEach((c) => {
    const currentItem = commentMap.get(String(c.commentId));
    if (c.parentCommentId && commentMap.has(String(c.parentCommentId))) {
      const parent = commentMap.get(String(c.parentCommentId));
      parent.replies.push(currentItem);
    } else {
      roots.push(currentItem);
    }
  });

  return roots;
};

// =============================================================================
// CONTROLLER HANDLERS
// =============================================================================

/**
 * POST /api/comments
 * Endpoint to post a new comment linked to a specific proof ID or revision.
 * Supports threaded replies via parentCommentId.
 */
export const createComment = async (req, res, next) => {
  try {
    const {
      proofId,
      authorId,
      authorRole,
      content,
      parentCommentId,
      authorName,
      attachments,
    } = req.body;

    // 1. Validate proofId
    if (!proofId || typeof proofId !== 'string' || !proofId.trim()) {
      throw makeHttpError(400, 'Validation Error: proofId is required.');
    }
    const cleanProofId = proofId.trim();

    // 2. Validate authorId
    if (!authorId || typeof authorId !== 'string' || !authorId.trim()) {
      throw makeHttpError(400, 'Validation Error: authorId is required.');
    }
    const cleanAuthorId = authorId.trim();

    // 3. Validate authorRole
    if (!authorRole || typeof authorRole !== 'string') {
      throw makeHttpError(
        400,
        'Validation Error: authorRole is required. Allowed values are "CUSTOMER" or "MERCHANT".',
      );
    }
    const normalizedRole = authorRole.trim().toUpperCase();
    if (!AUTHOR_ROLES.includes(normalizedRole)) {
      throw makeHttpError(
        400,
        `Validation Error: Invalid authorRole "${authorRole}". Allowed values are strictly "CUSTOMER" or "MERCHANT".`,
      );
    }

    // 4. Validate content
    if (!content || typeof content !== 'string' || !content.trim()) {
      throw makeHttpError(
        400,
        'Validation Error: content is required and cannot be empty.',
      );
    }
    const cleanContent = content.trim();
    if (cleanContent.length > 5000) {
      throw makeHttpError(
        400,
        'Validation Error: content cannot exceed 5000 characters.',
      );
    }

    // 5. Verify target Proof exists
    const proofLookup = await findProofByIdentifier(cleanProofId);
    if (!proofLookup) {
      throw makeHttpError(
        404,
        `Proof not found with identifier "${cleanProofId}". Comments must be linked to an existing proof or revision.`,
      );
    }

    const targetProofId = proofLookup.proof.proofId || cleanProofId;

    // 6. If parentCommentId provided, verify parent exists under the same proof
    let cleanParentId = null;
    if (parentCommentId && typeof parentCommentId === 'string' && parentCommentId.trim()) {
      cleanParentId = parentCommentId.trim();
      let parentComment = null;

      if (prisma?.comment) {
        try {
          parentComment = await prisma.comment.findFirst({
            where: {
              proofId: targetProofId,
              OR: [
                { commentId: cleanParentId },
                ...(/^[0-9a-fA-F]{24}$/.test(cleanParentId) ? [{ id: cleanParentId }] : []),
              ],
            },
          });
        } catch (err) {
          logWarn(`⚠️ Prisma parent comment check warning: ${err.message}`);
        }
      }

      if (!parentComment) {
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(cleanParentId);
        parentComment = await Comment.findOne({
          proofId: targetProofId,
          $or: [
            { commentId: cleanParentId },
            ...(isObjectId ? [{ _id: cleanParentId }] : []),
          ],
        }).lean();
      }

      if (!parentComment) {
        throw makeHttpError(
          404,
          `Parent comment "${cleanParentId}" not found for proof "${cleanProofId}". Threaded replies must point to a valid comment under the same proof.`,
        );
      }
    }

    // 7. Prepare comment payload
    const commentId = crypto.randomUUID();
    const commentPayload = {
      commentId,
      proofId: targetProofId,
      parentCommentId: cleanParentId,
      authorId: cleanAuthorId,
      authorName: authorName && typeof authorName === 'string' ? authorName.trim() : null,
      authorRole: normalizedRole,
      content: cleanContent,
      attachments: Array.isArray(attachments) ? attachments.map((a) => String(a).trim()) : [],
    };

    let createdRecord = null;

    // 8. Save via Prisma (Primary)
    if (prisma?.comment) {
      try {
        createdRecord = await prisma.comment.create({
          data: commentPayload,
        });
        logSuccess(`✅ Comment created via Prisma: ${commentId} on proof ${targetProofId}`);
      } catch (prismaErr) {
        logWarn(`⚠️ Prisma comment creation failed (${prismaErr.message}). Using Mongoose fallback.`);
      }
    }

    // 9. Save via Mongoose (Fallback)
    if (!createdRecord) {
      const mongooseComment = new Comment(commentPayload);
      await mongooseComment.save();
      createdRecord = mongooseComment.toObject();
      logSuccess(`✅ Comment created via Mongoose: ${commentId} on proof ${targetProofId}`);
    }

    // 10. Also synchronize comment into Proof document's audit comments array
    try {
      const proofCommentItem = {
        id: commentId,
        author: authorName || (normalizedRole === 'MERCHANT' ? 'Merchant' : 'Customer'),
        role: normalizedRole,
        message: cleanContent,
        createdAt: createdRecord.createdAt || new Date(),
      };

      if (prisma?.proof) {
        await prisma.proof.updateMany({
          where: { proofId: targetProofId },
          data: {
            comments: { push: proofCommentItem },
          },
        });
      } else {
        await Proof.updateOne(
          { proofId: targetProofId },
          { $push: { comments: proofCommentItem } },
        );
      }
    } catch (syncErr) {
      logWarn(`⚠️ Proof comment synchronization notice: ${syncErr.message}`);
    }

    // 11. Clean JSON Response
    return res.status(201).json({
      success: true,
      message: 'Comment posted successfully.',
      data: {
        id: createdRecord.id || createdRecord._id,
        commentId: createdRecord.commentId,
        proofId: createdRecord.proofId,
        parentCommentId: createdRecord.parentCommentId,
        authorId: createdRecord.authorId,
        authorName: createdRecord.authorName,
        authorRole: createdRecord.authorRole,
        content: createdRecord.content,
        attachments: createdRecord.attachments || [],
        createdAt: createdRecord.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/comments/:proofId
 * Endpoint to fetch all threaded comments associated with a specific proof or revision.
 * Returns hierarchical thread trees as well as raw sequential comments.
 */
export const getCommentsByProofId = async (req, res, next) => {
  try {
    const { proofId } = req.params;

    if (!proofId || typeof proofId !== 'string' || !proofId.trim()) {
      throw makeHttpError(400, 'Validation Error: proofId parameter is required.');
    }

    const cleanProofId = proofId.trim();

    // 1. Verify target Proof exists
    const proofLookup = await findProofByIdentifier(cleanProofId);
    if (!proofLookup) {
      throw makeHttpError(
        404,
        `Proof not found with identifier "${cleanProofId}".`,
      );
    }

    const targetProofId = proofLookup.proof.proofId || cleanProofId;
    let comments = [];

    // 2. Fetch comments via Prisma (Primary)
    if (prisma?.comment) {
      try {
        comments = await prisma.comment.findMany({
          where: { proofId: targetProofId },
          orderBy: { createdAt: 'asc' },
        });
      } catch (err) {
        logWarn(`⚠️ Prisma fetch comments query error: ${err.message}. Using Mongoose.`);
      }
    }

    // 3. Fetch comments via Mongoose (Fallback)
    if (!comments || comments.length === 0) {
      comments = await Comment.find({ proofId: targetProofId })
        .sort({ createdAt: 1 })
        .lean();
    }

    // 4. Construct threaded comment hierarchy
    const threads = buildThreadTree(comments);

    // 5. Clean JSON Response
    return res.status(200).json({
      success: true,
      message: 'Threaded comments retrieved successfully.',
      proofId: targetProofId,
      totalComments: comments.length,
      data: {
        threads,
        rawComments: comments.map((c) => ({
          id: c.id || c._id,
          commentId: c.commentId,
          proofId: c.proofId,
          parentCommentId: c.parentCommentId || null,
          authorId: c.authorId,
          authorName: c.authorName || null,
          authorRole: c.authorRole,
          content: c.content,
          attachments: c.attachments || [],
          createdAt: c.createdAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
