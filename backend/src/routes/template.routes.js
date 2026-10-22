/* eslint-env node */

import express from 'express';
import { getTemplates, createTemplate } from '../controllers/template.controller.js';

const router = express.Router();

router.get('/', getTemplates);
router.post('/', createTemplate);

export default router;
