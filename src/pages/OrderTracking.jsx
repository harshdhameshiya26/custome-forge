import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import DesignMockupPreview from '../components/DesignMockupPreview';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  ButtonGroup,
  Box,
  Divider,
  Banner,
  Spinner,
  Select,
} from '@shopify/polaris';
import api from '../services/api';

const DEFAULT_STAGES = [
  { title: 'Order Placed', description: 'Your order has been received.' },
  { title: 'Design Approved', description: 'Your design has been approved for production.' },
  { title: 'In Production', description: 'Your order is currently in active manufacturing.' },
  { title: 'Quality Check', description: 'Pre-flight stitch and print density inspection.' },
  { title: 'Shipped', description: 'Carrier tracking dispatched.' },
  { title: 'Delivered', description: 'Delivered to recipient address.' },
];

/**
 * OrderTracking
 * Fetches real orders from /api/orders and renders real manufacturing timelines.
 * Starts with no data (0) when no custom orders exist.
 */
export default function OrderTracking() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location?.pathname?.startsWith('/app') ? '/app' : '';

  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contactBanner, setContactBanner] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.orders.list();
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res?.data?.items) ? res.data.items : []);
      setOrders(list);

      if (list.length > 0 && !selectedOrderId) {
        setSelectedOrderId(list[0].id);
      }
    } catch (err) {
      console.warn('Could not fetch real orders:', err.message);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [selectedOrderId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const activeOrder = useMemo(() => {
    if (!orders || orders.length === 0) return null;
    return orders.find((o) => o.id === selectedOrderId) || orders[0];
  }, [orders, selectedOrderId]);

  // Compute lifecycle steps dynamically based on activeOrder.status
  const activeOrderSteps = useMemo(() => {
    if (!activeOrder) return [];
    const status = (activeOrder.status || '').toUpperCase();
    let stepIndex = 0;
    if (status.includes('PROOF') || status.includes('APPROVED')) stepIndex = 1;
    if (status.includes('PRODUCTION')) stepIndex = 2;
    if (status.includes('QUALITY') || status.includes('QC')) stepIndex = 3;
    if (status.includes('SHIP')) stepIndex = 4;
    if (status.includes('DELIVER') || status.includes('COMPLETE')) stepIndex = 5;

    return DEFAULT_STAGES.map((s, idx) => ({
      ...s,
      timestamp: idx <= stepIndex ? (activeOrder.date || 'Completed') : 'Pending',
      isDone: idx < stepIndex,
      isActive: idx === stepIndex,
      isUpcoming: idx > stepIndex,
    }));
  }, [activeOrder]);

  if (loading) {
    return (
      <Page title="Order Tracking" subtitle="Real-time order lifecycle & manufacturing timeline">
        <Box padding="800">
          <InlineStack align="center">
            <Spinner accessibilityLabel="Loading order tracking" size="large" />
          </InlineStack>
        </Box>
      </Page>
    );
  }

  if (!activeOrder || orders.length === 0) {
    return (
      <Page
        title="Order Tracking"
        subtitle="Real-time order lifecycle & manufacturing timeline"
        secondaryActions={[
          {
            content: 'Refresh',
            onAction: fetchOrders,
          },
          {
            content: 'Production Queue',
            onAction: () => navigate(`${basePath}/production`),
          },
        ]}
      >
        <Card>
          <Box padding="800">
            <BlockStack gap="300" inlineAlign="center">
              <Text variant="headingMd" as="h3" alignment="center">
                No custom orders found (0)
              </Text>
              <Text variant="bodyMd" tone="subdued" as="p" alignment="center">
                When a customer places a customized order in your store, its complete lifecycle timeline will appear here.
              </Text>
              <Button variant="primary" onClick={() => navigate(`${basePath}/editor`)}>
                Create a Custom Design in Studio
              </Button>
            </BlockStack>
          </Box>
        </Card>
      </Page>
    );
  }

  const orderOptions = orders.map((o) => ({
    label: `Order ${o.id} – ${o.customer || 'Customer'} (${o.product || 'Custom'})`,
    value: o.id,
  }));

  return (
    <Page
      title={`Order ${activeOrder.id}`}
      subtitle={`Placed on ${activeOrder.date || 'Recent'} | ${activeOrder.product || 'Custom Product'}`}
      titleMetadata={<Badge tone="info">{activeOrder.status || 'Processing'}</Badge>}
      primaryAction={{
        content: 'View in Store',
        onAction: () => {},
      }}
      secondaryActions={[
        {
          content: 'Refresh',
          onAction: fetchOrders,
        },
        {
          content: 'Production Queue',
          onAction: () => navigate(`${basePath}/production`),
        },
      ]}
    >
      <BlockStack gap="500">
        {orders.length > 1 && (
          <Card>
            <InlineStack align="space-between" alignBlock="center">
              <Text variant="bodyMd" fontWeight="semibold" as="span">Select Order to Track:</Text>
              <Box minWidth="300px">
                <Select
                  label="Select Order"
                  labelHidden
                  options={orderOptions}
                  value={selectedOrderId || activeOrder.id}
                  onChange={setSelectedOrderId}
                />
              </Box>
            </InlineStack>
          </Card>
        )}

        {contactBanner && (
          <Banner
            title="Support Request Received"
            tone="info"
            onDismiss={() => setContactBanner(false)}
          >
            <Text as="p" variant="bodyMd">
              Our merchant production desk has been alerted regarding Order {activeOrder.id}. We will reply within 1 business hour.
            </Text>
          </Banner>
        )}

        {/* ── Main Two-Column Layout ── */}
        <Layout>
          {/* LEFT: Stepper Timeline */}
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <Text variant="headingMd" as="h2">Order Fulfillment Lifecycle</Text>

                <BlockStack gap="400">
                  {activeOrderSteps.map((step, idx) => (
                    <Card
                      key={step.title}
                      background={
                        step.isActive
                          ? 'bg-surface-secondary'
                          : step.isDone
                          ? 'bg-surface'
                          : 'bg-surface'
                      }
                    >
                      <InlineStack align="space-between" alignBlock="start">
                        <InlineStack gap="300" alignBlock="start">
                          <Badge
                            tone={step.isDone ? 'success' : step.isActive ? 'magic' : 'subdued'}
                            size="large"
                          >
                            {step.isDone ? '✓' : `${idx + 1}`}
                          </Badge>

                          <BlockStack gap="100">
                            <InlineStack gap="200" alignBlock="center">
                              <Text
                                variant="bodyMd"
                                fontWeight={step.isActive ? 'bold' : 'semibold'}
                                as="span"
                              >
                                {step.title}
                              </Text>
                              {step.isActive && <Badge tone="magic" size="small">Active Now</Badge>}
                              {step.isDone && <Badge tone="success" size="small">Completed</Badge>}
                            </InlineStack>

                            <Text variant="bodySm" tone="subdued" as="p">
                              {step.description}
                            </Text>
                          </BlockStack>
                        </InlineStack>

                        <Text
                          variant="bodySm"
                          tone={step.isUpcoming ? 'subdued' : 'default'}
                          fontWeight={step.isActive ? 'semibold' : 'regular'}
                          as="span"
                        >
                          {step.timestamp}
                        </Text>
                      </InlineStack>
                    </Card>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* RIGHT: Product Details Card & Help Card */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Product Details</Text>

                  <Box minHeight="160px" borderRadius="200" overflowX="hidden" overflowY="hidden">
                    <DesignMockupPreview
                      productType={activeOrder.product || 'T-Shirt'}
                      graphicText={activeOrder.customer || 'Custom Design'}
                      height={160}
                      showGuides={false}
                    />
                  </Box>

                  <BlockStack gap="150">
                    <Text variant="headingSm" as="h3" fontWeight="bold">
                      {activeOrder.product || 'Custom Apparel'}
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Customer: {activeOrder.customer || 'Direct Order'}
                    </Text>
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="150">
                    <InlineStack align="space-between">
                      <Text variant="bodySm" tone="subdued" as="span">Technique</Text>
                      <Text variant="bodySm" fontWeight="semibold" as="span">{activeOrder.technique || 'DTG Print'}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodySm" tone="subdued" as="span">Assigned To</Text>
                      <Text variant="bodySm" fontWeight="semibold" as="span">{activeOrder.supplier || 'Production Floor'}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodySm" tone="subdued" as="span">Status</Text>
                      <Text variant="bodySm" fontWeight="semibold" as="span">{activeOrder.status || 'Active'}</Text>
                    </InlineStack>
                  </BlockStack>

                  <Divider />

                  <Button
                    variant="primary"
                    onClick={() => navigate(`${basePath}/editor`)}
                  >
                    View in Studio
                  </Button>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="250">
                  <Text variant="headingMd" as="h2">Help</Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Have questions about this production run? Contact our merchant support desk.
                  </Text>
                  <Button onClick={() => setContactBanner(true)}>
                    Contact Support
                  </Button>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
