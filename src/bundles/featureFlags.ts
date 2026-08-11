import { RequestHandler } from 'express';
import { env } from '../config/env';
import { sendError } from '../utils/response';

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
