import UserPage from "../../src/pages/User";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function UserRoute() {
  return <UserPage />;
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
