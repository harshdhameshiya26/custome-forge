/* eslint-env node */

import { z } from 'zod';

// ─────────────────────────────────────────────
// Register User
// ─────────────────────────────────────────────
export const registerSchema = z.object({
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

    // Role assignment
    role: z.enum(['customer', 'designer', 'merchant', 'supplier']).optional().default('customer'),

    // Category option for supplier registration
    category: z.string().trim().optional(),
    supplierCategory: z.string().trim().optional(),

    // Optional Shopify linkage
    shop: z.string().trim().toLowerCase().optional(),
    shopifyCustomerId: z.string().trim().optional(),

    // Optional preferences blob
    preferences: z.record(z.unknown()).optional(),
  }),
});

// ─────────────────────────────────────────────
// Request OTP (send or verify)
// ─────────────────────────────────────────────
export const requestOtpSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'email is required' })
      .trim()
      .toLowerCase()
      .email('email must be a valid email address'),
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'email is required' })
      .trim()
      .toLowerCase()
      .email('email must be a valid email address'),
    otp: z
      .string({ required_error: 'otp is required' })
      .trim()
      .length(6, 'OTP must be exactly 6 digits')
      .regex(/^\d{6}$/, 'OTP must be 6 numeric digits'),
  }),
});

// ─────────────────────────────────────────────
// Login User
// ─────────────────────────────────────────────
export const loginSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'email is required' })
      .trim()
      .toLowerCase()
      .email('email must be a valid email address'),
    password: z
      .string({ required_error: 'password is required' })
      .min(1, 'password is required'),
  }),
});

// ─────────────────────────────────────────────
// Update Profile
// ─────────────────────────────────────────────
export const updateProfileSchema = z.object({
  body: z
    .object({
      fullName: z
        .string()
        .trim()
        .min(2, 'fullName must be at least 2 characters')
        .max(120, 'fullName must not exceed 120 characters')
        .optional(),

      email: z
        .string()
        .trim()
        .toLowerCase()
        .email('email must be a valid email address')
        .optional(),

      preferences: z.record(z.unknown()).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field (fullName, email, preferences) must be provided',
    }),
});

// ─────────────────────────────────────────────
// Delete User (requires password confirmation)
// ─────────────────────────────────────────────
export const deleteUserSchema = z.object({
  body: z.object({
    password: z
      .string({ required_error: 'password confirmation is required' })
      .min(1, 'password is required'),
  }),
});

// ─────────────────────────────────────────────
// Refresh Token
// ─────────────────────────────────────────────
export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z
      .string({ required_error: 'refreshToken is required' })
      .min(1, 'refreshToken is required'),
  }),
});
