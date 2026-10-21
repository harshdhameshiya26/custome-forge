/* eslint-env node */

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Schedule from '../models/schedule.model.js';
import User from '../models/user.model.js';
import Design from '../models/design.model.js';
import CustomOrder from '../models/custom-order.model.js';
import CustomOrderTimeline from '../models/custom-order-timeline.model.js';
import { sendOtpEmail } from './emailService.js';
import { createNotification } from './notificationService.js';
import { logError, logSuccess, logWarn } from '../utils/logger.js';

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;

/**
 * Generate cryptographically random 6-digit OTP code.
 */
const generate6DigitOtp = () => String(crypto.randomInt(100000, 999999)).padStart(6, '0');

/**
 * Service to handle Supplier Production Scheduling workflows.
 */
export class ScheduleService {
  /**
   * Create a new supplier production schedule.
   * Strictly enforces design count between 25 and 100 designs.
   *
   * @param {Object} data
   * @param {Object} merchantUser - authenticated merchant
   * @returns {Promise<Object>} Created schedule in PENDING state
   */
  static async createSchedule(data, merchantUser) {
    const { supplierId, category, designIds, scheduledAt, notes, metadata } = data;

    // 1. Strict validation: design count strictly between 25 and 100
    if (!Array.isArray(designIds) || designIds.length < 25 || designIds.length > 100) {
      const err = new Error(
        `Validation failed: A production schedule strictly requires between 25 and 100 selected designs. (Received: ${
          Array.isArray(designIds) ? designIds.length : 0
        })`,
      );
      err.statusCode = 422;
      throw err;
    }

    // 2. Validate supplier exists and has supplier role
    let supplier;
    if (mongoose.Types.ObjectId.isValid(supplierId)) {
      supplier = await User.findOne({ _id: supplierId, role: 'supplier', deletedAt: null });
    }
    if (!supplier) {
      supplier = await User.findOne({ email: supplierId, role: 'supplier', deletedAt: null });
    }

    if (!supplier) {
      const err = new Error(`Supplier with ID or email "${supplierId}" not found or is not a registered supplier.`);
      err.statusCode = 404;
      throw err;
    }

    // 3. Category match check
    const normalizedCategory = category.trim().toLowerCase();
    const supplierSpecialization = (supplier.supplierCategory || '').trim().toLowerCase();
    if (supplierSpecialization && supplierSpecialization !== normalizedCategory) {
      logWarn(
        `[ScheduleService] Supplier specialization (${supplierSpecialization}) differs from batch category (${normalizedCategory}). Proceeding with override.`,
      );
    }

    // 4. Verify designs in DB where IDs are valid ObjectIds
    const validObjectIds = designIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    let foundDesigns = [];
    if (validObjectIds.length > 0) {
      foundDesigns = await Design.find({ _id: { $in: validObjectIds } }).select('_id status productId title');
    }

    // 5. Create schedule record in PENDING state
    const schedule = await Schedule.create({
      supplierId: String(supplier._id),
      supplierEmail: supplier.email,
      supplierName: supplier.fullName,
      category: normalizedCategory,
      designIds,
      scheduledAt: new Date(scheduledAt),
      status: 'PENDING',
      merchantId: merchantUser ? String(merchantUser._id) : null,
      merchantEmail: merchantUser ? merchantUser.email : null,
      notes: notes || null,
      metadata: {
        ...(metadata || {}),
        foundDesignCount: foundDesigns.length,
        initialDesignIdsCount: designIds.length,
        createdVia: 'CustomForge Supplier Scheduler',
      },
    });

    logSuccess(
      `[ScheduleService] New schedule created (ID: ${schedule.scheduleId}) for supplier ${supplier.email} with ${designIds.length} designs. Status: PENDING (Requires OTP confirmation).`,
    );

    return schedule;
  }

