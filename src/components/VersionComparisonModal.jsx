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
 * Compares artwork adjustments across design iterations.
 * Shows empty state when no revisions exist (0).
 */
export default function VersionComparisonModal({
  open = false,
  onClose = () => {},
  versions = null,
}) {
  const [activeTab, setActiveTab] = useState(0);

  const list = versions && versions.length > 0 ? versions : [];
  const current = list[activeTab];

  const tabs = list.map((v, idx) => ({
    id: `tab-${v.id || idx}`,
    content: `${v.versionName || `Version ${idx + 1}`} (${idx === list.length - 1 ? 'Latest' : 'Baseline'})`,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Design Proof Version History & Diff Comparison"
      primaryAction={{
        content: 'Close',
        onAction: onClose,
      }}
    >
      <Modal.Section>
        {list.length === 0 ? (
          <Box padding="600">
            <BlockStack gap="200" inlineAlign="center">
              <Text variant="headingSm" as="h4" alignment="center">
                No previous revisions found (0)
              </Text>
              <Text variant="bodyMd" tone="subdued" as="p" alignment="center">
                This design is currently at Version 1. When pre-press edits or customer revisions are submitted, versions will appear here for comparison.
              </Text>
            </BlockStack>
          </Box>
        ) : (
          <BlockStack gap="400">
            <Tabs tabs={tabs} selected={activeTab} onSelect={setActiveTab} />

            <Card background="bg-surface-secondary">
              <Box padding="600">
                <BlockStack gap="200" align="center">
                  <Text variant="headingLg" as="p" tone="magic">
                    [ PROOF CANVAS: {current.versionName} ]
                  </Text>
                  <InlineStack gap="200">
                    <Badge tone={(current.dpi || 300) >= 300 ? 'success' : 'warning'}>
                      {current.dpi || 300} DPI
                    </Badge>
                    <Badge tone="info">{current.date || 'Recent'}</Badge>
                  </InlineStack>
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h4">
                  Iteration Summary &amp; Adjustments
                </Text>
                <Text variant="bodyMd">{current.notes || 'No notes for this version.'}</Text>
                {Array.isArray(current.changes) && current.changes.length > 0 && (
                  <>
                    <Divider />
                    <Text variant="bodySm" fontWeight="semibold">
                      Logged Changelog Items:
                    </Text>
                    <List type="bullet">
                      {current.changes.map((item, idx) => (
                        <List.Item key={idx}>{item}</List.Item>
                      ))}
                    </List>
                  </>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        )}
      </Modal.Section>
    </Modal>
  );
}
