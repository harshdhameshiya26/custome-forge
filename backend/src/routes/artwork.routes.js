/* eslint-env node */

import { Router } from 'express';
import { uploadArtworkMiddleware } from '../middleware/upload.middleware.js';
import {
  checkArtworkQuality,
  getProductPrintSpecs,
  upsertProductPrintSpecs,
} from '../controllers/artwork.controller.js';

const router = Router();

/**
 * @route   POST /api/artwork/check
 * @route   POST /api/artwork/validate
 * @desc    Validate uploaded artwork quality against product print area specs before checkout
 * @access  Public (Storefront Customizer / Customer Upload)
 * @body    multipart/form-data:
 *          - image / file / artwork (File, required)
 *          - shop (String, optional)
 *          - productId / shopifyProductId (String, optional)
 *          - variantId / shopifyVariantId (String, optional)
 *          - printAreaName (String, optional, default: "default")
 *          - minDpi (Number, optional override)
 *          - recommendedDpi (Number, optional override)
 *          - printAreaWidthMm (Number, optional override)
 *          - printAreaHeightMm (Number, optional override)
 *          - blurThreshold (Number, optional override)
 *          - aspectRatioTolerance (Number, optional override)
 */
router.post('/check', uploadArtworkMiddleware, checkArtworkQuality);
router.post('/validate', uploadArtworkMiddleware, checkArtworkQuality);
router.post('/upload-and-check', uploadArtworkMiddleware, checkArtworkQuality);

/**
 * @route   GET /api/artwork/specs/:productId
 * @desc    Get print-area requirements and specs for a specific product
 * @access  Public / Storefront
 */
router.get('/specs/:productId', getProductPrintSpecs);

/**
 * @route   POST /api/artwork/specs
 * @desc    Configure/upsert print-area requirements for a product
 * @access  Merchant / Admin
 */
router.post('/specs', upsertProductPrintSpecs);

export default router;
