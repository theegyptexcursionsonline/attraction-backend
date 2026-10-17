import { spawnSync } from 'child_process';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app, { startServer } from '../app';
import { WebhookEvent } from '../models/WebhookEvent';
import * as webhook from '../services/webhook.service';
import * as paidEffects from '../services/bookingPaidEffects.service';

jest.mock('../config', () => ({ ...jest.requireActual('../config'), connectDatabase: jest.fn().mockResolvedValue(undefined) }));
jest.setTimeout(120_000);
let mongo: MongoMemoryServer;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('webhook_startup_indexes'), { autoIndex: false, autoCreate: false });
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  jest.restoreAllMocks();
  // Only this disposable memory-server database is reset; no production index repair.
  await mongoose.connection.dropDatabase();
  await WebhookEvent.createCollection();
});

it('creates a missing receipt index before returning and enforces its global event uniqueness', async () => {
  expect((await WebhookEvent.collection.indexes()).map(index => index.name)).toEqual(['_id_']);
  await webhook.ensureWebhookDeliveryIndexes();
  const index = (await WebhookEvent.collection.indexes()).find(item => item.name === 'provider_1_eventId_1');
  expect(index).toMatchObject({ key: { provider: 1, eventId: 1 }, unique: true });
  expect(index).not.toHaveProperty('partialFilterExpression');
  await WebhookEvent.create({ provider: 'stripe', eventId: 'evt_qa_unique' });
  await expect(WebhookEvent.create({ provider: 'stripe', eventId: 'evt_qa_unique' })).rejects.toMatchObject({ code: 11000 });
});

it('rejects a conflicting index without dropping or replacing it, before workers or traffic', async () => {
  await WebhookEvent.collection.createIndex({ provider: 1, eventId: 1 }, { name: 'provider_1_eventId_1', unique: false });
  const listen = jest.spyOn(app, 'listen').mockImplementation((() => undefined) as never);
  const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(paidEffects, 'ensureBookingPaidEffectIndexes').mockResolvedValue(undefined);
  const paidWorker = jest.spyOn(paidEffects, 'processBookingPaidEffects');
  const webhookWorker = jest.spyOn(webhook, 'processWebhookDeliveries');
  await startServer();
  expect(exit).toHaveBeenCalledWith(1); expect(error).toHaveBeenCalledWith('Failed to start server:', expect.any(Error));
  expect(listen).not.toHaveBeenCalled(); expect(paidWorker).not.toHaveBeenCalled(); expect(webhookWorker).not.toHaveBeenCalled();
  const index = (await WebhookEvent.collection.indexes()).find(item => item.name === 'provider_1_eventId_1');
  expect(index?.unique).not.toBe(true);
});

it('keeps startup waiting for ledger readiness and stops when index creation fails', async () => {
  const listen = jest.spyOn(app, 'listen').mockImplementation((() => undefined) as never);
  const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(paidEffects, 'ensureBookingPaidEffectIndexes').mockResolvedValue(undefined);
  const paidWorker = jest.spyOn(paidEffects, 'processBookingPaidEffects');
  const webhookWorker = jest.spyOn(webhook, 'processWebhookDeliveries');
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  let fail!: (error: Error) => void;
  jest.spyOn(WebhookEvent, 'createIndexes').mockImplementation(() => {
    entered(); return new Promise<never>((_resolve, reject) => { fail = reject; });
  });
  const startup = startServer(); await waiting;
  expect(listen).not.toHaveBeenCalled(); expect(paidWorker).not.toHaveBeenCalled(); expect(webhookWorker).not.toHaveBeenCalled();
  fail(new Error('index unavailable')); await startup;
  expect(exit).toHaveBeenCalledWith(1); expect(listen).not.toHaveBeenCalled();
});

it('refuses a missing unique index over duplicate legacy receipts without deleting either record', async () => {
  await WebhookEvent.collection.insertMany([
    { provider: 'stripe', eventId: 'evt_qa_duplicate' },
    { provider: 'stripe', eventId: 'evt_qa_duplicate' },
  ]);
  await expect(webhook.ensureWebhookDeliveryIndexes()).rejects.toMatchObject({ code: 11000 });
  expect(await WebhookEvent.countDocuments()).toBe(2);
  expect((await WebhookEvent.collection.indexes()).map(index => index.name)).toEqual(['_id_']);
});
