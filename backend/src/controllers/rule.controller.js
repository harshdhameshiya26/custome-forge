/* eslint-env node */

import crypto from 'node:crypto';
import prisma from '../config/prisma.js';
import RoutingRule from '../models/routing-rule.model.js';
import { logError, logWarn } from '../utils/logger.js';

/**
 * Normalizes input tags into a clean array of lowercase strings.
 */
const sanitizeTags = (tags) => {
  if (!Array.isArray(tags)) return [];
  const set = new Set();
  tags.forEach((t) => {
    if (t && typeof t === 'string') {
      const clean = t.trim().toLowerCase();
      if (clean) set.add(clean);
    }
  });
  return Array.from(set);
};

/**
 * @route   POST /api/rules
 * @desc    Creates a new merchant routing rule for production handoff.
 * @access  Merchant / Production Admin
 */
export const createRule = async (req, res, next) => {
  try {
    const {
      name,
      targetQueue,
      productType = null,
      material = null,
      customizationType = null,
      supplierId = null,
      tags = [],
      priority = 100,
      isActive = true,
      shop = null,
      metadata = {},
    } = req.body || {};

    // 1. Validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NAME',
          message: 'Field "name" is required and must be a non-empty string.',
        },
      });
    }

    if (!targetQueue || typeof targetQueue !== 'string' || !targetQueue.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TARGET_QUEUE',
          message: 'Field "targetQueue" is required (e.g. "DTG_PRINT_QUEUE", "EMBROIDERY_LINE_1").',
        },
      });
    }

    const cleanTags = sanitizeTags(tags);
    const numericPriority = Number(priority);
    const safePriority = isNaN(numericPriority) ? 100 : numericPriority;
    const ruleId = crypto.randomUUID();

    const ruleData = {
      ruleId,
      name: name.trim(),
      targetQueue: targetQueue.trim(),
      productType: productType ? String(productType).trim() : null,
      material: material ? String(material).trim() : null,
      customizationType: customizationType ? String(customizationType).trim() : null,
      supplierId: supplierId ? String(supplierId).trim() : null,
      tags: cleanTags,
      priority: safePriority,
      isActive: Boolean(isActive),
      shop: shop ? String(shop).trim() : null,
      metadata,
    };

    // 2. Persist with Prisma (or Mongoose fallback)
    let createdRule = null;
    if (prisma?.routingRule) {
      try {
        createdRule = await prisma.routingRule.create({
          data: ruleData,
        });
      } catch (err) {
        logWarn(`⚠️ Prisma RoutingRule create failed: ${err.message}. Using Mongoose fallback.`);
      }
    }

    if (!createdRule) {
      createdRule = await RoutingRule.create(ruleData);
    }

    return res.status(201).json({
      success: true,
      message: 'Routing rule created successfully.',
      data: createdRule,
    });
  } catch (error) {
    logError(`❌ [RuleController] createRule error: ${error.message}`);
    next(error);
  }
};

/**
 * @route   GET /api/rules
 * @desc    Retrieves all routing rules for a merchant, sorted by priority.
 * @access  Merchant / Production Admin
 */
export const getRules = async (req, res, next) => {
  try {
    const {
      shop,
      isActive,
      targetQueue,
      productType,
      material,
      customizationType,
    } = req.query;

    const filter = {};
    if (shop) filter.shop = String(shop).trim();
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (targetQueue) filter.targetQueue = String(targetQueue).trim();
    if (productType) filter.productType = String(productType).trim();
    if (material) filter.material = String(material).trim();
    if (customizationType) filter.customizationType = String(customizationType).trim();

    let rules = [];
    if (prisma?.routingRule) {
      try {
        rules = await prisma.routingRule.findMany({
          where: filter,
          orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        });
      } catch (err) {
        logWarn(`⚠️ Prisma getRules query error: ${err.message}. Falling back to Mongoose.`);
      }
    }

    if (rules.length === 0) {
      rules = await RoutingRule.find(filter).sort({ priority: 1, createdAt: -1 }).lean();
    }

    return res.status(200).json({
      success: true,
      count: rules.length,
      data: rules,
    });
  } catch (error) {
    logError(`❌ [RuleController] getRules error: ${error.message}`);
    next(error);
  }
};

