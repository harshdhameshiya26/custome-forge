/* eslint-env node */

import express from 'express';
import {
  generateProof,
  getProofBySecureToken,
  submitProofResponse,
  getProofsByOrderId,
  requestProofApprovalOtp,
  sendProofLink,
} from '../controllers/proof.controller.js';
import { authenticateUser, requireVerifiedUser } from '../middleware/authenticate.js';

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

// Generate new proof for an order (Merchant — requires auth)
router.post('/generate', authenticateUser, requireVerifiedUser, generateProof);

// Unauthenticated secure link for customer proof inspection
router.get('/secure/:secureToken', getProofBySecureToken);

// Customer response via secure link without requiring prior login
router.post('/secure/:secureToken/response', submitProofResponse);
router.patch('/secure/:secureToken/response', submitProofResponse);

// Customer or merchant approval / revision request submission (authenticated)
router.patch('/:proofId/response', authenticateUser, requireVerifiedUser, submitProofResponse);
router.post('/:proofId/response', authenticateUser, requireVerifiedUser, submitProofResponse);

// OTP Request & Link Sending endpoints (Sensitive actions)
router.post('/:proofId/request-otp', authenticateUser, requireVerifiedUser, requestProofApprovalOtp);
router.post('/:proofId/send-link', authenticateUser, requireVerifiedUser, sendProofLink);

// Convenience direct action routes
router.post('/:proofId/approve', authenticateUser, requireVerifiedUser, (req, res, next) => {
  req.body.status = 'APPROVED';
  return submitProofResponse(req, res, next);
});

router.post('/:proofId/request-changes', authenticateUser, requireVerifiedUser, (req, res, next) => {
  req.body.status = 'CHANGES_REQUESTED';
  return submitProofResponse(req, res, next);
});

// Retrieve all proofs & manufacturing clearance status for an order (requires auth)
router.get('/order/:orderId', authenticateUser, requireVerifiedUser, getProofsByOrderId);

export default router;
