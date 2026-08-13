import { Types } from 'mongoose';
import { bundleFingerprint } from '../bundles/hash';
import {
  BundleIdempotency,
  BundleIdempotencyStatus,
  IBundleIdempotency,
} from '../models/BundleIdempotency';

export class BundleIdempotencyError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 409) {
    super(message);
  }
}

export interface BundleIdempotencyClaim {
  record: IBundleIdempotency;
  replayResourceId?: Types.ObjectId;
}

export const claimBundleIdempotency = async (input: {
  scope: IBundleIdempotency['scope'];
  storefrontTenantId: Types.ObjectId | string;
  key: string;
  request: unknown;
}): Promise<BundleIdempotencyClaim> => {
  const keyHash = bundleFingerprint(input.key);
  const requestHash = bundleFingerprint(input.request);
  const identity = {
    scope: input.scope,
    storefrontTenantId: input.storefrontTenantId,
    keyHash,
  };
  try {
    const record = await BundleIdempotency.create({
      ...identity,
      requestHash,
      status: 'processing',
      attempts: 1,
      leaseUntil: new Date(Date.now() + 2 * 60 * 1000),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return { record };
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }

  const existing = await BundleIdempotency.findOne(identity);
  if (!existing) {
    throw new BundleIdempotencyError('IDEMPOTENCY_CLAIM_RACE', 'Please retry this request');
  }
  if (existing.requestHash !== requestHash) {
    throw new BundleIdempotencyError(
      'IDEMPOTENCY_KEY_REUSED',
      'This idempotency key was already used for different request data'
    );
  }
  if (existing.status === 'completed' && existing.resourceId) {
    return { record: existing, replayResourceId: existing.resourceId };
  }
  if (existing.status === 'failed_final') {
    throw new BundleIdempotencyError(
      existing.lastErrorCode || 'PREVIOUS_REQUEST_FAILED',
      existing.lastErrorMessage || 'This request previously failed and cannot be retried'
    );
  }
  if (existing.status === 'outcome_unknown') {
    throw new BundleIdempotencyError(
      'REQUEST_ALREADY_PROCESSING',
      'The original request is still resolving; retry with the same key shortly'
    );
  }

  if (existing.status === 'processing') {
    if (!existing.leaseUntil || existing.leaseUntil > new Date()) {
      throw new BundleIdempotencyError(
        'REQUEST_ALREADY_PROCESSING',
        'The original request is still resolving; retry with the same key shortly'
      );
    }
    const reclaimedProcessing = await BundleIdempotency.findOneAndUpdate(
      { ...identity, requestHash, status: 'processing', leaseUntil: { $lte: new Date() } },
      {
        $set: { leaseUntil: new Date(Date.now() + 2 * 60 * 1000) },
        $inc: { attempts: 1 },
      },
      { new: true }
    );
    if (!reclaimedProcessing) {
      throw new BundleIdempotencyError('REQUEST_ALREADY_PROCESSING', 'Please retry this request shortly', 409);
    }
    return { record: reclaimedProcessing };
  }

  const reclaimed = await BundleIdempotency.findOneAndUpdate(
    {
      ...identity,
      requestHash,
      status: 'failed_retryable',
      $or: [{ nextRetryAt: { $exists: false } }, { nextRetryAt: { $lte: new Date() } }],
    },
    {
      $set: { status: 'processing', leaseUntil: new Date(Date.now() + 2 * 60 * 1000) },
      $inc: { attempts: 1 },
      $unset: { lastErrorCode: 1, lastErrorMessage: 1, nextRetryAt: 1 },
    },
    { new: true }
  );
  if (!reclaimed) {
    throw new BundleIdempotencyError('RETRY_BACKOFF_ACTIVE', 'Please retry this request later', 429);
  }
  return { record: reclaimed };
};

export const completeBundleIdempotency = async (
  recordId: Types.ObjectId,
  resourceId: Types.ObjectId
): Promise<void> => {
  const result = await BundleIdempotency.updateOne(
    { _id: recordId, status: 'processing' },
    { $set: { status: 'completed', resourceId }, $unset: { leaseUntil: 1 } }
  );
  if (result.modifiedCount !== 1) throw new Error('IDEMPOTENCY_COMPLETION_CONFLICT');
};

export const failBundleIdempotency = async (
  recordId: Types.ObjectId,
  status: Extract<BundleIdempotencyStatus, 'failed_retryable' | 'failed_final' | 'outcome_unknown'>,
  error: { code: string; message: string }
): Promise<void> => {
  await BundleIdempotency.updateOne(
    { _id: recordId, status: 'processing' },
    {
      $set: {
        status,
        lastErrorCode: error.code,
        lastErrorMessage: error.message.slice(0, 500),
        ...(status === 'failed_retryable'
          ? { nextRetryAt: new Date(Date.now() + 30_000) }
          : {}),
      },
      $unset: { leaseUntil: 1 },
    }
  );
};
