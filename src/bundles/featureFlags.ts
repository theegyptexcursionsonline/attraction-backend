import { RequestHandler } from 'express';
import { env } from '../config/env';
import { BundleLaunchMode, ITenant } from '../types';
import { sendError } from '../utils/response';
import { getBundleLaunchReadiness } from '../services/bundleLaunchReadiness.service';

export type BundleFeature = 'discovery' | 'checkout' | 'recovery';

export const isBundleFeatureEnabled = (feature: BundleFeature): boolean => {
  if (feature === 'discovery') return env.bundleDiscoveryEnabled;
  if (feature === 'checkout') return env.bundleCheckoutEnabled;
  return env.bundleRecoveryEnabled;
};

export const requireBundleFeature = (feature: BundleFeature): RequestHandler =>
  (_req, res, next) => {
    if (!isBundleFeatureEnabled(feature)) {
      sendError(res, 'Bundle service is not available', 503);
      return;
    }
    next();
  };

export const requireTenantBundleMode = (
  allowedModes: readonly BundleLaunchMode[]
): RequestHandler => (req, res, next) => {
  const tenant = (req as typeof req & {
    tenant?: { bundleSettings?: { mode?: BundleLaunchMode } };
  }).tenant;
  if (!tenant) {
    sendError(res, 'Tenant context required', 400);
    return;
  }
  const mode = tenant.bundleSettings?.mode || 'discovery';
  const isCheckoutGate = allowedModes.includes('test') || allowedModes.includes('live');
  if (isCheckoutGate && 'status' in tenant && tenant.status !== 'active') {
    sendError(res, 'Bundle checkout is not active for this storefront', 503);
    return;
  }
  if (!allowedModes.includes(mode)) {
    sendError(
      res,
      isCheckoutGate
        ? 'Bundle checkout is not active for this storefront'
        : 'Bundle discovery is not active for this storefront',
      503
    );
    return;
  }
  next();
};

/** Re-evaluate operational launch gates at the exact point a new hold starts. */
export const requireTenantBundleCheckoutReady: RequestHandler = async (req, res, next) => {
  const tenant = (req as typeof req & { tenant?: ITenant }).tenant;
  if (!tenant) {
    sendError(res, 'Tenant context required', 400);
    return;
  }
  try {
    const readiness = await getBundleLaunchReadiness(tenant);
    if (!readiness.acceptingCheckout) {
      sendError(res, 'Bundle checkout is temporarily unavailable for this storefront', 503);
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};
