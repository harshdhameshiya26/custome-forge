/* eslint-env node */

import sharp from 'sharp';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { logError, logWarn, logSuccess } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Production storage directory for generated print-ready files
const PRINTS_STORAGE_DIR = path.resolve(__dirname, '../../storage/prints');

// Ensure storage directory exists synchronously at startup
if (!fsSync.existsSync(PRINTS_STORAGE_DIR)) {
  fsSync.mkdirSync(PRINTS_STORAGE_DIR, { recursive: true });
}

/**
  * Standard constants for physical print conversion
  */
const MM_PER_INCH = 25.4;
const POINTS_PER_INCH = 72.0;

/**
  * Converts millimeters to pixels based on target DPI.
  * Formula: (mm / 25.4) * DPI
  *
  * @param {number} mm - Millimeters
  * @param {number} dpi - Dots per inch
  * @returns {number} Pixel count (rounded integer)
  */
export const mmToPixels = (mm, dpi = 300) => {
  return Math.max(1, Math.round(((Number(mm) || 1) / MM_PER_INCH) * dpi));
};

/**
  * Converts millimeters to PDF points (72 points = 1 inch).
  *
  * @param {number} mm - Millimeters
  * @returns {number} Points
  */
export const mmToPoints = (mm) => {
  return ((Number(mm) || 1) / MM_PER_INCH) * POINTS_PER_INCH;
};

/**
  * Escape text for safe embedding in SVG XML.
  */
const escapeXml = (unsafe) => {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

/**
  * Safely fetches a remote image URL or decodes a data URL into a Buffer.
  *
  * @param {string} source - Image URL, base64 data URL, or file path
  * @returns {Promise<Buffer|null>} Image buffer or null on failure
  */
export const fetchAssetBuffer = async (source) => {
  if (!source || typeof source !== 'string') return null;

  try {
    const trimmed = source.trim();

    // 1. Base64 Data URL (e.g. data:image/png;base64,...)
    if (trimmed.startsWith('data:image/')) {
      const commaIndex = trimmed.indexOf(',');
      if (commaIndex !== -1) {
        const base64Data = trimmed.slice(commaIndex + 1);
        return Buffer.from(base64Data, 'base64');
      }
    }

    // 2. HTTP/HTTPS Remote URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12-second fetch timeout

      try {
        const response = await fetch(trimmed, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'CustomForge-PrintGenerator/1.0',
            Accept: 'image/png,image/jpeg,image/webp,image/svg+xml,*/*',
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          logWarn(`⚠️ Failed to fetch remote print asset (${response.status} ${response.statusText}): ${trimmed}`);
          return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        logWarn(`⚠️ Fetch timeout or network error for print asset: ${fetchErr.message}`);
        return null;
      }
    }

    // 3. Local filesystem path
    if (fsSync.existsSync(trimmed)) {
      return await fs.readFile(trimmed);
    }
  } catch (err) {
    logError(`❌ Error processing image asset source: ${err.message}`);
  }

  return null;
};

/**
  * Generates an SVG string representing scalable vector text elements.
  *
  * @param {Object} textLayer - Text object from canvas JSON
  * @param {number} scaleX - Coordinate X scale multiplier
  * @param {number} scaleY - Coordinate Y scale multiplier
  * @param {number} canvasWidthPx - Total print canvas width in pixels
  * @param {number} canvasHeightPx - Total print canvas height in pixels
  * @returns {string} SVG markup
  */
export const renderTextToSvg = (textLayer, scaleX, scaleY, canvasWidthPx, canvasHeightPx) => {
  const text = textLayer.text || textLayer.content || '';
  if (!text) return null;

  const rawX = Number(textLayer.left ?? textLayer.x ?? 0);
  const rawY = Number(textLayer.top ?? textLayer.y ?? 0);
  const posX = Math.round(rawX * scaleX);
  const posY = Math.round(rawY * scaleY);

  const rawFontSize = Number(textLayer.fontSize || 24);
  const fontSize = Math.round(rawFontSize * Math.min(scaleX, scaleY));

  const fontFamily = textLayer.fontFamily || 'Arial, Helvetica, sans-serif';
  const fill = textLayer.fill || textLayer.color || '#000000';
  const fontWeight = textLayer.fontWeight || (textLayer.bold ? 'bold' : 'normal');
  const fontStyle = textLayer.fontStyle || (textLayer.italic ? 'italic' : 'normal');
  const textAnchor = textLayer.textAlign === 'center' ? 'middle' : textLayer.textAlign === 'right' ? 'end' : 'start';

  // Support multi-line text by splitting on newlines
  const lines = text.split('\n');
  const lineHeight = fontSize * (Number(textLayer.lineHeight) || 1.2);

  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? fontSize : lineHeight;
      return `<tspan x="${posX}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join('');

  return `
    <svg width="${canvasWidthPx}" height="${canvasHeightPx}" viewBox="0 0 ${canvasWidthPx} ${canvasHeightPx}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${posX}"
        y="${posY}"
        font-family="${escapeXml(fontFamily)}"
        font-size="${fontSize}px"
        font-weight="${fontWeight}"
        font-style="${fontStyle}"
        fill="${escapeXml(fill)}"
        text-anchor="${textAnchor}"
      >${tspans}</text>
    </svg>
  `.trim();
};

/**
  * Generates an SVG string for geometric vector shapes (rectangles, circles, ellipses, paths).
  */
export const renderShapeToSvg = (shapeLayer, scaleX, scaleY, canvasWidthPx, canvasHeightPx) => {
  const type = String(shapeLayer.type || '').toLowerCase();
  const fill = shapeLayer.fill || 'transparent';
  const stroke = shapeLayer.stroke || 'none';
  const rawStrokeWidth = Number(shapeLayer.strokeWidth || 0);
  const strokeWidth = Math.round(rawStrokeWidth * Math.min(scaleX, scaleY));

  const posX = Math.round(Number(shapeLayer.left ?? shapeLayer.x ?? 0) * scaleX);
  const posY = Math.round(Number(shapeLayer.top ?? shapeLayer.y ?? 0) * scaleY);
  const width = Math.round(Number(shapeLayer.width || 0) * (shapeLayer.scaleX || 1) * scaleX);
  const height = Math.round(Number(shapeLayer.height || 0) * (shapeLayer.scaleY || 1) * scaleY);

  let shapeElement = '';

  if (type === 'rect' || type === 'rectangle') {
    const rx = Math.round((Number(shapeLayer.rx || 0)) * scaleX);
    shapeElement = `<rect x="${posX}" y="${posY}" width="${width}" height="${height}" rx="${rx}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" />`;
  } else if (type === 'circle') {
    const radius = Math.round((Number(shapeLayer.radius || width / 2 || 20)) * scaleX);
    const cx = posX + radius;
    const cy = posY + radius;
    shapeElement = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" />`;
  } else if (type === 'path' && shapeLayer.path) {
    const d = Array.isArray(shapeLayer.path)
      ? shapeLayer.path.map((item) => (Array.isArray(item) ? item.join(' ') : String(item))).join(' ')
      : String(shapeLayer.path);
    shapeElement = `<g transform="translate(${posX}, ${posY}) scale(${scaleX}, ${scaleY})"><path d="${escapeXml(d)}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${rawStrokeWidth}" /></g>`;
  } else {
    return null;
  }

  return `
    <svg width="${canvasWidthPx}" height="${canvasHeightPx}" viewBox="0 0 ${canvasWidthPx} ${canvasHeightPx}" xmlns="http://www.w3.org/2000/svg">
      ${shapeElement}
    </svg>
  `.trim();
};

