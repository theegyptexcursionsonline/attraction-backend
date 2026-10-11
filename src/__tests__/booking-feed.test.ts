import { Types } from 'mongoose';
import {
  FEED_PAGE_LIMIT,
  buildFeedPage,
  canonicalFeedQuery,
  cursorAfter,
  feedQuery,
  parseFeedRequest,
  splitOverItems,
  toFeedItems,
  verifyFeedSignature,
  type FeedBookingRow,
  type FeedRequest,
} from '../utils/bookingFeed';
import pinnedItems from './fixtures/booking-feed-items.json';
import { CONTRACT_CASES } from './fixtures/booking-feed-contract';

/**
 * The booking feed's pure rules: the shared request signature, strict parameters, the page query,
 * and how one Attraction Network booking becomes feed items in the booking API's vocabulary.
 */

// The same vectors are pinned in the booking API's signing tests and the EEO website's feed tests,
// so the signing end and every verifying end are held to one written rule.
const SECRET = 'feed-vector-secret-0123456789-abcdefghij';
const T = 1791554400;
const PATH = '/api/internal/booking-feed';
const CHANGES = new URLSearchParams('limit=100&since=2026-10-09T08:00:00.000Z');
const WINDOW = new URLSearchParams('serviceTo=2026-12-09&cursor=eyJkIjoiMjAyNi0xMC0xMCJ9&serviceFrom=2026-10-09&limit=100');
const CHANGES_SIGNATURE = 't=1791554400,v1=5c61c577d2bdb81cad961f489f122387e0b68f110fd4d74a57711eea2a8c4d28';
const WINDOW_SIGNATURE = 't=1791554400,v1=77436b6fee42572420a56150091869cea76094928094a0445230d70553a687b5';

describe('feed request signature', () => {
  it('accepts the agreed vectors, sorted and percent-encoded whatever the order', () => {
    expect(verifyFeedSignature(SECRET, CHANGES_SIGNATURE, 'GET', PATH, CHANGES, T)).toBe(true);
    expect(verifyFeedSignature(SECRET, WINDOW_SIGNATURE, 'GET', PATH, WINDOW, T)).toBe(true);
    expect(canonicalFeedQuery(WINDOW)).toBe('cursor=eyJkIjoiMjAyNi0xMC0xMCJ9&limit=100&serviceFrom=2026-10-09&serviceTo=2026-12-09');
  });

  it('refuses anything but an exact, in-window signature of this very request', () => {
    expect(verifyFeedSignature(SECRET, CHANGES_SIGNATURE, 'GET', PATH, CHANGES, T + 300)).toBe(true);
    expect(verifyFeedSignature(SECRET, CHANGES_SIGNATURE, 'GET', PATH, CHANGES, T + 301)).toBe(false);
    expect(verifyFeedSignature(SECRET, CHANGES_SIGNATURE, 'GET', PATH, CHANGES, T - 301)).toBe(false);
    expect(verifyFeedSignature(`${SECRET}x`, CHANGES_SIGNATURE, 'GET', PATH, CHANGES, T)).toBe(false);
    expect(verifyFeedSignature(SECRET, CHANGES_SIGNATURE, 'POST', PATH, CHANGES, T)).toBe(false);
    expect(verifyFeedSignature(SECRET, CHANGES_SIGNATURE, 'GET', '/api/internal/booking-feed/', CHANGES, T)).toBe(false);
    expect(verifyFeedSignature(SECRET, CHANGES_SIGNATURE, 'GET', PATH, new URLSearchParams('limit=101&since=2026-10-09T08:00:00.000Z'), T)).toBe(false);
    for (const broken of [undefined, null, '', 'v1=abc', `t=${T}`, `t=${T},v1=${'0'.repeat(63)}`, `t=abc,v1=${'0'.repeat(64)}`, `t=${T},v1=${'A'.repeat(64)}`]) {
      expect(verifyFeedSignature(SECRET, broken, 'GET', PATH, CHANGES, T)).toBe(false);
    }
  });

  it('refuses every request while the secret is shorter than 32 bytes', () => {
    expect(verifyFeedSignature('short', CHANGES_SIGNATURE, 'GET', PATH, CHANGES, T)).toBe(false);
    expect(verifyFeedSignature('', CHANGES_SIGNATURE, 'GET', PATH, CHANGES, T)).toBe(false);
  });
});

