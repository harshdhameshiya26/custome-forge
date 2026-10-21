import { useState, useCallback } from 'react';
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
  ButtonGroup,
  Select,
  TextField,
  Banner,
  Divider,
  Box,
  RangeSlider,
  DropZone,
} from '@shopify/polaris';
import ArtworkValidatorModal from '../components/ArtworkValidatorModal';
import FeasibilityWarning from '../components/FeasibilityWarning';

/**
 * CustomizerEditor
 * 
 * Interactive product customization studio:
 * - Product selector & technique chooser (Embroidery, Laser, Screen Print, Foil)
 * - Placement coordinate & scale sliders
 * - Artwork upload dropzone with auto-triggering ArtworkValidatorModal
 * - Production Feasibility warnings for incompatible option combos
 * - Actions: Save to Design Library, Submit for Proof Approval
 * 
 * Strictly uses @shopify/polaris components and layout props (zero custom CSS).
 */
export default function CustomizerEditor() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location?.pathname?.startsWith('/app') ? '/app' : '';

  // State
  const [selectedProduct, setSelectedProduct] = useState('hoodie');
  const [selectedTechnique, setSelectedTechnique] = useState('embroidery');
  const [customText, setCustomText] = useState('CUSTOMFORGE ATHLETICS');
  const [scale, setScale] = useState(85);
  const [rotation, setRotation] = useState(0);
  const [xOffset, setXOffset] = useState(0);
  const [yOffset, setYOffset] = useState(25);
  
  // Modals & Warnings
  const [validatorOpen, setValidatorOpen] = useState(false);
  const [hasUploadedFile, setHasUploadedFile] = useState(true);
  const [alertBanner, setAlertBanner] = useState(null);

  // Products
  const productOptions = [
    { label: 'Heavyweight French Terry Hoodie ($48.00)', value: 'hoodie' },
    { label: 'Insulated Hydro Stainless Tumbler 32oz ($24.50)', value: 'tumbler' },
    { label: 'Full Grain Leather Folio ($65.00)', value: 'folio' },
    { label: 'Vintage Heavy Cotton Tee ($18.00)', value: 'tee' },
    { label: 'Titanium Bolt-Action Pen ($32.00)', value: 'pen' },
  ];

  // Techniques based on product
  const techniqueOptions = [
    { label: 'Commercial Thread Embroidery (Madeira 40)', value: 'embroidery' },
    { label: 'Direct-to-Garment Photorealism (DTG)', value: 'dtg' },
    { label: '360 Rotary Fiber Laser Engraving', value: 'laser' },
    { label: 'Heat Foil Debossing (Metallic)', value: 'foil' },
    { label: 'Water-based Silkscreen Print', value: 'screenprint' },
  ];

  // Feasibility rule check: e.g. laser on hoodie is invalid!
  const isTechniqueIncompatible =
    (selectedProduct === 'hoodie' && selectedTechnique === 'laser') ||
    (selectedProduct === 'tumbler' && selectedTechnique === 'embroidery') ||
    (selectedProduct === 'folio' && selectedTechnique === 'dtg');

  const handleDrop = useCallback((_dropFiles, acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      setHasUploadedFile(true);
      setValidatorOpen(true);
    }
  }, []);

  const handleProceedToProof = useCallback(() => {
    navigate(`${basePath}/proofs`);
  }, [navigate, basePath]);

  return (
    <Page
      title="Customizer Studio"
      subtitle="Design, position, and validate custom merchandise against factory tolerances"
      backAction={{ content: 'Back to Catalog', onAction: () => navigate(`${basePath}/`) }}
      primaryAction={{
        content: 'Generate & Sign-off Proof',
        onAction: handleProceedToProof,
        disabled: isTechniqueIncompatible,
      }}
      secondaryActions={[
        {
          content: 'Inspect Artwork Specs',
          onAction: () => setValidatorOpen(true),
        },
        {
          content: 'Save to Design Library',
          onAction: () => {
            setAlertBanner({
              tone: 'success',
              title: 'Design Saved to Reusable Library',
              message: 'This layout has been archived in your team design library with vector metadata.',
            });
          },
        },
      ]}
    >
      <BlockStack gap="500">
        {alertBanner && (
          <Banner
            title={alertBanner.title}
            tone={alertBanner.tone}
            onDismiss={() => setAlertBanner(null)}
          >
            <Text as="p" variant="bodyMd">{alertBanner.message}</Text>
          </Banner>
        )}

        {/* Manufacturing Incompatibility Feasibility Banner */}
        {isTechniqueIncompatible && (
          <FeasibilityWarning
            violations={[
              {
                id: 'incompat_1',
                parameter: 'Technique vs Substrate Incompatibility',
                severity: 'critical',
                message: `Technique "${selectedTechnique.toUpperCase()}" cannot be applied to "${selectedProduct.toUpperCase()}". Factory machinery will reject this order.`,
                recommendation: 'Select a compatible technique such as Embroidery for apparel or Rotary Laser for drinkware.',
              },
            ]}
            onAutoResolve={() => {
              if (selectedProduct === 'hoodie') setSelectedTechnique('embroidery');
              if (selectedProduct === 'tumbler') setSelectedTechnique('laser');
              if (selectedProduct === 'folio') setSelectedTechnique('foil');
            }}
          />
        )}

        <Layout>
          {/* Visual Customization Canvas Column */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" alignBlock="center">
                  <Text variant="headingMd" as="h3">
                    Live Product Mockup Canvas
                  </Text>
                  <InlineStack gap="200">
                    <Badge tone="info">{selectedTechnique.toUpperCase()}</Badge>
                    <Badge tone="success">300 DPI Active</Badge>
                  </InlineStack>
                </InlineStack>

                {/* Canvas Mockup Frame */}
                <Card background="bg-surface-secondary">
                  <Box padding="800">
                    <BlockStack gap="300" align="center">
                      <Box
                        padding="600"
                        background="bg-surface"
                        borderRadius="300"
                        borderWidth="025"
                        borderColor="border"
                      >
                        <BlockStack gap="200" align="center">
                          <Text variant="headingXl" as="p" tone="magic">
                            [ {customText} ]
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            Scale: {scale}% | Placement X: {xOffset}mm, Y: {yOffset}mm
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            Substrate: {selectedProduct.toUpperCase()}
                          </Text>
                        </BlockStack>
                      </Box>
                    </BlockStack>
                  </Box>
                </Card>

                {/* Upload Artwork DropZone */}
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h4">
                    Upload Custom Graphic or Vector Artwork
                  </Text>
                  <DropZone onDrop={handleDrop} allowMultiple={false}>
                    <DropZone.FileUpload actionHint="Accepts .AI, .SVG, .PNG, .PDF up to 50MB (Min recommended: 300 DPI)" />
                  </DropZone>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Configuration Controls Sidebar */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">
                    Customization Options
                  </Text>

                  <Divider />

                  <Select
                    label="Target Blank Product"
                    options={productOptions}
                    value={selectedProduct}
                    onChange={setSelectedProduct}
                  />

                  <Select
                    label="Manufacturing Technique"
                    options={techniqueOptions}
                    value={selectedTechnique}
                    onChange={setSelectedTechnique}
                  />

                  <TextField
                    label="Custom Typography / Monogram Text"
                    value={customText}
                    onChange={setCustomText}
                    autoComplete="off"
                  />

                  <RangeSlider
                    label={`Graphic Scale (${scale}%)`}
                    value={scale}
                    onChange={setScale}
                    min={20}
                    max={150}
                    output
                  />

                  <RangeSlider
                    label={`Vertical Alignment Y (${yOffset}mm)`}
                    value={yOffset}
                    onChange={setYOffset}
                    min={-100}
                    max={100}
                    output
                  />

                  <Divider />

                  <BlockStack gap="200">
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={handleProceedToProof}
                      disabled={isTechniqueIncompatible}
                    >
                      Generate Digital Proof
                    </Button>
                    <Button
                      fullWidth
                      onClick={() => setValidatorOpen(true)}
                    >
                      Check Artwork Quality
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {/* Artwork Validator Modal */}
      <ArtworkValidatorModal
        open={validatorOpen}
        onClose={() => setValidatorOpen(false)}
        onConfirm={() => setValidatorOpen(false)}
      />
    </Page>
  );
}
