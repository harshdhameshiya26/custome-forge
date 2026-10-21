/* eslint-env node */

/**
 * validate.js
 * ────────────
 * Generic Zod schema validation middleware factory.
 * Validates req.body, req.query, and req.params against a given schema.
 *
 * Usage:
 *   import { validate } from '../middleware/validate.js';
 *   import { registerSchema } from '../utils/user.validators.js';
 *   router.post('/register', validate(registerSchema), controller);
 */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
  });

  if (!result.success) {
    const rawIssues = result.error.issues || result.error.errors || [];
    const errors = rawIssues.map((e) => ({
      field: Array.isArray(e.path) ? e.path.filter((p) => p !== 'body' && p !== 'query' && p !== 'params').join('.') : '',
      message: e.message,
    }));

    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  // Attach parsed (coerced/trimmed) data back onto req
  if (result.data.body !== undefined) req.body = result.data.body;
  if (result.data.query !== undefined) req.query = result.data.query;
  if (result.data.params !== undefined) req.params = result.data.params;

  return next();
};
