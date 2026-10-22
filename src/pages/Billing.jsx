import { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Banner,
  Divider,
  List,
} from '@shopify/polaris';
import api from '../services/api';

/**
 * Billing
 * Subscription tier & billing plans for CustomForge.
 * Fetches real usage metrics from the API and starts with 0 utilized orders.
 */
export default function Billing() {
  const [usedCount, setUsedCount] = useState(0);
  const [activePlan, setActivePlan] = useState('Growth Tier');
  const [loading, setLoading] = useState(true);

  const fetchBillingInfo = useCallback(async () => {
    try {
      setLoading(true);
      const [statusRes, ordersRes] = await Promise.allSettled([
        api.billing.getStatus(),
        api.orders.list(),
      ]);

      if (statusRes.status === 'fulfilled' && statusRes.value?.data?.subscription) {
        const sub = statusRes.value.data.subscription;
        setActivePlan(sub.name || 'Growth Tier');
      }

      if (ordersRes.status === 'fulfilled') {
        const val = ordersRes.value?.data;
        const list = Array.isArray(val) ? val : (Array.isArray(val?.items) ? val.items : []);
        setUsedCount(list.length);
      } else {
        setUsedCount(0);
      }

    } catch {
      setUsedCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBillingInfo();
  }, [fetchBillingInfo]);

  const plans = [
    {
      name: 'Starter Tier',
      price: '$29/mo',
      orderLimit: 'Up to 50 custom orders/mo',
      features: [
        'Single factory integration',
        'Standard DPI verification',
        'Email proof approval',
        'Standard production timeline',
      ],
      current: activePlan === 'Starter Tier',
    },
    {
      name: 'Growth Tier (Active)',
      price: '$79/mo',
      orderLimit: 'Up to 500 custom orders/mo',
      features: [
        'Unlimited verified suppliers',
        'Automated AI 300 DPI upscaling',
        'Merchant 2FA OTP schedule release',
        'Batching engine (25-100 design bundling)',
        'Full customer-merchant proof revision thread',
      ],
      current: activePlan.toLowerCase().includes('growth') || activePlan === 'Growth Tier',
    },
    {
      name: 'Enterprise Production',
      price: '$249/mo',
      orderLimit: 'Unlimited custom orders',
      features: [
        'Dedicated factory SLA monitoring',
        'Custom pre-press calibration curves',
        'ERP & Webhook real-time machine sync',
        'Priority phone & pre-flight engineering support',
      ],
      current: activePlan === 'Enterprise Production',
    },
  ];

  return (
    <Page
      title="Subscription Plans & Tier Billing"
      subtitle="Manage your CustomForge capacity, production batching tiers, and factory connections"
      secondaryActions={[
        {
          content: 'Refresh Usage',
          onAction: fetchBillingInfo,
        },
      ]}
    >
      <BlockStack gap="500">
        <Banner title={`Current Subscription: ${activePlan} Active`} tone="success">
          <Text as="p" variant="bodyMd">
            Your store is currently subscribed to the <strong>{activePlan}</strong>. You have utilized <strong>{usedCount}</strong> of 500 monthly custom order slots.
          </Text>
        </Banner>

        <Layout>
          {plans.map((plan, idx) => (
            <Layout.Section key={idx} variant="oneThird">
              <Card background={plan.current ? 'bg-surface-secondary' : 'bg-surface'}>
                <BlockStack gap="300">
                  <InlineStack align="space-between" alignBlock="center">
                    <Text variant="headingSm" as="h4">
                      {plan.name}
                    </Text>
                    {plan.current && <Badge tone="success">Current Plan</Badge>}
                  </InlineStack>

                  <Text variant="headingXl" as="p" fontWeight="bold">
                    {plan.price}
                  </Text>

                  <Text variant="bodySm" tone="subdued">
                    {plan.orderLimit}
                  </Text>

                  <Divider />

                  <Text variant="bodySm" fontWeight="semibold">
                    Included Features:
                  </Text>

                  <List type="bullet">
                    {plan.features.map((feat, fIdx) => (
                      <List.Item key={fIdx}>{feat}</List.Item>
                    ))}
                  </List>

                  <Divider />

                  <Button
                    variant={plan.current ? undefined : 'primary'}
                    disabled={plan.current}
                    fullWidth
                  >
                    {plan.current ? 'Current Active Tier' : 'Upgrade Plan'}
                  </Button>
                </BlockStack>
              </Card>
            </Layout.Section>
          ))}
        </Layout>
      </BlockStack>
    </Page>
  );
}
