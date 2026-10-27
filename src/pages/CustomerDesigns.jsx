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

  const [designs, setDesigns] = useState(() => {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('customforge_saved_designs') : null;
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [bannerAlert, setBannerAlert] = useState(null);
  const [deleteConfirmDesign, setDeleteConfirmDesign] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch from backend and merge with local storage
  const fetchDesigns = useCallback(() => {
    setLoading(true);
    setError(null);

    // 1. Read locally saved designs from localStorage for instant display
    let localList = [];
    try {
      localList = JSON.parse(localStorage.getItem('customforge_saved_designs') || '[]');
      if (!Array.isArray(localList)) localList = [];
    } catch {
      localList = [];
    }

    // 2. Fetch from backend and merge seamlessly
    api.library
      .listAll()
      .then((json) => {
        let remoteList = [];
        if (Array.isArray(json?.data)) {
          remoteList = json.data;
        } else if (Array.isArray(json?.data?.items)) {
          remoteList = json.data.items;
        }

        // Merge without duplicates
        const combined = [...localList];
        remoteList.forEach((remote) => {
          const rId = String(remote.id || remote._id);
          const exists = combined.some(
            (item) =>
              String(item.id || item._id) === rId ||
              (item.name === remote.name && item.shopifyProductId === remote.shopifyProductId),
          );
          if (!exists) {
            combined.push({ ...remote, id: rId });
          }
        });

        try {
          localStorage.setItem('customforge_saved_designs', JSON.stringify(combined));
        } catch {}

        setDesigns(combined);
      })
      .catch((err) => {
        console.warn('Could not load designs from API:', err.message);
        setDesigns(localList);
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
        (d.tags || []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [designs, searchQuery]);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirmDesign) return;
    const targetId = deleteConfirmDesign.id || deleteConfirmDesign._id;
    setDeleting(true);
    try {
      await api.library.remove(targetId).catch(() => {});

      // Remove from localStorage
      try {
        const stored = JSON.parse(localStorage.getItem('customforge_saved_designs') || '[]');
        const updated = stored.filter(
          (d) =>
            String(d.id || d._id) !== String(targetId) &&
            d.name !== deleteConfirmDesign.name,
        );
        localStorage.setItem('customforge_saved_designs', JSON.stringify(updated));
      } catch {}

      setDesigns((prev) =>
        prev.filter((d) => String(d.id || d._id) !== String(targetId)),
      );
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
        { content: 'Refresh', onAction: fetchDesigns, loading },
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
        {loading && designs.length === 0 ? (
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
            {filteredDesigns.map((design) => {
              const dId = design.id || design._id;
              const createdDate = design.createdAt ? new Date(design.createdAt) : new Date();
              return (
                <Layout.Section key={dId} variant="oneThird">
                  <Card>
                    <BlockStack gap="300">
                      {/* Real product mockup preview */}
                      <DesignMockupPreview
                        designText={design.name || design.canvasState?.text || 'Custom Design'}
                        designImage={design.thumbnailUrl || design.canvasState?.uploadedImageUrl}
                        productLabel={design.tags?.[0] || design.shopifyProductId || 'T-Shirt'}
                        size="sm"
                        showGuides={false}
                      />

                      {/* Title & Tags */}
                      <BlockStack gap="100">
                        <InlineStack align="space-between" alignBlock="start">
                          <Text variant="headingSm" as="h3" fontWeight="bold">
                            {design.name || 'Untitled Design'}
                          </Text>
                          {design.tags?.[0] && (
                            <Badge tone="info" size="small">{design.tags[0]}</Badge>
                          )}
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Saved {createdDate.toLocaleDateString('en-US', {
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
                            navigate(`${basePath}/editor?libraryItem=${dId}`)
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
            );
          })}
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
