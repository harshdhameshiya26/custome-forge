/* eslint-env node */

import prisma from '../config/prisma.js';
import { logError } from '../utils/logger.js';

/**
 * GET /api/templates
 * Returns design templates stored in tbl_DesignLibraryItem where isPublic=true
 * (merchant-published templates), or empty array if none exist yet.
 *
 * GET /api/templates?category=T-Shirt&search=vibes
 */
export const getTemplates = async (req, res) => {
  try {
    const shop =
      req.query.shop ||
      req.get('x-shop-domain') ||
      req.get('x-shopify-shop-domain') ||
      process.env.SHOPIFY_SHOP ||
      null;

    const { category, search } = req.query;

    const items = await prisma.tbl_DesignLibraryItem
      .findMany({
        where: {
          isPublic: true,
          ...(shop ? { shop } : {}),
          ...(category && category.toLowerCase() !== 'all'
            ? { tags: { has: category } }
            : {}),
          ...(search && search.trim()
            ? {
                name: { contains: search.trim(), mode: 'insensitive' },
              }
            : {}),
          // Only non-expired items
          OR: [{ retentionExpiresAt: null }, { retentionExpiresAt: { gt: new Date() } }],
        },
        include: {
          design: {
            select: {
              shopifyProductId: true,
              metadata: true,
            },
          },
          revision: {
            select: {
              thumbnailUrl: true,
              canvasState: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      .catch(() => []);

    const templates = items.map((item) => ({
      id: item.id,
      title: item.name,
      category: item.tags?.[0] || 'General',
      tags: item.tags || [],
      thumbnail: item.thumbnailUrl || item.revision?.thumbnailUrl || null,
      description: null,
      createdAt: item.createdAt,
    }));

    return res.status(200).json({
      success: true,
      count: templates.length,
      data: templates,
    });
  } catch (error) {
    logError(`Get Templates Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to fetch templates' });
  }
};

/**
 * POST /api/templates
 * Creates a new public template entry in the design library.
 * Body: { name, tags, designId, revisionId }
 */
export const createTemplate = async (req, res) => {
  try {
    const shop =
      req.get('x-shop-domain') ||
      req.get('x-shopify-shop-domain') ||
      req.query.shop ||
      process.env.SHOPIFY_SHOP ||
      null;

    const { name, tags, designId, revisionId, shopifyCustomerId } = req.body;

    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'Template name is required' });
    }
    if (!designId || !revisionId) {
      return res.status(400).json({
        success: false,
        message: 'designId and revisionId are required to create a template',
      });
    }

    const newTemplate = await prisma.tbl_DesignLibraryItem.create({
      data: {
        shop: shop || 'unknown',
        shopifyCustomerId: shopifyCustomerId || 'merchant',
        designId,
        revisionId,
        name: name.trim(),
        tags: Array.isArray(tags) ? tags : [tags || 'General'],
        isPublic: true,
        retentionPolicy: 'KEEP_FOREVER',
      },
    });

    return res.status(201).json({ success: true, data: newTemplate });
  } catch (error) {
    logError(`Create Template Error: ${error.message}`);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to create template' });
  }
};
