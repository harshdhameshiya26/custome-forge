/* eslint-env node */

import { EventEmitter } from 'node:events';
import prisma from '../config/prisma.js';
import Notification, {
  NOTIFICATION_TYPES,
  NOTIFICATION_SEVERITIES,
} from '../models/notification.model.js';
import { logError, logSuccess, logWarn } from '../utils/logger.js';

/**
 * Event emitter for real-time application notification broadcasting
 * (e.g. WebSockets, Server-Sent Events, or internal audit pipelines).
 */
class NotificationEmitter extends EventEmitter {}
export const notificationEmitter = new NotificationEmitter();

/**
 * Normalizes shop domains to lowercase stripped format (e.g., "my-shop.myshopify.com").
 * @param {string} rawShop
 * @returns {string}
 */
export const normalizeShopDomain = (rawShop) => {
  if (!rawShop || typeof rawShop !== 'string') return '';
  return rawShop
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
};

/**
 * Formats a raw database notification record to a clean, consistent Polaris-ready JSON shape.
 * @param {Object} item
 * @returns {Object}
 */
const formatNotification = (item) => {
  if (!item) return null;
  const raw = item.toObject ? item.toObject() : item;
  return {
    id: raw.id ? raw.id.toString() : raw._id ? raw._id.toString() : '',
    shopDomain: raw.shopDomain,
    type: raw.type,
    severity: raw.severity,
    title: raw.title,
    message: raw.message,
    read: Boolean(raw.read),
    createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : raw.createdAt,
  };
};

/**
 * Centralized service layer method to persist a new notification directly to MongoDB.
 * Utilizes Prisma ORM with automatic resilient fallback to Mongoose.
 *
 * @param {Object} params
 * @param {string} params.shopDomain - Shopify merchant shop domain
 * @param {'BILLING_CHANGE'|'SUBSCRIPTION_CANCELLED'|'FEATURE_ERROR'|'SYSTEM_ALERT'|'ORDER_UPDATE'} params.type - Category enum
 * @param {'INFO'|'SUCCESS'|'WARNING'|'ERROR'} [params.severity='INFO'] - Polaris badge/status severity
 * @param {string} params.title - Short header for the top-right notification toast
 * @param {string} params.message - Detailed descriptive message
 * @returns {Promise<Object>} The persisted notification record
 */
export const createNotification = async ({
  shopDomain,
  type,
  severity = 'INFO',
  title,
  message,
}) => {
  const normalizedShop = normalizeShopDomain(shopDomain);

  // 1. Validation
  if (!normalizedShop) {
    throw new Error('Notification creation failed: "shopDomain" is required.');
  }

  if (!type || !NOTIFICATION_TYPES.includes(type)) {
    throw new Error(
      `Notification creation failed: Invalid type "${type}". Must be one of: ${NOTIFICATION_TYPES.join(', ')}`,
    );
  }

  const normalizedSeverity = (severity || 'INFO').toUpperCase();
  if (!NOTIFICATION_SEVERITIES.includes(normalizedSeverity)) {
    throw new Error(
      `Notification creation failed: Invalid severity "${severity}". Must be one of: ${NOTIFICATION_SEVERITIES.join(', ')}`,
    );
  }

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new Error('Notification creation failed: "title" must be a non-empty string.');
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new Error('Notification creation failed: "message" must be a non-empty string.');
  }

  const payload = {
    shopDomain: normalizedShop,
    type,
    severity: normalizedSeverity,
    title: title.trim().slice(0, 255),
    message: message.trim(),
    read: false,
    createdAt: new Date(),
  };

  let persistedRecord = null;

  // 2. Primary Persistence via Prisma ORM
  if (prisma?.notification) {
    try {
      persistedRecord = await prisma.notification.create({
        data: {
          shopDomain: payload.shopDomain,
          type: payload.type,
          severity: payload.severity,
          title: payload.title,
          message: payload.message,
          read: payload.read,
          createdAt: payload.createdAt,
        },
      });
    } catch (prismaErr) {
      logWarn(
        `⚠️ Prisma Notification.create failed (${prismaErr.message}). Falling back to Mongoose.`,
      );
    }
  }

  // 3. Fallback Persistence via Mongoose
  if (!persistedRecord) {
    try {
      persistedRecord = await Notification.create(payload);
    } catch (mongoErr) {
      logError(`❌ Fatal: Notification persistence failed in both Prisma and Mongoose: ${mongoErr.message}`);
      throw mongoErr;
    }
  }

  const formatted = formatNotification(persistedRecord);

  // 4. Emit live event for internal subscribers / UI streams
  try {
    notificationEmitter.emit('notification:created', formatted);
  } catch (emitErr) {
    logWarn(`⚠️ Notification event emit warning: ${emitErr.message}`);
  }

  logSuccess(
    `🔔 [Notification Created] [${formatted.severity}] [${formatted.type}] for ${formatted.shopDomain}: "${formatted.title}"`,
  );

  return formatted;
};

