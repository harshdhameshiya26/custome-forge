/* eslint-env node */

import prisma from '../config/prisma.js';
import CustomOrder from '../models/custom-order.model.js';
import { logError } from '../utils/logger.js';

/**
 * GET /api/production
 * Returns real production jobs from the CustomOrder collection.
 * Returns empty list when no orders have been placed yet.
 *
 * Query params:
 *   status  – filter by status (Pending | In Production | Quality Check | Completed)
 *   shop    – Shopify shop domain
 */
export const getProductionQueue = async (req, res) => {
  try {
    const shop =
      req.query.shop ||
      req.get('x-shop-domain') ||
      req.get('x-shopify-shop-domain') ||
      process.env.SHOPIFY_SHOP ||
      null;

    const { status } = req.query;

    // Map UI status labels → DB status values
    const STATUS_MAP = {
      pending: ['APPROVED', 'PROOF_READY', 'PENDING_APPROVAL'],
      'in production': ['IN_PRODUCTION'],
      'quality check': ['QUALITY_CHECK'],
      completed: ['COMPLETED', 'SHIPPED'],
    };

    let dbFilter = shop ? { shop } : {};
    if (status && status.toLowerCase() !== 'all') {
      const dbStatuses = STATUS_MAP[status.toLowerCase()] || [status.toUpperCase()];
      dbFilter = { ...dbFilter, status: { $in: dbStatuses } };
    }

    // Try Prisma first, fall back to Mongoose
    let rawOrders = [];
    try {
      const prismaWhere = { ...(shop ? { shop } : {}) };
      if (status && status.toLowerCase() !== 'all') {
        const dbStatuses = STATUS_MAP[status.toLowerCase()] || [status.toUpperCase().replace(/ /g, '_')];
        prismaWhere.status = { in: dbStatuses };
      }
      rawOrders = await prisma.customOrder.findMany({
        where: prismaWhere,
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    } catch {
      // Fallback to Mongoose
      rawOrders = await CustomOrder.find(dbFilter).sort({ createdAt: -1 }).limit(200).lean();
    }

    const UI_STATUS_MAP = {
      PENDING_APPROVAL: 'Pending',
      PROOF_READY: 'Pending',
      APPROVED: 'Pending',
      IN_PRODUCTION: 'In Production',
      QUALITY_CHECK: 'Quality Check',
      SHIPPED: 'Completed',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
    };

    const jobs = rawOrders.map((o) => ({
      orderId: o.shopifyOrderId ? `#${o.shopifyOrderId}` : `#${o.orderId}`,
      customer: o.customerEmail || 'Unknown',
      product: o.productType || 'Custom Product',
      designName: o.designId ? `Design #${o.designId.slice(-6)}` : 'Custom Design',
      status: UI_STATUS_MAP[o.status] || o.status,
      assignedTo: o.assignedQueue || o.supplierId || 'Unassigned',
      orderedAt: new Date(o.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      }),
      priority: 'Normal',
      rawStatus: o.status,
    }));

    // Compute real counts
    const counts = {
      pending: jobs.filter((j) => j.status === 'Pending').length,
      inProduction: jobs.filter((j) => j.status === 'In Production').length,
      qualityCheck: jobs.filter((j) => j.status === 'Quality Check').length,
      completed: jobs.filter((j) => j.status === 'Completed').length,
      total: jobs.length,
    };

    return res.status(200).json({ success: true, counts, data: jobs });
  } catch (error) {
    logError(`Get Production Queue Error: ${error.message}`);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch production queue' });
  }
};

/**
 * PATCH /api/production/:orderId
 * Updates a production job's status and/or assigned team.
 */
export const updateProductionJob = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, assignedTo } = req.body;

    const DB_STATUS_MAP = {
      Pending: 'APPROVED',
      'In Production': 'IN_PRODUCTION',
      'Quality Check': 'QUALITY_CHECK',
      Completed: 'COMPLETED',
    };

    const updateData = {};
    if (status) updateData.status = DB_STATUS_MAP[status] || status.toUpperCase().replace(/ /g, '_');
    if (assignedTo) updateData.assignedQueue = assignedTo;

    // Try Prisma, fall back to Mongoose
    let updated = null;
    try {
      // orderId may be "ORD-xxx" internal id or Shopify id without #
      const cleanId = orderId.replace(/^#/, '');
      updated = await prisma.customOrder.updateMany({
        where: {
          OR: [{ orderId: cleanId }, { shopifyOrderId: cleanId }],
        },
        data: updateData,
      });
    } catch {
      const cleanId = orderId.replace(/^#/, '');
      updated = await CustomOrder.findOneAndUpdate(
        { $or: [{ orderId: cleanId }, { shopifyOrderId: cleanId }] },
        { $set: updateData },
        { new: true }
      );
    }

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: 'Production job not found' });
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    logError(`Update Production Job Error: ${error.message}`);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to update production job' });
  }
};
