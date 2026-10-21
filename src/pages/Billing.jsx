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

/**
 * Billing
 * 
 * Subscription tier & billing plans for CustomForge:
 * - Active tier (Growth Tier with 500 custom orders/month, multi-supplier routing)
 * - Plan comparison cards (Starter, Growth, Enterprise)
 * - Usage meter for production schedules and AI upscale credits
 * 
 * Strictly uses @shopify/polaris components and layout props (zero custom CSS).
 */
export default function Billing() {
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
      current: false,
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
      current: true,
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
      current: false,
    },
  ];

  return (
    <Page
      title="Subscription Plans & Tier Billing"
      subtitle="Manage your CustomForge capacity, production batching tiers, and factory connections"
    >
      <BlockStack gap="500">
        <Banner title="Current Subscription: Growth Tier Active" tone="success">
          <Text as="p" variant="bodyMd">
            Your store is currently subscribed to the <strong>Growth Tier</strong>. You have utilized 142 of 500 monthly custom order slots.
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
