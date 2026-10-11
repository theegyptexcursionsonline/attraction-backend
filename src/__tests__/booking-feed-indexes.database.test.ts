import { spawnSync } from 'child_process';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ensureBookingFeedIndexes } from '../scripts/migrate-booking-feed-indexes';

/** The booking feed's two indexes are created by an owner-approved script that only ever adds what is missing. */

jest.setTimeout(120_000);
let mongo: MongoMemoryServer;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('booking_feed_indexes'), { autoIndex: false });
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => { await mongoose.connection.db!.dropDatabase(); });

const bookings = () => mongoose.connection.db!.collection('bookings');

it('only reports on a dry run, creates on apply, and changes nothing the second time', async () => {
  expect(await ensureBookingFeedIndexes(bookings(), false)).toEqual([
    { name: 'booking_feed_changes', state: 'missing' },
    { name: 'booking_feed_window', state: 'missing' },
  ]);
  await bookings().insertOne({ reference: 'ATT-QAIDX-0001', updatedAt: new Date(), items: [{ date: '2026-10-20' }, { date: '2026-10-21' }] });
  expect((await bookings().indexes()).map((index) => index.name)).toEqual(['_id_']);
  expect(await ensureBookingFeedIndexes(bookings(), true)).toEqual([
    { name: 'booking_feed_changes', state: 'created' },
    { name: 'booking_feed_window', state: 'created' },
  ]);
  const created = await bookings().indexes();
  expect(created.find((index) => index.name === 'booking_feed_window')?.key).toEqual({ 'items.date': 1, _id: 1 });
  expect(await ensureBookingFeedIndexes(bookings(), true)).toEqual([
    { name: 'booking_feed_changes', state: 'present' },
    { name: 'booking_feed_window', state: 'present' },
  ]);
});

it('reuses an index that already has the key, and stops on a same-name index with another key', async () => {
  await bookings().createIndex({ updatedAt: 1, _id: 1 }, { name: 'legacy_updated' });
  await bookings().createIndex({ 'items.date': -1 }, { name: 'booking_feed_window' });
  await expect(ensureBookingFeedIndexes(bookings(), true)).rejects.toThrow('booking_feed_window exists with a different key');
  await bookings().dropIndex('booking_feed_window');
  expect(await ensureBookingFeedIndexes(bookings(), true)).toEqual([
    { name: 'booking_feed_changes', state: 'present_as', existingName: 'legacy_updated' },
    { name: 'booking_feed_window', state: 'created' },
  ]);
});