describe('feed parameters', () => {
  const parse = (query: string) => parseFeedRequest(new URLSearchParams(query));
  const field = (query: string) => {
    try { parse(query); } catch (error) { return (error as { field?: string }).field; }
    return 'accepted';
  };

  it('reads changes, a first sync from a time, and a service-day window', () => {
    expect(parse('')).toEqual({ mode: 'changes', limit: 100, since: null, after: null });
    expect(parse('limit=25&since=2026-10-10T08:00:00.000Z')).toEqual({ mode: 'changes', limit: 25, since: new Date('2026-10-10T08:00:00.000Z'), after: null });
    expect(parse('serviceFrom=2026-10-10&serviceTo=2026-12-09')).toEqual({ mode: 'window', limit: 100, serviceFrom: '2026-10-10', serviceTo: '2026-12-09', after: null });
  });

  it('refuses unknown, repeated, mixed and malformed parameters, naming the field', () => {
    expect(field('page=2')).toBe('page');
    expect(field('limit=5&limit=6')).toBe('limit');
    for (const limit of ['0', '101', '1e2', '+5', '5.0', ' 5', 'x']) expect(field(`limit=${encodeURIComponent(limit)}`)).toBe('limit');
    expect(field('since=yesterday')).toBe('since');
    expect(field('since=2026-10-10')).toBe('since');
    expect(field('serviceFrom=2026-10-10&serviceTo=2026-10-09')).toBe('serviceTo');
    expect(field('serviceFrom=2026-10-10&serviceTo=2027-02-08')).toBe('serviceTo');
    expect(field('serviceFrom=2026-02-30&serviceTo=2026-03-02')).toBe('serviceFrom');
    expect(field('serviceFrom=2026-10-10')).toBe('serviceTo');
    expect(field('serviceFrom=2026-10-10&serviceTo=2026-10-12&since=2026-10-10T00:00:00Z')).toBe('since');
    expect(field('cursor=not-a-cursor')).toBe('cursor');
  });

  it('never reads a window cursor as a changes cursor, or the other way round', () => {
    const id = new Types.ObjectId('6700000000000000000000b1');
    const changes = parse('');
    const window = parse('serviceFrom=2026-10-10&serviceTo=2026-10-12');
    const changesCursor = cursorAfter(changes, { _id: id, updatedAt: new Date('2026-10-11T08:00:00.000Z') });
    const windowCursor = cursorAfter(window, { _id: id });
    expect(parse(`cursor=${changesCursor}`)).toEqual({ mode: 'changes', limit: 100, since: null, after: { at: new Date('2026-10-11T08:00:00.000Z'), id } });
    expect(parse(`serviceFrom=2026-10-10&serviceTo=2026-10-12&cursor=${windowCursor}`)).toEqual({ mode: 'window', limit: 100, serviceFrom: '2026-10-10', serviceTo: '2026-10-12', after: { id } });
    expect(field(`cursor=${windowCursor}`)).toBe('cursor');
    expect(field(`serviceFrom=2026-10-10&serviceTo=2026-10-12&cursor=${changesCursor}`)).toBe('cursor');
    expect(field(`cursor=${changesCursor}&since=2026-10-10T00:00:00.000Z`)).toBe('since');
  });
});

describe('page query', () => {
  const now = new Date('2026-10-11T09:00:00.000Z');
  const id = new Types.ObjectId('6700000000000000000000c1');

  it('reads changes in (updatedAt, _id) order and leaves the last ten seconds to settle', () => {
    const first = feedQuery({ mode: 'changes', limit: 100, since: new Date('2026-10-10T09:00:00.000Z'), after: null }, now);
    expect(first).toEqual({
      filter: { $and: [{ updatedAt: { $lte: new Date('2026-10-11T08:59:50.000Z') } }, { updatedAt: { $gte: new Date('2026-10-10T09:00:00.000Z') } }] },
      sort: { updatedAt: 1, _id: 1 },
    });
    const at = new Date('2026-10-11T08:00:00.000Z');
    expect(feedQuery({ mode: 'changes', limit: 100, since: null, after: { at, id } }, now).filter).toEqual({
      $and: [{ updatedAt: { $lte: new Date('2026-10-11T08:59:50.000Z') } }, { $or: [{ updatedAt: { $gt: at } }, { updatedAt: at, _id: { $gt: id } }] }],
    });
  });

  it('reads a window by one item inside it, in _id order', () => {
    expect(feedQuery({ mode: 'window', limit: 100, serviceFrom: '2026-10-10', serviceTo: '2026-12-09', after: { id } }, now)).toEqual({
      filter: { $and: [{ items: { $elemMatch: { date: { $gte: '2026-10-10', $lte: '2026-12-09' } } } }, { _id: { $gt: id } }] },
      sort: { _id: 1 },
    });
  });
});

