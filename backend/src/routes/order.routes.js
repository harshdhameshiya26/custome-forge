/* eslint-env node */

import { Router } from 'express';
import {
  getOrderTimeline,
  updateOrderTimelineStage,
} from '../controllers/order.controller.js';
import { triggerOrderHandoff } from '../controllers/handoff.controller.js';

const router = Router();

/**
 * @route   GET /api/orders/timeline/:orderId
 * @desc    Fetch complete stage history, current status, and progress metrics for a custom order
 * @access  Public / Storefront Customer Portal
 * @param   orderId - Shopify Order ID (numeric or GID) or MongoDB record ID
 */
router.get('/timeline/:orderId', getOrderTimeline);

/**
 * @route   PATCH /api/orders/timeline/:orderId/stage
 * @desc    Update and advance an order's status stage, recording a new entry into history
 * @access  Merchant / Production floor / Automated webhooks
 * @param   orderId - Shopify Order ID or MongoDB record ID
 * @body    JSON:
 *          - stage: (Enum, required) "DESIGN_RECEIVED" | "PROOF_READY" | "APPROVED" | "IN_PRODUCTION" | "SHIPPED"
 *          - message: (String, optional custom message override)
 *          - metadata: (Object, optional tracking number, carrier, proof URL, etc.)
 */
router.patch('/timeline/:orderId/stage', updateOrderTimelineStage);

/**
 * @route   POST /api/orders/handoff/:orderId
 * @desc    Trigger automated production handoff: evaluates routing rules by productType, material,
 *          and customizationType, assigns destination queue/supplier, and applies workflow tags.
 * @access  Merchant / Production floor / Automated webhooks
 */
router.post('/handoff/:orderId', triggerOrderHandoff);

export default router;