  /**
   * Request / Generate merchant OTP for schedule finalization.
   *
   * @param {string} scheduleId
   * @param {Object} merchantUser
   */
  static async requestScheduleOtp(scheduleId, merchantUser) {
    const schedule = await Schedule.findOne({
      $or: [{ scheduleId }, { _id: mongoose.Types.ObjectId.isValid(scheduleId) ? scheduleId : null }],
    }).select('+otp +otpExpiresAt +otpAttempts');

    if (!schedule) {
      const err = new Error(`Schedule "${scheduleId}" not found.`);
      err.statusCode = 404;
      throw err;
    }

    if (schedule.status !== 'PENDING') {
      const err = new Error(`Schedule "${scheduleId}" is already ${schedule.status}. Only PENDING schedules require OTP verification.`);
      err.statusCode = 400;
      throw err;
    }

    const recipientEmail = merchantUser?.email || schedule.merchantEmail;
    if (!recipientEmail) {
      const err = new Error('No merchant email associated with this schedule for OTP delivery.');
      err.statusCode = 400;
      throw err;
    }

    const otp = generate6DigitOtp();
    schedule.otp = otp;
    schedule.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    schedule.otpAttempts = 0;
    schedule.merchantEmail = recipientEmail;
    if (merchantUser?._id) schedule.merchantId = String(merchantUser._id);
    await schedule.save();

    // Deliver OTP via email service
    await sendOtpEmail({
      to: recipientEmail,
      otp,
      fullName: merchantUser?.fullName || 'Merchant Partner',
      expiryMs: OTP_EXPIRY_MS,
    }).catch((emailErr) => {
      logError(`[ScheduleService] Failed to send schedule OTP email: ${emailErr.message}`);
    });

    logSuccess(`[ScheduleService] OTP generated and dispatched for schedule ${schedule.scheduleId} to ${recipientEmail}`);

    return {
      success: true,
      message: `A 6-digit confirmation code has been sent to ${recipientEmail}. Please verify to confirm the schedule and send designs to the supplier.`,
      scheduleId: schedule.scheduleId,
      expiresInSeconds: Math.floor(OTP_EXPIRY_MS / 1000),
      expiresAt: schedule.otpExpiresAt,
    };
  }

  /**
   * Verify merchant OTP and finalize schedule confirmation.
   * Automatically dispatches selected designs to the designated supplier.
   *
   * @param {string} scheduleId
   * @param {string} inputOtp
   * @param {Object} merchantUser
   */
  static async verifyScheduleOtpAndConfirm(scheduleId, inputOtp, merchantUser) {
    const schedule = await Schedule.findOne({
      $or: [{ scheduleId }, { _id: mongoose.Types.ObjectId.isValid(scheduleId) ? scheduleId : null }],
    }).select('+otp +otpExpiresAt +otpAttempts');

    if (!schedule) {
      const err = new Error(`Schedule "${scheduleId}" not found.`);
      err.statusCode = 404;
      throw err;
    }

    if (schedule.status === 'CONFIRMED') {
      return {
        success: true,
        message: 'Schedule is already confirmed and dispatched to supplier.',
        schedule,
      };
    }

    if (schedule.status !== 'PENDING') {
      const err = new Error(`Schedule "${scheduleId}" has status ${schedule.status} and cannot be confirmed.`);
      err.statusCode = 400;
      throw err;
    }

    // Check attempts lockout
    if (schedule.otpAttempts >= MAX_OTP_ATTEMPTS) {
      const err = new Error('Maximum OTP verification attempts exceeded. Please request a new confirmation code.');
      err.statusCode = 429;
      throw err;
    }

    // Check expiration
    if (!schedule.otp || !schedule.otpExpiresAt || schedule.otpExpiresAt < new Date()) {
      const err = new Error('Confirmation OTP has expired. Please request a new code.');
      err.statusCode = 400;
      throw err;
    }

    // Code comparison
    const storedOtp = String(schedule.otp);
    const providedOtp = String(inputOtp).trim();

    const isMatch =
      storedOtp.length === providedOtp.length &&
      crypto.timingSafeEqual(Buffer.from(storedOtp), Buffer.from(providedOtp));

    if (!isMatch) {
      schedule.otpAttempts = (schedule.otpAttempts || 0) + 1;
      await schedule.save();
      const remainingAttempts = Math.max(0, MAX_OTP_ATTEMPTS - schedule.otpAttempts);
      const err = new Error(`Invalid confirmation OTP. ${remainingAttempts} attempts remaining.`);
      err.statusCode = 400;
      throw err;
    }

    // Verification Success! Finalize confirmation
    const now = new Date();
    schedule.status = 'CONFIRMED';
    schedule.confirmedAt = now;
    schedule.sentToSupplierAt = now;
    schedule.otp = null;
    schedule.otpExpiresAt = null;
    schedule.otpAttempts = 0;
    if (merchantUser?._id) schedule.merchantId = String(merchantUser._id);
    if (merchantUser?.email) schedule.merchantEmail = merchantUser.email;

    // ─────────────────────────────────────────────────────────────────────────
    // AUTOMATIC DISPATCH: Send selected designs to supplier production queue
    // ─────────────────────────────────────────────────────────────────────────
    const validObjectIds = schedule.designIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (validObjectIds.length > 0) {
      // 1. Advance design status to IN_PRODUCTION
      await Design.updateMany(
        { _id: { $in: validObjectIds } },
        {
          $set: {
            status: 'submitted',
            'metadata.assignedSupplierId': schedule.supplierId,
            'metadata.assignedSupplierEmail': schedule.supplierEmail,
            'metadata.scheduleId': schedule.scheduleId,
            'metadata.dispatchedAt': now,
          },
        },
      );
    }

    // 2. Automatically sync or create production handoff entries for tracking
    try {
      await Promise.all(
        schedule.designIds.map(async (designId, idx) => {
          const orderIdentifier = `SCHED-${schedule.scheduleId.slice(0, 8)}-${idx + 1}`;
          await CustomOrder.findOneAndUpdate(
            { designId },
            {
              $set: {
                assignedQueue: `SUPPLIER_QUEUE_${schedule.category.toUpperCase()}`,
                supplierId: schedule.supplierId,
                status: 'IN_PRODUCTION',
                handoffStatus: 'SENT_TO_SUPPLIER',
                routedAt: now,
                metadata: {
                  scheduleId: schedule.scheduleId,
                  batchCategory: schedule.category,
                  dispatchedAt: now,
                },
              },
            },
            { upsert: false },
          );
        }),
      );
    } catch (handoffErr) {
      logWarn(`[ScheduleService] Non-critical handoff batch sync notice: ${handoffErr.message}`);
    }

    // 3. Create persistent Notification in DB for merchant and audit log
    if (schedule.merchantEmail) {
      createNotification({
        shopDomain: merchantUser?.shop || 'customforge-admin',
        type: 'ORDER_UPDATE',
        severity: 'SUCCESS',
        title: `Supplier Schedule Confirmed (${schedule.scheduleId})`,
        message: `Successfully verified and dispatched batch of ${schedule.designIds.length} designs to supplier ${schedule.supplierName || schedule.supplierEmail} for ${schedule.category}.`,
      }).catch((e) => logWarn(`[ScheduleService] Notification creation notice: ${e.message}`));
    }

    await schedule.save();

    logSuccess(
      `[ScheduleService] Schedule ${schedule.scheduleId} successfully CONFIRMED! ${schedule.designIds.length} designs automatically dispatched to supplier ${schedule.supplierEmail}.`,
    );

    return {
      success: true,
      message: `Schedule successfully confirmed. ${schedule.designIds.length} designs have been automatically transferred to supplier queue.`,
      schedule,
    };
  }

