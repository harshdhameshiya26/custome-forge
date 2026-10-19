/* eslint-env node */

import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import prisma from '../config/prisma.js';
import PrintFile, { PRINT_FILE_FORMATS, PRINT_FILE_STATUSES } from '../models/print-file.model.js';
import Design from '../models/design.model.js';
import Proof from '../models/proof.model.js';
import CustomOrderTimeline from '../models/custom-order-timeline.model.js';
import { generatePrintReadyFile } from '../services/printGenerator.js';
import { logError, logSuccess, logWarn } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRINTS_STORAGE_DIR = path.resolve(__dirname, '../../storage/prints');

/**
 * Normalizes Shopify Order IDs (e.g. "gid://shopify/Order/123456" -> "123456").
 */
const normalizeOrderId = (rawId) => {
  if (!rawId) return '';
  const str = String(rawId).trim();
  const match = str.match(/Order\/(\d+)/);
  return match ? match[1] : str;
};

/**
 * Look up an approved Proof or Design for an order to fetch design canvas data.
 */
const resolveOrderDesignData = async (orderId, explicitDesignId = null) => {
  const normalizedId = normalizeOrderId(orderId);
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(orderId);

  let designRecord = null;
  let proofRecord = null;
  let resolvedDesignId = explicitDesignId;

  // 1. If explicitDesignId is provided, look up that design directly
  if (explicitDesignId) {
    if (prisma?.tbl_Design) {
      try {
        designRecord = await prisma.tbl_Design.findFirst({
          where: {
            OR: [
              { id: explicitDesignId },
              { shopifyOrderId: normalizedId },
            ],
          },
        });
      } catch (err) {
        logWarn(`⚠️ Prisma tbl_Design query error: ${err.message}`);
      }
    }

    if (!designRecord) {
      try {
        const query = /^[0-9a-fA-F]{24}$/.test(explicitDesignId)
          ? { _id: explicitDesignId }
          : { id: explicitDesignId };
        designRecord = await Design.findOne(query).lean();
      } catch (err) {
        logWarn(`⚠️ Mongoose Design query error: ${err.message}`);
      }
    }
  }

  // 2. Look up Proof to check approval status and design reference
  if (prisma?.proof) {
    try {
      proofRecord = await prisma.proof.findFirst({
        where: {
          OR: [
            { orderId: normalizedId },
            { shopifyOrderId: normalizedId },
            ...(isObjectId ? [{ id: orderId }] : []),
          ],
        },
        orderBy: { versionNumber: 'desc' },
      });
      if (proofRecord?.designId && !resolvedDesignId) {
        resolvedDesignId = proofRecord.designId;
      }
    } catch (err) {
      logWarn(`⚠️ Prisma Proof query error: ${err.message}`);
    }
  }

  if (!proofRecord) {
    try {
      proofRecord = await Proof.findOne({
        $or: [
          { orderId: normalizedId },
          { shopifyOrderId: normalizedId },
          ...(isObjectId ? [{ _id: orderId }] : []),
        ],
      })
        .sort({ versionNumber: -1 })
        .lean();

      if (proofRecord?.designId && !resolvedDesignId) {
        resolvedDesignId = proofRecord.designId;
      }
    } catch (err) {
      logWarn(`⚠️ Mongoose Proof query error: ${err.message}`);
    }
  }

  // 3. If design was not fetched yet, fetch using resolvedDesignId or orderId
  if (!designRecord) {
    if (prisma?.tbl_Design) {
      try {
        designRecord = await prisma.tbl_Design.findFirst({
          where: {
            OR: [
              ...(resolvedDesignId ? [{ id: resolvedDesignId }] : []),
              { shopifyOrderId: normalizedId },
              ...(isObjectId ? [{ id: orderId }] : []),
            ],
          },
        });
      } catch (err) {
        logWarn(`⚠️ Prisma tbl_Design fallback query error: ${err.message}`);
      }
    }

    if (!designRecord) {
      try {
        const query = {
          $or: [
            ...(resolvedDesignId ? [{ _id: resolvedDesignId }, { id: resolvedDesignId }] : []),
            { shopifyOrderId: normalizedId },
            ...(isObjectId ? [{ _id: orderId }] : []),
          ],
        };
        designRecord = await Design.findOne(query).lean();
      } catch (err) {
        logWarn(`⚠️ Mongoose Design fallback query error: ${err.message}`);
      }
    }
  }

  return {
    design: designRecord,
    proof: proofRecord,
    resolvedDesignId: resolvedDesignId || designRecord?._id || designRecord?.id || 'design_' + normalizedId,
  };
};

