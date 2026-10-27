/* eslint-env node */

import { z } from 'zod';

/**
 * Zod validation schema for Supplier Registration
 * Ensures supplier registration strictly captures category specialization.
 */
export const supplierRegisterSchema = z.object({
  body: z
    .object({
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
      category: z.string().trim().min(2, 'category must be at least 2 characters').max(100).optional(),
      supplierCategory: z.string().trim().min(2, 'supplierCategory must be at least 2 characters').max(100).optional(),

      shop: z.string().trim().toLowerCase().optional(),
      preferences: z.record(z.unknown()).optional(),
    })
    .superRefine((data, ctx) => {
      const cat = (data.category || data.supplierCategory || '').trim();
      if (!cat || cat.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'category specialization is required for supplier registration',
          path: ['category'],
        });
      }
    }),
});

/**
 * Zod validation schema for Supplier Production Schedule Creation
 * Strictly enforces design count rule: per schedule, the number of selected designs
 * must be strictly between 25 (minimum) and 100 (maximum) designs.
 */
export const createScheduleSchema = z.object({
  body: z
    .object({
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
          { invalid_type_error: 'designIds must be an array' },
        )
        .optional(),

      orderIds: z
        .array(
          z.string().trim().min(1, 'order ID cannot be empty'),
          { invalid_type_error: 'orderIds must be an array' },
        )
        .optional(),

      scheduledAt: z
        .string({ required_error: 'scheduledAt is required' })
        .refine((val) => !isNaN(Date.parse(val)), {
          message: 'scheduledAt must be a valid ISO 8601 date string',
        }),

      notes: z.string().trim().max(1000).optional(),
      metadata: z.record(z.unknown()).optional(),
    })
    .superRefine((body, context) => {
      const hasOrderIds = Array.isArray(body.orderIds);
      const hasDesignIds = Array.isArray(body.designIds);

      // If neither is provided
      if (!hasOrderIds && !hasDesignIds) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Per schedule, the number of selected designs must be strictly between 25 (minimum) and 100 (maximum) designs.',
          path: ['designIds'],
        });
        return;
      }

      // If both are provided
      if (hasOrderIds && hasDesignIds) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Provide either paid custom order IDs or saved design IDs, but not both.',
          path: ['designIds'],
        });
        return;
      }

      // If designIds is provided, strictly enforce 25 to 100 designs
      if (hasDesignIds) {
        if (body.designIds.length < 25 || body.designIds.length > 100) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Per schedule, the number of selected designs must be strictly between 25 (minimum) and 100 (maximum) designs.',
            path: ['designIds'],
          });
        }

        if (new Set(body.designIds).size !== body.designIds.length) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Each design can only be included once in a schedule.',
            path: ['designIds'],
          });
        }
      }

      // Paid custom orders workflow
      if (hasOrderIds) {
        if (body.orderIds.length === 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Select at least one paid custom order.',
            path: ['orderIds'],
          });
        }

        if (new Set(body.orderIds).size !== body.orderIds.length) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Each paid custom order can only be selected once.',
            path: ['orderIds'],
          });
        }
      }
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

export default {
  supplierRegisterSchema,
  createScheduleSchema,
  verifyScheduleOtpSchema,
  requestScheduleOtpSchema,
  queryScheduleSchema,
};
