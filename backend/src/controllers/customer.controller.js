/* eslint-env node */

import prisma from '../config/prisma.js';
import { logError } from '../utils/logger.js';

/**
 * GET /api/customers
 * Returns real customer list derived from tbl_User records (role=customer)
 * joined with order counts from CustomOrder.
 * Returns empty array when no customers exist yet.
 */
export const getCustomers = async (req, res) => {
  try {
    const shop =
      req.query.shop ||
      req.get('x-shop-domain') ||
      req.get('x-shopify-shop-domain') ||
      process.env.SHOPIFY_SHOP ||
      null;

    const { search } = req.query;

    // Fetch real users with role=customer from DB
    const users = await prisma.tbl_User
      .findMany({
        where: {
          role: 'customer',
          deletedAt: null,
          ...(shop ? { shop } : {}),
          ...(search && search.trim()
            ? {
                OR: [
                  { fullName: { contains: search.trim(), mode: 'insensitive' } },
                  { email: { contains: search.trim(), mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      .catch(() => []);

    // Get order counts per shopifyCustomerId from CustomOrder
    const orderAggregates = await prisma.customOrder
      .groupBy({
        by: ['customerEmail'],
        _count: { _all: true },
        where: shop ? { shop } : {},
      })
      .catch(() => []);

    const orderCountByEmail = {};
    for (const agg of orderAggregates) {
      if (agg.customerEmail) {
        orderCountByEmail[agg.customerEmail] = agg._count._all;
      }
    }

    const customers = users.map((u) => ({
      id: u.id,
      name: u.fullName,
      email: u.email,
      orders: orderCountByEmail[u.email] || 0,
      lastOrder: u.lastLoginAt
        ? new Date(u.lastLoginAt).toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric',
          })
        : null,
      tier: u.role === 'customer' ? 'Member' : u.role,
      spent: null, // will be computed from Shopify order data when available
      designs: [],
    }));

    return res.status(200).json({
      success: true,
      count: customers.length,
      data: customers,
    });
  } catch (error) {
    logError(`Get Customers Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch customers',
    });
  }
};
