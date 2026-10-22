import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import DesignMockupPreview from '../components/DesignMockupPreview';
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
  Modal,
  Banner,
  Box,
  Divider,
  Spinner,
} from '@shopify/polaris';
import api from '../services/api';

const CATEGORIES = ['All', 'T-Shirt', 'Hoodie', 'Mug', 'Phone Case', 'Logo', 'Seasonal'];

const STARTER_TEMPLATES = [
  {
    id: 'tmpl_tshirt_1',
    title: 'Good Vibes Sun',
    category: 'T-Shirt',
    technique: 'DTG Print',
    description: 'Minimalist retro sun rays and oceanic horizon print.',
    badgeTone: 'success',
  },
  {
    id: 'tmpl_tshirt_2',
    title: 'Minimal Logo',
    category: 'T-Shirt',
    technique: 'Screen Print',
    description: 'Clean typographic brand badge with geometric mark.',
    badgeTone: 'info',
  },
  {
    id: 'tmpl_hoodie_1',
    title: 'Mountain Adventure',
    category: 'Hoodie',
    technique: 'Embroidery',
    description: 'High-density outdoor mountain peaks chest embroidery.',
    badgeTone: 'magic',
  },
  {
    id: 'tmpl_hoodie_2',
    title: 'Nordic Heritage',
    category: 'Hoodie',
    technique: 'DTG Print',
    description: 'Fleece-optimized geometric line art chest print.',
    badgeTone: 'info',
  },
  {
    id: 'tmpl_mug_1',
    title: 'Morning Brew Roast',
    category: 'Mug',
    technique: 'Laser Engrave',
    description: 'Bistro coffee roast badge for 15oz stoneware.',
    badgeTone: 'warning',
  },
  {
    id: 'tmpl_mug_2',
    title: 'Code & Coffee',
    category: 'Mug',
    technique: 'UV Print',
    description: 'Developer workspace typography wrap graphic.',
    badgeTone: 'info',
  },
  {
    id: 'tmpl_phone_1',
    title: 'Beach Sunset',
    category: 'Phone Case',
    technique: 'UV Print',
    description: 'Impact polycarbonate vibrant sunset backplate.',
    badgeTone: 'magic',
  },
  {
    id: 'tmpl_phone_2',
    title: 'Geometric Cyber',
    category: 'Phone Case',
    technique: 'UV Print',
    description: 'Abstract futuristic tech grid casing layout.',
    badgeTone: 'info',
  },
  {
    id: 'tmpl_logo_1',
    title: 'Signature Monogram',
    category: 'Logo',
    technique: 'Screen Print',
    description: 'Versatile corporate identity brand emblem.',
    badgeTone: 'success',
  },
  {
    id: 'tmpl_seasonal_1',
    title: 'Summer Solstice',
    category: 'Seasonal',
    technique: 'DTG Print',
    description: 'Warm color-palette seasonal holiday collection.',
    badgeTone: 'magic',
  },
];

/**
 * DesignTemplates
 * Real design template catalog fetched from /api/templates with starter templates fallback.
 */
