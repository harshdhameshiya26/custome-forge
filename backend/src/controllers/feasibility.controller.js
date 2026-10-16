/* eslint-env node */

import prisma from '../config/prisma.js';
import {
  evaluateProductionFeasibility,
  DEFAULT_MANUFACTURING_CONSTRAINTS,
} from '../services/feasibilityChecker.js';
import ProductManufacturingConstraint from '../models/product-manufacturing-constraint.model.js';
import FeasibilityCheck from '../models/feasibility-check.model.js';
import { logError } from '../utils/logger.js';

/**
 * Validates a customer's customization configuration against manufacturing constraints.
 * Surfaces physical limits, unavailable materials, and incompatible options before checkout.
 *
 * @route POST /api/products/validate-feasibility
 */
export const validateProductFeasibility = async (req, res) => {
  try {
    const {
      shop,
      productId,
      shopifyProductId = productId,
      variantId,
      shopifyVariantId = variantId,
      designId,
      revisionId,
      constraints: explicitConstraints,
    } = req.body;

    if (!shopifyProductId) {
      return res.status(400).json({
        success: false,
        isFeasible: false,
        error: {
          code: 'MISSING_PRODUCT_ID',
          message: 'shopifyProductId or productId is required in request payload.',
          suggestion: 'Provide the target Shopify product identifier (e.g. "gid://shopify/Product/123456" or "123456").',
        },
      });
    }

    // -------------------------------------------------------------------------
    // 1. Fetch Manufacturing Constraints (Prisma -> Mongoose -> Explicit -> Defaults)
    // -------------------------------------------------------------------------
    let targetConstraints = { ...DEFAULT_MANUFACTURING_CONSTRAINTS };
    let constraintsSource = 'DEFAULT';

    if (explicitConstraints && typeof explicitConstraints === 'object') {
      targetConstraints = {
        ...targetConstraints,
        ...explicitConstraints,
      };
      constraintsSource = 'REQUEST_OVERRIDE';
    } else {
      // Query Prisma first
      if (prisma?.tbl_ProductManufacturingConstraint) {
        try {
          const query = {
            shopifyProductId: String(shopifyProductId),
            isActive: true,
            ...(shop ? { shop: String(shop) } : {}),
            ...(shopifyVariantId ? { shopifyVariantId: String(shopifyVariantId) } : {}),
          };

          const dbConfig = await prisma.tbl_ProductManufacturingConstraint.findFirst({
            where: query,
          });

          if (dbConfig) {
            targetConstraints = {
              maxPrintWidthMm: dbConfig.maxPrintWidthMm,
              maxPrintHeightMm: dbConfig.maxPrintHeightMm,
              minPrintWidthMm: dbConfig.minPrintWidthMm,
              minPrintHeightMm: dbConfig.minPrintHeightMm,
              maxBleedMm: dbConfig.maxBleedMm,
              allowedPlacementBounds: dbConfig.allowedPlacementBounds,
              availableMaterials: dbConfig.availableMaterials,
              restrictedMaterials: dbConfig.restrictedMaterials,
              incompatibleOptions: dbConfig.incompatibleOptions,
              restrictedMaterialColors: dbConfig.restrictedMaterialColors,
              allowedPrintMethods: dbConfig.allowedPrintMethods,
              methodConstraints: dbConfig.methodConstraints,
            };
            constraintsSource = 'DATABASE_PRISMA';
          }
        } catch (prismaError) {
          logError(`⚠️ Prisma manufacturing constraint query skipped: ${prismaError.message}`);
        }
      }

      // Secondary fallback to Mongoose if Prisma did not locate a record
      if (constraintsSource === 'DEFAULT') {
        try {
          const mgConfig = await ProductManufacturingConstraint.findOne({
            shopifyProductId: String(shopifyProductId),
            isActive: true,
            ...(shop ? { shop: String(shop) } : {}),
            ...(shopifyVariantId ? { shopifyVariantId: String(shopifyVariantId) } : {}),
          }).lean();

          if (mgConfig) {
            targetConstraints = {
              maxPrintWidthMm: mgConfig.maxPrintWidthMm,
              maxPrintHeightMm: mgConfig.maxPrintHeightMm,
              minPrintWidthMm: mgConfig.minPrintWidthMm,
              minPrintHeightMm: mgConfig.minPrintHeightMm,
              maxBleedMm: mgConfig.maxBleedMm,
              allowedPlacementBounds: mgConfig.allowedPlacementBounds,
              availableMaterials: mgConfig.availableMaterials,
              restrictedMaterials: mgConfig.restrictedMaterials,
              incompatibleOptions: mgConfig.incompatibleOptions,
              restrictedMaterialColors: mgConfig.restrictedMaterialColors,
              allowedPrintMethods: mgConfig.allowedPrintMethods,
              methodConstraints: mgConfig.methodConstraints,
            };
            constraintsSource = 'DATABASE_MONGOOSE';
          }
        } catch (mgError) {
          logError(`⚠️ Mongoose manufacturing constraint query skipped: ${mgError.message}`);
        }
      }
    }

    // -------------------------------------------------------------------------
    // 2. Execute Feasibility Evaluation
    // -------------------------------------------------------------------------
    const evaluation = evaluateProductionFeasibility(req.body, targetConstraints);

    // -------------------------------------------------------------------------
    // 3. Optional Audit Logging (Prisma or Mongoose)
    // -------------------------------------------------------------------------
    let recordedCheckId = null;
    const auditRecord = {
      shop: shop || null,
      shopifyProductId: String(shopifyProductId),
      shopifyVariantId: shopifyVariantId ? String(shopifyVariantId) : null,
      designId: designId || undefined,
      revisionId: revisionId || undefined,
      isFeasible: evaluation.isFeasible,
      status: evaluation.status,
      violations: evaluation.violations,
      warnings: evaluation.warnings,
      suggestedFixes: evaluation.suggestedFixes,
      validatedConfig: {
        material: req.body.material,
        printDimensions: req.body.printDimensions || req.body.dimensions,
        placement: req.body.placement || req.body.coordinates,
        options: req.body.options,
        printMethod: req.body.printMethod || req.body.technique,
      },
      executionTimeMs: evaluation.executionTimeMs,
    };

    if (prisma?.tbl_FeasibilityCheck) {
      try {
        const saved = await prisma.tbl_FeasibilityCheck.create({
          data: auditRecord,
        });
        recordedCheckId = saved.id;
      } catch (err) {
        logError(`⚠️ Prisma tbl_FeasibilityCheck audit log skipped: ${err.message}`);
      }
    }

    if (!recordedCheckId) {
      try {
        const mgSaved = await FeasibilityCheck.create(auditRecord);
        recordedCheckId = mgSaved._id?.toString();
      } catch (err) {
        logError(`⚠️ Mongoose FeasibilityCheck audit log skipped: ${err.message}`);
      }
    }

    // -------------------------------------------------------------------------
    // 4. Return Final Validation Response
    // -------------------------------------------------------------------------
    return res.status(200).json({
      success: true,
      checkId: recordedCheckId,
      isFeasible: evaluation.isFeasible,
      status: evaluation.status, // 'PASSED' | 'BLOCKED' | 'WARNED'
      summary: evaluation.summary,
      violationsCount: evaluation.violations.length,
      violations: evaluation.violations,
      warnings: evaluation.warnings,
      suggestedFixes: evaluation.suggestedFixes,
      ruleResults: evaluation.ruleResults,
      executionTimeMs: evaluation.executionTimeMs,
      appliedConstraints: {
        source: constraintsSource,
        ...evaluation.appliedConstraints,
      },
    });
  } catch (error) {
    logError(`❌ Production Feasibility Check Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      isFeasible: false,
      error: {
        code: 'FEASIBILITY_CHECK_ERROR',
        message: 'An internal error occurred while validating product feasibility.',
        details: error.message,
      },
    });
  }
};

/**
 * Get active manufacturing constraints for a product.
 *
 * @route GET /api/products/:productId/constraints
 */
export const getProductConstraints = async (req, res) => {
  try {
    const { productId } = req.params;
    const { shop, variantId } = req.query;

    let constraints = null;

    if (prisma?.tbl_ProductManufacturingConstraint) {
      try {
        constraints = await prisma.tbl_ProductManufacturingConstraint.findFirst({
          where: {
            shopifyProductId: String(productId),
            isActive: true,
            ...(shop ? { shop: String(shop) } : {}),
            ...(variantId ? { shopifyVariantId: String(variantId) } : {}),
          },
        });
      } catch (err) {
        logError(`⚠️ Prisma getProductConstraints error: ${err.message}`);
      }
    }

    if (!constraints) {
      try {
        constraints = await ProductManufacturingConstraint.findOne({
          shopifyProductId: String(productId),
          isActive: true,
          ...(shop ? { shop: String(shop) } : {}),
          ...(variantId ? { shopifyVariantId: String(variantId) } : {}),
        }).lean();
      } catch (err) {
        logError(`⚠️ Mongoose getProductConstraints error: ${err.message}`);
      }
    }

    if (!constraints) {
      return res.status(200).json({
        success: true,
        source: 'DEFAULT',
        message: 'No specific manufacturing constraints configured for this product. Default industry rules applied.',
        constraints: DEFAULT_MANUFACTURING_CONSTRAINTS,
      });
    }

    return res.status(200).json({
      success: true,
      source: 'DATABASE',
      constraints,
    });
  } catch (error) {
    logError(`❌ Get Product Constraints Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve product manufacturing constraints.',
      error: error.message,
    });
  }
};

