import CustomizerEditor from "../../src/pages/CustomizerEditor";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { loadCustomizerCatalog } from "../shopify-customizer-catalog.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    return {
      storeProducts: await loadCustomizerCatalog(admin, session.shop),
      catalogError: "",
    };
  } catch (error) {
    console.error("[Customizer catalog] Unable to load Shopify products:", error);
    return {
      storeProducts: [],
      catalogError: error.message || "Unable to load Shopify products.",
    };
  }
};

export default function EditorRoute() {
  const loaderData = useLoaderData();
  return (
    <CustomizerEditor
      storeProducts={loaderData?.storeProducts || []}
      catalogError={loaderData?.catalogError || ""}
    />
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
