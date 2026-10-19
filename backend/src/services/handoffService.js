/* eslint-env node */

import prisma from '../config/prisma.js';
import RoutingRule from '../models/routing-rule.model.js';
import CustomOrder from '../models/custom-order.model.js';
import CustomOrderTimeline from '../models/custom-order-timeline.model.js';
import Proof from '../models/proof.model.js';
import Design from '../models/design.model.js';
import { logError, logSuccess, logWarn } from '../utils/logger.js';

/**
 * Standard default fallback routing queue when no configured rules match an order.
 */
export const DEFAULT_FALLBACK_QUEUE = 'DEFAULT_MANUAL_REVIEW';
export const DEFAULT_FALLBACK_SUPPLIER = 'IN_HOUSE_DEFAULT';

/**
 * Normalizes text attribute values for deterministic, case-insensitive rule evaluation.
 */
export const normalize = (value) => {
  if (value == null) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
};

/**
 * Normalizes an array of tags: trims whitespace, removes empties, and eliminates duplicates.
 */
export const cleanAndDeduplicateTags = (...tagLists) => {
  const set = new Set();
  tagLists.flat().forEach((tag) => {
    if (tag && typeof tag === 'string') {
      const trimmed = tag.trim().toLowerCase();
      if (trimmed) set.add(trimmed);
    }
  });
  return Array.from(set);
};

/**
 * Evaluates a single rule criterion against an order attribute.
 * Wildcard ('*' or null/empty) matches any order attribute value.
 */
export const matchCriterion = (ruleVal, orderVal) => {
  if (!ruleVal || ruleVal === '*' || String(ruleVal).trim() === '') {
    return true; // Unspecified criterion acts as a wildcard
  }
  return normalize(ruleVal) === normalize(orderVal);
};

/**
 * Calculates rule specificity score (how many concrete criteria are defined).
 * Used as a secondary tie-breaker if priorities are equal.
 */
export const calculateSpecificity = (rule) => {
  let score = 0;
  if (rule.productType && rule.productType !== '*') score += 1;
  if (rule.material && rule.material !== '*') score += 1;
  if (rule.customizationType && rule.customizationType !== '*') score += 1;
  return score;
};

/**
 * Evaluates an order's attributes against active routing rules and determines
 * the matching destination queue, supplier ID, and workflow tags.
 *
 * @param {Object} orderAttributes - { productType, material, customizationType, shop, existingTags }
 * @param {Array} rules - Array of active routing rules
 * @param {Object} [options] - Optional custom defaults
 * @returns {Object} Handoff decision payload
 */
export const evaluateRoutingRules = (orderAttributes = {}, rules = [], options = {}) => {
  const {
    productType = '',
    material = '',
    customizationType = '',
    existingTags = [],
  } = orderAttributes;

  const defaultQueue = options.defaultQueue || DEFAULT_FALLBACK_QUEUE;
  const defaultSupplierId = options.defaultSupplierId || DEFAULT_FALLBACK_SUPPLIER;
  const defaultTags = options.defaultTags || ['customforge', 'production-handoff'];

  // Sort rules: lowest priority number first; if equal, higher specificity first
  const sortedRules = [...rules].sort((a, b) => {
    const priorityDiff = (a.priority ?? 100) - (b.priority ?? 100);
    if (priorityDiff !== 0) return priorityDiff;
    return calculateSpecificity(b) - calculateSpecificity(a);
  });

  let matchedRule = null;

  for (const rule of sortedRules) {
    if (rule.isActive === false) continue;

    const matchesProductType = matchCriterion(rule.productType, productType);
    const matchesMaterial = matchCriterion(rule.material, material);
    const matchesCustomizationType = matchCriterion(rule.customizationType, customizationType);

    if (matchesProductType && matchesMaterial && matchesCustomizationType) {
      matchedRule = rule;
      break;
    }
  }

  if (matchedRule) {
    // Generate downstream workflow tags based on rule and attributes
    const ruleSpecificTags = [
      ...(matchedRule.tags || []),
      `queue-${normalize(matchedRule.targetQueue)}`,
      ...(matchedRule.supplierId ? [`supplier-${normalize(matchedRule.supplierId)}`] : []),
      ...(customizationType ? [`type-${normalize(customizationType)}`] : []),
      ...(material ? [`mat-${normalize(material)}`] : []),
    ];

    const finalTags = cleanAndDeduplicateTags(existingTags, defaultTags, ruleSpecificTags);

    return {
      isMatched: true,
      ruleId: matchedRule.ruleId || matchedRule.id,
      ruleName: matchedRule.name,
      assignedQueue: matchedRule.targetQueue,
      supplierId: matchedRule.supplierId || null,
      tags: finalTags,
      matchedCriteria: {
        productType: matchedRule.productType || '*',
        material: matchedRule.material || '*',
        customizationType: matchedRule.customizationType || '*',
      },
      orderAttributes: {
        productType,
        material,
        customizationType,
      },
      priority: matchedRule.priority ?? 100,
    };
  }

  // Unmatched fallback
  const fallbackTags = cleanAndDeduplicateTags(
    existingTags,
    defaultTags,
    ['unmatched-routing-rule', 'manual-assignment-required', `queue-${normalize(defaultQueue)}`],
  );

  return {
    isMatched: false,
    ruleId: null,
    ruleName: 'Default Unmatched Rule Fallback',
    assignedQueue: defaultQueue,
    supplierId: defaultSupplierId,
    tags: fallbackTags,
    matchedCriteria: null,
    orderAttributes: {
      productType,
      material,
      customizationType,
    },
    priority: 999,
  };
};

