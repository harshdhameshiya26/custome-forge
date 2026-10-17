/* eslint-env node */

import express from 'express';
import {
  createComment,
  getCommentsByProofId,
} from '../controllers/comment.controller.js';

const router = express.Router();

/**
 * Feature Name: "Customer-Merchant Design Comments"
 *
 * Route Definitions:
 *
 * 1. POST /api/comments
 *    Endpoint to post a new comment linked to a specific proof ID or revision.
 *    Supports root comments and threaded replies (via parentCommentId).
 *    Validates proof existence, authorRole ("CUSTOMER" | "MERCHANT"), and non-empty content.
 *
 * 2. GET /api/comments/:proofId
 *    Endpoint to fetch all threaded comments associated with a specific proof or revision.
 *    Returns both hierarchical thread trees (with nested replies) and chronological raw lists.
 */

// Post a new comment linked to a proof
router.post('/', createComment);

// Fetch all threaded comments for a specific proof
router.get('/:proofId', getCommentsByProofId);

export default router;
