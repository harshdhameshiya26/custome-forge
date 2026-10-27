import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  Badge,
  Card,
  Box,
  Divider,
  Button,
  ButtonGroup,
  Banner,
  TextField,
  DataTable,
  ResourceList,
  ResourceItem,
  Spinner,
} from '@shopify/polaris';
import DesignMockupPreview from './DesignMockupPreview';

// All products supported by the editor
const PRODUCT_OPTIONS = [
  { label: 'Custom T-Shirt',         value: 'tshirt' },
  { label: 'Custom Hoodie',          value: 'hoodie' },
  { label: 'Ceramic Bistro Mug',     value: 'mug' },
  { label: 'Tough Armor Phone Case', value: 'phone_case' },
];

const getVersionKey = (version) => String(version?.id || version?.version || '');

/**
 * VersionComparisonModal
 *
 * Redesigned UX:
 *  1. Product selector at the top — choose which product's versions to browse
 *  2. All saved versions listed as clickable cards (no Left/Right dropdowns)
 *  3. Click once → Baseline; click again → Comparison
 *  4. Side-by-side live mockup comparison + diff table
 */
export default function VersionComparisonModal({
  open = false,
  onClose = () => {},
  versions = [],
  loading = false,
  error = '',
  isSaving = false,
  productName = '',
  currentProductId = 'tshirt',
  products = PRODUCT_OPTIONS,
  onRestoreVersion,
  onCreateSnapshot,
  onLoadVersion,
  onProductChange,   // (productId) => void — parent refreshes history for chosen product
}) {
  const productOptions = Array.isArray(products) && products.length > 0 ? products : PRODUCT_OPTIONS;
  const list = Array.isArray(versions) && versions.length > 0 ? versions : [];

  // Product selector
  const [selectedProduct, setSelectedProduct] = useState(currentProductId || 'tshirt');

  // Version selection — alternating Baseline / Comparison slot
  const [leftIdx,  setLeftIdx]  = useState(0);
  const [rightIdx, setRightIdx] = useState(Math.max(0, list.length - 1));
  const [nextSlot, setNextSlot] = useState('left'); // 'left' | 'right'

  const [newNote,   setNewNote]   = useState('');
  const [noteError, setNoteError] = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [versionDetails,    setVersionDetails]    = useState({});
  const [loadingVersionIds, setLoadingVersionIds] = useState({});
  const [detailError,       setDetailError]       = useState('');
  const versionDetailsRef    = useRef({});
  const loadingVersionIdsRef = useRef(new Set());

  // Sync product selector when editor changes product
  useEffect(() => {
    if (currentProductId && currentProductId !== selectedProduct) {
      setSelectedProduct(currentProductId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProductId]);

  // Reset selection indices when version list changes (different product loaded)
  useEffect(() => {
    setLeftIdx(0);
    setRightIdx(Math.max(0, list.length - 1));
    setNextSlot('left');
  }, [list.length]);

  // Product change handler
  const handleProductChange = (productId) => {
    setSelectedProduct(productId);
    setVersionDetails({});
    versionDetailsRef.current = {};
    loadingVersionIdsRef.current = new Set();
    setDetailError('');
    if (onProductChange) onProductChange(productId);
  };

  // Version card click: fill alternating slots
  const handleVersionClick = (idx) => {
    if (nextSlot === 'left') { setLeftIdx(idx); setNextSlot('right'); }
    else { setRightIdx(idx); setNextSlot('left'); }
  };

  useEffect(() => {
    if (!open) {
      setShowForm(false);
      setNewNote('');
      setNoteError('');
    }
  }, [open]);

  const validateNote = (value) => {
    const trimmed = (value ?? newNote).trim();
    if (!trimmed) {
      return 'Version note is required.';
    }
    if (trimmed.length < 2) {
      return 'Version note must be at least 2 characters.';
    }
    if (trimmed.length > 120) {
      return 'Version note cannot exceed 120 characters.';
    }
    return '';
  };

  const handleNoteChange = (value) => {
    setNewNote(value);
    if (noteError) {
      const err = validateNote(value);
      setNoteError(err);
    }
  };

  const handleSaveSnapshot = async () => {
    const err = validateNote(newNote);
    if (err) {
      setNoteError(err);
      return;
    }
    setNoteError('');
    if (onCreateSnapshot) {
      const saved = await onCreateSnapshot(newNote.trim());
      if (saved) {
        setNewNote('');
        setNoteError('');
        setShowForm(false);
      }
    }
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setNewNote('');
    setNoteError('');
  };

  const leftVersion  = list[leftIdx]  ?? null;
  const rightVersion = list[rightIdx] ?? null;
  const resolvedLeftVersion  = leftVersion  ? { ...leftVersion,  ...(versionDetails[getVersionKey(leftVersion)]  || {}) } : null;
  const resolvedRightVersion = rightVersion ? { ...rightVersion, ...(versionDetails[getVersionKey(rightVersion)] || {}) } : null;
  const isSame = leftIdx === rightIdx;

  const ensureVersionDetails = useCallback(async (version) => {
    if (!open || !version || version.state || !onLoadVersion) return;
    const key = getVersionKey(version);
    if (versionDetailsRef.current[key] || loadingVersionIdsRef.current.has(key)) return;

    loadingVersionIdsRef.current.add(key);
    setLoadingVersionIds((current) => ({ ...current, [key]: true }));
    setDetailError('');
    try {
      const details = await onLoadVersion(version);
      if (!details?.state) throw new Error('The saved version does not contain canvas data.');
      versionDetailsRef.current[key] = details;
      setVersionDetails((current) => ({ ...current, [key]: details }));
    } catch (error) {
      setDetailError(error.message || 'Unable to load the selected version.');
    } finally {
      loadingVersionIdsRef.current.delete(key);
      setLoadingVersionIds((current) => ({ ...current, [key]: false }));
    }
  }, [open, onLoadVersion]);

  useEffect(() => {
    if (!open) return;
    ensureVersionDetails(leftVersion);
    if (getVersionKey(leftVersion) !== getVersionKey(rightVersion)) {
      ensureVersionDetails(rightVersion);
    }
  }, [open, leftVersion, rightVersion, ensureVersionDetails]);

  /* ── Diff computation ── */
  const DIFF_KEYS = [
    { key: 'productName',      label: 'Product' },
    { key: 'productColorName', label: 'Garment Color' },
    { key: 'size',             label: 'Size' },
    { key: 'customText',       label: 'Custom Text' },
    { key: 'selectedFont',     label: 'Font' },
    { key: 'textColor',        label: 'Text Color' },
    { key: 'selectedEffect',   label: 'Effect' },
    { key: 'textScale',        label: 'Text Scale (%)' },
    { key: 'textX',            label: 'Text X (px)' },
    { key: 'textY',            label: 'Text Y (px)' },
    { key: 'textRotation',     label: 'Text Rotation (°)' },
    { key: 'imageScale',       label: 'Image Scale (%)' },
    { key: 'imageX',           label: 'Image X (px)' },
    { key: 'imageY',           label: 'Image Y (px)' },
    { key: 'imageRotation',    label: 'Image Rotation (°)' },
    { key: 'uploadedFileName', label: 'Artwork File' },
  ];

  const diffRows = (!resolvedLeftVersion?.state || !resolvedRightVersion?.state) ? [] :
    DIFF_KEYS
      .map(({ key, label }) => {
        const lv = resolvedLeftVersion.state[key] != null  ? String(resolvedLeftVersion.state[key])  : '—';
        const rv = resolvedRightVersion.state[key] != null ? String(resolvedRightVersion.state[key]) : '—';
        return { label, left: lv, right: rv, changed: lv !== rv };
      })
      .filter((r) => r.changed);

  /* ── Single pane renderer ── */
  const renderPane = (version, slotLabel) => {
    if (!version) {
      return (
        <Box padding="400" background="bg-surface-secondary">
          <Text variant="bodySm" tone="subdued" alignment="center" as="p">
            {`Click a version card below to set the ${slotLabel}`}
          </Text>
        </Box>
      );
    }
    const s = version.state || {};
    const isLoading = loadingVersionIds[getVersionKey(version)];

    return (
      <BlockStack gap="200">
        {/* Title row */}
        <InlineStack align="space-between" alignBlock="center" wrap>
          <Text variant="headingSm" as="h4" fontWeight="bold">
            {version.versionName || 'Version'}
          </Text>
          <InlineStack gap="100" wrap>
            {s.productName     && <Badge tone="attention">{s.productName}</Badge>}
            {s.productColorName && <Badge tone="info">{s.productColorName}</Badge>}
            <Badge tone={slotLabel === 'Baseline' ? 'attention' : 'info'}>{slotLabel}</Badge>
          </InlineStack>
        </InlineStack>

        {isLoading && (
          <InlineStack gap="200" align="center">
            <Spinner size="small" accessibilityLabel="Loading version" />
            <Text as="span" variant="bodySm" tone="subdued">Loading…</Text>
          </InlineStack>
        )}

        {s.productId ? (
          <Card>
            <BlockStack gap="200" inlineAlign="center">
              {/* Live mockup preview from saved canvas state */}
              <DesignMockupPreview
                productId={s.productId}
                productType={s.productName || s.productType}
                productColor={s.productColor || s.garmentColor}
                productColorName={s.productColorName}
                customText={s.customText || s.text || ''}
                fontFamily={s.selectedFont || s.font || 'Poppins'}
                textColor={s.textColor || s.color || '#111827'}
                effect={s.selectedEffect || s.effect || 'none'}
                textScale={s.textScale ?? 85}
                textX={s.textX ?? 0}
                textY={s.textY ?? 0}
                textRotation={s.textRotation ?? 0}
                imageScale={s.imageScale ?? 90}
                imageX={s.imageX ?? 0}
                imageY={s.imageY ?? 0}
                imageRotation={s.imageRotation ?? 0}
                uploadedFileName={s.uploadedFileName || null}
                size="sm"
                height={180}
              />
              <Text variant="bodyMd" fontWeight="semibold" as="p">
                {s.productName || s.productId}
                {s.productColorName ? ` — ${s.productColorName}` : ''}
              </Text>
              <Text variant="bodySm" tone="subdued" as="p">
                {s.customText || s.text || 'No custom text'}
              </Text>
              {s.uploadedFileName && (
                <Text variant="bodySm" tone="subdued" as="p">
                  Artwork: {s.uploadedFileName}
                </Text>
              )}
            </BlockStack>
          </Card>
        ) : (
          !isLoading && (
            <Box padding="300" background="bg-surface-secondary">
              <Text variant="bodySm" tone="subdued" alignment="center" as="p">
                Version details unavailable
              </Text>
            </Box>
          )
        )}

        {/* Date note */}
        {version.date && (
          <Text variant="bodyXs" tone="subdued" as="p" alignment="center">
            {version.date}
            {version.notes ? ` — ${version.notes}` : ''}
          </Text>
        )}

        {/* Restore */}
        {onRestoreVersion && s.productId && (
          <Button fullWidth variant="primary" size="slim" onClick={() => onRestoreVersion(version)}>
            ↩ Restore This Version
          </Button>
        )}
      </BlockStack>
    );
  };

  const selectedProductLabel = productOptions.find((p) => p.value === selectedProduct)?.label || 'Product';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Version History & Comparison"
      large
      primaryAction={{ content: 'Close', onAction: onClose }}
    >
      <Modal.Section>
        <BlockStack gap="400">

          {/* ── Step 1: Product Selector ── */}
          <BlockStack gap="200">
            <InlineStack align="space-between" alignBlock="center" wrap>
              <Text variant="headingSm" as="h3" fontWeight="semibold">1. Select Product</Text>
              <Badge tone="info">{selectedProductLabel}</Badge>
            </InlineStack>
            <Text variant="bodySm" tone="subdued" as="p">
              Choose a product to load all versions stored in the database:
            </Text>
            <ButtonGroup variant="segmented">
              {productOptions.map((p) => (
                <Button
                  key={p.value}
                  pressed={selectedProduct === p.value}
                  onClick={() => handleProductChange(p.value)}
                  size="slim"
                  disabled={loading}
                >
                  {p.label}
                </Button>
              ))}
            </ButtonGroup>
          </BlockStack>

          <Divider />

          {/* ── Save snapshot row ── */}
          <InlineStack align="space-between" alignBlock="center" wrap gap="200">
            <Text variant="bodySm" tone="subdued" as="span">
              {selectedProductLabel} versions auto-save on <strong>Save Design</strong>.
            </Text>
            {!showForm && (
              <Button
                size="slim"
                onClick={() => { setShowForm(true); setNoteError(''); }}
                disabled={isSaving}
              >
                + Save Current as New Version
              </Button>
            )}
          </InlineStack>

          {showForm && (
            <Card background="bg-surface-secondary">
              <BlockStack gap="200">
                <TextField
                  label="Version Note"
                  placeholder="e.g. Moved logo up, switched to Hoodie Navy"
                  value={newNote}
                  onChange={handleNoteChange}
                  autoComplete="off"
                  disabled={isSaving}
                  error={noteError}
                  requiredIndicator
                  maxLength={120}
                  showCharacterCount
                  helpText="Enter a brief note describing the changes in this version (2–120 characters)."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveSnapshot();
                    }
                  }}
                />
                <InlineStack gap="200">
                  <Button size="slim" variant="primary" onClick={handleSaveSnapshot} loading={isSaving}>
                    Confirm &amp; Save
                  </Button>
                  <Button size="slim" onClick={handleCancelForm} disabled={isSaving}>
                    Cancel
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          )}

          <Divider />

          {error && (
            <Banner tone="critical" title="Version history unavailable">
              <Text as="p" variant="bodySm">{error}</Text>
            </Banner>
          )}

          {loading && (
            <InlineStack gap="200" align="center">
              <Spinner size="small" accessibilityLabel="Loading version history" />
              <Text as="p" variant="bodySm" tone="subdued">Loading saved versions…</Text>
            </InlineStack>
          )}

          {/* ── Step 2: Saved versions list ── */}
          <InlineStack align="space-between" alignBlock="center">
            <Text variant="headingSm" as="h3" fontWeight="semibold">
              Saved Versions — {selectedProductLabel}
            </Text>
            {list.length > 0 && (
              <Badge tone="info">{list.length} version{list.length !== 1 ? 's' : ''}</Badge>
            )}
          </InlineStack>

          {list.length > 0 && (
            <Text variant="bodySm" tone="subdued" as="p">
              Click a version to set the{' '}
              <Badge tone={nextSlot === 'left' ? 'attention' : 'info'}>
                {nextSlot === 'left' ? 'Baseline' : 'Comparison'}
              </Badge>{' '}slot.
            </Text>
          )}

          {!loading && !error && list.length === 0 && (
            <Box padding="600">
              <BlockStack gap="200" inlineAlign="center">
                <Text variant="headingMd" as="h3" alignment="center">No versions saved yet</Text>
                <Text variant="bodyMd" tone="subdued" as="p" alignment="center">
                  Click <strong>Save Design</strong> in the editor to record the first snapshot
                  for <strong>{selectedProductLabel}</strong>.
                </Text>
              </BlockStack>
            </Box>
          )}

          {!loading && list.length >= 1 && (
            <BlockStack gap="400">
              {/* Clickable version cards */}
              <Card padding="0">
                <ResourceList
                  resourceName={{ singular: 'version', plural: 'versions' }}
                  items={list}
                  renderItem={(version, _id, index) => {
                    const isLeft  = index === leftIdx;
                    const isRight = index === rightIdx;
                    const isLatest = index === list.length - 1;
                    return (
                      <ResourceItem
                        id={String(version.id || version.version || index)}
                        accessibilityLabel={`Select ${version.versionName || `Version ${index + 1}`}`}
                        onClick={() => handleVersionClick(index)}
                      >
                        <InlineStack align="space-between" alignBlock="center" wrap gap="200">
                          <BlockStack gap="050">
                            <InlineStack gap="150" alignBlock="center" wrap>
                              <Text variant="bodyMd" fontWeight="semibold" as="span">
                                {version.versionName || `Version ${index + 1}`}
                              </Text>
                              {isLatest && <Badge tone="new">Latest</Badge>}
                              {isLeft && isRight && <Badge tone="warning">Baseline &amp; Comparison</Badge>}
                              {isLeft && !isRight && <Badge tone="attention">Baseline</Badge>}
                              {isRight && !isLeft && <Badge tone="info">Comparison</Badge>}
                            </InlineStack>
                            <Text variant="bodySm" tone="subdued" as="span">
                              {[version.date, version.notes].filter(Boolean).join(' — ') || 'Saved version'}
                            </Text>
                          </BlockStack>
                          <ButtonGroup size="micro">
                            <Button
                              size="slim"
                              pressed={isLeft}
                              tone={isLeft ? 'critical' : undefined}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLeftIdx(index);
                              }}
                            >
                              {isLeft ? '✓ Baseline' : 'Set Baseline'}
                            </Button>
                            <Button
                              size="slim"
                              pressed={isRight}
                              tone={isRight ? 'success' : undefined}
                              onClick={(e) => {
                                e.stopPropagation();
                                setRightIdx(index);
                              }}
                            >
                              {isRight ? '✓ Comparison' : 'Set Comparison'}
                            </Button>
                            {onRestoreVersion && (
                              <Button
                                size="slim"
                                variant="plain"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRestoreVersion(version);
                                }}
                              >
                                Restore
                              </Button>
                            )}
                          </ButtonGroup>
                        </InlineStack>
                      </ResourceItem>
                    );
                  }}
                />
              </Card>

              <Divider />

              {/* ── Step 3: Side-by-side comparison ── */}
              <Text variant="headingSm" as="h3" fontWeight="semibold">Side-by-Side Comparison</Text>

              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                {renderPane(resolvedLeftVersion,  'Baseline')}
                {renderPane(resolvedRightVersion, 'Comparison')}
              </InlineGrid>

              {/* ── Diff table ── */}
              {!isSame && diffRows.length > 0 && (
                <BlockStack gap="200">
                  <Divider />
                  <InlineStack align="space-between" alignBlock="center">
                    <Text variant="headingSm" as="h4">What Changed</Text>
                    <Badge tone="attention">
                      {diffRows.length} change{diffRows.length !== 1 ? 's' : ''}
                    </Badge>
                  </InlineStack>
                  <DataTable
                    columnContentTypes={['text', 'text', 'text']}
                    headings={[
                      'Property',
                      resolvedLeftVersion?.versionName  || 'Left (before)',
                      resolvedRightVersion?.versionName || 'Right (after)',
                    ]}
                    rows={diffRows.map((r) => [
                      r.label,
                      r.left,
                      r.right,
                    ])}
                    truncate
                  />
                </BlockStack>
              )}

              {!isSame && diffRows.length === 0 && resolvedLeftVersion?.state && resolvedRightVersion?.state && (
                <Banner tone="success" title="Identical versions">
                  <Text as="p" variant="bodySm">Both versions have the same design configuration.</Text>
                </Banner>
              )}

              {detailError && (
                <Banner tone="critical" title="Version details unavailable">
                  <Text as="p" variant="bodySm">{detailError}</Text>
                </Banner>
              )}

              {isSame && (
                <Banner tone="info" title="Same version selected on both sides">
                  <Text as="p" variant="bodySm">
                    Click two <strong>different</strong> version cards above to compare them.
                  </Text>
                </Banner>
              )}
            </BlockStack>
          )}

        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
