import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  ProgressBar,
  Button,
  ButtonGroup,
  Banner,
  Box,
  Divider,
  DataTable,
  Modal,
} from '@shopify/polaris';

/**
 * OrderTracking
 * 
 * Step-by-step visual tracker for custom orders:
 * Design Received -> Artwork Verified -> Feasibility Passed -> Proof Approved -> In Production -> Quality Inspection -> Shipped
 * 
 * Includes carrier tracking integration, batch schedule reference, and proof download.
 * Strictly uses @shopify/polaris components and layout props (zero custom CSS).
 */
export default function OrderTracking() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location?.pathname?.startsWith('/app') ? '/app' : '';

  const [selectedOrderId, setSelectedOrderId] = useState('ORD-8491');
  const [proofPreviewOpen, setProofPreviewOpen] = useState(false);

  // Sample Custom Orders
  const orders = useMemo(() => [
    {
      id: 'ORD-8491',
      customerName: 'Sarah Jenkins',
      productTitle: 'Heavyweight French Terry Hoodie',
      technique: 'Embroidery (Madeira 40)',
      orderedAt: 'Oct 17, 2026, 09:12 AM',
      currentStageIndex: 4, // 0 to 6
      trackingNumber: '1Z9999999999999999',
      carrier: 'UPS Ground',
      batchScheduleId: 'SCH-2026-APEX-09',
      supplier: 'Apex Apparel & Embroidery Mills',
      estimatedDelivery: 'Oct 24, 2026',
    },
    {
      id: 'ORD-8492',
      customerName: 'Michael Chen',
      productTitle: 'Insulated Hydro Tumbler 32oz',
      technique: 'Laser Engraving 360',
      orderedAt: 'Oct 18, 2026, 02:40 PM',
      currentStageIndex: 2,
      trackingNumber: 'Pending Production Run',
      carrier: 'FedEx Express',
      batchScheduleId: 'SCH-2026-VANGUARD-04',
      supplier: 'Vanguard Thermal Labs',
      estimatedDelivery: 'Oct 28, 2026',
    },
    {
      id: 'ORD-8493',
      customerName: 'Elena Rostova',
      productTitle: 'Full Grain Leather Folio',
      technique: 'Heat Foil Debossing',
      orderedAt: 'Oct 19, 2026, 11:05 AM',
      currentStageIndex: 1,
      trackingNumber: 'Awaiting Proof Sign-Off',
      carrier: 'DHL Express',
      batchScheduleId: 'Unassigned (Awaiting Batch Min 25)',
      supplier: 'Nordic Leathercraft Co.',
      estimatedDelivery: 'Nov 02, 2026',
    },
  ], []);

  const activeOrder = orders.find((o) => o.id === selectedOrderId) || orders[0];

  // Pipeline Stages Definition
  const pipelineStages = [
    {
      title: 'Design Received',
      description: 'Customer submitted custom graphic & placement options.',
      timestamp: 'Oct 17, 09:12 AM',
      operator: 'Automated Ingestion',
    },
    {
      title: 'Artwork Quality Verified',
      description: 'Passed 300 DPI resolution, CMYK profile, and bleed check.',
      timestamp: 'Oct 17, 09:15 AM',
      operator: 'Pre-flight AI Inspector',
    },
    {
      title: 'Feasibility Passed',
      description: 'Material and stitch density validated against factory specs.',
      timestamp: 'Oct 17, 10:04 AM',
      operator: 'Rule Engine #FEAS-401',
    },
    {
      title: 'Proof Approved & Locked',
      description: 'Customer & merchant sign-off authenticated via 2FA OTP.',
      timestamp: 'Oct 18, 04:45 PM',
      operator: 'Merchant Authorization',
    },
    {
      title: 'In Factory Production',
      description: 'Assigned to factory schedule batch #SCH-2026-APEX-09. Embroidery active.',
      timestamp: 'Oct 19, 08:30 AM',
      operator: 'Apex Mills Head #4',
    },
    {
      title: 'Quality Control Inspection',
      description: 'Optical inspection against original vector proof.',
      timestamp: 'Pending Factory Completion',
      operator: 'Pre-dispatch QC Team',
    },
    {
      title: 'Shipped & Out for Delivery',
      description: 'Package handed over to carrier with live tracking.',
      timestamp: 'Estimated Oct 22',
      operator: 'Logistics Handoff',
    },
  ];

  const currentStageIndex = activeOrder.currentStageIndex;
  const progressRatio = Math.round(((currentStageIndex + 1) / pipelineStages.length) * 100);

  return (
    <Page
      title={`Custom Order Timeline — #${activeOrder.id}`}
      subtitle={`${activeOrder.productTitle} for ${activeOrder.customerName}`}
      backAction={{ content: 'Back to Dashboard', onAction: () => navigate(`${basePath}/dashboard`) }}
      titleMetadata={
        <Badge
          tone={
            currentStageIndex >= 6
              ? 'success'
              : currentStageIndex >= 4
              ? 'info'
              : 'attention'
          }
        >
          {pipelineStages[currentStageIndex].title}
        </Badge>
      }
      secondaryActions={[
        {
          content: 'View Digital Proof',
          onAction: () => setProofPreviewOpen(true),
        },
      ]}
    >
      <BlockStack gap="500">
        {/* Order Selector Banner */}
        <Card>
          <InlineStack align="space-between" alignBlock="center">
            <BlockStack gap="100">
              <Text variant="headingSm" as="h4">
                Select Active Custom Order to Track:
              </Text>
              <Text variant="bodySm" tone="subdued">
                Monitor real-time machine status and factory queue progress
              </Text>
            </BlockStack>
            <ButtonGroup>
              {orders.map((ord) => (
                <Button
                  key={ord.id}
                  pressed={ord.id === activeOrder.id}
                  onClick={() => setSelectedOrderId(ord.id)}
                >
                  {ord.id} ({ord.customerName})
                </Button>
              ))}
            </ButtonGroup>
          </InlineStack>
        </Card>

        {/* Progress Overview Bar */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text variant="headingSm" as="h4">
                Overall Manufacturing &amp; Fulfillment Progress
              </Text>
              <Text variant="bodyMd" fontWeight="bold">
                Stage {currentStageIndex + 1} of {pipelineStages.length} ({progressRatio}%)
              </Text>
            </InlineStack>

            <ProgressBar
              progress={progressRatio}
              tone={progressRatio === 100 ? 'success' : 'primary'}
              size="medium"
            />
          </BlockStack>
        </Card>

        <Layout>
          {/* Main Stage Timeline Column */}
          <Layout.Section>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h3">
                Lifecycle Milestone Progression
              </Text>

              {pipelineStages.map((stage, index) => {
                const isCompleted = index < currentStageIndex;
                const isCurrent = index === currentStageIndex;
                const isUpcoming = index > currentStageIndex;

                return (
                  <Card
                    key={index}
                    background={
                      isCurrent
                        ? 'bg-surface-secondary'
                        : isCompleted
                        ? 'bg-surface'
                        : 'bg-surface-tertiary'
                    }
                  >
                    <BlockStack gap="200">
                      <InlineStack align="space-between" alignBlock="center">
                        <InlineStack gap="300" align="center">
                          <Badge
                            tone={
                              isCompleted
                                ? 'success'
                                : isCurrent
                                ? 'info'
                                : 'subdued'
                            }
                          >
                            Step {index + 1}
                          </Badge>
                          <Text
                            variant="headingSm"
                            as="h4"
                            fontWeight={isCurrent ? 'bold' : 'medium'}
                          >
                            {stage.title}
                          </Text>
                        </InlineStack>

                        <Text variant="bodySm" tone="subdued">
                          {stage.timestamp}
                        </Text>
                      </InlineStack>

                      <Text variant="bodyMd" tone={isUpcoming ? 'subdued' : undefined}>
                        {stage.description}
                      </Text>

                      <Divider />

                      <InlineStack align="space-between">
                        <Text variant="bodySm" tone="subdued">
                          Handler / System: {stage.operator}
                        </Text>
                        <Badge
                          tone={
                            isCompleted
                              ? 'success'
                              : isCurrent
                              ? 'attention'
                              : 'subdued'
                          }
                          size="small"
                        >
                          {isCompleted ? 'Completed' : isCurrent ? 'Active Run' : 'Pending'}
                        </Badge>
                      </InlineStack>
                    </BlockStack>
                  </Card>
                );
              })}
            </BlockStack>
          </Layout.Section>

          {/* Logistics & Supplier Meta Column */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingSm" as="h4">
                    Production &amp; Logistics Details
                  </Text>
                  <Divider />

                  <BlockStack gap="200">
                    <Text variant="bodySm" tone="subdued">Assigned Supplier</Text>
                    <Text variant="bodyMd" fontWeight="semibold">{activeOrder.supplier}</Text>

                    <Text variant="bodySm" tone="subdued">Batch Production Schedule</Text>
                    <Text variant="bodyMd">{activeOrder.batchScheduleId}</Text>

                    <Text variant="bodySm" tone="subdued">Customization Method</Text>
                    <Text variant="bodyMd">{activeOrder.technique}</Text>

                    <Text variant="bodySm" tone="subdued">Estimated Dispatch / Delivery</Text>
                    <Text variant="bodyMd" fontWeight="bold">{activeOrder.estimatedDelivery}</Text>

                    <Divider />

                    <Text variant="bodySm" tone="subdued">Carrier Tracking</Text>
                    <Text variant="bodyMd">{activeOrder.carrier}: {activeOrder.trackingNumber}</Text>
                  </BlockStack>

                  <Box paddingBlockStart="200">
                    <Button fullWidth onClick={() => alert(`Tracking ${activeOrder.trackingNumber}`)}>
                      Track on Carrier Website
                    </Button>
                  </Box>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text variant="headingSm" as="h4">
                    Handoff Rules Enforced
                  </Text>
                  <Divider />
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text variant="bodySm">DPI Verification:</Text>
                      <Badge tone="success">Passed 320 DPI</Badge>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodySm">Feasibility Gate:</Text>
                      <Badge tone="success">100% Compliant</Badge>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodySm">Proof OTP Sign-off:</Text>
                      <Badge tone="success">Verified (2FA)</Badge>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodySm">Batch Quantity:</Text>
                      <Badge tone="info">Apex Run (35 items)</Badge>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {/* Digital Proof Visual Modal */}
      <Modal
        open={proofPreviewOpen}
        onClose={() => setProofPreviewOpen(false)}
        title={`Production Proof Preview — Order #${activeOrder.id}`}
        primaryAction={{
          content: 'Download Vector / High-Res PNG',
          onAction: () => setProofPreviewOpen(false),
        }}
        secondaryActions={[
          {
            content: 'Close',
            onAction: () => setProofPreviewOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Card background="bg-surface-secondary">
              <Box padding="600">
                <BlockStack gap="200" align="center">
                  <Text variant="headingLg" as="p" tone="magic">
                    [ HI-RES PRODUCTION PROOF ]
                  </Text>
                  <Text variant="bodyMd">
                    {activeOrder.productTitle} — {activeOrder.technique}
                  </Text>
                  <Badge tone="success">DPI: 320 | CMYK Calibrated</Badge>
                </BlockStack>
              </Box>
            </Card>

            <DataTable
              columnContentTypes={['text', 'text']}
              headings={['Parameter', 'Specification']}
              rows={[
                ['Artwork File', 'hoodie_crest_embroidery_v2.ai'],
                ['Color Profile', 'Madeira Classic Rayon Thread #1147'],
                ['Placement Coordinates', 'X: 120mm, Y: 180mm from left shoulder seam'],
                ['Stitch Count', '8,400 stitches'],
                ['Approved Signer', activeOrder.customerName],
              ]}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
