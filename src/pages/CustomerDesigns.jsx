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
  const [syncing, setSyncing] = useState(false);

  const syncPendingDesigns = useCallback(async () => {
    let localList = [];
    try {
      localList = JSON.parse(localStorage.getItem('customforge_saved_designs') || '[]');
      if (!Array.isArray(localList)) localList = [];
    } catch { localList = []; }

    const pending = localList.filter((item) => item.syncStatus === 'pending' || item.syncStatus === 'failed');
    if (!pending.length) return [];

    const syncedIds = new Set();
    for (const item of pending) {
      try {
        const saved = await api.library.save({
          studioKey: item.studioKey || item.id || item._id,
          name: item.name,
          shopifyProductId: item.shopifyProductId || item.canvasState?.productId,
          canvasState: item.canvasState,
          tags: item.tags,
          thumbnailUrl: item.thumbnailUrl,
        });
        const backendItem = saved?.data?.item;
        if (backendItem?.id) syncedIds.add(String(item.id || item._id));
      } catch (syncError) {
        console.warn('Pending library sync failed:', syncError.message);
      }
    }

    const current = JSON.parse(localStorage.getItem('customforge_saved_designs') || '[]');
    const updated = current.map((item) => syncedIds.has(String(item.id || item._id))
      ? { ...item, syncStatus: 'synced' }
      : item.syncStatus === 'pending' || item.syncStatus === 'failed'
        ? { ...item, syncStatus: 'failed' }
        : item);
    localStorage.setItem('customforge_saved_designs', JSON.stringify(updated));
    return updated;
  }, []);

  // Fetch from backend and merge with local storage
  const fetchDesigns = useCallback(async () => {
    setLoading(true);
    setError(null);

    let localList = [];
    try {
      localList = JSON.parse(localStorage.getItem('customforge_saved_designs') || '[]');
      if (!Array.isArray(localList)) localList = [];
    } catch { localList = []; }

    await syncPendingDesigns();
    try {
      localList = JSON.parse(localStorage.getItem('customforge_saved_designs') || '[]');
      if (!Array.isArray(localList)) localList = [];
    } catch { localList = []; }

    try {
      let remoteList = [];
      let page = 1;
      let pages = 1;
      do {
        const json = await api.library.listAll({ page, limit: 100 });
        const pageItems = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.data?.items)
            ? json.data.items
            : [];
        remoteList.push(...pageItems);
        pages = Number(json?.data?.pagination?.pages) || 1;
        page += 1;
      } while (page <= pages);

      // Prefer remote records, then add unsynced/local-only records.
      const remoteByKey = new Map(remoteList.map((item) => [
        String(item.studioKey || item.id || item._id),
        { ...item, id: String(item.id || item._id), syncStatus: 'synced' },
      ]));
      const combined = [...remoteByKey.values()];
      localList.forEach((localItem) => {
        const key = String(localItem.studioKey || localItem.id || localItem._id);
        const alreadyRemote = remoteList.some((remote) =>
          String(remote.studioKey || remote.id || remote._id) === key ||
          String(remote.id || remote._id) === String(localItem.id || localItem._id) ||
          (!remote.studioKey && !localItem.studioKey && remote.name === localItem.name && remote.shopifyProductId === localItem.shopifyProductId));
        if (!alreadyRemote) combined.push(localItem);
      });

      localStorage.setItem('customforge_saved_designs', JSON.stringify(combined));
      setDesigns(combined);
    } catch (err) {
      console.warn('Could not load designs from API:', err.message);
      setError(err.message || 'Could not reach the saved-design library.');
      setDesigns(localList);
    } finally {
      setLoading(false);
    }
  }, [syncPendingDesigns]);

  useEffect(() => {
    fetchDesigns();
  }, [fetchDesigns]);

  const handleSyncPending = useCallback(async () => {
    setSyncing(true);
    try {
      await syncPendingDesigns();
      await fetchDesigns();
      setBannerAlert({ tone: 'success', title: 'Library Sync Complete', message: 'Pending designs have been synchronized.' });
    } finally {
      setSyncing(false);
    }
  }, [fetchDesigns, syncPendingDesigns]);

  const pendingCount = designs.filter((item) => item.syncStatus === 'pending' || item.syncStatus === 'failed').length;

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
        ...(pendingCount > 0 ? [{ content: `Sync ${pendingCount} Pending`, onAction: handleSyncPending, loading: syncing }] : []),
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
                        productId={design.canvasState?.productId || design.shopifyProductId}
                        productType={design.canvasState?.productType || design.tags?.[0]}
                        productImage={design.canvasState?.storeProductId ? design.canvasState?.productImage : undefined}
                        productColor={design.canvasState?.productColor}
                        productColorName={design.canvasState?.productColorName}
                        productLabel={design.tags?.[0] || design.shopifyProductId || 'T-Shirt'}
                        customText={design.canvasState?.customText ?? design.canvasState?.text ?? design.name ?? ''}
                        designImage={design.canvasState?.uploadedImageUrl}
                        fontFamily={design.canvasState?.font}
                        textColor={design.canvasState?.color}
                        effect={design.canvasState?.effect}
                        imageScale={design.canvasState?.imageScale}
                        imageX={design.canvasState?.imageX}
                        imageY={design.canvasState?.imageY}
                        imageRotation={design.canvasState?.imageRotation}
                        textScale={design.canvasState?.textScale}
                        textX={design.canvasState?.textX}
                        textY={design.canvasState?.textY}
                        textRotation={design.canvasState?.textRotation}
                        additionalTextLayers={design.canvasState?.additionalTextLayers || []}
                        additionalGraphicLayers={design.canvasState?.additionalGraphicLayers || []}
                        additionalImageLayers={design.canvasState?.uploadedImages || []}
                        designOnly
                        size="sm"
                      />

                      {/* Title & Tags */}
                      <BlockStack gap="100">
                        <InlineStack align="space-between" alignBlock="start">
                          <Text variant="headingSm" as="h3" fontWeight="bold">
                            {design.name || 'Untitled Design'}
                          </Text>
                          <InlineStack gap="100">
                            {design.tags?.[0] && (
                              <Badge tone="info" size="small">{design.tags[0]}</Badge>
                            )}
                            {(design.syncStatus === 'pending' || design.syncStatus === 'failed') && (
                              <Badge tone="warning" size="small">Saved locally only</Badge>
                            )}
                          </InlineStack>
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
