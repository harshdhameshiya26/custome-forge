import { Outlet, useLoaderData, useRouteError, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

// Import all application pages
import Dashboard from "../../src/pages/Dashboard";
import CustomizerEditor from "../../src/pages/CustomizerEditor";
import ProofApproval from "../../src/pages/ProofApproval";
import OrderTracking from "../../src/pages/OrderTracking";
import CustomerDesigns from "../../src/pages/CustomerDesigns";
import MerchantDashboard from "../../src/pages/MerchantDashboard";
import Billing from "../../src/pages/Billing";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
  const location = useLocation();

  // Route matching helper for calling pages inside Shopify embedded admin layout
  const renderActivePage = () => {
    const path = location?.pathname?.replace(/\/$/, "") || "";

    if (path === "/app/dashboard" || path === "/app/merchant") {
      return <MerchantDashboard />;
    }
    if (path.startsWith("/app/editor") || path.startsWith("/app/customize")) {
      return <CustomizerEditor />;
    }
    if (path.startsWith("/app/proofs") || path.startsWith("/app/proof")) {
      return <ProofApproval />;
    }
    if (path.startsWith("/app/orders") || path.startsWith("/app/order") || path.startsWith("/app/tracking")) {
      return <OrderTracking />;
    }
    if (path === "/app/designs" || path === "/app/my-designs") {
      return <CustomerDesigns />;
    }
    if (path === "/app/billing" || path === "/app/pricing" || path === "/app/subscription") {
      return <Billing />;
    }
    if (path === "/app/catalog" || path === "/app/products") {
      return <Dashboard />;
    }

    // Default to Outlet for nested routes (e.g., /app renders app._index.jsx)
    return <Outlet />;
  };

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Product Catalog</s-link>
        <s-link href="/app/dashboard">Merchant Dashboard</s-link>
        <s-link href="/app/editor">Customizer Editor</s-link>
        <s-link href="/app/proofs">Proof Approval</s-link>
        <s-link href="/app/orders">Order Tracking</s-link>
        <s-link href="/app/designs">Customer Designs</s-link>
        <s-link href="/app/billing">Billing & Plans</s-link>
      </s-app-nav>
      {renderActivePage()}
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

