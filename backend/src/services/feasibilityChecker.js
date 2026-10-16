/* eslint-env node */

/**
 * Industry standard default manufacturing constraints used when a product has
 * no custom rule record seeded in MongoDB.
 */
export const DEFAULT_MANUFACTURING_CONSTRAINTS = Object.freeze({
  maxPrintWidthMm: 300.0,   // Standard t-shirt / canvas max print width
  maxPrintHeightMm: 400.0,  // Standard max print height
  minPrintWidthMm: 15.0,    // Minimum legible print width
  minPrintHeightMm: 15.0,   // Minimum legible print height
  maxBleedMm: 5.0,
  allowedPlacementBounds: {
    minX: 0.0,
    minY: 0.0,
    maxX: 300.0,
    maxY: 400.0,
  },
  availableMaterials: [
    'cotton_100',
    'poly_blend',
    'cotton_ringspun',
    'canvas',
    'ceramic',
    'stainless_steel',
    'aluminum',
  ],
  restrictedMaterials: [
    'silk',
    'leather_raw',
    'pvc',
  ],
  incompatibleOptions: [
    {
      optionA: { name: 'material', value: 'ceramic' },
      optionB: { name: 'technique', value: 'embroidery' },
      reason: 'Embroidery needle threading is physically impossible on ceramic surfaces.',
      suggestedFix: 'Switch customization technique to UV Print or Sublimation, or choose apparel material.',
    },
    {
      optionA: { name: 'material', value: 'leather' },
      optionB: { name: 'technique', value: 'sublimation' },
      reason: 'Sublimation inks require synthetic polymer fibers and cannot bond to organic leather.',
      suggestedFix: 'Use Laser Engraving or Foil Debossing for leather goods.',
    },
    {
      optionA: { name: 'finish', value: 'metallic_foil' },
      optionB: { name: 'material', value: 'ribbed_knit' },
      reason: 'Metallic foil will crack and peel on high-stretch ribbed knit fabrics.',
      suggestedFix: 'Choose smooth 100% combed cotton or select screen printing instead of foil.',
    },
    {
      optionA: { name: 'technique', value: 'laser_engrave' },
      optionB: { name: 'material', value: 'poly_blend' },
      reason: 'Laser engraving melts polyester blends and generates toxic fumes.',
      suggestedFix: 'Select 100% natural wood, metal, or genuine leather for laser engraving.',
    },
  ],
  restrictedMaterialColors: [
    {
      material: 'black_cotton',
      disallowedColors: ['black', 'dark_charcoal'],
      disallowedFinishes: ['transparent_gloss'],
      reason: 'Black or dark charcoal ink has zero visibility on black cotton without neon underbase.',
      suggestedFix: 'Select light or contrasting ink colors (e.g. White, Gold, Silver) for dark textiles.',
    },
  ],
  allowedPrintMethods: ['DTG', 'SCREEN_PRINT', 'EMBROIDERY', 'UV_PRINT', 'SUBLIMATION', 'LASER_ENGRAVE'],
  methodConstraints: {
    EMBROIDERY: {
      maxColors: 6,
      minStrokeMm: 1.5,
      maxAreaWidthMm: 150.0,
      maxAreaHeightMm: 150.0,
    },
  },
});

/**
 * Normalizes input option values to lowercase trimmed strings for reliable matching.
 */