/**
  * Builds a clean, standard PDF 1.4 binary file wrapping an uncompressed or JPEG/Flate
  * stream with precise physical millimeter dimensions.
  *
  * @param {Buffer} imagePngBuffer - Rendered high-res PNG image buffer
  * @param {number} widthMm - Physical width in millimeters
  * @param {number} heightMm - Physical height in millimeters
  * @param {number} pixelWidth - Pixel width
  * @param {number} pixelHeight - Pixel height
  * @returns {Promise<Buffer>} PDF binary buffer
  */
export const buildPrintPdf = async (imagePngBuffer, widthMm, heightMm, pixelWidth, pixelHeight) => {
  // Convert PNG to high-quality JPEG stream for compact, ultra-compatible standard PDF embedding
  const jpegBuffer = await sharp(imagePngBuffer)
    .jpeg({ quality: 98, chromaSubsampling: '4:4:4' })
    .toBuffer();

  const ptWidth = Number(mmToPoints(widthMm).toFixed(2));
  const ptHeight = Number(mmToPoints(heightMm).toFixed(2));

  // Construct PDF objects
  const objects = [];
  const addObj = (str) => {
    objects.push(Buffer.isBuffer(str) ? str : Buffer.from(str, 'binary'));
    return objects.length;
  };

  // Obj 1: Catalog
  addObj(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);

  // Obj 2: Pages tree
  addObj(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`);

  // Obj 3: Page with exact MediaBox in points
  addObj(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptWidth} ${ptHeight}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );

  // Obj 4: Image XObject (JPEG DCTDecode)
  const imgHeader = Buffer.from(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBuffer.length} >>\nstream\n`,
    'binary',
  );
  const imgFooter = Buffer.from(`\nendstream\nendobj\n`, 'binary');
  objects.push(Buffer.concat([imgHeader, jpegBuffer, imgFooter]));

  // Obj 5: Page Content stream scaling the image to full page MediaBox
  const contentStream = `q\n${ptWidth} 0 0 ${ptHeight} 0 0 cm\n/Im1 Do\nQ\n`;
  addObj(
    `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`,
  );

  // Assemble xref table and trailer
  let offset = 9; // strlen("%PDF-1.4\n")
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset);
    offset += objects[i].length;
  }

  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;

  return Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'binary'),
    ...objects,
    Buffer.from(xref + trailer, 'binary'),
  ]);
};

