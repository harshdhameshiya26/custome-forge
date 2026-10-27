/* eslint-env node */

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Design from '../models/design.model.js';
import DesignRevision from '../models/design-revision.model.js';
import OtpService from '../services/otpService.js';
import { logError } from '../utils/logger.js';

// ── Constants ──────────────────────────────────────────────────────────────
const MAX_REVISIONS  = 50;
const MAX_PAGE_SIZE  = 100;
const MAX_NOTE_LEN   = 500;

const VALID_STATUSES = [
  'draft',
  'pending_review',
  'changes_requested',
  'approved',
  'rejected',
  'superseded',
];

// ── Helpers ────────────────────────────────────────────────────────────────

const makeHttpError = (statusCode, message) =>
  Object.assign(new Error(message), { statusCode });

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const getOwnerFilter = (shopper) => ({
  // Only apply shop filter when shop is known — avoids {shop:null} queries that match nothing
  ...(shopper.shop ? { shop: shopper.shop } : {}),
  ...(shopper.customerId
    ? { customerId: shopper.customerId, sessionId: null }
    : { customerId: null, sessionId: shopper.sessionId }),
});

const getDesignByOwner = (id, shopper) =>
  Design.findOne({ _id: id, ...getOwnerFilter(shopper) });

const runInTransaction = (cb) => Design.db.transaction(cb);

/**
 * Compute SHA-256 fingerprint of a canvasState.
 * Keys are sorted for deterministic output even if object property order differs.
 */
const computeFingerprint = (canvasState) => {
  const canonical = JSON.stringify(
    canvasState,
    Object.keys(canvasState ?? {}).sort(),
  );
  return crypto.createHash('sha256').update(canonical).digest('hex');
};

/**
 * Atomically snapshot the current design state as a DesignRevision.
 * Uses upsert so a concurrent save of the same version is a no-op.
 */
const storeRevision = async (design, session, { changedBy = 'merchant', changeNote = null } = {}) => {
  const assetFingerprint = computeFingerprint(design.canvasState);

  await DesignRevision.findOneAndUpdate(
    { designId: design._id, version: design.version },
    {
      $setOnInsert: {
        designId:              design._id,
        shop:                  design.shop,
        version:               design.version,
        productId:             design.productId,
        productVariantId:       design.productVariantId || null,
        canvasState:           design.canvasState,
        thumbnailUrl:          design.thumbnailUrl,
        assetFingerprint,
        changedBy,
        changeNote:            changeNote ? String(changeNote).slice(0, MAX_NOTE_LEN) : null,
        status:                'draft',
        approvalMeta:          null,
        designStatusAtSnapshot: design.status,
        savedAt:               design.updatedAt || new Date(),
      },
    },
    { upsert: true, new: true, session, setDefaultsOnInsert: true },
  );

  // Prune oldest revisions beyond the hard cap (keeps approved ones)
  const oldestKept = await DesignRevision.find(
    { designId: design._id },
    { version: 1 },
    { sort: { version: -1 }, limit: MAX_REVISIONS, lean: true, session },
  );
  if (oldestKept.length === MAX_REVISIONS) {
    const cutoff = oldestKept[MAX_REVISIONS - 1].version;
    await DesignRevision.deleteMany(
      {
        designId: design._id,
        version: { $lt: cutoff },
        status: { $nin: ['approved'] }, // never prune the approved version
      },
      { session },
    );
  }
};

// ── Controller Exports ─────────────────────────────────────────────────────

/**
 * GET /api/designs/:id/revisions
 * Returns the full revision history for a design (newest first).
 * Strips canvasState from the list — use the comparison endpoint to get it.
 */
