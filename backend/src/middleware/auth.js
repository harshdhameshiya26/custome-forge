/* eslint-env node */

export { verifyActiveSubscription } from './subscriptionValidator.js';
export { verifyShopifyWebhook } from './webhookValidator.js';
export { extractShopContext, requireShopper } from './shopper-auth.js';
export { authenticateUser, requireVerifiedUser } from './authenticate.js';
export {
  authenticateToken,
  verifyRole,
  requireMerchant,
  requireDesigner,
  requireSupplier,
  requireCustomer,
} from './auth.middleware.js';

export default {
  verifyActiveSubscription: (await import('./subscriptionValidator.js')).verifyActiveSubscription,
};