const SITE = { slug: 'makadi-horse-club', timezone: 'Africa/Cairo' };
const TOUR = { title: 'Sunset Horse Ride' };
const TOUR_ID = new Types.ObjectId('6700000000000000000000d1');
const booking = (overrides: Partial<FeedBookingRow> = {}): FeedBookingRow => ({
  _id: new Types.ObjectId('6700000000000000000000a1'),
  reference: 'ATT-QA7K2-M9P4',
  tenantId: new Types.ObjectId('6700000000000000000000e1'),
  attractionId: TOUR_ID,
  items: [{
    optionId: 'sunset', optionName: 'Sunset ride', date: '2026-10-20', time: '17:30',
    quantities: { adults: 2, children: 1, infants: 0 }, totalPrice: 150,
    hotelPickup: { status: 'confirmed', hotelName: 'Steigenberger Aldau', roomNumber: '214', pickupTime: '16:45' },
  }],
  guestDetails: { firstName: 'Egypt Excursions Online', lastName: 'QA', email: 'theegyptexcursionsonline@gmail.com', phone: '+201000000000' },
  total: 150,
  refundedAmount: 0,
  currency: 'USD',
  status: 'confirmed',
  paymentStatus: 'succeeded',
  paymentMethod: 'card',
  updatedAt: new Date('2026-10-11T08:00:00.000Z'),
  ...overrides,
});

