/* eslint-env node */

import express from 'express';
import {
  createSchedule,
  requestScheduleOtp,
  verifyScheduleOtp,
  listSchedules,
  getScheduleById,
  sendSupplierScheduleEmail,
} from '../controllers/schedule.controller.js';
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
import {
  createScheduleSchema,
  verifyScheduleOtpSchema,
  requestScheduleOtpSchema,
  queryScheduleSchema,
  supplierRegisterSchema,
} from '../utils/schedule.validators.js';

const router = express.Router();

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SUPPLIER MANAGEMENT ENDPOINTS
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * POST /api/schedules/suppliers/register (also aliased at /api/suppliers/register)
 * Public registration endpoint for suppliers accepting material/category specialization.
 */
router.post(
  '/suppliers/register',
  validate(supplierRegisterSchema),
  registerSupplier,
);

/**
 * GET /api/schedules/suppliers (also aliased at /api/suppliers)
 * Merchant endpoint to list registered and verified suppliers by category.
 */
router.get(
  '/suppliers',
  authenticateToken,
  requireVerifiedUser,
  verifyRole(['merchant']),
  listSuppliers,
);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SUPPLIER PRODUCTION SCHEDULE ENDPOINTS
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * POST /api/schedules
 * Merchant endpoint to create a production schedule grouping 25–100 designs.
 * Status starts in PENDING.
 */
router.post(
  '/',
  authenticateToken,
  requireVerifiedUser,
  verifyRole(['merchant']),
  validate(createScheduleSchema),
  createSchedule,
);

/**
 * GET /api/schedules
 * List schedules with role-based scoping (merchants see their own, suppliers see assigned schedules).
 */
router.get(
  '/',
  authenticateToken,
  requireVerifiedUser,
  verifyRole(['merchant', 'supplier']),
  validate(queryScheduleSchema),
  listSchedules,
);

/**
 * POST /api/schedules/:scheduleId/request-otp
 * Merchant endpoint to generate and dispatch confirmation OTP via email.
 */
router.post(
  '/:scheduleId/request-otp',
  authenticateToken,
  requireVerifiedUser,
  verifyRole(['merchant']),
  validate(requestScheduleOtpSchema),
  requestScheduleOtp,
);

/**
 * POST /api/schedules/:scheduleId/verify-otp
 * Merchant endpoint to verify OTP and confirm the schedule.
 * Automatically dispatches selected designs to the supplier upon confirmation.
 */
router.post(
  '/:scheduleId/verify-otp',
  authenticateToken,
  requireVerifiedUser,
  verifyRole(['merchant']),
  validate(verifyScheduleOtpSchema),
  verifyScheduleOtp,
);

/**
 * POST /api/schedules/:scheduleId/confirm (convenience alias for verify-otp)
 */
router.post(
  '/:scheduleId/confirm',
  authenticateToken,
  requireVerifiedUser,
  verifyRole(['merchant']),
  validate(verifyScheduleOtpSchema),
  verifyScheduleOtp,
);

router.post(
  '/:scheduleId/send-email',
  authenticateToken,
  requireVerifiedUser,
  verifyRole(['merchant']),
  validate(requestScheduleOtpSchema),
  sendSupplierScheduleEmail,
);

/**
 * GET /api/schedules/:scheduleId
 * Fetch schedule details and populated design summaries.
 */
router.get(
  '/:scheduleId',
  authenticateToken,
  requireVerifiedUser,
  verifyRole(['merchant', 'supplier']),
  getScheduleById,
);

export default router;
