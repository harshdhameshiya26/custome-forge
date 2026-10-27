import { authenticate } from '../shopify.server';
import { shopifyGraphql } from '../shopify-catalog.server';
import { boundary } from '@shopify/shopify-app-react-router/server';

const COLLECTIONS_QUERY = `#graphql
  query CustomForgeCollections($after: String) {
    collections(first: 100, after: $after) {
      nodes {
        id
        title
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    const collections = [];
    let after = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const data = await shopifyGraphql(admin, COLLECTIONS_QUERY, { after }, session.shop);
      const connection = data?.collections;
      if (
        !Array.isArray(connection?.nodes) ||
        typeof connection.pageInfo?.hasNextPage !== 'boolean'
      ) {
        throw new Error('Shopify returned an invalid collections response.');
      }
      collections.push(...connection.nodes);
      hasNextPage = connection.pageInfo.hasNextPage;
      after = connection.pageInfo.endCursor || null;
    }

    return Response.json({ success: true, data: { collections } });
  } catch (error) {
    console.error('[Shopify collections] Failed to load collections:', error);
    return Response.json(
      {
        success: false,
        message: error.message || 'Unable to load Shopify collections.',
        data: { collections: [] },
      },
      { status: 502 },
    );
  }
};

export const headers = (headersArgs) => boundary.headers(headersArgs);
