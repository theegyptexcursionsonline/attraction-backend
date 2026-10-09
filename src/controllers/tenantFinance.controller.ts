import { Response, NextFunction } from 'express';
import mongoose, { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { TenantFinanceRevision } from '../models/TenantFinanceRevision';
import { AuthRequest } from '../types';
import { sendError, sendSuccess } from '../utils/response';
import {
  FINANCE_FEE_KINDS, FINANCE_LOCKABLE_KINDS, FinanceError, financeCurrency, financePolicy, financeSettingsUpdateSchema, sameFinanceFeeRule,
} from '../utils/financeSettings';
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
const FEE_NAMES = { transaction: 'The transaction fee', booking: 'The booking fee', payout: 'The payout fee' } as const;
const view = (site: Parameters<typeof financePolicy>[0], saleCurrencies: string[], canLock: boolean) => {
  const { configured, revision, fees, locks } = financePolicy(site);
  return { configured, revision, fees, locks, canLock, saleCurrencies, basis: 'discounted_service_amount', fixedFeeUnit: 'booking' };
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
    sendSuccess(res, view(site, await financeSaleCurrencies(site._id), req.user!.role === 'super-admin'));
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
    const { expectedRevision, fees, locks } = parsed.data;
    const superAdmin = req.user!.role === 'super-admin';
    // Locks are the platform's decision: the server refuses, whatever the screen shows.
    if (locks && !superAdmin) {
      res.status(403).json({ success: false, code: 'FINANCE_LOCKS_SUPER_ADMIN_ONLY', error: 'Only a super admin can lock or unlock fees.' });
      return;
    }
    const current = financePolicy(previous);
    // A stale screen reloads first (409), so it is then shown the locks before any edit is judged.
    if (expectedRevision !== current.revision) throw new FinanceError('FINANCE_CHANGED', 'These fee settings changed. Reload and try again.');
    if (!superAdmin) {
      const changed = FINANCE_LOCKABLE_KINDS.filter(kind => current.locks[kind] && !sameFinanceFeeRule(current.fees[kind], fees[kind]));
      if (changed.length) {
        res.status(403).json({
          success: false,
          code: 'FINANCE_FEE_LOCKED',
          error: `${FEE_NAMES[changed[0]]} is set by the platform and cannot be changed here.`,
          fees: changed,
        });
        return;
      }
    }
    const nextLocks = superAdmin && locks ? locks : current.locks;
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
          { $set: { financeSettings: { version: 1, fees, locks: nextLocks }, financeRevision: expectedRevision + 1 } },
          { new: true, runValidators: true, session, lean: true }).select(fields);
        if (!saved) throw new FinanceError('FINANCE_CHANGED', 'These fee settings changed. Reload and try again.');
        await TenantFinanceRevision.create([{ tenantId: previous._id, revision: expectedRevision + 1, fees, locks: nextLocks, actorId: req.user!._id }], { session });
      });
    } finally { await session.endSession(); }
    if (!saved) throw new FinanceError('FINANCE_UNAVAILABLE', 'Fee settings could not be saved.');
    res.setHeader('Cache-Control', 'private, no-store');
    sendSuccess(res, view(saved, currencies, superAdmin), 'Finance settings saved');
  } catch (error) { handle(error, res, next); }
}
