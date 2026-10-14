/* eslint-env node */

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Design from '../models/design.model.js';
import DesignRevision from '../models/design-revision.model.js';
import DesignFeedback from '../models/design-feedback.model.js';
import { logError } from '../utils/logger.js';

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

    const shop = request.shop || request.shopifyProxy?.shop || 'custome-forge.myshopify.com';
    const design = await Design.findOne({
      shop,
      shareTokenHash: hashShareToken(token),
    }).lean();
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

    const shop = request.shop || request.shopifyProxy?.shop || 'custome-forge.myshopify.com';
    const design = await Design.findOne({
      shop,
      shareTokenHash: hashShareToken(token),
    }).select('_id shop');
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
    const shop = request.shop || request.shopifyProxy?.shop || 'custome-forge.myshopify.com';
    const design = await Design.findOne({
      shop,
      shareTokenHash: hashShareToken(token),
    }).select('_id');
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
