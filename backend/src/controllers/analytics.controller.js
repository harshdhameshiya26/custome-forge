/* eslint-env node */

import prisma from '../config/prisma.js';
import { logError } from '../utils/logger.js';

/**
 * GET /api/analytics/dashboard
 * Returns real KPI metrics computed from live DB data.
 * Returns zeroes / empty arrays when no data exists yet.
 */
export const getDashboardAnalytics = async (req, res) => {
  try {
    const shop =
      req.query.shop ||
      req.get('x-shop-domain') ||
      req.get('x-shopify-shop-domain') ||
      process.env.SHOPIFY_SHOP ||
      null;

    // ── Live counts from DB ──────────────────────────────────────────────────

    // Total custom orders in CustomOrder collection
    const [totalOrders, pendingApproval, inProduction, completed] = await Promise.all([
      prisma.customOrder.count({ where: shop ? { shop } : {} }).catch(() => 0),
      prisma.customOrder.count({
        where: { ...(shop ? { shop } : {}), status: 'PENDING_APPROVAL' },
      }).catch(() => 0),
      prisma.customOrder.count({
        where: { ...(shop ? { shop } : {}), status: 'IN_PRODUCTION' },
      }).catch(() => 0),
      prisma.customOrder.count({
        where: { ...(shop ? { shop } : {}), status: { in: ['COMPLETED', 'SHIPPED'] } },
      }).catch(() => 0),
    ]);

    // ── Recent orders (last 10) ──────────────────────────────────────────────
    const recentRaw = await prisma.customOrder
      .findMany({
        where: shop ? { shop } : {},
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
      .catch(() => []);

    const statusToneMap = {
      PENDING_APPROVAL: 'attention',
      PROOF_READY: 'attention',
      APPROVED: 'success',
      IN_PRODUCTION: 'info',
      QUALITY_CHECK: 'info',
      SHIPPED: 'magic',
      COMPLETED: 'success',
      CANCELLED: 'critical',
    };

    const recentOrders = recentRaw.map((o) => ({
      orderNumber: o.shopifyOrderId ? `#${o.shopifyOrderId}` : `#${o.orderId}`,
      customerName: o.customerEmail || 'Unknown',
      productTitle: o.productType || 'Custom Product',
      status: o.status?.replace(/_/g, ' ') || 'Pending',
      statusTone: statusToneMap[o.status] || 'subdued',
      date: new Date(o.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      }),
    }));

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          totalOrders,
          pendingApproval,
          inProduction,
          completed,
        },
        recentOrders,
      },
    });
  } catch (error) {
    logError(`Dashboard Analytics Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard analytics.',
      error: error.message,
    });
  }
};
