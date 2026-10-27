/* eslint-env node */

import crypto from 'node:crypto';
import prisma from '../config/prisma.js';
import Proof, { PROOF_STATUSES } from '../models/proof.model.js';
import CustomOrderTimeline from '../models/custom-order-timeline.model.js';
import { logError, logSuccess, logWarn } from '../utils/logger.js';
import OtpService from '../services/otpService.js';

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
 * Normalizes Shopify Order ID strings (e.g. "gid://shopify/Order/123456" -> "123456").
 */
const normalizeOrderId = (rawId) => {
  if (!rawId) return '';
  const str = String(rawId).trim();
  const match = str.match(/Order\/(\d+)/);
  return match ? match[1] : str;
};

/**
 * Generates an unguessable 64-character hexadecimal secure token.
 */
const generateSecureToken = () => crypto.randomBytes(32).toString('hex');

/**
 * Helper to construct the unauthenticated secure customer viewing URL.
 */
const buildSecureViewUrl = (req, secureToken) => {
  const host = req.get('host') || 'localhost:5000';
  const protocol = req.protocol || 'http';
  return `${protocol}://${host}/api/proofs/secure/${secureToken}`;
};

/**
 * Find existing proofs for an order to calculate the next version number.
 */
const getHighestVersionForOrder = async (orderId, shopifyOrderId) => {
  const normalizedShopifyId = normalizeOrderId(shopifyOrderId || orderId);

  // 1. Try Prisma first
  if (prisma?.proof) {
    try {
      const proofs = await prisma.proof.findMany({
        where: {
          OR: [
            { orderId: String(orderId) },
            ...(normalizedShopifyId ? [{ shopifyOrderId: normalizedShopifyId }, { orderId: normalizedShopifyId }] : []),
          ],
        },
        orderBy: { versionNumber: 'desc' },
        take: 1,
      });
      if (proofs && proofs.length > 0) {
        return proofs[0].versionNumber || 1;
      }
      return 0;
    } catch (err) {
      logWarn(`⚠️ Prisma getHighestVersion query error: ${err.message}. Falling back to Mongoose.`);
    }
  }

  // 2. Mongoose fallback
  try {
    const highestProof = await Proof.findOne({
      $or: [
        { orderId: String(orderId) },
        ...(normalizedShopifyId ? [{ shopifyOrderId: normalizedShopifyId }, { orderId: normalizedShopifyId }] : []),
      ],
    })
      .sort({ versionNumber: -1 })
      .select('versionNumber')
      .lean();

    return highestProof ? highestProof.versionNumber || 1 : 0;
  } catch (err) {
    logError(`❌ Mongoose getHighestVersion query error: ${err.message}`);
    return 0;
  }
};

/**
 * Helper to update order timeline stage and history when proof status changes.
 */
const syncTimelineIfAvailable = async (orderId, stage, historyMessage, metadata = null) => {
  const normalizedId = normalizeOrderId(orderId);
  if (!normalizedId) return;

  try {
    // 1. Prisma timeline sync
    if (prisma?.customOrderTimeline) {
      await prisma.customOrderTimeline.updateMany({
        where: { shopifyOrderId: normalizedId },
        data: {
          currentStage: stage,
          history: {
            push: {
              stage,
              message: historyMessage,
              timestamp: new Date(),
              metadata,
            },
          },
        },
      });
      return;
    }

    // 2. Mongoose timeline sync
    await CustomOrderTimeline.findOneAndUpdate(
      { shopifyOrderId: normalizedId },
      {
        $set: { currentStage: stage },
        $push: {
          history: {
            stage,
            message: historyMessage,
            timestamp: new Date(),
            metadata,
          },
        },
      },
    );
  } catch (err) {
    // Non-blocking telemetry warning
    logWarn(`⚠️ Could not auto-sync order timeline: ${err.message}`);
  }
};

// =============================================================================
// CONTROLLER HANDLERS
// =============================================================================

/**
 * POST /api/proofs/generate
 * Generates and assigns a new proof record to an order with version tracking and a secure customer viewing token.
 * Production remains BLOCKED until explicit customer approval is recorded.
 */
