import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { shopifyGraphql } from "../shopify-catalog.server";

const PRODUCT_VARIANTS_QUERY = `#graphql
  query CustomForgeProductVariants($id: ID!, $after: String) {
    product(id: $id) {
      id
      variants(first: 250, after: $after) {
        nodes {
          id
          title
          price
          availableForSale
          selectedOptions {
            name
            value
          }
          image {
            url
            altText
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const productId = new URL(request.url).searchParams.get("productId")?.trim();
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId || "")) {
    return Response.json(
      { success: false, message: "A valid Shopify product ID is required." },
      { status: 400 },
    );
  }

  try {
    const variants = [];
    let after = null;
    let hasNextPage = true;
    while (hasNextPage) {
      const data = await shopifyGraphql(
        admin,
        PRODUCT_VARIANTS_QUERY,
        { id: productId, after },
        session.shop,
      );
      if (data.product?.id !== productId) {
        return Response.json(
          { success: false, message: "The selected Shopify product was not found in this store." },
          { status: 404 },
        );
      }
      const connection = data.product.variants;
      if (!Array.isArray(connection?.nodes) || !connection.pageInfo) {
        throw new Error("Shopify returned an invalid variant matrix.");
      }
      variants.push(...connection.nodes.map((variant) => ({
        id: variant.id,
        title: variant.title,
        price: variant.price,
        availableForSale: variant.availableForSale,
        selectedOptions: variant.selectedOptions || [],
        image: variant.image?.url || "",
      })));
      if (variants.length > 2048) {
        return Response.json(
          { success: false, message: "This product exceeds Shopify’s 2,048-variant limit." },
          { status: 400 },
        );
      }
      hasNextPage = connection.pageInfo.hasNextPage === true;
      after = connection.pageInfo.endCursor;
      if (hasNextPage && !after) {
        throw new Error("Shopify variant pagination did not return a cursor.");
      }
    }

    return Response.json({ success: true, data: { productId, variants } });
  } catch (error) {
    console.error("[Shopify product variants] Unable to load variant matrix:", error);
    return Response.json(
      { success: false, message: error.message || "Unable to load Shopify variants." },
      { status: 502 },
    );
  }
};

export const headers = (headersArgs) => boundary.headers(headersArgs);
