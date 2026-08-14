export const SUPPLY_OFFER_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'active',
  'paused',
  'exhausted',
  'expired',
  'rejected',
  'archived',
] as const;

export const BUNDLE_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'published',
  'suspended',
  'retired',
] as const;

export const BUNDLE_ORDER_STATUSES = [
  'reserved',
  'payment_pending',
  'paid',
  'allocating',
  'confirmed',
  'in_progress',
  'completed',
  'reservation_failed',
  'paid_allocation_pending',
  'cancel_pending',
  'cancelled',
  'partially_refunded',
  'refunded',
  'manual_review',
] as const;

export const COMPONENT_STATUSES = [
  'planned',
  'reserved',
  'confirmed',
  'fulfilled',
  'cancel_pending',
  'cancelled',
  'refund_pending',
  'partially_refunded',
  'refunded',
  'failed',
  'recovery_pending',
  'manual_review',
] as const;

export const PAYMENT_STATUSES = [
  'not_started',
  'intent_created',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
  'partially_refunded',
  'refunded',
  'manual_review',
] as const;

export const SETTLEMENT_STATUSES = [
  'not_eligible',
  'accrued',
  'payable',
  'payout_pending',
  'paid',
  'on_hold',
  'failed',
  'disputed',
] as const;

export type SupplyOfferStatus = (typeof SUPPLY_OFFER_STATUSES)[number];
export type BundleStatus = (typeof BUNDLE_STATUSES)[number];
export type BundleOrderStatus = (typeof BUNDLE_ORDER_STATUSES)[number];
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];
export type BundlePaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type BundleSettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

type StateMachineName = 'supply-offer' | 'bundle' | 'order' | 'component' | 'settlement';

const transitions: Record<StateMachineName, Record<string, readonly string[]>> = {
  'supply-offer': {
    draft: ['submitted', 'archived'],
    submitted: ['approved', 'rejected'],
    approved: ['active', 'archived'],
    active: ['paused', 'exhausted', 'expired', 'archived'],
    paused: ['active', 'archived'],
    exhausted: ['active', 'archived'],
    expired: ['archived'],
    rejected: ['draft', 'archived'],
    archived: [],
  },
  bundle: {
    draft: ['in_review', 'retired'],
    in_review: ['approved', 'draft', 'retired'],
    approved: ['published', 'draft', 'retired'],
    published: ['suspended', 'retired'],
    suspended: ['published', 'retired'],
    retired: [],
  },
  order: {
    reserved: ['payment_pending', 'cancel_pending', 'cancelled', 'reservation_failed', 'manual_review'],
    payment_pending: ['paid', 'cancel_pending', 'cancelled', 'manual_review'],
    paid: ['allocating', 'paid_allocation_pending', 'manual_review'],
    allocating: ['confirmed', 'paid_allocation_pending', 'manual_review'],
    paid_allocation_pending: ['allocating', 'confirmed', 'manual_review'],
    confirmed: ['in_progress', 'cancel_pending', 'partially_refunded', 'refunded', 'manual_review'],
    in_progress: ['completed', 'cancel_pending', 'partially_refunded', 'refunded', 'manual_review'],
    completed: ['cancel_pending', 'partially_refunded', 'refunded', 'manual_review'],
    reservation_failed: [],
    cancel_pending: ['cancelled', 'partially_refunded', 'refunded', 'manual_review'],
    cancelled: ['partially_refunded', 'refunded', 'manual_review'],
    partially_refunded: ['refunded', 'manual_review'],
    refunded: [],
    manual_review: ['paid_allocation_pending', 'allocating', 'confirmed', 'cancel_pending', 'partially_refunded', 'refunded'],
  },
  component: {
    planned: ['reserved', 'failed'],
    reserved: ['confirmed', 'cancel_pending', 'failed', 'manual_review'],
    confirmed: ['fulfilled', 'cancel_pending', 'refund_pending', 'failed', 'manual_review'],
    fulfilled: ['refund_pending', 'manual_review'],
    cancel_pending: ['cancelled', 'manual_review'],
    cancelled: ['refund_pending', 'refunded', 'manual_review'],
    refund_pending: ['partially_refunded', 'refunded', 'manual_review'],
    partially_refunded: ['refund_pending', 'refunded', 'manual_review'],
    refunded: [],
    failed: ['recovery_pending', 'manual_review'],
    recovery_pending: ['reserved', 'confirmed', 'manual_review'],
    manual_review: ['recovery_pending', 'cancel_pending', 'refund_pending'],
  },
  settlement: {
    not_eligible: ['accrued', 'on_hold'],
    accrued: ['payable', 'on_hold', 'disputed'],
    payable: ['payout_pending', 'on_hold', 'disputed'],
    payout_pending: ['paid', 'failed', 'disputed'],
    paid: ['disputed'],
    on_hold: ['accrued', 'payable', 'disputed'],
    failed: ['payout_pending', 'on_hold', 'disputed'],
    disputed: ['on_hold', 'payable'],
  },
};

export class InvalidBundleTransitionError extends Error {
  readonly code = 'INVALID_BUNDLE_TRANSITION';

  constructor(machine: StateMachineName, from: string, to: string) {
    super(`Invalid ${machine} transition: ${from} -> ${to}`);
  }
}

export const canTransition = (
  machine: StateMachineName,
  from: string,
  to: string
): boolean => transitions[machine]?.[from]?.includes(to) ?? false;

export const assertTransition = (
  machine: StateMachineName,
  from: string,
  to: string
): void => {
  if (!canTransition(machine, from, to)) {
    throw new InvalidBundleTransitionError(machine, from, to);
  }
};