describe('one booking as feed items', () => {
  it('sends a paid one-service booking in the booking API vocabulary', () => {
    expect(toFeedItems(booking(), SITE, TOUR)).toEqual([{
      source: 'atn',
      externalRef: 'ATT-QA7K2-M9P4',
      sourceBookingId: '6700000000000000000000a1',
      sourceSite: 'makadi-horse-club',
      status: 'confirmed',
      paymentStatus: 'paid',
      tour: { name: 'Sunset Horse Ride', code: '6700000000000000000000d1', option: 'Sunset ride' },
      serviceDate: '2026-10-20',
      serviceTime: '17:30',
      timezone: 'Africa/Cairo',
      guests: { total: 3, breakdown: [{ label: 'Adults', count: 2 }, { label: 'Children', count: 1 }] },
      amount: { value: '150.00', currency: 'USD' },
      customer: { name: 'Egypt Excursions Online QA', email: 'theegyptexcursionsonline@gmail.com', phone: '+201000000000', locale: null },
      pickup: { hotel: 'Steigenberger Aldau', room: '214', time: '16:45' },
      collect: null,
      updatedAt: '2026-10-11T08:00:00.000Z',
    }]);
  });

  it('sends each service of a longer booking as its own item, numbered, with the amount split exactly', () => {
    const items = toFeedItems(booking({
      total: 105,
      items: [
        { optionName: 'Sunset ride', date: '2026-10-20', time: '17:30', quantities: { adults: 2 }, totalPrice: 30 },
        { optionName: 'Morning ride', date: '2026-10-21', time: '08:00', quantities: { adults: 2 }, totalPrice: 30 },
        { optionName: 'Desert dinner', date: '2026-10-21', time: '19:00', quantities: { adults: 2 }, totalPrice: 40 },
      ],
    }), SITE, TOUR);
    expect(items.map((item) => [item.externalRef, item.serviceDate, item.serviceTime, (item.amount as { value: string }).value])).toEqual([
      ['ATT-QA7K2-M9P4/1', '2026-10-20', '17:30', '31.50'],
      ['ATT-QA7K2-M9P4/2', '2026-10-21', '08:00', '31.50'],
      ['ATT-QA7K2-M9P4/3', '2026-10-21', '19:00', '42.00'],
    ]);
    expect(items.every((item) => item.sourceBookingId === '6700000000000000000000a1')).toBe(true);
  });

  it('splits in whole minor units, the remainder on the last service, in each currency\'s own decimals', () => {
    expect(splitOverItems(10000, [100, 100, 100])).toEqual([3333, 3333, 3334]);
    expect(splitOverItems(10500, [3000, 3000, 4000])).toEqual([3150, 3150, 4200]);
    expect(splitOverItems(1000, [0, Number.NaN])).toEqual([500, 500]);
    expect(splitOverItems(999, [])).toEqual([999]);
    const yen = toFeedItems(booking({ currency: 'jpy', total: 15000 }), SITE, TOUR)[0];
    expect(yen.amount).toEqual({ value: '15000', currency: 'JPY' });
    const dinar = toFeedItems(booking({ currency: 'KWD', total: 12.345 }), SITE, TOUR)[0];
    expect(dinar.amount).toEqual({ value: '12.345', currency: 'KWD' });
    expect(toFeedItems(booking({ currency: 'US', total: 10 }), SITE, TOUR)[0].amount).toBeNull();
  });

  it('asks the driver to collect a pay-at-location booking on the day, and nothing once it is paid or cancelled', () => {
    const due = toFeedItems(booking({ paymentMethod: 'pay-later', paymentStatus: 'pending' }), SITE, TOUR)[0];
    expect([due.status, due.paymentStatus, due.collect]).toEqual(['confirmed', 'unpaid', { value: '150.00', currency: 'USD' }]);
    const split = toFeedItems(booking({
      paymentMethod: 'cash', paymentStatus: 'pending', total: 100,
      items: [{ optionName: 'A', date: '2026-10-20', quantities: { adults: 1 }, totalPrice: 50 }, { optionName: 'B', date: '2026-10-21', quantities: { adults: 1 }, totalPrice: 50 }],
    }), SITE, TOUR);
    expect(split.map((item) => item.collect)).toEqual([{ value: '50.00', currency: 'USD' }, { value: '50.00', currency: 'USD' }]);
    expect(toFeedItems(booking({ paymentMethod: 'pay-later', paymentStatus: 'succeeded' }), SITE, TOUR)[0].collect).toBeNull();
    expect(toFeedItems(booking({ paymentMethod: 'pay-later', paymentStatus: 'pending', status: 'cancelled' }), SITE, TOUR)[0].collect).toBeNull();
    expect(toFeedItems(booking({ paymentMethod: 'card' }), SITE, TOUR)[0].collect).toBeNull();
  });

  it('maps cancellations, refunds, completion and no-shows, and passes an unknown status on unchanged', () => {
    const one = (overrides: Partial<FeedBookingRow>) => {
      const [item] = toFeedItems(booking(overrides), SITE, TOUR);
      return [item.status, item.paymentStatus];
    };
    expect(one({ status: 'cancelled', paymentStatus: 'refunded', refundedAmount: 150 })).toEqual(['cancelled', 'refunded']);
    expect(one({ status: 'refunded', paymentStatus: 'refunded', refundedAmount: 150 })).toEqual(['cancelled', 'refunded']);
    expect(one({ status: 'confirmed', refundedAmount: 40 })).toEqual(['confirmed', 'partially_refunded']);
    expect(one({ status: 'completed' })).toEqual(['completed', 'paid']);
    expect(one({ status: 'completed', attendanceStatus: 'no-show' })).toEqual(['no_show', 'paid']);
    expect(one({ status: 'cancelled', attendanceStatus: 'no-show', paymentStatus: 'refunded' })).toEqual(['cancelled', 'refunded']);
    expect(one({ status: 'Awaiting', paymentStatus: 'succeeded' })).toEqual(['awaiting', 'paid']);
    expect(one({ status: 'pending', paymentMethod: 'pay-later', paymentStatus: 'pending' })).toEqual(['pending', 'unpaid']);
  });

  it('leaves out a card checkout that is not paid yet, and a booking it cannot identify', () => {
    expect(toFeedItems(booking({ status: 'pending', paymentMethod: 'card', paymentStatus: 'pending' }), SITE, TOUR)).toEqual([]);
    expect(toFeedItems(booking({ status: 'pending', paymentMethod: 'card', paymentStatus: 'failed' }), SITE, TOUR)).toEqual([]);
    expect(toFeedItems(booking({ status: 'pending', paymentMethod: 'card', paymentStatus: 'succeeded', bundleOrderId: new Types.ObjectId() }), SITE, TOUR)).toEqual([]);
    // An expired or declined checkout is sent once it is cancelled: the booking API closes it without a booking.
    expect(toFeedItems(booking({ status: 'cancelled', paymentMethod: 'card', paymentStatus: 'failed' }), SITE, TOUR)[0].status).toBe('cancelled');
    expect(toFeedItems(booking({ reference: '  ' }), SITE, TOUR)).toEqual([]);
    expect(toFeedItems(booking({ updatedAt: null }), SITE, TOUR)).toEqual([]);
    expect(toFeedItems(booking({ items: [] }), SITE, TOUR)).toEqual([]);
  });

  it('cleans display text, leaves out a contact that does not fit, and never sends a malformed day or time', () => {
    const [item] = toFeedItems(booking({
      guestDetails: { firstName: 'Egypt\nExcursions', lastName: ' Online\u0007QA ', email: `${'a'.repeat(250)}@x.example`, phone: '+20 100 000 0000 ext 1234567890123456789' },
      items: [{ optionName: '  Sunset\tride ', date: '2026-02-30', time: '5:30 PM', quantities: { adults: 1 }, totalPrice: 150, hotelPickup: { status: 'provide_later', hotelName: '' } }],
    }), null, null);
    expect(item.customer).toEqual({ name: 'Egypt Excursions Online QA', email: null, phone: null, locale: null });
    expect(item.tour).toEqual({ name: 'Tour no longer listed', code: '6700000000000000000000d1', option: 'Sunset ride' });
    expect([item.serviceDate, item.serviceTime, item.pickup, item.sourceSite, item.timezone]).toEqual([null, null, null, null, null]);
  });

  it('sends the hotel address when no hotel name was given, and keeps a guest count over 999 without its breakdown', () => {
    const [item] = toFeedItems(booking({
      items: [{ optionName: 'Group', date: '2026-10-20', quantities: { adults: 1000, children: 5 }, totalPrice: 150, hotelPickup: { status: 'confirmed', address: 'Al Mamsha, Hurghada', hotelName: '', pickupTime: '07:15' } }],
    }), SITE, TOUR);
    expect(item.guests).toEqual({ total: 999 });
    expect(item.pickup).toEqual({ hotel: 'Al Mamsha, Hurghada', room: null, time: '07:15' });
  });
});

