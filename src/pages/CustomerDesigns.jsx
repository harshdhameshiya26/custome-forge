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
 * CustomerDesigns
 * 
 * Reusable Customer Design Library:
 * - Stored logos, monograms, vector graphics, and previous production runs
 * - Quick re-order / apply to new products
 * - Pre-verified print resolution tags (300 DPI, CMYK)
 * 
 * Strictly uses @shopify/polaris components and layout props (zero custom CSS).
 */
export default function CustomerDesigns() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location?.pathname?.startsWith('/app') ? '/app' : '';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('ALL');

  // Sample Saved Designs
  const savedDesigns = useMemo(() => [
    {
      id: 'dsgn_901',
      title: 'Heritage Crest & Typography Monogram',
      category: 'Apparel & Embroidery',
      createdDate: 'Oct 12, 2026',
      dpi: 320,
      format: 'Vector SVG & AI',
      usageCount: 14,
      lastProduct: 'Heavyweight French Terry Hoodie',
      tags: ['Crest', 'Winter 2026', 'Embroidery'],
    },
    {
      id: 'dsgn_902',
      title: 'Minimalist Linear Mountain Compass',
      category: 'Drinkware & Laser',
      createdDate: 'Oct 14, 2026',
      dpi: 400,
      format: 'Direct 360 SVG',
      usageCount: 8,
      lastProduct: 'Insulated Hydro Tumbler',
      tags: ['Laser', 'Drinkware', 'Outdoor'],
    },
    {
      id: 'dsgn_903',
      title: 'Executive Serif Initials (Gold Foil)',
      category: 'Leather Goods',
      createdDate: 'Oct 16, 2026',
      dpi: 300,
      format: 'Deboss Die Vector',
      usageCount: 5,
      lastProduct: 'Full Grain Leather Folio',
      tags: ['Foil', 'Leather', 'Monogram'],
    },
    {
      id: 'dsgn_904',
      title: 'Retro Sunset Wave Multichannel Print',
      category: 'DTG & Screen Print',
      createdDate: 'Oct 18, 2026',
      dpi: 300,
      format: 'CMYK 300 DPI PNG',
      usageCount: 22,
      lastProduct: 'Vintage Heavy Cotton Tee',
      tags: ['Summer', 'DTG', 'Color'],
    },
  ], []);

  const filteredDesigns = useMemo(() => {
    return savedDesigns.filter((d) => {
      const matchesTag = selectedTag === 'ALL' || d.tags.includes(selectedTag);
      const matchesSearch =
        !searchQuery.trim() ||
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTag && matchesSearch;
    });
  }, [savedDesigns, selectedTag, searchQuery]);

  return (
    <Page
      title="Reusable Design Library"
      subtitle="Access pre-approved logos, vector artwork, and past production proofs"
      primaryAction={{
        content: 'Create New Design',
        onAction: () => navigate(`${basePath}/editor`),
      }}
      secondaryActions={[
        {
          content: 'Back to Catalog',
          onAction: () => navigate(`${basePath}/`),
        },
      ]}
    >
      <BlockStack gap="500">
        <Banner title="Pre-Flight Verified Artwork Assets" tone="info">
          <Text as="p" variant="bodyMd">
            Designs stored in this library have already passed resolution (min 300 DPI) and color calibration checks, allowing one-click application to any compatible product catalog item.
          </Text>
        </Banner>

        {/* Filter & Search Bar */}
        <Card>
          <InlineStack align="space-between" alignBlock="center">
            <Box width="60%">
              <TextField
                label="Search Saved Designs"
                labelHidden
                placeholder="Search by title, technique, or tag..."
                value={searchQuery}
                onChange={setSearchQuery}
                clearButton
                onClearButtonClick={() => setSearchQuery('')}
                autoComplete="off"
              />
            </Box>
            <Box width="35%">
              <Select
                label="Filter by Tag"
                labelHidden
                options={[
                  { label: 'All Tags & Collections', value: 'ALL' },
                  { label: 'Embroidery', value: 'Embroidery' },
                  { label: 'Laser', value: 'Laser' },
                  { label: 'Foil', value: 'Foil' },
                  { label: 'DTG', value: 'DTG' },
                ]}
                value={selectedTag}
                onChange={setSelectedTag}
              />
            </Box>
          </InlineStack>
        </Card>

        {/* Saved Designs Grid */}
        <Layout>
          {filteredDesigns.map((item) => (
            <Layout.Section key={item.id} variant="oneHalf">
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" alignBlock="center">
                    <Text variant="headingSm" as="h4">
                      {item.title}
                    </Text>
                    <Badge tone="success">{item.dpi} DPI Ready</Badge>
                  </InlineStack>

                  <Text variant="bodySm" tone="subdued">
                    {item.category} • Saved on {item.createdDate}
                  </Text>

                  <Divider />

                  <BlockStack gap="100">
                    <Text variant="bodySm">
                      Format: <strong>{item.format}</strong>
                    </Text>
                    <Text variant="bodySm">
                      Total Orders Produced: <strong>{item.usageCount} batches</strong>
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      Last applied to: {item.lastProduct}
                    </Text>
                  </BlockStack>

                  <InlineStack gap="100">
                    {item.tags.map((t, i) => (
                      <Badge key={i} tone="info" size="small">
                        {t}
                      </Badge>
                    ))}
                  </InlineStack>

                  <Divider />

                  <InlineStack align="space-between" alignBlock="center">
                    <Button onClick={() => navigate(`${basePath}/proofs`)}>
                      View Past Proof
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => navigate(`${basePath}/editor?designId=${item.id}`)}
                    >
                      Apply to Product
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          ))}
        </Layout>
      </BlockStack>
    </Page>
  );
}
