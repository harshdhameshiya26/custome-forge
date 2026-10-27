/* eslint-env node */

/**
 * emailService.js
 * ───────────────
 * Nodemailer-based email transport for CustomForge.
 *
 * Environment variables (add to backend/.env):
 *   EMAIL_HOST     — SMTP host          (e.g. smtp.gmail.com)
 *   EMAIL_PORT     — SMTP port          (e.g. 587 for TLS, 465 for SSL)
 *   EMAIL_SECURE   — "true" for SSL/465, "false" for STARTTLS/587
 *   EMAIL_USER     — SMTP login username / Gmail address
 *   EMAIL_PASS     — SMTP password or Gmail App Password
 *   EMAIL_FROM     — Verified sender address aligned with the sending domain
 *   SENDGRID_API_KEY — SendGrid SMTP API key (alternative to EMAIL_HOST credentials)
 *   EMAIL_FROM_ADDRESS / EMAIL_FROM_NAME — Explicit authenticated sender
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logSuccess, logError, logWarn } from '../utils/logger.js';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: envPath });

// ─────────────────────────────────────────────────────────────────────────────
// Transporter factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build and return a Nodemailer transporter.
 * Uses Ethereal only in development when no SMTP or SendGrid transport is configured.
 */
const createTransporter = async () => {
  const host = process.env.EMAIL_HOST;
  const sendGridApiKey = process.env.SENDGRID_API_KEY;

  if (sendGridApiKey) {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'apikey', pass: sendGridApiKey },
      connectionTimeout: 10_000,
      greetingTimeout: 5_000,
      socketTimeout: 15_000,
      tls: { minVersion: 'TLSv1.2' },
    });
  }

  // Use a test mailbox only outside production; never silently discard live email.
  if (!host) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Email delivery is not configured. Set SENDGRID_API_KEY or EMAIL_HOST and SMTP credentials.',
      );
    }
    logWarn(
      '[EmailService] EMAIL_HOST not set — creating Ethereal test account. ' +
        'Preview URLs will be logged to the console.',
    );
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  const smtpUser = process.env.EMAIL_USER;
  const smtpPassword = process.env.EMAIL_PASS;
  if (Boolean(smtpUser) !== Boolean(smtpPassword)) {
    throw new Error('Configure both EMAIL_USER and EMAIL_PASS for authenticated SMTP delivery.');
  }

  // ── Production: SMTP via env vars ──────────────────────────────────────────
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true', // true = SSL/465, false = STARTTLS
    requireTLS: process.env.EMAIL_SECURE !== 'true',
    ...(smtpUser ? { auth: { user: smtpUser, pass: smtpPassword } } : {}),
    // Sensible timeouts — prevents hanging on network issues
    connectionTimeout: 10_000, // 10 s
    greetingTimeout: 5_000,    //  5 s
    socketTimeout: 15_000,     // 15 s
    tls: { minVersion: 'TLSv1.2' },
  });
};

// Lazily-created singleton — avoids re-creating on every request
let _transporter = null;

const getTransporter = async () => {
  if (!_transporter) {
    _transporter = await createTransporter();

    // Verify connectivity once at startup (non-fatal)
    try {
      await _transporter.verify();
      logSuccess('[EmailService] SMTP transporter is ready.');
    } catch (verifyErr) {
      logError(`[EmailService] SMTP verification failed: ${verifyErr.message}`);
      // Don't throw — allow the server to boot; delivery will surface per-send
    }
  }
  return _transporter;
};

const getFromAddress = () => {
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  if (fromAddress) {
    if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(fromAddress)) {
      throw new Error('EMAIL_FROM_ADDRESS must be a valid email address.');
    }
    const name = (process.env.EMAIL_FROM_NAME || 'CustomForge').replace(/[\r\n"]/g, '').trim();
    return { name: name || 'CustomForge', address: fromAddress };
  }

  if (process.env.EMAIL_FROM) {
    if (/[\r\n]/.test(process.env.EMAIL_FROM)) {
      throw new Error('EMAIL_FROM contains invalid header characters.');
    }
    return process.env.EMAIL_FROM;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Email sender is not configured. Set EMAIL_FROM_ADDRESS to an address on an authenticated sending domain.',
    );
  }

  return process.env.EMAIL_USER?.includes('@')
    ? { name: 'CustomForge', address: process.env.EMAIL_USER }
    : { name: 'CustomForge', address: 'noreply@customforge.com' };
};

const getStandardHeaders = () => ({
  'X-Mailer': 'CustomForge Transactional Mail',
  'Auto-Submitted': 'auto-generated',
});

// ─────────────────────────────────────────────────────────────────────────────
// HTML / plain-text OTP template
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the OTP email payload.
 * @param {string} fullName    — Recipient's display name
 * @param {string} otp         — 6-digit code
 * @param {number} expiryMs    — Expiry duration in milliseconds (for display copy)
 */
