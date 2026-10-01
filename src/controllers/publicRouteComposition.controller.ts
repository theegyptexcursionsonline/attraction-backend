import { Response } from 'express';
import type { AuthRequest } from '../types';
import { publicRouteCompositionRequest } from '../services/publicRouteComposition.schema';
import { composePublicRoute } from '../services/publicRouteComposition.service';
import { InvalidPublicCursor } from '../utils/publicCursor';
import { sendError, sendSuccess } from '../utils/response';

/** Public presentation only. A locale or publication receipt grants no access to
 * bookings, payment credentials, prices at checkout, or another tenant. */
export async function getPublicRouteComposition(req: AuthRequest, res: Response): Promise<void> {
  const parsed = publicRouteCompositionRequest.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 'Invalid page request', 400);
    return;
  }

  const tenant = req.tenant;
  const tenantId = tenant?._id?.toString();
  if (!tenant || !tenantId || !/^[a-f0-9]{24}$/.test(tenantId)
    || tenant.slug !== parsed.data.tenantSlug
    || tenant.customDomain !== parsed.data.domain
    || tenant.designMode !== 'savanna' || tenant.status !== 'active') {
    sendError(res, 'Page not found for this website', 404);
    return;
  }

  try {
    const composition = await composePublicRoute(parsed.data);
    // The context resolver and the read snapshot must refer to the same owner,
    // even if the domain assignment changes between those reads.
    if (composition.receipt.tenantId !== tenantId) {
      sendError(res, 'This page could not be loaded. Please retry.', 503);
      return;
    }
    sendSuccess(res, composition);
  } catch (error) {
    if (error instanceof InvalidPublicCursor) {
      sendError(res, 'This page link is invalid. Start from the first page.', 400);
      return;
    }
    // A failed snapshot is never a successful empty catalogue or a partial
    // language publication. Do not expose database/provider error details.
    sendError(res, 'This page could not be loaded. Please retry.', 503);
  }
}
