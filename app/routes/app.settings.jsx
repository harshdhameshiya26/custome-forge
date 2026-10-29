import { useLoaderData } from "react-router";
import Settings from "../../src/pages/Settings";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { isCustomForgePublishedDesignProduct } from "../utils/customforge-published-design";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const customOrders = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
        query CustomForgeCustomProductOrders($after: String) {
          orders(first: 100, after: $after, reverse: true, sortKey: CREATED_AT, query: "status:any") {
            nodes {
              id
              name
              createdAt
              lineItems(first: 100) {
                nodes {
                  title
                  variant {
                    product {
                      tags
                      vendor
                      description
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }`,
      { variables: { after: cursor } },
    );
    const result = await response.json();

    if (result.errors?.length) {
      console.error("[Settings] Unable to load Shopify customer orders:", result.errors);
      throw new Response("Unable to load customized-product customer orders.", { status: 502 });
    }

    const page = result.data?.orders;
    if (!page) {
      throw new Response("Shopify returned no order data.", { status: 502 });
    }

    for (const order of page.nodes || []) {
      const products = (order.lineItems?.nodes || [])
        .filter((lineItem) =>
          isCustomForgePublishedDesignProduct(lineItem.variant?.product),
        )
        .map((lineItem) => lineItem.title);

      if (products.length === 0) continue;

      customOrders.push({
        orderNumber: order.name,
        createdAt: order.createdAt,
        shopifyOrderId: order.id.split("/").pop(),
        products,
      });
    }

    hasNextPage = page.pageInfo?.hasNextPage === true;
    cursor = page.pageInfo?.endCursor || null;
    if (hasNextPage && !cursor) {
      throw new Response("Shopify order pagination returned no cursor.", { status: 502 });
    }
  }

  return { customOrders };
};

export default function SettingsRoute() {
  const { customOrders } = useLoaderData();
  return <Settings customOrders={customOrders} />;
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
