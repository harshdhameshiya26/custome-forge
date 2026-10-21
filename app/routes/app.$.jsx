import { useLocation, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Box, Banner, Button, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

import Dashboard from "../../src/pages/Dashboard";
import CustomizerEditor from "../../src/pages/CustomizerEditor";
import ProofApproval from "../../src/pages/ProofApproval";
import OrderTracking from "../../src/pages/OrderTracking";
import CustomerDesigns from "../../src/pages/CustomerDesigns";
import MerchantDashboard from "../../src/pages/MerchantDashboard";
import Billing from "../../src/pages/Billing";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function AppSplatRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname.replace(/\/$/, "");

  if (path.startsWith("/app/editor") || path.startsWith("/app/customize")) {
    return <CustomizerEditor />;
  }
  if (path.startsWith("/app/proof")) {
    return <ProofApproval />;
  }
  if (path.startsWith("/app/order") || path.startsWith("/app/tracking")) {
    return <OrderTracking />;
  }
  if (path.startsWith("/app/design") || path.startsWith("/app/my-design")) {
    return <CustomerDesigns />;
  }
  if (path.startsWith("/app/merchant")) {
    return <MerchantDashboard />;
  }
  if (path.startsWith("/app/billing") || path.startsWith("/app/pricing") || path.startsWith("/app/subscription")) {
    return <Billing />;
  }
  if (path.startsWith("/app/dashboard") || path.startsWith("/app/catalog") || path.startsWith("/app/product")) {
    return <Dashboard />;
  }

  return (
    <Box padding="600">
      <Banner title="Page Not Found" tone="critical">
        <Box paddingBlockEnd="300">
          <Text as="p" variant="bodyMd">
            The requested page <code>{location.pathname}</code> does not exist or has moved.
          </Text>
        </Box>
        <Button onClick={() => navigate("/app")}>Return to Product Catalog</Button>
      </Banner>
    </Box>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
