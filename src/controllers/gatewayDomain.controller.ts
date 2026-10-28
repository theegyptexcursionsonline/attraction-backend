import { NextFunction, Request, Response } from 'express';
import { resolveGatewayDomain } from '../services/gatewayDomain.service';
import { sendError, sendSuccess } from '../utils/response';
import { createGatewayDomainOwnership, GatewayOwnershipConflict } from '../services/gatewayDomainOwnership.service';
import { CustomDomainValidationError } from '../utils/customDomain';
import { AuthRequest } from '../types';
import { legacyDomainWriteBlocked } from '../services/gatewayDomainScope';

export async function getGatewayDomain(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  if (process.env.GATEWAY_DOMAIN_RESOLVER_ENABLED !== 'true' || process.env.GATEWAY_DOMAIN_NAMESPACE_READY !== 'true' ||
      process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED !== 'true') {
    sendError(res, 'Domain lookup unavailable', 503); return;
  }
  try {
    if (!legacyDomainWriteBlocked(req.params.hostname)) { sendError(res, 'Domain not found', 404); return; }
    const identity = await resolveGatewayDomain(req.params.hostname);
    if (!identity) { sendError(res, 'Domain not found', 404); return; }
    sendSuccess(res, identity);
  } catch (error) { next(error); }
}

export async function createGatewayDomain(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!req.user || req.user.role !== 'super-admin') { sendError(res, 'Super admin access required', req.user ? 403 : 401); return; }
  try {
    const result = await createGatewayDomainOwnership(req.body.domain, req.params.id, String(req.user._id), {
      adoptExisting: req.body.adoptExisting === true, expectedCurrentDomain: req.body.expectedCurrentDomain,
    });
    sendSuccess(res, result, 'Domain ownership reserved');
  } catch (error) {
    if (error instanceof CustomDomainValidationError) { sendError(res, 'Enter a valid public domain', 400); return; }
    if (error instanceof GatewayOwnershipConflict) { sendError(res, error.message, 409); return; }
    next(error);
  }
}
