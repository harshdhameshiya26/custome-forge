import express from 'express';
import {
  createOrUpdateDesign,
  getDesignById,
  getSharedDesign,
  listMyDesigns,
  manageShareLink,
  revokeShareLink,
  submitSharedFeedback,
  listSharedFeedback,
  listOwnerFeedback,
  moderateFeedback,
} from '../controllers/design.controller.js';
import revisionRoutes from './revision.routes.js';
import {
  claimGuestDesigns,
  createGuestSession,
  requireGuestClaim,
  requireShopper,
  revokeGuestSession,
  extractShopContext,
} from '../middleware/shopper-auth.js';
import {
  feedbackRateLimit,
  guestSessionRateLimit,
} from '../middleware/feedback-rate-limit.js';

import {
  authenticateToken,
  requireVerifiedUser,
  verifyRole,
} from '../middleware/auth.middleware.js';
import {
  createTemplate,
  listTemplates,
  getTemplateById,
  resumeDesign,
  generateShareToken,
  reviewAndModifyDesign,
} from '../controllers/design.controller.js';

const router = express.Router();

router.use(extractShopContext);

// ─────────────────────────────────────────────────────────────────────────────
// Public / Shareable Feedback & Guest Sessions
// ─────────────────────────────────────────────────────────────────────────────
router.post('/sessions', guestSessionRateLimit, createGuestSession);
router.post('/sessions/claim', requireShopper, requireGuestClaim, claimGuestDesigns);
router.delete('/sessions/current', requireShopper, revokeGuestSession);

router.get('/share/:shareToken/feedback', listSharedFeedback);
router.post('/share/:shareToken/feedback', feedbackRateLimit, submitSharedFeedback);
router.get('/share/:shareToken', getSharedDesign);

// ─────────────────────────────────────────────────────────────────────────────
// Design & Resume Endpoints (Cross-Session Persistence)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/resume', resumeDesign);
router.get('/resume/:id', resumeDesign);
router.post('/:id/share-token', generateShareToken);

// ─────────────────────────────────────────────────────────────────────────────
// Merchant Workflow Endpoints (Templates & Canvas Review)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/templates', listTemplates);
router.get('/templates/:id', getTemplateById);
router.post(
  '/templates',
  authenticateToken,
  requireVerifiedUser,
  verifyRole(['merchant', 'designer']),
  createTemplate,
);
router.patch(
  '/:id/review',
  authenticateToken,
  requireVerifiedUser,
  verifyRole(['merchant', 'designer']),
  reviewAndModifyDesign,
);
router.put(
  '/:id/review',
  authenticateToken,
  requireVerifiedUser,
  verifyRole(['merchant', 'designer']),
  reviewAndModifyDesign,
);

// ─────────────────────────────────────────────────────────────────────────────
// Shopper Scoped Endpoints
// ─────────────────────────────────────────────────────────────────────────────
router.use(requireShopper);

router.get('/', listMyDesigns);
router.post('/', createOrUpdateDesign);
router.use('/:id/revisions', revisionRoutes);
router.get('/:id/feedback', listOwnerFeedback);
router.patch('/:id/feedback/:feedbackId', moderateFeedback);
router.post('/:id/share', manageShareLink);
router.delete('/:id/share', revokeShareLink);
router.put('/:id', (request, response, next) => {
  if (
    request.body &&
    typeof request.body === 'object' &&
    !Array.isArray(request.body)
  ) {
    request.body.designId = request.params.id;
  }
  return createOrUpdateDesign(request, response, next);
});
router.get('/:id', getDesignById);

export default router;
