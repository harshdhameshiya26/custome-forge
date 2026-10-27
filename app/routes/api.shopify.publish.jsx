import { Buffer } from 'node:buffer';
import { authenticate } from '../shopify.server';
import { getUserErrorMessage, shopifyGraphql } from '../shopify-catalog.server';
import { boundary } from '@shopify/shopify-app-react-router/server';

const CREATE_PRODUCT = `#graphql
  mutation CustomForgeProductCreate(
    $product: ProductCreateInput!
    $media: [CreateMediaInput!]
  ) {
    productCreate(product: $product, media: $media) {
      product {
        id
        title
        handle
        variants(first: 1) {
          nodes {
            id
            selectedOptions {
              name
              value
            }
          }
        }
        media(first: 1) {
          nodes {
            status
            mediaErrors {
              message
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_SOURCE_PRODUCT = `#graphql
  query CustomForgeSourceProduct($id: ID!, $after: String) {
    product(id: $id) {
      id
      title
      status
      productType
      category {
        fullName
      }
      tags
      options {
        name
        values
      }
      variants(first: 250, after: $after) {
        nodes {
          id
          title
          price
          selectedOptions {
            name
            value
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

const CREATE_PRODUCT_VARIANTS = `#graphql
  mutation CustomForgeProductVariantsBulkCreate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants {
        id
        price
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_PRODUCT_MEDIA_STATUS = `#graphql
  query CustomForgeProductMediaStatus($id: ID!) {
    node(id: $id) {
      ... on Product {
        media(first: 1) {
          nodes {
            status
            mediaErrors {
              message
            }
          }
        }
      }
    }
  }
`;

const CREATE_STAGED_IMAGE = `#graphql
  mutation CustomForgeStagedImage($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_VARIANT_PRICE = `#graphql
  mutation CustomForgeVariantPriceUpdate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        price
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CREATE_COLLECTION = `#graphql
  mutation CustomForgeCollectionCreate($collection: CollectionCreateInput!) {
    collectionCreate(collection: $collection) {
      collection {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_COLLECTION_SOURCES = `#graphql
  query CustomForgeCollectionSources($id: ID!) {
    node(id: $id) {
      ... on Collection {
        id
        title
        sources {
          id
          __typename
        }
      }
    }
  }
`;

const ADD_PRODUCT_TO_COLLECTION = `#graphql
  mutation CustomForgeAddProductToCollection(
    $collectionId: ID!
    $sourceId: ID!
    $selections: [CollectionInclusionProductSelectionInput!]!
  ) {
    collectionUpdate(collection: {
      id: $collectionId
      sourcesToUpdate: [{
        condition: {
          id: $sourceId
          inclusion: { selectionsToAdd: $selections }
        }
      }]
    }) {
      collection {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PUBLISH_PRODUCT = `#graphql
  mutation CustomForgePublishProduct($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_PUBLICATIONS = `#graphql
  query CustomForgePublications {
    publications(first: 25) {
      nodes {
        id
        name
      }
    }
  }
`;

const escapeHtml = (value) =>
  String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);

const readRequestBody = async (request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const uploadProductArtwork = async (queryShopify, artworkDataUrl, title) => {
  if (typeof artworkDataUrl !== 'string' || !artworkDataUrl) return null;

  const match = artworkDataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) {
    throw new Error('The product preview image is invalid. Reopen the customizer and try publishing again.');
  }

  const imageBuffer = Buffer.from(match[1], 'base64');
  if (
    imageBuffer.length < 128 ||
    imageBuffer.length > 4 * 1024 * 1024 ||
    imageBuffer.toString('base64') !== match[1]
  ) {
    throw new Error('The product preview image is empty, invalid, or larger than 4 MB.');
  }

  const fileName = `${title.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'customforge-product'}.jpg`;
  const stagedData = await queryShopify(CREATE_STAGED_IMAGE, {
    input: [{
      filename: fileName,
      mimeType: 'image/jpeg',
      httpMethod: 'POST',
      resource: 'IMAGE',
    }],
  });
  const stagedPayload = stagedData.stagedUploadsCreate;
  const stagedError = getUserErrorMessage(stagedPayload, 'Product image upload preparation failed');
  if (stagedError) throw new Error(stagedError);

  const target = stagedPayload?.stagedTargets?.[0];
  if (!target?.url || !target.resourceUrl || !Array.isArray(target.parameters)) {
    throw new Error('Shopify did not return a valid upload target for the product image.');
  }

  const formData = new FormData();
  for (const parameter of target.parameters) {
    if (!parameter?.name || typeof parameter.value !== 'string') {
      throw new Error('Shopify returned invalid product image upload parameters.');
    }
    formData.append(parameter.name, parameter.value);
  }
  formData.append(
    'file',
    new Blob([imageBuffer], { type: 'image/jpeg' }),
    fileName,
  );

  const uploadResponse = await fetch(target.url, { method: 'POST', body: formData });
  if (!uploadResponse.ok) {
    throw new Error(`Shopify product image upload failed (HTTP ${uploadResponse.status}).`);
  }

  return {
    alt: `${title} - CustomForge product design`,
    mediaContentType: 'IMAGE',
    originalSource: target.resourceUrl,
  };
};

const waitForProductImage = async (queryShopify, productId) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const data = await queryShopify(GET_PRODUCT_MEDIA_STATUS, { id: productId });
    const image = data?.node?.media?.nodes?.[0];

    if (image?.status === 'READY') return;
    if (image?.status === 'FAILED') {
      const details = image.mediaErrors?.map((error) => error.message).filter(Boolean).join(' ');
      throw new Error(details || 'Shopify could not process the product image.');
    }
    if (!image && attempt === 11) {
      throw new Error('Shopify did not attach the product image. The product was created but was not published; check Shopify before retrying.');
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
};

const UNDERGARMENT_PATTERN =
  /\b(under[\s-]?garments?|underwear|lingerie|bras?|panties|panty|thongs?|shapewear|briefs|boxer(?:\s+briefs?|\s+shorts?)?|undershirts?|camisoles?|slips|long[\s-]?johns?)\b/i;

const loadSourceProduct = async (queryShopify, id) => {
  const variants = [];
  let after = null;
  let product = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await queryShopify(GET_SOURCE_PRODUCT, { id, after });
    product = data.product;
    if (!product) return null;
    const connection = product.variants;
    if (!Array.isArray(connection?.nodes) || !connection.pageInfo) {
      throw new Error('Shopify returned an invalid source-product variant response.');
    }
    variants.push(...connection.nodes);
    if (variants.length > 2048) {
      throw new Error('The selected product has more than Shopify’s 2,048-variant limit.');
    }
    after = connection.pageInfo.endCursor;
    if (connection.pageInfo.hasNextPage && !after) {
      throw new Error('Shopify source-product pagination did not return a cursor.');
    }
    hasNextPage = connection.pageInfo.hasNextPage;
  }

  return { ...product, variants };
};

const sameVariantOptions = (left, right, optionNames) =>
  optionNames.every((name) =>
    left.some((option) => option.name === name && option.value ===
      right.find((candidate) => candidate.name === name)?.value),
  );

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const queryShopify = (query, variables = {}) =>
    shopifyGraphql(admin, query, variables, session.shop);
  const body = await readRequestBody(request);

  if (!body || typeof body !== 'object') {
    return Response.json(
      { success: false, message: 'The publish request must contain valid JSON.' },
      { status: 400 },
    );
  }

  const title = String(body.title || '').trim();
  const productType = String(body.productType || '').trim();
  const color = String(body.color || '').trim();
  const size = String(body.size || '').trim();
  const sourceProductId = String(body.sourceProductId || '').trim();
  const technique = String(body.technique || '').trim();
  const customText = String(body.customText || '').trim();
  const artwork = body.artwork;
  const rawPrice = String(body.price || '').replace(/[$,\s]/g, '');
  const collectionChoice = body.collection || { type: 'none' };
  const collectionType = collectionChoice.type;
  const newCollectionTitle = String(collectionChoice.title || '').trim();

  if (
    title.length < 2 || title.length > 255 ||
    productType.length > 255 || (!sourceProductId && productType.length < 2) ||
    color.length > 100 || size.length > 50 || technique.length > 50 ||
    (Array.isArray(body.options) && (
      body.options.length > 3 ||
      body.options.some((option) =>
        typeof option?.name !== 'string' ||
        option.name.length < 1 ||
        option.name.length > 100 ||
        typeof option?.value !== 'string' ||
        option.value.length < 1 ||
        option.value.length > 100,
      )
    )) ||
    customText.length > 500 ||
    (!sourceProductId && !/^\d+(?:\.\d{1,2})?$/.test(rawPrice)) ||
    (sourceProductId && !/^gid:\/\/shopify\/Product\/\d+$/.test(sourceProductId)) ||
    UNDERGARMENT_PATTERN.test(`${title} ${productType}`) ||
    !['none', 'existing', 'new'].includes(collectionType)
  ) {
    return Response.json(
      { success: false, message: 'The product details are invalid. Review the title, price, and collection selection.' },
      { status: 400 },
    );
  }

  if (artwork !== undefined && (
    typeof artwork !== 'string' ||
    artwork.length > 6 * 1024 * 1024 ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(artwork)
  )) {
    return Response.json(
      { success: false, message: 'The product preview image is invalid or too large. Reopen the customizer and retry.' },
      { status: 400 },
    );
  }

  if (collectionType === 'existing' && !String(collectionChoice.id || '').trim()) {
    return Response.json(
      { success: false, message: 'Select a collection or choose direct publishing.' },
      { status: 400 },
    );
  }

  if (collectionType === 'new' && (newCollectionTitle.length < 2 || newCollectionTitle.length > 100)) {
    return Response.json(
      { success: false, message: 'A new collection name must be between 2 and 100 characters.' },
      { status: 400 },
    );
  }

  let createdProduct = null;

  try {
    const sourceProduct = sourceProductId
      ? await loadSourceProduct(queryShopify, sourceProductId)
      : null;
    if (sourceProductId && !sourceProduct) {
      throw new Error('The selected Shopify source product could not be found in this store.');
    }
    if (
      sourceProduct &&
      (sourceProduct.status === 'ARCHIVED' ||
        UNDERGARMENT_PATTERN.test([
          sourceProduct.title,
          sourceProduct.productType,
          sourceProduct.category?.fullName,
          ...(sourceProduct.tags || []),
        ].join(' ')))
    ) {
      return Response.json(
        { success: false, message: 'Archived products and undergarments cannot be used as customization products.' },
        { status: 400 },
      );
    }

    const sourceVariants = sourceProduct?.variants || [];
    const sourceOptions = (sourceProduct?.options || [])
      .filter((option) => option?.name && option.name !== 'Title');
    if (
      sourceProduct &&
      (!sourceVariants.length || sourceOptions.length > 3 ||
        (!sourceOptions.length && sourceVariants.length > 1))
    ) {
      return Response.json(
        { success: false, message: 'The selected product must have a valid variant matrix with no more than three options.' },
        { status: 400 },
      );
    }

    let optionsForCreate = [];
    if (sourceProduct) {
      const optionNames = sourceOptions.map((option) => option.name);
      const requestedOptions = Array.isArray(body.options)
        ? body.options.filter((option) =>
          typeof option?.name === 'string' && typeof option?.value === 'string',
        )
        : [];
      const requestedOptionMap = new Map(
        requestedOptions.map((option) => [option.name, option.value]),
      );
      if (
        requestedOptions.length > 3 ||
        optionNames.some((name) => !requestedOptionMap.has(name)) ||
        requestedOptionMap.size !== optionNames.length ||
        !sourceVariants.some((variant) =>
          optionNames.every((name) =>
            variant.selectedOptions?.some(
              (option) => option.name === name && option.value === requestedOptionMap.get(name),
            ),
          ),
        )
      ) {
        return Response.json(
          { success: false, message: 'Choose a valid option combination from the selected Shopify product.' },
          { status: 400 },
        );
      }
      optionsForCreate = sourceOptions.map((option) => {
        const values = [...new Set(sourceVariants
          .map((variant) => variant.selectedOptions?.find((item) => item.name === option.name)?.value)
          .filter(Boolean))];
        const firstVariantValue = sourceVariants[0]?.selectedOptions?.find(
          (item) => item.name === option.name,
        )?.value;
        if (!values.length || values.length > 100 || !firstVariantValue) {
          throw new Error(`Shopify returned invalid values for the ${option.name} product option.`);
        }
        return {
          name: option.name,
          values: [
            { name: firstVariantValue },
            ...values.filter((value) => value !== firstVariantValue).map((name) => ({ name })),
          ],
        };
      });
    } else {
      optionsForCreate = [
        { name: 'Color', values: [{ name: color || 'Default' }] },
        { name: 'Size', values: [{ name: size || 'Default' }] },
      ];
    }

    const publishingProductType = sourceProduct
      ? sourceProduct.productType || sourceProduct.category?.fullName || productType
      : productType;
    if (UNDERGARMENT_PATTERN.test([
      publishingProductType,
      sourceProduct?.category?.fullName,
      sourceProduct?.title,
      ...(sourceProduct?.tags || []),
    ].join(' '))) {
      return Response.json(
        { success: false, message: 'Undergarments are not supported in the customization catalog.' },
        { status: 400 },
      );
    }
    const normalizedProductType = publishingProductType.slice(0, 100);

    const publicationData = await queryShopify(GET_PUBLICATIONS);
    const onlineStore = publicationData.publications.nodes.find(
      (publication) => publication.name.toLowerCase() === 'online store',
    );
    if (!onlineStore) {
      throw new Error('The Online Store sales channel was not found. Enable the channel and retry publishing.');
    }

    const productMedia = await uploadProductArtwork(queryShopify, artwork, title);
    const productDescription = [
      `Custom product: ${escapeHtml(normalizedProductType)}`,
      customText ? `Design text: ${escapeHtml(customText)}` : '',
      sourceProduct ? `Based on: ${escapeHtml(sourceProduct.title)}` : '',
      ...((Array.isArray(body.options) ? body.options : [])
        .filter((option) => option?.name && option?.value)
        .map((option) => `${escapeHtml(option.name)}: ${escapeHtml(option.value)}`)),
      !sourceProduct && color ? `Color: ${escapeHtml(color)}` : '',
      !sourceProduct && size ? `Size: ${escapeHtml(size)}` : '',
      technique ? `Production technique: ${escapeHtml(technique)}` : '',
      'Customized with CustomForge.',
    ].filter(Boolean).join('<br>');

    const productData = await queryShopify(CREATE_PRODUCT, {
      product: {
        title,
        descriptionHtml: productDescription,
        productType: normalizedProductType,
        vendor: 'CustomForge',
        tags: ['CustomForge', 'customforge-app-published-design-v1', normalizedProductType],
        status: 'ACTIVE',
        ...(optionsForCreate.length ? { productOptions: optionsForCreate } : {}),
      },
      media: productMedia ? [productMedia] : [],
    });
    const productPayload = productData.productCreate;
    const productError = getUserErrorMessage(productPayload, 'Product creation failed');
    if (productError) throw new Error(productError);
    createdProduct = productPayload.product;

    const variant = createdProduct?.variants?.nodes?.[0];
    if (!createdProduct?.id || !variant?.id) {
      throw new Error('Shopify created the product without returning its initial variant.');
    }

    let productImageReady = !productMedia;
    if (productMedia) {
      const imageStatus = createdProduct.media?.nodes?.[0]?.status;
      if (imageStatus === 'FAILED') {
        const imageError = createdProduct.media.nodes[0].mediaErrors
          ?.map((error) => error.message)
          .filter(Boolean)
          .join(' ');
        throw new Error(imageError || 'Shopify could not process the product image.');
      }
      productImageReady = imageStatus === 'READY' ||
        await waitForProductImage(queryShopify, createdProduct.id);
    }

    if (sourceProduct) {
      const optionNames = sourceOptions.map((option) => option.name);
      const initialVariant = variant.selectedOptions || [];
      const initialSourceVariant = sourceVariants.find((sourceVariant) =>
        sameVariantOptions(initialVariant, sourceVariant.selectedOptions || [], optionNames),
      );
      if (!initialSourceVariant) {
        throw new Error('Shopify could not match the new product’s initial variant to the source variant matrix.');
      }

      const initialPriceData = await queryShopify(UPDATE_VARIANT_PRICE, {
        productId: createdProduct.id,
        variants: [{ id: variant.id, price: initialSourceVariant.price }],
      });
      const initialPriceError = getUserErrorMessage(
        initialPriceData.productVariantsBulkUpdate,
        'Product initial variant price update failed',
      );
      if (initialPriceError) throw new Error(initialPriceError);

      const remainingVariants = sourceVariants
        .filter((sourceVariant) => sourceVariant.id !== initialSourceVariant.id)
        .map((sourceVariant) => ({
          price: sourceVariant.price,
          optionValues: optionNames.map((name) => {
            const option = sourceVariant.selectedOptions?.find((item) => item.name === name);
            if (!option?.value) {
              throw new Error(`A source variant is missing its ${name} option value.`);
            }
            return { optionName: name, name: option.value };
          }),
        }));
      for (let index = 0; index < remainingVariants.length; index += 250) {
        const variantsData = await queryShopify(CREATE_PRODUCT_VARIANTS, {
          productId: createdProduct.id,
          variants: remainingVariants.slice(index, index + 250),
        });
        const variantsError = getUserErrorMessage(
          variantsData.productVariantsBulkCreate,
          'Product variants creation failed',
        );
        if (variantsError) throw new Error(variantsError);
      }
    } else {
      const priceData = await queryShopify(UPDATE_VARIANT_PRICE, {
        productId: createdProduct.id,
        variants: [{ id: variant.id, price: rawPrice }],
      });
      const priceError = getUserErrorMessage(priceData.productVariantsBulkUpdate, 'Product price update failed');
      if (priceError) throw new Error(priceError);
    }

    let collection = null;
    if (collectionType === 'new') {
      const collectionData = await queryShopify(CREATE_COLLECTION, {
        collection: {
          title: newCollectionTitle,
          sortOrder: 'MANUAL',
          sources: [{
            source: {
              title: 'CustomForge products',
              inclusion: {
                matchType: 'ALL',
                selections: [{ productId: createdProduct.id }],
              },
            },
          }],
        },
      });
      const collectionPayload = collectionData.collectionCreate;
      const collectionError = getUserErrorMessage(collectionPayload, 'Collection creation failed');
      if (collectionError) throw new Error(collectionError);
      collection = collectionPayload.collection;

      const publishCollectionData = await queryShopify(PUBLISH_PRODUCT, {
        id: collection.id,
        input: [{ publicationId: onlineStore.id }],
      });
      const publishCollectionError = getUserErrorMessage(
        publishCollectionData.publishablePublish,
        'Publishing the new collection failed',
      );
      if (publishCollectionError) throw new Error(publishCollectionError);
    } else if (collectionType === 'existing') {
      const collectionId = String(collectionChoice.id).trim();
      const collectionData = await queryShopify(GET_COLLECTION_SOURCES, { id: collectionId });
      const selectedCollection = collectionData.node;
      if (!selectedCollection?.id) {
        throw new Error('The selected collection could not be found in this Shopify store.');
      }

      const conditionSource = selectedCollection.sources.find(
        (source) => source.__typename === 'CollectionConditionsSource',
      );
      if (!conditionSource) {
        throw new Error('The selected collection does not support manually adding products.');
      }

      const addProductData = await queryShopify(ADD_PRODUCT_TO_COLLECTION, {
        collectionId,
        sourceId: conditionSource.id,
        selections: [{ productId: createdProduct.id }],
      });
      const addProductError = getUserErrorMessage(
        addProductData.collectionUpdate,
        'Adding the product to the collection failed',
      );
      if (addProductError) throw new Error(addProductError);
      collection = selectedCollection;
    }

    const publishData = await queryShopify(PUBLISH_PRODUCT, {
      id: createdProduct.id,
      input: [{ publicationId: onlineStore.id }],
    });
    const publishError = getUserErrorMessage(publishData.publishablePublish, 'Product publishing failed');
    if (publishError) throw new Error(publishError);

    return Response.json({
      success: true,
      status: 'published',
      message: productImageReady
        ? `${createdProduct.title} was published to the Online Store.`
        : `${createdProduct.title} was published to the Online Store. Shopify is still processing its image; it will appear when processing completes.`,
      data: {
        product: {
          id: createdProduct.id,
          title: createdProduct.title,
          handle: createdProduct.handle,
        },
        collection,
      },
    });
  } catch (error) {
    console.error('[Shopify product publishing] Failed to publish product:', error);
    return Response.json(
      {
        success: false,
        status: 'failed',
        message: error.message || 'Unable to publish this product.',
        data: {
          product: createdProduct?.id ? createdProduct : null,
          collection: null,
        },
      },
      { status: 502 },
    );
  }
};

export const headers = (headersArgs) => boundary.headers(headersArgs);
