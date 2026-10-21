/* eslint-env node */

import express from 'express';
import {
  createRule,
  getRules,
  getRuleById,
  updateRule,
  deleteRule,
} from '../controllers/rule.controller.js';
import { authenticateUser, requireVerifiedUser } from '../middleware/authenticate.js';

const router = express.Router();

/**
 * Feature Name: "Production Handoff Rules"
 *
 * Route Definitions:
 *
 * 1. POST /api/rules
 *    Create a new merchant routing rule keyed by productType, material, or customizationType.
 *
 * 2. GET /api/rules
 *    List all routing rules sorted by priority ASC (supports ?shop= & ?isActive= & ?targetQueue= filters).
 *
 * 3. GET /api/rules/:id
 *    Fetch a single routing rule by ID or ruleId.
 *
 * 4. PATCH /api/rules/:id
 *    Update an existing routing rule's criteria, target queue, supplier, or priority.
 *
 * 5. DELETE /api/rules/:id
 *    Delete a routing rule by ID or ruleId.
 */

import { verifyRole } from '../middleware/auth.middleware.js';

// All routing rule endpoints are merchant-only — require verified merchant user session
router.use(authenticateUser, requireVerifiedUser, verifyRole(['merchant']));

router.post('/', createRule);
router.get('/', getRules);
router.get('/:id', getRuleById);
router.patch('/:id', updateRule);
router.delete('/:id', deleteRule);

export default router;
