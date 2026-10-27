const PUBLISHED_DESIGN_TAG = 'customforge-app-published-design-v1';

export const isCustomForgeOrderDesign = (design) => {
  if (!design || typeof design !== 'object') return false;

  if (design.isPublishedCustomForgeProduct === true) return true;

  const tags = Array.isArray(design.productTags) ? design.productTags : [];
  if (tags.includes(PUBLISHED_DESIGN_TAG)) return true;

  const properties = design.properties || design.customAttributes || {};
  return Object.entries(properties).some(
    ([key, value]) =>
      key.trim().toLowerCase() === 'customforge design' &&
      String(value).trim().toLowerCase() === 'yes',
  );
};
