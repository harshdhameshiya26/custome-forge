/* eslint-env node */

import express from 'express';
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
} from '../controllers/notification.controller.js';
import { extractShopContext } from '../middleware/shopper-auth.js';

const router = express.Router();

/**
 * Feature: Centralized Application Notification System
 *
 * Route Definitions:
 *
 * 1. GET /api/notifications
 *    Fetch notifications for the authenticated merchant shop (newest first, with unread & pagination filters).
 *
 * 2. PATCH /api/notifications/read-all
 *    Mark all notifications as read for the connected shop.
 *    (Positioned before parameterized /:id to prevent route collision).
 *
 * 3. PATCH /api/notifications/:id/read
 *    Mark an individual notification as read.
 *
 * 4. DELETE /api/notifications/clear-all
 *    Purge/clear all notifications for the authenticated shop from the database.
 *    (Positioned before parameterized /:id to prevent route collision).
 *
 * 5. DELETE /api/notifications/:id
 *    Dismiss/delete an individual notification.
 */

// Middleware to normalize and extract shop context for multi-tenant isolation
router.use(extractShopContext);

// 1. Fetch notifications
router.get('/', getNotifications);

// 2. Bulk mark all as read
router.patch('/read-all', markAllNotificationsAsRead);

// 3. Mark single notification as read
router.patch('/:id/read', markNotificationAsRead);

// 4. Bulk clear all notifications from database
router.delete('/clear-all', clearAllNotifications);

// 5. Delete individual notification
router.delete('/:id', deleteNotification);

export default router;