const normalize = (val) =>
  String(val ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');

/**
 * Extracts a normalized option map from diverse customer payload formats.
 * Supports:
 *   - Object: { material: "cotton", technique: "dtg" }
 *   - Array: [{ name: "material", value: "cotton" }, { name: "technique", value: "dtg" }]
 *
 * @param {Object|Array} options - Options container
 * @returns {Record<string, string>} Key-value map of normalized option names and values
 */
export const normalizeOptionsMap = (options) => {
  const map = {};
  if (!options) return map;

  if (Array.isArray(options)) {
    for (const item of options) {
      if (item && item.name) {
        map[normalize(item.name)] = normalize(item.value);
      }
    }
  } else if (typeof options === 'object') {
    for (const [key, val] of Object.entries(options)) {
      map[normalize(key)] = normalize(val);
    }
  }

  return map;
};

/**
 * Cross-references customer configuration against manufacturing constraints.
 * Detects physical manufacturing violations, material restrictions, and option incompatibilities.
 *
 * @param {Object} config - Customer customization configuration
 * @param {Object} [customConstraints] - Manufacturing rules from database
 * @returns {Object} Feasibility report with isFeasible boolean, violations, and suggested fixes
 */
export const evaluateProductionFeasibility = (config, customConstraints = {}) => {
  const startTime = Date.now();

  // Merge product constraints with default manufacturing tolerances
  const constraints = {
    maxPrintWidthMm: Number(customConstraints.maxPrintWidthMm) || DEFAULT_MANUFACTURING_CONSTRAINTS.maxPrintWidthMm,
    maxPrintHeightMm: Number(customConstraints.maxPrintHeightMm) || DEFAULT_MANUFACTURING_CONSTRAINTS.maxPrintHeightMm,
    minPrintWidthMm: Number(customConstraints.minPrintWidthMm) || DEFAULT_MANUFACTURING_CONSTRAINTS.minPrintWidthMm,
    minPrintHeightMm: Number(customConstraints.minPrintHeightMm) || DEFAULT_MANUFACTURING_CONSTRAINTS.minPrintHeightMm,
    maxBleedMm: Number(customConstraints.maxBleedMm) || DEFAULT_MANUFACTURING_CONSTRAINTS.maxBleedMm,
    allowedPlacementBounds: customConstraints.allowedPlacementBounds || DEFAULT_MANUFACTURING_CONSTRAINTS.allowedPlacementBounds,
    availableMaterials: Array.isArray(customConstraints.availableMaterials) && customConstraints.availableMaterials.length > 0
      ? customConstraints.availableMaterials.map(normalize)
      : DEFAULT_MANUFACTURING_CONSTRAINTS.availableMaterials.map(normalize),
    restrictedMaterials: Array.isArray(customConstraints.restrictedMaterials)
      ? customConstraints.restrictedMaterials.map(normalize)
      : DEFAULT_MANUFACTURING_CONSTRAINTS.restrictedMaterials.map(normalize),
    incompatibleOptions: Array.isArray(customConstraints.incompatibleOptions)
      ? customConstraints.incompatibleOptions
      : DEFAULT_MANUFACTURING_CONSTRAINTS.incompatibleOptions,
    restrictedMaterialColors: Array.isArray(customConstraints.restrictedMaterialColors)
      ? customConstraints.restrictedMaterialColors
      : DEFAULT_MANUFACTURING_CONSTRAINTS.restrictedMaterialColors,
    allowedPrintMethods: Array.isArray(customConstraints.allowedPrintMethods) && customConstraints.allowedPrintMethods.length > 0
      ? customConstraints.allowedPrintMethods.map(normalize)
      : DEFAULT_MANUFACTURING_CONSTRAINTS.allowedPrintMethods.map(normalize),
    methodConstraints: customConstraints.methodConstraints || DEFAULT_MANUFACTURING_CONSTRAINTS.methodConstraints,
  };

  const violations = [];
  const warnings = [];
  const suggestedFixes = new Set();
  const ruleResults = {
    dimensions: { passed: true },
    placement: { passed: true },
    materials: { passed: true },
    optionCompatibility: { passed: true },
    materialColorRestrictions: { passed: true },
    printMethod: { passed: true },
  };

  const normalizedOptions = normalizeOptionsMap(config.options || config.customOptions || {});

  // Extract material choice (can come from top-level `material` or options map)
  const selectedMaterial = normalize(config.material || normalizedOptions.material || '');

  // Extract print method / technique
  const selectedTechnique = normalize(
    config.printMethod || config.technique || normalizedOptions.print_method || normalizedOptions.technique || 'dtg',
  );

  // ---------------------------------------------------------------------------
  // Check 1: Physical Print Dimensions (Width & Height & Bleed)
  // ---------------------------------------------------------------------------
  const printDims = config.printDimensions || config.dimensions || {};
  const widthMm = Number(printDims.widthMm || printDims.width || config.widthMm || 0);
  const heightMm = Number(printDims.heightMm || printDims.height || config.heightMm || 0);
  const bleedMm = Number(printDims.bleedMm || printDims.bleed || config.bleedMm || 0);

  if (widthMm > 0 && heightMm > 0) {
    // 1A. Exceeds Maximum Print Width
    if (widthMm > constraints.maxPrintWidthMm) {
      const msg = `Print width of ${widthMm}mm exceeds the maximum physical printable width of ${constraints.maxPrintWidthMm}mm.`;
      const fix = `Reduce your design width to ${constraints.maxPrintWidthMm}mm or smaller to fit the product's print bed.`;
      violations.push({
        code: 'PRINT_WIDTH_EXCEEDED',
        type: 'MANUFACTURING_LIMIT',
        field: 'printDimensions.widthMm',
        message: msg,
        currentValue: `${widthMm}mm`,
        limit: `${constraints.maxPrintWidthMm}mm`,
        suggestedFix: fix,
      });
      suggestedFixes.add(fix);
      ruleResults.dimensions.passed = false;
    }

    // 1B. Exceeds Maximum Print Height
    if (heightMm > constraints.maxPrintHeightMm) {
      const msg = `Print height of ${heightMm}mm exceeds the maximum physical printable height of ${constraints.maxPrintHeightMm}mm.`;
      const fix = `Reduce your design height to ${constraints.maxPrintHeightMm}mm or smaller to prevent edge cutoff.`;
      violations.push({
        code: 'PRINT_HEIGHT_EXCEEDED',
        type: 'MANUFACTURING_LIMIT',
        field: 'printDimensions.heightMm',
        message: msg,
        currentValue: `${heightMm}mm`,
        limit: `${constraints.maxPrintHeightMm}mm`,
        suggestedFix: fix,
      });
      suggestedFixes.add(fix);
      ruleResults.dimensions.passed = false;
    }

    // 1C. Below Minimum Manufacturing Legibility
    if (widthMm < constraints.minPrintWidthMm || heightMm < constraints.minPrintHeightMm) {
      const msg = `Print dimensions (${widthMm}mm × ${heightMm}mm) are below the minimum manufacturing limit of ${constraints.minPrintWidthMm}mm × ${constraints.minPrintHeightMm}mm.`;
      const fix = `Enlarge your customization to at least ${constraints.minPrintWidthMm}mm × ${constraints.minPrintHeightMm}mm to ensure crisp print clarity.`;
      violations.push({
        code: 'PRINT_DIMENSIONS_TOO_SMALL',
        type: 'MANUFACTURING_LIMIT',
        field: 'printDimensions',
        message: msg,
        currentValue: `${widthMm}x${heightMm}mm`,
        limit: `${constraints.minPrintWidthMm}x${constraints.minPrintHeightMm}mm`,
        suggestedFix: fix,
      });
      suggestedFixes.add(fix);
      ruleResults.dimensions.passed = false;
    }

    // 1D. Excess Bleed
    if (bleedMm > constraints.maxBleedMm) {
      const msg = `Bleed margin of ${bleedMm}mm exceeds maximum allowed manufacturing bleed of ${constraints.maxBleedMm}mm.`;
      const fix = `Set bleed margin between 0mm and ${constraints.maxBleedMm}mm.`;
      violations.push({
        code: 'BLEED_MARGIN_EXCEEDED',
        type: 'MANUFACTURING_LIMIT',
        field: 'printDimensions.bleedMm',
        message: msg,
        currentValue: `${bleedMm}mm`,
        limit: `${constraints.maxBleedMm}mm`,
        suggestedFix: fix,
      });
      suggestedFixes.add(fix);
      ruleResults.dimensions.passed = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Check 2: Placement & Coordinate Boundaries
  // ---------------------------------------------------------------------------
  const placement = config.placement || config.coordinates || null;
  const bounds = constraints.allowedPlacementBounds;

  if (placement && bounds) {
    const posX = Number(placement.x ?? placement.positionX ?? 0);
    const posY = Number(placement.y ?? placement.positionY ?? 0);
    const elementW = widthMm || Number(placement.widthMm ?? placement.width ?? 0);
    const elementH = heightMm || Number(placement.heightMm ?? placement.height ?? 0);

    const isOutOfBoundsLeft = posX < bounds.minX;
    const isOutOfBoundsTop = posY < bounds.minY;
    const isOutOfBoundsRight = (posX + elementW) > bounds.maxX;
    const isOutOfBoundsBottom = (posY + elementH) > bounds.maxY;

    if (isOutOfBoundsLeft || isOutOfBoundsTop || isOutOfBoundsRight || isOutOfBoundsBottom) {
      const edges = [];
      if (isOutOfBoundsLeft) edges.push('left boundary');
      if (isOutOfBoundsTop) edges.push('top collar/margin');
      if (isOutOfBoundsRight) edges.push('right side seam');
      if (isOutOfBoundsBottom) edges.push('bottom hem');

      const msg = `Design placement extends outside printable coordinates (exceeds ${edges.join(', ')}). Position: [X: ${posX}mm, Y: ${posY}mm], Box: [W: ${elementW}mm, H: ${elementH}mm], Printable Region: [X: ${bounds.minX}-${bounds.maxX}mm, Y: ${bounds.minY}-${bounds.maxY}mm].`;
      const fix = `Reposition your design toward the center of the print area so the entire bounding box remains within X: ${bounds.minX}–${bounds.maxX}mm and Y: ${bounds.minY}–${bounds.maxY}mm.`;

      violations.push({
        code: 'PLACEMENT_OUT_OF_BOUNDS',
        type: 'PLACEMENT_VIOLATION',
        field: 'placement',
        message: msg,
        currentValue: { x: posX, y: posY, widthMm: elementW, heightMm: elementH },
        limit: bounds,
        suggestedFix: fix,
      });
      suggestedFixes.add(fix);
      ruleResults.placement.passed = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Check 3: Material Availability & Restrictions
  // ---------------------------------------------------------------------------
  if (selectedMaterial) {
    // 3A. Explicitly Restricted Material
    if (constraints.restrictedMaterials.includes(selectedMaterial)) {
      const msg = `Selected material "${config.material || selectedMaterial}" is restricted or unavailable for manufacturing with this product.`;
      const fix = `Select one of the approved materials: ${constraints.availableMaterials.join(', ')}.`;
      violations.push({
        code: 'MATERIAL_RESTRICTED',
        type: 'MATERIAL_RESTRICTION',
        field: 'material',
        message: msg,
        currentValue: config.material || selectedMaterial,
        limit: constraints.availableMaterials,
        suggestedFix: fix,
      });
      suggestedFixes.add(fix);
      ruleResults.materials.passed = false;
    }
    // 3B. Not in Whitelist (if whitelist is populated)
    else if (
      constraints.availableMaterials.length > 0 &&
      !constraints.availableMaterials.includes(selectedMaterial)
    ) {
      const msg = `Material "${config.material || selectedMaterial}" is not supported for this product. Available options: ${constraints.availableMaterials.join(', ')}.`;
      const fix = `Choose an available material from: ${constraints.availableMaterials.join(', ')}.`;
      violations.push({
        code: 'MATERIAL_UNAVAILABLE',
        type: 'MATERIAL_RESTRICTION',
        field: 'material',
        message: msg,
        currentValue: config.material || selectedMaterial,
        limit: constraints.availableMaterials,
        suggestedFix: fix,
      });
      suggestedFixes.add(fix);
      ruleResults.materials.passed = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Check 4: Incompatible Options Combinations
  // ---------------------------------------------------------------------------
  const optionEntries = {
    ...normalizedOptions,
    ...(selectedMaterial ? { material: selectedMaterial } : {}),
    ...(selectedTechnique ? { technique: selectedTechnique, print_method: selectedTechnique } : {}),
  };

  for (const rule of constraints.incompatibleOptions) {
    if (!rule.optionA || !rule.optionB) continue;

    const optAName = normalize(rule.optionA.name);
    const optAVal = normalize(rule.optionA.value);
    const optBName = normalize(rule.optionB.name);
    const optBVal = normalize(rule.optionB.value);

    const clientValA = optionEntries[optAName];
    const clientValB = optionEntries[optBName];

    // Check if client configuration triggers both mutually exclusive options
    const matchesA = clientValA === optAVal || (optAVal === '*' && clientValA != null);
    const matchesB = clientValB === optBVal || (optBVal === '*' && clientValB != null);

    if (matchesA && matchesB) {
      const msg = rule.reason || `Incompatible combination: "${rule.optionA.name}: ${rule.optionA.value}" cannot be manufactured together with "${rule.optionB.name}: ${rule.optionB.value}".`;
      const fix = rule.suggestedFix || `Change either ${rule.optionA.name} or ${rule.optionB.name} to compatible alternatives.`;

      violations.push({
        code: 'INCOMPATIBLE_OPTION_COMBINATION',
        type: 'OPTION_INCOMPATIBILITY',
        field: `options.${rule.optionA.name}+options.${rule.optionB.name}`,
        message: msg,
        currentValue: {
          [rule.optionA.name]: clientValA,
          [rule.optionB.name]: clientValB,
        },
        suggestedFix: fix,
      });
      suggestedFixes.add(fix);
      ruleResults.optionCompatibility.passed = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Check 5: Restricted Material-Color & Finish Combinations
  // ---------------------------------------------------------------------------
  const productColor = normalize(config.productColor || config.color || normalizedOptions.color || '');
  const inkColor = normalize(config.inkColor || normalizedOptions.ink_color || '');
  const selectedFinish = normalize(config.finish || normalizedOptions.finish || '');

  for (const restriction of constraints.restrictedMaterialColors) {
    const targetMat = normalize(restriction.material);
    if (selectedMaterial !== targetMat) continue;

    // Disallowed Product / Ink Colors
    if (Array.isArray(restriction.disallowedColors)) {
      const disallowed = restriction.disallowedColors.map(normalize);
      if (disallowed.includes(productColor) || disallowed.includes(inkColor)) {
        const msg = restriction.reason || `Color "${productColor || inkColor}" cannot be manufactured on "${selectedMaterial}".`;
        const fix = restriction.suggestedFix || `Select a contrasting color for ${selectedMaterial}.`;

        violations.push({
          code: 'RESTRICTED_MATERIAL_COLOR',
          type: 'MATERIAL_COLOR_RESTRICTION',
          field: 'color',
          message: msg,
          currentValue: productColor || inkColor,
          suggestedFix: fix,
        });
        suggestedFixes.add(fix);
        ruleResults.materialColorRestrictions.passed = false;
      }
    }

    // Disallowed Finishes on this Material
    if (selectedFinish && Array.isArray(restriction.disallowedFinishes)) {
      const disallowedFinishes = restriction.disallowedFinishes.map(normalize);
      if (disallowedFinishes.includes(selectedFinish)) {
        const msg = restriction.reason || `Finish "${selectedFinish}" cannot adhere to "${selectedMaterial}".`;
        const fix = restriction.suggestedFix || `Choose a standard matte or semi-gloss finish.`;

        violations.push({
          code: 'RESTRICTED_MATERIAL_FINISH',
          type: 'MATERIAL_COLOR_RESTRICTION',
          field: 'finish',
          message: msg,
          currentValue: selectedFinish,
          suggestedFix: fix,
        });
        suggestedFixes.add(fix);
        ruleResults.materialColorRestrictions.passed = false;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Check 6: Print Technique Specific Manufacturing Rules
  // ---------------------------------------------------------------------------
  if (selectedTechnique) {
    const uppercaseMethod = selectedTechnique.toUpperCase();

    // Check if the method itself is supported for this product
    if (
      constraints.allowedPrintMethods.length > 0 &&
      !constraints.allowedPrintMethods.includes(selectedTechnique)
    ) {
      const msg = `Print method "${selectedTechnique}" is not supported for this product. Supported methods: ${constraints.allowedPrintMethods.join(', ')}.`;
      const fix = `Select one of the supported print techniques: ${constraints.allowedPrintMethods.join(', ')}.`;
      violations.push({
        code: 'PRINT_METHOD_UNSUPPORTED',
        type: 'MANUFACTURING_LIMIT',
        field: 'printMethod',
        message: msg,
        currentValue: selectedTechnique,
        limit: constraints.allowedPrintMethods,
        suggestedFix: fix,
      });
      suggestedFixes.add(fix);
      ruleResults.printMethod.passed = false;
    }

    // Technique-specific physical limits (e.g., Embroidery max area 150x150 mm)
    if (uppercaseMethod === 'EMBROIDERY' && constraints.methodConstraints?.EMBROIDERY) {
      const embConstraints = constraints.methodConstraints.EMBROIDERY;
      const maxEmbW = embConstraints.maxAreaWidthMm || 150.0;
      const maxEmbH = embConstraints.maxAreaHeightMm || 150.0;

      if (widthMm > maxEmbW || heightMm > maxEmbH) {
        const msg = `Embroidery hoop size limit exceeded. Selected size (${widthMm}mm × ${heightMm}mm) exceeds maximum embroidery bounds of ${maxEmbW}mm × ${maxEmbH}mm.`;
        const fix = `Reduce embroidery dimensions to ${maxEmbW}mm × ${maxEmbH}mm or change technique to Screen Printing or DTG.`;
        violations.push({
          code: 'EMBROIDERY_HOOP_LIMIT_EXCEEDED',
          type: 'MANUFACTURING_LIMIT',
          field: 'printDimensions',
          message: msg,
          currentValue: `${widthMm}x${heightMm}mm`,
          limit: `${maxEmbW}x${maxEmbH}mm`,
          suggestedFix: fix,
        });
        suggestedFixes.add(fix);
        ruleResults.printMethod.passed = false;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Non-blocking Manufacturing Warnings / Advisories
  // ---------------------------------------------------------------------------
  if (widthMm > constraints.maxPrintWidthMm * 0.95 && widthMm <= constraints.maxPrintWidthMm) {
    warnings.push({
      code: 'NEAR_MAX_WIDTH',
      message: `Design width (${widthMm}mm) is within 5% of the absolute physical printable edge (${constraints.maxPrintWidthMm}mm). Minor seam shifts might occur.`,
    });
  }

  const isFeasible = violations.length === 0;
  const status = isFeasible ? (warnings.length > 0 ? 'WARNED' : 'PASSED') : 'BLOCKED';
  const executionTimeMs = Number((Date.now() - startTime).toFixed(2));

  return {
    isFeasible,
    status,
    summary: isFeasible
      ? 'Customization configuration is production-feasible and meets all manufacturing constraints.'
      : `Configuration is unfeasible for manufacturing. Found ${violations.length} blocking violation(s) that must be resolved before checkout.`,
    violations,
    warnings,
    suggestedFixes: Array.from(suggestedFixes),
    ruleResults,
    executionTimeMs,
    appliedConstraints: {
      maxPrintWidthMm: constraints.maxPrintWidthMm,
      maxPrintHeightMm: constraints.maxPrintHeightMm,
      minPrintWidthMm: constraints.minPrintWidthMm,
      minPrintHeightMm: constraints.minPrintHeightMm,
      maxBleedMm: constraints.maxBleedMm,
      allowedPlacementBounds: constraints.allowedPlacementBounds,
      availableMaterials: constraints.availableMaterials,
      restrictedMaterials: constraints.restrictedMaterials,
      allowedPrintMethods: constraints.allowedPrintMethods,
    },
  };
};

export default {
  evaluateProductionFeasibility,
  normalizeOptionsMap,
  DEFAULT_MANUFACTURING_CONSTRAINTS,
};