  /**
   * List schedules with role-aware scoping and filtering.
   */
  static async listSchedules(query, user) {
    const { supplierId, category, status, page = 1, limit = 20 } = query;
    const filter = {};

    // Role-based visibility scoping:
    // If user is a supplier, they can only view schedules assigned to them
    if (user && user.role === 'supplier') {
      filter.supplierId = String(user._id);
    } else if (supplierId) {
      filter.supplierId = supplierId;
    }

    if (category) {
      filter.category = String(category).trim().toLowerCase();
    }

    if (status) {
      filter.status = status;
    }

    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    const pageSize = Math.min(100, Math.max(1, Number(limit)));

    const [schedules, total] = await Promise.all([
      Schedule.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize),
      Schedule.countDocuments(filter),
    ]);

    return {
      success: true,
      pagination: {
        total,
        page: Number(page),
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
      data: schedules,
    };
  }

  /**
   * Fetch single schedule by ID with populated design summaries.
   */
  static async getScheduleById(scheduleId, user) {
    const schedule = await Schedule.findOne({
      $or: [{ scheduleId }, { _id: mongoose.Types.ObjectId.isValid(scheduleId) ? scheduleId : null }],
    });

    if (!schedule) {
      const err = new Error(`Schedule "${scheduleId}" not found.`);
      err.statusCode = 404;
      throw err;
    }

    // Role check: supplier can only view their own schedule
    if (user && user.role === 'supplier' && schedule.supplierId !== String(user._id)) {
      const err = new Error('Forbidden: You do not have permission to view schedules assigned to other suppliers.');
      err.statusCode = 403;
      throw err;
    }

    // Populate design summaries
    const validObjectIds = schedule.designIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    let designs = [];
    if (validObjectIds.length > 0) {
      designs = await Design.find({ _id: { $in: validObjectIds } }).select(
        '_id productId title status thumbnailUrl createdAt',
      );
    }

    return {
      success: true,
      data: {
        ...schedule.toJSON(),
        designs,
      },
    };
  }
}

export default ScheduleService;