/**
 * Configure / upsert manufacturing constraints for a product.
 *
 * @route POST /api/products/constraints
 */
export const upsertProductConstraints = async (req, res) => {
  try {
    const {
      shop,
      shopifyProductId,
      shopifyVariantId = null,
      maxPrintWidthMm,
      maxPrintHeightMm,
      minPrintWidthMm = 10.0,
      minPrintHeightMm = 10.0,
      maxBleedMm = 5.0,
      allowedPlacementBounds,
      availableMaterials = [],
      restrictedMaterials = [],
      incompatibleOptions = [],
      restrictedMaterialColors = [],
      allowedPrintMethods = ['DTG', 'SCREEN_PRINT'],
      methodConstraints,
      isActive = true,
    } = req.body;

    if (!shop || !shopifyProductId || !maxPrintWidthMm || !maxPrintHeightMm) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: shop, shopifyProductId, maxPrintWidthMm, and maxPrintHeightMm are required.',
      });
    }

    const payload = {
      shop,
      shopifyProductId: String(shopifyProductId),
      shopifyVariantId: shopifyVariantId ? String(shopifyVariantId) : null,
      maxPrintWidthMm: Number(maxPrintWidthMm),
      maxPrintHeightMm: Number(maxPrintHeightMm),
      minPrintWidthMm: Number(minPrintWidthMm),
      minPrintHeightMm: Number(minPrintHeightMm),
      maxBleedMm: Number(maxBleedMm),
      allowedPlacementBounds: allowedPlacementBounds || null,
      availableMaterials,
      restrictedMaterials,
      incompatibleOptions,
      restrictedMaterialColors,
      allowedPrintMethods,
      methodConstraints: methodConstraints || null,
      isActive: Boolean(isActive),
    };

    let result = null;

    if (prisma?.tbl_ProductManufacturingConstraint) {
      try {
        const existing = await prisma.tbl_ProductManufacturingConstraint.findFirst({
          where: {
            shop,
            shopifyProductId: String(shopifyProductId),
            shopifyVariantId: shopifyVariantId ? String(shopifyVariantId) : null,
          },
        });

        if (existing) {
          result = await prisma.tbl_ProductManufacturingConstraint.update({
            where: { id: existing.id },
            data: payload,
          });
        } else {
          result = await prisma.tbl_ProductManufacturingConstraint.create({
            data: payload,
          });
        }
      } catch (prismaErr) {
        logError(`⚠️ Prisma upsertProductConstraints error: ${prismaErr.message}`);
      }
    }

    if (!result) {
      try {
        result = await ProductManufacturingConstraint.findOneAndUpdate(
          {
            shop,
            shopifyProductId: String(shopifyProductId),
            shopifyVariantId: shopifyVariantId ? String(shopifyVariantId) : null,
          },
          payload,
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      } catch (mgErr) {
        logError(`⚠️ Mongoose upsertProductConstraints error: ${mgErr.message}`);
        throw mgErr;
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Product manufacturing constraints successfully saved.',
      constraints: result,
    });
  } catch (error) {
    logError(`❌ Upsert Product Constraints Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to configure manufacturing constraints.',
      error: error.message,
    });
  }
};

export default {
  validateProductFeasibility,
  getProductConstraints,
  upsertProductConstraints,
};
