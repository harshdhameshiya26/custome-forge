import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query getProducts {
        products(first: 25) {
          nodes {
            id
            title
            handle
            status
            totalInventory
            featuredMedia {
              ... on MediaImage {
                image {
                  url
                  altText
                }
              }
            }
            variants(first: 1) {
              nodes {
                id
                price
              }
            }
          }
        }
      }`,
  );

  const data = await response.json();
  const products = data?.data?.products?.nodes || [];

  return { products };
};

export default function Index() {
  const { products } = useLoaderData();
  const shopify = useAppBridge();

  return (
    <s-page heading="CustomForge - Products & Customizer">
      <s-section heading={`Store Products (${products.length})`}>
        <s-paragraph>
          Real products loaded from your Shopify store catalog. Select a product to view or configure customization rules.
        </s-paragraph>

        {products.length === 0 ? (
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-paragraph>No products found in this store yet. Add products in your Shopify Admin to get started.</s-paragraph>
          </s-box>
        ) : (
          <s-stack direction="block" gap="base">
            {products.map((product) => {
              const imageUrl = product.featuredMedia?.image?.url;
              const price = product.variants?.nodes?.[0]?.price;

              return (
                <s-box
                  key={product.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                >
                  <s-stack direction="inline" gap="base" align="center" justify="space-between">
                    <s-stack direction="inline" gap="base" align="center">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={product.title}
                          style={{
                            width: "48px",
                            height: "48px",
                            objectFit: "cover",
                            borderRadius: "6px",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            background: "#e5e7eb",
                            borderRadius: "6px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "12px",
                            color: "#6b7280",
                          }}
                        >
                          No img
                        </div>
                      )}
                      <div>
                        <strong>{product.title}</strong>
                        <div style={{ fontSize: "12px", color: "#6b7280" }}>
                          Status: {product.status} | Price: {price ? `$${price}` : "N/A"} | Inventory: {product.totalInventory ?? 0}
                        </div>
                      </div>
                    </s-stack>

                    <s-button
                      onClick={() => {
                        shopify.intents.invoke?.("edit:shopify/Product", {
                          value: product.id,
                        });
                      }}
                      variant="secondary"
                    >
                      View in Admin
                    </s-button>
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="CustomForge Status">
        <s-paragraph>
          <s-text>Backend API: </s-text>
          <strong>Direct REST API (Port 5000)</strong>
        </s-paragraph>
        <s-paragraph>
          <s-text>Data Mode: </s-text>
          <strong>Live Store &amp; MongoDB Real Data</strong>
        </s-paragraph>
        <s-paragraph>
          <s-text>App Proxy: </s-text>
          <strong>Disabled (Direct access)</strong>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
