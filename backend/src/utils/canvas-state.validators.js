import { Buffer } from 'node:buffer';

const MAX_CANVAS_BYTES = 8 * 1024 * 1024;
const MAX_CUSTOMIZER_LAYERS = 12;
const GRAPHIC_NAMES = new Set([
  'Good Vibes',
  'Mountain Adventure',
  'Beach Sunset',
  'Skull Art',
  'Minimal Logo',
  'Love Heart',
  'Pet Lover',
  'Christmas Special',
]);

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const fail = (message, statusCode = 400) => {
  throw Object.assign(new Error(message), { statusCode });
};

const validateLayerList = (layers, layerType) => {
  if (layers === undefined) return;
  if (!Array.isArray(layers)) {
    fail(`${layerType} must be an array.`);
  }

  for (const layer of layers) {
    if (!isPlainObject(layer)) fail(`${layerType} entries must be objects.`);
    if (typeof layer.id !== 'string' || !layer.id.trim() || layer.id.length > 80) {
      fail(`${layerType} entries must have a valid ID.`);
    }
    if (typeof layer.name !== 'string' || !layer.name.trim() || layer.name.length > 100) {
      fail(`${layerType} entries must have a valid name.`);
    }
    if (layer.visible !== undefined && typeof layer.visible !== 'boolean') {
      fail(`${layerType} visibility must be a boolean.`);
    }
    if (
      !/^#[\da-f]{6}$/i.test(layer.color || '') ||
      !Number.isFinite(layer.scale) ||
      layer.scale < 20 ||
      layer.scale > (layerType === 'additionalGraphicLayers' ? 160 : 200) ||
      !Number.isFinite(layer.x) ||
      Math.abs(layer.x) > 140 ||
      !Number.isFinite(layer.y) ||
      Math.abs(layer.y) > 140 ||
      !Number.isFinite(layer.rotation) ||
      Math.abs(layer.rotation) > 180
    ) {
      fail(`${layerType} contains invalid color, scale, position, or rotation values.`);
    }

    if (layerType === 'additionalTextLayers') {
      if (
        typeof layer.text !== 'string' ||
        layer.text.length > 200 ||
        typeof layer.font !== 'string' ||
        layer.font.length > 64 ||
        (layer.bold !== undefined && typeof layer.bold !== 'boolean')
      ) {
        fail('Text layers must contain valid text and font settings.');
      }
    } else if (!GRAPHIC_NAMES.has(layer.name)) {
      fail('A graphic layer uses an unsupported built-in graphic.');
    }
  }
};

export function validateCustomizerCanvasState(canvasState) {
  if (!isPlainObject(canvasState)) {
    fail('canvasState must be a JSON object.');
  }

  let byteLength;
  try {
    byteLength = Buffer.byteLength(JSON.stringify(canvasState), 'utf8');
  } catch {
    fail('canvasState must contain serializable JSON data.');
  }
  if (byteLength > MAX_CANVAS_BYTES) {
    fail('canvasState must be 8 MB or smaller.', 413);
  }

  validateLayerList(canvasState.additionalTextLayers, 'additionalTextLayers');
  validateLayerList(canvasState.additionalGraphicLayers, 'additionalGraphicLayers');
  if (
    (canvasState.additionalTextLayers?.length || 0) +
      (canvasState.additionalGraphicLayers?.length || 0) >
    MAX_CUSTOMIZER_LAYERS
  ) {
    fail(`A design can contain at most ${MAX_CUSTOMIZER_LAYERS} additional text and graphic layers.`);
  }
}
