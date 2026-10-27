import { shopifyGraphql } from './shopify-catalog.server';
import prisma from './db.server';

const PRODUCTS_QUERY = `#graphql
  query CustomForgeCustomizerProducts($after: String) {
    products(first: 50, after: $after, sortKey: TITLE) {
      nodes {
        id
        title
        status
        vendor
        productType
        category {
          fullName
        }
        tags
        featuredImage {
          url
          altText
        }
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        options {
          name
          values
        }
        variants(first: 1) {
          nodes {
            id
            title
            price
            availableForSale
            selectedOptions {
              name
              value
            }
            image {
              url
              altText
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const UNDERGARMENT_PATTERN =
  /\b(under[\s-]?garments?|underwear|lingerie|bras?|panties|panty|thongs?|shapewear|briefs|boxer(?:\s+briefs?|\s+shorts?)?|undershirts?|camisoles?|slips|long[\s-]?johns?)\b/i;

const COLOR_SWATCHES = [
  [/\b(black|onyx|charcoal)\b/i, '#18181b'],
  [/\b(navy|midnight)\b/i, '#1e3a8a'],
  [/\b(blue|cobalt)\b/i, '#0284c7'],
  [/\b(red|crimson|burgundy|maroon)\b/i, '#991b1b'],
  [/\b(green|forest|olive)\b/i, '#15803d'],
  [/\b(gray|grey|silver)\b/i, '#64748b'],
  [/\b(yellow|gold)\b/i, '#d97706'],
  [/\b(orange|amber)\b/i, '#ea580c'],
  [/\b(pink|rose)\b/i, '#db2777'],
  [/\b(purple|violet)\b/i, '#7c3aed'],
  [/\b(brown|tan|beige)\b/i, '#a16207'],
  [/\b(coral|salmon)\b/i, '#fb7185'],
  [/\b(teal|turquoise|aqua)\b/i, '#0d9488'],
  [/\b(lavender|lilac)\b/i, '#a78bfa'],
  [/\b(natural|oatmeal|heather)\b/i, '#a8a29e'],
  [/\b(rose\s+gold)\b/i, '#c08474'],
  [/\b(white|ivory|cream)\b/i, '#ffffff'],
];

const colorSwatch = (name) =>
  COLOR_SWATCHES.find(([pattern]) => pattern.test(name))?.[1] || '#94a3b8';

const formatPrice = (amount, currencyCode) => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode || 'USD',
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currencyCode || ''}`.trim();
  }
};

const compatibleTechniques = (category) => {
  if (/\b(mug|drinkware|glassware|bottle)\b/i.test(category)) return ['uv_print', 'laser'];
  if (/\b(jewelry|jewellery|necklace|ring|bracelet|earring)\b/i.test(category)) return ['laser', 'uv_print'];
  if (/\b(phone|case|electronics)\b/i.test(category)) return ['uv_print'];
  if (/\b(bag|leather|accessor)\b/i.test(category)) return ['embroidery', 'screen_print', 'uv_print'];
  return ['dtg', 'screen_print', 'embroidery', 'uv_print', 'laser'];
};

const normalizeProduct = (product) => {
  const category = product.category?.fullName || product.productType || 'Other';
  const searchableText = [
    product.title,
    product.productType,
    category,
    ...(product.tags || []),
  ].join(' ');

  if (product.status === 'ARCHIVED' || UNDERGARMENT_PATTERN.test(searchableText)) {
    return null;
  }

  const options = (product.options || [])
    .filter((option) => option?.name && option.name !== 'Title')
    .map((option) => ({
      name: option.name,
      values: Array.isArray(option.values)
        ? [...new Set(option.values.filter((value) => typeof value === 'string' && value))]
        : [],
    }))
    .filter((option) => option.values.length);
  const colorOption = options.find((option) => /color|colour/i.test(option.name));
  const colorNames = colorOption?.values || ['Default'];
  const minimumPrice = product.priceRangeV2?.minVariantPrice;

  return {
    id: product.id,
    storeProductId: product.id,
    name: product.title,
    subtitle: [product.productType, product.vendor].filter(Boolean).join(' · ') || category,
    productType: product.productType || category,
    category,
    price: formatPrice(minimumPrice?.amount, minimumPrice?.currencyCode),
    currencyCode: minimumPrice?.currencyCode || 'USD',
    image: product.featuredImage?.url || '',
    imageAlt: product.featuredImage?.altText || product.title,
    colors: colorNames.map(colorSwatch),
    colorNames,
    colorOptionName: colorOption?.name || '',
    options,
    variants: (product.variants?.nodes || []).map((variant) => ({
      id: variant.id,
      title: variant.title,
      price: variant.price,
      availableForSale: variant.availableForSale,
      selectedOptions: variant.selectedOptions || [],
      image: variant.image?.url || '',
    })),
    compatibleTechniques: compatibleTechniques(`${category} ${product.productType || ''}`),
  };
};

export async function loadCustomizerCatalog(admin, shop) {
  const catalog = [];
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await shopifyGraphql(admin, PRODUCTS_QUERY, { after }, shop);
    const connection = data.products;
    if (!connection || !Array.isArray(connection.nodes) || !connection.pageInfo) {
      throw new Error('Shopify returned an invalid product catalog response.');
    }

    catalog.push(...connection.nodes.map(normalizeProduct).filter(Boolean));
    hasNextPage = connection.pageInfo.hasNextPage === true;
    after = connection.pageInfo.endCursor;
    if (hasNextPage && !after) {
      throw new Error('Shopify product pagination did not return a cursor.');
    }
  }

  if (catalog.length && prisma?.tbl_ProductCustomizationConfig?.findMany) {
    try {
      const configs = await prisma.tbl_ProductCustomizationConfig.findMany({
        where: {
          shop,
          shopifyProductId: { in: catalog.map((product) => product.storeProductId) },
          shopifyVariantId: null,
          printAreaName: 'default',
        },
      });
      const configsByProductId = new Map(
        configs.map((config) => [config.shopifyProductId, config]),
      );
      return catalog.map((product) => ({
        ...product,
        printAreaConfig: configsByProductId.get(product.storeProductId) || null,
      }));
    } catch (error) {
      console.error('[Customizer catalog] Unable to load saved print-area specifications:', error);
    }
  }

  return catalog;
}
