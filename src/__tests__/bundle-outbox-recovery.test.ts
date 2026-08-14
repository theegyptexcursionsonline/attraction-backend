import { Types } from 'mongoose';
import { BundleOrder } from '../models/BundleOrder';
import { BundleOutboxEvent } from '../models/BundleOutboxEvent';
import { BundleOutboxRecovery } from '../models/BundleOutboxRecovery';
import { appendBundleEvent } from '../services/bundleAudit.service';
import { runBundleTransaction } from '../services/bundleInventory.service';
import {
  BundleOutboxRecoveryError,
  listBundleOutboxDeadLetters,
  redriveBundleOutboxDeadLetter,
} from '../services/bundleOutbox.service';

jest.mock('../models/BundleOrder', () => ({
  BundleOrder: {
    collection: { name: 'bundleorders' },
    findOne: jest.fn(),
  },
}));
jest.mock('../models/BundleOutboxEvent', () => ({
  BundleOutboxEvent: {
    aggregate: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));
jest.mock('../models/BundleOutboxRecovery', () => ({
  BundleOutboxRecovery: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
}));
jest.mock('../services/bundleAudit.service', () => ({
  appendBundleEvent: jest.fn(),
}));
jest.mock('../services/bundleInventory.service', () => ({
  runBundleTransaction: jest.fn(),
}));

const session = { id: 'transaction-session' };
const storefrontTenantId = new Types.ObjectId();
const recipientTenantId = new Types.ObjectId();
const orderId = new Types.ObjectId();
const eventMongoId = new Types.ObjectId();
const actorId = new Types.ObjectId();
const operationId = 'outbox-redrive:operation-0001';

const chain = <T>(value: T) => {
  const query: {
    select: jest.Mock;
    session: jest.Mock;
    lean: jest.Mock;
  } = {
    select: jest.fn(),
    session: jest.fn(),
    lean: jest.fn().mockResolvedValue(value),
  };
  query.select.mockReturnValue(query);
  query.session.mockReturnValue(query);
  return query;
};

const sessionResult = <T>(value: T) => ({
  session: jest.fn().mockResolvedValue(value),
});

const eventSnapshot = (status = 'dead_letter') => ({
  _id: eventMongoId,
  eventId: 'bundle-event-key',
  orderId,
  tenantId: recipientTenantId,
  audience: 'supplier' as const,
  eventType: 'bundle.component_confirmed',
  status,
  attempts: 8,
  lastError: 'Recipient mailbox is not configured',
  createdAt: new Date('2026-08-14T08:00:00.000Z'),
  updatedAt: new Date('2026-08-14T09:00:00.000Z'),
});

const eventDocument = (status = 'dead_letter') => {
  const snapshot = eventSnapshot(status);
  return { ...snapshot, toObject: () => snapshot };
};

describe('Bundle outbox dead-letter recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (BundleOutboxRecovery.findOne as jest.Mock).mockReturnValue(chain(null));
    (runBundleTransaction as jest.Mock).mockImplementation(async (work) => work(session));
    (BundleOutboxEvent.findById as jest.Mock).mockReturnValue(
      sessionResult(eventDocument())
    );
    (BundleOrder.findOne as jest.Mock).mockReturnValue(chain({
      _id: orderId,
      storefrontTenantId,
    }));
    (BundleOutboxEvent.findOneAndUpdate as jest.Mock).mockResolvedValue(
      eventDocument('retry')
    );
    (BundleOutboxRecovery.create as jest.Mock).mockResolvedValue([]);
    (appendBundleEvent as jest.Mock).mockResolvedValue(undefined);
  });

  it('lists only dead letters joined to the requested storefront tenant with cursor pagination', async () => {
    const secondId = new Types.ObjectId();
    (BundleOutboxEvent.aggregate as jest.Mock).mockResolvedValue([
      { ...eventSnapshot(), storefrontTenantId },
      { ...eventSnapshot(), _id: secondId, storefrontTenantId },
    ]);

    const result = await listBundleOutboxDeadLetters({
      storefrontTenantId: storefrontTenantId.toString(),
      limit: 1,
    });

    expect(result.data).toHaveLength(1);
    expect(result.pageInfo).toEqual({
      hasMore: true,
      nextCursor: eventMongoId.toString(),
    });
    const pipeline = (BundleOutboxEvent.aggregate as jest.Mock).mock.calls[0][0];
    expect(pipeline).toContainEqual({
      $match: { 'order.storefrontTenantId': storefrontTenantId },
    });
    expect(pipeline).toContainEqual({ $limit: 2 });
  });

  it('atomically resets attempts, records an immutable recovery, and appends an order audit', async () => {
    const result = await redriveBundleOutboxDeadLetter({
      eventId: eventMongoId.toString(),
      storefrontTenantId: storefrontTenantId.toString(),
      operationId,
      reason: 'Provider configuration repaired',
      actorId,
    });

    expect(result.replayed).toBe(false);
    expect(result.event).toEqual(expect.objectContaining({
      id: eventMongoId.toString(),
      storefrontTenantId: storefrontTenantId.toString(),
      recipientTenantId: recipientTenantId.toString(),
      status: 'retry',
    }));
    expect(BundleOutboxEvent.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: eventMongoId, status: 'dead_letter' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'retry',
          attempts: 0,
          manualRecoveryRequired: true,
        }),
        $unset: { leaseUntil: 1, lastError: 1 },
      }),
      expect.objectContaining({ new: true, session, runValidators: true })
    );
    expect(BundleOutboxRecovery.create).toHaveBeenCalledWith(
      [expect.objectContaining({
        outboxEventId: eventMongoId,
        orderId,
        storefrontTenantId,
        recipientTenantId,
        operationId,
        attemptsBefore: 8,
      })],
      { session }
    );
    expect(appendBundleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateType: 'order',
        aggregateId: orderId,
        storefrontTenantId,
        command: 'redrive_bundle_outbox_dead_letter',
        correlationId: operationId,
      }),
      session
    );
  });

  it('fails tenant-safe when the parent order is not owned by the requested storefront', async () => {
    (BundleOrder.findOne as jest.Mock).mockReturnValue(chain(null));

    await expect(redriveBundleOutboxDeadLetter({
      eventId: eventMongoId.toString(),
      storefrontTenantId: new Types.ObjectId().toString(),
      operationId,
      reason: 'Provider configuration repaired',
      actorId,
    })).rejects.toEqual(expect.objectContaining<Partial<BundleOutboxRecoveryError>>({
      statusCode: 404,
      message: 'Dead-letter delivery item not found',
    }));
    expect(BundleOutboxEvent.findOneAndUpdate).not.toHaveBeenCalled();
    expect(BundleOutboxRecovery.create).not.toHaveBeenCalled();
    expect(appendBundleEvent).not.toHaveBeenCalled();
  });

  it('does not reset a delivery item that is not currently dead-lettered', async () => {
    (BundleOutboxEvent.findById as jest.Mock).mockReturnValue(
      sessionResult(eventDocument('processing'))
    );

    await expect(redriveBundleOutboxDeadLetter({
      eventId: eventMongoId.toString(),
      storefrontTenantId: storefrontTenantId.toString(),
      operationId,
      reason: 'Provider configuration repaired',
      actorId,
    })).rejects.toEqual(expect.objectContaining<Partial<BundleOutboxRecoveryError>>({
      statusCode: 409,
    }));
    expect(BundleOutboxEvent.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('replays a completed operation without resetting attempts or duplicating audit', async () => {
    (BundleOutboxRecovery.findOne as jest.Mock).mockReturnValue(chain({
      outboxEventId: eventMongoId,
      orderId,
      storefrontTenantId,
      operationId,
    }));
    (BundleOutboxEvent.findOne as jest.Mock).mockReturnValue(
      chain(eventSnapshot('retry'))
    );

    const result = await redriveBundleOutboxDeadLetter({
      eventId: eventMongoId.toString(),
      storefrontTenantId: storefrontTenantId.toString(),
      operationId,
      reason: 'Provider configuration repaired',
      actorId,
    });

    expect(result.replayed).toBe(true);
    expect(runBundleTransaction).not.toHaveBeenCalled();
    expect(BundleOutboxEvent.findOneAndUpdate).not.toHaveBeenCalled();
    expect(BundleOutboxRecovery.create).not.toHaveBeenCalled();
    expect(appendBundleEvent).not.toHaveBeenCalled();
  });

  it('resolves a concurrent unique-index race as an idempotent replay', async () => {
    (BundleOutboxRecovery.findOne as jest.Mock)
      .mockReturnValueOnce(chain(null))
      .mockReturnValueOnce(chain({
        outboxEventId: eventMongoId,
        orderId,
        storefrontTenantId,
        operationId,
      }));
    (BundleOutboxEvent.findOne as jest.Mock).mockReturnValue(
      chain(eventSnapshot('retry'))
    );
    (runBundleTransaction as jest.Mock).mockRejectedValue({ code: 11000 });

    const result = await redriveBundleOutboxDeadLetter({
      eventId: eventMongoId.toString(),
      storefrontTenantId: storefrontTenantId.toString(),
      operationId,
      reason: 'Provider configuration repaired',
      actorId,
    });

    expect(result.replayed).toBe(true);
    expect(BundleOutboxEvent.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
