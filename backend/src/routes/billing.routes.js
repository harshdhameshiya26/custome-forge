/* eslint-env node */

import express from 'express';
import {
  createSubscription,
  handleBillingCallback,
  cancelSubscription,
  getBillingStatus,
} from '../controllers/billing.controller.js';
import { authenticateUser, requireVerifiedUser } from '../middleware/authenticate.js';

const router = express.Router();

/**
 * Feature: Shopify Billing API Integration
 *
 * Route Definitions:
 *
 * 1. POST /api/billing/create
 *    Initiates appSubscriptionCreate GraphQL mutation.
 *    Returns confirmationUrl for merchant approval.
 *
 * 2. GET /api/billing/callback
 *    Return redirect from Shopify after charge approval/decline.
 *    Verifies charge status via GraphQL and activates subscription.
 *
 * 3. POST /api/billing/cancel
 *    Executes appSubscriptionCancel GraphQL mutation.
 *    Marks merchant subscription CANCELLED in DB.
 *
 * 4. GET /api/billing/status
 *    Inspects current merchant subscription plan, expiration, and active status.
 */

// All billing routes require a verified user session linked to the shop
router.use(authenticateUser, requireVerifiedUser);

router.post('/create', createSubscription);
router.get('/callback', handleBillingCallback);
router.post('/cancel', cancelSubscription);
router.get('/status', getBillingStatus);

export default router;
