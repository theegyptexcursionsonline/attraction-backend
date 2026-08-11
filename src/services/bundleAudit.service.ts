import { ClientSession, Types } from 'mongoose';
import { BundleEvent, IBundleEvent } from '../models/BundleEvent';
import { BundleLedgerEntry, BundleLedgerAccount } from '../models/BundleLedgerEntry';
import { BundleOutboxEvent } from '../models/BundleOutboxEvent';
import { bundleEventId } from '../bundles/hash';

export type BundleActor = Pick<
  IBundleEvent,
  'actorType' | 'actorId' | 'actorTenantId'
>;

export interface BundleEventInput {
  aggregateType: IBundleEvent['aggregateType'];
  aggregateId: Types.ObjectId;
  storefrontTenantId?: Types.ObjectId;
  supplierTenantId?: Types.ObjectId;
  actorType: IBundleEvent['actorType'];
  actorId?: Types.ObjectId;
  actorTenantId?: Types.ObjectId;
  command: string;
  fromState?: string;
  toState?: string;
  reason?: string;
  correlationId?: string;
  idempotencyKeyHash?: string;
  metadata: Record<string, unknown>;
}

export const appendBundleEvent = async (
  input: BundleEventInput,
  session?: ClientSession
): Promise<void> => {
  const latest = await BundleEvent.findOne({ aggregateId: input.aggregateId })
    .sort({ sequence: -1 })
    .select('sequence')
    .session(session || null);
  await BundleEvent.create(
    [{ ...input, sequence: (latest?.sequence || 0) + 1 }],
    session ? { session } : undefined
  );
};

export interface LedgerLine {
  account: BundleLedgerAccount;
  direction: 'debit' | 'credit';
  amountMinor: number;
  supplierTenantId?: Types.ObjectId;
  componentId?: string;
  metadata?: Record<string, unknown>;
}

export const appendBalancedLedger = async (
  input: {
    orderId: Types.ObjectId;
    operationId: string;
    storefrontTenantId: Types.ObjectId;
    currency: string;
    lines: LedgerLine[];
  },
  session?: ClientSession
): Promise<void> => {
  const debit = input.lines
    .filter((line) => line.direction === 'debit')
    .reduce((sum, line) => sum + line.amountMinor, 0);
  const credit = input.lines
    .filter((line) => line.direction === 'credit')
    .reduce((sum, line) => sum + line.amountMinor, 0);
  if (debit !== credit) throw new Error('BUNDLE_LEDGER_NOT_BALANCED');
  if (input.lines.some((line) => !Number.isSafeInteger(line.amountMinor) || line.amountMinor < 0)) {
    throw new Error('BUNDLE_LEDGER_INVALID_AMOUNT');
  }
  if (!input.lines.length) return;
  await BundleLedgerEntry.insertMany(
    input.lines.map((line) => ({
      orderId: input.orderId,
      operationId: input.operationId,
      storefrontTenantId: input.storefrontTenantId,
      currency: input.currency,
      ...line,
      metadata: line.metadata || {},
    })),
    { session }
  );
};

export const enqueueBundleOutbox = async (
  input: {
    orderId?: Types.ObjectId;
    tenantId: Types.ObjectId;
    audience: 'customer' | 'supplier' | 'storefront';
    eventType: string;
    payload: Record<string, unknown>;
  },
  session?: ClientSession
): Promise<void> => {
  await BundleOutboxEvent.create(
    [{
      eventId: bundleEventId(),
      ...input,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
    }],
    session ? { session } : undefined
  );
};
