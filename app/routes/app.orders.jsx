import { useLoaderData } from "react-router";
import OrderTracking from "../../src/pages/OrderTracking";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { isCustomForgeLineItem, isCustomForgePublishedDesignProduct } from "../utils/customforge-published-design";
import { syncCustomOrdersToBackend } from "../utils/sync-custom-orders.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
      query CustomForgeRecentOrders {
        orders(first: 100, reverse: true, sortKey: CREATED_AT, query: "status:any") {
          nodes {
            id
            name
            createdAt
            displayFinancialStatus
            lineItems(first: 100) {
              nodes {
                title
                quantity
                variant {
                  id
                  title
                  image {
                    url
                    altText
                  }
                  product {
                    id
                    tags
                    vendor
                    description
                    featuredImage {
                      url
                      altText
                    }
                  }
                }
                customAttributes {
                  key
                  value
                }
              }
            }
          }
        }
      }`,
  );
  const result = await response.json();
  if (result.errors?.length) {
    throw new Response('Unable to load recent Shopify orders.', { status: 502 });
  }

  const orders = (result.data?.orders?.nodes || [])
    .map((order) => {
      const lineItems = order.lineItems.nodes.map((lineItem) => {
        const properties = Object.fromEntries(
          lineItem.customAttributes.map(({ key, value }) => [key, value]),
        );
        return {
          ...lineItem,
          properties,
        };
      });
      const customDesigns = lineItems
        .filter((lineItem) =>
          isCustomForgeLineItem(lineItem),
        )
        .map((lineItem) => ({
          title: lineItem.title,
          productId: lineItem.variant?.product?.id || null,
          variantId: lineItem.variant?.id || null,
          variantTitle: lineItem.variant?.title || '',
          quantity: lineItem.quantity,
          imageUrl: lineItem.variant?.product?.featuredImage?.url || null,
          productImageUrl:
            lineItem.variant?.product?.featuredImage?.url ||
            lineItem.variant?.image?.url ||
            null,
          isPublishedCustomForgeProduct: true,
          productTags: lineItem.variant?.product?.tags || [],
          productVendor: lineItem.variant?.product?.vendor || '',
          productImageAlt:
            lineItem.variant?.image?.altText ||
            lineItem.variant?.product?.featuredImage?.altText ||
            lineItem.title,
          properties: lineItem.properties || {},
        }));

      if (customDesigns.length === 0) return null;
      const normalizedId = order.id.split('/').pop();
      return {
        id: order.name,
        rawId: normalizedId,
        shopifyOrderId: normalizedId,
        date: new Date(order.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        product: customDesigns.map((design) => design.title).join(', '),
        customer: 'Shopify customer',
        customerName: customDesigns[0]?.properties?.['Customer Name'] || 'Shopify customer',
        customerEmail: customDesigns[0]?.properties?.['Customer Email'] || '',
        financialStatus: order.displayFinancialStatus || 'UNKNOWN',
        customDesigns,
      };
    })
    .filter(Boolean);

  let syncWarning = null;
  try {
    await syncCustomOrdersToBackend(orders, session.shop);
  } catch (error) {
    console.error('[CustomForge orders] Could not sync verified custom orders:', error);
    syncWarning =
      'Shopify custom orders loaded, but the order details could not be synced to production tracking. Refresh to try again.';
  }

  return { shopOrders: orders, syncWarning };
};

export default function OrdersRoute() {
  const { shopOrders, syncWarning } = useLoaderData();
  return <OrderTracking shopOrders={shopOrders} syncWarning={syncWarning} />;
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
