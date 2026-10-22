/* eslint-env node */

import express from 'express';
import { getDashboardAnalytics } from '../controllers/analytics.controller.js';

const router = express.Router();

router.get('/dashboard', getDashboardAnalytics);

export default router;