/**
 * Fetch active routing rules from Prisma with Mongoose fallback.
 */
export const getActiveRoutingRules = async (shop = null) => {
  // 1. Try Prisma first
  if (prisma?.routingRule) {
    try {
      const whereClause = {
        isActive: true,
        ...(shop ? { OR: [{ shop }, { shop: null }] } : {}),
      };
      const rules = await prisma.routingRule.findMany({
        where: whereClause,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      });
      if (rules && rules.length > 0) return rules;
    } catch (err) {
      logWarn(`⚠️ Prisma getActiveRoutingRules error: ${err.message}. Falling back to Mongoose.`);
    }
  }

  // 2. Mongoose fallback
  try {
    const query = {
      isActive: true,
      ...(shop ? { $or: [{ shop }, { shop: null }] } : {}),
    };
    return await RoutingRule.find(query).sort({ priority: 1, createdAt: -1 }).lean();
  } catch (err) {
    logError(`❌ Mongoose getActiveRoutingRules error: ${err.message}`);
    return [];
  }
};

/**
 * Resolves order attributes from database records or customer payload.
 */
export const resolveOrderAttributes = async (orderId, explicitData = {}) => {
  const normalizedId = String(orderId).replace(/Order\//, '').trim();

  let resolved = {
    orderId: normalizedId,
    shopifyOrderId: normalizedId,
    productType: explicitData.productType || null,
    material: explicitData.material || null,
    customizationType: explicitData.customizationType || null,
    existingTags: explicitData.tags || [],
    shop: explicitData.shop || null,
    isApproved: false,
    proofStatus: null,
  };

  // 1. Check CustomOrder record if exists
  if (prisma?.customOrder) {
    try {
      const order = await prisma.customOrder.findFirst({
        where: { OR: [{ orderId: normalizedId }, { shopifyOrderId: normalizedId }] },
      });
      if (order) {
        resolved.productType = resolved.productType || order.productType;
        resolved.material = resolved.material || order.material;
        resolved.customizationType = resolved.customizationType || order.customizationType;
        resolved.existingTags = cleanAndDeduplicateTags(resolved.existingTags, order.tags || []);
        resolved.shop = resolved.shop || order.shop;
        resolved.isApproved = order.status === 'APPROVED' || order.status === 'IN_PRODUCTION';
      }
    } catch (err) {
      logWarn(`⚠️ Prisma customOrder lookup error: ${err.message}`);
    }
  }

  // 2. Check CustomOrderTimeline
  if (prisma?.customOrderTimeline) {
    try {
      const timeline = await prisma.customOrderTimeline.findFirst({
        where: { shopifyOrderId: normalizedId },
      });
      if (timeline) {
        resolved.existingTags = cleanAndDeduplicateTags(resolved.existingTags, timeline.tags || []);
        resolved.shop = resolved.shop || timeline.shop;
        if (['APPROVED', 'IN_PRODUCTION', 'SHIPPED'].includes(timeline.currentStage)) {
          resolved.isApproved = true;
        }
        if (timeline.metadata) {
          resolved.productType = resolved.productType || timeline.metadata.productType;
          resolved.material = resolved.material || timeline.metadata.material;
          resolved.customizationType = resolved.customizationType || timeline.metadata.customizationType;
        }
      }
    } catch (err) {
      logWarn(`⚠️ Prisma customOrderTimeline lookup error: ${err.message}`);
    }
  }

  // 3. Check Proof record to verify approval clearance
  if (prisma?.proof) {
    try {
      const proof = await prisma.proof.findFirst({
        where: { OR: [{ orderId: normalizedId }, { shopifyOrderId: normalizedId }] },
        orderBy: { versionNumber: 'desc' },
      });
      if (proof) {
        resolved.proofStatus = proof.status;
        if (proof.status === 'APPROVED') {
          resolved.isApproved = true;
        }
        if (proof.metadata) {
          resolved.productType = resolved.productType || proof.metadata.productType;
          resolved.material = resolved.material || proof.metadata.material;
          resolved.customizationType = resolved.customizationType || proof.metadata.customizationType;
        }
      }
    } catch (err) {
      logWarn(`⚠️ Prisma proof lookup error: ${err.message}`);
    }
  }

  // 4. Mongoose fallback for proof/timeline if needed
  if (!resolved.isApproved) {
    try {
      const mgProof = await Proof.findOne({
        $or: [{ orderId: normalizedId }, { shopifyOrderId: normalizedId }],
      })
        .sort({ versionNumber: -1 })
        .lean();

      if (mgProof) {
        resolved.proofStatus = mgProof.status;
        if (mgProof.status === 'APPROVED') resolved.isApproved = true;
        if (mgProof.metadata) {
          resolved.productType = resolved.productType || mgProof.metadata.productType;
          resolved.material = resolved.material || mgProof.metadata.material;
          resolved.customizationType = resolved.customizationType || mgProof.metadata.customizationType;
        }
      }
    } catch (err) {
      logWarn(`⚠️ Mongoose proof lookup error: ${err.message}`);
    }
  }

  return resolved;
};

/**
 * Persists the handoff assignment (assignedQueue, supplierId, tags) into CustomOrder and CustomOrderTimeline.
 */
export const persistHandoffAssignment = async ({
  orderId,
  shopifyOrderId,
  assignedQueue,
  supplierId,
  tags,
  ruleId,
  orderAttributes,
}) => {
  const normalizedId = String(orderId).replace(/Order\//, '').trim();
  const routedAt = new Date();

  // 1. Update/Upsert CustomOrder in Prisma
  if (prisma?.customOrder) {
    try {
      await prisma.customOrder.upsert({
        where: { orderId: normalizedId },
        update: {
          assignedQueue,
          supplierId,
          tags,
          handoffStatus: 'ROUTED',
          routedRuleId: ruleId,
          routedAt,
          productType: orderAttributes.productType || undefined,
          material: orderAttributes.material || undefined,
          customizationType: orderAttributes.customizationType || undefined,
        },
        create: {
          orderId: normalizedId,
          shopifyOrderId: shopifyOrderId || normalizedId,
          assignedQueue,
          supplierId,
          tags,
          handoffStatus: 'ROUTED',
          routedRuleId: ruleId,
          routedAt,
          status: 'APPROVED',
          productType: orderAttributes.productType || null,
          material: orderAttributes.material || null,
          customizationType: orderAttributes.customizationType || null,
        },
      });
    } catch (err) {
      logWarn(`⚠️ Prisma CustomOrder upsert error: ${err.message}`);
    }
  }

  // 2. Update CustomOrderTimeline in Prisma & Mongoose
  try {
    if (prisma?.customOrderTimeline) {
      await prisma.customOrderTimeline.updateMany({
        where: { shopifyOrderId: normalizedId },
        data: {
          assignedQueue,
          supplierId,
          tags,
        },
      });
    }
    await CustomOrderTimeline.updateMany(
      { shopifyOrderId: normalizedId },
      { $set: { assignedQueue, supplierId, tags } },
    );
  } catch (err) {
    logWarn(`⚠️ Timeline queue update error: ${err.message}`);
  }

  // 3. Mongoose CustomOrder fallback
  try {
    await CustomOrder.findOneAndUpdate(
      { orderId: normalizedId },
      {
        $set: {
          shopifyOrderId: shopifyOrderId || normalizedId,
          assignedQueue,
          supplierId,
          tags,
          handoffStatus: 'ROUTED',
          routedRuleId: ruleId,
          routedAt,
          status: 'APPROVED',
          productType: orderAttributes.productType || null,
          material: orderAttributes.material || null,
          customizationType: orderAttributes.customizationType || null,
        },
      },
      { upsert: true, new: true },
    );
  } catch (err) {
    logWarn(`⚠️ Mongoose CustomOrder upsert error: ${err.message}`);
  }
};

/**
 * Main handoff orchestration service function.
 * Evaluates active rules, assigns the destination queue/supplier, updates order tags,
 * and saves state to MongoDB via Prisma.
 */
export const processOrderHandoff = async (orderId, explicitPayload = {}) => {
  // 1. Gather order data and approval status
  const orderData = await resolveOrderAttributes(orderId, explicitPayload);

  // Check approval clearance unless merchant explicitly passes allowUnapproved flag or testing attributes
  const isApproved =
    orderData.isApproved ||
    explicitPayload.allowUnapproved === true ||
    explicitPayload.status === 'APPROVED';

  if (!isApproved) {
    const error = new Error(
      `Order "${orderId}" cannot be handed off to production: Proof or Design status is "${orderData.proofStatus || 'PENDING_APPROVAL'}" and requires customer approval before manufacturing clearance.`,
    );
    error.statusCode = 412; // Precondition Failed
    error.code = 'ORDER_NOT_APPROVED';
    error.details = {
      orderId,
      currentProofStatus: orderData.proofStatus || 'UNAPPROVED',
      suggestion: 'Customer must approve the digital proof before routing to production, or pass { allowUnapproved: true } for merchant testing.',
    };
    throw error;
  }

  // 2. Fetch active routing rules
  const activeRules = await getActiveRoutingRules(orderData.shop);

  // 3. Evaluate rules
  const evaluationResult = evaluateRoutingRules(orderData, activeRules, {
    defaultQueue: explicitPayload.defaultQueue,
    defaultSupplierId: explicitPayload.defaultSupplierId,
  });

  // 4. Persist queue, supplier, and tags to MongoDB
  await persistHandoffAssignment({
    orderId,
    shopifyOrderId: orderData.shopifyOrderId,
    assignedQueue: evaluationResult.assignedQueue,
    supplierId: evaluationResult.supplierId,
    tags: evaluationResult.tags,
    ruleId: evaluationResult.ruleId,
    orderAttributes: evaluationResult.orderAttributes,
  });

  logSuccess(
    `🚀 [HandoffService] Order "${orderId}" routed to queue "${evaluationResult.assignedQueue}" (Supplier: ${evaluationResult.supplierId || 'none'}, Tags: [${evaluationResult.tags.join(', ')}])`,
  );

  return {
    orderId: String(orderId),
    shopifyOrderId: orderData.shopifyOrderId,
    assignedQueue: evaluationResult.assignedQueue,
    supplierId: evaluationResult.supplierId,
    tags: evaluationResult.tags,
    handoffStatus: 'ROUTED',
    isMatched: evaluationResult.isMatched,
    matchedRule: evaluationResult.isMatched
      ? {
          ruleId: evaluationResult.ruleId,
          name: evaluationResult.ruleName,
          priority: evaluationResult.priority,
          matchedCriteria: evaluationResult.matchedCriteria,
        }
      : null,
    orderAttributes: evaluationResult.orderAttributes,
    routedAt: new Date(),
  };
};

export default {
  processOrderHandoff,
  evaluateRoutingRules,
  getActiveRoutingRules,
  resolveOrderAttributes,
  persistHandoffAssignment,
  cleanAndDeduplicateTags,
  normalize,
};
