import Billing from "../../src/pages/Billing";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function BillingRoute() {
  return <Billing />;
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
