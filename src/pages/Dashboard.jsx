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
  Button,
  ButtonGroup,
  TextField,
  Select,
  Banner,
  Divider,
  Box,
} from '@shopify/polaris';

/**
 * Dashboard (Home & Product Catalog Entry Page)
 * 
 * Provides store merchants and customers with the initial product launchpad:
 * - Filterable catalog of customizable blank items
 * - Technique compatibility tags (Embroidery, Laser, UV Print, Screen Print, Foil)
 * - Customization zones (Chest, Sleeve, 360 Wrap, Deboss Zone)
 * - One-click launch into the Customizer Editor
 * - Direct links to Proof Approvals, Order Tracking, and Merchant Hub
 * 
 * Strictly built with @shopify/polaris layout and components (zero custom CSS).
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location?.pathname?.startsWith('/app') ? '/app' : '';
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Customizable Products Data
  const products = useMemo(() => [
    {
      id: 'prod_hoodie_01',
      title: 'Heavyweight French Terry Hoodie (450 GSM)',
      category: 'apparel',
      basePrice: '$48.00',
      inventory: 340,
      techniques: ['Embroidery', 'Direct-to-Garment', 'Screen Print'],
      zones: ['Front Chest (250x300mm)', 'Left Wrist (80x80mm)', 'Upper Back'],
      leadTime: '3-5 Business Days',
      minDpi: 300,
      featured: true,
    },
    {
      id: 'prod_tumbler_02',
      title: 'Insulated Hydro Stainless Tumbler (32 oz)',
      category: 'drinkware',
      basePrice: '$24.50',
      inventory: 520,
      techniques: ['360 Laser Rotary Engraving', 'Full Color UV Print'],
      zones: ['Full 360 Wrap', 'Front Centered Badge'],
      leadTime: '2-4 Business Days',
      minDpi: 300,
      featured: true,
    },
    {
      id: 'prod_folio_03',
      title: 'Full Grain Vegetable-Tanned Leather Folio',
      category: 'leather',
      basePrice: '$65.00',
      inventory: 110,
      techniques: ['Heat Foil Debossing', 'Blind Stamp', 'Laser Monogram'],
      zones: ['Lower Right Monogram (50x30mm)', 'Center Cover'],
      leadTime: '4-7 Business Days',
      minDpi: 350,
      featured: false,
    },
    {
      id: 'prod_tee_04',
      title: 'Vintage Pigment-Dyed Cotton Tee (220 GSM)',
      category: 'apparel',
      basePrice: '$18.00',
      inventory: 980,
      techniques: ['Water-based Screen Print', 'DTG Photorealism'],
      zones: ['Full Front Chest', 'Pocket Print', 'Back Poster'],
      leadTime: '2-3 Business Days',
      minDpi: 300,
      featured: false,
    },
    {
      id: 'prod_pen_05',
      title: 'Aviation-Grade Titanium EDC Bolt-Action Pen',
      category: 'metal',
      basePrice: '$32.00',
      inventory: 230,
      techniques: ['Fiber Laser Deep Etch', 'Micro-Annealing'],
      zones: ['Barrel Inscription (40x5mm)', 'Pocket Clip'],
      leadTime: '1-3 Business Days',
      minDpi: 400,
      featured: false,
    },
    {
      id: 'prod_journal_06',
      title: 'Handmade Cotton Rag Paper Hardbound Journal',
      category: 'paper',
      basePrice: '$21.00',
      inventory: 415,
      techniques: ['Letterpress Foil Stamp', 'Silk Screen'],
      zones: ['Front Hardcover Cover', 'Spine Text'],
      leadTime: '3-4 Business Days',
      minDpi: 300,
      featured: false,
    },
  ], []);

  // Filter products by category and query
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;
      const matchesQuery =
        !searchQuery.trim() ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.techniques.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesQuery;
    });
  }, [products, selectedCategory, searchQuery]);

  return (
    <Page
      title="CustomForge — Product Customization Hub"
      subtitle="Select a blank canvas product or manage live factory workflows"
      primaryAction={{
        content: 'Open Customizer Studio',
        onAction: () => navigate(`${basePath}/editor`),
      }}
      secondaryActions={[
        {
          content: 'Merchant Operations',
          onAction: () => navigate(`${basePath}/merchant`),
        },
        {
          content: 'Pending Proofs (19)',
          onAction: () => navigate(`${basePath}/proofs`),
        },
      ]}
    >
      <BlockStack gap="500">
        {/* Welcome & System Status Banner */}
        <Banner
          title="CustomForge Multi-Technique Production Engine Active"
          tone="info"
        >
          <Text as="p" variant="bodyMd">
            Connect custom graphics, enforce DPI &amp; factory feasibility limits in real-time, authenticate proofs via merchant OTP, and bundle schedules directly to certified suppliers.
          </Text>
        </Banner>

        {/* Quick Launchpad Navigation Card */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" alignBlock="center">
              <Text variant="headingSm" as="h4">
                Core Feature Workflows
              </Text>
              <Badge tone="success">Engine Online (REST API)</Badge>
            </InlineStack>

            <Divider />

            <InlineStack gap="300" wrap>
              <Button onClick={() => navigate(`${basePath}/editor`)} variant="primary">
                1. Customizer Studio
              </Button>
              <Button onClick={() => navigate(`${basePath}/proofs`)}>
                2. Proof Approvals &amp; History
              </Button>
              <Button onClick={() => navigate(`${basePath}/orders`)}>
                3. Order Status Timeline
              </Button>
              <Button onClick={() => navigate(`${basePath}/my-designs`)}>
                4. Reusable Design Library
              </Button>
              <Button onClick={() => navigate(`${basePath}/merchant`)}>
                5. Merchant Operations Hub
              </Button>
              <Button onClick={() => navigate(`${basePath}/billing`)}>
                6. Subscription &amp; Billing
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Search & Category Filter Controls */}
        <Card>
          <InlineStack align="space-between" alignBlock="center">
            <Box width="60%">
              <TextField
                label="Search Customizable Blanks"
                labelHidden
                placeholder="Search products by title, technique (e.g. Embroidery, Laser), or zone..."
                value={searchQuery}
                onChange={setSearchQuery}
                clearButton
                onClearButtonClick={() => setSearchQuery('')}
                autoComplete="off"
              />
            </Box>

            <Box width="35%">
              <Select
                label="Filter by Category"
                labelHidden
                options={[
                  { label: 'All Product Categories', value: 'ALL' },
                  { label: 'Apparel & Streetwear', value: 'apparel' },
                  { label: 'Drinkware & Tumblers', value: 'drinkware' },
                  { label: 'Leather Goods', value: 'leather' },
                  { label: 'Precision Metals', value: 'metal' },
                  { label: 'Fine Stationery & Paper', value: 'paper' },
                ]}
                value={selectedCategory}
                onChange={setSelectedCategory}
              />
            </Box>
          </InlineStack>
        </Card>

        {/* Products Grid */}
        <BlockStack gap="400">
          <InlineStack align="space-between">
            <Text variant="headingMd" as="h3">
              Customizable Catalog ({filteredProducts.length} Items Available)
            </Text>
            <Text variant="bodySm" tone="subdued">
              Showing active supplier-verified blank goods
            </Text>
          </InlineStack>

          <Layout>
            {filteredProducts.map((prod) => (
              <Layout.Section key={prod.id} variant="oneThird">
                <Card>
                  <BlockStack gap="300">
                    {/* Header with Title and Featured Badge */}
                    <InlineStack align="space-between" alignBlock="start">
                      <Box width="80%">
                        <Text variant="headingSm" as="h4">
                          {prod.title}
                        </Text>
                      </Box>
                      {prod.featured && <Badge tone="magic">Popular</Badge>}
                    </InlineStack>

                    {/* Price & Lead Time Meta */}
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" fontWeight="bold">
                        {prod.basePrice} <Text as="span" variant="bodySm" tone="subdued">base</Text>
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        Lead: {prod.leadTime}
                      </Text>
                    </InlineStack>

                    <Divider />

                    {/* Technique Compatibility Tags */}
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="semibold">
                        Manufacturing Techniques:
                      </Text>
                      <InlineStack gap="100" wrap>
                        {prod.techniques.map((t, idx) => (
                          <Badge key={idx} tone="info" size="small">
                            {t}
                          </Badge>
                        ))}
                      </InlineStack>
                    </BlockStack>

                    {/* Customization Zones */}
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="semibold">
                        Customization Print Zones:
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        {prod.zones.join(' • ')}
                      </Text>
                    </BlockStack>

                    <Divider />

                    {/* Action Button Group */}
                    <InlineStack align="space-between" alignBlock="center">
                      <Text variant="bodySm" tone="subdued">
                        Min: {prod.minDpi} DPI
                      </Text>
                      <ButtonGroup>
                        <Button
                          variant="primary"
                          onClick={() => navigate(`${basePath}/editor?productId=${prod.id}`)}
                        >
                          Customize
                        </Button>
                      </ButtonGroup>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </Layout.Section>
            ))}
          </Layout>
        </BlockStack>
      </BlockStack>
    </Page>
  );
}
