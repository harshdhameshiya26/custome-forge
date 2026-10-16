/* eslint-env node */

import prisma from '../config/prisma.js';
import CustomOrderTimeline, { ORDER_TIMELINE_STAGES } from '../models/custom-order-timeline.model.js';
import { logError } from '../utils/logger.js';

/**
 * Standard customer-friendly default messages for each production stage.
 */
const DEFAULT_STAGE_MESSAGES = Object.freeze({
  DESIGN_RECEIVED: 'Your design has been received and queued for prepress inspection.',
  PROOF_READY: 'Your digital proof is ready for review. Please inspect and approve your customization.',
  APPROVED: 'Digital proof approved! Your order has been scheduled for manufacturing.',
  IN_PRODUCTION: 'Your custom product is currently in active production on our printing floor.',
  SHIPPED: 'Manufacturing complete! Your custom order has shipped and is on its way.',
});

/**
 * Stage progress weights to inform customers of completion percentage.
 */
const STAGE_PROGRESS_PERCENT = Object.freeze({
  DESIGN_RECEIVED: 20,
  PROOF_READY: 40,
  APPROVED: 60,
  IN_PRODUCTION: 80,
  SHIPPED: 100,
});

/**
 * Helper to clean and normalize a Shopify Order ID (strips GID prefix if present).
 * e.g. "gid://shopify/Order/8209829119461" -> "8209829119461"
 */
const normalizeOrderId = (rawId) => {
  if (!rawId) return '';
  const str = String(rawId).trim();
  const match = str.match(/Order\/(\d+)/);
  return match ? match[1] : str;
};

/**
 * Find an order timeline by either Shopify Order ID or MongoDB _id using Prisma or Mongoose.
 */
const findTimelineByIdentifier = async (orderId) => {
  const normalizedId = normalizeOrderId(orderId);

  // 1. Try Prisma first
  if (prisma?.customOrderTimeline) {
    try {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(orderId);
      const timeline = await prisma.customOrderTimeline.findFirst({
        where: {
          OR: [
            { shopifyOrderId: normalizedId },
            ...(isObjectId ? [{ id: orderId }] : []),
          ],
        },
      });
      if (timeline) return { timeline, source: 'PRISMA' };
    } catch (err) {
      logError(`⚠️ Prisma findTimeline query error: ${err.message}`);
    }
  }

  // 2. Fallback to Mongoose
  try {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(orderId);
    const query = isObjectId
      ? { $or: [{ shopifyOrderId: normalizedId }, { _id: orderId }] }
      : { shopifyOrderId: normalizedId };

    const mgTimeline = await CustomOrderTimeline.findOne(query);
    if (mgTimeline) return { timeline: mgTimeline, source: 'MONGOOSE' };
  } catch (err) {
    logError(`⚠️ Mongoose findTimeline query error: ${err.message}`);
  }

  return { timeline: null, source: null };
};

/**
 * @desc    Shopify Webhook Handler: orders/create
 *          Initializes order timeline to "DESIGN_RECEIVED" when a new order is placed.
 * @route   POST /api/webhooks/orders/create
 * @access  Public (HMAC Verified)
 */
