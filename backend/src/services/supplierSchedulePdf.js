/* eslint-env node */

import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { formatScheduleDateTime } from '../utils/schedule-date-time.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 8_000;
const IMAGE_HOST_ALLOWED = (hostname) =>
  hostname === 'cdn.shopify.com' || hostname.endsWith('.shopify.com');

const asDisplayText = (value) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '[Unable to display value]';
  }
};

const normalizeImageUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !IMAGE_HOST_ALLOWED(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
};

const loadImage = async (imageUrl) => {
  const url = normalizeImageUrl(imageUrl);
  if (!url) return null;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      redirect: 'error',
    });
    if (!response.ok || !response.body) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!/^image\/(jpeg|png|webp|avif)(;|$)/i.test(contentType)) return null;

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) return null;

    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (done) break;
      const { value } = result;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }

    return await sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch {
    return null;
  }
};

const writeField = (doc, label, value) => {
  const text = asDisplayText(value);
  if (!text) return;

  doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
  doc.font('Helvetica').text(text, { lineGap: 2 });
};

const writeImage = async (doc, url, label, x, y) => {
  const image = await loadImage(url);
  if (!image) return false;

  doc.font('Helvetica-Bold').fontSize(9).text(label, x, y, { width: 230 });
  const imageY = y + 14;
  doc.image(image, x, imageY, { fit: [225, 180], align: 'center', valign: 'center' });
  return true;
};

const collectPdf = (doc) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.once('error', reject);
    doc.once('end', () => resolve(Buffer.concat(chunks)));
  });

export const generateSupplierSchedulePdf = async ({ schedule, items }) => {
  const productCount = Array.isArray(items)
    ? items.reduce((count, item) => count + Math.max(1, Number(item.quantity) || 1), 0)
    : 0;
  if (!schedule || productCount < 3) {
    const error = new Error('A PDF schedule must contain at least 3 customized products.');
    error.statusCode = 422;
    throw error;
  }
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 46, right: 46, bottom: 46, left: 46 },
    info: {
      Title: `CustomForge Production Schedule ${schedule.scheduleId}`,
      Author: 'CustomForge',
      Subject: 'Supplier production schedule',
    },
  });
  const pdfBufferPromise = collectPdf(doc);

  doc.font('Helvetica-Bold').fontSize(20).fillColor('#202223').text('Production schedule');
  doc.moveDown(0.75);
  doc.fontSize(10);
  writeField(doc, 'Schedule', schedule.scheduleId);
  writeField(doc, 'Supplier', schedule.supplierName);
  writeField(doc, 'Category', schedule.category);
  writeField(
    doc,
    'Scheduled for',
    formatScheduleDateTime(schedule.scheduledAt, schedule.metadata?.timeZone),
  );
  writeField(doc, 'Customized products', items.reduce((count, item) => count + (Number(item.quantity) || 1), 0));
  writeField(doc, 'Schedule notes', schedule.notes);
  doc.moveDown();

  for (const [index, item] of items.entries()) {
    if (index > 0) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#202223')
      .text(`${index + 1}. ${asDisplayText(item.productName) || 'Customized product'}`);
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10).fillColor('#202223');
    writeField(doc, 'Quantity', item.quantity || 1);
    writeField(doc, 'Variant', item.variant);
    writeField(doc, 'Customer notes', item.customerNotes);
    writeField(doc, 'Dimensions', item.dimensions);
    writeField(doc, 'Customization parameters', item.customizationParameters);
    writeField(doc, 'Order', item.orderNumber);
    doc.moveDown(0.5);

    if (doc.y > 560) doc.addPage();
    const imageTop = doc.y;
    const productImageAdded = await writeImage(doc, item.productImageUrl, 'Product photo', 46, imageTop);
    const artworkImageAdded = await writeImage(
      doc,
      item.artworkUrl,
      'Customization preview',
      productImageAdded ? 305 : 46,
      imageTop,
    );
    if (!productImageAdded && !artworkImageAdded) {
      const error = new Error(
        `A supported Shopify-hosted product photo or customization preview is required for schedule item ${index + 1}.`,
      );
      error.statusCode = 422;
      doc.end();
      await pdfBufferPromise;
      throw error;
    }
    doc.y = imageTop + 200;
  }

  doc.end();
  return pdfBufferPromise;
};

export default generateSupplierSchedulePdf;
