import { Buffer } from 'node:buffer';
import { authenticate } from '../shopify.server';
import { getUserErrorMessage, shopifyGraphql } from '../shopify-catalog.server';

const STAGED_UPLOAD_CREATE = `#graphql
  mutation CustomForgeCustomerDesignUpload($input: [StagedUploadInput!]!) {
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

const FILE_CREATE = `#graphql
  mutation CustomForgeCustomerDesignFile($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
        fileErrors {
          message
        }
        preview {
          status
          image {
            url
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

const FILE_STATUS = `#graphql
  query CustomForgeCustomerDesignFileStatus($id: ID!) {
    node(id: $id) {
      ... on File {
        fileStatus
        fileErrors {
          message
        }
        preview {
          status
          image {
            url
          }
        }
      }
    }
  }
`;

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

async function uploadDesign(admin, shop, dataUrl) {
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error('The design preview must be a valid PNG image.');

  const image = Buffer.from(match[1], 'base64');
  if (
    image.length < 128 ||
    image.length > 4 * 1024 * 1024 ||
    image.toString('base64') !== match[1] ||
    image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
  ) {
    throw new Error('The design preview image is invalid or larger than 4 MB.');
  }

  const queryShopify = (query, variables = {}) =>
    shopifyGraphql(admin, query, variables, shop);
  const fileName = `customforge-design-${crypto.randomUUID()}.png`;
  const stagedData = await queryShopify(STAGED_UPLOAD_CREATE, {
    input: [{
      filename: fileName,
      mimeType: 'image/png',
      httpMethod: 'POST',
      resource: 'IMAGE',
    }],
  });
  const stagedPayload = stagedData.stagedUploadsCreate;
  const stagedError = getUserErrorMessage(stagedPayload, 'Design upload preparation failed');
  if (stagedError) throw new Error(stagedError);

  const target = stagedPayload?.stagedTargets?.[0];
  if (!target?.url || !target.resourceUrl || !Array.isArray(target.parameters)) {
    throw new Error('Shopify did not provide a valid design upload target.');
  }

  const formData = new FormData();
  for (const parameter of target.parameters) {
    if (!parameter?.name || typeof parameter.value !== 'string') {
      throw new Error('Shopify returned invalid design upload parameters.');
    }
    formData.append(parameter.name, parameter.value);
  }
  formData.append('file', new Blob([image], { type: 'image/png' }), fileName);

  const uploadResponse = await fetch(target.url, { method: 'POST', body: formData });
  if (!uploadResponse.ok) {
    throw new Error(`Shopify design upload failed (HTTP ${uploadResponse.status}).`);
  }

  const fileData = await queryShopify(FILE_CREATE, {
    files: [{
      alt: 'Customer-designed product preview',
      contentType: 'IMAGE',
      filename: fileName,
      originalSource: target.resourceUrl,
    }],
  });
  const filePayload = fileData.fileCreate;
  const fileError = getUserErrorMessage(filePayload, 'Design file creation failed');
  if (fileError) throw new Error(fileError);

  const file = filePayload?.files?.[0];
  if (!file?.id) throw new Error('Shopify did not create a design image file.');

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const imageUrl = file.preview?.image?.url;
    if (file.fileStatus === 'READY' && imageUrl) return imageUrl;
    if (file.fileStatus === 'FAILED') {
      const errors = file.fileErrors?.map((error) => error.message).filter(Boolean).join(' ');
      throw new Error(errors || 'Shopify could not process the design image.');
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    const statusData = await queryShopify(FILE_STATUS, { id: file.id });
    Object.assign(file, statusData?.node || {});
  }

  throw new Error('Shopify is still processing the design image. Please wait a moment and try again.');
}

export const action = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ success: false, message: 'Only POST is supported.' }, 405);
  }

  try {
    const { admin, session } = await authenticate.public.appProxy(request);
    if (!admin || !session?.shop) {
      return json({ success: false, message: 'The store session is unavailable. Reopen the storefront and retry.' }, 401);
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 6 * 1024 * 1024) {
      return json({ success: false, message: 'The design image is too large to upload.' }, 413);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.artwork !== 'string') {
      return json({ success: false, message: 'A design preview image is required.' }, 400);
    }

    const imageUrl = await uploadDesign(admin, session.shop, body.artwork);
    return json({ success: true, data: { imageUrl } });
  } catch (error) {
    console.error('[CustomForge storefront design] Upload failed:', error);
    const status = error instanceof Response ? error.status : 502;
    return json({
      success: false,
      message: status === 502
        ? error?.message || 'Unable to save the customer design.'
        : 'The storefront request could not be authenticated.',
    }, status);
  }
};

export const loader = async ({ request }) => {
  try {
    await authenticate.public.appProxy(request);
    return json({ success: true, message: 'CustomForge design endpoint is ready.' });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[CustomForge storefront design] Endpoint check failed:', error);
    return json({ success: false, message: 'Unable to access the CustomForge design endpoint.' }, 500);
  }
};
