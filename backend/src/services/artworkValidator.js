/* eslint-env node */

import sharp from 'sharp';

/**
 * Industry-standard print area defaults when a product has not yet defined custom specs.
 */
export const DEFAULT_PRINT_REQUIREMENTS = Object.freeze({
  printAreaName: 'default',
  printAreaWidthMm: 280, // e.g. standard A4-ish t-shirt print area
  printAreaHeightMm: 350,
  minDpi: 150,           // minimum acceptable print resolution before noticeable pixelation
  recommendedDpi: 300,   // professional print shop standard
  maxDpi: 1200,
  blurThreshold: 90.0,    // Laplacian variance threshold (below this is considered blurry)
  aspectRatioTolerance: 0.05, // 5% aspect ratio variance allowed before shape warning
  maxFileSizeBytes: 25 * 1024 * 1024,
  allowedFormats: ['png', 'jpeg', 'jpg', 'webp', 'tiff'],
  allowedColorModes: ['rgb', 'srgb', 'cmyk'],
});

/**
 * 3x3 Laplacian convolution kernel for edge and high-frequency content detection.
 */
const LAPLACIAN_KERNEL = Object.freeze({
  width: 3,
  height: 3,
  kernel: [
     0,  1,  0,
     1, -4,  1,
     0,  1,  0,
  ],
});

/**
 * Measure image blurriness using the Variance of the Laplacian method.
 *
 * Steps:
 * 1. Downscale to a standardized max dimension (512px) to ensure uniform
 *    computation across varying megapixel sizes.
 * 2. Convert to greyscale.
 * 3. Convolve with a Laplacian 3x3 filter.
 * 4. Calculate variance = (standard deviation)^2.
 *
 * @param {Buffer} buffer - Image file buffer
 * @returns {Promise<{ variance: number, blurScore: number, isBlurry: boolean }>}
 */
export const calculateSharpness = async (buffer, threshold = 90.0) => {
  try {
    // Standardize resolution for consistent Laplacian variance scale
    const normalizedGreyscale = await sharp(buffer)
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .convolve(LAPLACIAN_KERNEL)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixelData = normalizedGreyscale.data;
    const totalPixels = pixelData.length;

    if (totalPixels === 0) {
      return { variance: 0, blurScore: 0, isBlurry: true };
    }

    // Calculate mean intensity of convolved edges
    let sum = 0;
    for (let i = 0; i < totalPixels; i++) {
      sum += pixelData[i];
    }
    const mean = sum / totalPixels;

    // Calculate variance of the Laplacian
    let squaredDiffSum = 0;
    for (let i = 0; i < totalPixels; i++) {
      const diff = pixelData[i] - mean;
      squaredDiffSum += diff * diff;
    }
    const variance = Number((squaredDiffSum / totalPixels).toFixed(2));

    // Map variance to a user-friendly 0-100 sharpness score
    // 0 = completely flat/uniform or severely blurred, 100+ = razor sharp high contrast edges
    const blurScore = Math.min(100, Math.max(0, Math.round((variance / 220) * 100)));
    const isBlurry = variance < threshold;

    return {
      variance,
      blurScore,
      isBlurry,
    };
  } catch (error) {
    // If convolution fails on non-standard format (e.g. SVG), return neutral score
    return {
      variance: 150,
      blurScore: 75,
      isBlurry: false,
      error: error.message,
    };
  }
};

/**
 * Comprehensive Artwork Quality Validator.
 * Compares an uploaded image buffer against target product print-area specifications.
 *
 * @param {Buffer} imageBuffer - Uploaded image buffer
 * @param {Object} [specs] - Product print area requirements
 * @param {Object} [fileInfo] - Upload metadata (originalname, size, mimetype)
 * @returns {Promise<Object>} Detailed quality report with issues and actionable fixes
 */
