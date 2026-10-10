import { Response, NextFunction } from 'express';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { AuthRequest } from '../types';
import { sendError, sendSuccess } from '../utils/response';
import { FinanceError } from '../utils/financeSettings';
import { priceBookingSelection } from '../services/bookingPricing.service';
import { tourFinanceQuote } from '../services/tourFinanceQuote.service';
import { assertTenantIdsBookingCreationAllowed } from '../services/tenantBookingPolicy.service';
import { bookingEligibility, resolveBookingTimeZone } from '../utils/bookingCutoff';
import { NOT_SOLD_IN_SITE_CURRENCY } from '../utils/siteCurrency';

export async function quoteBooking(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    let tenant = req.tenant;
    const { tenantId, attractionId, items, promoCode } = req.body;
    if (tenantId) {
      if (!req.user || !['super-admin', 'brand-admin', 'manager'].includes(req.user.role)) { sendError(res, 'Tenant selection is only available to authorized staff', 403); return; }
      if (tenant && String(tenant._id) !== tenantId) { sendError(res, 'Booking tenant does not match the active site', 403); return; }
      const filter = req.user.role === 'super-admin' ? { _id: tenantId } : { _id: { $eq: tenantId, $in: req.user.assignedTenants || [] } };
      tenant = await Tenant.findOne({ ...filter, status: { $in: ['active', 'coming_soon'] } }) || undefined;
    }
    if (!tenant) { sendError(res, 'Booking site not found', 404); return; }
    const attraction = await Attraction.findOne({ _id: attractionId, tenantIds: tenant._id, status: 'active', enquiryOnly: { $ne: true } });
    if (!attraction) { sendError(res, 'Attraction not found', 404); return; }
    await assertTenantIdsBookingCreationAllowed([tenant._id]);
    const pricing = await priceBookingSelection(attraction, tenant, items, promoCode);
    if (pricing.temporalChecks.some(check => !bookingEligibility({ ...check, timeZone: resolveBookingTimeZone(tenant?.timezone) }).eligible)) {
      sendError(res, 'Departure is no longer available', 409); return;
    }
    res.setHeader('Cache-Control', 'private, no-store');
    sendSuccess(res, tourFinanceQuote(attraction._id, attraction.currency, pricing));
  } catch (error) {
    if (error instanceof FinanceError) { res.status(409).json({ success: false, code: error.code, error: error.message }); return; }
    if (error instanceof Error && error.message === 'TOUR_CURRENCY_MISMATCH') { sendError(res, NOT_SOLD_IN_SITE_CURRENCY, 409); return; }
    if (error instanceof Error && /^(INVALID_|PARTICIPANT_LIMIT|MISSING_TENANT)/.test(error.message)) { sendError(res, 'Booking selection is invalid', 400); return; }
    next(error);
  }
}
