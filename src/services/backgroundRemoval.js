const MODEL_ID = 'Xenova/modnet';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 8_000_000;

let segmenterPromise;

async function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = import('@huggingface/transformers')
      .then(({ env, pipeline }) => {
        env.useBrowserCache = true;
        return pipeline('background-removal', MODEL_ID, { dtype: 'fp32' });
      })
      .catch((error) => {
        segmenterPromise = null;
        throw error;
      });
  }
  return segmenterPromise;
}

export async function removeImageBackground(file) {
  if (!(file instanceof File) || !file.size) {
    throw new Error('Choose an image file before removing its background.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose a supported image file before removing its background.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('The image must be smaller than 10 MB for background removal.');
  }

  const sourceImage = await createImageBitmap(file);
  if (sourceImage.width * sourceImage.height > MAX_IMAGE_PIXELS) {
    sourceImage.close();
    throw new Error('The image dimensions must not exceed 8 megapixels for background removal.');
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const segmenter = await getSegmenter();
    const masks = await segmenter(sourceUrl);
    const mask = masks?.[0];
    const pixelCount = mask?.width * mask?.height;
    if (
      !mask?.data ||
      !Number.isInteger(mask.width) ||
      !Number.isInteger(mask.height) ||
      ![1, 3, 4].includes(mask.channels) ||
      mask.data.length !== pixelCount * mask.channels
    ) {
      throw new Error('The background-removal model returned an invalid image mask.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = sourceImage.width;
    canvas.height = sourceImage.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Your browser could not prepare the transparent artwork.');
    context.drawImage(sourceImage, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = mask.width;
    maskCanvas.height = mask.height;
    const maskContext = maskCanvas.getContext('2d');
    if (!maskContext) throw new Error('Your browser could not apply the background mask.');
    const maskImageData = maskContext.createImageData(mask.width, mask.height);
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const sourceOffset = pixel * mask.channels;
      const maskValue = mask.channels === 1
        ? mask.data[sourceOffset]
        : Math.round(
          0.299 * mask.data[sourceOffset] +
          0.587 * mask.data[sourceOffset + 1] +
          0.114 * mask.data[sourceOffset + 2],
        );
      const targetOffset = pixel * 4;
      maskImageData.data[targetOffset] = maskValue;
      maskImageData.data[targetOffset + 1] = maskValue;
      maskImageData.data[targetOffset + 2] = maskValue;
      maskImageData.data[targetOffset + 3] = 255;
    }
    maskContext.putImageData(maskImageData, 0, 0);

    const scaledMask = document.createElement('canvas');
    scaledMask.width = canvas.width;
    scaledMask.height = canvas.height;
    const scaledMaskContext = scaledMask.getContext('2d', { willReadFrequently: true });
    if (!scaledMaskContext) throw new Error('Your browser could not resize the background mask.');
    scaledMaskContext.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
    const alphaMask = scaledMaskContext.getImageData(0, 0, canvas.width, canvas.height);
    for (let pixel = 0; pixel < imageData.data.length; pixel += 4) {
      imageData.data[pixel + 3] = Math.round(
        imageData.data[pixel + 3] * alphaMask.data[pixel] / 255,
      );
    }
    context.putImageData(imageData, 0, 0);

    const transparentBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob
          ? resolve(blob)
          : reject(new Error('The transparent artwork could not be encoded.')),
        'image/png',
      );
    });
    return new File(
      [transparentBlob],
      `${file.name.replace(/\.[^.]+$/, '')}-transparent.png`,
      { type: 'image/png' },
    );
  } finally {
    sourceImage.close();
    URL.revokeObjectURL(sourceUrl);
  }
}