/**
 * @route   GET /api/rules/:id
 * @desc    Retrieves a single routing rule by ID or ruleId.
 * @access  Merchant
 */
export const getRuleById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    let rule = null;
    if (prisma?.routingRule) {
      try {
        rule = await prisma.routingRule.findFirst({
          where: {
            OR: [
              { ruleId: id },
              ...(isObjectId ? [{ id }] : []),
            ],
          },
        });
      } catch (err) {
        logWarn(`⚠️ Prisma getRuleById error: ${err.message}`);
      }
    }

    if (!rule) {
      rule = await RoutingRule.findOne({
        $or: [{ ruleId: id }, ...(isObjectId ? [{ _id: id }] : [])],
      }).lean();
    }

    if (!rule) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RULE_NOT_FOUND',
          message: `Routing rule with ID "${id}" was not found.`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/rules/:id
 * @desc    Updates an existing routing rule.
 * @access  Merchant
 */
export const updateRule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const body = req.body || {};

    const updateData = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.targetQueue !== undefined) updateData.targetQueue = String(body.targetQueue).trim();
    if (body.productType !== undefined) updateData.productType = body.productType ? String(body.productType).trim() : null;
    if (body.material !== undefined) updateData.material = body.material ? String(body.material).trim() : null;
    if (body.customizationType !== undefined) updateData.customizationType = body.customizationType ? String(body.customizationType).trim() : null;
    if (body.supplierId !== undefined) updateData.supplierId = body.supplierId ? String(body.supplierId).trim() : null;
    if (body.tags !== undefined) updateData.tags = sanitizeTags(body.tags);
    if (body.priority !== undefined) updateData.priority = Number(body.priority);
    if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);
    if (body.shop !== undefined) updateData.shop = body.shop ? String(body.shop).trim() : null;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;

    let updated = null;
    if (prisma?.routingRule) {
      try {
        const existing = await prisma.routingRule.findFirst({
          where: { OR: [{ ruleId: id }, ...(isObjectId ? [{ id }] : [])] },
        });
        if (existing) {
          updated = await prisma.routingRule.update({
            where: { id: existing.id },
            data: updateData,
          });
        }
      } catch (err) {
        logWarn(`⚠️ Prisma updateRule error: ${err.message}`);
      }
    }

    if (!updated) {
      updated = await RoutingRule.findOneAndUpdate(
        { $or: [{ ruleId: id }, ...(isObjectId ? [{ _id: id }] : [])] },
        { $set: updateData },
        { new: true, runValidators: true },
      ).lean();
    }

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RULE_NOT_FOUND',
          message: `Routing rule with ID "${id}" was not found.`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Routing rule updated successfully.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/rules/:id
 * @desc    Deletes a routing rule.
 * @access  Merchant
 */
export const deleteRule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    let deleted = false;
    if (prisma?.routingRule) {
      try {
        const existing = await prisma.routingRule.findFirst({
          where: { OR: [{ ruleId: id }, ...(isObjectId ? [{ id }] : [])] },
        });
        if (existing) {
          await prisma.routingRule.delete({ where: { id: existing.id } });
          deleted = true;
        }
      } catch (err) {
        logWarn(`⚠️ Prisma deleteRule error: ${err.message}`);
      }
    }

    if (!deleted) {
      const resMg = await RoutingRule.deleteOne({
        $or: [{ ruleId: id }, ...(isObjectId ? [{ _id: id }] : [])],
      });
      deleted = resMg.deletedCount > 0;
    }

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RULE_NOT_FOUND',
          message: `Routing rule with ID "${id}" was not found.`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: `Routing rule "${id}" deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  createRule,
  getRules,
  getRuleById,
  updateRule,
  deleteRule,
};