export default function DesignTemplates() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location?.pathname?.startsWith('/app') ? '/app' : '';

  const [templatesList, setTemplatesList] = useState(STARTER_TEMPLATES);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('T-Shirt');
  const [bannerAlert, setBannerAlert] = useState(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.templates.list();
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res?.data?.items) ? res.data.items : []);
      if (list.length > 0) {
        setTemplatesList(list);
      } else {
        setTemplatesList(STARTER_TEMPLATES);
      }
    } catch (err) {
      console.warn('Using starter templates fallback:', err.message);
      setTemplatesList(STARTER_TEMPLATES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const filteredTemplates = useMemo(() => {
    let list = templatesList;
    if (selectedCategory !== 'All') {
      list = list.filter((t) => (t.category || '').toLowerCase() === selectedCategory.toLowerCase());
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          (t.title && t.title.toLowerCase().includes(q)) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.category && t.category.toLowerCase().includes(q))
      );
    }
    return list;
  }, [templatesList, selectedCategory, searchQuery]);

  const handleCreateTemplate = useCallback(async () => {
    if (!newTitle.trim()) return;
    try {
      const res = await api.templates.create({
        title: newTitle.trim(),
        name: newTitle.trim(),
        category: newCategory,
        technique: 'DTG Print',
        description: `Pre-made merchant ${newCategory} design template.`,
        isPublic: true,
      });

      const created = res.data || {
        id: `t_${Date.now()}`,
        title: newTitle.trim(),
        category: newCategory,
        technique: 'DTG Print',
        description: `Pre-made merchant ${newCategory} design template.`,
        badgeTone: 'magic',
      };

      setTemplatesList((prev) => [created, ...prev]);
      setBannerAlert({
        tone: 'success',
        title: 'Template Created',
        message: `"${newTitle}" is now published and available to customize.`,
      });
    } catch (err) {
      setBannerAlert({
        tone: 'critical',
        title: 'Creation Failed',
        message: err.message || 'Failed to create template.',
      });
    } finally {
      setCreateModalOpen(false);
      setNewTitle('');
    }
  }, [newTitle, newCategory]);

  return (
    <Page
      title="Design Templates"
      subtitle="Use pre-made templates to create stunning designs quickly."
      primaryAction={{
        content: '+ Create Template',
        onAction: () => setCreateModalOpen(true),
      }}
      secondaryActions={[
        {
          content: 'Refresh',
          onAction: fetchTemplates,
        },
        {
          content: 'My Saved Designs',
          onAction: () => navigate(`${basePath}/designs`),
        },
        {
          content: 'Customizer Studio',
          onAction: () => navigate(`${basePath}/editor`),
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
          <BlockStack gap="400">
            <InlineStack align="space-between" alignBlock="center" gap="400">
              <Box minWidth="280px">
                <TextField
                  label="Search templates"
                  labelHidden
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                  clearButton
                  onClearButtonClick={() => setSearchQuery('')}
                  autoComplete="off"
                />
              </Box>

              <ButtonGroup variant="segmented">
                {CATEGORIES.map((cat) => (
                  <Button
                    key={cat}
                    pressed={selectedCategory === cat}
                    onClick={() => setSelectedCategory(cat)}
                    size="slim"
                  >
                    {cat}
                  </Button>
                ))}
              </ButtonGroup>
            </InlineStack>

            {loading ? (
              <Box padding="800">
                <InlineStack align="center">
                  <Spinner accessibilityLabel="Loading templates" size="large" />
                </InlineStack>
              </Box>
            ) : filteredTemplates.length === 0 ? (
              <Box padding="600">
                <BlockStack gap="300" inlineAlign="center">
                  <Text variant="headingMd" as="h3" alignment="center">
                    No design templates found (0)
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p" alignment="center">
                    {searchQuery || selectedCategory !== 'All'
                      ? 'No templates match your search or filter.'
                      : 'Create your first design template to jumpstart customer product customizations.'}
                  </Text>
                  <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
                    + Create First Template
                  </Button>
                </BlockStack>
              </Box>
            ) : (
              <Layout>
                {filteredTemplates.map((template) => (
                  <Layout.Section key={template.id} variant="oneThird">
                    <Card background="bg-surface-secondary">
                      <BlockStack gap="300">
                        <Box
                          minHeight="180px"
                          borderRadius="200"
                          overflowX="hidden"
                          overflowY="hidden"
                          background="bg-surface"
                        >
                          <DesignMockupPreview
                            productType={template.category}
                            productColor="#ffffff"
                            graphicText={template.title}
                            fontFamily="sans-serif"
                            textColor="#18181b"
                            height={180}
                            showGarmentBg={true}
                            showGuides={false}
                          />
                        </Box>

                        <InlineStack align="space-between" alignBlock="center">
                          <Text variant="headingSm" as="h4">
                            {template.title}
                          </Text>
                          <Badge tone={template.badgeTone || 'info'}>
                            {template.category}
                          </Badge>
                        </InlineStack>

                        <Text variant="bodySm" tone="subdued" as="p">
                          {template.description || `Technique: ${template.technique || 'DTG Print'}`}
                        </Text>

                        <Divider />

                        <Button
                          variant="primary"
                          fullWidth
                          onClick={() => {
                            const cat = (template.category || '').toLowerCase();
                            let prod = 'tshirt';
                            if (cat.includes('hoodie')) prod = 'hoodie';
                            else if (cat.includes('mug')) prod = 'mug';
                            else if (cat.includes('phone') || cat.includes('case')) prod = 'phone_case';
                            navigate(
                              `${basePath}/editor?template=${encodeURIComponent(template.title)}&product=${prod}&category=${encodeURIComponent(template.category)}`
                            );
                          }}
                        >
                          Use Template
                        </Button>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                ))}
              </Layout>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      {/* Create Template Modal */}
      {createModalOpen && (
        <Modal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Create New Design Template"
          primaryAction={{
            content: 'Save & Publish Template',
            onAction: handleCreateTemplate,
            disabled: !newTitle.trim(),
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setCreateModalOpen(false),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <TextField
                label="Template Name"
                placeholder="e.g. Retro Sunrise Graphic"
                value={newTitle}
                onChange={setNewTitle}
                autoComplete="off"
              />

              <Select
                label="Target Product Category"
                options={[
                  { label: 'T-Shirt', value: 'T-Shirt' },
                  { label: 'Hoodie', value: 'Hoodie' },
                  { label: 'Mug', value: 'Mug' },
                  { label: 'Phone Case', value: 'Phone Case' },
                  { label: 'Logo', value: 'Logo' },
                  { label: 'Seasonal', value: 'Seasonal' },
                ]}
                value={newCategory}
                onChange={setNewCategory}
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
