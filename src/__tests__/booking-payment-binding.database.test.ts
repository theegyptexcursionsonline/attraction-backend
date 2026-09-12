import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Tenant } from '../models/Tenant';
import { Booking } from '../models/Booking';
import { claimBookingStripePaymentSession } from '../services/bookingPaymentBinding.service';
import { getTenantStripeConfig, saveTenantStripeConfig } from '../services/tenantPayment.service';

jest.mock('../utils/secretCrypto', () => ({
  encryptSecret: (value: string) => `enc:${value}`,
  decryptSecret: (value?: string) => value?.startsWith('enc:') ? value.slice(4) : '',
}));
jest.setTimeout(120_000);
let mongo: MongoMemoryReplSet;
const tenantId = new Types.ObjectId();
const bookingId = new Types.ObjectId();
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('booking_gateway_fence'));
  await Promise.all([Tenant.init(), Booking.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await Tenant.collection.deleteMany({});
  await Booking.collection.deleteMany({});
  await Tenant.collection.insertOne({ _id: tenantId, slug: 'gateway-fence', domain: 'gateway-fence.invalid', name: 'Gateway fence', paymentSettings: { stripe: {
    enabled: true, publishableKey: 'pk_test_public', secretKeyEnc: 'enc:rk_test_secret', webhookSecretEnc: 'enc:whsec_saved', verifiedAccountId: 'acct_current', verifiedCredentialFingerprint: 'verified', configRevision: 0, bindingFenceRevision: 0,
  } } });
  await Booking.collection.insertOne({ _id: bookingId, tenantId, reference: 'ATT-FENCE', paymentMethod: 'card', status: 'pending', paymentStatus: 'pending', total: 25, currency: 'EUR' });
});
it('allows exactly one winner between provider-session claim and a concurrent admin gateway save', async () => {
  const config = (await getTenantStripeConfig(String(tenantId)))!;
  const booking = (await Booking.findById(bookingId))!;
  const results = await Promise.allSettled([
    claimBookingStripePaymentSession(booking, config),
    saveTenantStripeConfig(String(tenantId), { enabled: false, expectedConfigRevision: 0, expectedBindingFenceRevision: 0 }),
  ]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const persistedBooking = (await Booking.findById(bookingId))!;
  const persistedConfig = (await getTenantStripeConfig(String(tenantId)))!;
  if (results[0].status === 'fulfilled') {
    expect(persistedBooking.stripePaymentSessionClaimedAt).toBeInstanceOf(Date);
    expect(persistedConfig.enabled).toBe(true);
    expect(persistedConfig.bindingFenceRevision).toBe(1);
  } else {
    expect(persistedBooking.stripePaymentSessionClaimedAt).toBeUndefined();
    expect(persistedConfig.enabled).toBe(false);
  }
});
it('rolls the tenant fence back when a cancelled booking cannot claim a provider session', async () => {
  const config = (await getTenantStripeConfig(String(tenantId)))!;
  await Booking.collection.updateOne({ _id: bookingId }, { $set: { status: 'cancelled' } });
  const booking = (await Booking.findById(bookingId))!;
  await expect(claimBookingStripePaymentSession(booking, config)).rejects.toThrow('Payment session changed');
  expect((await getTenantStripeConfig(String(tenantId)))!.bindingFenceRevision).toBe(0);
  expect((await Booking.findById(bookingId))!.stripePaymentSessionClaimedAt).toBeUndefined();
});
