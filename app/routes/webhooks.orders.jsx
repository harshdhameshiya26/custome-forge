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

const readLineItemProperties = (properties) => {
  if (Array.isArray(properties)) {
    return properties.reduce((result, property) => {
      if (property?.name && property.value !== undefined && property.value !== null) {
        result[property.name] = String(property.value);
      }
      return result;
    }, {});
  }

  if (properties && typeof properties === "object") {
    return Object.fromEntries(
      Object.entries(properties).map(([name, value]) => [name, String(value ?? "")]),
    );
  }

  return {};
};

const getCustomerName = (customer) =>
  [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim();

const getSafeDesignUrl = (value) => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".shopify.com")
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

let customOrderSequenceIndex;

const getNextCustomReference = async (shop) => {
  if (!customOrderSequenceIndex) {
    customOrderSequenceIndex = db
      .$runCommandRaw({
        createIndexes: "tbl_CustomOrderSequence",
        indexes: [{
          key: { shop: 1 },
          name: "shop_1",
          unique: true,
        }],
      })
      .catch((error) => {
        customOrderSequenceIndex = undefined;
        throw error;
      });
  }
  await customOrderSequenceIndex;

  const result = await db.$runCommandRaw({
    findAndModify: "tbl_CustomOrderSequence",
    query: { shop },
    update: {
      $inc: { nextNumber: 1 },
      $setOnInsert: { shop },
    },
    upsert: true,
    new: true,
  });
  const nextNumber = result?.value?.nextNumber;
  if (!Number.isSafeInteger(nextNumber) || nextNumber < 1) {
    throw new Error("MongoDB did not return the next CustomForge order number.");
  }

  return String(nextNumber).padStart(5, "0");
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
    if (normalizedTopic.includes("CREATE") || normalizedTopic.includes("PAID")) {
      const customLineItems = (payload.line_items || []).map((item) => ({
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        productId: item.product_id || null,
        variantId: item.variant_id || null,
        variantTitle: item.variant_title || null,
        properties: item.properties || [],
        customAttributes: readLineItemProperties(item.properties),
      }));
      const customDesigns = customLineItems
        .filter((item) => item.customAttributes["CustomForge Design"] === "Yes")
        .map((item) => ({
          title: item.customAttributes["Product title"] || item.title,
          variantTitle: item.variantTitle || "",
          quantity: item.quantity,
          productImageUrl: getSafeDesignUrl(item.image?.src),
          imageUrl: getSafeDesignUrl(item.customAttributes["Design photo"]),
          text: item.customAttributes["Design text"] || "",
          fontFamily: item.customAttributes["Font family"] || "",
          textColor: item.customAttributes["Text color"] || "",
          textStyle: item.customAttributes["Text style"] || "",
          textAlignment: item.customAttributes["Text alignment"] || "",
          textSize: item.customAttributes["Text size"] || "",
          textRotation: item.customAttributes["Text rotation"] || "",
          uploadedArtwork: item.customAttributes["Uploaded artwork"] || "",
          uploadedArtworkSize: item.customAttributes["Uploaded artwork size"] || "",
          uploadedArtworkRotation: item.customAttributes["Uploaded artwork rotation"] || "",
          stickers: item.customAttributes.Stickers || "",
          stickerColor: item.customAttributes["Sticker color"] || "",
          productColor: item.customAttributes["Product color"] || "",
          productSize: item.customAttributes["Product size"] || "",
          variantId: item.variantId,
          properties: item.customAttributes,
        }));
      const submittedCustomer = customLineItems
        .map((item) => item.customAttributes["Customer name"])
        .find(Boolean);
      const submittedEmail = customLineItems
        .map((item) => item.customAttributes["Customer email"])
        .find(Boolean);
      const customerName =
        getCustomerName(payload.customer) || submittedCustomer || null;
      const customerEmail =
        payload.email ||
        payload.contact_email ||
        payload.customer?.email ||
        submittedEmail ||
        "customer@myshopify.com";

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
              customDesigns,
            },
            shop,
          },
        });
      }

      if (customDesigns.length > 0) {
        const isPaid = String(payload.financial_status || "").toLowerCase() === "paid";
        if (normalizedTopic.includes("PAID") && !isPaid) {
          console.warn(
            `[Shopify Webhook] Ignoring orders/paid for ${shopifyOrderId}: financial status is "${payload.financial_status || "missing"}".`,
          );
          return new Response();
        }

        const existingCustomOrder = await db.customOrder.findFirst({
          where: {
            OR: [{ shopifyOrderId }, { orderId: shopifyOrderId }],
          },
        });

        const existingReference =
          existingCustomOrder?.customReference ||
          existingCustomOrder?.metadata?.customReference;
        const customReference =
          existingReference || (isPaid ? await getNextCustomReference(shop) : null);
        const firstDesign = customDesigns[0];
        const metadata = {
          ...(existingCustomOrder?.metadata || {}),
          ...(customReference ? { customReference } : {}),
          customerName,
          orderNumber: payload.order_number || payload.name,
          totalPrice: payload.total_price,
          currency: payload.currency,
          financialStatus: payload.financial_status,
          ...(isPaid
            ? { paidAt: payload.processed_at || new Date().toISOString() }
            : {}),
          customDesigns,
          customLineItems,
        };

        if (existingCustomOrder) {
          await db.customOrder.update({
            where: { id: existingCustomOrder.id },
            data: {
              customerEmail: customerEmail.toLowerCase().trim(),
              productType: existingCustomOrder.productType || firstDesign.title,
              customizationType:
                existingCustomOrder.customizationType ||
                firstDesign.textStyle ||
                "Customer designed",
              shop: existingCustomOrder.shop || shop,
              ...(isPaid && existingCustomOrder.status === "DRAFT"
                ? { status: "PENDING_APPROVAL" }
                : {}),
              metadata,
            },
          });
        } else {
          await db.customOrder.create({
            data: {
              orderId: shopifyOrderId,
              shopifyOrderId,
              customerEmail: customerEmail.toLowerCase().trim(),
              productType: firstDesign.title,
              customizationType: firstDesign.textStyle || "Customer designed",
              status: isPaid ? "PENDING_APPROVAL" : "DRAFT",
              shop,
              metadata,
            },
          });
        }
        console.info(
          `[Shopify Webhook] CustomForge order ${shopifyOrderId} saved with payment status "${payload.financial_status || "unknown"}".`,
        );
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
    console.error(`[Shopify Webhook Error] ${topic}:`, error);
    return new Response("Webhook processing failed", { status: 500 });
  }

  return new Response();
};
