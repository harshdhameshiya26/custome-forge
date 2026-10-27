const CANVAS_SIZE = 1024;
const PREVIEW_HEIGHT = 320;
const PRINT_ZONES = {
  tshirt: { top: 0.26, left: 0.26, width: 0.48, height: 0.42 },
  hoodie: { top: 0.3, left: 0.28, width: 0.44, height: 0.34 },
  mug: { top: 0.25, left: 0.2, width: 0.4, height: 0.48 },
  phone_case: { top: 0.34, left: 0.24, width: 0.52, height: 0.52 },
};

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load the product mockup or design artwork.'));
    image.crossOrigin = 'anonymous';
    image.src = source;
  });
}

function drawContainedImage(context, image, x, y, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * ratio;
  const height = image.height * ratio;
  context.drawImage(image, x - width / 2, y - height / 2, width, height);
}

function drawDefaultGraphic(context, x, y, scale, color, templateName = '') {
  const unit = scale / 100;
  context.save();
  context.translate(x, y);
  context.scale(unit, unit);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 5;
  context.lineCap = 'round';

  const template = String(templateName).toLowerCase();
  if (template.includes('mountain') || template.includes('adventure')) {
    context.beginPath();
    context.moveTo(-70, 40);
    context.lineTo(-20, -40);
    context.lineTo(10, 5);
    context.lineTo(35, -25);
    context.lineTo(75, 40);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(-20, -40);
    context.lineTo(-2, -10);
    context.lineTo(-15, -15);
    context.lineTo(-25, -2);
    context.closePath();
    context.fill();
  } else if (template.includes('love') || template.includes('heart')) {
    context.beginPath();
    context.moveTo(0, 55);
    context.bezierCurveTo(-85, 0, -55, -55, 0, -20);
    context.bezierCurveTo(55, -55, 85, 0, 0, 55);
    context.closePath();
    context.fill();
  } else if (template.includes('skull')) {
    context.beginPath();
    context.arc(0, -12, 38, Math.PI, 0);
    context.lineTo(34, 23);
    context.lineTo(23, 40);
    context.lineTo(-23, 40);
    context.lineTo(-34, 23);
    context.closePath();
    context.stroke();
    context.fillRect(-23, -8, 14, 14);
    context.fillRect(9, -8, 14, 14);
    context.fillRect(-12, 27, 24, 13);
  } else if (template.includes('christmas')) {
    context.beginPath();
    context.moveTo(0, -52);
    context.lineTo(-42, 3);
    context.lineTo(-20, 3);
    context.lineTo(-52, 42);
    context.lineTo(52, 42);
    context.lineTo(20, 3);
    context.lineTo(42, 3);
    context.closePath();
    context.stroke();
    context.fillRect(-6, 42, 12, 22);
  } else if (template.includes('pet')) {
    context.beginPath();
    context.arc(0, 20, 24, 0, Math.PI * 2);
    context.fill();
    for (const [pawX, pawY] of [[-27, -18], [-9, -35], [12, -35], [30, -18]]) {
      context.beginPath();
      context.arc(pawX, pawY, 10, 0, Math.PI * 2);
      context.fill();
    }
  } else if (template.includes('minimal') || template.includes('logo')) {
    context.beginPath();
    context.moveTo(0, -48);
    context.lineTo(48, 40);
    context.lineTo(-48, 40);
    context.closePath();
    context.stroke();
  } else {
  context.beginPath();
  context.arc(0, -18, 34, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(0, -18, 21, 0, Math.PI * 2);
  context.fill();

  for (const [startX, startY, endX, endY] of [
    [0, -63, 0, -76],
    [-45, -49, -55, -59],
    [45, -49, 55, -59],
    [-55, -18, -68, -18],
    [55, -18, 68, -18],
  ]) {
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();
  }

  context.lineWidth = 4;
  for (const offset of [22, 36]) {
    context.beginPath();
    context.moveTo(-68, offset);
    context.bezierCurveTo(-40, offset - 17, -25, offset + 15, 0, offset);
    context.bezierCurveTo(25, offset - 15, 40, offset + 17, 68, offset);
    context.stroke();
  }
  }
  context.restore();
}

function drawCurvedText(context, text, maxWidth, fontSize) {
  const characters = Array.from(text);
  const widths = characters.map((character) => context.measureText(character).width);
  const textWidth = widths.reduce((total, width) => total + width, 0);
  if (!textWidth) return;

  const horizontalScale = Math.min(1, maxWidth / textWidth);
  const scaledWidth = textWidth * horizontalScale;
  let cursor = -scaledWidth / 2;
  context.save();
  context.scale(horizontalScale, 1);
  context.textAlign = 'center';

  characters.forEach((character, index) => {
    const width = widths[index];
    const x = cursor + (width * horizontalScale) / 2;
    const halfWidth = Math.max(scaledWidth / 2, 1);
    const y = ((x / halfWidth) ** 2) * fontSize * 1.1;
    const slope = (2 * x * fontSize * 1.1) / (halfWidth ** 2);
    context.save();
    context.translate(x / horizontalScale, y);
    context.rotate(Math.atan(slope));
    context.fillText(character, 0, 0);
    context.restore();
    cursor += width * horizontalScale;
  });
  context.restore();
}

function drawText(context, text, options, zone, ratio) {
  if (!text.trim()) return;

  const alignmentOffset = options.alignment === 'left'
    ? 0
    : options.alignment === 'right'
      ? zone.width
      : zone.width / 2;
  const x = zone.left + alignmentOffset + options.textX * ratio;
  const y = zone.top + zone.height / 2 + options.textY * ratio;
  const size = (14 * (options.textScale / 100) + 2) * ratio;
  const weight = options.isBold ? '700' : '500';
  const style = options.isItalic ? 'italic ' : '';
  const font = `${style}${weight} ${size}px "${options.selectedFont}", sans-serif`;
  const maxWidth = zone.width * 0.96;
  const lines = [];

  context.save();
  context.translate(x, y);
  context.rotate((options.textRotation * Math.PI) / 180);
  context.font = font;
  context.textBaseline = 'middle';
  context.textAlign = options.selectedEffect === 'curve' ? 'center' : options.alignment;
  context.fillStyle = options.textColor;
  if (options.selectedEffect === 'shadow') {
    context.shadowColor = 'rgba(0, 0, 0, 0.4)';
    context.shadowBlur = 6 * ratio;
    context.shadowOffsetY = 3 * ratio;
  }

  if (options.selectedEffect === 'curve') {
    drawCurvedText(context, text.trim(), maxWidth, size);
  } else {
    const words = text.trim().split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }

  const lineHeight = size * 1.2;
  const startY = -((lines.length - 1) * lineHeight) / 2;
  lines.forEach((lineText, index) => {
    const lineY = startY + index * lineHeight;
    if (options.selectedEffect === 'outline') {
      context.lineWidth = Math.max(1, ratio * 1.2);
      context.strokeStyle = options.textColor === '#ffffff' ? '#111827' : '#ffffff';
      context.strokeText(lineText, 0, lineY, maxWidth);
    }
    context.fillText(lineText, 0, lineY, maxWidth);
    if (options.isUnderline) {
      const metrics = context.measureText(lineText);
      const textWidth = Math.min(metrics.width, maxWidth);
      const startX = options.alignment === 'left'
        ? 0
        : options.alignment === 'right'
          ? -textWidth
          : -textWidth / 2;
      context.beginPath();
      context.moveTo(startX, lineY + size * 0.55);
      context.lineTo(startX + textWidth, lineY + size * 0.55);
      context.lineWidth = Math.max(1, ratio);
      context.strokeStyle = options.textColor;
      context.stroke();
    }
  });
  context.restore();
}

export async function createProductArtwork({
  mockupUrl,
  productId,
  printArea,
  uploadedImageUrl,
  uploadedFileName,
  customText,
  selectedFont,
  textColor,
  isBold,
  isItalic,
  isUnderline,
  alignment,
  selectedEffect,
  textScale,
  textX,
  textY,
  textRotation,
  imageScale,
  imageX,
  imageY,
  imageRotation,
  additionalTextLayers = [],
  additionalGraphicLayers = [],
  productColor,
}) {
  if (!mockupUrl) throw new Error('The selected product mockup is unavailable.');

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare the product image.');

  if (document.fonts?.ready) await document.fonts.ready;
  const mockup = await loadImage(mockupUrl);
  context.drawImage(mockup, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const tintColors = {
    tshirt: ['#1e3a8a', '#991b1b'],
    hoodie: ['#18181b', '#15803d'],
    mug: ['#0284c7'],
    phone_case: ['#d97706'],
  };
  if (tintColors[productId]?.includes(productColor)) {
    const tint = context.createRadialGradient(
      CANVAS_SIZE / 2,
      CANVAS_SIZE / 2,
      CANVAS_SIZE * 0.12,
      CANVAS_SIZE / 2,
      CANVAS_SIZE / 2,
      CANVAS_SIZE * 0.48,
    );
    tint.addColorStop(0, productColor);
    tint.addColorStop(0.72, productColor);
    tint.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.save();
    context.globalCompositeOperation = 'multiply';
    context.globalAlpha = 0.85;
    context.fillStyle = tint;
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    context.restore();
  }

  const zoneRatio = CANVAS_SIZE / PREVIEW_HEIGHT;
  const rawZone = printArea?.zone || PRINT_ZONES[productId] || PRINT_ZONES.tshirt;
  const darkProductColors = {
    tshirt: ['#18181b', '#374151', '#1e3a8a', '#991b1b'],
    hoodie: ['#18181b', '#15803d'],
    mug: ['#18181b'],
    phone_case: ['#18181b'],
  };
  const effectiveTextColor = darkProductColors[productId]?.includes(productColor) &&
    (textColor === '#111827' || textColor === '#18181b')
    ? '#ffffff'
    : textColor;
  const zone = {
    left: rawZone.left * CANVAS_SIZE,
    top: rawZone.top * CANVAS_SIZE,
    width: rawZone.width * CANVAS_SIZE,
    height: rawZone.height * CANVAS_SIZE,
  };

  context.save();
  context.beginPath();
  context.rect(zone.left, zone.top, zone.width, zone.height);
  context.clip();

  const imageCenterX = zone.left + zone.width / 2 + imageX * zoneRatio;
  const imageCenterY = zone.top + zone.height / 2 + imageY * zoneRatio;
  context.save();
  context.translate(imageCenterX, imageCenterY);
  context.rotate((imageRotation * Math.PI) / 180);
  if (uploadedImageUrl) {
    const uploadedImage = await loadImage(uploadedImageUrl);
    context.filter = darkProductColors[productId]?.includes(productColor)
      ? 'brightness(1.1)'
      : 'none';
    drawContainedImage(
      context,
      uploadedImage,
      0,
      0,
      110 * (imageScale / 100) * zoneRatio,
      130 * (imageScale / 100) * zoneRatio,
    );
    context.filter = 'none';
  } else if (uploadedFileName) {
    drawDefaultGraphic(
      context,
      0,
      0,
      2 * imageScale,
      effectiveTextColor,
      uploadedFileName,
    );
  }
  context.restore();

  drawText(context, customText, {
    selectedFont,
    textColor: effectiveTextColor,
    isBold,
    isItalic,
    isUnderline,
    alignment,
    selectedEffect,
    textScale,
    textX,
    textY,
    textRotation,
  }, zone, zoneRatio);
  additionalGraphicLayers
    .filter((layer) => layer.visible !== false)
    .forEach((layer) => {
      const x = zone.left + zone.width / 2 + (Number(layer.x) || 0) * zoneRatio;
      const y = zone.top + zone.height / 2 + (Number(layer.y) || 0) * zoneRatio;
      context.save();
      context.translate(x, y);
      context.rotate(((Number(layer.rotation) || 0) * Math.PI) / 180);
      drawDefaultGraphic(
        context,
        0,
        0,
        Math.max(20, Math.min(160, Number(layer.scale) || 55)),
        layer.color || effectiveTextColor,
        layer.name,
      );
      context.restore();
    });

  additionalTextLayers
    .filter((layer) => layer.visible !== false && typeof layer.text === 'string')
    .forEach((layer) => {
      drawText(context, layer.text, {
        selectedFont: layer.font || 'Poppins',
        textColor: layer.color || effectiveTextColor,
        isBold: layer.bold !== false,
        isItalic: false,
        isUnderline: false,
        alignment: 'center',
        selectedEffect: 'none',
        textScale: Math.max(20, Math.min(200, Number(layer.scale) || 100)),
        textX: Math.max(-140, Math.min(140, Number(layer.x) || 0)),
        textY: Math.max(-140, Math.min(140, Number(layer.y) || 0)),
        textRotation: Math.max(-180, Math.min(180, Number(layer.rotation) || 0)),
      }, zone, zoneRatio);
    });
  context.restore();

  const imageBlob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The product preview could not be encoded.'))),
      'image/jpeg',
      0.88,
    );
  });

  if (imageBlob.size > 4 * 1024 * 1024) {
    throw new Error('The generated product image is too large to publish. Reduce the artwork size and retry.');
  }

  const imageData = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The generated product image could not be prepared for upload.'));
    reader.readAsDataURL(imageBlob);
  });

  return imageData;
}
