/* eslint-env node */

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Design from '../models/design.model.js';
import DesignRevision from '../models/design-revision.model.js';
import DesignFeedback from '../models/design-feedback.model.js';
import { logError, logSuccess, logWarn } from '../utils/logger.js';

const MAX_CANVAS_BYTES = 8 * 1024 * 1024;
const MAX_REVISIONS = 20;
const MAX_PAGE_SIZE = 100;

const makeHttpError = (statusCode, message) =>
  Object.assign(new Error(message), { statusCode });

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const getOwnerFilter = (shopper) => ({
  shop: shopper.shop,
  ...(shopper.customerId
    ? { customerId: shopper.customerId, sessionId: null }
    : { customerId: null, sessionId: shopper.sessionId }),
});

const getDesignByOwner = (id, shopper) =>
  Design.findOne({ _id: id, ...getOwnerFilter(shopper) }).select(
    '+shareTokenHash',
  );

const hashShareToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const createShareToken = () => crypto.randomBytes(32).toString('base64url');

const getShareUrl = (request, token) => {
  const host = request.get('host') || 'localhost:5000';
  const protocol = request.protocol || 'http';
  return `${protocol}://${host}/api/designs/share/${token}`;
};

const validateCanvasState = (canvasState) => {
  if (!isPlainObject(canvasState)) {
    throw makeHttpError(400, 'canvasState must be a JSON object.');
  }

  const byteLength = Buffer.byteLength(JSON.stringify(canvasState), 'utf8');
  if (byteLength > MAX_CANVAS_BYTES) {
    throw makeHttpError(413, 'canvasState must be 8 MB or smaller.');
  }
};

const validateThumbnailUrl = (thumbnailUrl) => {
  if (thumbnailUrl == null || thumbnailUrl === '') return null;
  if (typeof thumbnailUrl !== 'string' || thumbnailUrl.length > 2048) {
    throw makeHttpError(400, 'thumbnailUrl must be a URL under 2048 characters.');
  }

  let parsed;
  try {
    parsed = new URL(thumbnailUrl);
  } catch (error) {
    throw makeHttpError(400, 'thumbnailUrl must be a valid URL.');
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw makeHttpError(400, 'thumbnailUrl must use HTTP or HTTPS.');
  }

  return parsed.toString();
};

import { storeRevision } from './revision.controller.js';

const runInTransaction = (callback) => Design.db.transaction(callback);

export const createOrUpdateDesign = async (request, response, next) => {
  try {
    if (!isPlainObject(request.body)) {
      throw makeHttpError(400, 'Request body must be a JSON object.');
    }
    const body = request.body;
    const protectedFields = [
      'shareToken',
      'shareTokenHash',
      'status',
    ];
    if (protectedFields.some((field) => field in body)) {
      throw makeHttpError(
        400,
        'Share token and status fields are managed by the server.',
      );
    }

    const { designId, canvasState, productId, thumbnailUrl, expectedVersion, changeNote, changedBy } = body;
    const authorRole = changedBy === 'staff' ? 'staff' : (request.shopper?.customerId ? 'customer' : 'customer');

    if (!designId) {
      if (typeof productId !== 'string' || !productId.trim()) {
        throw makeHttpError(400, 'productId must be a non-empty string.');
      }
      validateCanvasState(canvasState);

      const shareToken = createShareToken();
      const thumbnail = validateThumbnailUrl(thumbnailUrl);
      let design;

      await runInTransaction(async (session) => {
        [design] = await Design.create(
          [
            {
              ...getOwnerFilter(request.shopper),
              productId: productId.trim(),
              canvasState,
              thumbnailUrl: thumbnail,
              shareTokenHash: hashShareToken(shareToken),
              status: 'saved',
              version: 1,
            },
          ],
          { session },
        );
        await storeRevision(design, session, {
          changedBy: authorRole,
          changeNote: changeNote || 'Initial design creation',
        });
      });

      return response.status(201).json({
        success: true,
        message: 'Design saved.',
        data: {
          design: design.toJSON(),
          shareToken,
          shareUrl: getShareUrl(request, shareToken),
        },
      });
    }

    if (!mongoose.isValidObjectId(designId)) {
      throw makeHttpError(400, 'designId must be a valid design ID.');
    }
    if (
      !Number.isSafeInteger(expectedVersion) ||
      expectedVersion < 1
    ) {
      throw makeHttpError(400, 'expectedVersion must be a positive integer.');
    }
    if (canvasState === undefined && thumbnailUrl === undefined) {
      throw makeHttpError(400, 'Provide canvasState or thumbnailUrl to update.');
    }
    if (canvasState !== undefined) validateCanvasState(canvasState);
    const thumbnail = validateThumbnailUrl(thumbnailUrl);

    let design;
    await runInTransaction(async (session) => {
      design = await getDesignByOwner(designId, request.shopper).session(session);
      if (!design) throw makeHttpError(404, 'Design not found.');
      if (expectedVersion !== design.version) {
        throw makeHttpError(
          409,
          `Design version conflict. Current version is ${design.version}.`,
        );
      }

      if (canvasState !== undefined) {
        design.canvasState = canvasState;
        design.markModified('canvasState');
      }
      if (thumbnailUrl !== undefined) design.thumbnailUrl = thumbnail;
      design.version += 1;
      design.status = 'saved';
      await design.save({ session });
      await storeRevision(design, session, {
        changedBy: authorRole,
        changeNote: changeNote || `Updated to version ${design.version}`,
      });
    });

    return response.status(200).json({
      success: true,
      message: 'Design updated.',
      data: { design: design.toJSON() },
    });
  } catch (error) {
    logError(`Design save/update failed: ${error.message}`);
    return next(error);
  }
};