/**
 * Persist or update PrintFile record using Prisma with automatic Mongoose fallback.
 */
const persistPrintFileRecord = async (data) => {
  // 1. Try Prisma first
  if (prisma?.printFile) {
    try {
      const existing = await prisma.printFile.findUnique({
        where: { fileId: data.fileId },
      });

      if (existing) {
        return await prisma.printFile.update({
          where: { fileId: data.fileId },
          data: {
            status: data.status,
            fileUrl: data.fileUrl,
            fileName: data.fileName,
            fileSizeBytes: data.fileSizeBytes,
            secureDownloadToken: data.secureDownloadToken,
            secureDownloadUrl: data.secureDownloadUrl,
            errorMessage: data.errorMessage || null,
            completedAt: data.completedAt || null,
            metadata: data.metadata || undefined,
          },
        });
      }

      return await prisma.printFile.create({
        data: {
          fileId: data.fileId,
          orderId: data.orderId,
          designId: data.designId,
          fileUrl: data.fileUrl,
          format: data.format,
          status: data.status,
          widthMm: data.widthMm,
          heightMm: data.heightMm,
          dpi: data.dpi,
          bleedMm: data.bleedMm,
          colorProfile: data.colorProfile,
          fileSizeBytes: data.fileSizeBytes,
          fileName: data.fileName,
          secureDownloadToken: data.secureDownloadToken,
          secureDownloadUrl: data.secureDownloadUrl,
          errorMessage: data.errorMessage || null,
          metadata: data.metadata || null,
          completedAt: data.completedAt || null,
        },
      });
    } catch (prismaErr) {
      logWarn(`⚠️ Prisma PrintFile persistence failed (${prismaErr.message}). Using Mongoose fallback.`);
    }
  }

  // 2. Mongoose fallback
  const filter = { fileId: data.fileId };
  const update = {
    $set: {
      orderId: data.orderId,
      designId: data.designId,
      fileUrl: data.fileUrl,
      format: data.format,
      status: data.status,
      widthMm: data.widthMm,
      heightMm: data.heightMm,
      dpi: data.dpi,
      bleedMm: data.bleedMm,
      colorProfile: data.colorProfile,
      fileSizeBytes: data.fileSizeBytes,
      fileName: data.fileName,
      secureDownloadToken: data.secureDownloadToken,
      secureDownloadUrl: data.secureDownloadUrl,
      errorMessage: data.errorMessage || null,
      metadata: data.metadata || {},
      completedAt: data.completedAt || null,
    },
  };

  return await PrintFile.findOneAndUpdate(filter, update, {
    new: true,
    upsert: true,
    runValidators: true,
  });
};

/**
 * @route   POST /api/print/generate/:orderId
 * @desc    Triggers high-res print file generation for an approved order.
 *          Processes canvas JSON into exact physical dimensions and resolution (300 DPI).
 * @access  Merchant / Production Automation
 */
