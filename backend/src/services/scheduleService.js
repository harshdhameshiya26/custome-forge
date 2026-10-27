/* eslint-env node */

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Schedule from '../models/schedule.model.js';
import User from '../models/user.model.js';
import Design from '../models/design.model.js';
import CustomOrder from '../models/custom-order.model.js';
import CustomOrderTimeline from '../models/custom-order-timeline.model.js';
import { sendOtpEmail, sendGenericEmail } from './emailService.js';
import { createNotification } from './notificationService.js';
import { generateSupplierSchedulePdf } from './supplierSchedulePdf.js';
import { logError, logSuccess, logWarn } from '../utils/logger.js';
import { formatScheduleDateTime, getScheduleTimeZone } from '../utils/schedule-date-time.js';

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;

/**
 * Generate cryptographically random 6-digit OTP code.
 */
const generate6DigitOtp = () => String(crypto.randomInt(100000, 999999)).padStart(6, '0');
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
const getEmailImageUrl = (value) => {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'shopify.com' || url.hostname.endsWith('.shopify.com'))
      ? url.toString()
      : '';
  } catch {
    return '';
  }
};
const normalizeProperties = (properties) => {
  if (Array.isArray(properties)) {
    return properties.reduce((normalized, property) => {
      if (property && typeof property.name === 'string') {
        normalized[property.name] = property.value;
      }
      return normalized;
    }, Object.create(null));
  }
  return properties && typeof properties === 'object' ? properties : {};
};
const getDesignEmailItems = (order) =>
  (Array.isArray(order.metadata?.customDesigns) ? order.metadata.customDesigns : [])
    .filter((design) => design && typeof design === 'object')
    .map((design) => {
      const properties = normalizeProperties(design.properties);
      return {
        title:
          design.productName ||
          design.productTitle ||
          design.title ||
          design.name ||
          order.productType ||
          'Customized product',
        quantity: Math.max(1, Number.parseInt(design.quantity, 10) || 1),
        variant:
          design.variantTitle ||
          design.shopifyVariantTitle ||
          design.variantName ||
          design.variant ||
          properties.variant ||
          properties.Variant ||
          '',
        productImageUrl: getEmailImageUrl(design.productImageUrl),
        artworkUrl: getEmailImageUrl(design.imageUrl || design.previewUrl),
        properties,
        dimensions:
          design.dimensions ||
          design.printDimensions ||
          design.printArea ||
          properties.dimensions ||
          properties.printDimensions ||
          properties.Dimensions ||
          properties['Print Dimensions'],
        customizationParameters:
          design.customizationParameters ||
          design.customization ||
          (design.text ? { ...properties, text: design.text } : properties),
        customerNotes: design.customerNotes || order.metadata?.customerNotes || '',
      };
    });

const countCustomizedProducts = (orders) =>
  orders.reduce(
    (count, order) =>
      count +
      (Array.isArray(order.metadata?.customDesigns) ? order.metadata.customDesigns : []).reduce(
        (designCount, design) =>
          designCount +
          (design && typeof design === 'object'
            ? Math.max(1, Number.parseInt(design.quantity, 10) || 1)
            : 0),
        0,
      ),
    0,
  );

const validateSupplierEligibility = (supplier) => {
  if (!supplier || supplier.role !== 'supplier' || supplier.deletedAt) {
    const err = new Error('The supplier assigned to this schedule no longer exists.');
    err.statusCode = 409;
    throw err;
  }
  if (supplier.isBlocked) {
    const err = new Error('The assigned supplier account is blocked and cannot receive schedules.');
    err.statusCode = 409;
    throw err;
  }
  if (!supplier.isVerified) {
    const err = new Error('The assigned supplier has not completed email OTP verification.');
    err.statusCode = 409;
    throw err;
  }
};