/**
  * Core print generation engine.
  *
  * Accepts design canvas JSON, scales all layers/vectors accurately to physical manufacturing
  * dimensions and DPI (e.g. 300 DPI), and produces a production file.
  *
  * @param {Object} params
  * @param {Object} params.canvasState - Canvas JSON state (Fabric.js, Konva, or layer list)
  * @param {number} [params.widthMm=280] - Physical print area width in millimeters
  * @param {number} [params.heightMm=350] - Physical print area height in millimeters
  * @param {number} [params.dpi=300] - Production resolution in DPI (standard: 300 DPI)
  * @param {number} [params.bleedMm=0] - Bleed margin in millimeters
  * @param {string} [params.format='HIGH_RES_PNG'] - Output format ('HIGH_RES_PNG', 'PDF', 'TIFF')
  * @param {string} [params.colorProfile='sRGB'] - Target color profile
  * @param {string} [params.orderId] - Associated Order ID
  * @param {string} [params.designId] - Associated Design ID
  * @param {string} [params.requestHost] - Host header for generating download URL
  * @param {string} [params.protocol='http'] - Protocol ('http' or 'https')
  * @returns {Promise<Object>} Generated print file asset details
  */
export const generatePrintReadyFile = async ({
  canvasState,
  widthMm = 280,
  heightMm = 350,
  dpi = 300,
  bleedMm = 0,
  format = 'HIGH_RES_PNG',
  colorProfile = 'sRGB',
  orderId = 'unassigned',
  designId = 'unassigned',
  requestHost = 'localhost:5000',
  protocol = 'http',
}) => {
  const safeDpi = Math.min(2400, Math.max(72, Number(dpi) || 300));
  const safeWidthMm = Math.max(10, Number(widthMm) || 280);
  const safeHeightMm = Math.max(10, Number(heightMm) || 350);
  const safeBleedMm = Math.max(0, Number(bleedMm) || 0);

  // Total manufacturing dimensions including bleed margins
  const totalWidthMm = safeWidthMm + safeBleedMm * 2;
  const totalHeightMm = safeHeightMm + safeBleedMm * 2;

  // Calculate target pixel dimensions at specified 300 DPI
  const pixelWidth = mmToPixels(totalWidthMm, safeDpi);
  const pixelHeight = mmToPixels(totalHeightMm, safeDpi);

  logSuccess(
    `🖨️ [PrintGenerator] Starting render: ${safeWidthMm}x${safeHeightMm}mm (bleed: ${safeBleedMm}mm) -> ${pixelWidth}x${pixelHeight}px @ ${safeDpi} DPI (${format})`,
  );

  // Determine source canvas bounds to calculate precise scale ratios
  const sourceWidth = Number(
    canvasState?.width ||
      canvasState?.canvasWidth ||
      canvasState?.stage?.width ||
      800,
  );
  const sourceHeight = Number(
    canvasState?.height ||
      canvasState?.canvasHeight ||
      canvasState?.stage?.height ||
      1000,
  );

  // Scale factor: maps storefront screen coordinates to high-res production canvas
  const scaleX = pixelWidth / sourceWidth;
  const scaleY = pixelHeight / sourceHeight;

  // Sharp composite overlays array
  const compositeOverlays = [];

  // 1. Check background fill color
  const bgColor =
    canvasState?.backgroundColor ||
    canvasState?.background ||
    canvasState?.canvasBackground ||
    null;

  let baseSharp;
  if (bgColor && typeof bgColor === 'string' && bgColor !== 'transparent') {
    baseSharp = sharp({
      create: {
        width: pixelWidth,
        height: pixelHeight,
        channels: 4,
        background: bgColor,
      },
    });
  } else {
    // Default transparent background for print masks and DTG apparel
    baseSharp = sharp({
      create: {
        width: pixelWidth,
        height: pixelHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    });
  }

  // 2. Extract layers / elements from canvas JSON
  const rawObjects =
    canvasState?.objects ||
    canvasState?.layers ||
    canvasState?.elements ||
    canvasState?.stage?.children ||
    [];

  const objectsList = Array.isArray(rawObjects) ? rawObjects : [];

  // Track layer processing stats for production report
  const layerProcessingAudit = {
    totalLayers: objectsList.length,
    imagesProcessed: 0,
    textProcessed: 0,
    shapesProcessed: 0,
    failedAssets: [],
  };

  for (let i = 0; i < objectsList.length; i++) {
    const layer = objectsList[i];
    if (!layer || typeof layer !== 'object') continue;

    const layerType = String(layer.type || layer.kind || '').toLowerCase();

    // A. Image / Bitmap layer
    if (
      layerType === 'image' ||
      layerType === 'bitmap' ||
      layer.src ||
      layer.url ||
      layer.imageData
    ) {
      const assetSource = layer.src || layer.url || layer.imageData;
      const imageBuffer = await fetchAssetBuffer(assetSource);

      if (imageBuffer) {
        try {
          const rawW = Number(layer.width || 100) * (Number(layer.scaleX) || 1);
          const rawH = Number(layer.height || 100) * (Number(layer.scaleY) || 1);
          const targetW = Math.max(1, Math.round(rawW * scaleX));
          const targetH = Math.max(1, Math.round(rawH * scaleY));

          const rawLeft = Number(layer.left ?? layer.x ?? 0);
          const rawTop = Number(layer.top ?? layer.y ?? 0);
          const targetLeft = Math.round(rawLeft * scaleX);
          const targetTop = Math.round(rawTop * scaleY);

          // Apply rotation if present
          let imgPipeline = sharp(imageBuffer);
          const angle = Number(layer.angle || layer.rotation || 0);
          if (angle !== 0) {
            imgPipeline = imgPipeline.rotate(angle, {
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            });
          }

          // High-quality Lanczos3 resampling for crisp prints
          const resizedBuffer = await imgPipeline
            .resize(targetW, targetH, {
              fit: 'fill',
              kernel: sharp.kernel.lanczos3,
            })
            .png()
            .toBuffer();

          compositeOverlays.push({
            input: resizedBuffer,
            left: Math.max(0, targetLeft),
            top: Math.max(0, targetTop),
            blend: 'over',
          });

          layerProcessingAudit.imagesProcessed++;
        } catch (imgProcErr) {
          logWarn(`⚠️ Failed resizing image layer ${i}: ${imgProcErr.message}`);
          layerProcessingAudit.failedAssets.push({
            layerIndex: i,
            type: 'image',
            error: imgProcErr.message,
          });
        }
      } else {
        layerProcessingAudit.failedAssets.push({
          layerIndex: i,
          type: 'image',
          error: 'Asset buffer could not be fetched or decoded',
        });
      }
    }

    // B. Text / Typography layer
    else if (layerType === 'text' || layerType === 'i-text' || layerType === 'textbox' || layer.text) {
      try {
        const svgTextMarkup = renderTextToSvg(layer, scaleX, scaleY, pixelWidth, pixelHeight);
        if (svgTextMarkup) {
          compositeOverlays.push({
            input: Buffer.from(svgTextMarkup, 'utf8'),
            left: 0,
            top: 0,
            blend: 'over',
          });
          layerProcessingAudit.textProcessed++;
        }
      } catch (textErr) {
        logWarn(`⚠️ Failed rendering text layer ${i}: ${textErr.message}`);
        layerProcessingAudit.failedAssets.push({
          layerIndex: i,
          type: 'text',
          error: textErr.message,
        });
      }
    }

    // C. Vector / Geometric Shape layer
    else if (
      layerType === 'rect' ||
      layerType === 'circle' ||
      layerType === 'path' ||
      layerType === 'shape'
    ) {
      try {
        const svgShapeMarkup = renderShapeToSvg(layer, scaleX, scaleY, pixelWidth, pixelHeight);
        if (svgShapeMarkup) {
          compositeOverlays.push({
            input: Buffer.from(svgShapeMarkup, 'utf8'),
            left: 0,
            top: 0,
            blend: 'over',
          });
          layerProcessingAudit.shapesProcessed++;
        }
      } catch (shapeErr) {
        logWarn(`⚠️ Failed rendering shape layer ${i}: ${shapeErr.message}`);
        layerProcessingAudit.failedAssets.push({
          layerIndex: i,
          type: 'shape',
          error: shapeErr.message,
        });
      }
    }
  }

  // Fallback: If no individual objects were found but canvasState has a base snapshot
  // (e.g. previewUrl, thumbnailUrl, fullDataUrl, or image)
  if (compositeOverlays.length === 0) {
    const fallbackSource =
      canvasState?.dataUrl ||
      canvasState?.previewUrl ||
      canvasState?.thumbnailUrl ||
      canvasState?.image ||
      canvasState?.rawImage;

    if (fallbackSource) {
      const fallbackBuffer = await fetchAssetBuffer(fallbackSource);
      if (fallbackBuffer) {
        try {
          const upsampled = await sharp(fallbackBuffer)
            .resize(pixelWidth, pixelHeight, {
              fit: 'fill',
              kernel: sharp.kernel.lanczos3,
            })
            .png()
            .toBuffer();

          compositeOverlays.push({
            input: upsampled,
            left: 0,
            top: 0,
            blend: 'over',
          });
          layerProcessingAudit.imagesProcessed++;
        } catch (fbErr) {
          logWarn(`⚠️ Could not upsample fallback snapshot: ${fbErr.message}`);
        }
      }
    }
  }

  // 3. Composite all prepared overlays onto the base canvas
  let compositeInstance = baseSharp;
  if (compositeOverlays.length > 0) {
    compositeInstance = compositeInstance.composite(compositeOverlays);
  }

  // 4. Render high-resolution PNG buffer with 300 DPI metadata density
  const finalPngBuffer = await compositeInstance
    .withMetadata({ density: safeDpi })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  // 5. Output format formatting (HIGH_RES_PNG, PDF, or TIFF)
  let outputBuffer = finalPngBuffer;
  let fileExtension = 'png';
  let mimeType = 'image/png';
  const normalizedFormat = String(format || 'HIGH_RES_PNG').toUpperCase();

  if (normalizedFormat === 'PDF') {
    outputBuffer = await buildPrintPdf(
      finalPngBuffer,
      totalWidthMm,
      totalHeightMm,
      pixelWidth,
      pixelHeight,
    );
    fileExtension = 'pdf';
    mimeType = 'application/pdf';
  } else if (normalizedFormat === 'TIFF') {
    outputBuffer = await sharp(finalPngBuffer)
      .tiff({
        compression: 'lzw',
        xres: safeDpi / MM_PER_INCH,
        yres: safeDpi / MM_PER_INCH,
        resolutionUnit: 'cm',
      })
      .toBuffer();
    fileExtension = 'tiff';
    mimeType = 'image/tiff';
  }

  // 6. Generate file identification and persistence
  const fileId = crypto.randomUUID();
  const secureDownloadToken = crypto.randomBytes(32).toString('hex');
  const timestamp = Date.now();
  const fileName = `print_${orderId}_${fileId.slice(0, 8)}_${timestamp}.${fileExtension}`;
  const filePath = path.join(PRINTS_STORAGE_DIR, fileName);

  // Write high-res production asset to storage
  await fs.writeFile(filePath, outputBuffer);

  const fileSizeBytes = outputBuffer.length;
  const checksumSha256 = crypto.createHash('sha256').update(outputBuffer).digest('hex');

  // Build clean download and asset URLs
  const fileUrl = `${protocol}://${requestHost}/api/print/download/${fileId}?token=${secureDownloadToken}`;
  const secureDownloadUrl = fileUrl;

  logSuccess(
    `✅ [PrintGenerator] Generated ${fileName} (${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB, SHA-256: ${checksumSha256.slice(0, 12)}...)`,
  );

  return {
    fileId,
    fileName,
    filePath,
    fileUrl,
    secureDownloadToken,
    secureDownloadUrl,
    format: normalizedFormat,
    mimeType,
    status: 'COMPLETED',
    dimensions: {
      widthMm: safeWidthMm,
      heightMm: safeHeightMm,
      totalWidthMm,
      totalHeightMm,
      dpi: safeDpi,
      bleedMm: safeBleedMm,
      pixelWidth,
      pixelHeight,
    },
    colorProfile,
    fileSizeBytes,
    checksumSha256,
    audit: layerProcessingAudit,
    completedAt: new Date(),
  };
};

export default {
  generatePrintReadyFile,
  mmToPixels,
  mmToPoints,
  fetchAssetBuffer,
  renderTextToSvg,
  renderShapeToSvg,
  buildPrintPdf,
};
