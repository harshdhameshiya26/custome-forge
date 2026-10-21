import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[Shopify Webhook] Received ${topic} for ${shop}`);

  try {
    const appSub = payload?.app_subscription || payload;
    const adminGid =
      appSub?.admin_graphql_api_id ||
      (appSub?.id ? `gid://shopify/AppSubscription/${appSub.id}` : null);
    const status = String(appSub?.status || "ACTIVE").toUpperCase();

    const normalizedShop = String(shop || "")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .toLowerCase();

    if (db.subscription) {
      await db.subscription.updateMany({
        where: {
          OR: [
            ...(adminGid ? [{ shopifySubscriptionId: adminGid }] : []),
            { shopDomain: { equals: normalizedShop, mode: "insensitive" } },
          ],
        },
        data: {
          status,
          updatedAt: new Date(),
        },
      });
    }
  } catch (error) {
    console.error("[Billing Webhook Error] app/subscriptions/update:", error.message);
  }

  return new Response();
};
