/* eslint-env node */

import {
  getNotifications as fetchNotificationsService,
  markNotificationAsRead as markAsReadService,
  markAllNotificationsAsRead as markAllAsReadService,
  deleteNotification as deleteNotificationService,
  clearAllNotifications as clearAllNotificationsService,
  normalizeShopDomain,
} from '../services/notificationService.js';
import { logError } from '../utils/logger.js';

/**
 * Extracts normalized shop domain from request context (headers, query, body, or session).
 * @param {import('express').Request} req
 * @returns {string}
 */
const getRequestShop = (req) => {
  const raw =
    req.shop ||
    req.shopDomain ||
    req.shopifyProxy?.shop ||
    req.get('x-shopify-shop-domain') ||
    req.get('x-shop') ||
    req.query?.shop ||
    (req.body && typeof req.body === 'object' && req.body.shop) ||
    process.env.SHOPIFY_SHOP ||
    process.env.SHOP ||
    '';

  return normalizeShopDomain(raw);
};

/**
 * Validates whether an ID is a valid 24-character hexadecimal MongoDB ObjectId string.
 * @param {string} id
 * @returns {boolean}
 */
const isValidMongoId = (id) => {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id.trim());
};

/**
 * @route   GET /api/notifications
 * @desc    Fetch notifications for the authenticated merchant's shop domain.
 *          Sorted newest first. Supports optional unread filtering and pagination.
 * @access  Merchant Admin (Shopify App Bridge / App Proxy)
 */
export const getNotifications = async (req, res, next) => {
  try {
    const shopDomain = getRequestShop(req);

    if (!shopDomain) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED_SHOP',
          message: 'Missing authenticated shop domain in request headers or query.',
        },
      });
    }

    const {
      unread,
      status,
      limit = 20,
      page = 1,
    } = req.query;

    const unreadOnly =
      unread === 'true' ||
      unread === '1' ||
      status === 'unread';

    const result = await fetchNotificationsService({
      shopDomain,
      unreadOnly,
      limit: parseInt(limit, 10) || 20,
      page: parseInt(page, 10) || 1,
    });

    return res.status(200).json({
      success: true,
      shopDomain,
      data: result,
    });
  } catch (error) {
    logError(`❌ [NotificationController.getNotifications] ${error.message}`);
    next(error);
  }
};

/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Mark an individual notification as read.
 * @access  Merchant Admin
 */
export const markNotificationAsRead = async (req, res, next) => {
  try {
    const shopDomain = getRequestShop(req);
    const { id } = req.params;

    if (!shopDomain) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED_SHOP',
          message: 'Missing authenticated shop domain in request headers or query.',
        },
      });
    }

    if (!id || !isValidMongoId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NOTIFICATION_ID',
          message: `The provided notification ID "${id}" is not a valid MongoDB ObjectId.`,
        },
      });
    }

    const updated = await markAsReadService({ id: id.trim(), shopDomain });

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: `Notification with ID "${id}" was not found or does not belong to shop "${shopDomain}".`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      data: updated,
    });
  } catch (error) {
    logError(`❌ [NotificationController.markNotificationAsRead] ${error.message}`);
    next(error);
  }
};

/**
 * @route   PATCH /api/notifications/read-all
 * @desc    Mark all notifications as read for the connected shop.
 * @access  Merchant Admin
 */
export const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const shopDomain = getRequestShop(req);

    if (!shopDomain) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED_SHOP',
          message: 'Missing authenticated shop domain in request headers or query.',
        },
      });
    }

    const result = await markAllAsReadService(shopDomain);

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
      data: {
        shopDomain,
        markedCount: result.count,
      },
    });
  } catch (error) {
    logError(`❌ [NotificationController.markAllNotificationsAsRead] ${error.message}`);
    next(error);
  }
};

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete/dismiss an individual notification from the database.
 * @access  Merchant Admin
 */
export const deleteNotification = async (req, res, next) => {
  try {
    const shopDomain = getRequestShop(req);
    const { id } = req.params;

    if (!shopDomain) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED_SHOP',
          message: 'Missing authenticated shop domain in request headers or query.',
        },
      });
    }

    if (!id || !isValidMongoId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NOTIFICATION_ID',
          message: `The provided notification ID "${id}" is not a valid MongoDB ObjectId.`,
        },
      });
    }

    const deleted = await deleteNotificationService({ id: id.trim(), shopDomain });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: `Notification with ID "${id}" was not found or does not belong to shop "${shopDomain}".`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification deleted successfully.',
      data: { id: id.trim(), shopDomain },
    });
  } catch (error) {
    logError(`❌ [NotificationController.deleteNotification] ${error.message}`);
    next(error);
  }
};

/**
 * @route   DELETE /api/notifications/clear-all
 * @desc    Clear/delete all notifications for the authenticated shop from the database.
 *          Backs the "Clear all" action in the UI dropdown.
 * @access  Merchant Admin
 */
export const clearAllNotifications = async (req, res, next) => {
  try {
    const shopDomain = getRequestShop(req);

    if (!shopDomain) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED_SHOP',
          message: 'Missing authenticated shop domain in request headers or query.',
        },
      });
    }

    const result = await clearAllNotificationsService(shopDomain);

    return res.status(200).json({
      success: true,
      message: 'All notifications cleared successfully from database.',
      data: {
        shopDomain,
        clearedCount: result.count,
      },
    });
  } catch (error) {
    logError(`❌ [NotificationController.clearAllNotifications] ${error.message}`);
    next(error);
  }
};

export default {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
};
