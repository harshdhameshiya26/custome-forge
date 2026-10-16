import prisma from '../config/prisma.js';
import { validateArtworkQuality, DEFAULT_PRINT_REQUIREMENTS } from '../services/artworkValidator.js';
import { logError } from '../utils/logger.js';
import ProductCustomizationConfig from '../models/product-customization-config.model.js';
import ArtworkCheck from '../models/artwork-check.model.js';

/**
 * Controller for validating artwork quality against print-area requirements.
 * Surfaces issues and suggested fixes at upload time before checkout.
 */
export const checkArtworkQuality = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        passed: false,
        error: {
          code: 'MISSING_FILE',
          message: 'No image file was uploaded. Send an image in form-data field "image", "file", or "artwork".',
          suggestion: 'Attach an image file (PNG, JPEG, WebP, or TIFF) in your multipart/form-data request.',
        },
      });
    }

    const {
      shop,
      productId,
      shopifyProductId = productId,
      variantId,
      shopifyVariantId = variantId,
      printAreaName = 'default',
      designId,
      revisionId,
    } = req.body;

    // -------------------------------------------------------------------------
    // 1. Fetch Print Requirements from Prisma (or fallback to body overrides/defaults)
    // -------------------------------------------------------------------------
    let targetSpecs = { ...DEFAULT_PRINT_REQUIREMENTS };
    let specsSource = 'DEFAULT';

    if (shopifyProductId && prisma?.tbl_ProductCustomizationConfig) {
      try {
        const queryFilter = {
          shopifyProductId: String(shopifyProductId),
          ...(shop ? { shop: String(shop) } : {}),
          ...(shopifyVariantId ? { shopifyVariantId: String(shopifyVariantId) } : {}),
        };

        const config = await prisma.tbl_ProductCustomizationConfig.findFirst({
          where: queryFilter,
        });

        if (config) {
          targetSpecs = {
            printAreaName: config.printAreaName || printAreaName,
            printAreaWidthMm: config.printAreaWidthMm,
            printAreaHeightMm: config.printAreaHeightMm,
            printAreaWidthPx: config.printAreaWidthPx,
            printAreaHeightPx: config.printAreaHeightPx,
            minWidthPx: config.minWidthPx,
            minHeightPx: config.minHeightPx,
            minDpi: config.minDpi,
            recommendedDpi: config.recommendedDpi,
            maxDpi: config.maxDpi || 1200,
            blurThreshold: config.blurThreshold || 90.0,
            aspectRatioTolerance: config.aspectRatioTolerance || 0.05,
            allowedFormats: config.allowedFormats || DEFAULT_PRINT_REQUIREMENTS.allowedFormats,
            allowedColorModes: config.allowedColorModes || DEFAULT_PRINT_REQUIREMENTS.allowedColorModes,
          };
          specsSource = 'DATABASE';
        }
      } catch (dbError) {
        logError(`⚠️ Warning: Failed to query tbl_ProductCustomizationConfig via Prisma: ${dbError.message}`);
      }
    }

    // Secondary fallback: query via Mongoose if Prisma was unavailable or yielded nothing
    if (specsSource === 'DEFAULT' && shopifyProductId) {
      try {
        const mgConfig = await ProductCustomizationConfig.findOne({
          shopifyProductId: String(shopifyProductId),
          ...(shop ? { shop: String(shop) } : {}),
          ...(shopifyVariantId ? { shopifyVariantId: String(shopifyVariantId) } : {}),
        }).lean();

        if (mgConfig) {
          targetSpecs = {
            printAreaName: mgConfig.printAreaName || printAreaName,
            printAreaWidthMm: mgConfig.printAreaWidthMm,
            printAreaHeightMm: mgConfig.printAreaHeightMm,
            printAreaWidthPx: mgConfig.printAreaWidthPx,
            printAreaHeightPx: mgConfig.printAreaHeightPx,
            minWidthPx: mgConfig.minWidthPx,
            minHeightPx: mgConfig.minHeightPx,
            minDpi: mgConfig.minDpi,
            recommendedDpi: mgConfig.recommendedDpi,
            maxDpi: mgConfig.maxDpi || 1200,
            blurThreshold: mgConfig.blurThreshold || 90.0,
            aspectRatioTolerance: mgConfig.aspectRatioTolerance || 0.05,
            allowedFormats: mgConfig.allowedFormats || DEFAULT_PRINT_REQUIREMENTS.allowedFormats,
            allowedColorModes: mgConfig.allowedColorModes || DEFAULT_PRINT_REQUIREMENTS.allowedColorModes,
          };
          specsSource = 'DATABASE';
        }
      } catch (mgError) {
        logError(`⚠️ Warning: Failed to query ProductCustomizationConfig via Mongoose: ${mgError.message}`);
      }
    }

    // Allow explicit request body overrides (useful for testing in Postman or dynamic customizer zones)
    if (req.body.printAreaWidthMm) targetSpecs.printAreaWidthMm = Number(req.body.printAreaWidthMm);
    if (req.body.printAreaHeightMm) targetSpecs.printAreaHeightMm = Number(req.body.printAreaHeightMm);
    if (req.body.minDpi) targetSpecs.minDpi = Number(req.body.minDpi);
    if (req.body.recommendedDpi) targetSpecs.recommendedDpi = Number(req.body.recommendedDpi);
    if (req.body.blurThreshold) targetSpecs.blurThreshold = Number(req.body.blurThreshold);
    if (req.body.aspectRatioTolerance) targetSpecs.aspectRatioTolerance = Number(req.body.aspectRatioTolerance);
    if (req.body.minWidthPx) targetSpecs.minWidthPx = Number(req.body.minWidthPx);
    if (req.body.minHeightPx) targetSpecs.minHeightPx = Number(req.body.minHeightPx);

    // -------------------------------------------------------------------------
    // 2. Perform Sharp Image Validation
    // -------------------------------------------------------------------------
    const validationResult = await validateArtworkQuality(
      req.file.buffer,
      targetSpecs,
      {
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    );

    // -------------------------------------------------------------------------
    // 3. Optional Audit Record Logging in Prisma or Mongoose
    // -------------------------------------------------------------------------
    let recordedCheckId = null;
    const auditPayload = {
      shop: shop || null,
      shopifyProductId: shopifyProductId ? String(shopifyProductId) : null,
      shopifyVariantId: shopifyVariantId ? String(shopifyVariantId) : null,
      printAreaName: targetSpecs.printAreaName || 'default',
      designId: designId || undefined,
      revisionId: revisionId || undefined,
      fileName: req.file.originalname,
      fileSizeBytes: req.file.size,
      mimeType: req.file.mimetype,
      status: validationResult.status,
      overallQualityScore: validationResult.overallQualityScore,
      resolutionDpi: validationResult.imageMetadata.effectiveDpi,
      effectiveDpi: validationResult.imageMetadata.effectiveDpi,
      widthPx: validationResult.imageMetadata.widthPx,
      heightPx: validationResult.imageMetadata.heightPx,
      aspectRatio: validationResult.imageMetadata.aspectRatio,
      blurScore: validationResult.imageMetadata.sharpnessScore,
      isBlurry: validationResult.checks.sharpness.isBlurry,
      colorMode: validationResult.imageMetadata.colorSpace,
      fileFormat: validationResult.imageMetadata.format,
      issues: validationResult.issues,
      warnings: validationResult.warnings,
      suggestedFixes: validationResult.suggestedFixes,
      requiredDpi: targetSpecs.recommendedDpi,
      requiredMinDpi: targetSpecs.minDpi,
      requiredWidthPx: validationResult.printAreaRequirements.minRequiredWidthPx,
      requiredHeightPx: validationResult.printAreaRequirements.minRequiredHeightPx,
      targetAspectRatio: validationResult.printAreaRequirements.targetAspectRatio,
      aspectRatioTolerance: targetSpecs.aspectRatioTolerance,
    };

    if (prisma?.tbl_ArtworkCheck) {
      try {
        const checkRecord = await prisma.tbl_ArtworkCheck.create({
          data: auditPayload,
        });
        recordedCheckId = checkRecord.id;
      } catch (recordError) {
        logError(`⚠️ Prisma tbl_ArtworkCheck log skipped: ${recordError.message}`);
      }
    }

    if (!recordedCheckId) {
      try {
        const mgRecord = await ArtworkCheck.create(auditPayload);
        recordedCheckId = mgRecord._id?.toString();
      } catch (mgRecordError) {
        // Safe logging without interrupting HTTP response
        logError(`⚠️ Mongoose ArtworkCheck log skipped: ${mgRecordError.message}`);
      }
    }

    // -------------------------------------------------------------------------
    // 4. Return Full Quality Report
    // -------------------------------------------------------------------------
    return res.status(200).json({
      success: true,
      checkId: recordedCheckId,
      passed: validationResult.passed,
      status: validationResult.status, // 'PASSED' | 'WARNED' | 'FAILED'
      overallQualityScore: validationResult.overallQualityScore, // 0 - 100
      summary: validationResult.summary,
      warnings: validationResult.warnings,
      suggestedFixes: validationResult.suggestedFixes,
      issues: validationResult.issues,
      checks: validationResult.checks,
      imageMetadata: validationResult.imageMetadata,
      printAreaRequirements: {
        ...validationResult.printAreaRequirements,
        source: specsSource,
      },
    });
  } catch (error) {
    logError(`❌ Artwork Quality Check Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      passed: false,
      error: {
        code: 'ARTWORK_ANALYSIS_ERROR',
        message: 'An error occurred while analyzing the artwork file.',
        details: error.message,
      },
    });
  }
};

/**
 * Get configured print-area requirements for a product.
 */
export const getProductPrintSpecs = async (req, res) => {
  try {
    const { productId } = req.params;
    const { shop, variantId, printAreaName = 'default' } = req.query;

    let config = null;

    if (prisma?.tbl_ProductCustomizationConfig) {
      try {
        config = await prisma.tbl_ProductCustomizationConfig.findFirst({
          where: {
            shopifyProductId: String(productId),
            ...(shop ? { shop: String(shop) } : {}),
            ...(variantId ? { shopifyVariantId: String(variantId) } : {}),
            ...(printAreaName ? { printAreaName: String(printAreaName) } : {}),
          },
        });
      } catch (prismaError) {
        logError(`⚠️ Prisma getProductPrintSpecs error: ${prismaError.message}`);
      }
    }

    if (!config) {
      try {
        config = await ProductCustomizationConfig.findOne({
          shopifyProductId: String(productId),
          ...(shop ? { shop: String(shop) } : {}),
          ...(variantId ? { shopifyVariantId: String(variantId) } : {}),
          ...(printAreaName ? { printAreaName: String(printAreaName) } : {}),
        }).lean();
      } catch (mgError) {
        logError(`⚠️ Mongoose getProductPrintSpecs error: ${mgError.message}`);
      }
    }

    if (!config) {
      return res.status(200).json({
        success: true,
        source: 'DEFAULT',
        message: 'No custom print area found for this product. Default print requirements applied.',
        specs: DEFAULT_PRINT_REQUIREMENTS,
      });
    }

    return res.status(200).json({
      success: true,
      source: 'DATABASE',
      specs: config,
    });
  } catch (error) {
    logError(`❌ Get Product Print Specs Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch product print specs',
      error: error.message,
    });
  }
};

