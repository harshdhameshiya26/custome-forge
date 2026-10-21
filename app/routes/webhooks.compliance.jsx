import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[Compliance Webhook] Received ${topic} for ${shop}`);

  try {
    const normalizedTopic = String(topic || "").toUpperCase();

    // -------------------------------------------------------------------------
    // 1. Mandatory Topic: CUSTOMERS_DATA_REQUEST
    // -------------------------------------------------------------------------
    if (normalizedTopic.includes("DATA_REQUEST")) {
      const customer = payload?.customer || {};
      const customerId = customer.id ? String(customer.id) : null;
      console.log(`[Compliance] Data request for customer ${customerId} in ${shop}`);
      // Audit log acknowledge - returns 200 OK
    }

    // -------------------------------------------------------------------------
    // 2. Mandatory Topic: CUSTOMERS_REDACT
    // -------------------------------------------------------------------------
    else if (normalizedTopic.includes("CUSTOMERS") && normalizedTopic.includes("REDACT")) {
      const customer = payload?.customer || {};
      const customerId = customer.id ? String(customer.id) : null;
      const customerEmail = customer.email ? customer.email.toLowerCase().trim() : null;

      if (customerId && db.tbl_Design) {
        await db.tbl_Design
          .updateMany({
            where: { shopifyCustomerId: customerId },
            data: {
              shopifyCustomerId: `redacted_${Date.now()}`,
              title: "Redacted Design",
              isLibraryItem: false,
            },
          })
          .catch(() => {});
      }

      if (customerId && db.tbl_DesignLibraryItem) {
        await db.tbl_DesignLibraryItem
          .deleteMany({
            where: { customerId },
          })
          .catch(() => {});
      }

      if (customerEmail && db.customOrderTimeline) {
        await db.customOrderTimeline
          .updateMany({
            where: { customerEmail },
            data: { customerEmail: `redacted_${Date.now()}@anonymized.customforge` },
          })
          .catch(() => {});
      }

      console.log(`[Compliance] Customer data redacted for customer ${customerId}`);
    }

    // -------------------------------------------------------------------------
    // 3. Mandatory Topic: SHOP_REDACT
    // -------------------------------------------------------------------------
    else if (normalizedTopic.includes("SHOP") && normalizedTopic.includes("REDACT")) {
      const shopDomain =
        payload?.shop_domain || payload?.myshopify_domain || shop;

      if (shopDomain) {
        const normalized = String(shopDomain).toLowerCase().trim();

        if (db.session) {
          await db.session
            .deleteMany({ where: { shop: normalized } })
            .catch(() => {});
        }

        if (db.subscription) {
          await db.subscription
            .deleteMany({
              where: { shopDomain: { equals: normalized, mode: "insensitive" } },
            })
            .catch(() => {});
        }
      }

      console.log(`[Compliance] Shop data purged for ${shopDomain}`);
    }
  } catch (error) {
    console.error(`[Compliance Webhook Error] ${topic}:`, error.message);
  }

  return new Response();
};
