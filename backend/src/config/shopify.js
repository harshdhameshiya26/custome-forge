/* eslint-env node */

import "@shopify/shopify-api/adapters/node";
import dotenv from "dotenv";
import { ApiVersion, LogSeverity, shopifyApi } from "@shopify/shopify-api";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
dotenv.config({ path: envPath });

const requiredEnv = [
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
  "SCOPES",
];
const missingEnv = requiredEnv.filter((name) => !process.env[name]?.trim());

if (missingEnv.length > 0) {
  throw new Error(
    `Missing Shopify environment variable(s): ${missingEnv.join(", ")}. Configure them in ${envPath} or the deployment environment.`,
  );
}

let appUrl;

try {
  appUrl = new URL(process.env.SHOPIFY_APP_URL);
} catch (error) {
  throw new Error("SHOPIFY_APP_URL must be a valid absolute URL.", {
    cause: error,
  });
}

if (!["http:", "https:"].includes(appUrl.protocol)) {
  throw new Error("SHOPIFY_APP_URL must use http or https.");
}

const scopes = process.env.SCOPES.split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

if (scopes.length === 0) {
  throw new Error("SCOPES must contain at least one Shopify access scope.");
}

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes,
  hostName: appUrl.hostname,
  hostScheme: appUrl.protocol.slice(0, -1),
  apiVersion: ApiVersion.July26,
  isEmbeddedApp: true,
  logger: {
    level:
      process.env.NODE_ENV === "production"
        ? LogSeverity.Error
        : LogSeverity.Info,
  },
});

export default shopify;