/**
 * Create or update product print-area specifications in Prisma or Mongoose.
 */
export const upsertProductPrintSpecs = async (req, res) => {
  try {
    const {
      shop,
      shopifyProductId,
      shopifyVariantId = null,
      printAreaName = 'default',
      printAreaWidthMm,
      printAreaHeightMm,
      printAreaWidthPx,
      printAreaHeightPx,
      minWidthPx,
      minHeightPx,
      minDpi = 150,
      recommendedDpi = 300,
      maxDpi = 1200,
      blurThreshold = 90.0,
      aspectRatioTolerance = 0.05,
      allowedFormats = ['png', 'jpeg', 'jpg', 'webp', 'tiff'],
      allowedColorModes = ['rgb', 'srgb', 'cmyk'],
      productionFormat = 'PDF',
      productionWidthMm,
      productionHeightMm,
      bleedMm = 3.0,
    } = req.body;

    if (!shop || !shopifyProductId || !printAreaWidthMm || !printAreaHeightMm) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: shop, shopifyProductId, printAreaWidthMm, and printAreaHeightMm are required.',
      });
    }

    // Calculate pixel dimensions if omitted
    const calculatedWidthPx = printAreaWidthPx || Math.ceil((printAreaWidthMm / 25.4) * recommendedDpi);
    const calculatedHeightPx = printAreaHeightPx || Math.ceil((printAreaHeightMm / 25.4) * recommendedDpi);

    const dataPayload = {
      shop,
      shopifyProductId: String(shopifyProductId),
      shopifyVariantId: shopifyVariantId ? String(shopifyVariantId) : null,
      printAreaName,
      printAreaWidthMm: Number(printAreaWidthMm),
      printAreaHeightMm: Number(printAreaHeightMm),
      printAreaWidthPx: calculatedWidthPx,
      printAreaHeightPx: calculatedHeightPx,
      minWidthPx: minWidthPx ? Number(minWidthPx) : null,
      minHeightPx: minHeightPx ? Number(minHeightPx) : null,
      minDpi: Number(minDpi),
      recommendedDpi: Number(recommendedDpi),
      maxDpi: Number(maxDpi),
      blurThreshold: Number(blurThreshold),
      aspectRatioTolerance: Number(aspectRatioTolerance),
      allowedFormats,
      allowedColorModes,
      productionFormat,
      productionWidthMm: Number(productionWidthMm || printAreaWidthMm),
      productionHeightMm: Number(productionHeightMm || printAreaHeightMm),
      bleedMm: Number(bleedMm),
    };

    let result = null;

    if (prisma?.tbl_ProductCustomizationConfig) {
      try {
        const existingConfig = await prisma.tbl_ProductCustomizationConfig.findFirst({
          where: {
            shop,
            shopifyProductId: String(shopifyProductId),
            shopifyVariantId: shopifyVariantId ? String(shopifyVariantId) : null,
            printAreaName,
          },
        });

        if (existingConfig) {
          result = await prisma.tbl_ProductCustomizationConfig.update({
            where: { id: existingConfig.id },
            data: dataPayload,
          });
        } else {
          result = await prisma.tbl_ProductCustomizationConfig.create({
            data: dataPayload,
          });
        }
      } catch (prismaError) {
        logError(`⚠️ Prisma upsertProductPrintSpecs failed: ${prismaError.message}`);
      }
    }

    if (!result) {
      try {
        result = await ProductCustomizationConfig.findOneAndUpdate(
          {
            shop,
            shopifyProductId: String(shopifyProductId),
            shopifyVariantId: shopifyVariantId ? String(shopifyVariantId) : null,
            printAreaName,
          },
          dataPayload,
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      } catch (mgError) {
        logError(`⚠️ Mongoose upsertProductPrintSpecs failed: ${mgError.message}`);
        throw mgError;
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Product customization and print area specs saved successfully.',
      config: result,
    });
  } catch (error) {
    logError(`❌ Upsert Product Print Specs Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to save product print specs',
      error: error.message,
    });
  }
};

export default {
  checkArtworkQuality,
  getProductPrintSpecs,
  upsertProductPrintSpecs,
};