/**
 * Retrieves notifications for an authenticated merchant shop domain,
 * sorted newest first, with optional unread filtering and pagination.
 *
 * @param {Object} params
 * @param {string} params.shopDomain
 * @param {boolean} [params.unreadOnly=false]
 * @param {number} [params.limit=20]
 * @param {number} [params.page=1]
 * @returns {Promise<{ notifications: Array, unreadCount: number, total: number, page: number, limit: number, hasMore: boolean }>}
 */
export const getNotifications = async ({
  shopDomain,
  unreadOnly = false,
  limit = 20,
  page = 1,
}) => {
  const normalizedShop = normalizeShopDomain(shopDomain);
  if (!normalizedShop) {
    throw new Error('Shop domain is required to fetch notifications.');
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  let notifications = [];
  let total = 0;
  let unreadCount = 0;

  // 1. Try Prisma ORM
  if (prisma?.notification) {
    try {
      const whereClause = {
        shopDomain: normalizedShop,
        ...(unreadOnly ? { read: false } : {}),
      };

      const [items, totalItems, unreadTotal] = await Promise.all([
        prisma.notification.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          skip,
          take: safeLimit,
        }),
        prisma.notification.count({ where: whereClause }),
        prisma.notification.count({
          where: { shopDomain: normalizedShop, read: false },
        }),
      ]);

      notifications = items.map(formatNotification);
      total = totalItems;
      unreadCount = unreadTotal;

      return {
        notifications,
        unreadCount,
        total,
        page: safePage,
        limit: safeLimit,
        hasMore: skip + notifications.length < total,
      };
    } catch (prismaErr) {
      logWarn(`⚠️ Prisma notification query error (${prismaErr.message}). Using Mongoose fallback.`);
    }
  }

  // 2. Mongoose Fallback
  const mongoQuery = {
    shopDomain: normalizedShop,
    ...(unreadOnly ? { read: false } : {}),
  };

  const [items, totalItems, unreadTotal] = await Promise.all([
    Notification.find(mongoQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Notification.countDocuments(mongoQuery),
    Notification.countDocuments({ shopDomain: normalizedShop, read: false }),
  ]);

  notifications = items.map(formatNotification);
  total = totalItems;
  unreadCount = unreadTotal;

  return {
    notifications,
    unreadCount,
    total,
    page: safePage,
    limit: safeLimit,
    hasMore: skip + notifications.length < total,
  };
};

/**
 * Marks an individual notification as read. Enforces multi-tenant shop isolation.
 *
 * @param {Object} params
 * @param {string} params.id - Notification ID
 * @param {string} params.shopDomain - Authenticated merchant shop domain
 * @returns {Promise<Object|null>}
 */
export const markNotificationAsRead = async ({ id, shopDomain }) => {
  const normalizedShop = normalizeShopDomain(shopDomain);
  if (!id || !normalizedShop) {
    throw new Error('Both notification "id" and "shopDomain" are required.');
  }

  let updated = null;

  // 1. Try Prisma ORM
  if (prisma?.notification) {
    try {
      // Find first to guarantee tenant ownership
      const existing = await prisma.notification.findFirst({
        where: { id, shopDomain: normalizedShop },
      });

      if (!existing) return null;

      updated = await prisma.notification.update({
        where: { id },
        data: { read: true },
      });
    } catch (prismaErr) {
      logWarn(`⚠️ Prisma markAsRead error (${prismaErr.message}). Using Mongoose fallback.`);
    }
  }

  // 2. Mongoose Fallback
  if (!updated) {
    updated = await Notification.findOneAndUpdate(
      { _id: id, shopDomain: normalizedShop },
      { $set: { read: true } },
      { new: true },
    );
  }

  if (updated) {
    const formatted = formatNotification(updated);
    notificationEmitter.emit('notification:read', formatted);
    return formatted;
  }

  return null;
};

/**
 * Marks all notifications for a specific shop domain as read.
 *
 * @param {string} shopDomain - Authenticated merchant shop domain
 * @returns {Promise<{ count: number }>}
 */