const getValidatedScheduleProductCount = async (schedule) => {
  if (schedule.orderIds.length > 0) {
    const orders = await CustomOrder.find({
      orderId: { $in: schedule.orderIds },
      'metadata.financialStatus': { $regex: /^(paid|authorized)$/i },
      'metadata.customDesigns.0': { $exists: true },
    }).select('orderId metadata');
    if (orders.length !== schedule.orderIds.length) {
      const err = new Error(
        'Some selected paid or authorized custom orders are no longer available. Refresh the order list and create the schedule again.',
      );
      err.statusCode = 409;
      throw err;
    }
    return countCustomizedProducts(orders);
  }

  const validObjectIds = schedule.designIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validObjectIds.length !== schedule.designIds.length) {
    const err = new Error('This schedule contains an invalid saved design reference.');
    err.statusCode = 409;
    throw err;
  }
  const designCount = await Design.countDocuments({ _id: { $in: validObjectIds } });
  if (designCount !== schedule.designIds.length) {
    const err = new Error('One or more scheduled designs are no longer available.');
    err.statusCode = 409;
    throw err;
  }
  return designCount;
};

const assertMerchantOwnsSchedule = (schedule, merchantUser) => {
  if (schedule.merchantId !== String(merchantUser?._id)) {
    const err = new Error('Forbidden: You can only access schedules created by your account.');
    err.statusCode = 403;
    throw err;
  }
};

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
    const {
      supplierId,
      category,
      designIds = [],
      orderIds = [],
      scheduledAt,
      notes,
      metadata,
    } = data;
    const isPaidOrderSchedule = Array.isArray(data.orderIds);
    const selectedIds = isPaidOrderSchedule ? orderIds : designIds;

    if (isPaidOrderSchedule && orderIds.length === 0) {
      const err = new Error(
        'Select at least one paid custom order to create a supplier schedule.',
      );
      err.statusCode = 422;
      throw err;
    }
    if (
      !isPaidOrderSchedule &&
      (!Array.isArray(designIds) || designIds.length < 25 || designIds.length > 100)
    ) {
      const err = new Error(
        `Per schedule, the number of selected designs must be strictly between 25 (minimum) and 100 (maximum) designs. (Received: ${
          Array.isArray(designIds) ? designIds.length : 0
        })`,
      );
      err.statusCode = 422;
      throw err;
    }
    if (new Set(selectedIds).size !== selectedIds.length) {
      const err = new Error('Each product can only be included once in a schedule.');
      err.statusCode = 422;
      throw err;
    }

    // 2. Resolve the supplier first, then report inactive and unverified accounts distinctly.
    let supplier;
    if (mongoose.Types.ObjectId.isValid(supplierId)) {
      supplier = await User.findOne({
        _id: supplierId,
        role: 'supplier',
        deletedAt: null,
      });
    }
    if (!supplier) {
      supplier = await User.findOne({
        email: supplierId,
        role: 'supplier',
        deletedAt: null,
      });
    }

    if (!supplier) {
      const err = new Error(`Supplier with ID or email "${supplierId}" was not found.`);
      err.statusCode = 404;
      throw err;
    }
    validateSupplierEligibility(supplier);

    // 3. Category match check
    const normalizedCategory = category.trim().toLowerCase();
    const supplierSpecialization = (supplier.supplierCategory || '').trim().toLowerCase();
    if (supplierSpecialization && supplierSpecialization !== normalizedCategory) {
      logWarn(
        `[ScheduleService] Supplier specialization (${supplierSpecialization}) differs from batch category (${normalizedCategory}). Proceeding with override.`,
      );
    }

    let foundDesigns = [];
    let selectedProductCount = 0;
    if (isPaidOrderSchedule) {
      const existingSchedule = await Schedule.findOne({
        orderIds: { $in: orderIds },
        status: { $in: ['PENDING', 'CONFIRMED'] },
      }).select('scheduleId');
      if (existingSchedule) {
        const err = new Error(
          'One or more selected orders are already included in an active supplier schedule.',
        );
        err.statusCode = 409;
        throw err;
      }

      const foundOrders = await CustomOrder.find({
        orderId: { $in: orderIds },
        'metadata.financialStatus': { $regex: /^(paid|authorized)$/i },
        'metadata.customDesigns.0': { $exists: true },
        ...(merchantUser?.shop ? { shop: merchantUser.shop } : {}),
      }).select('orderId shop metadata productType');
      if (foundOrders.length !== orderIds.length) {
        const err = new Error(
          'Every selected item must be a paid or authorized Shopify order containing a CustomForge design.',
        );
        err.statusCode = 422;
        throw err;
      }
      selectedProductCount = countCustomizedProducts(foundOrders);
      if (selectedProductCount < 3) {
        const err = new Error(
          `A supplier schedule requires at least 3 customized products. The selected orders contain ${selectedProductCount}.`,
        );
        err.statusCode = 422;
        throw err;
      }
    } else {
      const validObjectIds = designIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (validObjectIds.length !== designIds.length) {
        const err = new Error('Every schedule design ID must be a valid saved design ID.');
        err.statusCode = 422;
        throw err;
      }
      foundDesigns = await Design.find({ _id: { $in: validObjectIds } }).select(
        '_id status productId title',
      );
      if (foundDesigns.length !== designIds.length) {
        const err = new Error('One or more selected designs could not be found.');
        err.statusCode = 422;
        throw err;
      }
    }

    // 5. Create schedule record in PENDING state
    const schedule = await Schedule.create({
      supplierId: String(supplier._id),
      supplierEmail: supplier.email,
      supplierName: supplier.fullName,
      category: normalizedCategory,
      designIds: isPaidOrderSchedule ? [] : designIds,
      orderIds: isPaidOrderSchedule ? orderIds : [],
      scheduledAt: new Date(scheduledAt),
      status: 'PENDING',
      merchantId: merchantUser ? String(merchantUser._id) : null,
      merchantEmail: merchantUser ? merchantUser.email : null,
      notes: notes || null,
      metadata: {
        ...(metadata || {}),
        foundDesignCount: isPaidOrderSchedule ? 0 : foundDesigns.length,
        foundOrderCount: isPaidOrderSchedule ? orderIds.length : 0,
        selectedProductCount,
        initialDesignIdsCount: isPaidOrderSchedule ? 0 : designIds.length,
        initialOrderIdsCount: isPaidOrderSchedule ? orderIds.length : 0,
        createdVia: 'CustomForge Supplier Scheduler',
      },
    });

    logSuccess(
      `[ScheduleService] New schedule created (ID: ${schedule.scheduleId}) for supplier ${supplier.email} with ${selectedIds.length} items. Status: PENDING (Requires OTP confirmation).`,
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
    assertMerchantOwnsSchedule(schedule, merchantUser);

    const supplier = await User.findOne({
      _id: schedule.supplierId,
      role: 'supplier',
      deletedAt: null,
    });
    validateSupplierEligibility(supplier);

    const productCount = await getValidatedScheduleProductCount(schedule);
    if (productCount < 3) {
      const err = new Error(
        `A supplier schedule requires at least 3 customized products. This schedule contains ${productCount}.`,
      );
      err.statusCode = 422;
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
    try {
      await sendOtpEmail({
        to: recipientEmail,
        otp,
        fullName: merchantUser?.fullName || 'Merchant Partner',
        expiryMs: OTP_EXPIRY_MS,
      });
    } catch (emailErr) {
      logError(`[ScheduleService] Failed to send schedule OTP email: ${emailErr.message}`);
      schedule.otp = null;
      schedule.otpExpiresAt = null;
      await schedule.save();
      const err = new Error('Unable to send the schedule verification email. Please try again.');
      err.statusCode = 502;
      throw err;
    }

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
    assertMerchantOwnsSchedule(schedule, merchantUser);

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

    const supplier = await User.findOne({
      _id: schedule.supplierId,
      role: 'supplier',
      deletedAt: null,
    });
    validateSupplierEligibility(supplier);

    const scheduledItemCount = await getValidatedScheduleProductCount(schedule);
    if (scheduledItemCount < 3) {
      const err = new Error(
        `A supplier schedule requires at least 3 customized products. This schedule contains ${scheduledItemCount}.`,
      );
      err.statusCode = 422;
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

    if (schedule.orderIds.length > 0) {
      const dispatchFilter = {
        orderId: { $in: schedule.orderIds },
        'metadata.financialStatus': { $regex: /^(paid|authorized)$/i },
        'metadata.customDesigns.0': { $exists: true },
      };
      const availableOrderCount = await CustomOrder.countDocuments(dispatchFilter);
      if (availableOrderCount !== schedule.orderIds.length) {
        const err = new Error(
          'Some selected paid or authorized custom orders are no longer available. Refresh the order list and create the schedule again.',
        );
        err.statusCode = 409;
        throw err;
      }
      const dispatchResult = await CustomOrder.updateMany(
        dispatchFilter,
        {
          $set: {
            assignedQueue: `SUPPLIER_QUEUE_${schedule.category.toUpperCase()}`,
            supplierId: schedule.supplierId,
            status: 'IN_PRODUCTION',
            handoffStatus: 'ROUTED',
            routedAt: now,
            'metadata.scheduleId': schedule.scheduleId,
            'metadata.assignedSupplierId': schedule.supplierId,
            'metadata.assignedSupplierEmail': schedule.supplierEmail,
            'metadata.dispatchedAt': now,
          },
        },
      );
      if (dispatchResult.matchedCount !== schedule.orderIds.length) {
        const err = new Error(
          'Some selected paid or authorized custom orders are no longer available. Refresh the order list and create the schedule again.',
        );
        err.statusCode = 409;
        throw err;
      }
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
        message: `Successfully verified and dispatched batch of ${scheduledItemCount} customized products to supplier ${schedule.supplierName || schedule.supplierEmail} for ${schedule.category}.`,
      }).catch((e) => logWarn(`[ScheduleService] Notification creation notice: ${e.message}`));
    }

    await schedule.save();

    let supplierNotification;
    if (new Date(schedule.scheduledAt).getTime() > Date.now()) {
      supplierNotification = {
        sent: false,
        scheduled: true,
        scheduledAt: schedule.scheduledAt,
        message: `The supplier email is queued for ${formatScheduleDateTime(
          schedule.scheduledAt,
          schedule.metadata?.timeZone,
        )}.`,
      };
    } else {
      try {
        supplierNotification = await this.sendSupplierScheduleEmail(schedule.scheduleId, merchantUser);
      } catch (emailError) {
        logError(
          `[ScheduleService] Schedule ${schedule.scheduleId} was confirmed, but the supplier email failed: ${emailError.message}`,
        );
        if (emailError.statusCode && emailError.statusCode < 500) {
          const validationError = new Error(
            `Schedule was confirmed and dispatched, but supplier notification validation failed: ${emailError.message} Use the supplier email retry endpoint after resolving the issue.`,
          );
          validationError.statusCode = emailError.statusCode;
          throw validationError;
        }
        supplierNotification = {
          sent: false,
          message: 'Schedule confirmed, but its email could not be delivered. Retry the supplier notification.',
        };
      }
    }

    logSuccess(
      `[ScheduleService] Schedule ${schedule.scheduleId} successfully CONFIRMED! ${scheduledItemCount} items automatically dispatched to supplier ${schedule.supplierEmail}.`,
    );

    return {
      success: true,
      message: supplierNotification.scheduled
        ? `Schedule confirmed. The supplier notification will be sent at the scheduled time.`
        : supplierNotification.inProgress
        ? `Schedule confirmed. The supplier notification is being delivered.`
        : supplierNotification.sent
        ? `Schedule successfully confirmed. ${scheduledItemCount} items have been automatically transferred to supplier queue and emailed to the supplier.`
        : `Schedule confirmed and ${scheduledItemCount} items transferred, but the supplier email failed. Retry the notification.`,
      schedule,
      supplierNotification,
    };
  }

  static async sendSupplierScheduleEmail(scheduleId, merchantUser) {
    let schedule = await Schedule.findOne({
      $or: [{ scheduleId }, { _id: mongoose.Types.ObjectId.isValid(scheduleId) ? scheduleId : null }],
    });
    if (!schedule) {
      const err = new Error(`Schedule "${scheduleId}" not found.`);
      err.statusCode = 404;
      throw err;
    }
    if (schedule.status !== 'CONFIRMED') {
      const err = new Error('Only confirmed schedules can be emailed to suppliers.');
      err.statusCode = 400;
      throw err;
    }
    if (!schedule.supplierEmail) {
      const err = new Error('No supplier email is associated with this schedule.');
      err.statusCode = 400;
      throw err;
    }
    if (merchantUser) assertMerchantOwnsSchedule(schedule, merchantUser);
    if (new Date(schedule.scheduledAt).getTime() > Date.now()) {
      return {
        sent: false,
        scheduled: true,
        scheduledAt: schedule.scheduledAt,
        message: `The supplier email is queued for ${formatScheduleDateTime(
          schedule.scheduledAt,
          schedule.metadata?.timeZone,
        )}.`,
      };
    }
    if (schedule.supplierEmailStatus === 'sent') {
      return { sent: true, sentAt: schedule.supplierEmailSentAt };
    }

    const supplier = await User.findOne({
      _id: schedule.supplierId,
      role: 'supplier',
      deletedAt: null,
    });
    validateSupplierEligibility(supplier);
    if (supplier.email !== schedule.supplierEmail) {
      const err = new Error(
        'The supplier email on this schedule no longer matches the verified supplier account. Update the schedule before sending.',
      );
      err.statusCode = 409;
      throw err;
    }

    const scheduledItemCount = await getValidatedScheduleProductCount(schedule);
    if (scheduledItemCount < 3) {
      const err = new Error(
        `A supplier schedule requires at least 3 customized products. This schedule contains ${scheduledItemCount}.`,
      );
      err.statusCode = 422;
      throw err;
    }

    const appUrl = process.env.CUSTOMFORGE_APP_URL || process.env.SHOPIFY_APP_URL || '';
    let portalLink = '';
    if (appUrl) {
      try {
        const parsedUrl = new URL(appUrl);
        if (['https:', 'http:'].includes(parsedUrl.protocol)) {
          portalLink = `${parsedUrl.origin}/supplier/schedules`;
        }
      } catch {
        logWarn('[ScheduleService] CUSTOMFORGE_APP_URL is not a valid URL; omitting supplier portal link.');
      }
    }

    const timeZone = getScheduleTimeZone(schedule.metadata?.timeZone);
    const scheduledAt = formatScheduleDateTime(schedule.scheduledAt, timeZone);
    const [orders, designs] = await Promise.all([
      schedule.orderIds.length
        ? CustomOrder.find({ orderId: { $in: schedule.orderIds } }).select(
          'orderId shopifyOrderId productType metadata',
        )
        : Promise.resolve([]),
      schedule.designIds.length
        ? Design.find({
          _id: {
            $in: schedule.designIds.filter((id) => mongoose.Types.ObjectId.isValid(id)),
          },
        }).select('_id title productId productVariantId thumbnailUrl canvasState')
        : Promise.resolve([]),
    ]);
    const orderById = new Map(orders.map((order) => [order.orderId, order]));
    const emailItems = schedule.orderIds.flatMap((orderId) => {
      const order = orderById.get(orderId);
      if (!order) return [];
      return getDesignEmailItems(order).map((item) => ({
        ...item,
        orderNumber:
          order.metadata?.orderNumber || order.shopifyOrderId || order.orderId,
      }));
    });
    const designById = new Map(designs.map((design) => [String(design._id), design]));
    const savedDesignItems = schedule.designIds.flatMap((designId) => {
      const design = designById.get(String(designId));
      if (!design) return [];
      const artworkUrl = getEmailImageUrl(
        design.thumbnailUrl || design.canvasState?.previewUrl || design.canvasState?.thumbnailUrl,
      );
      return [{
        title: design.title || design.productId || 'Saved design',
        variant: design.productVariantId || '',
        quantity: 1,
        artworkUrl,
        productImageUrl: '',
        properties: normalizeProperties(
          design.canvasState?.customizationParameters ||
          design.canvasState?.customization ||
          design.canvasState?.properties,
        ),
        dimensions:
          design.canvasState?.dimensions ||
          design.canvasState?.printDimensions ||
          design.canvasState?.printArea ||
          (design.canvasState?.width || design.canvasState?.height
            ? {
                width: design.canvasState.width,
                height: design.canvasState.height,
                unit: design.canvasState.unit || 'px',
              }
            : null),
        customizationParameters:
          design.canvasState?.customizationParameters ||
          design.canvasState?.customization ||
          design.canvasState?.properties ||
          design.canvasState?.objects ||
          design.canvasState?.text ||
          {},
        customerNotes: design.canvasState?.customerNotes || schedule.notes || '',
        orderNumber: '',
      }];
    });
    const allEmailItems = [...emailItems, ...savedDesignItems];
    const renderedItemCount = allEmailItems.reduce(
      (count, item) => count + Math.max(1, Number.parseInt(item.quantity, 10) || 1),
      0,
    );
    if (renderedItemCount !== scheduledItemCount) {
      const err = new Error(
        'The schedule design details changed after confirmation. Refresh the schedule and retry the supplier notification.',
      );
      err.statusCode = 409;
      throw err;
    }
    const pdfItems = allEmailItems.map((item) => ({
      productName: item.title,
      variant: item.variant,
      quantity: item.quantity,
      customerNotes: item.customerNotes,
      dimensions: item.dimensions,
      customizationParameters: item.customizationParameters || item.properties,
      orderNumber: item.orderNumber,
      productImageUrl: item.productImageUrl,
      artworkUrl: item.artworkUrl,
    }));
    const noteMarkup = schedule.notes
      ? `<p><strong>Notes:</strong> ${escapeHtml(schedule.notes)}</p>`
      : '';
    const portalMarkup = portalLink
      ? `<p>View your assigned schedules: <a href="${escapeHtml(portalLink)}">${escapeHtml(portalLink)}</a></p>`
      : '';
    const text = [
      `Schedule ${schedule.scheduleId} has been confirmed.`,
      `Category: ${schedule.category}`,
      `Customized products: ${scheduledItemCount}`,
      `Scheduled: ${scheduledAt}`,
      schedule.notes ? `Notes: ${schedule.notes}` : '',
      portalLink ? `Supplier portal: ${portalLink}` : '',
    ].filter(Boolean).join('\n');

    try {
      const scheduleObjectId = schedule._id;
      const claimNow = new Date();
      const staleSendingBefore = new Date(claimNow.getTime() - 10 * 60 * 1000);
      schedule = await Schedule.findOneAndUpdate(
        {
          _id: schedule._id,
          status: 'CONFIRMED',
          scheduledAt: { $lte: claimNow },
          $or: [
            { supplierEmailStatus: { $in: ['pending', 'failed'] } },
            {
              supplierEmailStatus: 'sending',
              supplierEmailSendingAt: { $lt: staleSendingBefore },
            },
          ],
        },
        {
          $set: {
            supplierEmailStatus: 'sending',
            supplierEmailSendingAt: claimNow,
            supplierEmailError: null,
          },
        },
        { new: true },
      );
      if (!schedule) {
        const latestSchedule = await Schedule.findById(scheduleObjectId);
        return {
          sent: latestSchedule?.supplierEmailStatus === 'sent',
          inProgress: latestSchedule?.supplierEmailStatus === 'sending',
          message: latestSchedule?.supplierEmailStatus === 'sending'
            ? 'The supplier notification is already being delivered.'
            : 'The supplier notification has already been delivered.',
        };
      }

      const scheduleLabel = schedule.scheduleId.slice(0, 8);
      const pdf = await generateSupplierSchedulePdf({
        schedule: {
          ...schedule.toObject(),
          metadata: {
            ...schedule.metadata,
            timeZone,
          },
        },
        items: pdfItems,
      });
      await sendGenericEmail({
        to: supplier.email,
        subject: `Production details for schedule ${scheduleLabel}`,
        text,
        attachments: [
          {
            filename: `customforge-schedule-${scheduleLabel}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
          },
        ],
        html: [
          '<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f7;font-family:Arial,sans-serif;color:#202223;">',
          '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center">',
          '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:680px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">',
          '<tr><td style="padding:24px;">',
          '<h1 style="margin:0 0 16px;font-size:22px;">CustomForge production schedule</h1>',
          `<p>Hello ${escapeHtml(schedule.supplierName || 'Supplier')},</p>`,
          '<p>A production schedule has been confirmed and assigned to you.</p>',
          `<p><strong>Schedule:</strong> ${escapeHtml(schedule.scheduleId)}<br />`,
          `<strong>Category:</strong> ${escapeHtml(schedule.category)}<br />`,
          `<strong>Customized products:</strong> ${scheduledItemCount}<br />`,
          `<strong>Scheduled:</strong> ${escapeHtml(scheduledAt)}</p>`,
          '<p>The attached PDF contains the complete production details and design previews.</p>',
          noteMarkup,
          portalMarkup,
          '</td></tr></table></td></tr></table></body></html>',
        ].join(''),
      });
    } catch (emailError) {
      schedule.supplierEmailStatus = 'failed';
      schedule.supplierEmailSendingAt = null;
      schedule.supplierEmailError = 'Supplier notification delivery failed. Retry the notification.';
      await schedule.save();
      throw emailError;
    }

    schedule.supplierEmailStatus = 'sent';
    schedule.supplierEmailSendingAt = null;
    schedule.supplierEmailError = null;
    schedule.supplierEmailSentAt = new Date();
    await schedule.save();
    return { sent: true, sentAt: schedule.supplierEmailSentAt };
  }

  static async dispatchDueSupplierScheduleEmails(limit = 10) {
    const now = new Date();
    const staleSendingBefore = new Date(now.getTime() - 10 * 60 * 1000);
    const dueSchedules = await Schedule.find({
      status: 'CONFIRMED',
      scheduledAt: { $lte: now },
      $or: [
        { supplierEmailStatus: 'pending' },
        {
          supplierEmailStatus: 'sending',
          supplierEmailSendingAt: { $lt: staleSendingBefore },
        },
      ],
    })
      .select('scheduleId scheduledAt')
      .sort({ scheduledAt: 1 })
      .limit(Math.max(1, Math.min(50, Number(limit) || 10)));

    for (const schedule of dueSchedules) {
      try {
        await this.sendSupplierScheduleEmail(schedule.scheduleId, null);
      } catch (error) {
        logError(
          `[ScheduleService] Scheduled email dispatch failed for ${schedule.scheduleId}: ${error.message}`,
        );
      }
    }
  }

  /**
   * List schedules with role-aware scoping and filtering.
   */
  static async listSchedules(query, user) {
    const { supplierId, category, status, page = 1, limit = 20 } = query;
    const filter = {};

    // Role-based visibility scoping:
    // If user is a supplier, they can only view schedules assigned to them
    if (user?.role === 'supplier') {
      filter.supplierId = String(user._id);
      filter.status = 'CONFIRMED';
    } else if (user?.role === 'merchant') {
      filter.merchantId = String(user._id);
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

    if (user?.role === 'merchant') {
      assertMerchantOwnsSchedule(schedule, user);
    }
    if (user && user.role === 'supplier' && schedule.supplierId !== String(user._id)) {
      const err = new Error('Forbidden: You do not have permission to view schedules assigned to other suppliers.');
      err.statusCode = 403;
      throw err;
    }
    if (user?.role === 'supplier' && schedule.status !== 'CONFIRMED') {
      const err = new Error('This schedule is not yet available to the assigned supplier.');
      err.statusCode = 404;
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
    const orders = schedule.orderIds.length
      ? await CustomOrder.find({ orderId: { $in: schedule.orderIds } }).select(
        'orderId shopifyOrderId customerEmail productType metadata',
      )
      : [];

    return {
      success: true,
      data: {
        ...schedule.toJSON(),
        designs,
        orders,
      },
    };
  }
}

export default ScheduleService;
