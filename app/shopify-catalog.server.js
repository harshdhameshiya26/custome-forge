import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../backend/.env'),
});

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-07';

const normalizeShopDomain = (shop) => {
  const normalized = String(shop || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)) {
    throw new Error('Shopify shop domain must be a valid *.myshopify.com domain.');
  }

  return normalized;
};

async function shopifyGraphqlWithEnvToken(shop, query, variables) {
  const accessToken = (
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
    process.env.SHOPIFY_ACCESS_TOKEN
  )?.trim();
  if (!accessToken) return undefined;

  const configuredShop = normalizeShopDomain(process.env.SHOPIFY_SHOP);
  const authenticatedShop = normalizeShopDomain(shop);
  if (configuredShop !== authenticatedShop) {
    throw new Error('The configured Shopify token is not authorized for this store.');
  }

  const response = await fetch(
    `https://${configuredShop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  const result = await response.json().catch(() => null);

  if (!response.ok || result?.errors?.length) {
    const message = result?.errors?.map((error) => error.message).join(' ') ||
      `Shopify Admin API request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    error.graphQLErrors = result?.errors || [];
    throw error;
  }

  if (!result?.data || typeof result.data !== 'object') {
    throw new Error('Shopify returned an empty Admin API response.');
  }

  return result.data;
}

export async function shopifyGraphql(admin, query, variables = {}, shop) {
  const hasEnvToken = Boolean(
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim() ||
    process.env.SHOPIFY_ACCESS_TOKEN?.trim(),
  );

  if (hasEnvToken) {
    let tokenMatchesShop = false;
    try {
      const configuredShop = normalizeShopDomain(process.env.SHOPIFY_SHOP);
      const authenticatedShop = normalizeShopDomain(shop);
      tokenMatchesShop = configuredShop === authenticatedShop;
    } catch {
      console.warn(
        '[Shopify Admin API] Environment token configuration is invalid; using the authenticated app session.',
      );
    }

    if (tokenMatchesShop) {
      try {
        return await shopifyGraphqlWithEnvToken(shop, query, variables);
      } catch (error) {
        const isReadQuery = /^\s*(?:#graphql\s*)?query\b/i.test(query);
        const isAuthRejection = error.status === 401 || error.status === 403;
        const isQueryAccessDenied = isReadQuery && error.graphQLErrors?.length > 0;
        if (!isAuthRejection && !isQueryAccessDenied) throw error;
        console.warn(
          '[Shopify Admin API] Environment token rejected; retrying with the authenticated app session.',
        );
      }
    } else if (process.env.SHOPIFY_SHOP) {
      console.warn(
        '[Shopify Admin API] Environment token is configured for a different store; using the authenticated app session.',
      );
    }
  }

  const response = await admin.graphql(query, { variables });
  const result = await response.json().catch(() => null);

  if (!response.ok || result?.errors?.length) {
    const message = result?.errors?.map((error) => error.message).join(' ') ||
      `Shopify Admin API request failed (${response.status}).`;
    throw new Error(message);
  }

  if (!result?.data || typeof result.data !== 'object') {
    throw new Error('Shopify returned an empty Admin API response.');
  }

  return result.data;
}

export function getUserErrorMessage(payload, operation) {
  const userErrors = payload?.userErrors || [];
  return userErrors.length
    ? `${operation}: ${userErrors.map((error) => error.message).join(' ')}`
    : null;
}