export const markAllNotificationsAsRead = async (shopDomain) => {
  const normalizedShop = normalizeShopDomain(shopDomain);
  if (!normalizedShop) {
    throw new Error('Shop domain is required to mark all notifications as read.');
  }

  let count = 0;

  // 1. Try Prisma ORM
  if (prisma?.notification) {
    try {
      const result = await prisma.notification.updateMany({
        where: { shopDomain: normalizedShop, read: false },
        data: { read: true },
      });
      count = result.count;
    } catch (prismaErr) {
      logWarn(`⚠️ Prisma markAllAsRead error (${prismaErr.message}). Using Mongoose fallback.`);
    }
  }

  // 2. Mongoose Fallback
  if (count === 0 && (!prisma?.notification)) {
    const result = await Notification.updateMany(
      { shopDomain: normalizedShop, read: false },
      { $set: { read: true } },
    );
    count = result.modifiedCount || 0;
  }

  notificationEmitter.emit('notifications:all-read', { shopDomain: normalizedShop, count });
  return { count };
};

/**
 * Deletes/dismisses an individual notification by ID for an authenticated shop.
 *
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.shopDomain
 * @returns {Promise<boolean>} True if record was found and deleted
 */
export const deleteNotification = async ({ id, shopDomain }) => {
  const normalizedShop = normalizeShopDomain(shopDomain);
  if (!id || !normalizedShop) {
    throw new Error('Both notification "id" and "shopDomain" are required.');
  }

  let deleted = false;

  // 1. Try Prisma ORM
  if (prisma?.notification) {
    try {
      const existing = await prisma.notification.findFirst({
        where: { id, shopDomain: normalizedShop },
      });

      if (!existing) return false;

      await prisma.notification.delete({
        where: { id },
      });
      deleted = true;
    } catch (prismaErr) {
      logWarn(`⚠️ Prisma deleteNotification error (${prismaErr.message}). Using Mongoose fallback.`);
    }
  }

  // 2. Mongoose Fallback
  if (!deleted) {
    const result = await Notification.findOneAndDelete({
      _id: id,
      shopDomain: normalizedShop,
    });
    deleted = Boolean(result);
  }

  if (deleted) {
    notificationEmitter.emit('notification:deleted', { id, shopDomain: normalizedShop });
  }

  return deleted;
};

/**
 * Permanently clears all notifications for the authenticated shop domain from the database.
 * Backs the UI "Clear all" action.
 *
 * @param {string} shopDomain - Authenticated merchant shop domain
 * @returns {Promise<{ count: number }>}
 */
export const clearAllNotifications = async (shopDomain) => {
  const normalizedShop = normalizeShopDomain(shopDomain);
  if (!normalizedShop) {
    throw new Error('Shop domain is required to clear notifications.');
  }

  let count = 0;

  // 1. Try Prisma ORM
  if (prisma?.notification) {
    try {
      const result = await prisma.notification.deleteMany({
        where: { shopDomain: normalizedShop },
      });
      count = result.count;
    } catch (prismaErr) {
      logWarn(`⚠️ Prisma clearAllNotifications error (${prismaErr.message}). Using Mongoose fallback.`);
    }
  }

  // 2. Mongoose Fallback
  if (count === 0 && (!prisma?.notification)) {
    const result = await Notification.deleteMany({ shopDomain: normalizedShop });
    count = result.deletedCount || 0;
  }

  notificationEmitter.emit('notifications:cleared', { shopDomain: normalizedShop, count });
  logSuccess(`🧹 [Notifications Cleared] Removed ${count} notifications for ${normalizedShop}`);

  return { count };
};

/**
 * Quick helper to get unread notifications count for badge display.
 *
 * @param {string} shopDomain
 * @returns {Promise<number>}
 */
export const getUnreadCount = async (shopDomain) => {
  const normalizedShop = normalizeShopDomain(shopDomain);
  if (!normalizedShop) return 0;

  if (prisma?.notification) {
    try {
      return await prisma.notification.count({
        where: { shopDomain: normalizedShop, read: false },
      });
    } catch (err) {
      logWarn(`⚠️ Prisma getUnreadCount error: ${err.message}`);
    }
  }

  return await Notification.countDocuments({
    shopDomain: normalizedShop,
    read: false,
  });
};

export default {
  createNotification,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
  getUnreadCount,
  normalizeShopDomain,
  notificationEmitter,
  NOTIFICATION_TYPES,
  NOTIFICATION_SEVERITIES,
};
