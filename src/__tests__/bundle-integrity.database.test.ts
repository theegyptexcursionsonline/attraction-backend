import express from 'express';
import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from '../test/loopbackRequest';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { BundleEvent } from '../models/BundleEvent';
import { BundleOrder } from '../models/BundleOrder';
import { BundleOutboxEvent } from '../models/BundleOutboxEvent';
import { BundleOutboxRecovery } from '../models/BundleOutboxRecovery';
import { Tenant } from '../models/Tenant';
import { permanentlyDeleteAttraction } from '../controllers/attractions.controller';
import {
  BundleOutboxRecoveryError,
  redriveBundleOutboxDeadLetter,
} from '../services/bundleOutbox.service';
import { loadBundleOutboxHealth } from '../services/bundleLaunchReadiness.service';
import { AuthRequest } from '../types';
import {
  claimTenantStripePaymentBinding,
  saveTenantStripeConfig,
  TenantStripeConfigConflictError,
} from '../services/tenantPayment.service';

jest.setTimeout(60_000);

// These are money-path proofs, so there is deliberately no skip path: a machine
// that cannot start a replica set fails the suite instead of reporting it skipped.
describe('Bundle integrity database integration', () => {
  let mongo: MongoMemoryReplSet | undefined;

  beforeAll(async () => {
    // Use the machine's mongod only when `which` finds one; otherwise
    // mongodb-memory-server supplies its own 7.0.14 (the CI runner has none).
    const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
    const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
    const version = systemBinary
      ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1]
      : undefined;
    mongo = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        // Homebrew MongoDB 8.2 can briefly hold the collection lock while its
        // first model indexes settle. The production invariant under test is the
        // transaction/CAS result, not whether that local lock clears within the
        // server's 5 ms default transaction wait.
        args: ['--setParameter', 'maxTransactionLockRequestTimeoutMillis=1000'],
      },
      binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) },
    });
    await mongoose.connect(mongo.getUri('bundle_integrity'));

    await BundleOutboxRecovery.collection.createIndex(
      { outboxEventId: 1, operationId: 1 },
      { unique: true }
    );
    await BundleEvent.collection.createIndex(
      { aggregateId: 1, sequence: 1 },
      { unique: true }
    );
    // Finish lazy Mongoose index creation before any transaction starts. MongoDB
    // correctly aborts a transaction if the collection catalog changes midway,
    // which otherwise makes this real-database proof timing-dependent.
    await Promise.all([Tenant.init(), BundleOrder.init()]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  });

  beforeEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });

  it('proves the Booking middleware hides children generically but permits the explicit integrity scope', async () => {
    const attractionId = new Types.ObjectId();
    const bundleOrderId = new Types.ObjectId();
    await Booking.collection.insertOne({
      _id: new Types.ObjectId(),
      reference: 'DB-BUNDLE-CHILD-1',
      tenantId: new Types.ObjectId(),
      attractionId,
      bundleOrderId,
      bundleComponentId: 'component-1',
    });

    await expect(Booking.exists({ attractionId })).resolves.toBeNull();
    await expect(Booking.exists({
      attractionId,
      bundleOrderId: { $exists: true },
    })).resolves.toEqual(expect.objectContaining({ _id: expect.any(Types.ObjectId) }));
  });

  it('enforces the immutable recovery unique index in MongoDB', async () => {
    const outboxEventId = new Types.ObjectId();
    const operationId = 'outbox-redrive:database-index-0001';
    const base = {
      outboxEventId,
      eventKey: 'database-event',
      orderId: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      recipientTenantId: new Types.ObjectId(),
      operationId,
      actorId: new Types.ObjectId(),
      reason: 'Database uniqueness proof',
      attemptsBefore: 8,
      errorBefore: 'Provider error',
      createdAt: new Date(),
    };
    await BundleOutboxRecovery.collection.insertOne({ _id: new Types.ObjectId(), ...base });

    await expect(BundleOutboxRecovery.collection.insertOne({
      _id: new Types.ObjectId(),
      ...base,
    })).rejects.toMatchObject({ code: 11000 });
  });

  it('persists the first provider-capture timestamp on an existing order document', async () => {
    const orderId = new Types.ObjectId();
    await BundleOrder.collection.insertOne({
      _id: orderId,
      storefrontTenantId: new Types.ObjectId(),
      status: 'payment_pending',
      paymentStatus: 'intent_created',
    });

    const order = await BundleOrder.findById(orderId);
    expect(order).not.toBeNull();
    order!.paymentCapturedAt = new Date('2026-08-14T09:36:12.000Z');
    await order!.save({ validateBeforeSave: false });

    await expect(BundleOrder.findById(orderId).lean()).resolves.toEqual(
      expect.objectContaining({
        paymentCapturedAt: new Date('2026-08-14T09:36:12.000Z'),
      })
    );

    const captured = await BundleOrder.findById(orderId);
    captured!.paymentCapturedAt = new Date('2026-08-15T09:36:12.000Z');
    await captured!.save({ validateBeforeSave: false });
    await expect(BundleOrder.findById(orderId).lean()).resolves.toEqual(
      expect.objectContaining({
        paymentCapturedAt: new Date('2026-08-14T09:36:12.000Z'),
      })
    );
  });

  it('atomically fences a checkout binding from a concurrent tenant gateway mutation', async () => {
    const tenantId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    await Tenant.collection.insertOne({
      _id: tenantId,
      slug: `stripe-fence-${tenantId}`,
      name: 'Stripe fence tenant',
      domain: `stripe-fence-${tenantId}.example.test`,
      logo: 'https://example.test/logo.png',
      status: 'active',
      paymentSettings: {
        stripe: {
          enabled: true,
          publishableKey: 'pk_test_public',
          secretKeyEnc: '',
          webhookSecretEnc: '',
          previousWebhookSecretEnc: '',
          verifiedAccountId: 'acct_verified',
          verifiedCredentialFingerprint: 'fingerprint_verified',
          configRevision: 4,
          bindingFenceRevision: 7,
        },
      },
    });
    await BundleOrder.collection.insertOne({
      _id: orderId,
      storefrontTenantId: tenantId,
      status: 'reserved',
      paymentStatus: 'not_started',
    });

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await expect(claimTenantStripePaymentBinding(tenantId, {
        publishableKey: 'pk_test_public',
        verifiedAccountId: 'acct_verified',
        verifiedCredentialFingerprint: 'fingerprint_verified',
        configRevision: 4,
        bindingFenceRevision: 7,
      }, session)).resolves.toBe(true);
      await BundleOrder.updateOne(
        { _id: orderId, status: 'reserved', paymentStatus: 'not_started' },
        {
          $set: {
            stripeBinding: {
              accountId: 'acct_verified',
              credentialFingerprint: 'fingerprint_verified',
              publishableKey: 'pk_test_public',
              configRevision: 4,
              bindingFenceRevision: 8,
              claimedAt: new Date(),
            },
          },
        },
        { session }
      );
    });

    // This is the exact stale snapshot held by an admin request that began
    // before the checkout transaction committed. The real database must reject
    // it after the shared fence and immutable order binding advance together.
    await expect(saveTenantStripeConfig(tenantId.toString(), {
      enabled: false,
      expectedConfigRevision: 4,
      expectedBindingFenceRevision: 7,
    })).rejects.toBeInstanceOf(TenantStripeConfigConflictError);
    await session.endSession();

    await expect(Tenant.findById(tenantId).lean()).resolves.toEqual(expect.objectContaining({
      paymentSettings: expect.objectContaining({
        stripe: expect.objectContaining({
          enabled: true,
          configRevision: 4,
          bindingFenceRevision: 8,
        }),
      }),
    }));
    await expect(BundleOrder.findById(orderId).lean()).resolves.toEqual(expect.objectContaining({
      stripeBinding: expect.objectContaining({
        accountId: 'acct_verified',
        bindingFenceRevision: 8,
      }),
    }));
  });

  it('rejects an unknown legacy delivery outcome without changing the event or audit', async () => {
    const storefrontTenantId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const eventId = new Types.ObjectId();
    await BundleOrder.collection.insertOne({ _id: orderId, storefrontTenantId });
    await BundleOutboxEvent.collection.insertOne({
      _id: eventId, eventId: 'database-uncertain-legacy-event', orderId,
      tenantId: new Types.ObjectId(), audience: 'supplier',
      eventType: 'bundle.component_confirmed', payload: {}, status: 'dead_letter',
      attempts: 8, nextAttemptAt: new Date(), lastError: 'Provider unavailable',
      manualRecoveryRequired: true, createdAt: new Date(), updatedAt: new Date(),
    });
    const before = await BundleOutboxEvent.findById(eventId).lean();
    await expect(redriveBundleOutboxDeadLetter({
      eventId: eventId.toString(), storefrontTenantId: storefrontTenantId.toString(),
      operationId: 'outbox-redrive:uncertain-legacy-0001',
      reason: 'Unknown provider outcome needs reconciliation', actorId: new Types.ObjectId(),
    })).rejects.toEqual(expect.objectContaining<Partial<BundleOutboxRecoveryError>>({
      statusCode: 409,
      message: 'Only a confirmed non-delivery can be retried; uncertain or legacy failures require reconciliation',
    }));
    await expect(BundleOutboxEvent.findById(eventId).lean()).resolves.toEqual(before);
    await expect(BundleOutboxRecovery.countDocuments({ outboxEventId: eventId })).resolves.toBe(0);
    await expect(BundleEvent.countDocuments({ aggregateId: orderId, command: 'redrive_bundle_outbox_dead_letter' })).resolves.toBe(0);
  });

  it('redrives once transactionally and replays the same operation id without duplicate audit', async () => {
    const storefrontTenantId = new Types.ObjectId();
    const recipientTenantId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const eventId = new Types.ObjectId();
    const actorId = new Types.ObjectId();
    const operationId = 'outbox-redrive:database-transaction-0001';
    await BundleOrder.collection.insertOne({ _id: orderId, storefrontTenantId });
    await BundleOutboxEvent.collection.insertOne({
      _id: eventId,
      eventId: 'database-redrive-event',
      orderId,
      tenantId: recipientTenantId,
      audience: 'supplier',
      eventType: 'bundle.component_confirmed',
      payload: {},
      status: 'dead_letter',
      attempts: 8,
      nextAttemptAt: new Date(),
      lastError: 'DELIVERY_NOT_STARTED',
      manualRecoveryRequired: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const first = await redriveBundleOutboxDeadLetter({
      eventId: eventId.toString(),
      storefrontTenantId: storefrontTenantId.toString(),
      operationId,
      reason: 'Provider configuration repaired',
      actorId,
    });
    const replay = await redriveBundleOutboxDeadLetter({
      eventId: eventId.toString(),
      storefrontTenantId: storefrontTenantId.toString(),
      operationId,
      reason: 'Provider configuration repaired',
      actorId,
    });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    await expect(BundleOutboxRecovery.countDocuments({ outboxEventId: eventId }))
      .resolves.toBe(1);
    await expect(BundleEvent.countDocuments({
      aggregateId: orderId,
      command: 'redrive_bundle_outbox_dead_letter',
    })).resolves.toBe(1);
    await expect(BundleOutboxEvent.findById(eventId).lean()).resolves.toEqual(
      expect.objectContaining({
        status: 'retry',
        attempts: 0,
        manualRecoveryRequired: true,
      })
    );
  });

  it('returns the same not-found result across storefront tenants without mutating the event', async () => {
    const owningTenantId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const eventId = new Types.ObjectId();
    await BundleOrder.collection.insertOne({ _id: orderId, storefrontTenantId: owningTenantId });
    await BundleOutboxEvent.collection.insertOne({
      _id: eventId,
      eventId: 'database-cross-tenant-event',
      orderId,
      tenantId: new Types.ObjectId(),
      audience: 'storefront',
      eventType: 'bundle.order_reserved',
      payload: {},
      status: 'dead_letter',
      attempts: 8,
      nextAttemptAt: new Date(),
      manualRecoveryRequired: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(redriveBundleOutboxDeadLetter({
      eventId: eventId.toString(),
      storefrontTenantId: new Types.ObjectId().toString(),
      operationId: 'outbox-redrive:cross-tenant-0001',
      reason: 'Must not cross tenant boundary',
      actorId: new Types.ObjectId(),
    })).rejects.toEqual(expect.objectContaining<Partial<BundleOutboxRecoveryError>>({
      statusCode: 404,
      message: 'Dead-letter delivery item not found',
    }));
    await expect(BundleOutboxEvent.findById(eventId).lean()).resolves.toEqual(
      expect.objectContaining({ status: 'dead_letter', attempts: 8 })
    );
  });

  it('keeps readiness fail-closed while a manually redriven event is still retrying', async () => {
    const storefrontTenantId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    await BundleOrder.collection.insertOne({ _id: orderId, storefrontTenantId });
    await BundleOutboxEvent.collection.insertMany([
      {
        _id: new Types.ObjectId(),
        eventId: 'database-manual-recovery-event',
        orderId,
        tenantId: new Types.ObjectId(),
        audience: 'supplier',
        eventType: 'bundle.component_confirmed',
        payload: {},
        status: 'retry',
        attempts: 1,
        nextAttemptAt: new Date(),
        manualRecoveryRequired: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: new Types.ObjectId(),
        eventId: 'database-normal-pending-event',
        orderId,
        tenantId: storefrontTenantId,
        audience: 'storefront',
        eventType: 'bundle.order_reserved',
        payload: {},
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
        manualRecoveryRequired: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await expect(loadBundleOutboxHealth(storefrontTenantId)).resolves.toEqual({
      outboxDeadLetterCount: 1,
      outboxPendingCount: 1,
    });
  });

  it('preserves Bundle-linked capacity through the real controller and transaction', async () => {
    const attractionId = new Types.ObjectId();
    const availabilityId = new Types.ObjectId();
    await Attraction.collection.insertOne({
      _id: attractionId,
      status: 'archived',
      trashedAt: new Date(),
    });
    await Availability.collection.insertOne({
      _id: availabilityId,
      attractionId,
      date: new Date('2026-09-01T00:00:00.000Z'),
      timeSlots: [],
      isBlocked: false,
    });
    await BundleOrder.collection.insertOne({
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      status: 'reserved',
      components: [{ attractionId }],
    });

    const app = express();
    app.delete('/attractions/:id/permanent', (req, res, next) => {
      (req as AuthRequest).user = {
        _id: new Types.ObjectId(),
        role: 'super-admin',
        assignedTenants: [],
      } as unknown as AuthRequest['user'];
      void permanentlyDeleteAttraction(req as AuthRequest, res, next);
    });
    const response = await request(app).delete(`/attractions/${attractionId}/permanent`);

    expect(response.status).toBe(409);
    await expect(Attraction.findById(attractionId).lean()).resolves.not.toBeNull();
    await expect(Availability.findById(availabilityId).lean()).resolves.not.toBeNull();
  });

  it('deletes an unused trashed attraction and its availability in one real transaction', async () => {
    const attractionId = new Types.ObjectId();
    const availabilityId = new Types.ObjectId();
    await Attraction.collection.insertOne({
      _id: attractionId,
      status: 'archived',
      trashedAt: new Date(),
    });
    await Availability.collection.insertOne({
      _id: availabilityId,
      attractionId,
      date: new Date('2026-09-02T00:00:00.000Z'),
      timeSlots: [],
      isBlocked: false,
    });

    const app = express();
    app.delete('/attractions/:id/permanent', (req, res, next) => {
      (req as AuthRequest).user = {
        _id: new Types.ObjectId(),
        role: 'super-admin',
        assignedTenants: [],
      } as unknown as AuthRequest['user'];
      void permanentlyDeleteAttraction(req as AuthRequest, res, next);
    });
    const response = await request(app).delete(`/attractions/${attractionId}/permanent`);

    expect(response.status).toBe(200);
    await expect(Attraction.findById(attractionId).lean()).resolves.toBeNull();
    await expect(Availability.findById(availabilityId).lean()).resolves.toBeNull();
  });
});