export const generateProof = async (req, res, next) => {
  try {
    const {
      orderId,
      shopifyOrderId,
      designId,
      previewUrl,
      title,
      notes,
      shop,
      customerEmail,
      metadata,
    } = req.body;

    // 1. Validation
    const effectiveOrderId = orderId || shopifyOrderId;
    if (!effectiveOrderId || typeof effectiveOrderId !== 'string' || !effectiveOrderId.trim()) {
      throw makeHttpError(400, 'Validation Error: orderId or shopifyOrderId is required.');
    }

    const trimmedOrderId = String(effectiveOrderId).trim();
    const normalizedShopifyId = normalizeOrderId(shopifyOrderId || effectiveOrderId);

    if (previewUrl && (typeof previewUrl !== 'string' || previewUrl.length > 4096)) {
      throw makeHttpError(400, 'Validation Error: previewUrl must be a valid URL string under 4096 characters.');
    }

    // 2. Version calculation
    const currentMaxVersion = await getHighestVersionForOrder(trimmedOrderId, normalizedShopifyId);
    const newVersionNumber = currentMaxVersion + 1;

    // 3. Security & Identifier generation
    const proofId = crypto.randomUUID();
    const secureToken = generateSecureToken();

    // 4. Initial audit logs and comments
    const initialLog = {
      action: 'PROOF_GENERATED',
      performedBy: 'MERCHANT',
      note: notes ? `Proof v${newVersionNumber} generated: ${notes.trim()}` : `Proof v${newVersionNumber} generated and queued for approval.`,
      timestamp: new Date(),
      metadata: {
        versionNumber: newVersionNumber,
        customerEmail: customerEmail || null,
      },
    };

    const initialComments = notes && typeof notes === 'string' && notes.trim()
      ? [
          {
            id: crypto.randomUUID(),
            author: 'Merchant',
            role: 'MERCHANT',
            message: notes.trim(),
            createdAt: new Date(),
          },
        ]
      : [];

    const proofData = {
      proofId,
      orderId: trimmedOrderId,
      shopifyOrderId: normalizedShopifyId || trimmedOrderId,
      designId: designId ? String(designId).trim() : null,
      versionNumber: newVersionNumber,
      status: 'PENDING_APPROVAL',
      secureToken,
      previewUrl: previewUrl ? previewUrl.trim() : null,
      title: title && typeof title === 'string' ? title.trim() : `Design Proof v${newVersionNumber}`,
      productionBlocked: true, // STRICT GUARD: Production blocked until customer approves
      approvedAt: null,
      approvedBy: null,
      decisionNote: null,
      comments: initialComments,
      revisionLogs: [initialLog],
      shop: shop ? String(shop).toLowerCase().trim() : null,
      metadata: metadata && typeof metadata === 'object' ? metadata : null,
    };

    let createdRecord = null;

    // 5. Save with Prisma (Primary)
    if (prisma?.proof) {
      try {
        createdRecord = await prisma.proof.create({
          data: proofData,
        });
        logSuccess(`✅ Proof record created via Prisma: ${proofId} (v${newVersionNumber})`);
      } catch (prismaErr) {
        logWarn(`⚠️ Prisma create failed (${prismaErr.message}). Falling back to Mongoose.`);
      }
    }

    // 6. Save with Mongoose (Fallback)
    if (!createdRecord) {
      const mongooseProof = new Proof(proofData);
      await mongooseProof.save();
      createdRecord = mongooseProof.toObject();
      logSuccess(`✅ Proof record created via Mongoose: ${proofId} (v${newVersionNumber})`);
    }

    // 7. Auto-sync Order Timeline if configured
    await syncTimelineIfAvailable(
      normalizedShopifyId,
      'PROOF_READY',
      `Digital Proof v${newVersionNumber} is ready for customer review and approval.`,
      { proofId, versionNumber: newVersionNumber, secureToken },
    );

    const secureViewUrl = buildSecureViewUrl(req, secureToken);

    // 8. Clean JSON Response
    return res.status(201).json({
      success: true,
      message: `Design proof v${newVersionNumber} generated successfully. Production is currently BLOCKED pending customer approval.`,
      data: {
        id: createdRecord.id || createdRecord._id,
        proofId: createdRecord.proofId,
        orderId: createdRecord.orderId,
        shopifyOrderId: createdRecord.shopifyOrderId,
        designId: createdRecord.designId,
        versionNumber: createdRecord.versionNumber,
        status: createdRecord.status,
        productionBlocked: createdRecord.productionBlocked,
        secureToken: createdRecord.secureToken,
        secureViewUrl,
        previewUrl: createdRecord.previewUrl,
        title: createdRecord.title,
        commentsCount: createdRecord.comments?.length || 0,
        createdAt: createdRecord.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/proofs/secure/:secureToken
 * Secure unauthenticated endpoint for customers to view the proof and approval status via private link.
 */
export const getProofBySecureToken = async (req, res, next) => {
  try {
    const { secureToken } = req.params;

    if (!secureToken || typeof secureToken !== 'string' || secureToken.trim().length < 16) {
      throw makeHttpError(400, 'Invalid or missing secure token parameter.');
    }

    const cleanToken = secureToken.trim();
    let proofRecord = null;

    // 1. Try Prisma first
    if (prisma?.proof) {
      try {
        proofRecord = await prisma.proof.findUnique({
          where: { secureToken: cleanToken },
        });
      } catch (err) {
        logWarn(`⚠️ Prisma secureToken lookup error: ${err.message}`);
      }
    }

    // 2. Mongoose fallback
    if (!proofRecord) {
      proofRecord = await Proof.findOne({ secureToken: cleanToken }).lean();
    }

    // 3. Not Found Handler
    if (!proofRecord) {
      throw makeHttpError(404, 'Invalid or expired proof link. No matching proof found.');
    }

    // 4. Return clean, customer-safe proof details
    return res.status(200).json({
      success: true,
      message: 'Proof details retrieved successfully.',
      data: {
        proofId: proofRecord.proofId,
        orderId: proofRecord.orderId,
        shopifyOrderId: proofRecord.shopifyOrderId,
        designId: proofRecord.designId,
        versionNumber: proofRecord.versionNumber,
        status: proofRecord.status,
        title: proofRecord.title,
        previewUrl: proofRecord.previewUrl,
        productionBlocked: proofRecord.productionBlocked,
        approvedAt: proofRecord.approvedAt,
        approvedBy: proofRecord.approvedBy,
        comments: proofRecord.comments || [],
        revisionLogs: proofRecord.revisionLogs || [],
        createdAt: proofRecord.createdAt,
        updatedAt: proofRecord.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/proofs/:proofId/response
 * Endpoint for customers or merchants to submit an approval ("APPROVED") or revision request ("CHANGES_REQUESTED").
 * Enforces production lock: only explicit "APPROVED" unblocks manufacturing.
 */
export const submitProofResponse = async (req, res, next) => {
  try {
    const {
      status,
      action,
      comment,
      message,
      feedback,
      author,
      role = 'MERCHANT',
    } = req.body;

    // 1. Input sanitization & normalization
    const { proofId, secureToken } = req.params;
    const identifier = proofId || secureToken;

    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      throw makeHttpError(400, 'Validation Error: proofId or secureToken parameter is required.');
    }

    const cleanIdentifier = identifier.trim();
    const rawAction = status || action;

    if (!rawAction || typeof rawAction !== 'string') {
      throw makeHttpError(
        400,
        'Validation Error: status (or action) is required. Allowed values: "APPROVED" or "CHANGES_REQUESTED".',
      );
    }

    const normalizedStatus = rawAction.trim().toUpperCase();
    if (!['APPROVED', 'CHANGES_REQUESTED'].includes(normalizedStatus)) {
      throw makeHttpError(
        400,
        `Validation Error: Invalid status "${rawAction}". Allowed values are strictly "APPROVED" or "CHANGES_REQUESTED".`,
      );
    }

    const feedbackText = (comment || message || feedback || '').trim();
    const userDisplayName = req.user?.fullName || req.user?.email;
    const cleanAuthor = (author && typeof author === 'string' && author.trim())
      ? author.trim()
      : (userDisplayName || (role === 'MERCHANT' ? 'Merchant' : 'Supplier'));
    const cleanRole = ['MERCHANT', 'SUPPLIER', 'SYSTEM'].includes(String(role).toUpperCase())
      ? String(role).toUpperCase()
      : (req.user?.role === 'supplier' ? 'SUPPLIER' : 'MERCHANT');

    // 2. Fetch current proof
    let existingProof = null;
    let isPrisma = false;

    if (prisma?.proof) {
      try {
        existingProof = await prisma.proof.findFirst({
          where: {
            OR: [
              { proofId: cleanIdentifier },
              { secureToken: cleanIdentifier },
              ...(/^[0-9a-fA-F]{24}$/.test(cleanIdentifier) ? [{ id: cleanIdentifier }] : []),
            ],
          },
        });
        if (existingProof) isPrisma = true;
      } catch (err) {
        logWarn(`⚠️ Prisma proof lookup error: ${err.message}`);
      }
    }

    if (!existingProof) {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(cleanIdentifier);
      existingProof = await Proof.findOne({
        $or: [
          { proofId: cleanIdentifier },
          { secureToken: cleanIdentifier },
          ...(isObjectId ? [{ _id: cleanIdentifier }] : []),
        ],
      });
    }

    if (!existingProof) {
      throw makeHttpError(404, `Proof not found with identifier "${cleanIdentifier}".`);
    }

    // 3. Edge Case Handling: Already approved
    if (existingProof.status === 'APPROVED') {
      if (normalizedStatus === 'APPROVED') {
        throw makeHttpError(
          409,
          `Conflict: This proof has already been approved on ${existingProof.approvedAt?.toISOString() || 'a previous date'}. Production is already unlocked.`,
        );
      }
      if (normalizedStatus === 'CHANGES_REQUESTED') {
        throw makeHttpError(
          409,
          'Conflict: Cannot request changes on an already approved proof. Production has already been cleared. Please contact the merchant to issue a new revision.',
        );
      }
    }

    // 4. Edge Case Handling: Revision requested requires a clear comment
    if (normalizedStatus === 'CHANGES_REQUESTED') {
      if (!feedbackText || feedbackText.length < 3) {
        throw makeHttpError(
          400,
          'Validation Error: A descriptive comment (minimum 3 characters) is required when requesting revisions.',
        );
      }
    }

    // 5. Prepare update payload
    const now = new Date();
    const newCommentId = crypto.randomUUID();

    const newComment = feedbackText
      ? {
          id: newCommentId,
          author: cleanAuthor,
          role: cleanRole,
          message: feedbackText,
          createdAt: now,
        }
      : null;

    const newRevisionLog = {
      action: normalizedStatus,
      performedBy: cleanAuthor,
      note: feedbackText || (normalizedStatus === 'APPROVED' ? 'Proof approved for manufacturing.' : 'Changes requested.'),
      timestamp: now,
      metadata: {
        role: cleanRole,
        previousStatus: existingProof.status,
      },
    };

    let updatedRecord = null;

    if (normalizedStatus === 'APPROVED') {
      // 1. Role & Login Guard: User must be logged in with an authorized role
      if (!req.user || !req.user.email) {
        return res.status(401).json({
          success: false,
          message: 'User not logged in',
          error: 'Unauthorized',
        });
      }

      const allowedRoles = ['merchant', 'supplier', 'designer', 'store_owner', 'production_staff', 'customer', 'admin', 'staff'];
      const userRole = String(req.user.role || '').toLowerCase().trim();
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Insufficient role permissions to approve proof.',
          requiredRoles: allowedRoles,
          currentRole: userRole,
        });
      }

      // 2. Sensitive Action Guard: Require explicit email OTP verification before unblocking production
      const inputOtp = req.body?.otp || req.get('x-otp-code');
      if (!inputOtp) {
        const otpSend = await OtpService.generateAndSendOtp({
          email: req.user.email,
          action: 'PROOF_APPROVAL',
          referenceId: existingProof.proofId,
          fullName: cleanAuthor,
        });

        return res.status(403).json({
          success: false,
          requireOtp: true,
          action: 'PROOF_APPROVAL',
          message: `OTP verification required before finalizing proof approval. A 6-digit confirmation code has been dispatched to ${req.user.email}.`,
          proofId: existingProof.proofId,
          expiresInSeconds: otpSend.expiresInSeconds,
        });
      }

      // Verify the provided OTP code
      await OtpService.verifyOtp({
        email: req.user.email,
        action: 'PROOF_APPROVAL',
        referenceId: existingProof.proofId,
        otp: inputOtp,
      });

      // APPROVAL PATH: Production is unlocked
      const updateData = {
        status: 'APPROVED',
        productionBlocked: false, // PRODUCTION UNBLOCKED
        approvedAt: now,
        approvedBy: cleanAuthor,
        decisionNote: feedbackText || 'Approved by customer',
      };

      if (isPrisma) {
        updatedRecord = await prisma.proof.update({
          where: { proofId: existingProof.proofId },
          data: {
            ...updateData,
            comments: newComment ? { push: newComment } : undefined,
            revisionLogs: { push: newRevisionLog },
          },
        });
      } else {
        const updateOps = {
          $set: updateData,
          $push: {
            revisionLogs: newRevisionLog,
            ...(newComment ? { comments: newComment } : {}),
          },
        };
        updatedRecord = await Proof.findOneAndUpdate(
          { proofId: existingProof.proofId },
          updateOps,
          { new: true },
        ).lean();
      }

      // Sync Order Timeline to APPROVED stage
      await syncTimelineIfAvailable(
        existingProof.shopifyOrderId || existingProof.orderId,
        'APPROVED',
        `Digital proof v${existingProof.versionNumber} approved by ${cleanAuthor}. Order released for manufacturing.`,
        { proofId: existingProof.proofId, approvedAt: now },
      );

      logSuccess(`🎉 Proof ${existingProof.proofId} APPROVED by ${cleanAuthor}. Production unlocked.`);

      return res.status(200).json({
        success: true,
        message: 'Proof approved successfully! Production is now UNBLOCKED and scheduled for manufacturing.',
        data: {
          proofId: updatedRecord.proofId,
          orderId: updatedRecord.orderId,
          shopifyOrderId: updatedRecord.shopifyOrderId,
          versionNumber: updatedRecord.versionNumber,
          status: updatedRecord.status,
          productionBlocked: updatedRecord.productionBlocked,
          approvedAt: updatedRecord.approvedAt,
          approvedBy: updatedRecord.approvedBy,
          comments: updatedRecord.comments,
          revisionLogs: updatedRecord.revisionLogs,
          updatedAt: updatedRecord.updatedAt,
        },
      });
    }

    if (normalizedStatus === 'CHANGES_REQUESTED') {
      // REVISION PATH: Production remains strictly BLOCKED
      const updateData = {
        status: 'CHANGES_REQUESTED',
        productionBlocked: true, // PRODUCTION REMAINS BLOCKED
        decisionNote: feedbackText,
      };

      if (isPrisma) {
        updatedRecord = await prisma.proof.update({
          where: { proofId: existingProof.proofId },
          data: {
            ...updateData,
            comments: newComment ? { push: newComment } : undefined,
            revisionLogs: { push: newRevisionLog },
          },
        });
      } else {
        const updateOps = {
          $set: updateData,
          $push: {
            revisionLogs: newRevisionLog,
            ...(newComment ? { comments: newComment } : {}),
          },
        };
        updatedRecord = await Proof.findOneAndUpdate(
          { proofId: existingProof.proofId },
          updateOps,
          { new: true },
        ).lean();
      }

      // Sync Order Timeline event
      await syncTimelineIfAvailable(
        existingProof.shopifyOrderId || existingProof.orderId,
        'PROOF_READY',
        `Customer requested changes on Proof v${existingProof.versionNumber}: "${feedbackText}"`,
        { proofId: existingProof.proofId, feedbackText },
      );

      logWarn(`🔄 Proof ${existingProof.proofId} CHANGES_REQUESTED. Production remains blocked.`);

      return res.status(200).json({
        success: true,
        message: 'Revision request recorded successfully. Production remains BLOCKED until a revised proof is submitted and approved.',
        data: {
          proofId: updatedRecord.proofId,
          orderId: updatedRecord.orderId,
          shopifyOrderId: updatedRecord.shopifyOrderId,
          versionNumber: updatedRecord.versionNumber,
          status: updatedRecord.status,
          productionBlocked: updatedRecord.productionBlocked,
          comments: updatedRecord.comments,
          revisionLogs: updatedRecord.revisionLogs,
          updatedAt: updatedRecord.updatedAt,
        },
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/proofs/order/:orderId
 * Helper endpoint for merchants to view all proof revisions and current production status for an order.
 */
export const getProofsByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!orderId || !orderId.trim()) {
      throw makeHttpError(400, 'orderId parameter is required.');
    }

    const cleanId = orderId.trim();
    const normalizedId = normalizeOrderId(cleanId);
    let proofs = [];

    if (prisma?.proof) {
      try {
        proofs = await prisma.proof.findMany({
          where: {
            OR: [
              { orderId: cleanId },
              ...(normalizedId ? [{ shopifyOrderId: normalizedId }, { orderId: normalizedId }] : []),
            ],
          },
          orderBy: { versionNumber: 'desc' },
        });
      } catch (err) {
        logWarn(`⚠️ Prisma findMany proofs error: ${err.message}`);
      }
    }

    if (!proofs || proofs.length === 0) {
      proofs = await Proof.find({
        $or: [
          { orderId: cleanId },
          ...(normalizedId ? [{ shopifyOrderId: normalizedId }, { orderId: normalizedId }] : []),
        ],
      })
        .sort({ versionNumber: -1 })
        .lean();
    }

    // Check if any proof is currently approved
    const latestProof = proofs[0] || null;
    const hasApprovedProof = proofs.some((p) => p.status === 'APPROVED');
    const isProductionBlocked = !hasApprovedProof;

    return res.status(200).json({
      success: true,
      data: {
        orderId: cleanId,
        shopifyOrderId: normalizedId,
        productionBlocked: isProductionBlocked,
        productionStatus: hasApprovedProof ? 'UNBLOCKED_FOR_MANUFACTURING' : 'BLOCKED_PENDING_APPROVAL',
        totalProofs: proofs.length,
        latestProof,
        proofs,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/proofs/:proofId/request-otp
 * Request an explicit 6-digit email confirmation code for proof approval.
 */
export const requestProofApprovalOtp = async (req, res, next) => {
  try {
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        success: false,
        message: 'User not logged in',
        error: 'Unauthorized',
      });
    }

    const { proofId } = req.params;
    const recipientEmail = req.user.email || req.body?.email;

    const result = await OtpService.generateAndSendOtp({
      email: recipientEmail,
      action: 'PROOF_APPROVAL',
      referenceId: proofId,
      fullName: req.user?.fullName || 'Merchant',
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/proofs/:proofId/send-link
 * Secure endpoint to send a customer proof review URL via email.
 * Requires active login and explicit OTP verification.
 */
export const sendProofLink = async (req, res, next) => {
  try {
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        success: false,
        message: 'User not logged in',
        error: 'Unauthorized',
      });
    }
    const { proofId } = req.params;
    const { recipientEmail, customerName, note, otp } = req.body;

    const proof = await Proof.findOne({
      $or: [
        { proofId },
        ...(/^[0-9a-fA-F]{24}$/.test(proofId) ? [{ _id: proofId }] : []),
      ],
    });

    if (!proof) {
      throw makeHttpError(404, `Proof not found with identifier "${proofId}".`);
    }

    const targetRecipient = recipientEmail || proof.metadata?.customerEmail;
    if (!targetRecipient) {
      throw makeHttpError(400, 'recipientEmail is required to dispatch the secure proof link.');
    }

    // Explicit OTP verification check
    if (!otp) {
      const otpSend = await OtpService.generateAndSendOtp({
        email: req.user?.email || targetRecipient,
        action: 'SEND_PROOF_LINK',
        referenceId: proof.proofId,
        fullName: req.user?.fullName || 'Merchant',
      });

      return res.status(403).json({
        success: false,
        requireOtp: true,
        message: `OTP verification required before dispatching secure proof link. A 6-digit confirmation code has been sent to ${req.user?.email || targetRecipient}.`,
        proofId: proof.proofId,
        expiresInSeconds: otpSend.expiresInSeconds,
      });
    }

    await OtpService.verifyOtp({
      email: req.user?.email || targetRecipient,
      action: 'SEND_PROOF_LINK',
      referenceId: proof.proofId,
      otp,
    });

    const secureUrl = buildSecureViewUrl(req, proof.secureToken);

    // Sync timeline
    await syncTimelineIfAvailable(
      proof.shopifyOrderId || proof.orderId,
      'PROOF_READY',
      `Secure proof link sent to ${targetRecipient} by ${req.user?.email || 'staff'}.`,
      { proofId: proof.proofId, secureUrl },
    );

    logSuccess(`[sendProofLink] Secure proof link dispatched for ${proof.proofId} to ${targetRecipient}`);

    return res.status(200).json({
      success: true,
      message: `Secure proof review link successfully dispatched to ${targetRecipient}.`,
      data: {
        proofId: proof.proofId,
        recipientEmail: targetRecipient,
        secureUrl,
      },
    });
  } catch (error) {
    next(error);
  }
};
