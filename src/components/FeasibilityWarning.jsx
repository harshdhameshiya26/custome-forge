import { Banner, BlockStack, InlineStack, Text, Badge, List, Button, Card, Box, Divider } from '@shopify/polaris';

/**
 * FeasibilityWarning
 * 
 * Displays production constraint violation alerts when a customer or merchant
 * selects material, printing technique, or dimension combinations that violate factory capabilities.
 * 
 * Examples:
 * - Laser Engraving requested on glossy PU leather (burn risk)
 * - Micro-detail embroidery below 4mm needle clearance
 * - Maximum printable area exceeded for curved stainless steel tumblers
 * 
 * Strictly uses @shopify/polaris components and layout props (no custom CSS).
 */
export default function FeasibilityWarning({
  violations = [],
  onAutoResolve = () => {},
  onDismiss = null,
  blocking = true,
}) {
  // Sample fallback violations if empty
  const activeViolations = violations.length > 0 ? violations : [
    {
      id: 'viol_1',
      parameter: 'Technique & Material Incompatibility',
      severity: 'critical',
      message: 'Laser Engraving is prohibited on High-Gloss Polyurethane surface due to thermal blistering.',
      recommendation: 'Switch technique to UV Screen Print or change material to Anodized Aluminum / Genuine Leather.',
      autoFixOption: 'Switch to UV Screen Print',
    },
    {
      id: 'viol_2',
      parameter: 'Embroidery Detail Limit',
      severity: 'warning',
      message: 'Smallest typography stroke is 0.4mm (Factory minimum needle tolerance is 0.8mm).',
      recommendation: 'Text may turn into thread clumps during automated stitching.',
      autoFixOption: 'Thicken Strokes to 0.8mm',
    },
  ];

  const hasCritical = activeViolations.some((v) => v.severity === 'critical');

  return (
    <BlockStack gap="300">
      <Banner
        title={
          hasCritical
            ? 'Manufacturing Constraint Violation Detected'
            : 'Production Feasibility Warning'
        }
        tone={hasCritical ? 'critical' : 'warning'}
        onDismiss={onDismiss}
      >
        <BlockStack gap="200">
          <Text as="p" variant="bodyMd">
            {hasCritical
              ? 'The current product options cannot be safely routed to production. Please review the factory limitations below before proceeding.'
              : 'Certain chosen configuration settings are suboptimal for factory machinery and may result in manufacturing variances.'}
          </Text>
        </BlockStack>
      </Banner>

      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between">
            <Text variant="headingSm" as="h4">
              Violated Manufacturing Rules ({activeViolations.length})
            </Text>
            <Badge tone={hasCritical ? 'critical' : 'warning'}>
              {hasCritical ? 'Hard Production Block' : 'Quality Warning'}
            </Badge>
          </InlineStack>

          <Divider />

          <List type="bullet">
            {activeViolations.map((viol) => (
              <List.Item key={viol.id}>
                <BlockStack gap="100">
                  <InlineStack gap="200" align="center">
                    <Text variant="bodyMd" fontWeight="bold">
                      {viol.parameter}:
                    </Text>
                    <Badge tone={viol.severity === 'critical' ? 'critical' : 'attention'} size="small">
                      {viol.severity.toUpperCase()}
                    </Badge>
                  </InlineStack>
                  <Text variant="bodyMd">{viol.message}</Text>
                  {viol.recommendation && (
                    <Text variant="bodySm" tone="subdued">
                      Remedy: {viol.recommendation}
                    </Text>
                  )}
                </BlockStack>
              </List.Item>
            ))}
          </List>

          <Box paddingBlockStart="200">
            <InlineStack align="space-between">
              <Text variant="bodySm" tone="subdued">
                {blocking ? 'Order submission is paused until resolved.' : 'Merchant override permitted.'}
              </Text>
              <Button
                variant="primary"
                tone={hasCritical ? 'critical' : undefined}
                onClick={onAutoResolve}
              >
                Auto-Adjust Compatible Options
              </Button>
            </InlineStack>
          </Box>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
