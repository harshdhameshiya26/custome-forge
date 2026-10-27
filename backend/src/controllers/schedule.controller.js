/* eslint-env node */

import ScheduleService from '../services/scheduleService.js';
import { logError } from '../utils/logger.js';

const checkUserLoggedIn = (req, res) => {
  if (!req.user || !req.user._id) {
    res.status(401).json({
      success: false,
      message: 'User not logged in',
      error: 'Unauthorized',
    });
    return false;
  }
  return true;
};

/**
 * POST /api/schedules
 * Merchant endpoint to create a production schedule grouping 25–100 designs for a supplier.
 */
export const createSchedule = async (req, res, next) => {
  try {
    if (!checkUserLoggedIn(req, res)) return;
    const schedule = await ScheduleService.createSchedule(req.body, req.user);
    return res.status(201).json({
      success: true,
      message:
        'Schedule created successfully in PENDING status. Please request and verify an OTP to finalize and dispatch to the supplier.',
      data: schedule,
    });
  } catch (error) {
    logError(`[createSchedule] ${error.message}`);
    return next(error);
  }
};

/**
 * POST /api/schedules/:scheduleId/request-otp
 * Merchant endpoint to request a 6-digit confirmation OTP dispatched via email.
 */
export const requestScheduleOtp = async (req, res, next) => {
  try {
    if (!checkUserLoggedIn(req, res)) return;
    const { scheduleId } = req.params;
    const result = await ScheduleService.requestScheduleOtp(scheduleId, req.user);
    return res.status(200).json(result);
  } catch (error) {
    logError(`[requestScheduleOtp] ${error.message}`);
    return next(error);
  }
};

/**
 * POST /api/schedules/:scheduleId/verify-otp
 * Merchant endpoint to verify OTP and confirm the schedule.
 * Automatically dispatches selected designs to the supplier queue upon confirmation.
 */
export const verifyScheduleOtp = async (req, res, next) => {
  try {
    if (!checkUserLoggedIn(req, res)) return;
    const { scheduleId } = req.params;
    const { otp } = req.body;
    const result = await ScheduleService.verifyScheduleOtpAndConfirm(scheduleId, otp, req.user);
    return res.status(200).json(result);
  } catch (error) {
    logError(`[verifyScheduleOtp] ${error.message}`);
    return next(error);
  }
};

export const sendSupplierScheduleEmail = async (req, res, next) => {
  try {
    if (!checkUserLoggedIn(req, res)) return;
    const result = await ScheduleService.sendSupplierScheduleEmail(req.params.scheduleId, req.user);
    return res.status(200).json({
      success: true,
      message: result.scheduled || result.inProgress
        ? result.message
        : result.sent
          ? 'Schedule details emailed to the supplier.'
          : 'The supplier notification was not sent. Please retry.',
      data: result,
    });
  } catch (error) {
    logError(`[sendSupplierScheduleEmail] ${error.message}`);
    return next(error);
  }
};

/**
 * GET /api/schedules
 * List schedules with filtering and pagination.
 * Merchants see all; suppliers see only schedules assigned to them.
 */
export const listSchedules = async (req, res, next) => {
  try {
    if (!checkUserLoggedIn(req, res)) return;
    const result = await ScheduleService.listSchedules(req.query, req.user);
    return res.status(200).json(result);
  } catch (error) {
    logError(`[listSchedules] ${error.message}`);
    return next(error);
  }
};

/**
 * GET /api/schedules/:scheduleId
 * Fetch full schedule details with populated design summaries.
 */
export const getScheduleById = async (req, res, next) => {
  try {
    if (!checkUserLoggedIn(req, res)) return;
    const { scheduleId } = req.params;
    const result = await ScheduleService.getScheduleById(scheduleId, req.user);
    return res.status(200).json(result);
  } catch (error) {
    logError(`[getScheduleById] ${error.message}`);
    return next(error);
  }
};

export default {
  createSchedule,
  requestScheduleOtp,
  verifyScheduleOtp,
  sendSupplierScheduleEmail,
  listSchedules,
  getScheduleById,
};
