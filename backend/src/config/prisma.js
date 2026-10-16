/* eslint-env node */

import { PrismaClient } from '@prisma/client';
import { logWarn, logError } from '../utils/logger.js';

let prismaInstance = null;

try {
  if (process.env.NODE_ENV === 'production') {
    prismaInstance = new PrismaClient({
      log: ['error', 'warn'],
    });
  } else {
    if (!global.__customForgePrisma) {
      global.__customForgePrisma = new PrismaClient({
        log: ['error', 'warn'],
      });
    }
    prismaInstance = global.__customForgePrisma;
  }
} catch (error) {
  logWarn(`⚠️ PrismaClient initialization warning: ${error.message}. DB queries via Prisma may fail until "npm run db:generate" is run.`);
}

/**
 * Global Prisma Client singleton instance.
 */
export const prisma = prismaInstance;
export default prisma;
