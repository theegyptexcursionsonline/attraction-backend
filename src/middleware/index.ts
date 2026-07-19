export {
  authenticate,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireSuperAdmin,
  canAccessTenant,
} from './auth.middleware';

export {
  resolveTenant,
  requireTenant,
  optionalTenant,
} from './tenant.middleware';

export {
  AppError,
  notFoundHandler,
  errorHandler,
} from './error.middleware';

export {
  validate,
  validateQuery,
  validateParams,
} from './validate.middleware';

export {
  apiLimiter,
  authLimiter,
  passwordResetLimiter,
  bookingLimiter,
  publicWriteLimiter,
  paymentLimiter,
  uploadLimiter,
  aiGenerationLimiter,
  searchLimiter,
} from './rate-limit.middleware';

export {
  authenticateApiKey,
  requireScope,
} from './apiKey.middleware';
