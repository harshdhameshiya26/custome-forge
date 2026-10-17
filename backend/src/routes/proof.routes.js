/* eslint-env node */

import express from 'express';
import {
  generateProof,
  getProofBySecureToken,
  submitProofResponse,
  getProofsByOrderId,
} from '../controllers/proof.controller.js';

const router = express.Router();

/**
 * Feature Name: "Proof Approval Before Production"
 *
 * Route Definitions:
 *
 * 1. POST /api/proofs/generate
 *    Merchant endpoint to generate and assign a new proof record to an order.
 *    - Automatically calculates the next versionNumber.
 *    - Generates a cryptographically secure, unguessable secureToken for customer access.
 *    - Strictly sets productionBlocked: true until explicit customer approval.
 *
 * 2. GET /api/proofs/secure/:secureToken
 *    Customer endpoint to view proof details and current status securely without authentication.
 *
 * 3. PATCH /api/proofs/:proofId/response
 *    Customer or merchant endpoint to submit an approval ("APPROVED") or revision request ("CHANGES_REQUESTED").
 *    - Enforces conflict check on already-approved proofs.
 *    - Requires feedback comment when requesting revisions.
 *    - Unblocks production (productionBlocked: false) ONLY on explicit approval.
 *
 * 4. GET /api/proofs/order/:orderId
 *    Audit endpoint to view all proof versions and check if production is cleared or blocked for an order.
 */

// Generate new proof for an order (Merchant)
router.post('/generate', generateProof);

// Unauthenticated secure link for customer proof inspection
router.get('/secure/:secureToken', getProofBySecureToken);

// Customer or merchant approval / revision request submission
router.patch('/:proofId/response', submitProofResponse);

// Retrieve all proofs & manufacturing clearance status for an order
router.get('/order/:orderId', getProofsByOrderId);

export default router;
