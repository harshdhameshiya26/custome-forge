/* eslint-env node */

import { z } from 'zod';

/**
 * Zod validation schema for Supplier Registration
 */
export const supplierRegisterSchema = z.object({
  body: z.object({
    fullName: z
      .string({ required_error: 'fullName is required' })
      .trim()
      .min(2, 'fullName must be at least 2 characters')
      .max(120, 'fullName must not exceed 120 characters'),

    email: z
      .string({ required_error: 'email is required' })
      .trim()
      .toLowerCase()
      .email('email must be a valid email address'),

    password: z
      .string({ required_error: 'password is required' })
      .min(8, 'password must be at least 8 characters')
      .max(128, 'password must not exceed 128 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'password must contain at least one uppercase letter, one lowercase letter, and one digit',
      ),

    // Category specialization selection (e.g., apparel, leather, drinkware, metal, paper)
    category: z
      .string({ required_error: 'category specialization is required for supplier registration' })
      .trim()
      .min(2, 'category must be at least 2 characters')
      .max(100, 'category must not exceed 100 characters'),

    shop: z.string().trim().toLowerCase().optional(),
    preferences: z.record(z.unknown()).optional(),
  }),
});

/**
 * Zod validation schema for Supplier Schedule Creation.
 * Strictly enforces that selected designIds must be between 25 and 100 items.
 */
export const createScheduleSchema = z.object({
  body: z.object({
    supplierId: z
      .string({ required_error: 'supplierId is required' })
      .trim()
      .min(1, 'supplierId cannot be empty'),

    category: z
      .string({ required_error: 'category is required' })
      .trim()
      .min(2, 'category must be at least 2 characters')
      .toLowerCase(),

    designIds: z
      .array(
        z.string().trim().min(1, 'design ID cannot be empty'),
        { required_error: 'designIds is required' }
      )
      .min(25, 'Per schedule, the number of selected designs is strictly fixed between a minimum of 25 and a maximum of 100 designs. Received fewer than 25.')
      .max(100, 'Per schedule, the number of selected designs is strictly fixed between a minimum of 25 and a maximum of 100 designs. Received more than 100.'),

    scheduledAt: z
      .string({ required_error: 'scheduledAt is required' })
      .refine((val) => !isNaN(Date.parse(val)), {
        message: 'scheduledAt must be a valid ISO 8601 date string',
      }),

    notes: z.string().trim().max(1000).optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

/**
 * Schema for verifying merchant OTP on a pending schedule
 */
export const verifyScheduleOtpSchema = z.object({
  body: z.object({
    otp: z
      .string({ required_error: 'otp is required' })
      .trim()
      .length(6, 'OTP must be exactly 6 digits')
      .regex(/^\d{6}$/, 'OTP must be 6 numeric digits'),
  }),
  params: z.object({
    scheduleId: z.string({ required_error: 'scheduleId is required' }).trim().min(1),
  }),
});

/**
 * Schema for requesting OTP for schedule finalization
 */
export const requestScheduleOtpSchema = z.object({
  params: z.object({
    scheduleId: z.string({ required_error: 'scheduleId is required' }).trim().min(1),
  }),
});

/**
 * Schema for querying schedules
 */
export const queryScheduleSchema = z.object({
  query: z.object({
    supplierId: z.string().trim().optional(),
    category: z.string().trim().toLowerCase().optional(),
    status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']).optional(),
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
  }),
});
