import { useState, useEffect, useMemo, useCallback } from 'react';
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
  TextField,
  Banner,
  Divider,
  Box,
  Modal,
  SkeletonBodyText,
} from '@shopify/polaris';
import DesignMockupPreview from '../components/DesignMockupPreview';
import api from '../services/api.js';

/**
 * CustomerDesigns — My Saved Designs
 * Fetches real saved designs from /api/library/merchant/all.
 * Starts empty when no designs exist yet.
 */
export default function CustomerDesigns() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location?.pathname?.startsWith('/app') ? '/app' : '';

  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [bannerAlert, setBannerAlert] = useState(null);
  const [deleteConfirmDesign, setDeleteConfirmDesign] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch from backend
  const fetchDesigns = useCallback(() => {
    setLoading(true);
    setError(null);
    api.library
      .listAll()
      .then((json) => {
        let list = [];
        if (Array.isArray(json?.data)) {
          list = json.data;
        } else if (Array.isArray(json?.data?.items)) {
          list = json.data.items;
        }
        setDesigns(list);
      })
      .catch((err) => {
        console.warn('Could not load designs from API:', err.message);
        setDesigns([]);
      })
      .finally(() => setLoading(false));
  }, []);


  useEffect(() => {
    fetchDesigns();
  }, [fetchDesigns]);

  const filteredDesigns = useMemo(() => {
    if (!searchQuery.trim()) return designs;
    const q = searchQuery.toLowerCase();
    return designs.filter(
      (d) =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }, [designs, searchQuery]);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirmDesign) return;
    setDeleting(true);
    try {
      await api.library.remove(deleteConfirmDesign.id);
      setDesigns((prev) => prev.filter((d) => d.id !== deleteConfirmDesign.id));
      setBannerAlert({
        tone: 'info',
        title: 'Design Removed',
        message: `"${deleteConfirmDesign.name}" has been deleted.`,
      });
    } catch (err) {
      setBannerAlert({
        tone: 'critical',
        title: 'Delete Failed',
        message: err.message || 'Failed to delete design',
      });
    } finally {
      setDeleting(false);
      setDeleteConfirmDesign(null);
    }
  }, [deleteConfirmDesign]);

  return (
    <Page
      title="My Saved Designs"
      subtitle="Access and reuse your previous designs anytime."
      primaryAction={{
        content: '+ Create New Design',
        onAction: () => navigate(`${basePath}/editor`),
      }}
      secondaryActions={[
        { content: 'Templates Catalog', onAction: () => navigate(`${basePath}/templates`) },
        { content: 'Proof Approvals', onAction: () => navigate(`${basePath}/proofs`) },
      ]}
    >
      <BlockStack gap="500">
        {/* Alerts */}
        {error && (
          <Banner tone="critical" title="Error loading designs" onDismiss={() => setError(null)}>
            <Text as="p" variant="bodyMd">{error}</Text>
          </Banner>
        )}
        {bannerAlert && (
          <Banner
            title={bannerAlert.title}
            tone={bannerAlert.tone}
            onDismiss={() => setBannerAlert(null)}
          >
            <Text as="p" variant="bodyMd">{bannerAlert.message}</Text>
          </Banner>
        )}

        {/* Search */}
        <TextField
          label="Search saved designs"
          labelHidden
          placeholder="Search by name or tag..."
          value={searchQuery}
          onChange={setSearchQuery}
          clearButton
          onClearButtonClick={() => setSearchQuery('')}
          autoComplete="off"
        />

        {/* Design Cards */}
        {loading ? (
          <Card>
            <SkeletonBodyText lines={6} />
          </Card>
        ) : filteredDesigns.length === 0 ? (
          <Card>
            <Box padding="800">
              <BlockStack gap="300" align="center">
                <Text variant="headingMd" alignment="center" as="h2">No saved designs yet</Text>
                <Text tone="subdued" alignment="center" as="p" variant="bodyMd">
                  Designs saved from the Customizer Studio will appear here.
                </Text>
                <Button variant="primary" onClick={() => navigate(`${basePath}/editor`)}>
                  Open Customizer Studio
                </Button>
              </BlockStack>
            </Box>
          </Card>
        ) : (
          <Layout>
            {filteredDesigns.map((design) => (
              <Layout.Section key={design.id} variant="oneThird">
                <Card>
                  <BlockStack gap="300">
                    {/* Real product mockup preview */}
                    <DesignMockupPreview
                      designText={design.name}
                      designImage={design.thumbnailUrl}
                      productLabel={design.tags?.[0] || ''}
                      size="sm"
                      showGuides={false}
                    />

                    {/* Title & Tags */}
                    <BlockStack gap="100">
                      <InlineStack align="space-between" alignBlock="start">
                        <Text variant="headingSm" as="h3" fontWeight="bold">
                          {design.name}
                        </Text>
                        {design.tags?.[0] && (
                          <Badge tone="info" size="small">{design.tags[0]}</Badge>
                        )}
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued" as="p">
                        Saved {new Date(design.createdAt).toLocaleDateString('en-US', {
                          month: 'short', day: '2-digit', year: 'numeric',
                        })}
                      </Text>
                    </BlockStack>

                    <Divider />

                    {/* Actions */}
                    <InlineStack align="space-between" alignBlock="center" wrap gap="200">
                      <Button
                        variant="primary"
                        size="slim"
                        onClick={() =>
                          navigate(`${basePath}/editor?libraryItem=${design.id}`)
                        }
                      >
                        Apply to Product
                      </Button>
                      <Button
                        tone="critical"
                        variant="plain"
                        size="slim"
                        onClick={() => setDeleteConfirmDesign(design)}
                      >
                        Delete
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </Layout.Section>
            ))}
          </Layout>
        )}
      </BlockStack>

      {/* Delete Confirmation Modal */}
      {deleteConfirmDesign && (
        <Modal
          open={Boolean(deleteConfirmDesign)}
          onClose={() => setDeleteConfirmDesign(null)}
          title="Delete Saved Design?"
          primaryAction={{
            content: deleting ? 'Deleting...' : 'Delete Design',
            destructive: true,
            loading: deleting,
            onAction: handleDelete,
          }}
          secondaryActions={[
            { content: 'Cancel', onAction: () => setDeleteConfirmDesign(null) },
          ]}
        >
          <Modal.Section>
            <Text as="p" variant="bodyMd">
              Are you sure you want to remove <strong>"{deleteConfirmDesign.name}"</strong> from
              your reusable design library? This action cannot be undone.
            </Text>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
