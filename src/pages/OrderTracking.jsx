import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  EmptyState,
  Image,
  InlineStack,
  Modal,
  Page,
  Spinner,
  Text,
} from '@shopify/polaris';
import api from '../services/api';

const EMPTY_ORDERS = [];
const EMPTY_STATE_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 200'%3E%3Crect width='400' height='200' rx='16' fill='%23f1f2f3'/%3E%3Ccircle cx='200' cy='100' r='36' fill='%23dfe3e8'/%3E%3C/svg%3E";

const loadPreviewImage = (source) =>
  new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load a product or artwork preview image.'));
    image.src = source;
  });

const createProductMockup = async (productImageUrl, designImageUrl) => {
  const [productImage, designImage] = await Promise.all([
    loadPreviewImage(productImageUrl),
    loadPreviewImage(designImageUrl),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 560;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Unable to prepare the product preview.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const productScale = Math.min(
    canvas.width / productImage.naturalWidth,
    canvas.height / productImage.naturalHeight,
  );
  const productWidth = productImage.naturalWidth * productScale;
  const productHeight = productImage.naturalHeight * productScale;
  context.drawImage(
    productImage,
    (canvas.width - productWidth) / 2,
    (canvas.height - productHeight) / 2,
    productWidth,
    productHeight,
  );

  const artworkCanvas = document.createElement('canvas');
  artworkCanvas.width = designImage.naturalWidth;
  artworkCanvas.height = designImage.naturalHeight;
  const artworkContext = artworkCanvas.getContext('2d', { willReadFrequently: true });
  if (!artworkContext) throw new Error('Unable to prepare the artwork preview.');
  artworkContext.drawImage(designImage, 0, 0);

  const artwork = artworkContext.getImageData(0, 0, artworkCanvas.width, artworkCanvas.height);
  for (let pixel = 0; pixel < artwork.data.length; pixel += 4) {
    const red = artwork.data[pixel];
    const green = artwork.data[pixel + 1];
    const blue = artwork.data[pixel + 2];
    const neutralBackground =
      red >= 235 &&
      red <= 249 &&
      green >= 236 &&
      green <= 250 &&
      blue >= 238 &&
      blue <= 252 &&
      Math.max(red, green, blue) - Math.min(red, green, blue) <= 5;
    if (neutralBackground) artwork.data[pixel + 3] = 0;
  }
  artworkContext.putImageData(artwork, 0, 0);

  const designScale = Math.min(
    (canvas.width * 0.38) / artworkCanvas.width,
    (canvas.height * 0.32) / artworkCanvas.height,
  );
  const designWidth = artworkCanvas.width * designScale;
  const designHeight = artworkCanvas.height * designScale;
  context.drawImage(
    artworkCanvas,
    (canvas.width - designWidth) / 2,
    canvas.height * 0.31,
    designWidth,
    designHeight,
  );
  return canvas.toDataURL('image/png');
};

export default function OrderTracking({
  shopOrders = EMPTY_ORDERS,
  syncWarning = null,
}) {
  const location = useLocation();
  const shop = new URLSearchParams(location.search).get('shop') || '';
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [productMockups, setProductMockups] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.orders.list(shop ? { shop } : {});
      const backendOrders = Array.isArray(response?.data) ? response.data : [];
      const ordersById = new Map();
      for (const order of shopOrders) {
        ordersById.set(String(order.rawId || order.id), order);
      }
      for (const order of backendOrders) {
        const key = String(order.rawId || order.id);
        const current = ordersById.get(key);
        if (!current) continue;
        ordersById.set(key, {
          ...current,
          ...order,
          customDesigns: current.customDesigns,
        });
      }
      setOrders(Array.from(ordersById.values()));
    } catch (fetchError) {
      console.error('[CustomForge orders] Unable to load customized orders:', fetchError);
      setOrders(shopOrders);
      setError(fetchError.message || 'Unable to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [shop, shopOrders]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    let active = true;
    setProductMockups({});
    const previews = (selectedOrder?.customDesigns || []).map(async (design, index) => {
      if (design.isPublishedCustomForgeProduct) {
        return [index, design.imageUrl || design.productImageUrl || null];
      }
      if (!design.productImageUrl || !design.imageUrl) return [index, null];
      try {
        return [index, await createProductMockup(design.productImageUrl, design.imageUrl)];
      } catch (previewError) {
        console.warn('[CustomForge orders] Could not compose a product preview:', previewError.message);
        return [index, null];
      }
    });

    Promise.all(previews).then((entries) => {
      if (active) setProductMockups(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [selectedOrder]);

  const closeDesignModal = useCallback(() => setSelectedOrder(null), []);

  return (
    <Page
      title="Custom orders"
      subtitle="Shopify orders containing a CustomForge design, including payment status"
      primaryAction={{
        content: 'Refresh',
        onAction: fetchOrders,
        loading,
      }}
    >
      <BlockStack gap="400">
        {syncWarning && (
          <Banner tone="warning">
            <Text as="p">{syncWarning}</Text>
          </Banner>
        )}
        {error && (
          <Card>
            <Box padding="400">
              <BlockStack gap="300">
                <Text as="p" variant="bodyMd" tone="critical">{error}</Text>
                <Button onClick={fetchOrders}>Retry</Button>
              </BlockStack>
            </Box>
          </Card>
        )}

        {loading ? (
          <Card>
            <Box padding="800">
              <InlineStack align="center">
                <Spinner accessibilityLabel="Loading customized Shopify orders" size="large" />
              </InlineStack>
            </Box>
          </Card>
        ) : orders.length === 0 ? (
          error ? null : (
            <Card>
              <EmptyState
                heading="No custom orders yet"
                image={EMPTY_STATE_IMAGE}
                action={{ content: 'Refresh orders', onAction: fetchOrders }}
              >
                Orders appear here when a customer purchases a product published
                through CustomForge.
              </EmptyState>
            </Card>
          )
        ) : (
          <Card>
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'text', 'text']}
              headings={['Order', 'Custom product', 'Customer', 'Payment', '']}
              rows={orders.map((order) => [
                <BlockStack gap="100" key={`order-${order.rawId || order.id}`}>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {order.referenceNumber
                      ? `CustomForge ${order.referenceNumber}`
                      : `Order ${order.id}`}
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {order.date}
                  </Text>
                </BlockStack>,
                <Text as="span" key={`product-${order.rawId || order.id}`}>
                  {order.product || order.customDesigns?.map((design) => design.title).join(', ')}
                </Text>,
                <BlockStack gap="100" key={`customer-${order.rawId || order.id}`}>
                  <Text as="span">
                    {order.customerName || order.customer || 'Customer'}
                  </Text>
                  {order.customerEmail && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      {order.customerEmail}
                    </Text>
                  )}
                </BlockStack>,
                <Badge
                  key={`payment-${order.rawId || order.id}`}
                  tone={String(order.financialStatus || '').toLowerCase() === 'paid'
                    ? 'success'
                    : 'attention'}
                >
                  {String(order.financialStatus || 'Payment pending')
                    .replaceAll('_', ' ')
                    .replace(/\b\w/g, (character) => character.toUpperCase())}
                </Badge>,
                <Button
                  key={`view-${order.rawId || order.id}`}
                  onClick={() => setSelectedOrder(order)}
                  disabled={!order.customDesigns?.length}
                >
                  View
                </Button>,
              ])}
              hoverable
              hasZebraStripingOnData
              verticalAlign="middle"
            />
          </Card>
        )}
      </BlockStack>

      <Modal
        open={Boolean(selectedOrder)}
        onClose={closeDesignModal}
        title={selectedOrder ? `Design for order ${selectedOrder.id}` : 'Custom design'}
        primaryAction={{
          content: 'Close',
          onAction: closeDesignModal,
        }}
      >
        <Modal.Section>
          {selectedOrder && (
            <BlockStack gap="400">
              <Text as="p" variant="bodyMd">
                {selectedOrder.customerName || selectedOrder.customer || 'Customer'}
                {selectedOrder.customerEmail ? ` · ${selectedOrder.customerEmail}` : ''}
              </Text>
              {(selectedOrder.customDesigns || []).map((design, index) => (
                <Card key={`${selectedOrder.rawId}-${index}`}>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">{design.title || selectedOrder.product}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Quantity: {design.quantity || 1}
                        {design.variantTitle ? ` · Variant: ${design.variantTitle}` : ''}
                      </Text>
                      {productMockups[index] ? (
                        <Image
                          source={productMockups[index]}
                          alt={`${design.title || selectedOrder.product} customized with the customer's design`}
                          width={480}
                          height={560}
                        />
                      ) : (
                        <Text as="p" variant="bodySm" tone="subdued">
                          The combined product preview could not be generated. Refresh the order to try loading it again.
                        </Text>
                      )}
                      {Object.entries(design.properties || {}).map(([label, value]) => (
                        value !== '' && value !== null && value !== undefined && (
                          <Text as="p" variant="bodySm" key={label}>
                            {label}: {String(value)}
                          </Text>
                        )
                      ))}
                    </BlockStack>
                  </Box>
                </Card>
              ))}
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}

OrderTracking.propTypes = {
  shopOrders: PropTypes.arrayOf(PropTypes.object),
  syncWarning: PropTypes.string,
};
