export const CUSTOMFORGE_PUBLISHED_DESIGN_TAG = 'customforge-app-published-design-v1';

export const isCustomForgePublishedDesignProduct = (product) => {
  if (!product) return false;

  const tags = Array.isArray(product.tags) ? product.tags : [];
  if (tags.includes(CUSTOMFORGE_PUBLISHED_DESIGN_TAG)) return true;
  if (tags.some((t) => String(t).toLowerCase().includes('customforge'))) return true;

  return (
    product.vendor === 'CustomForge' &&
    tags.includes('CustomForge') &&
    typeof product.description === 'string' &&
    product.description.includes('Customized with CustomForge.')
  );
};

export const isCustomForgeLineItem = (lineItem) => {
  if (!lineItem) return false;

  // Check product tags, vendor, and description
  if (isCustomForgePublishedDesignProduct(lineItem.variant?.product)) {
    return true;
  }

  // Check customAttributes / line item properties
  const customAttrs = Array.isArray(lineItem.customAttributes)
    ? lineItem.customAttributes
    : Object.entries(lineItem.properties || {}).map(([key, value]) => ({ key, value }));

  return customAttrs.some((attr) => {
    const k = String(attr?.key || '').trim().toLowerCase();
    const v = String(attr?.value || '').trim().toLowerCase();
    return (
      (k === 'customforge design' && v === 'yes') ||
      k.includes('customforge') ||
      k.startsWith('_custom_') ||
      k.includes('customization') ||
      v.includes('customforge')
    );
  });
};
