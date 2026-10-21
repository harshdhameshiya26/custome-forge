/* eslint-env node */

import express from 'express';
import {
  registerSupplier,
  listSuppliers,
} from '../controllers/user.controller.js';
import {
  authenticateToken,
  requireVerifiedUser,
  verifyRole,
} from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { supplierRegisterSchema } from '../utils/schedule.validators.js';

const router = express.Router();

/**
 * POST /api/suppliers/register
 * Register a new supplier account with specialized category options.
 */
router.post(
  '/register',
  validate(supplierRegisterSchema),
  registerSupplier,
);

/**
 * GET /api/suppliers
 * Merchant endpoint to list registered suppliers, filterable by ?category=
 */
router.get(
  '/',
  authenticateToken,
  requireVerifiedUser,
  verifyRole(['merchant']),
  listSuppliers,
);

export default router;