describe('one page', () => {
  const request = (limit: number, mode: 'changes' | 'window' = 'changes'): FeedRequest => (mode === 'changes'
    ? { mode, limit, since: null, after: null }
    : { mode, limit, serviceFrom: '2026-10-20', serviceTo: '2026-10-20', after: null });
  const row = (n: number, items: number, extra: Partial<FeedBookingRow> = {}) => booking({
    _id: new Types.ObjectId(`6700000000000000000001${String(n).padStart(2, '0')}`),
    reference: `ATT-QA000-${String(n).padStart(4, '0')}`,
    updatedAt: new Date(Date.UTC(2026, 9, 11, 8, n)),
    items: Array.from({ length: items }, (_, index) => ({ optionName: `Option ${index + 1}`, date: index ? '2026-10-21' : '2026-10-20', quantities: { adults: 1 }, totalPrice: 10 })),
    ...extra,
  });
  const lookup = () => ({ site: SITE, tour: TOUR });

  it('never holds more items than the limit and never splits a booking across pages', () => {
    const rows = [row(1, 2), row(2, 2), row(3, 1)];
    const page = buildFeedPage(request(3), rows, lookup, null);
    expect(page.items.map((item) => item.externalRef)).toEqual(['ATT-QA000-0001/1', 'ATT-QA000-0001/2']);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe(cursorAfter(request(3), rows[0]));
  });

  it('moves past bookings that send nothing, and keeps the asked position when nothing was read', () => {
    const rows = [row(1, 1, { status: 'pending', paymentMethod: 'card' }), row(2, 1)];
    const page = buildFeedPage(request(5), rows, lookup, null);
    expect(page.items.map((item) => item.externalRef)).toEqual(['ATT-QA000-0002']);
    expect(page).toMatchObject({ hasMore: false, nextCursor: cursorAfter(request(5), rows[1]) });
    expect(buildFeedPage(request(5), [], lookup, 'asked-from')).toEqual({ items: [], hasMore: false, nextCursor: 'asked-from' });
  });

  it('says more follow when it read past the limit, and only window days count in a window page', () => {
    const rows = [row(1, 1), row(2, 1), row(3, 1)];
    expect(buildFeedPage(request(2), rows, lookup, null).hasMore).toBe(true);
    expect(buildFeedPage(request(3), rows, lookup, null).hasMore).toBe(false);
    const window = buildFeedPage(request(5, 'window'), [row(4, 2)], lookup, null);
    expect(window.items.map((item) => item.externalRef)).toEqual(['ATT-QA000-0004/1']);
  });

  it('sends a booking with more services than a page holds on a page of its own', () => {
    const big = row(5, FEED_PAGE_LIMIT + 2);
    const page = buildFeedPage(request(FEED_PAGE_LIMIT), [big, row(6, 1)], lookup, null);
    expect(page.items).toHaveLength(FEED_PAGE_LIMIT);
    expect(page.hasMore).toBe(true);
  });
});

describe('the contract with the booking API', () => {
  // The booking API's suite parses a copy of the pinned file and must take in every item but the last.
  it('still builds exactly the pinned items for each representative booking', () => {
    const built = CONTRACT_CASES.map((entry) => ({ case: entry.name, items: JSON.parse(JSON.stringify(toFeedItems(entry.row, entry.site, entry.tour))) }));
    expect(built).toEqual(pinnedItems);
  });
});
