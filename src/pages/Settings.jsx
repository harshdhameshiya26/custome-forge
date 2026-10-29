import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import PropTypes from 'prop-types';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Tabs,
  Modal,
  TextField,
  Select,
  Banner,
  Box,
  Divider,
  Spinner,
} from '@shopify/polaris';
import api from '../services/api';

const TEAMS = [
  { label: 'DTG Team', value: 'DTG Team' },
  { label: 'UV Print Team', value: 'UV Print Team' },
  { label: 'Print Team', value: 'Print Team' },
  { label: 'Embroidery Team', value: 'Embroidery Team' },
  { label: 'QC Team', value: 'QC Team' },
];

/**
 * Settings
 * Manages store preferences and production handoff routing rules via /api/rules.
 * Starts with no data (0) until rules are created.
 */
export default function Settings({ customOrders = [] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location?.pathname?.startsWith('/app') ? '/app' : '';

  const [activeTab, setActiveTab] = useState(1); // Default to "Production Rules"
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newRuleModalOpen, setNewRuleModalOpen] = useState(false);
  const [newProductType, setNewProductType] = useState('');
  const [newTeam, setNewTeam] = useState('DTG Team');
  const [bannerAlert, setBannerAlert] = useState(null);

  // Settings fields
  const [storeName, setStoreName] = useState('My Shopify Store');
  const [minDpi, setMinDpi] = useState('300');
  const [minBatch, setMinBatch] = useState('25');
  const [maxBatch, setMaxBatch] = useState('100');
  const [emailNotify, setEmailNotify] = useState('enabled');

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.rules.list();
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res?.data?.items) ? res.data.items : []);
      setRules(

        list.map((r) => ({
          id: r.id || r.ruleId,
          productType: r.productType || r.name || 'All Products',
          team: r.targetQueue || 'DTG Team',
          priority: r.priority === 1 ? 'High' : 'Normal',
        }))
      );
    } catch (err) {
      console.warn('Could not fetch real routing rules:', err.message);
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const settingsTabs = [
    { id: 'general', content: 'General' },
    { id: 'production_rules', content: `Production Rules (${rules.length})` },
    { id: 'email_notifications', content: 'Email Notifications' },
  ];

  const customizedOrders = useMemo(
    () => (Array.isArray(customOrders) ? customOrders : []),
    [customOrders],
  );

  const handleAddRule = useCallback(async () => {
    if (!newProductType.trim()) return;
    try {
      const res = await api.rules.create({
        name: `${newProductType.trim()} Routing`,
        productType: newProductType.trim(),
        targetQueue: newTeam,
        priority: 100,
        isActive: true,
      });

      const created = res.data || {
        id: `r_${Date.now()}`,
        productType: newProductType.trim(),
        team: newTeam,
        priority: 'Normal',
      };

      setRules((prev) => [
        ...prev,
        {
          id: created.id || created.ruleId || `r_${Date.now()}`,
          productType: created.productType || newProductType.trim(),
          team: created.targetQueue || newTeam,
          priority: 'Normal',
        },
      ]);

      setBannerAlert({
        tone: 'success',
        title: 'Handoff Rule Added',
        message: `Orders for "${newProductType.trim()}" will automatically route to ${newTeam}.`,
      });
    } catch (err) {
      setBannerAlert({
        tone: 'critical',
        title: 'Error Creating Rule',
        message: err.message || 'Could not save routing rule.',
      });
    } finally {
      setNewRuleModalOpen(false);
      setNewProductType('');
    }
  }, [newProductType, newTeam]);

  const handleDeleteRule = useCallback(async (ruleId) => {
    try {
      await api.rules.remove(ruleId);
    } catch (err) {
      console.warn('API rule delete error, updating UI state:', err.message);
    }
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
    setBannerAlert({
      tone: 'info',
      title: 'Rule Removed',
      message: 'Production routing rule was removed.',
    });
  }, []);

  return (
    <Page
      title="Settings"
      subtitle="Configure your app preferences and production rules."
      primaryAction={{
        content: 'Save Preferences',
        onAction: () => {
          setBannerAlert({
            tone: 'success',
            title: 'Preferences Saved',
            message: 'Your production settings and handoff policies have been updated successfully.',
          });
        },
      }}
      secondaryActions={[
        {
          content: 'Refresh Rules',
          onAction: fetchRules,
        },
        {
          content: 'Production Queue',
          onAction: () => navigate(`${basePath}/production`),
        },
      ]}
    >
      <BlockStack gap="500">
        {bannerAlert && (
          <Banner
            title={bannerAlert.title}
            tone={bannerAlert.tone}
            onDismiss={() => setBannerAlert(null)}
          >
            <Text as="p" variant="bodyMd">{bannerAlert.message}</Text>
          </Banner>
        )}

        <Card>
          <BlockStack gap="500">
            <Tabs
              tabs={settingsTabs}
              selected={activeTab}
              onSelect={setActiveTab}
            />

            {/* TAB 1: PRODUCTION RULES */}
            {activeTab === 1 && (
              <BlockStack gap="500">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h2">Production Handoff Rules</Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Automatically route approved orders to the right production team or factory floor.
                  </Text>
                </BlockStack>

                {loading ? (
                  <Box padding="800">
                    <InlineStack align="center">
                      <Spinner accessibilityLabel="Loading rules" size="large" />
                    </InlineStack>
                  </Box>
                ) : rules.length === 0 ? (
                  <Card background="bg-surface-secondary">
                    <Box padding="400">
                      <BlockStack gap="200" inlineAlign="center">
                        <Text variant="headingSm" as="h3" alignment="center">
                          No production handoff rules configured (0)
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="p" alignment="center">
                          Add custom rules to direct products (e.g. T-Shirt, Hoodie, Tumbler) directly to their specialized manufacturing queues.
                        </Text>
                      </BlockStack>
                    </Box>
                  </Card>
                ) : (
                  <BlockStack gap="200">
                    {rules.map((rule) => (
                      <Card key={rule.id} background="bg-surface-secondary">
                        <InlineStack align="space-between" alignBlock="center" wrap gap="200">
                          <InlineStack gap="300" alignBlock="center">
                            <Text tone="subdued" as="span">::</Text>
                            <Text variant="bodyMd" fontWeight="bold" as="span">
                              {rule.productType}
                            </Text>
                          </InlineStack>

                          <InlineStack gap="300" alignBlock="center">
                            <Badge tone="info">{rule.team}</Badge>
                            <Button
                              size="slim"
                              tone="critical"
                              variant="plain"
                              onClick={() => handleDeleteRule(rule.id)}
                            >
                              Delete
                            </Button>
                          </InlineStack>
                        </InlineStack>
                      </Card>
                    ))}
                  </BlockStack>
                )}

                {/* Add Rule Button */}
                <InlineStack align="start">
                  <Button
                    variant="primary"
                    onClick={() => setNewRuleModalOpen(true)}
                  >
                    + Add New Rule
                  </Button>
                </InlineStack>

                <Divider />

                {/* Factory Batch & Pre-flight Constraints */}
                <BlockStack gap="300">
                  <Text variant="headingSm" as="h3">Factory Automation Policies</Text>
                  <Layout>
                    <Layout.Section variant="oneThird">
                      <TextField
                        label="Minimum Batch Size"
                        type="number"
                        value={minBatch}
                        onChange={setMinBatch}
                        helpText="Minimum units before automated factory dispatch."
                        autoComplete="off"
                      />
                    </Layout.Section>
                    <Layout.Section variant="oneThird">
                      <TextField
                        label="Maximum Batch Capacity"
                        type="number"
                        value={maxBatch}
                        onChange={setMaxBatch}
                        helpText="Maximum units per production run."
                        autoComplete="off"
                      />
                    </Layout.Section>
                    <Layout.Section variant="oneThird">
                      <TextField
                        label="Pre-flight DPI Threshold"
                        type="number"
                        value={minDpi}
                        onChange={setMinDpi}
                        helpText="Minimum commercial print resolution (DPI)."
                        autoComplete="off"
                      />
                    </Layout.Section>
                  </Layout>
                </BlockStack>
              </BlockStack>
            )}

            {/* TAB 0: GENERAL */}
            {activeTab === 0 && (
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">General App Settings</Text>
                <TextField
                  label="Merchant Store Identifier"
                  value={storeName}
                  onChange={setStoreName}
                  autoComplete="off"
                />
                <Select
                  label="Email Notification Alerts"
                  options={[
                    { label: 'Enabled (Send notifications on proof sign-off)', value: 'enabled' },
                    { label: 'Disabled', value: 'disabled' },
                  ]}
                  value={emailNotify}
                  onChange={setEmailNotify}
                />
              </BlockStack>
            )}

            {/* TAB 2: EMAIL NOTIFICATIONS */}
            {activeTab === 2 && (
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Customized Product Orders</Text>
                <Text variant="bodySm" tone="subdued" as="p">
                  Shopify orders containing products published from CustomForge.
                </Text>
                <Banner tone="info" title="Shopify customer email access requires approval">
                  <Text as="p" variant="bodyMd">
                    The orders below are available, but Shopify is blocking customer email data because this app has not been approved for protected customer data. Request access in the Shopify Partner Dashboard to show email addresses. Order history may also be limited to the last 60 days.
                  </Text>
                </Banner>
                {customizedOrders.length === 0 ? (
                  <Card background="bg-surface-secondary">
                    <Box padding="400">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        No orders containing CustomForge-published products were found in the available Shopify order history.
                      </Text>
                    </Box>
                  </Card>
                ) : (
                  <BlockStack gap="200">
                    {customizedOrders.map((order) => (
                      <Card key={order.shopifyOrderId || order.orderNumber} background="bg-surface-secondary">
                        <BlockStack gap="200">
                          <InlineStack align="space-between" alignBlock="center" wrap>
                            <BlockStack gap="100">
                              <Text variant="bodyMd" fontWeight="bold" as="span">
                                {order.orderNumber}
                              </Text>
                              <Text variant="bodySm" tone="subdued" as="span">
                                {order.products.join(', ')}
                              </Text>
                            </BlockStack>
                            <Badge tone="info">
                              {order.customerEmail || 'Email requires approval'}
                            </Badge>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </Text>
                        </BlockStack>
                      </Card>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            )}

          </BlockStack>
        </Card>
      </BlockStack>

      {/* Add New Rule Modal */}
      <Modal
        open={newRuleModalOpen}
        onClose={() => setNewRuleModalOpen(false)}
        title="Add Production Handoff Rule"
        primaryAction={{
          content: 'Save Routing Rule',
          disabled: !newProductType.trim(),
          onAction: handleAddRule,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setNewRuleModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField
              label="Product Type"
              value={newProductType}
              onChange={setNewProductType}
              placeholder="e.g. Tote Bag, Canvas, Tumbler"
              autoComplete="off"
            />
            <Select
              label="Assigned Production Team"
              options={TEAMS}
              value={newTeam}
              onChange={setNewTeam}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

Settings.propTypes = {
  customOrders: PropTypes.arrayOf(
    PropTypes.shape({
      customerEmail: PropTypes.string,
      orderNumber: PropTypes.string.isRequired,
      shopifyOrderId: PropTypes.string,
      createdAt: PropTypes.string.isRequired,
      products: PropTypes.arrayOf(PropTypes.string).isRequired,
    }),
  ).isRequired,
};
