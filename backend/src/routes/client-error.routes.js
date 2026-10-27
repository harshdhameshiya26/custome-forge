/* eslint-env node */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { logError } from '../utils/logger.js';

const router = Router();
const reportRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many error reports. Try again later.' },
});

const redactSecrets = (value) =>
  String(value || '')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:shpat|shpca|shppa|shpss)_[A-Za-z0-9]+\b/g, '[REDACTED_SHOPIFY_TOKEN]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(
      /((?:password|token|secret|api[_-]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi,
      '$1[REDACTED]',
    )
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && code !== 9 && code !== 10) || code === 127
        ? ' '
        : character;
    })
    .join('')
    .trim();

const readField = (value, maxLength) => {
  if (typeof value !== 'string') return '';
  return redactSecrets(value).slice(0, maxLength);
};

router.post('/', reportRateLimit, (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ success: false, message: 'An error report object is required.' });
  }

  const category = readField(payload.category, 64).replace(/\s+/g, ' ') || 'browser';
  const message = readField(payload.message, 2000).replace(/\s+/g, ' ');
  const stack = readField(payload.stack, 8000);
  const source = readField(payload.source, 500).replace(/\s+/g, ' ').split(/[?#]/, 1)[0];
  const pathname = readField(payload.pathname, 500).replace(/\s+/g, ' ').split(/[?#]/, 1)[0];
  const status = Number.isInteger(payload.status) ? payload.status : null;
  const response = readField(payload.response, 2000).replace(/\s+/g, ' ');

  if (!message) {
    return res.status(400).json({ success: false, message: 'An error message is required.' });
  }

  logError([
    '❌ [Client Error]',
    `category=${category}`,
    pathname ? `path=${pathname}` : '',
    source ? `source=${source}` : '',
    status ? `httpStatus=${status}` : '',
    `message=${message}`,
    response ? `response=${response}` : '',
    stack ? `\n${stack}` : '',
  ].filter(Boolean).join(' '));

  return res.status(202).json({ success: true });
});

export default router;
