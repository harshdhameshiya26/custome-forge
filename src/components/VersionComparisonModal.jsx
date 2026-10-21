import { useState } from 'react';
import {
  Modal,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Card,
  Box,
  Divider,
  Tabs,
  List,
} from '@shopify/polaris';

/**
 * VersionComparisonModal
 * 
 * Side-by-side or tabbed multi-version proof inspector:
 * - Compares artwork adjustments across design iterations (V1 vs V2 vs V3)
 * - Highlights DPI improvements, placement shifts, and color profile conversions
 * 
 * Strictly uses @shopify/polaris components and layout props (zero custom CSS).
 */
export default function VersionComparisonModal({
  open = false,
  onClose = () => {},
  versions = null,
}) {
  const [activeTab, setActiveTab] = useState(1);

  const defaultVersions = versions || [
    {
      id: 'v1',
      versionName: 'Version 1 (Customer Upload)',
      date: 'Oct 17, 2026',
      dpi: 180,
      notes: 'Original raster file submitted with sRGB color profile.',
      changes: ['Uploaded by customer', 'Initial auto-vector trace'],
    },
    {
      id: 'v2',
      versionName: 'Version 2 (Pre-Press Corrected)',
      date: 'Oct 18, 2026',
      dpi: 320,
      notes: 'Upscaled using AI super-resolution, converted to CMYK, -25mm offset applied.',
      changes: [
        'DPI boosted from 180 to 320 DPI',
        'Shifted embroidery baseline -25mm below collar seam',
        'Converted from sRGB to CMYK Pantone separation',
      ],
    },
  ];

  const current = defaultVersions[activeTab];

  const tabs = defaultVersions.map((v, idx) => ({
    id: `tab-${v.id}`,
    content: `${v.versionName.split(' ')[0]} ${v.versionName.split(' ')[1]} (${idx === 1 ? 'Current' : 'Baseline'})`,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Design Proof Version History & Diff Comparison"
      primaryAction={{
        content: 'Accept Current Version',
        onAction: onClose,
      }}
      secondaryActions={[
        {
          content: 'Close Comparison',
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Tabs tabs={tabs} selected={activeTab} onSelect={setActiveTab} />

          <Card background="bg-surface-secondary">
            <Box padding="600">
              <BlockStack gap="200" align="center">
                <Text variant="headingLg" as="p" tone="magic">
                  [ PROOF CANVAS: {current.versionName} ]
                </Text>
                <InlineStack gap="200">
                  <Badge tone={current.dpi >= 300 ? 'success' : 'warning'}>
                    {current.dpi} DPI
                  </Badge>
                  <Badge tone="info">{current.date}</Badge>
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>

          <Card>
            <BlockStack gap="200">
              <Text variant="headingSm" as="h4">
                Iteration Summary &amp; Adjustments
              </Text>
              <Text variant="bodyMd">{current.notes}</Text>
              <Divider />
              <Text variant="bodySm" fontWeight="semibold">
                Logged Changelog Items:
              </Text>
              <List type="bullet">
                {current.changes.map((item, idx) => (
                  <List.Item key={idx}>{item}</List.Item>
                ))}
              </List>
            </BlockStack>
          </Card>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
