import { Types } from 'mongoose';
import type { FeedBookingRow, FeedSite, FeedTour } from '../../utils/bookingFeed';

/**
 * Representative Attraction Network bookings for the feed contract. Their feed items are pinned in
 * `booking-feed-items.json`; the booking API's suite holds a copy of that file and checks that every
 * item is one it takes in (and that an unknown status is refused as "status not understood").
 * Change both copies together.
 */
const site: FeedSite = { slug: 'makadi-horse-club', timezone: 'Africa/Cairo' };
const tour: FeedTour = { title: 'Sunset Horse Ride' };
const base = (n: number, overrides: Partial<FeedBookingRow> = {}): FeedBookingRow => ({
  _id: new Types.ObjectId(`6720000000000000000000${String(n).padStart(2, '0')}`),
  reference: `ATT-QACON-${String(n).padStart(4, '0')}`,
  tenantId: new Types.ObjectId('6720000000000000000000e1'),
  attractionId: new Types.ObjectId('6720000000000000000000d1'),
  items: [{ optionName: 'Sunset ride', date: '2026-10-20', time: '17:30', quantities: { adults: 2, children: 1, infants: 1 }, totalPrice: 150,
    hotelPickup: { status: 'confirmed', hotelName: 'Steigenberger Aldau', roomNumber: '214', pickupTime: '16:45' } }],
  guestDetails: { firstName: 'Egypt Excursions Online', lastName: 'QA', email: 'theegyptexcursionsonline@gmail.com', phone: '+201000000000' },
  total: 150, refundedAmount: 0, currency: 'USD', status: 'confirmed', paymentStatus: 'succeeded', paymentMethod: 'card',
  updatedAt: new Date('2026-10-11T08:00:00.000Z'),
  ...overrides,
});

export const CONTRACT_CASES: Array<{ name: string; row: FeedBookingRow; site: FeedSite | null; tour: FeedTour | null }> = [
  { name: 'paid card booking', row: base(1), site, tour },
  {
    name: 'pay at location, two services',
    row: base(2, {
      paymentMethod: 'pay-later', paymentStatus: 'pending', total: 105,
      items: [
        { optionName: 'Sunset ride', date: '2026-10-20', time: '17:30', quantities: { adults: 2 }, totalPrice: 60 },
        { optionName: 'Morning ride', date: '2026-10-21', time: '08:00', quantities: { adults: 2 }, totalPrice: 40, hotelPickup: { status: 'provide_later', hotelName: '' } },
      ],
    }),
    site, tour,
  },
  { name: 'bundle service sold on another site', row: base(3, { bundleOrderId: new Types.ObjectId('6720000000000000000000f1'), sellerTenantId: new Types.ObjectId('6720000000000000000000e2') }), site: { slug: 'hurghada-dolphins', timezone: 'Africa/Cairo' }, tour },
  { name: 'cancelled and refunded', row: base(4, { status: 'cancelled', paymentStatus: 'refunded', refundedAmount: 150 }), site, tour },
  { name: 'partly refunded', row: base(5, { refundedAmount: 50 }), site, tour },
  { name: 'completed', row: base(6, { status: 'completed' }), site, tour },
  { name: 'no-show', row: base(7, { status: 'completed', attendanceStatus: 'no-show' }), site, tour },
  { name: 'yen', row: base(8, { currency: 'JPY', total: 15000 }), site, tour },
  { name: 'dinar', row: base(9, { currency: 'KWD', total: 45.125 }), site, tour },
  {
    name: 'nothing usable but the identity',
    row: base(10, { guestDetails: { firstName: '', lastName: '', email: 'not-an-address-that-fits'.repeat(20), phone: '' }, items: [{ optionName: '', date: 'soon', time: 'morning', quantities: {}, totalPrice: 0 }] }),
    site: null, tour: null,
  },
  { name: 'status not understood', row: base(11, { status: 'on_hold' }), site, tour },
];
