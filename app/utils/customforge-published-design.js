export const CUSTOMFORGE_PUBLISHED_DESIGN_TAG = 'customforge-app-published-design-v1';

export const isCustomForgePublishedDesignProduct = (product) => {
  if (!product) return false;

  const tags = Array.isArray(product.tags) ? product.tags : [];
  if (tags.includes(CUSTOMFORGE_PUBLISHED_DESIGN_TAG)) return true;

  return (
    product.vendor === 'CustomForge' &&
    tags.includes('CustomForge') &&
    typeof product.description === 'string' &&
    product.description.includes('Customized with CustomForge.')
  );
};
