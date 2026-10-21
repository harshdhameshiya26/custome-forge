/* eslint-env node */

import { Router } from 'express';
import {
  validateProductFeasibility,
  getProductConstraints,
  upsertProductConstraints,
} from '../controllers/feasibility.controller.js';
import { authenticateUser, requireVerifiedUser } from '../middleware/authenticate.js';

const router = Router();

/**
 * @route   POST /api/products/validate-feasibility
 * @desc    Validate product customization options, materials, dimensions, and placement
 *          against physical manufacturing constraints before checkout.
 * @access  Public (Storefront Customizer / Customer Checkout)
 * @payload JSON:
 *          - shopifyProductId / productId (String, required)
 *          - shopifyVariantId / variantId (String, optional)
 *          - shop (String, optional)
 *          - material (String, optional)
 *          - printMethod / technique (String, optional)
 *          - printDimensions: { widthMm, heightMm, bleedMm } (Object, optional)
 *          - placement: { x, y, widthMm, heightMm } (Object, optional)
 *          - options: Record<string, string> or Array<{ name, value }> (optional)
 *          - productColor / color (String, optional)
 *          - inkColor (String, optional)
 *          - finish (String, optional)
 *          - constraints (Object, optional override for direct Postman testing)
 */
router.post('/validate-feasibility', validateProductFeasibility);

/**
 * @route   GET /api/products/:productId/constraints
 * @desc    Get active manufacturing constraints and rules for a product
 * @access  Public / Storefront
 */
router.get('/:productId/constraints', getProductConstraints);

/**
 * @route   POST /api/products/constraints
 * @desc    Create or update manufacturing constraints for a product
 * @access  Merchant (requires verified user session)
 */
router.post('/constraints', authenticateUser, requireVerifiedUser, upsertProductConstraints);

export default router;
