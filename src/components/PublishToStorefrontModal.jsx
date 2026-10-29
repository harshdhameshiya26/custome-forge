import {
  Banner,
  BlockStack,
  InlineStack,
  Modal,
  Select,
  Spinner,
  Text,
  TextField,
  Thumbnail,
} from '@shopify/polaris';
import PropTypes from 'prop-types';

export default function PublishToStorefrontModal({
  open,
  product,
  colorName,
  size,
  technique,
  customText,
  customPrice = '',
  onCustomPriceChange,
  options = [],
  isStoreProduct = false,
  collections,
  collectionsLoading,
  collectionsError,
  collectionChoice,
  newCollectionName,
  collectionNameError,
  publishing,
  variantAvailable = true,
  onCollectionChoiceChange,
  onNewCollectionNameChange,
  onRetryCollections,
  onClose,
  onPublish,
}) {
  if (!product) return null;

  const availableCollections = Array.isArray(collections) ? collections : [];
  const selectedChoice = collectionChoice || { type: 'none' };
  const collectionOptions = [
    { label: 'Skip collection and publish directly', value: 'none' },
    { label: 'Create a new collection', value: 'new' },
    ...availableCollections.filter((collection) => collection?.id && collection?.title).map((collection) => ({
      label: collection.title,
      value: collection.id,
    })),
  ];

  const selectedCollectionValue = selectedChoice.type === 'existing'
    ? selectedChoice.id
    : selectedChoice.type;
  const validCustomPrice = /^\d+(?:\.\d{1,2})?$/.test(String(customPrice));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Publish to Storefront"
      primaryAction={{
        content: 'Publish product',
        onAction: onPublish,
        loading: publishing,
        disabled: !variantAvailable || !validCustomPrice || collectionsLoading ||
          (Boolean(collectionsError) && selectedChoice.type !== 'none'),
      }}
      secondaryActions={[{ content: 'Cancel', onAction: onClose, disabled: publishing }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {!variantAvailable && (
            <Banner title="Unavailable product combination" tone="critical">
              <Text as="p" variant="bodyMd">
                Choose a valid Shopify variant combination before publishing.
              </Text>
            </Banner>
          )}
          <InlineStack gap="300" blockAlign="center">
            <Thumbnail source={product.image || ''} alt={product.name || ''} size="large" />
            <BlockStack gap="100">
              <Text as="h3" variant="headingMd">{product.name}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {options.length
                  ? options.map((option) => `${option.name}: ${option.value}`).join(' · ')
                  : `${colorName} · Size ${size}`}
                {' · '}{(technique || '').toUpperCase()}
              </Text>
              {isStoreProduct && (
                <Text as="p" variant="bodySm" tone="subdued">
                  The full Shopify variant matrix and its individual prices will be retained.
                </Text>
              )}
              {customText && (
                <Text as="p" variant="bodySm">Design text: {customText}</Text>
              )}
            </BlockStack>
          </InlineStack>

          <TextField
            label="Custom product price"
            type="number"
            value={String(customPrice)}
            onChange={onCustomPriceChange}
            prefix="$"
            min={0}
            step="0.01"
            helpText="This price will be used in Shopify and the storefront."
            error={!validCustomPrice ? 'Enter a valid price with up to 2 decimal places.' : undefined}
            disabled={publishing}
            autoComplete="off"
          />

          {collectionsError && (
            <Banner
              title="Collections could not be loaded"
              tone="critical"
              action={{ content: 'Try again', onAction: onRetryCollections }}
            >
              <Text as="p" variant="bodyMd">{collectionsError}</Text>
            </Banner>
          )}

          {collectionsLoading ? (
            <InlineStack gap="200" blockAlign="center">
              <Spinner accessibilityLabel="Loading Shopify collections" size="small" />
              <Text as="p" variant="bodyMd" tone="subdued">Loading Shopify collections…</Text>
            </InlineStack>
          ) : (
            <BlockStack gap="300">
              <Select
                label="Collection"
                options={collectionOptions}
                value={selectedCollectionValue}
                onChange={onCollectionChoiceChange}
                helpText="Choose a collection, create one, or publish without assigning a collection."
                disabled={Boolean(collectionsError) || publishing}
              />
              {selectedChoice.type === 'new' && (
                <TextField
                  label="New collection name"
                  value={newCollectionName}
                  onChange={onNewCollectionNameChange}
                  autoComplete="off"
                  maxLength={100}
                  showCharacterCount
                  error={collectionNameError}
                  disabled={publishing}
                />
              )}
            </BlockStack>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

PublishToStorefrontModal.propTypes = {
  open: PropTypes.bool.isRequired,
  product: PropTypes.shape({
    image: PropTypes.string,
    name: PropTypes.string,
  }),
  colorName: PropTypes.string,
  size: PropTypes.string,
  technique: PropTypes.string,
  customText: PropTypes.string,
  customPrice: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onCustomPriceChange: PropTypes.func,
  options: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired,
  })),
  isStoreProduct: PropTypes.bool,
  collections: PropTypes.array,
  collectionsLoading: PropTypes.bool,
  collectionsError: PropTypes.string,
  collectionChoice: PropTypes.shape({
    type: PropTypes.string,
    id: PropTypes.string,
  }),
  newCollectionName: PropTypes.string,
  collectionNameError: PropTypes.string,
  publishing: PropTypes.bool,
  variantAvailable: PropTypes.bool,
  onCollectionChoiceChange: PropTypes.func,
  onNewCollectionNameChange: PropTypes.func,
  onRetryCollections: PropTypes.func,
  onClose: PropTypes.func,
  onPublish: PropTypes.func,
};
