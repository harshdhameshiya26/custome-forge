import { useEffect } from "react";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider, Frame } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";
import { reportClientError } from "../../src/services/api";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations}>
        <Frame>
          <s-app-nav>
            <s-link href="/app/orders">Orders</s-link>
            <s-link href="/app/production-scheduling">Supplier Scheduling</s-link>
            <s-link href="/app/designs">Designs</s-link>
            <s-link href="/app/templates">Templates</s-link>
            <s-link href="/app/production">Production</s-link>
            <s-link href="/app/settings">Settings</s-link>
            <s-link href="/app/editor">Customizer Studio</s-link>
            <s-link href="/app/proofs">Proof Approval</s-link>
            <s-link href="/app/user">User</s-link>
            <s-link href="/app/billing">Billing</s-link>
          </s-app-nav>
          <Outlet />
        </Frame>
      </PolarisAppProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  const error = useRouteError();
  useEffect(() => {
    reportClientError({
      category: 'route-error',
      message: error?.message || error?.statusText || String(error || 'Unknown route error'),
      stack: error?.stack,
    });
  }, [error]);

  return boundary.error(error);
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
