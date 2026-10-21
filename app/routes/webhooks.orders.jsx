import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Normalizes Shopify Order ID (stripping GID prefix if present).
 * e.g. "gid://shopify/Order/8209829119461" -> "8209829119461"
 */
const normalizeOrderId = (rawId) => {
  if (!rawId) return "";
  const str = String(rawId).trim();
  const match = str.match(/Order\/(\d+)/);
  return match ? match[1] : str;
};

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[Shopify Webhook] Received ${topic} for ${shop}`);

  const rawOrderId = payload?.id || payload?.order_id;
  if (!rawOrderId) {
    return new Response();
  }

  const shopifyOrderId = normalizeOrderId(rawOrderId);
  const normalizedTopic = String(topic || "").toUpperCase();

  try {
    // ---------------------------------------------------------------------------
    // Topic: ORDERS_CREATE
    // ---------------------------------------------------------------------------
    if (normalizedTopic.includes("CREATE")) {
      const customerEmail =
        payload.email ||
        payload.contact_email ||
        payload.customer?.email ||
        "customer@myshopify.com";

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

      const existing = await db.customOrderTimeline.findFirst({
        where: { shopifyOrderId },
      });

      if (!existing) {
        await db.customOrderTimeline.create({
          data: {
            shopifyOrderId,
            customerEmail: customerEmail.toLowerCase().trim(),
            currentStage: "DESIGN_RECEIVED",
            history: [
              {
                stage: "DESIGN_RECEIVED",
                message:
                  "Your design has been received and queued for prepress inspection.",
                timestamp: new Date(),
                metadata: {
                  orderNumber: payload.order_number || payload.name,
                  lineItemsCount: customLineItems.length,
                },
              },
            ],
            metadata: {
              orderNumber: payload.order_number || payload.name,
              totalPrice: payload.total_price,
              currency: payload.currency,
              financialStatus: payload.financial_status,
              customLineItems,
            },
            shop,
          },
        });
      }
    }

    // ---------------------------------------------------------------------------
    // Topic: ORDERS_FULFILLED
    // ---------------------------------------------------------------------------
    else if (normalizedTopic.includes("FULFILL")) {
      const fulfillments = payload.fulfillments || [];
      const first = fulfillments[0] || {};
      const trackingNumber =
        first.tracking_number ||
        (first.tracking_numbers && first.tracking_numbers[0]) ||
        payload.tracking_number ||
        null;
      const trackingCompany =
        first.tracking_company || payload.tracking_company || null;
      const trackingUrl =
        first.tracking_url ||
        (first.tracking_urls && first.tracking_urls[0]) ||
        payload.tracking_url ||
        null;

      const timeline = await db.customOrderTimeline.findFirst({
        where: { shopifyOrderId },
      });

      if (timeline) {
        const existingHistory = Array.isArray(timeline.history)
          ? timeline.history
          : [];
        const fulfillmentMeta = {
          trackingNumber,
          trackingCompany,
          trackingUrl,
          fulfilledAt: new Date().toISOString(),
        };

        const newEntry = {
          stage: "SHIPPED",
          message: trackingNumber
            ? `Manufacturing complete and package shipped via ${trackingCompany || "carrier"}! Tracking: ${trackingNumber}`
            : "Manufacturing complete! Your custom order has shipped and is on its way.",
          timestamp: new Date(),
          metadata: fulfillmentMeta,
        };

        await db.customOrderTimeline.update({
          where: { id: timeline.id },
          data: {
            currentStage: "SHIPPED",
            history: { set: [...existingHistory, newEntry] },
            metadata: {
              ...(timeline.metadata || {}),
              fulfillment: fulfillmentMeta,
            },
          },
        });

        // Mark customOrder as COMPLETED
        await db.customOrder
          .updateMany({
            where: { OR: [{ orderId: shopifyOrderId }, { shopifyOrderId }] },
            data: { status: "COMPLETED" },
          })
          .catch(() => {});
      }
    }

    // ---------------------------------------------------------------------------
    // Topic: ORDERS_CANCELLED
    // ---------------------------------------------------------------------------
    else if (normalizedTopic.includes("CANCEL")) {
      const cancelReason = payload.cancel_reason || "Cancelled in Shopify";
      const timeline = await db.customOrderTimeline.findFirst({
        where: { shopifyOrderId },
      });

      if (timeline) {
        const existingHistory = Array.isArray(timeline.history)
          ? timeline.history
          : [];
        const newEntry = {
          stage: timeline.currentStage || "DESIGN_RECEIVED",
          message: `Order was cancelled in Shopify (Reason: ${cancelReason}). Production stopped.`,
          timestamp: new Date(),
          metadata: { cancelReason, cancelledAt: new Date().toISOString() },
        };

        await db.customOrderTimeline.update({
          where: { id: timeline.id },
          data: {
            history: { set: [...existingHistory, newEntry] },
          },
        });

        await db.customOrder
          .updateMany({
            where: { OR: [{ orderId: shopifyOrderId }, { shopifyOrderId }] },
            data: { status: "CANCELLED" },
          })
          .catch(() => {});
      }
    }

    // ---------------------------------------------------------------------------
    // Topic: ORDERS_UPDATED
    // ---------------------------------------------------------------------------
    else {
      const timeline = await db.customOrderTimeline.findFirst({
        where: { shopifyOrderId },
      });

      if (timeline) {
        await db.customOrderTimeline.update({
          where: { id: timeline.id },
          data: {
            metadata: {
              ...(timeline.metadata || {}),
              financialStatus:
                payload.financial_status || timeline.metadata?.financialStatus,
              fulfillmentStatus:
                payload.fulfillment_status ||
                timeline.metadata?.fulfillmentStatus,
            },
          },
        });
      }
    }
  } catch (error) {
    console.error(`[Shopify Webhook Error] ${topic}:`, error.message);
  }

  return new Response();
};
