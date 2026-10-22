import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  DataTable,
  Box,
  Divider,
  ProgressBar,
  SkeletonBodyText,
  Banner,
} from '@shopify/polaris';
import api from '../services/api.js';

/**
 * Dashboard — Merchant Operations Overview
 * Fetches real metrics from /api/analytics/dashboard.
 * Starts with 0 / empty state when the DB has no data yet.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location?.pathname?.startsWith('/app') ? '/app' : '';

  const EMPTY_METRICS = {
    totalOrders: 0,
    pendingApproval: 0,
    inProduction: 0,
    completed: 0,
  };

  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.analytics
      .dashboard()
      .then((json) => {
        if (cancelled) return;
        if (json?.data?.summary) {
          setMetrics({
            totalOrders: json.data.summary.totalOrders ?? 0,
            pendingApproval: json.data.summary.pendingApproval ?? 0,
            inProduction: json.data.summary.inProduction ?? 0,
            completed: json.data.summary.completed ?? 0,
          });
        }
        if (Array.isArray(json?.data?.recentOrders)) {
          setRecentOrders(json.data.recentOrders);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Dashboard fetch notice:', err.message);
          setMetrics(EMPTY_METRICS);
          setRecentOrders([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);


  const recentOrderRows = recentOrders.map((ord, i) => [
    <Button
      key={`${ord.orderNumber}-${i}-link`}
      variant="plain"
      onClick={() => navigate(`${basePath}/orders`)}
    >
      <Text fontWeight="bold" as="span">{ord.orderNumber}</Text>
    </Button>,
    ord.customerName,
    ord.productTitle,
    <Badge key={`${ord.orderNumber}-${i}-badge`} tone={ord.statusTone}>{ord.status}</Badge>,
    <Text key={`${ord.orderNumber}-${i}-date`} tone="subdued" as="span">{ord.date}</Text>,
  ]);

  const totalForPercent = metrics.totalOrders || 1;

  return (
    <Page
      title="Merchant Dashboard"
      subtitle="Here's what's happening with your custom products."
      primaryAction={{
        content: '+ Create New Design',
        onAction: () => navigate(`${basePath}/editor`),
      }}
    >
      <BlockStack gap="500">
        {/* Error Banner */}
        {error && (
          <Banner tone="critical" title="Failed to load dashboard" onDismiss={() => setError(null)}>
            <Text as="p" variant="bodyMd">{error}</Text>
          </Banner>
        )}

        {/* 4 Metric Cards */}
        <Layout>
          {/* 1. Total Orders */}
          <Layout.Section variant="oneFourth">
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" alignBlock="center">
                  <Text tone="subdued" variant="bodySm" as="span">Total Orders</Text>
                  <Badge tone="info" size="small">Orders</Badge>
                </InlineStack>
                {loading ? (
                  <SkeletonBodyText lines={1} />
                ) : (
                  <Text variant="heading2xl" as="p" fontWeight="bold">
                    {metrics.totalOrders}
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* 2. Pending Approval */}
          <Layout.Section variant="oneFourth">
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" alignBlock="center">
                  <Text tone="subdued" variant="bodySm" as="span">Pending Approval</Text>
                  <Badge tone="attention" size="small">Action Req</Badge>
                </InlineStack>
                {loading ? (
                  <SkeletonBodyText lines={1} />
                ) : (
                  <Text variant="heading2xl" as="p" fontWeight="bold">
                    {metrics.pendingApproval}
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* 3. In Production */}
          <Layout.Section variant="oneFourth">
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" alignBlock="center">
                  <Text tone="subdued" variant="bodySm" as="span">In Production</Text>
                  <Badge tone="magic" size="small">Live Floor</Badge>
                </InlineStack>
                {loading ? (
                  <SkeletonBodyText lines={1} />
                ) : (
                  <Text variant="heading2xl" as="p" fontWeight="bold">
                    {metrics.inProduction}
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* 4. Completed */}
          <Layout.Section variant="oneFourth">
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" alignBlock="center">
                  <Text tone="subdued" variant="bodySm" as="span">Completed</Text>
                  <Badge tone="success" size="small">Fulfilled</Badge>
                </InlineStack>
                {loading ? (
                  <SkeletonBodyText lines={1} />
                ) : (
                  <Text variant="heading2xl" as="p" fontWeight="bold">
                    {metrics.completed}
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Recent Orders + Design Stats */}
        <Layout>
          {/* Recent Orders */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" alignBlock="center">
                  <Text variant="headingMd" as="h2">Recent Orders</Text>
                  <Button variant="plain" onClick={() => navigate(`${basePath}/orders`)}>
                    View all
                  </Button>
                </InlineStack>

                {loading ? (
                  <SkeletonBodyText lines={4} />
                ) : recentOrders.length === 0 ? (
                  <Box padding="400">
                    <Text tone="subdued" alignment="center" as="p" variant="bodyMd">
                      No orders yet. Orders will appear here once customers place custom product orders.
                    </Text>
                  </Box>
                ) : (
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                    headings={['# Order', 'Customer', 'Product', 'Status', 'Date']}
                    rows={recentOrderRows}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Design Statistics */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Design Statistics</Text>

                <Card background="bg-surface-secondary">
                  <Box padding="400">
                    <BlockStack gap="200" align="center">
                      <Text tone="subdued" variant="bodySm" as="span" alignment="center">
                        Total Orders
                      </Text>
                      {loading ? (
                        <SkeletonBodyText lines={1} />
                      ) : (
                        <Text variant="heading3xl" as="p" alignment="center" fontWeight="bold">
                          {metrics.totalOrders}
                        </Text>
                      )}
                    </BlockStack>
                  </Box>
                </Card>

                <Divider />

                <BlockStack gap="300">
                  {/* Pending Approval */}
                  <BlockStack gap="100">
                    <InlineStack align="space-between">
                      <InlineStack gap="150" alignBlock="center">
                        <Box background="bg-fill-caution" minWidth="10px" minHeight="10px" borderRadius="full" />
                        <Text variant="bodySm" as="span">Pending Approval</Text>
                      </InlineStack>
                      <Text variant="bodySm" fontWeight="bold" as="span">{metrics.pendingApproval}</Text>
                    </InlineStack>
                    <ProgressBar
                      progress={Math.round((metrics.pendingApproval / totalForPercent) * 100)}
                      tone="caution"
                      size="small"
                    />
                  </BlockStack>

                  {/* In Production */}
                  <BlockStack gap="100">
                    <InlineStack align="space-between">
                      <InlineStack gap="150" alignBlock="center">
                        <Box background="bg-fill-magic" minWidth="10px" minHeight="10px" borderRadius="full" />
                        <Text variant="bodySm" as="span">In Production</Text>
                      </InlineStack>
                      <Text variant="bodySm" fontWeight="bold" as="span">{metrics.inProduction}</Text>
                    </InlineStack>
                    <ProgressBar
                      progress={Math.round((metrics.inProduction / totalForPercent) * 100)}
                      tone="info"
                      size="small"
                    />
                  </BlockStack>

                  {/* Completed */}
                  <BlockStack gap="100">
                    <InlineStack align="space-between">
                      <InlineStack gap="150" alignBlock="center">
                        <Box background="bg-fill-success" minWidth="10px" minHeight="10px" borderRadius="full" />
                        <Text variant="bodySm" as="span">Completed</Text>
                      </InlineStack>
                      <Text variant="bodySm" fontWeight="bold" as="span">{metrics.completed}</Text>
                    </InlineStack>
                    <ProgressBar
                      progress={Math.round((metrics.completed / totalForPercent) * 100)}
                      tone="success"
                      size="small"
                    />
                  </BlockStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
