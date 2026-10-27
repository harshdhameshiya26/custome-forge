const PRINT_AREAS = {
  tshirt: { top: 0.26, left: 0.26, width: 0.48, height: 0.42, label: 'Front', dimensions: '250×300mm' },
  hoodie: { top: 0.3, left: 0.28, width: 0.44, height: 0.34, label: 'Chest', dimensions: '260×240mm' },
  mug: { top: 0.25, left: 0.2, width: 0.4, height: 0.48, label: 'Cylinder', dimensions: '80×90mm' },
  phone_case: { top: 0.34, left: 0.24, width: 0.52, height: 0.52, label: 'Back plate', dimensions: '70×110mm' },
  pants: { top: 0.28, left: 0.32, width: 0.36, height: 0.32, label: 'Leg', dimensions: '180×220mm' },
  cap: { top: 0.3, left: 0.28, width: 0.44, height: 0.26, label: 'Front panel', dimensions: '100×60mm' },
  bag: { top: 0.24, left: 0.24, width: 0.52, height: 0.52, label: 'Main panel', dimensions: '250×250mm' },
  jewelry: { top: 0.34, left: 0.34, width: 0.32, height: 0.32, label: 'Engraving area', dimensions: '35×35mm' },
  footwear: { top: 0.3, left: 0.28, width: 0.44, height: 0.42, label: 'Outer side', dimensions: '100×120mm' },
  home: { top: 0.16, left: 0.16, width: 0.68, height: 0.68, label: 'Full surface', dimensions: '400×400mm' },
  general: { top: 0.2, left: 0.2, width: 0.6, height: 0.6, label: 'Main surface', dimensions: '250×250mm' },
};

export function getProductPrintArea(product = {}) {
  const productId = String(product.id || '').toLowerCase();
  const category = `${product.category || ''} ${product.productType || ''} ${product.name || ''}`.toLowerCase();
  let area = PRINT_AREAS.general;

  if (productId === 'tshirt' || /\b(t-?shirts?|shirts?|tops?|hoodies?|sweatshirts?|jackets?)\b/.test(category)) {
    area = productId === 'hoodie' || /\b(hoodies?|sweatshirts?)\b/.test(category)
      ? PRINT_AREAS.hoodie
      : PRINT_AREAS.tshirt;
  } else if (productId === 'mug' || /\b(mugs?|drinkware|glassware|bottles?)\b/.test(category)) {
    area = PRINT_AREAS.mug;
  } else if (productId === 'phone_case' || /\b(phone|tablet)\s*cases?\b/.test(category)) {
    area = PRINT_AREAS.phone_case;
  } else if (/\b(pants?|trousers?|leggings?)\b/.test(category)) {
    area = PRINT_AREAS.pants;
  } else if (/\b(caps?|hats?|beanies?)\b/.test(category)) {
    area = PRINT_AREAS.cap;
  } else if (/\b(bags?|backpacks?|totes?)\b/.test(category)) {
    area = PRINT_AREAS.bag;
  } else if (/\b(jewelry|jewellery|necklaces?|rings?|bracelets?|earrings?)\b/.test(category)) {
    area = PRINT_AREAS.jewelry;
  } else if (/\b(shoes?|sneakers?|footwear)\b/.test(category)) {
    area = PRINT_AREAS.footwear;
  } else if (/\b(home|decor|pillows?|blankets?|curtains?)\b/.test(category)) {
    area = PRINT_AREAS.home;
  }

  const printAreaConfig = product.printAreaConfig;
  const widthMm = Number(printAreaConfig?.printAreaWidthMm);
  const heightMm = Number(printAreaConfig?.printAreaHeightMm);
  const dimensions = Number.isFinite(widthMm) && widthMm > 0 &&
    Number.isFinite(heightMm) && heightMm > 0
    ? `${widthMm}×${heightMm}mm`
    : area.dimensions;

  return {
    ...area,
    label: printAreaConfig?.printAreaName || area.label,
    dimensions,
    zone: { top: area.top, left: area.left, width: area.width, height: area.height },
  };
}