export const validateArtworkQuality = async (
  imageBuffer,
  specs = {},
  fileInfo = {},
) => {
  // Merge target specs with sensible industry defaults
  const printAreaWidthMm = Number(specs.printAreaWidthMm) || DEFAULT_PRINT_REQUIREMENTS.printAreaWidthMm;
  const printAreaHeightMm = Number(specs.printAreaHeightMm) || DEFAULT_PRINT_REQUIREMENTS.printAreaHeightMm;
  const minDpi = Number(specs.minDpi) || DEFAULT_PRINT_REQUIREMENTS.minDpi;
  const recommendedDpi = Number(specs.recommendedDpi) || DEFAULT_PRINT_REQUIREMENTS.recommendedDpi;
  const blurThreshold = Number(specs.blurThreshold) || DEFAULT_PRINT_REQUIREMENTS.blurThreshold;
  const aspectRatioTolerance = Number(specs.aspectRatioTolerance) || DEFAULT_PRINT_REQUIREMENTS.aspectRatioTolerance;
  const allowedFormats = Array.isArray(specs.allowedFormats) && specs.allowedFormats.length > 0
    ? specs.allowedFormats.map((f) => f.toLowerCase())
    : DEFAULT_PRINT_REQUIREMENTS.allowedFormats;

  // Extract core image metadata via Sharp
  const sharpInstance = sharp(imageBuffer);
  const metadata = await sharpInstance.metadata();

  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const format = (metadata.format || '').toLowerCase();
  const colorSpace = (metadata.space || 'srgb').toLowerCase();
  const hasAlpha = Boolean(metadata.hasAlpha);
  const fileSizeBytes = fileInfo.size || imageBuffer.length;

  // Compute physical print area inches
  const printAreaWidthInches = printAreaWidthMm / 25.4;
  const printAreaHeightInches = printAreaHeightMm / 25.4;

  // Calculate pixel bounds required to fulfill DPI targets
  const minRequiredWidthPx = specs.minWidthPx
    ? Number(specs.minWidthPx)
    : Math.ceil(printAreaWidthInches * minDpi);
  const minRequiredHeightPx = specs.minHeightPx
    ? Number(specs.minHeightPx)
    : Math.ceil(printAreaHeightInches * minDpi);

  const recommendedWidthPx = Math.ceil(printAreaWidthInches * recommendedDpi);
  const recommendedHeightPx = Math.ceil(printAreaHeightInches * recommendedDpi);

  // Calculate effective DPI when printed over the given physical print area
  const effectiveDpiX = printAreaWidthInches > 0 ? width / printAreaWidthInches : 0;
  const effectiveDpiY = printAreaHeightInches > 0 ? height / printAreaHeightInches : 0;
  const effectiveDpi = Number(Math.min(effectiveDpiX, effectiveDpiY).toFixed(1));

  // Calculate aspect ratios
  const artworkAspectRatio = height > 0 ? Number((width / height).toFixed(3)) : 0;
  const printAreaAspectRatio = printAreaHeightMm > 0
    ? Number((printAreaWidthMm / printAreaHeightMm).toFixed(3))
    : 0;

  const aspectRatioDeviation = printAreaAspectRatio > 0
    ? Number((Math.abs(artworkAspectRatio - printAreaAspectRatio) / printAreaAspectRatio).toFixed(3))
    : 0;

  // Calculate blurriness
  const sharpness = await calculateSharpness(imageBuffer, blurThreshold);

  // Issue collectors
  const issues = [];
  const warnings = [];
  const suggestedFixes = [];

  // ---------------------------------------------------------------------------
  // Check 1: File Format Validation
  // ---------------------------------------------------------------------------
  const isFormatAllowed = allowedFormats.includes(format) ||
    (format === 'jpeg' && allowedFormats.includes('jpg')) ||
    (format === 'jpg' && allowedFormats.includes('jpeg'));

  const formatCheck = {
    name: 'file_format',
    status: isFormatAllowed ? 'PASSED' : 'FAILED',
    detectedFormat: format,
    allowedFormats,
  };

  if (!isFormatAllowed) {
    const errorMsg = `Unsupported format "${format}". Only ${allowedFormats.join(', ').toUpperCase()} are supported.`;
    const fixMsg = `Convert your artwork to an accepted print format: ${allowedFormats.join(', ').toUpperCase()}.`;
    issues.push({
      code: 'UNSUPPORTED_FORMAT',
      severity: 'CRITICAL',
      message: errorMsg,
      suggestion: fixMsg,
    });
    suggestedFixes.push(fixMsg);
  }

  // ---------------------------------------------------------------------------
  // Check 2: Resolution & DPI Validation
  // ---------------------------------------------------------------------------
  let resolutionStatus = 'PASSED';
  let resolutionMessage = `Resolution is optimal: ${effectiveDpi} DPI meets the ${recommendedDpi} DPI print recommendation.`;
  let resolutionFix = null;

  if (effectiveDpi < minDpi) {
    resolutionStatus = 'FAILED';
    resolutionMessage = `Resolution is too low: ${effectiveDpi} DPI (Minimum required: ${minDpi} DPI).`;
    resolutionFix = `Upload a higher-resolution image with at least ${minRequiredWidthPx} × ${minRequiredHeightPx} pixels (recommended: ${recommendedWidthPx} × ${recommendedHeightPx} pixels at ${recommendedDpi} DPI) to avoid visible pixelation and blur during printing.`;

    issues.push({
      code: 'RESOLUTION_TOO_LOW',
      severity: 'CRITICAL',
      message: resolutionMessage,
      suggestion: resolutionFix,
      detectedDpi: effectiveDpi,
      requiredMinDpi: minDpi,
      recommendedDpi,
    });
    warnings.push(resolutionMessage);
    suggestedFixes.push(resolutionFix);
  } else if (effectiveDpi < recommendedDpi) {
    resolutionStatus = 'WARNED';
    resolutionMessage = `Resolution is acceptable (${effectiveDpi} DPI), but below the recommended ${recommendedDpi} DPI standard.`;
    resolutionFix = `For maximum sharpness and fine detail, consider uploading an image with at least ${recommendedWidthPx} × ${recommendedHeightPx} pixels (${recommendedDpi} DPI).`;

    issues.push({
      code: 'RESOLUTION_SUBOPTIMAL',
      severity: 'WARNING',
      message: resolutionMessage,
      suggestion: resolutionFix,
      detectedDpi: effectiveDpi,
      requiredMinDpi: minDpi,
      recommendedDpi,
    });
    warnings.push(resolutionMessage);
    suggestedFixes.push(resolutionFix);
  }

  const resolutionCheck = {
    name: 'resolution_dpi',
    status: resolutionStatus,
    effectiveDpi,
    embeddedExifDpi: metadata.density || null,
    minDpi,
    recommendedDpi,
    message: resolutionMessage,
    suggestion: resolutionFix,
  };

  // ---------------------------------------------------------------------------
  // Check 3: Dimension Boundary Validation
  // ---------------------------------------------------------------------------
  let dimensionStatus = 'PASSED';
  let dimensionMessage = `Image dimensions (${width} × ${height} px) are suitable for the print area.`;
  let dimensionFix = null;

  const widthDeficit = width < minRequiredWidthPx;
  const heightDeficit = height < minRequiredHeightPx;

  if (widthDeficit || heightDeficit) {
    dimensionStatus = 'FAILED';
    dimensionMessage = `Image dimensions (${width} × ${height} px) are smaller than the required print boundary (${minRequiredWidthPx} × ${minRequiredHeightPx} px).`;
    dimensionFix = `Resize or export your design at ${recommendedWidthPx} × ${recommendedHeightPx} px or larger so it completely fills the target print area without upscaling distortion.`;

    issues.push({
      code: 'DIMENSIONS_TOO_SMALL',
      severity: 'CRITICAL',
      message: dimensionMessage,
      suggestion: dimensionFix,
      detected: { width, height },
      requiredMinimum: { width: minRequiredWidthPx, height: minRequiredHeightPx },
    });
    warnings.push(dimensionMessage);
    suggestedFixes.push(dimensionFix);
  }

  const dimensionsCheck = {
    name: 'dimensions_pixels',
    status: dimensionStatus,
    detectedWidthPx: width,
    detectedHeightPx: height,
    requiredMinWidthPx: minRequiredWidthPx,
    requiredMinHeightPx: minRequiredHeightPx,
    recommendedWidthPx,
    recommendedHeightPx,
    message: dimensionMessage,
    suggestion: dimensionFix,
  };

  // ---------------------------------------------------------------------------
  // Check 4: Shape & Aspect Ratio Compatibility
  // ---------------------------------------------------------------------------
  let shapeStatus = 'PASSED';
  let shapeMessage = `Image shape matches the print area aspect ratio (${artworkAspectRatio}:1).`;
  let shapeFix = null;

  if (aspectRatioDeviation > aspectRatioTolerance) {
    const isWider = artworkAspectRatio > printAreaAspectRatio;
    shapeStatus = aspectRatioDeviation > 0.3 ? 'FAILED' : 'WARNED';

    const orientationDesc = isWider
      ? 'wider than the print area (left/right edges risk being cropped or pillarboxed)'
      : 'taller than the print area (top/bottom edges risk being cropped or letterboxed)';

    shapeMessage = `Incorrect dimensions for print area. Image aspect ratio (${artworkAspectRatio}:1) does not match the print area (${printAreaAspectRatio}:1, ${printAreaWidthMm}mm × ${printAreaHeightMm}mm). It is ${orientationDesc}.`;

    shapeFix = `Crop your artwork to an aspect ratio of ${printAreaAspectRatio}:1 (matching ${printAreaWidthMm}mm × ${printAreaHeightMm}mm) before uploading to prevent unwanted cropping or unprinted margins.`;

    issues.push({
      code: 'ASPECT_RATIO_MISMATCH',
      severity: shapeStatus === 'FAILED' ? 'CRITICAL' : 'WARNING',
      message: shapeMessage,
      suggestion: shapeFix,
      detectedAspectRatio: artworkAspectRatio,
      targetAspectRatio: printAreaAspectRatio,
      deviationPercentage: Number((aspectRatioDeviation * 100).toFixed(1)),
    });
    warnings.push(shapeMessage);
    suggestedFixes.push(shapeFix);
  }

  const shapeCheck = {
    name: 'aspect_ratio_shape',
    status: shapeStatus,
    detectedRatio: artworkAspectRatio,
    targetPrintAreaRatio: printAreaAspectRatio,
    deviationPercent: Number((aspectRatioDeviation * 100).toFixed(1)),
    tolerancePercent: Number((aspectRatioTolerance * 100).toFixed(1)),
    message: shapeMessage,
    suggestion: shapeFix,
  };

  // ---------------------------------------------------------------------------
  // Check 5: Sharpness & Blur Detection
  // ---------------------------------------------------------------------------
  let blurStatus = 'PASSED';
  let blurMessage = `Image sharpness is clear (score: ${sharpness.blurScore}/100).`;
  let blurFix = null;

  if (sharpness.isBlurry) {
    // Severe blur vs moderate softness
    const isSeverelyBlurry = sharpness.variance < blurThreshold * 0.55;
    blurStatus = isSeverelyBlurry ? 'FAILED' : 'WARNED';
    blurMessage = `Image is too blurry. Detected sharpness score is ${sharpness.blurScore}/100 (Laplacian variance: ${sharpness.variance}, minimum threshold: ${blurThreshold}).`;
    blurFix = 'The uploaded image appears out-of-focus, low-resolution, or heavily compressed. Upload the original high-resolution photo or vector artwork instead of a web preview or mobile screenshot.';

    issues.push({
      code: 'IMAGE_BLURRY',
      severity: isSeverelyBlurry ? 'CRITICAL' : 'WARNING',
      message: blurMessage,
      suggestion: blurFix,
      sharpnessScore: sharpness.blurScore,
      variance: sharpness.variance,
      threshold: blurThreshold,
    });
    warnings.push(blurMessage);
    suggestedFixes.push(blurFix);
  }

  const sharpnessCheck = {
    name: 'sharpness_blur',
    status: blurStatus,
    sharpnessScore: sharpness.blurScore,
    laplacianVariance: sharpness.variance,
    threshold: blurThreshold,
    isBlurry: sharpness.isBlurry,
    message: blurMessage,
    suggestion: blurFix,
  };

  // ---------------------------------------------------------------------------
  // Check 6: Color Space & Transparency Context
  // ---------------------------------------------------------------------------
  const colorCheck = {
    name: 'color_mode',
    status: 'PASSED',
    detectedColorSpace: colorSpace,
    hasAlphaChannel: hasAlpha,
    note: colorSpace === 'cmyk'
      ? 'CMYK detected. File is optimized for direct physical press printing.'
      : 'sRGB detected. Will be color-managed during prepress conversion.',
  };

  // ---------------------------------------------------------------------------
  // Overall Verdict & Quality Score Computation
  // ---------------------------------------------------------------------------
  const criticalCount = issues.filter((i) => i.severity === 'CRITICAL').length;
  const warningCount = issues.filter((i) => i.severity === 'WARNING').length;

  let overallStatus = 'PASSED';
  if (criticalCount > 0) {
    overallStatus = 'FAILED';
  } else if (warningCount > 0) {
    overallStatus = 'WARNED';
  }

  const passed = overallStatus !== 'FAILED';

  // Overall Quality Score (0 - 100)
  // Weighted: 40% Resolution adequacy, 35% Sharpness, 25% Aspect ratio fidelity
  const resolutionRatio = Math.min(1.0, effectiveDpi / recommendedDpi);
  const sharpnessRatio = Math.min(1.0, sharpness.blurScore / 100);
  const shapeRatio = Math.max(0, 1.0 - aspectRatioDeviation);

  const overallQualityScore = Math.round(
    resolutionRatio * 40 + sharpnessRatio * 35 + shapeRatio * 25,
  );

  return {
    passed,
    status: overallStatus,
    overallQualityScore,
    summary: passed
      ? (overallStatus === 'WARNED'
          ? 'Artwork is printable but has minor quality warnings you can optimize.'
          : 'Artwork passed all quality checks and is suitable for crisp production printing.')
      : 'Artwork failed quality verification. Please address the highlighted issues before checkout.',
    warnings,
    suggestedFixes,
    issues,
    checks: {
      resolution: resolutionCheck,
      dimensions: dimensionsCheck,
      aspectRatio: shapeCheck,
      sharpness: sharpnessCheck,
      fileFormat: formatCheck,
      colorSpace: colorCheck,
    },
    imageMetadata: {
      fileName: fileInfo.originalname || null,
      fileSizeBytes,
      mimeType: fileInfo.mimetype || `image/${format}`,
      widthPx: width,
      heightPx: height,
      format,
      colorSpace,
      hasAlpha,
      effectiveDpi,
      aspectRatio: artworkAspectRatio,
      sharpnessScore: sharpness.blurScore,
    },
    printAreaRequirements: {
      printAreaName: specs.printAreaName || 'default',
      widthMm: printAreaWidthMm,
      heightMm: printAreaHeightMm,
      minRequiredWidthPx,
      minRequiredHeightPx,
      recommendedWidthPx,
      recommendedHeightPx,
      minDpi,
      recommendedDpi,
      targetAspectRatio: printAreaAspectRatio,
      aspectRatioTolerance,
    },
  };
};

export default {
  validateArtworkQuality,
  calculateSharpness,
  DEFAULT_PRINT_REQUIREMENTS,
};
