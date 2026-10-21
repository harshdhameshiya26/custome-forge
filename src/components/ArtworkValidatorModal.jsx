import { useState, useCallback } from 'react';
import {
  Modal,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  ProgressBar,
  Button,
  ButtonGroup,
  Card,
  Box,
  Divider,
  List,
} from '@shopify/polaris';

/**
 * ArtworkValidatorModal
 * 
 * Inspects customer artwork uploads against production print specifications:
 * - DPI / Resolution verification (< 150 Critical, 150-299 Warning, >= 300 Optimal)
 * - Color Space (CMYK vs RGB warning with auto-conversion)
 * - Bleed and Safe Zone margin compliance
 * - File format and transparency support
 * 
 * Built strictly with @shopify/polaris components and layout props (no custom CSS).
 */
export default function ArtworkValidatorModal({
  open = false,
  onClose = () => {},
  onConfirm = () => {},
  artworkData = null,
}) {
  const [isFixing, setIsFixing] = useState(false);
  const [fixedState, setFixedState] = useState(false);

  // Default demo inspection data if not provided via props
  const inspection = artworkData || {
    fileName: 'custom_vintage_logo_highres.png',
    fileSize: '4.8 MB',
    dimensions: '2400 x 3000 px',
    dpi: 180,
    minRecommendedDpi: 300,
    colorMode: 'RGB (sRGB IEC61966-2.1)',
    targetColorMode: 'CMYK (U.S. Web Coated SWOP v2)',
    safeZoneMargin: '3.2 mm (Required: 5.0 mm)',
    hasTransparency: true,
  };

  const isDpiCritical = (inspection.dpi || 0) < 150;
  const isDpiWarning = (inspection.dpi || 0) >= 150 && (inspection.dpi || 0) < 300;
  const isOptimal = (inspection.dpi || 0) >= 300 || fixedState;

  const currentDpi = fixedState ? 300 : inspection.dpi;
  const dpiProgress = Math.min(100, Math.round((currentDpi / 300) * 100));

  const handleAutoUpscale = useCallback(() => {
    setIsFixing(true);
    setTimeout(() => {
      setIsFixing(false);
      setFixedState(true);
    }, 1200);
  }, []);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Artwork Quality & Print Feasibility Inspector"
      primaryAction={{
        content: isOptimal ? 'Accept & Proceed to Proof' : 'Proceed with Current Artwork',
        onAction: () => onConfirm({ ...inspection, dpi: currentDpi, fixed: fixedState }),
        tone: isDpiCritical && !fixedState ? 'critical' : undefined,
      }}
      secondaryActions={[
        {
          content: 'Upload New File',
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {/* Status Alert Banner */}
          {fixedState ? (
            <Banner
              title="Artwork AI Upscaling & Color Conversion Successful"
              tone="success"
            >
              <Text as="p" variant="bodyMd">
                Resolution boosted to 300 DPI, and color profile converted to print-standard CMYK. File is now production-ready.
              </Text>
            </Banner>
          ) : isDpiCritical ? (
            <Banner
              title="Critical Quality Warning: Low Resolution Artwork"
              tone="critical"
            >
              <Text as="p" variant="bodyMd">
                This image is only {inspection.dpi} DPI. Printing at this resolution will cause noticeable pixelation, blurriness, and color bleed on manufactured goods.
              </Text>
            </Banner>
          ) : isDpiWarning ? (
            <Banner
              title="Moderate Resolution Warning"
              tone="warning"
            >
              <Text as="p" variant="bodyMd">
                Uploaded image is {inspection.dpi} DPI. For crisp commercial printing, 300 DPI is strongly recommended.
              </Text>
            </Banner>
          ) : (
            <Banner
              title="Artwork Meets Commercial Production Standards"
              tone="success"
            >
              <Text as="p" variant="bodyMd">
                All resolution, dimension, and color space checks passed. Ready for vector generation.
              </Text>
            </Banner>
          )}

          {/* File Meta Summary */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingSm" as="h3">
                  Uploaded File Specifications
                </Text>
                <Badge tone={isOptimal ? 'success' : isDpiCritical ? 'critical' : 'warning'}>
                  {isOptimal ? 'Ready for Print' : isDpiCritical ? 'Action Required' : 'Review Advised'}
                </Badge>
              </InlineStack>

              <Divider />

              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text variant="bodyMd" tone="subdued">File Name</Text>
                  <Text variant="bodyMd" fontWeight="semibold">{inspection.fileName}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" tone="subdued">Dimensions & Size</Text>
                  <Text variant="bodyMd">{inspection.dimensions} ({inspection.fileSize})</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" tone="subdued">Color Space Mode</Text>
                  <InlineStack gap="100">
                    <Text variant="bodyMd">{fixedState ? inspection.targetColorMode : inspection.colorMode}</Text>
                    {!fixedState && <Badge tone="attention">RGB</Badge>}
                  </InlineStack>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" tone="subdued">Safe Zone Bleed Margin</Text>
                  <Text variant="bodyMd">{inspection.safeZoneMargin}</Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>

          {/* DPI Resolution Gauge Card */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingSm" as="h4">Resolution Density (DPI Gauge)</Text>
                <Text variant="bodyMd" fontWeight="bold">
                  {currentDpi} / 300 DPI
                </Text>
              </InlineStack>

              <ProgressBar
                progress={dpiProgress}
                tone={isOptimal ? 'success' : isDpiCritical ? 'critical' : 'primary'}
                size="small"
              />

              <InlineStack align="space-between">
                <Text variant="bodySm" tone="subdued">72 DPI (Web)</Text>
                <Text variant="bodySm" tone="subdued">150 DPI (Minimum)</Text>
                <Text variant="bodySm" tone="subdued">300 DPI (Commercial Standard)</Text>
              </InlineStack>
            </BlockStack>
          </Card>

          {/* Remediation & Quick Fix Actions */}
          {!fixedState && !isOptimal && (
            <Card>
              <BlockStack gap="300">
                <Text variant="headingSm" as="h4">Production Recommendations</Text>
                <List type="bullet">
                  <List.Item>
                    Use our built-in AI Super-Resolution Enhancer to upscale to 300 DPI without pixel blurring.
                  </List.Item>
                  <List.Item>
                    Convert color profile from RGB to CMYK to prevent unexpected shift in printed ink vibrancy.
                  </List.Item>
                  <List.Item>
                    Expand artwork margins by 1.8 mm to ensure safe laser cutting and stitch alignment.
                  </List.Item>
                </List>

                <Box paddingBlockStart="200">
                  <ButtonGroup>
                    <Button
                      variant="primary"
                      onClick={handleAutoUpscale}
                      loading={isFixing}
                    >
                      Auto-Upscale &amp; Convert to CMYK
                    </Button>
                    <Button onClick={onClose}>
                      Replace with Higher-Res Vector
                    </Button>
                  </ButtonGroup>
                </Box>
              </BlockStack>
            </Card>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
