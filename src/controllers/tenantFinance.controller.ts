import { Response, NextFunction } from 'express';
import mongoose, { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { TenantFinanceRevision } from '../models/TenantFinanceRevision';
import { AuthRequest } from '../types';
import { sendError, sendSuccess } from '../utils/response';
import { FINANCE_FEE_KINDS, FinanceError, financeCurrency, financePolicy, financeSettingsUpdateSchema } from '../utils/financeSettings';
import { financeSaleCurrencies } from '../services/tenantFinance.service';

function scope(req: AuthRequest, res: Response): Record<string, unknown> | null {
  if (!req.user || !['super-admin', 'brand-admin'].includes(req.user.role)) {
    sendError(res, 'Site administrator access required', req.user ? 403 : 401); return null;
  }
  if (!Types.ObjectId.isValid(req.params.id)) { sendError(res, 'Tenant not found', 404); return null; }
  return req.user.role === 'super-admin' ? { _id: req.params.id }
    : { _id: { $eq: req.params.id, $in: req.user.assignedTenants || [] } };
}
const fields = 'financeSettings financeRevision';
const view = (site: Parameters<typeof financePolicy>[0], saleCurrencies: string[]) => {
  const { configured, revision, fees } = financePolicy(site);
  return { configured, revision, fees, saleCurrencies, basis: 'discounted_service_amount', fixedFeeUnit: 'booking' };
};
const handle = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof FinanceError) { res.status(error.code === 'FINANCE_CHANGED' ? 409 : 400).json({ success: false, code: error.code, error: error.message }); return; }
  next(error);
};

export async function getTenantFinance(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const filter = scope(req, res); if (!filter) return;
    const site = await Tenant.findOne(filter).select(fields).lean();
    if (!site) { sendError(res, 'Tenant not found', 404); return; }
    res.setHeader('Cache-Control', 'private, no-store');
    sendSuccess(res, view(site, await financeSaleCurrencies(site._id)));
  } catch (error) { handle(error, res, next); }
}

export async function updateTenantFinance(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const filter = scope(req, res); if (!filter) return;
    const parsed = financeSettingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.issues[0].message, 400); return; }
    const previous = await Tenant.findOne(filter).select(fields).lean();
    if (!previous) { sendError(res, 'Tenant not found', 404); return; }
    const currencies = await financeSaleCurrencies(previous._id);
    const { expectedRevision, fees } = parsed.data;
    for (const currency of currencies) financeCurrency(currency);
    for (const kind of FINANCE_FEE_KINDS) {
      const rule = fees[kind];
      if (rule.enabled && rule.type === 'fixed') {
        for (const currency of currencies) if (rule.fixedAmounts[currency] === undefined) {
          sendError(res, `Set the ${kind} fee amount for ${currency}.`, 400); return;
        }
      }
    }
    const session = await mongoose.startSession();
    let saved: typeof previous | null = null;
    try {
      await session.withTransaction(async () => {
        saved = await Tenant.findOneAndUpdate({ ...filter, financeRevision: expectedRevision === 0 ? { $in: [0, null] } : expectedRevision },
          { $set: { financeSettings: { version: 1, fees }, financeRevision: expectedRevision + 1 } },
          { new: true, runValidators: true, session, lean: true }).select(fields);
        if (!saved) throw new FinanceError('FINANCE_CHANGED', 'These fee settings changed. Reload and try again.');
        await TenantFinanceRevision.create([{ tenantId: previous._id, revision: expectedRevision + 1, fees, actorId: req.user!._id }], { session });
      });
    } finally { await session.endSession(); }
    if (!saved) throw new FinanceError('FINANCE_UNAVAILABLE', 'Fee settings could not be saved.');
    res.setHeader('Cache-Control', 'private, no-store');
    sendSuccess(res, view(saved, currencies), 'Finance settings saved');
  } catch (error) { handle(error, res, next); }
}
