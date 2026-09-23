import crypto from 'crypto';
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { BundleDefinition } from '../models/BundleDefinition';
import { BundleQuote } from '../models/BundleQuote';
import { BundleOrder, IBundleOrder } from '../models/BundleOrder';
import { BundleStorefrontPurchase } from '../models/BundleStorefrontPurchase';
import { verifyBundleAccessToken } from '../bundles/guestAccess';
import { bundleCommerceEvent } from '../services/bundleCommerce.service';
import { sendError, sendSuccess } from '../utils/response';
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const validId = (value: string) => /^[a-f0-9]{24}$/i.test(value);

export async function getBundleCommerceItem(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant || !validId(req.params.id)) { sendError(res, 'Bundle not found', 404); return; }
    const bundle = await BundleDefinition.findOne({ _id: req.params.id, storefrontTenantId: req.tenant._id, status: 'published' });
    if (!bundle) { sendError(res, 'Bundle not found', 404); return; }
    sendSuccess(res, bundleCommerceEvent({ storefrontTenantId: bundle.storefrontTenantId, bundleDefinitionId: bundle._id,
      currency: bundle.currency, totalMinor: bundle.customerPricesMinor.adult }, 'view_item'));
  } catch (error) { next(error); }
}

export async function getBundleCommerceCheckout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) { sendError(res, 'Quote not found', 404); return; }
    const quote = await BundleQuote.findOne({ _id: req.body.quoteId, storefrontTenantId: req.tenant._id,
      status: 'active', checkoutMode: 'live', expiresAt: { $gt: new Date() } });
    if (!quote || req.tenant.bundleSettings?.mode !== 'live') { sendError(res, 'Quote not found', 404); return; }
    const bundle = await BundleDefinition.exists({ _id: quote.bundleDefinitionId, storefrontTenantId: req.tenant._id,
      status: 'published', version: quote.bundleVersion });
    if (!bundle) { sendError(res, 'Quote no longer available', 409); return; }
    sendSuccess(res, bundleCommerceEvent(quote, 'begin_checkout'));
  } catch (error) { next(error); }
}

async function authorizedOrder(req: AuthRequest): Promise<IBundleOrder | null> {
  if (!req.tenant || !validId(req.params.id)) return null;
  const order = await BundleOrder.findOne({ _id: req.params.id, storefrontTenantId: req.tenant._id });
  if (!order) return null;
  const owner = req.user?.role === 'customer' && String(order.userId) === String(req.user._id);
  if (!owner && !verifyBundleAccessToken(req.headers['x-bundle-access-token'], String(order._id), order.reference)) return null;
  if (order.checkoutMode !== 'live' || order.paymentStatus !== 'succeeded'
    || !['confirmed', 'in_progress', 'completed'].includes(order.status) || !order.stripePaymentIntentId
    || !order.paymentCapturedAt || order.recovery?.required || order.refundedMinor !== 0 || order.refundPendingMinor !== 0
    || order.refunds.some(refund => ['requested', 'provider_pending', 'succeeded'].includes(refund.status))
    || order.components.length < 3 || order.components.length > 4
    || order.components.some(component => !['confirmed', 'fulfilled'].includes(component.status)
      || !component.bookingId || component.refundedMinor !== 0 || component.refundStatus !== 'none')) return null;
  return order;
}

export async function claimBundleCommercePurchase(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const order = await authorizedOrder(req);
    if (!order) { sendError(res, 'Purchase not found', 404); return; }
    const event = bundleCommerceEvent(order, 'purchase', String(order._id));
    const claimToken = crypto.randomBytes(24).toString('hex');
    const now = new Date(), leaseUntil = new Date(now.getTime() + 120_000);
    let claim;
    try {
      claim = await BundleStorefrontPurchase.findOneAndUpdate({ _id: event.transaction_id, tenantId: order.storefrontTenantId,
        orderId: order._id, status: { $ne: 'dispatched' }, leaseUntil: { $lte: now } },
      { $set: { status: 'claimed', claimTokenHash: hash(claimToken), leaseUntil, transactionId: event.transaction_id } }, { new: true, upsert: true });
    } catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
    sendSuccess(res, claim ? { event, claimToken, leaseExpiresAt: leaseUntil.toISOString() } : { event: null });
  } catch (error) { next(error); }
}

export async function acknowledgeBundleCommercePurchase(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const order = await authorizedOrder(req);
    if (!order) { sendError(res, 'Purchase not found', 404); return; }
    const scope = { tenantId: order.storefrontTenantId, orderId: order._id, claimTokenHash: hash(req.body.claimToken) };
    const updated = await BundleStorefrontPurchase.updateOne({ ...scope, status: 'claimed', leaseUntil: { $gt: new Date() } },
      { $set: { status: 'dispatched', dispatchedAt: new Date() } });
    if (!updated.modifiedCount && !await BundleStorefrontPurchase.exists({ ...scope, status: 'dispatched' })) {
      sendError(res, 'Claim expired', 409); return;
    }
    sendSuccess(res, { dispatched: true });
  } catch (error) { next(error); }
}