const buildOtpTemplate = (fullName, otp, expiryMs) => {
  const expirySeconds = Math.round(expiryMs / 1000);
  const expiryLabel =
    expirySeconds < 60
      ? `${expirySeconds} seconds`
      : `${Math.round(expirySeconds / 60)} minutes`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CustomForge — Verification Code</title>
  <style>
    body {
      margin: 0; padding: 0;
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
    }
    .wrapper {
      max-width: 560px;
      margin: 40px auto;
      background: #1a1a1a;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #2a2a2a;
    }
    .header {
      background: linear-gradient(135deg, #6c47ff 0%, #a855f7 100%);
      padding: 32px 40px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.5px;
    }
    .header p {
      margin: 6px 0 0;
      font-size: 13px;
      color: rgba(255,255,255,0.75);
    }
    .body {
      padding: 36px 40px;
    }
    .body p {
      margin: 0 0 16px;
      font-size: 15px;
      line-height: 1.6;
      color: #c0c0c0;
    }
    .otp-box {
      margin: 28px 0;
      text-align: center;
    }
    .otp-code {
      display: inline-block;
      font-size: 42px;
      font-weight: 800;
      letter-spacing: 12px;
      color: #a855f7;
      background: #0f0f0f;
      border: 2px solid #3a2a5e;
      border-radius: 10px;
      padding: 16px 32px;
    }
    .expiry-note {
      margin: 20px 0 0;
      font-size: 13px;
      color: #888;
      text-align: center;
    }
    .expiry-note strong {
      color: #f59e0b;
    }
    .divider {
      border: none;
      border-top: 1px solid #2a2a2a;
      margin: 28px 0;
    }
    .footer {
      padding: 20px 40px 28px;
      text-align: center;
    }
    .footer p {
      margin: 0;
      font-size: 12px;
      color: #555;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>CustomForge</h1>
      <p>Professional Custom Print Platform</p>
    </div>

    <div class="body">
      <p>Hi <strong>${escapeHtml(fullName || 'there')}</strong>,</p>
      <p>
        You requested a verification code for your CustomForge account.
        Use the code below to complete your verification:
      </p>

      <div class="otp-box">
        <span class="otp-code">${otp}</span>
      </div>

      <p class="expiry-note">
        ⏳ This code expires in <strong>${expiryLabel}</strong>.
        Do not share it with anyone.
      </p>

      <hr class="divider" />

      <p>
        If you didn't request this code, you can safely ignore this email.
        Your account remains secure.
      </p>
    </div>

    <div class="footer">
      <p>
        &copy; ${new Date().getFullYear()} CustomForge. All rights reserved.<br />
        This is an automated message — please do not reply.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = [
    `CustomForge — Verification Code`,
    ``,
    `Hi ${fullName || 'there'},`,
    ``,
    `Your verification code is: ${otp}`,
    ``,
    `This code expires in ${expiryLabel}. Do not share it with anyone.`,
    ``,
    `If you didn't request this code, please ignore this email.`,
    ``,
    `— The CustomForge Team`,
  ].join('\n');

  return { html, text };
};

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * sendOtpEmail
 * ────────────
 * Send a 6-digit OTP to the specified email address.
 *
 * @param {object} options
 * @param {string} options.to          — Recipient email address
 * @param {string} options.fullName    — Recipient display name (for salutation)
 * @param {string} options.otp         — The 6-digit code to send
 * @param {number} options.expiryMs    — Expiry duration in milliseconds (for copy)
 *
 * @throws {Error} Rethrows transport errors after logging, so callers can
 *                 decide whether to surface the failure or swallow it.
 */
export const sendOtpEmail = async ({ to, fullName, otp, expiryMs }) => {
  const transporter = await getTransporter();
  const { html, text } = buildOtpTemplate(fullName, otp, expiryMs);

  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject: `${otp} — Your CustomForge Verification Code`,
    text,
    html,
    headers: getStandardHeaders(),
    ...(process.env.EMAIL_REPLY_TO ? { replyTo: process.env.EMAIL_REPLY_TO } : {}),
  });

  // In development with Ethereal, log the preview URL so you can inspect the email
  if (!process.env.EMAIL_HOST && !process.env.SENDGRID_API_KEY) {
    logWarn(`[EmailService] Ethereal preview URL: ${nodemailer.getTestMessageUrl(info)}`);
  }

  logSuccess(`[EmailService] OTP email sent to: ${to} (messageId: ${info.messageId})`);
  return info;
};

/**
 * sendGenericEmail
 * ────────────────
 * Thin wrapper for sending arbitrary emails (welcome messages, notifications, etc.).
 *
 * @param {object} options
 * @param {string}   options.to       — Recipient email
 * @param {string}   options.subject  — Email subject line
 * @param {string}   options.html     — HTML body
 * @param {string}   [options.text]   — Optional plain-text fallback
 */
export const sendGenericEmail = async ({ to, subject, html, text, attachments = [] }) => {
  if (!Array.isArray(attachments)) {
    throw new TypeError('Email attachments must be provided as an array.');
  }
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    html,
    text: text || '',
    attachments,
    headers: getStandardHeaders(),
    ...(process.env.EMAIL_REPLY_TO ? { replyTo: process.env.EMAIL_REPLY_TO } : {}),
  });

  if (!process.env.EMAIL_HOST && !process.env.SENDGRID_API_KEY) {
    logWarn(`[EmailService] Ethereal preview URL: ${nodemailer.getTestMessageUrl(info)}`);
  }

  logSuccess(`[EmailService] Email sent to: ${to} (messageId: ${info.messageId})`);
  return info;
};
