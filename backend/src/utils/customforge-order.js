const PUBLISHED_DESIGN_TAG = 'customforge-app-published-design-v1';

export const isCustomForgeOrderDesign = (design) => {
  if (!design || typeof design !== 'object') return false;

  if (design.isPublishedCustomForgeProduct === true) return true;

  const tags = Array.isArray(design.productTags) ? design.productTags : [];
  if (tags.includes(PUBLISHED_DESIGN_TAG)) return true;
  if (tags.some((t) => String(t).toLowerCase().includes('customforge'))) return true;

  const properties = design.properties || design.customAttributes || {};
  return Object.entries(properties).some(([key, value]) => {
    const k = key.trim().toLowerCase();
    const v = String(value).trim().toLowerCase();
    return (
      (k === 'customforge design' && v === 'yes') ||
      k.includes('customforge') ||
      k.startsWith('_custom_') ||
      k.includes('customization') ||
      v.includes('customforge')
    );
  });
};