export const listDesignRevisions = async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      throw makeHttpError(400, 'Design ID is invalid.');
    }

    const limit = Math.min(Number(request.query.limit ?? MAX_REVISIONS), MAX_PAGE_SIZE);
    const page  = Math.max(Number(request.query.page ?? 1), 1);

    const design = await getDesignByOwner(request.params.id, request.shopper)
      .select('_id shop productId productVariantId')
      .lean();
    if (!design) throw makeHttpError(404, 'Design not found.');

    const productId =
      typeof request.query.productId === 'string' && request.query.productId.trim()
        ? request.query.productId.trim()
        : design.productId;
    const productVariantId =
      typeof request.query.productVariantId === 'string'
        ? request.query.productVariantId.trim() || null
        : design.productVariantId || null;
    const filter = {
      designId: design._id,
      shop: design.shop,
      productId,
      productVariantId,
    };
    const [revisions, total] = await Promise.all([
      DesignRevision.find(filter)
        .sort({ version: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DesignRevision.countDocuments(filter),
    ]);

    return response.status(200).json({
      success: true,
      data: {
        revisions,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    logError(`listDesignRevisions: ${error.message}`);
    return next(error);
  }
};

/**
 * GET /api/designs/:id/revisions/:version
 * Returns a single revision including full canvasState + fingerprint.
 */
export const getRevisionByVersion = async (request, response, next) => {
  try {
    const { id, version: versionParam } = request.params;
    const version = Number(versionParam);

    if (!mongoose.isValidObjectId(id))
      throw makeHttpError(400, 'Design ID is invalid.');
    if (!Number.isSafeInteger(version) || version < 1)
      throw makeHttpError(400, 'version must be a positive integer.');

    const design = await getDesignByOwner(id, request.shopper)
      .select('_id shop productId productVariantId')
      .lean();
    if (!design) throw makeHttpError(404, 'Design not found.');

    const productId =
      typeof request.query.productId === 'string' && request.query.productId.trim()
        ? request.query.productId.trim()
        : design.productId;
    const productVariantId =
      typeof request.query.productVariantId === 'string'
        ? request.query.productVariantId.trim() || null
        : design.productVariantId || null;
    const revision = await DesignRevision.findOne({
      designId: design._id,
      shop:     design.shop,
      version,
      productId,
      productVariantId,
    }).lean();
    if (!revision) throw makeHttpError(404, 'Revision not found.');

    return response.status(200).json({ success: true, data: { revision } });
  } catch (error) {
    logError(`getRevisionByVersion: ${error.message}`);
    return next(error);
  }
};

/**
 * GET /api/designs/:id/revisions/compare?versionA=2&versionB=4
 * Fetches two revisions side-by-side. Returns both full canvasStates
 * plus a lightweight JSON diff summary for UI highlight overlays.
 */
export const compareRevisions = async (request, response, next) => {
  try {
    const { id } = request.params;
    const versionA = Number(request.query.versionA);
    const versionB = Number(request.query.versionB);

    if (!mongoose.isValidObjectId(id))
      throw makeHttpError(400, 'Design ID is invalid.');
    if (
      !Number.isSafeInteger(versionA) || versionA < 1 ||
      !Number.isSafeInteger(versionB) || versionB < 1
    ) throw makeHttpError(400, 'versionA and versionB must be positive integers.');
    if (versionA === versionB)
      throw makeHttpError(400, 'versionA and versionB must be different.');

    const design = await getDesignByOwner(id, request.shopper)
      .select('_id shop productId productVariantId')
      .lean();
    if (!design) throw makeHttpError(404, 'Design not found.');

    const productId =
      typeof request.query.productId === 'string' && request.query.productId.trim()
        ? request.query.productId.trim()
        : design.productId;
    const productVariantId =
      typeof request.query.productVariantId === 'string'
        ? request.query.productVariantId.trim() || null
        : design.productVariantId || null;
    const revisionScope = {
      designId: design._id,
      shop: design.shop,
      productId,
      productVariantId,
    };
    const [revA, revB] = await Promise.all([
      DesignRevision.findOne({ ...revisionScope, version: versionA }).lean(),
      DesignRevision.findOne({ ...revisionScope, version: versionB }).lean(),
    ]);

    if (!revA) throw makeHttpError(404, `Revision v${versionA} not found.`);
    if (!revB) throw makeHttpError(404, `Revision v${versionB} not found.`);

    // Produce a lightweight top-level key diff for the UI overlay
    const diff = buildCanvasDiff(revA.canvasState, revB.canvasState);

    return response.status(200).json({
      success: true,
      data: {
        versionA: sanitizeRevision(revA),
        versionB: sanitizeRevision(revB),
        diff,
        fingerprintMatch: revA.assetFingerprint === revB.assetFingerprint,
      },
    });
  } catch (error) {
    logError(`compareRevisions: ${error.message}`);
    return next(error);
  }
};

/**
 * POST /api/designs/:id/revisions/:version/submit
 * Customer submits a revision for merchant review.
 */
export const submitRevisionForReview = async (request, response, next) => {
  try {
    const { id, version: versionParam } = request.params;
    const version = Number(versionParam);

    if (!mongoose.isValidObjectId(id))
      throw makeHttpError(400, 'Design ID is invalid.');
    if (!Number.isSafeInteger(version) || version < 1)
      throw makeHttpError(400, 'version must be a positive integer.');

    const design = await getDesignByOwner(id, request.shopper)
      .select('_id shop status')
      .lean();
    if (!design) throw makeHttpError(404, 'Design not found.');

    const revision = await DesignRevision.findOneAndUpdate(
      {
        designId: design._id,
        shop:     design.shop,
        version,
        status:   'draft',
      },
      { $set: { status: 'pending_review' } },
      { new: true, runValidators: true },
    ).lean();

    if (!revision)
      throw makeHttpError(
        409,
        `Revision v${version} is not in 'draft' status or does not exist.`,
      );

    // Reflect on the parent design
    await Design.findByIdAndUpdate(design._id, { $set: { status: 'submitted' } });

    return response.status(200).json({
      success: true,
      message: `Revision v${version} submitted for merchant review.`,
      data: { revision },
    });
  } catch (error) {
    logError(`submitRevisionForReview: ${error.message}`);
    return next(error);
  }
};

/**
 * POST /api/designs/:id/revisions/:version/approve
 * Merchant (or authorized staff) approves a specific revision.
 *
 * Business rules:
 *  1. Verifies stored fingerprint matches the canvasState in DB (tamper check).
 *  2. Marks any previously approved revision as 'superseded'.
 *  3. Seals this revision as 'approved' with full approvalMeta.
 *  4. Updates parent Design.status to 'approved'.
 *
 * All three writes run in a single transaction.
 */
export const approveRevision = async (request, response, next) => {
  try {
    if (!isPlainObject(request.body))
      throw makeHttpError(400, 'Request body must be a JSON object.');

    const { id, version: versionParam } = request.params;
    const version = Number(versionParam);

    if (!mongoose.isValidObjectId(id))
      throw makeHttpError(400, 'Design ID is invalid.');
    if (!Number.isSafeInteger(version) || version < 1)
      throw makeHttpError(400, 'version must be a positive integer.');

    // 1. Approver identity & role check
    const approverId = request.shopper?.customerId || request.user?.shopifyCustomerId || (request.user?._id ? String(request.user._id) : null) || request.body.approverId;
    const approverRole = request.user?.role || request.body.approverRole || 'merchant';
    const approverEmail = request.user?.email || request.shopper?.email || request.body.email;

    if (!approverId) {
      throw makeHttpError(401, 'User not logged in. An authenticated user is required to approve revisions.');
    }
    if (!['merchant', 'staff', 'admin'].includes(approverRole)) {
      throw makeHttpError(403, "Forbidden: approverRole must be 'merchant', 'staff', or 'admin'.");
    }

    // 2. Sensitive Action Guard: Require explicit email OTP verification
    if (approverEmail) {
      const inputOtp = request.body?.otp || request.get('x-otp-code');
      if (!inputOtp) {
        const otpSend = await OtpService.generateAndSendOtp({
          email: approverEmail,
          action: 'REVISION_APPROVAL',
          referenceId: `${id}_v${version}`,
          fullName: request.user?.fullName || 'Approver',
        });

        return response.status(403).json({
          success: false,
          requireOtp: true,
          action: 'REVISION_APPROVAL',
          message: `OTP verification required before approving revision v${version}. A 6-digit confirmation code has been dispatched to ${approverEmail}.`,
          version,
          expiresInSeconds: otpSend.expiresInSeconds,
        });
      }

      await OtpService.verifyOtp({
        email: approverEmail,
        action: 'REVISION_APPROVAL',
        referenceId: `${id}_v${version}`,
        otp: inputOtp,
      });
    }

    let approvedRevision;

    await runInTransaction(async (session) => {
      const design = await getDesignByOwner(id, request.shopper)
        .select('_id shop status productId productVariantId')
        .session(session);
      if (!design) throw makeHttpError(404, 'Design not found.');

      const revision = await DesignRevision.findOne({
        designId: design._id,
        shop:     design.shop,
        version,
        productId: design.productId,
        productVariantId: design.productVariantId || null,
      }).session(session);

      if (!revision) throw makeHttpError(404, `Revision v${version} not found.`);

      if (revision.status === 'approved')
        throw makeHttpError(409, `Revision v${version} is already approved.`);

      if (!['pending_review', 'draft'].includes(revision.status))
        throw makeHttpError(
          409,
          `Revision v${version} cannot be approved from status '${revision.status}'.`,
        );

      // ── Tamper-detection fingerprint check ────────────────────────────
      const currentFingerprint = computeFingerprint(revision.canvasState);
      if (currentFingerprint !== revision.assetFingerprint) {
        throw makeHttpError(
          422,
          'Asset fingerprint mismatch. The design data may have been tampered with.',
        );
      }

      // ── Supersede any existing approved revision ───────────────────────
      await DesignRevision.updateMany(
        { designId: design._id, shop: design.shop, status: 'approved' },
        { $set: { status: 'superseded' } },
        { session },
      );

      // ── Seal this revision ─────────────────────────────────────────────
      revision.status = 'approved';
      revision.approvalMeta = {
        approvedAt:            new Date(),
        approverId,
        approverRole,
        ipAddress:             request.ip || null,
        userAgent:             request.get('user-agent') || null,
        fingerprintAtApproval: currentFingerprint,
      };
      await revision.save({ session });
      approvedRevision = revision;

      // ── Update parent design ───────────────────────────────────────────
      await Design.findByIdAndUpdate(
        design._id,
        { $set: { status: 'approved' } },
        { session },
      );
    });

    return response.status(200).json({
      success: true,
      message: `Revision v${version} approved and sealed.`,
      data: { revision: approvedRevision.toJSON() },
    });
  } catch (error) {
    logError(`approveRevision: ${error.message}`);
    return next(error);
  }
};

/**
 * POST /api/designs/:id/revisions/:version/request-changes
 * Merchant requests changes on a specific revision.
 */
export const requestChanges = async (request, response, next) => {
  try {
    if (!isPlainObject(request.body))
      throw makeHttpError(400, 'Request body must be a JSON object.');

    const { id, version: versionParam } = request.params;
    const version = Number(versionParam);
    const { note } = request.body;

    if (!mongoose.isValidObjectId(id))
      throw makeHttpError(400, 'Design ID is invalid.');
    if (!Number.isSafeInteger(version) || version < 1)
      throw makeHttpError(400, 'version must be a positive integer.');
    if (note && typeof note !== 'string')
      throw makeHttpError(400, 'note must be a string.');

    const design = await getDesignByOwner(id, request.shopper)
      .select('_id shop')
      .lean();
    if (!design) throw makeHttpError(404, 'Design not found.');

    const revision = await DesignRevision.findOneAndUpdate(
      {
        designId: design._id,
        shop:     design.shop,
        version,
        status:   'pending_review',
      },
      {
        $set: {
          status:     'changes_requested',
          changeNote: note ? String(note).slice(0, MAX_NOTE_LEN) : null,
        },
      },
      { new: true, runValidators: true },
    ).lean();

    if (!revision)
      throw makeHttpError(
        409,
        `Revision v${version} is not in 'pending_review' status or does not exist.`,
      );

    await Design.findByIdAndUpdate(design._id, { $set: { status: 'saved' } });

    return response.status(200).json({
      success: true,
      message: `Changes requested on revision v${version}.`,
      data: { revision },
    });
  } catch (error) {
    logError(`requestChanges: ${error.message}`);
    return next(error);
  }
};

/**
 * POST /api/designs/:id/revisions/:version/restore
 * Restores an older revision as a brand-new version (non-destructive).
 * Uses optimistic concurrency via expectedVersion.
 */
export const restoreDesignRevision = async (request, response, next) => {
  try {
    if (!isPlainObject(request.body))
      throw makeHttpError(400, 'Request body must be a JSON object.');

    const { id, version: versionParam } = request.params;
    const version         = Number(versionParam);
    const { expectedVersion, changeNote } = request.body;

    if (!mongoose.isValidObjectId(id))
      throw makeHttpError(400, 'Design ID is invalid.');
    if (!Number.isSafeInteger(version) || version < 1)
      throw makeHttpError(400, 'Revision version must be a positive integer.');
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
      throw makeHttpError(400, 'expectedVersion must be a positive integer.');

    let design;
    await runInTransaction(async (session) => {
      design = await getDesignByOwner(id, request.shopper).session(session);
      if (!design) throw makeHttpError(404, 'Design not found.');
      if (expectedVersion !== design.version)
        throw makeHttpError(
          409,
          `Design version conflict. Current version is ${design.version}.`,
        );

      const revision = await DesignRevision.findOne({
        designId: design._id,
        shop:     design.shop,
        version,
        productId: design.productId,
        productVariantId: design.productVariantId || null,
      }).session(session);
      if (!revision) throw makeHttpError(404, 'Revision not found.');

      design.productId   = revision.productId;
      design.productVariantId = revision.productVariantId || null;
      design.canvasState = revision.canvasState;
      design.markModified('canvasState');
      design.thumbnailUrl = revision.thumbnailUrl;
      design.status       = 'saved';
      design.version     += 1;
      await design.save({ session });

      await storeRevision(design, session, {
        changedBy: request.user?.role || 'merchant',
        changeNote: changeNote
          ? `Restored from v${version}: ${changeNote}`
          : `Restored from v${version}`,
      });
    });

    return response.status(200).json({
      success: true,
      message: `Restored revision v${version} as new version v${design.version}.`,
      data: { design: design.toJSON() },
    });
  } catch (error) {
    logError(`restoreDesignRevision: ${error.message}`);
    return next(error);
  }
};

/**
 * GET /api/designs/:id/revisions/:version/verify
 * Verifies that the stored fingerprint of a revision still matches the
 * canvasState in the database — detects any storage-layer tampering.
 */
export const verifyRevisionIntegrity = async (request, response, next) => {
  try {
    const { id, version: versionParam } = request.params;
    const version = Number(versionParam);

    if (!mongoose.isValidObjectId(id))
      throw makeHttpError(400, 'Design ID is invalid.');
    if (!Number.isSafeInteger(version) || version < 1)
      throw makeHttpError(400, 'version must be a positive integer.');

    const design = await getDesignByOwner(id, request.shopper)
      .select('_id shop productId productVariantId')
      .lean();
    if (!design) throw makeHttpError(404, 'Design not found.');

    const revision = await DesignRevision.findOne({
      designId: design._id,
      shop:     design.shop,
      version,
      productId: design.productId,
      productVariantId: design.productVariantId || null,
    }).lean();
    if (!revision) throw makeHttpError(404, 'Revision not found.');

    const recomputedFingerprint = computeFingerprint(revision.canvasState);
    const isIntact = recomputedFingerprint === revision.assetFingerprint;

    return response.status(200).json({
      success: true,
      data: {
        version,
        status:              revision.status,
        storedFingerprint:   revision.assetFingerprint,
        currentFingerprint:  recomputedFingerprint,
        isIntact,
        verifiedAt:          new Date().toISOString(),
        approvalMeta:        revision.approvalMeta ?? null,
      },
    });
  } catch (error) {
    logError(`verifyRevisionIntegrity: ${error.message}`);
    return next(error);
  }
};

// ── Internal Helpers ───────────────────────────────────────────────────────

/** Strip canvasState before returning a revision in comparison payloads */
const sanitizeRevision = (rev) => ({ ...rev, canvasState: rev.canvasState });

/**
 * Produces a lightweight structural diff between two canvasState objects.
 * Compares top-level keys and array lengths — not a pixel diff.
 * The UI uses this for highlighting which layers/objects changed.
 *
 * @param {object} stateA
 * @param {object} stateB
 * @returns {{ added: string[], removed: string[], changed: string[], unchanged: string[] }}
 */
const buildCanvasDiff = (stateA, stateB) => {
  if (!isPlainObject(stateA) || !isPlainObject(stateB)) {
    return { added: [], removed: [], changed: [], unchanged: [] };
  }

  const keysA = new Set(Object.keys(stateA));
  const keysB = new Set(Object.keys(stateB));

  const added     = [...keysB].filter((k) => !keysA.has(k));
  const removed   = [...keysA].filter((k) => !keysB.has(k));
  const shared    = [...keysA].filter((k) => keysB.has(k));
  const changed   = shared.filter((k) => {
    const a = stateA[k];
    const b = stateB[k];
    // Shallow compare — enough for overlay hints
    return JSON.stringify(a) !== JSON.stringify(b);
  });
  const unchanged = shared.filter((k) => !changed.includes(k));

  return { added, removed, changed, unchanged };
};

// Re-export storeRevision for use in design.controller.js (create/update flow)
export { storeRevision, computeFingerprint };