export const handleOrderCreatedWebhook = async (req, res) => {
  try {
    const payload = req.body || {};

    const rawOrderId = payload.id || payload.order_id || payload.shopifyOrderId;
    const customerEmail =
      payload.email ||
      payload.contact_email ||
      payload.customer?.email ||
      payload.customerEmail;
    const shop =
      req.get('X-Shopify-Shop-Domain') ||
      payload.shop ||
      payload.domain ||
      'myshopify.com';

    if (!rawOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing order ID in webhook payload.',
      });
    }

    const shopifyOrderId = normalizeOrderId(rawOrderId);

    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        message: 'Missing customer email in webhook payload. customerEmail is required.',
      });
    }

    // Extract customization metadata from line items if present
    const customLineItems = (payload.line_items || []).map((item) => ({
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      properties: item.properties || [],
      customAttributes: (item.properties || []).reduce((acc, curr) => {
        if (curr.name && curr.value) acc[curr.name] = curr.value;
        return acc;
      }, {}),
    }));

    const orderMetadata = {
      orderNumber: payload.order_number || payload.name,
      totalPrice: payload.total_price,
      currency: payload.currency,
      financialStatus: payload.financial_status,
      customLineItems,
      customerNotes: payload.note,
      shippingAddress: payload.shipping_address
        ? {
            city: payload.shipping_address.city,
            country: payload.shipping_address.country,
            zip: payload.shipping_address.zip,
          }
        : null,
    };

    const initialHistoryEntry = {
      stage: 'DESIGN_RECEIVED',
      message: DEFAULT_STAGE_MESSAGES.DESIGN_RECEIVED,
      timestamp: new Date(),
      metadata: {
        orderNumber: payload.order_number || payload.name,
        lineItemsCount: customLineItems.length,
      },
    };

    // -------------------------------------------------------------------------
    // Idempotency: Return existing record if webhook is retried by Shopify
    // -------------------------------------------------------------------------
    const existing = await findTimelineByIdentifier(shopifyOrderId);
    if (existing.timeline) {
      return res.status(200).json({
        success: true,
        message: 'Order timeline already exists for this order ID (idempotent response).',
        timeline: existing.timeline,
      });
    }

    // -------------------------------------------------------------------------
    // Create new Timeline with Prisma (or Mongoose fallback)
    // -------------------------------------------------------------------------
    let createdTimeline = null;

    if (prisma?.customOrderTimeline) {
      try {
        createdTimeline = await prisma.customOrderTimeline.create({
          data: {
            shopifyOrderId,
            customerEmail: customerEmail.toLowerCase().trim(),
            currentStage: 'DESIGN_RECEIVED',
            history: [initialHistoryEntry],
            metadata: orderMetadata,
            shop,
          },
        });
      } catch (prismaError) {
        logError(`⚠️ Prisma customOrderTimeline creation failed: ${prismaError.message}`);
      }
    }

    if (!createdTimeline) {
      createdTimeline = await CustomOrderTimeline.create({
        shopifyOrderId,
        customerEmail: customerEmail.toLowerCase().trim(),
        currentStage: 'DESIGN_RECEIVED',
        history: [initialHistoryEntry],
        metadata: orderMetadata,
        shop,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Custom order timeline initialized to DESIGN_RECEIVED.',
      timeline: createdTimeline,
    });
  } catch (error) {
    logError(`❌ orders/create webhook error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Internal error processing order created webhook.',
      error: error.message,
    });
  }
};

/**
 * @desc    Fetch complete stage history and current status for a specific order.
 * @route   GET /api/orders/timeline/:orderId
 * @access  Public / Storefront / Customer
 */
export const getOrderTimeline = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId || !orderId.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required in URL parameter.',
      });
    }

    const { timeline } = await findTimelineByIdentifier(orderId);

    if (!timeline) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_TIMELINE_NOT_FOUND',
          message: `No timeline found for order ID "${orderId}".`,
          suggestion: 'Ensure the order was placed with a custom product and that the webhook has been processed.',
        },
      });
    }

    const currentStage = timeline.currentStage;
    const progressPercent = STAGE_PROGRESS_PERCENT[currentStage] || 0;
    const isCompleted = currentStage === 'SHIPPED';

    return res.status(200).json({
      success: true,
      timeline: {
        id: timeline.id || timeline._id,
        shopifyOrderId: timeline.shopifyOrderId,
        customerEmail: timeline.customerEmail,
        currentStage: timeline.currentStage,
        progressPercent,
        isCompleted,
        currentStageMessage:
          DEFAULT_STAGE_MESSAGES[currentStage] || 'Custom order is being processed.',
        history: timeline.history || [],
        metadata: timeline.metadata || null,
        shop: timeline.shop || null,
        createdAt: timeline.createdAt,
        updatedAt: timeline.updatedAt,
      },
    });
  } catch (error) {
    logError(`❌ getOrderTimeline error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve order timeline.',
      error: error.message,
    });
  }
};

/**
 * @desc    Update and advance an order's status stage, recording a new entry into history.
 * @route   PATCH /api/orders/timeline/:orderId/stage
 * @access  Merchant / Production Automation
 */
export const updateOrderTimelineStage = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { stage, message, metadata: eventMetadata } = req.body;

    if (!stage) {
      return res.status(400).json({
        success: false,
        message: 'stage is required in request body.',
        allowedStages: ORDER_TIMELINE_STAGES,
      });
    }

    const normalizedStage = String(stage).trim().toUpperCase();

    if (!ORDER_TIMELINE_STAGES.includes(normalizedStage)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stage "${stage}". Must be one of: ${ORDER_TIMELINE_STAGES.join(', ')}.`,
        allowedStages: ORDER_TIMELINE_STAGES,
      });
    }

    const { timeline, source } = await findTimelineByIdentifier(orderId);

    if (!timeline) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_TIMELINE_NOT_FOUND',
          message: `Cannot update stage: Order timeline not found for ID "${orderId}".`,
        },
      });
    }

    // Build the new timeline history entry
    const newHistoryEntry = {
      stage: normalizedStage,
      message:
        message && String(message).trim()
          ? String(message).trim()
          : DEFAULT_STAGE_MESSAGES[normalizedStage],
      timestamp: new Date(),
      metadata: eventMetadata || null,
    };

    let updatedTimeline = null;

    if (source === 'PRISMA' && prisma?.customOrderTimeline) {
      try {
        const existingHistory = Array.isArray(timeline.history) ? timeline.history : [];
        const mergedMetadata = eventMetadata
          ? { ...(timeline.metadata || {}), ...eventMetadata }
          : timeline.metadata;

        updatedTimeline = await prisma.customOrderTimeline.update({
          where: { id: timeline.id },
          data: {
            currentStage: normalizedStage,
            history: {
              set: [...existingHistory, newHistoryEntry],
            },
            metadata: mergedMetadata,
          },
        });
      } catch (prismaError) {
        logError(`⚠️ Prisma updateOrderTimelineStage error: ${prismaError.message}`);
      }
    }

    if (!updatedTimeline) {
      // Mongoose update
      const existingHistory = Array.isArray(timeline.history) ? timeline.history : [];
      timeline.currentStage = normalizedStage;
      timeline.history.push(newHistoryEntry);
      if (eventMetadata) {
        timeline.metadata = { ...(timeline.metadata || {}), ...eventMetadata };
      }
      updatedTimeline = await timeline.save();
    }

    const progressPercent = STAGE_PROGRESS_PERCENT[normalizedStage] || 0;

    return res.status(200).json({
      success: true,
      message: `Order timeline advanced to "${normalizedStage}".`,
      progressPercent,
      isCompleted: normalizedStage === 'SHIPPED',
      timeline: updatedTimeline,
    });
  } catch (error) {
    logError(`❌ updateOrderTimelineStage error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to update order timeline stage.',
      error: error.message,
    });
  }
};

export default {
  handleOrderCreatedWebhook,
  getOrderTimeline,
  updateOrderTimelineStage,
};
