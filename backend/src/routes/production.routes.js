/* eslint-env node */

import express from 'express';
import { getProductionQueue, updateProductionJob } from '../controllers/production.controller.js';

const router = express.Router();

router.get('/queue', getProductionQueue);
router.patch('/queue/:orderId', updateProductionJob);

export default router;
