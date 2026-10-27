import { useLoaderData } from 'react-router';
import ProductionScheduling from '../../src/pages/ProductionScheduling';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { authenticate } from '../shopify.server';
import { syncCustomOrdersToBackend } from '../utils/sync-custom-orders.server';
import { isCustomForgePublishedDesignProduct } from '../utils/customforge-published-design';

const eligibleFinancialStatuses = new Set(['PAID', 'AUTHORIZED']);

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
      query CustomForgeOrdersForScheduling {
        orders(first: 100, reverse: true, sortKey: CREATED_AT, query: "status:any") {
          nodes {
            id
            name
            createdAt
            cancelledAt
            displayFinancialStatus
            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
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
    console.error('[CustomForge scheduling] Shopify orders query failed:', result.errors);
    throw new Response('Unable to load Shopify orders for production scheduling.', {
      status: 502,
    });
  }

  const orders = (result.data?.orders?.nodes || [])
    .map((order) => {
      const financialStatus = order.displayFinancialStatus || 'UNKNOWN';
      const lineItems = order.lineItems.nodes.map((lineItem) => {
        const properties = Object.fromEntries(
          lineItem.customAttributes.map(({ key, value }) => [key, value]),
        );
        return { ...lineItem, properties };
      });
      const customDesigns = lineItems
        .filter(
          (lineItem) =>
            isCustomForgePublishedDesignProduct(lineItem.variant?.product) ||
            String(lineItem.properties['CustomForge Design'] || '').toLowerCase() === 'yes',
        )
        .map((lineItem) => ({
          title: lineItem.properties['Product title'] || lineItem.title,
          productId: lineItem.variant?.product?.id || null,
          variantTitle: lineItem.variant?.title || '',
          variantId: lineItem.variant?.id?.split('/').pop() || null,
          quantity: lineItem.quantity,
          imageUrl:
            lineItem.properties['Design photo'] ||
            lineItem.variant?.product?.featuredImage?.url ||
            null,
          productImageUrl:
            lineItem.variant?.image?.url ||
            lineItem.variant?.product?.featuredImage?.url ||
            null,
          isPublishedCustomForgeProduct: isCustomForgePublishedDesignProduct(
            lineItem.variant?.product,
          ),
          productTags: lineItem.variant?.product?.tags || [],
          productImageAlt:
            lineItem.variant?.image?.altText ||
            lineItem.variant?.product?.featuredImage?.altText ||
            lineItem.title,
          properties: lineItem.properties,
        }));

      if (
        order.cancelledAt ||
        !eligibleFinancialStatuses.has(financialStatus) ||
        customDesigns.length === 0
      ) {
        return null;
      }

      return {
        id: order.name,
        rawId: order.id.split('/').pop(),
        shopifyOrderId: order.id.split('/').pop(),
        date: new Date(order.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        product: customDesigns.map((design) => design.title).join(', '),
        customer: 'Shopify customer',
        financialStatus,
        totalPrice: order.currentTotalPriceSet?.shopMoney?.amount || null,
        currency: order.currentTotalPriceSet?.shopMoney?.currencyCode || null,
        customDesigns,
      };
    })
    .filter(Boolean);

  try {
    await syncCustomOrdersToBackend(orders, session.shop);
  } catch (error) {
    console.error('[CustomForge scheduling] Failed to sync eligible Shopify orders:', error);
    throw new Response('Unable to prepare eligible orders for supplier scheduling.', {
      status: 502,
    });
  }

  return { shopOrders: orders };
};

export default function ProductionSchedulingRoute() {
  const { shopOrders } = useLoaderData();
  return <ProductionScheduling shopOrders={shopOrders} />;
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
