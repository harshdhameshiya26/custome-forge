import Dashboard from "../../src/pages/Dashboard";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(
      `#graphql
      query getStoreProducts {
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              status
              vendor
              productType
              description
              featuredImage {
                url
                altText
              }
              variants(first: 10) {
                edges {
                  node {
                    id
                    price
                    inventoryQuantity
                    title
                  }
                }
              }
            }
          }
        }
      }`
    );

    const responseJson = await response.json();
    const products = responseJson.data?.products?.edges?.map((edge) => edge.node) || [];

    return { products, shop: session.shop };
  } catch (error) {
    console.error("Failed to fetch store products:", error);
    return { products: [], shop: session.shop, error: error.message };
  }
};

export default function Index() {
  return <Dashboard />;
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
