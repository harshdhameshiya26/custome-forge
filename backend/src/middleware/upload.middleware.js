/* eslint-env node */

import multer from 'multer';

// 25 MB default maximum upload size for high-resolution print files
const DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024;

// Standard allowed MIME types for print artwork uploads
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff',
  'image/x-tiff',
  'image/svg+xml',
]);

/**
 * Configure in-memory storage. Keeps uploaded artwork buffers in memory
 * for zero-latency Sharp analysis and prevents orphan files on disk.
 */
const storage = multer.memoryStorage();

/**
 * File filter to reject non-image file formats before buffer allocation.
 */
const fileFilter = (req, file, cb) => {
  const mimeType = file.mimetype?.toLowerCase();

  if (ALLOWED_MIME_TYPES.has(mimeType)) {
    cb(null, true);
  } else {
    const error = new Error(
      `Unsupported file format "${file.mimetype}". Please upload a PNG, JPEG, TIFF, or WebP image.`,
    );
    error.statusCode = 415; // Unsupported Media Type
    error.code = 'UNSUPPORTED_FILE_TYPE';
    cb(error, false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_SIZE_BYTES) || DEFAULT_MAX_FILE_SIZE,
    files: 1, // Only 1 artwork file per validation call
  },
  fileFilter,
});

/**
 * Express middleware wrapper that accepts common field names ('image', 'file', 'artwork')
 * and intercepts Multer errors into formatted JSON responses.
 */
export const uploadArtworkMiddleware = (req, res, next) => {
  // Use any() or specific field handler to gracefully handle 'image', 'file', or 'artwork'
  const uploadSingle = upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'file', maxCount: 1 },
    { name: 'artwork', maxCount: 1 },
  ]);

  uploadSingle(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const maxMb = Math.round(
            (Number(process.env.MAX_UPLOAD_SIZE_BYTES) || DEFAULT_MAX_FILE_SIZE) /
              (1024 * 1024),
          );
          return res.status(413).json({
            success: false,
            passed: false,
            error: {
              code: 'FILE_TOO_LARGE',
              message: `Uploaded file exceeds the maximum allowed size of ${maxMb}MB.`,
              suggestion: 'Compress the image or remove unnecessary layers before uploading.',
            },
          });
        }

        return res.status(400).json({
          success: false,
          passed: false,
          error: {
            code: err.code,
            message: `Upload error: ${err.message}`,
          },
        });
      }

      // Custom fileFilter rejection or HTTP error
      const statusCode = err.statusCode || 400;
      return res.status(statusCode).json({
        success: false,
        passed: false,
        error: {
          code: err.code || 'UPLOAD_VALIDATION_ERROR',
          message: err.message,
          suggestion: 'Ensure your file is a valid image in PNG, JPEG, WebP, or TIFF format.',
        },
      });
    }

    // Normalize uploaded file reference onto req.file
    if (req.files) {
      req.file =
        req.files.image?.[0] ||
        req.files.file?.[0] ||
        req.files.artwork?.[0] ||
        null;
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        passed: false,
        error: {
          code: 'MISSING_FILE',
          message: 'No image file was uploaded. Please provide a file in form field "image", "file", or "artwork".',
          suggestion: 'Include a multipart/form-data payload with an image file attached.',
        },
      });
    }

    next();
  });
};

export default uploadArtworkMiddleware;