export const listMyDesigns = async (request, response, next) => {
  try {
    const limit = Number(request.query.limit ?? 20);
    const page = Number(request.query.page ?? 1);
    const productId =
      typeof request.query.productId === 'string'
        ? request.query.productId.trim()
        : '';

    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_PAGE_SIZE ||
      !Number.isSafeInteger(page) ||
      page < 1
    ) {
      throw makeHttpError(400, `limit must be 1-${MAX_PAGE_SIZE} and page must be positive.`);
    }

    const filter = {
      ...getOwnerFilter(request.shopper),
      ...(productId ? { productId } : {}),
    };
    const [designs, total] = await Promise.all([
      Design.find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('+shareTokenHash')
        .lean(),
      Design.countDocuments(filter),
    ]);

    return response.status(200).json({
      success: true,
      data: {
        designs: designs.map((design) => ({
          ...design,
          id: design._id,
          isShared: Boolean(design.shareTokenHash),
          shareTokenHash: undefined,
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const getDesignById = async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      throw makeHttpError(400, 'Design ID is invalid.');
    }
    const design = await getDesignByOwner(request.params.id, request.shopper)
      .select('+shareTokenHash')
      .lean();
    if (!design) throw makeHttpError(404, 'Design not found.');

    return response.status(200).json({
      success: true,
      data: {
        ...design,
        id: design._id,
        isShared: Boolean(design.shareTokenHash),
        shareTokenHash: undefined,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const manageShareLink = async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      throw makeHttpError(400, 'Design ID is invalid.');
    }

    let design;
    let shareToken;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      shareToken = createShareToken();
      try {
        design = await getDesignByOwner(request.params.id, request.shopper);
        if (!design) throw makeHttpError(404, 'Design not found.');
        design.shareTokenHash = hashShareToken(shareToken);
        await design.save();
        break;
      } catch (error) {
        if (error.statusCode || error.code !== 11000 || attempt === 2) {
          throw error;
        }
      }
    }

    return response.status(200).json({
      success: true,
      message: 'Share link created. Keep the returned token private.',
      data: { shareToken, shareUrl: getShareUrl(request, shareToken) },
    });
  } catch (error) {
    return next(error);
  }
};

export const revokeShareLink = async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      throw makeHttpError(400, 'Design ID is invalid.');
    }

    const design = await getDesignByOwner(request.params.id, request.shopper);
    if (!design) throw makeHttpError(404, 'Design not found.');
    design.shareTokenHash = undefined;
    await design.save();
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
};

export const getSharedDesign = async (request, response, next) => {
  try {
    const token = request.params.shareToken;
    if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) {
      throw makeHttpError(404, 'Shared design not found.');
    }

    const designQuery = {
      shareTokenHash: hashShareToken(token),
      ...(request.shop ? { shop: request.shop } : {}),
    };
    const design = await Design.findOne(designQuery).lean();
    if (!design) throw makeHttpError(404, 'Shared design not found.');

    return response.status(200).json({
      success: true,
      data: {
        id: design._id,
        productId: design.productId,
        canvasState: design.canvasState,
        thumbnailUrl: design.thumbnailUrl,
        version: design.version,
        isReadOnly: true,
        createdAt: design.createdAt,
        updatedAt: design.updatedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const listDesignRevisions = async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      throw makeHttpError(400, 'Design ID is invalid.');
    }
    const design = await getDesignByOwner(request.params.id, request.shopper)
      .select('_id shop')
      .lean();
    if (!design) throw makeHttpError(404, 'Design not found.');

    const revisions = await DesignRevision.find({
      designId: design._id,
      shop: design.shop,
    })
      .sort({ version: -1 })
      .limit(MAX_REVISIONS)
      .lean();

    return response.status(200).json({
      success: true,
      data: { revisions, limit: MAX_REVISIONS },
    });
  } catch (error) {
    return next(error);
  }
};

export const restoreDesignRevision = async (request, response, next) => {
  try {
    if (!isPlainObject(request.body)) {
      throw makeHttpError(400, 'Request body must be a JSON object.');
    }
    const { id, version: versionParam } = request.params;
    const version = Number(versionParam);
    const { expectedVersion } = request.body;
    if (!mongoose.isValidObjectId(id)) {
      throw makeHttpError(400, 'Design ID is invalid.');
    }
    if (!Number.isSafeInteger(version) || version < 1) {
      throw makeHttpError(400, 'Revision version must be a positive integer.');
    }
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw makeHttpError(400, 'expectedVersion must be a positive integer.');
    }

    let design;
    await runInTransaction(async (session) => {
      design = await getDesignByOwner(id, request.shopper).session(session);
      if (!design) throw makeHttpError(404, 'Design not found.');
      if (expectedVersion !== design.version) {
        throw makeHttpError(
          409,
          `Design version conflict. Current version is ${design.version}.`,
        );
      }

      const revision = await DesignRevision.findOne({
        designId: design._id,
        shop: design.shop,
        version,
      }).session(session);
      if (!revision) throw makeHttpError(404, 'Design revision not found.');

      design.productId = revision.productId;
      design.canvasState = revision.canvasState;
      design.markModified('canvasState');
      design.thumbnailUrl = revision.thumbnailUrl;
      design.status = 'saved';
      design.version += 1;
      await design.save({ session });
      await storeRevision(design, session);
    });

    return response.status(200).json({
      success: true,
      message: `Restored revision ${version} as version ${design.version}.`,
      data: { design: design.toJSON() },
    });
  } catch (error) {
    return next(error);
  }
};

export const submitSharedFeedback = async (request, response, next) => {
  try {
    if (!isPlainObject(request.body)) {
      throw makeHttpError(400, 'Request body must be a JSON object.');
    }
    const token = request.params.shareToken;
    if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) {
      throw makeHttpError(404, 'Shared design not found.');
    }

    const designQuery = {
      shareTokenHash: hashShareToken(token),
      ...(request.shop ? { shop: request.shop } : {}),
    };
    const design = await Design.findOne(designQuery).select('_id shop');
    if (!design) throw makeHttpError(404, 'Shared design not found.');

    const message =
      typeof request.body.message === 'string' ? request.body.message.trim() : '';
    const displayName =
      typeof request.body.displayName === 'string'
        ? request.body.displayName.trim()
        : 'Guest';
    if (!message || message.length > 2000) {
      throw makeHttpError(400, 'Feedback message must be 1-2000 characters.');
    }
    if (displayName.length > 80) {
      throw makeHttpError(400, 'displayName must be 80 characters or fewer.');
    }

    const feedback = await DesignFeedback.create({
      designId: design._id,
      shop: design.shop,
      displayName: displayName || 'Guest',
      message,
    });
    return response.status(201).json({
      success: true,
      message: 'Feedback submitted for owner review.',
      data: feedback,
    });
  } catch (error) {
    return next(error);
  }
};

export const listSharedFeedback = async (request, response, next) => {
  try {
    const token = request.params.shareToken;
    if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) {
      throw makeHttpError(404, 'Shared design not found.');
    }
    const designQuery = {
      shareTokenHash: hashShareToken(token),
      ...(request.shop ? { shop: request.shop } : {}),
    };
    const design = await Design.findOne(designQuery).select('_id');
    if (!design) throw makeHttpError(404, 'Shared design not found.');

    const feedback = await DesignFeedback.find({
      designId: design._id,
      status: 'approved',
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('displayName message createdAt')
      .lean();
    return response.status(200).json({ success: true, data: { feedback } });
  } catch (error) {
    return next(error);
  }
};

export const listOwnerFeedback = async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      throw makeHttpError(400, 'Design ID is invalid.');
    }
    const design = await getDesignByOwner(request.params.id, request.shopper)
      .select('_id shop')
      .lean();
    if (!design) throw makeHttpError(404, 'Design not found.');

    const feedback = await DesignFeedback.find({
      designId: design._id,
      shop: design.shop,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return response.status(200).json({ success: true, data: { feedback } });
  } catch (error) {
    return next(error);
  }
};

export const moderateFeedback = async (request, response, next) => {
  try {
    if (!isPlainObject(request.body)) {
      throw makeHttpError(400, 'Request body must be a JSON object.');
    }
    const { id, feedbackId } = request.params;
    const { status } = request.body;
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(feedbackId)) {
      throw makeHttpError(400, 'Design or feedback ID is invalid.');
    }
    if (!['approved', 'rejected'].includes(status)) {
      throw makeHttpError(400, 'Feedback status must be approved or rejected.');
    }

    const design = await getDesignByOwner(id, request.shopper).select('_id shop').lean();
    if (!design) throw makeHttpError(404, 'Design not found.');

    const feedback = await DesignFeedback.findOneAndUpdate(
      { _id: feedbackId, designId: design._id, shop: design.shop },
      { $set: { status } },
      { new: true, runValidators: true },
    );
    if (!feedback) throw makeHttpError(404, 'Feedback not found.');
    return response.status(200).json({ success: true, data: feedback });
  } catch (error) {
    return next(error);
  }
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DESIGN & RESUME WORKFLOWS
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Resume a custom canvas state across sessions.
 * Allows retrieving by design ID or by customer's active design for a given product.
 */
export const resumeDesign = async (request, response, next) => {
  try {
    const { id } = request.params;
    const { productId, shop } = request.query;

    let query = {};

    if (id && mongoose.isValidObjectId(id)) {
      query._id = id;
    } else if (productId) {
      query.productId = String(productId).trim();
      const customerId = request.user?._id || request.user?.shopifyCustomerId || request.shopper?.customerId;
      const sessionId = request.shopper?.sessionId || request.query.sessionId;

      if (customerId) {
        query.$or = [{ customerId: String(customerId) }, { customerId: request.user?.shopifyCustomerId }];
      } else if (sessionId) {
        query.sessionId = sessionId;
      }
      if (shop) query.shop = String(shop).trim().toLowerCase();
    } else {
      throw makeHttpError(400, 'Please provide a design ID in URL path or productId in query params.');
    }

    const design = await Design.findOne(query)
      .sort({ updatedAt: -1 })
      .select('+shareTokenHash')
      .lean();

    if (!design) {
      return response.status(404).json({
        success: false,
        message: 'No saved canvas state found for the specified criteria.',
      });
    }

    return response.status(200).json({
      success: true,
      message: 'Design canvas state resumed successfully.',
      data: {
        designId: design._id,
        productId: design.productId,
        title: design.title,
        canvasState: design.canvasState,
        thumbnailUrl: design.thumbnailUrl,
        version: design.version,
        status: design.status,
        isTemplate: Boolean(design.isTemplate),
        templateCategory: design.templateCategory,
        updatedAt: design.updatedAt,
      },
    });
  } catch (error) {
    logError(`[resumeDesign] ${error.message}`);
    return next(error);
  }
};

/**
 * Generate a shareable feedback token for a design.
 */
export const generateShareToken = async (request, response, next) => {
  try {
    const { id } = request.params;
    if (!mongoose.isValidObjectId(id)) {
      throw makeHttpError(400, 'Design ID is invalid.');
    }

    const design = await Design.findById(id).select('+shareTokenHash');
    if (!design) throw makeHttpError(404, 'Design not found.');

    const shareToken = createShareToken();
    design.shareTokenHash = hashShareToken(shareToken);
    if (design.status === 'draft') design.status = 'shared';
    await design.save();

    return response.status(200).json({
      success: true,
      message: 'Shareable feedback token generated successfully.',
      data: {
        designId: design._id,
        shareToken,
        shareUrl: getShareUrl(request, shareToken),
      },
    });
  } catch (error) {
    logError(`[generateShareToken] ${error.message}`);
    return next(error);
  }
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DESIGNER & MERCHANT TEMPLATE & REVIEW WORKFLOWS
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Create a reusable design template (Designers and Merchants).
 */
export const createTemplate = async (request, response, next) => {
  try {
    const { title, productId, templateCategory, canvasState, thumbnailUrl, shop } = request.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw makeHttpError(400, 'Template title is required.');
    }
    if (!productId || typeof productId !== 'string' || !productId.trim()) {
      throw makeHttpError(400, 'productId is required for template.');
    }
    validateCanvasState(canvasState);

    const thumbnail = validateThumbnailUrl(thumbnailUrl);
    const resolvedShop = shop || request.shop || request.user?.shop || process.env.SHOPIFY_SHOP || '';

    const template = await Design.create({
      title: title.trim(),
      productId: productId.trim(),
      shop: resolvedShop,
      canvasState,
      thumbnailUrl: thumbnail,
      isTemplate: true,
      templateCategory: templateCategory ? String(templateCategory).trim().toLowerCase() : 'general',
      createdByRole: request.user?.role || 'designer',
      createdByUserId: request.user?._id ? String(request.user._id) : null,
      status: 'saved',
      version: 1,
    });

    logSuccess(`[createTemplate] Template "${title}" created by ${request.user?.email || 'designer'}`);

    return response.status(201).json({
      success: true,
      message: 'Design template created successfully.',
      data: template,
    });
  } catch (error) {
    logError(`[createTemplate] ${error.message}`);
    return next(error);
  }
};

/**
 * List design templates with optional category filter.
 */
export const listTemplates = async (request, response, next) => {
  try {
    const { category, productId, shop } = request.query;
    const filter = { isTemplate: true };

    if (category) {
      filter.templateCategory = String(category).trim().toLowerCase();
    }
    if (productId) {
      filter.productId = String(productId).trim();
    }
    if (shop) {
      filter.shop = String(shop).trim().toLowerCase();
    }

    const templates = await Design.find(filter).sort({ createdAt: -1 });

    return response.status(200).json({
      success: true,
      count: templates.length,
      data: templates,
    });
  } catch (error) {
    logError(`[listTemplates] ${error.message}`);
    return next(error);
  }
};

/**
 * Get a single template by ID.
 */
export const getTemplateById = async (request, response, next) => {
  try {
    const { id } = request.params;
    if (!mongoose.isValidObjectId(id)) {
      throw makeHttpError(400, 'Template ID is invalid.');
    }

    const template = await Design.findOne({ _id: id, isTemplate: true });
    if (!template) {
      throw makeHttpError(404, 'Template not found.');
    }

    return response.status(200).json({
      success: true,
      data: template,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Review, adjust, or modify a customer design canvas state (Designers & Merchants).
 */
export const reviewAndModifyDesign = async (request, response, next) => {
  try {
    const { id } = request.params;
    const { canvasState, thumbnailUrl, changeNote, status } = request.body;

    if (!mongoose.isValidObjectId(id)) {
      throw makeHttpError(400, 'Design ID is invalid.');
    }

    const design = await Design.findById(id);
    if (!design) {
      throw makeHttpError(404, 'Design not found.');
    }

    if (canvasState !== undefined) {
      validateCanvasState(canvasState);
      design.canvasState = canvasState;
      design.markModified('canvasState');
    }

    if (thumbnailUrl !== undefined) {
      design.thumbnailUrl = validateThumbnailUrl(thumbnailUrl);
    }

    if (status && ['draft', 'saved', 'shared', 'submitted', 'approved'].includes(status)) {
      design.status = status;
    }

    design.version += 1;
    await design.save();

    // Store version revision for audit trail
    await storeRevision(design, null, {
      changedBy: request.user?.role || 'merchant',
      changeNote: changeNote || `Design reviewed and modified by ${request.user?.role || 'staff'}`,
    });

    logSuccess(`[reviewAndModifyDesign] Design ${id} reviewed by ${request.user?.email || 'staff'}`);

    return response.status(200).json({
      success: true,
      message: 'Design canvas state reviewed and updated successfully.',
      data: design,
    });
  } catch (error) {
    logError(`[reviewAndModifyDesign] ${error.message}`);
    return next(error);
  }
};

