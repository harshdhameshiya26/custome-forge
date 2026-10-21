/* eslint-env node */

import express from 'express';
import {
  listDesignRevisions,
  getRevisionByVersion,
  compareRevisions,
  submitRevisionForReview,
  approveRevision,
  requestChanges,
  restoreDesignRevision,
  verifyRevisionIntegrity,
} from '../controllers/revision.controller.js';
import {
  requireShopper,
  extractShopContext,
} from '../middleware/shopper-auth.js';

const router = express.Router({ mergeParams: true });

// All revision routes require an authenticated shopper
router.use(extractShopContext);
router.use(requireShopper);

// ── History & Retrieval ────────────────────────────────────────────────────
// GET  /api/designs/:id/revisions                  → list all revisions (no canvasState)
// GET  /api/designs/:id/revisions/compare          → side-by-side diff (?versionA=2&versionB=4)
// GET  /api/designs/:id/revisions/:version         → single revision with full canvasState
// GET  /api/designs/:id/revisions/:version/verify  → fingerprint integrity check

router.get('/',         listDesignRevisions);
router.get('/compare',  compareRevisions);
router.get('/:version', getRevisionByVersion);
router.get('/:version/verify', verifyRevisionIntegrity);

// ── State Transitions ──────────────────────────────────────────────────────
// POST /api/designs/:id/revisions/:version/submit          → draft → pending_review
// POST /api/designs/:id/revisions/:version/approve         → pending_review → approved
// POST /api/designs/:id/revisions/:version/request-changes → pending_review → changes_requested
// POST /api/designs/:id/revisions/:version/restore         → creates new version from old snapshot

router.post('/:version/submit',          submitRevisionForReview);
router.post('/:version/approve',         approveRevision);
router.post('/:version/request-changes', requestChanges);
router.post('/:version/restore',         restoreDesignRevision);

export default router;
