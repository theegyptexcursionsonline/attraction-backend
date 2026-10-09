/**
 * Traveler details open by an opaque key from the directory, so a traveller's email never sits in
 * the URL. The key only names the traveller: the brand scope still decides what the caller sees,
 * and anything that is not a key this server issued for this purpose finds nobody.
 */
import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Booking } from '../models/Booking';
import { Tenant } from '../models/Tenant';
import { getTravelerDetail, getTravelers } from '../controllers/users.controller';
import { encryptSecret } from '../utils/secretCrypto';
import { emailFromTravelerKey, travelerDetailKey } from '../utils/travelerKey';
import { AuthRequest } from '../types';

jest.setTimeout(120_000);
let mongo: MongoMemoryServer;
const brandA = new Types.ObjectId();
const brandB = new Types.ObjectId();
const brandAdminA = { _id: new Types.ObjectId(), role: 'brand-admin', assignedTenants: [brandA] };
const superAdmin = { _id: new Types.ObjectId(), role: 'super-admin', assignedTenants: [] };

const call = async (handler: typeof getTravelers, query: Record<string, unknown>, user: Record<string, unknown>) => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  const next = jest.fn();
  await handler({ query, user } as unknown as AuthRequest, res, next);
  expect(next).not.toHaveBeenCalled();
  return { status: res.status.mock.calls[0]?.[0] as number, body: res.json.mock.calls[0]?.[0] };
};

const booking = (tenantId: Types.ObjectId, email: string, total: number) => ({
  tenantId, reference: `R-${new Types.ObjectId()}`, attractionId: new Types.ObjectId(), status: 'confirmed', paymentStatus: 'paid',
  total, subtotal: total, currency: 'USD', createdAt: new Date('2026-09-01T00:00:00Z'),
  guestDetails: { firstName: 'Guest', lastName: 'Lead', email, phone: '+20 100', country: 'EG' },
  items: [{ optionId: 'o', optionName: 'Morning', date: '2026-11-01', time: '08:00', quantities: { adults: 2, children: 0, infants: 0 }, unitPrice: 10, totalPrice: total }],
});

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  mongo = await MongoMemoryServer.create(systemBinary ? { binary: { systemBinary } } : {});
  await mongoose.connect(mongo.getUri('traveler_detail_key'));
  await Tenant.collection.insertMany([
    { _id: brandA, slug: 'brand-a', domain: 'a.invalid', name: 'Brand A' },
    { _id: brandB, slug: 'brand-b', domain: 'b.invalid', name: 'Brand B' },
  ]);
  await Booking.collection.insertMany([
    booking(brandA, 'both.brands@example.test', 100),
    booking(brandB, 'both.brands@example.test', 60),
    booking(brandB, 'other.brand.only@example.test', 75),
  ]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

describe('traveler detail key', () => {
  it('gives every directory row a key that does not reveal the email', async () => {
    const { body } = await call(getTravelers, {}, brandAdminA);
    const rows = body.data.data as Array<{ email: string; detailKey: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].detailKey).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(rows[0].detailKey).not.toContain('both.brands');
    expect(rows[0].detailKey).not.toContain('example');
  });

  it('opens the details by key, scoped to the caller\'s brand', async () => {
    const key = travelerDetailKey('both.brands@example.test')!;
    const { status, body } = await call(getTravelerDetail, { key }, brandAdminA);
    expect(status).toBe(200);
    expect(body.data.email).toBe('both.brands@example.test');
    expect(body.data.bookings.map((item: { brand: { name: string } }) => item.brand.name)).toEqual(['Brand A']);
  });

  it('finds nobody for a key to a traveller with no booking on the caller\'s brands', async () => {
    const { status } = await call(getTravelerDetail, { key: travelerDetailKey('other.brand.only@example.test') }, brandAdminA);
    expect(status).toBe(404);
  });

  it('finds nobody for a tampered key or another encrypted value', async () => {
    const key = travelerDetailKey('both.brands@example.test')!;
    const tampered = `${key.slice(0, -2)}${key.endsWith('AA') ? 'BB' : 'AA'}`;
    expect((await call(getTravelerDetail, { key: tampered }, superAdmin)).status).toBe(404);
    const foreign = encryptSecret('both.brands@example.test').split(':')
      .map((part) => part.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')).join('.');
    expect((await call(getTravelerDetail, { key: foreign }, superAdmin)).status).toBe(404);
    expect((await call(getTravelerDetail, { key: 'not-a-key' }, superAdmin)).status).toBe(404);
  });

  it('still opens by email for screens loaded before the key existed', async () => {
    const { status, body } = await call(getTravelerDetail, { email: 'both.brands@example.test' }, superAdmin);
    expect(status).toBe(200);
    expect(body.data.bookings).toHaveLength(2);
  });

  it('round-trips and rejects anything else', () => {
    const key = travelerDetailKey('Mixed.Case@Example.Test')!;
    expect(emailFromTravelerKey(key)).toBe('Mixed.Case@Example.Test');
    expect(travelerDetailKey('a@b.test')).not.toBe(travelerDetailKey('a@b.test'));
    for (const bad of [undefined, 42, '', 'a.b', 'x'.repeat(700), 'a.b.c']) expect(emailFromTravelerKey(bad)).toBeNull();
  });
});