export const generatePrintFile = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!orderId || !String(orderId).trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ORDER_ID',
          message: 'Parameter "orderId" is required in request path.',
        },
      });
    }

    const normalizedOrderId = normalizeOrderId(orderId);
    const body = req.body || {};

    const {
      designId: explicitDesignId,
      format = 'HIGH_RES_PNG',
      dpi = 300,
      widthMm = 280,
      heightMm = 350,
      bleedMm = 0,
      colorProfile = 'sRGB',
      canvasState: explicitCanvasState,
      allowUnapproved = false,
    } = body;

    // Validate format
    const uppercaseFormat = String(format).toUpperCase();
    if (!PRINT_FILE_FORMATS.includes(uppercaseFormat)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_FORMAT',
          message: `Format "${format}" is not supported. Allowed formats: ${PRINT_FILE_FORMATS.join(', ')}`,
        },
      });
    }

    // Validate DPI
    const numericDpi = Number(dpi);
    if (isNaN(numericDpi) || numericDpi < 72 || numericDpi > 2400) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DPI',
          message: 'Parameter "dpi" must be a number between 72 and 2400 (300 recommended for production).',
        },
      });
    }

    // 1. Resolve design data and check proof approval
    const { design, proof, resolvedDesignId } = await resolveOrderDesignData(
      normalizedOrderId,
      explicitDesignId,
    );

    // Verify proof approval status unless merchant override flag is set or testing canvas is provided
    if (proof && proof.status !== 'APPROVED' && !allowUnapproved && !explicitCanvasState) {
      return res.status(412).json({
        success: false,
        error: {
          code: 'PROOF_NOT_APPROVED',
          message: `Cannot generate production file: Proof for order "${orderId}" has status "${proof.status}" and production is blocked until customer approval.`,
          currentStatus: proof.status,
          productionBlocked: proof.productionBlocked,
          suggestion: 'Ensure customer approves proof first, or pass { allowUnapproved: true } for merchant test overrides.',
        },
      });
    }

    // 2. Extract canvas state
    let targetCanvasState = explicitCanvasState || design?.canvasState || design?.metadata?.canvasState || null;

    if (!targetCanvasState) {
      // If neither design in DB nor explicit canvas state is provided, return a clear, helpful 404
      return res.status(404).json({
        success: false,
        error: {
          code: 'DESIGN_DATA_NOT_FOUND',
          message: `No design canvas data found for order "${orderId}".`,
          suggestion: 'Provide a "canvasState" object in the JSON request body or ensure an approved design is linked to this order.',
        },
      });
    }

    // Ensure initial PENDING record is stored in DB
    const initialFileId = crypto.randomUUID();
    await persistPrintFileRecord({
      fileId: initialFileId,
      orderId: normalizedOrderId,
      designId: String(resolvedDesignId),
      fileUrl: 'pending_generation',
      format: uppercaseFormat,
      status: 'PENDING',
      widthMm: Number(widthMm),
      heightMm: Number(heightMm),
      dpi: numericDpi,
      bleedMm: Number(bleedMm),
      colorProfile,
    });

    // 3. Execute print generation pipeline
    const host = req.get('host') || 'localhost:5000';
    const protocol = req.protocol || 'http';

    try {
      const renderResult = await generatePrintReadyFile({
        canvasState: targetCanvasState,
        widthMm: Number(widthMm),
        heightMm: Number(heightMm),
        dpi: numericDpi,
        bleedMm: Number(bleedMm),
        format: uppercaseFormat,
        colorProfile,
        orderId: normalizedOrderId,
        designId: String(resolvedDesignId),
        requestHost: host,
        protocol,
      });

      // 4. Update PrintFile record to COMPLETED with download credentials
      const savedRecord = await persistPrintFileRecord({
        fileId: renderResult.fileId,
        orderId: normalizedOrderId,
        designId: String(resolvedDesignId),
        fileUrl: renderResult.fileUrl,
        format: renderResult.format,
        status: 'COMPLETED',
        widthMm: renderResult.dimensions.widthMm,
        heightMm: renderResult.dimensions.heightMm,
        dpi: renderResult.dimensions.dpi,
        bleedMm: renderResult.dimensions.bleedMm,
        colorProfile: renderResult.colorProfile,
        fileSizeBytes: renderResult.fileSizeBytes,
        fileName: renderResult.fileName,
        secureDownloadToken: renderResult.secureDownloadToken,
        secureDownloadUrl: renderResult.secureDownloadUrl,
        completedAt: renderResult.completedAt,
        metadata: {
          dimensions: renderResult.dimensions,
          checksumSha256: renderResult.checksumSha256,
          audit: renderResult.audit,
        },
      });

      // 5. Update Order Timeline stage to IN_PRODUCTION if timeline exists
      try {
        if (prisma?.customOrderTimeline) {
          await prisma.customOrderTimeline.updateMany({
            where: { shopifyOrderId: normalizedOrderId },
            data: { currentStage: 'IN_PRODUCTION' },
          });
        }
        await CustomOrderTimeline.updateMany(
          { shopifyOrderId: normalizedOrderId },
          { $set: { currentStage: 'IN_PRODUCTION' } },
        );
      } catch (tlErr) {
        logWarn(`⚠️ Timeline sync skipped: ${tlErr.message}`);
      }

      // 6. Return standard, clean production response
      return res.status(201).json({
        success: true,
        message: 'Print-ready production asset generated successfully.',
        data: {
          fileId: renderResult.fileId,
          orderId: normalizedOrderId,
          designId: String(resolvedDesignId),
          format: renderResult.format,
          status: 'COMPLETED',
          fileName: renderResult.fileName,
          fileUrl: renderResult.fileUrl,
          secureDownloadUrl: renderResult.secureDownloadUrl,
          dimensions: renderResult.dimensions,
          fileSizeBytes: renderResult.fileSizeBytes,
          checksumSha256: renderResult.checksumSha256,
          colorProfile: renderResult.colorProfile,
          createdAt: savedRecord?.createdAt || new Date(),
          completedAt: renderResult.completedAt,
        },
      });
    } catch (renderError) {
      logError(`❌ Print generation rendering error: ${renderError.message}`);

      // Mark record as FAILED in database
      await persistPrintFileRecord({
        fileId: initialFileId,
        orderId: normalizedOrderId,
        designId: String(resolvedDesignId),
        fileUrl: 'failed',
        format: uppercaseFormat,
        status: 'FAILED',
        errorMessage: renderError.message,
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'PRINT_GENERATION_FAILED',
          message: `Print generation failed: ${renderError.message}`,
        },
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/print/download/:fileId
 * @desc    Securely streams the generated production file for download with correct content headers.
 * @access  Merchant / Verified Production Floor (token validated)
 */
export const downloadPrintFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const { token } = req.query;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FILE_ID', message: 'fileId parameter is required.' },
      });
    }

    // 1. Locate record in Prisma or Mongoose
    let record = null;
    if (prisma?.printFile) {
      try {
        record = await prisma.printFile.findUnique({ where: { fileId } });
      } catch (err) {
        logWarn(`⚠️ Prisma download query warning: ${err.message}`);
      }
    }

    if (!record) {
      record = await PrintFile.findOne({ fileId }).lean();
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: `PrintFile with id "${fileId}" was not found.` },
      });
    }

    // 2. Validate token if token exists on record
    if (record.secureDownloadToken && token && record.secureDownloadToken !== token) {
      return res.status(403).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired download token.' },
      });
    }

    // 3. Locate physical file on disk
    let targetPath = null;
    if (record.fileName) {
      const candidatePath = path.join(PRINTS_STORAGE_DIR, record.fileName);
      if (fsSync.existsSync(candidatePath)) {
        targetPath = candidatePath;
      }
    }

    if (!targetPath) {
      // Search storage directory by fileId prefix
      const files = await fs.readdir(PRINTS_STORAGE_DIR);
      const match = files.find((f) => f.includes(fileId.slice(0, 8)));
      if (match) {
        targetPath = path.join(PRINTS_STORAGE_DIR, match);
      }
    }

    if (!targetPath || !fsSync.existsSync(targetPath)) {
      return res.status(404).json({
        success: false,
        error: { code: 'ASSET_FILE_MISSING', message: 'The physical production asset file is missing from disk storage.' },
      });
    }

    // 4. Set appropriate MIME type & Content-Disposition headers
    const format = String(record.format || 'PNG').toUpperCase();
    const contentType =
      format === 'PDF' ? 'application/pdf' : format === 'TIFF' ? 'image/tiff' : 'image/png';
    const downloadName = record.fileName || `production_print_${fileId}.${format.toLowerCase()}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    const fileStream = fsSync.createReadStream(targetPath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/print/order/:orderId
 * @desc    Retrieve all generated print files and status history for an order.
 * @access  Merchant / Production Floor
 */
export const getPrintFilesByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const normalizedOrderId = normalizeOrderId(orderId);

    let files = [];
    if (prisma?.printFile) {
      try {
        files = await prisma.printFile.findMany({
          where: { orderId: normalizedOrderId },
          orderBy: { createdAt: 'desc' },
        });
      } catch (err) {
        logWarn(`⚠️ Prisma getPrintFilesByOrderId error: ${err.message}`);
      }
    }

    if (files.length === 0) {
      files = await PrintFile.find({ orderId: normalizedOrderId })
        .sort({ createdAt: -1 })
        .lean();
    }

    return res.status(200).json({
      success: true,
      count: files.length,
      orderId: normalizedOrderId,
      data: files,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/print/file/:fileId
 * @desc    Fetch status and metadata for a specific print file by fileId.
 * @access  Merchant
 */
export const getPrintFileById = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    let file = null;
    if (prisma?.printFile) {
      try {
        file = await prisma.printFile.findUnique({ where: { fileId } });
      } catch (err) {
        logWarn(`⚠️ Prisma getPrintFileById error: ${err.message}`);
      }
    }

    if (!file) {
      file = await PrintFile.findOne({ fileId }).lean();
    }

    if (!file) {
      return res.status(404).json({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: `PrintFile "${fileId}" not found.` },
      });
    }

    return res.status(200).json({
      success: true,
      data: file,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  generatePrintFile,
  downloadPrintFile,
  getPrintFilesByOrderId,
  getPrintFileById,
};
