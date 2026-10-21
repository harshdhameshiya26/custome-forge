import { useState, useMemo, useCallback } from 'react';
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
  DataTable,
  Banner,
  Modal,
  TextField,
  Select,
  Divider,
  Box,
  ProgressBar,
  Tabs,
} from '@shopify/polaris';
import SupplierScheduleInterface from '../components/SupplierScheduleInterface';

/**
 * MerchantDashboard
 * 
 * Central operations center for store merchants managing customized products:
 * - Real-time metrics cards: Active Custom Orders, Pending Proof Approvals, Supplier Schedule Batches, Design Submissions
 * - Production Handoff Rules configuration modal
 * - Supplier Capacity Queue modal
 * - Interactive batch schedule creator (25 to 100 design rule enforcement with 2FA OTP)
 * - Orders & Designs DataTable with filtering and status badges
 * 
 * Strictly uses @shopify/polaris components and layout props (zero custom CSS).
 */
export default function MerchantDashboard() {
  const [activeTab, setActiveTab] = useState(0);
  const [handoffModalOpen, setHandoffModalOpen] = useState(false);
  const [supplierQueueModalOpen, setSupplierQueueModalOpen] = useState(false);
  const [createScheduleOpen, setCreateScheduleOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [toastMessage, setToastMessage] = useState(null);

  // Handoff Rules Form State
  const [minBatchSize, setMinBatchSize] = useState('25');
  const [maxBatchSize, setMaxBatchSize] = useState('100');
  const [minDpiThreshold, setMinDpiThreshold] = useState('300');
  const [autoRouteEnabled, setAutoRouteEnabled] = useState('enabled');

  // Dashboard Overview Metrics
  const metrics = [
    {
      title: 'Active Custom Orders',
      value: '142',
      trend: '+18% vs last week',
      tone: 'success',
      badgeText: 'Live Pipeline',
    },
    {
      title: 'Pending Proof Approvals',
      value: '19',
      trend: '4 require urgent sign-off',
      tone: 'critical',
      badgeText: 'Action Required',
    },
    {
      title: 'Supplier Schedule Batches',
      value: '6',
      trend: '3 In Production, 1 Awaiting OTP',
      tone: 'info',
      badgeText: 'Factory Active',
    },
    {
      title: 'Recent Design Submissions',
      value: '84',
      trend: '95.2% Artwork DPI Pass Rate',
      tone: 'success',
      badgeText: 'Pre-flight Valid',
    },
  ];

  // Supplier Queues Data
  const supplierQueues = [
    {
      name: 'Apex Apparel & Embroidery Mills',
      category: 'Apparel & Textiles',
      activeBatch: 'Batch #SCH-2026-APEX-09 (35 items)',
      capacity: 70,
      status: 'Operating Normally',
    },
    {
      name: 'Vanguard Thermal Drinkware Labs',
      category: 'Drinkware / Flasks',
      activeBatch: 'Batch #SCH-2026-VANGUARD-04 (50 items)',
      capacity: 85,
      status: 'High Load',
    },
    {
      name: 'Nordic Leathercraft Co.',
      category: 'Leather Goods',
      activeBatch: 'Awaiting minimum 25 design threshold (18 queued)',
      capacity: 35,
      status: 'Ready for Batch',
    },
    {
      name: 'Titan Precision Metal & Laser Guild',
      category: 'Hardware & Metals',
      activeBatch: 'Batch #SCH-2026-TITAN-02 (28 items)',
      capacity: 40,
      status: 'Operating Normally',
    },
  ];

  // Orders Table Sample Data
  const orderRowsData = useMemo(() => [
    {
      id: 'ORD-8491',
      date: 'Oct 19, 2026',
      customer: 'Sarah Jenkins',
      product: 'Heavyweight French Terry Hoodie',
      technique: 'Embroidery',
      dpi: '320 DPI',
      status: 'In Production',
      supplier: 'Apex Mills',
    },
    {
      id: 'ORD-8492',
      date: 'Oct 19, 2026',
      customer: 'Michael Chen',
      product: 'Insulated Hydro Tumbler 32oz',
      technique: 'Laser Engraving',
      dpi: '300 DPI',
      status: 'Feasibility Passed',
      supplier: 'Vanguard Labs',
    },
    {
      id: 'ORD-8493',
      date: 'Oct 18, 2026',
      customer: 'Elena Rostova',
      product: 'Full Grain Leather Folio',
      technique: 'Foil Debossing',
      dpi: '180 DPI (Upscaled)',
      status: 'Proof Pending',
      supplier: 'Nordic Leather',
    },
    {
      id: 'ORD-8494',
      date: 'Oct 18, 2026',
      customer: 'David Kalu',
      product: 'Minimalist Titanium Pen',
      technique: 'Laser Etch',
      dpi: '350 DPI',
      status: 'Shipped',
      supplier: 'Titan Metal Guild',
    },
    {
      id: 'ORD-8495',
      date: 'Oct 17, 2026',
      customer: 'Amanda Cruz',
      product: 'Embroidered Dad Hat',
      technique: 'Embroidery',
      dpi: '300 DPI',
      status: 'Design Received',
      supplier: 'Apex Mills',
    },
  ], []);

  // Filtered rows for DataTable
  const filteredOrderRows = useMemo(() => {
    return orderRowsData
      .filter((row) => {
        if (selectedStatusFilter !== 'ALL' && row.status !== selectedStatusFilter) {
          return false;
        }
        if (filterQuery.trim()) {
          const q = filterQuery.toLowerCase();
          return (
            row.id.toLowerCase().includes(q) ||
            row.customer.toLowerCase().includes(q) ||
            row.product.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .map((row) => [
        row.id,
        row.date,
        row.customer,
        row.product,
        row.technique,
        row.dpi,
        row.supplier,
        <Badge
          key={row.id}
          tone={
            row.status === 'Shipped'
              ? 'success'
              : row.status === 'In Production'
              ? 'info'
              : row.status === 'Proof Pending'
              ? 'attention'
              : 'subdued'
          }
        >
          {row.status}
        </Badge>,
      ]);
  }, [orderRowsData, filterQuery, selectedStatusFilter]);

  const handleSaveHandoffRules = useCallback(() => {
    setHandoffModalOpen(false);
    setToastMessage('Production handoff rules updated successfully.');
  }, []);

  const tabs = [
    { id: 'tab-overview', content: 'Operational Overview' },
    { id: 'tab-schedule', content: 'Supplier Schedules & Batches' },
    { id: 'tab-queues', content: 'Factory Queues' },
  ];

  return (
    <Page
      title="Merchant Operations Dashboard"
      subtitle="CustomForge Production Hub & Factory Handoff Controls"
      primaryAction={{
        content: 'Create Supplier Schedule Batch',
        onAction: () => {
          setActiveTab(1);
          setCreateScheduleOpen(true);
        },
      }}
      secondaryActions={[
        {
          content: 'Manage Handoff Rules',
          onAction: () => setHandoffModalOpen(true),
        },
        {
          content: 'View Supplier Queues',
          onAction: () => setSupplierQueueModalOpen(true),
        },
      ]}
    >
      <BlockStack gap="500">
        {toastMessage && (
          <Banner
            title={toastMessage}
            tone="success"
            onDismiss={() => setToastMessage(null)}
          />
        )}

        {/* Top Operational Metrics Cards */}
        <Layout>
          {metrics.map((metric, i) => (
            <Layout.Section key={i} variant="oneHalf">
              <Card>
                <BlockStack gap="200">
                  <InlineStack align="space-between" alignBlock="center">
                    <Text variant="headingSm" as="h4" tone="subdued">
                      {metric.title}
                    </Text>
                    <Badge tone={metric.tone}>{metric.badgeText}</Badge>
                  </InlineStack>

                  <Text variant="headingXl" as="p" fontWeight="bold">
                    {metric.value}
                  </Text>

                  <InlineStack align="space-between">
                    <Text variant="bodySm" tone={metric.tone === 'critical' ? 'critical' : 'subdued'}>
                      {metric.trend}
                    </Text>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          ))}
        </Layout>

        {/* Tabbed Main Control Center */}
        <Card>
          <BlockStack gap="400">
            <Tabs tabs={tabs} selected={activeTab} onSelect={setActiveTab} />

            {/* TAB 0: OPERATIONAL OVERVIEW & ORDERS DATATABLE */}
            {activeTab === 0 && (
              <BlockStack gap="400">
                {/* Search & Filter Bar */}
                <InlineStack align="space-between" alignBlock="center">
                  <Box width="60%">
                    <TextField
                      label="Filter Orders or Customers"
                      labelHidden
                      placeholder="Search by Order #, customer name, or customized product..."
                      value={filterQuery}
                      onChange={setFilterQuery}
                      autoComplete="off"
                      clearButton
                      onClearButtonClick={() => setFilterQuery('')}
                    />
                  </Box>

                  <Box width="35%">
                    <Select
                      label="Filter by Pipeline Status"
                      labelHidden
                      options={[
                        { label: 'All Statuses', value: 'ALL' },
                        { label: 'Design Received', value: 'Design Received' },
                        { label: 'Feasibility Passed', value: 'Feasibility Passed' },
                        { label: 'Proof Pending', value: 'Proof Pending' },
                        { label: 'In Production', value: 'In Production' },
                        { label: 'Shipped', value: 'Shipped' },
                      ]}
                      value={selectedStatusFilter}
                      onChange={setSelectedStatusFilter}
                    />
                  </Box>
                </InlineStack>

                <Divider />

                <Text variant="headingSm" as="h4">
                  Active Custom Orders In-Flight ({filteredOrderRows.length})
                </Text>

                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text']}
                  headings={[
                    'Order ID',
                    'Date',
                    'Customer',
                    'Product',
                    'Technique',
                    'Artwork Resolution',
                    'Assigned Factory',
                    'Status',
                  ]}
                  rows={filteredOrderRows}
                />
              </BlockStack>
            )}

            {/* TAB 1: SUPPLIER SCHEDULE INTERFACE */}
            {activeTab === 1 && (
              <SupplierScheduleInterface
                onScheduleCreated={(schedule) => {
                  setToastMessage(`Batch schedule for ${schedule.designCount} designs authorized and dispatched via OTP.`);
                  setActiveTab(0);
                }}
              />
            )}

            {/* TAB 2: FACTORY SUPPLIER QUEUES */}
            {activeTab === 2 && (
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Partner Supplier Queue Capacity &amp; Category Status
                </Text>
                <Text variant="bodySm" tone="subdued">
                  Real-time factory machine workload and scheduled design batches.
                </Text>

                <Layout>
                  {supplierQueues.map((sup, idx) => (
                    <Layout.Section key={idx} variant="oneHalf">
                      <Card>
                        <BlockStack gap="300">
                          <InlineStack align="space-between">
                            <Text variant="headingSm" as="h4">
                              {sup.name}
                            </Text>
                            <Badge
                              tone={
                                sup.status === 'High Load'
                                  ? 'attention'
                                  : sup.status === 'Ready for Batch'
                                  ? 'info'
                                  : 'success'
                              }
                            >
                              {sup.status}
                            </Badge>
                          </InlineStack>

                          <Text variant="bodySm" tone="subdued">
                            Specialization: {sup.category}
                          </Text>

                          <Divider />

                          <Text variant="bodySm">
                            Current Queue: <strong>{sup.activeBatch}</strong>
                          </Text>

                          <BlockStack gap="100">
                            <InlineStack align="space-between">
                              <Text variant="bodySm" tone="subdued">
                                Machine Utilization:
                              </Text>
                              <Text variant="bodySm" fontWeight="bold">
                                {sup.capacity}%
                              </Text>
                            </InlineStack>
                            <ProgressBar
                              progress={sup.capacity}
                              tone={sup.capacity > 80 ? 'critical' : 'primary'}
                              size="small"
                            />
                          </BlockStack>
                        </BlockStack>
                      </Card>
                    </Layout.Section>
                  ))}
                </Layout>
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      {/* Production Handoff Rules Modal */}
      <Modal
        open={handoffModalOpen}
        onClose={() => setHandoffModalOpen(false)}
        title="Production Handoff & Routing Rules Configuration"
        primaryAction={{
          content: 'Save Handoff Rules',
          onAction: handleSaveHandoffRules,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setHandoffModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info" title="Automated Factory Handoff Policy">
              <Text as="p" variant="bodyMd">
                Configure minimum and maximum design bundling limits and pre-flight quality gates before releasing batches to suppliers.
              </Text>
            </Banner>

            <InlineStack gap="400" wrap={false}>
              <Box width="50%">
                <TextField
                  label="Minimum Designs per Schedule"
                  type="number"
                  value={minBatchSize}
                  onChange={setMinBatchSize}
                  helpText="Strict minimum rule: 25 designs"
                  autoComplete="off"
                />
              </Box>
              <Box width="50%">
                <TextField
                  label="Maximum Designs per Schedule"
                  type="number"
                  value={maxBatchSize}
                  onChange={setMaxBatchSize}
                  helpText="Strict maximum limit: 100 designs"
                  autoComplete="off"
                />
              </Box>
            </InlineStack>

            <InlineStack gap="400" wrap={false}>
              <Box width="50%">
                <TextField
                  label="Minimum Print DPI Gate"
                  type="number"
                  value={minDpiThreshold}
                  onChange={setMinDpiThreshold}
                  helpText="Files below this trigger the Artwork Quality Modal"
                  autoComplete="off"
                />
              </Box>
              <Box width="50%">
                <Select
                  label="Automated Factory Routing"
                  options={[
                    { label: 'Enabled (Auto-route upon OTP)', value: 'enabled' },
                    { label: 'Manual Review Required', value: 'manual' },
                  ]}
                  value={autoRouteEnabled}
                  onChange={setAutoRouteEnabled}
                  helpText="Requires 2FA verification code on batch release"
                />
              </Box>
            </InlineStack>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Supplier Queue Quick Modal */}
      <Modal
        open={supplierQueueModalOpen}
        onClose={() => setSupplierQueueModalOpen(false)}
        title="Live Supplier Queues & Machine Capacity"
        primaryAction={{
          content: 'Close',
          onAction: () => setSupplierQueueModalOpen(false),
        }}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {supplierQueues.map((sup, idx) => (
              <Card key={idx} background="bg-surface-secondary">
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" fontWeight="bold">{sup.name}</Text>
                    <Badge tone="info">{sup.category}</Badge>
                  </InlineStack>
                  <Text variant="bodySm">{sup.activeBatch}</Text>
                  <ProgressBar progress={sup.capacity} size="small" />
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
