/* eslint-env node */

import {
  authenticateToken,
  requireVerifiedUser,
  verifyRole,
  requireActionOtp,
  requireMerchant,
  requireSupplier,
  requireDesigner,
  requireCustomer,
  requireCoreRole,
} from './auth.middleware.js';

export const authenticateUser = authenticateToken;

export {
  authenticateToken,
  requireVerifiedUser,
  verifyRole,
  requireActionOtp,
  requireMerchant,
  requireSupplier,
  requireDesigner,
  requireCustomer,
  requireCoreRole,
};

export default {
  authenticateUser,
  authenticateToken,
  requireVerifiedUser,
  verifyRole,
  requireActionOtp,
  requireMerchant,
  requireSupplier,
  requireDesigner,
  requireCustomer,
  requireCoreRole,
};
