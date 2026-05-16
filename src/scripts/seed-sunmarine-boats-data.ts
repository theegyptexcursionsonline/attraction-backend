/**
 * Seeds reviews, sample bookings and special offers for the five Egypt
 * Sunmarine boat tenants (Royal SeaScope, Pirates Premier Sailing,
 * Nefertari Cruise, Elite VIP Cruise, Rosetta II Classic Boat) so their
 * dashboards / homepage social proof / deals pages have realistic data
 * instead of empty states.
 *
 * Idempotent: deletes existing seeded records for each tenant first, then
 * recreates. Run with:  npx tsx src/scripts/seed-sunmarine-boats-data.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Review } from '../models/Review';
import { Booking } from '../models/Booking';
import { SpecialOffer } from '../models/SpecialOffer';
import { generateBookingReference } from '../utils/hash';

const log = (...args: unknown[]) => console.log('[seed-boats]', ...args);

const REVIEW_AUTHORS = [
  { name: 'Marie L.', country: 'France' },
  { name: 'Klaus W.', country: 'Germany' },
  { name: 'Anya K.', country: 'Russia' },
  { name: 'Lukas M.', country: 'Austria' },
  { name: 'Sofia R.', country: 'Italy' },
  { name: 'Hassan K.', country: 'Saudi Arabia' },
  { name: 'Emma B.', country: 'United Kingdom' },
  { name: 'Diego F.', country: 'Spain' },
  { name: 'Julia P.', country: 'Czech Republic' },
  { name: 'Mehmet T.', country: 'Turkey' },
  { name: 'Ahmed N.', country: 'Egypt' },
  { name: 'Olivier D.', country: 'Belgium' },
];

const REVIEW_TEMPLATES = [
  { title: 'The kids did not stop talking about it', body: 'Honestly the highlight of the whole holiday. The crew were brilliant with the children, everything ran on time, and the reef was incredible. Hotel pickup was punctual too.' },
  { title: 'Saw the reef without getting wet', body: 'My mother cannot swim and was nervous, but the cabin is sealed and air-conditioned and she had the best time pressing her face to the glass. Turtles, parrotfish, the lot.' },
  { title: 'Worth every dollar', body: 'Booked for our anniversary. Calm sailing, attentive crew, genuinely good food on board. Not a packed tourist factory — felt looked after the whole day.' },
  { title: 'Real, not staged', body: 'Done boat trips elsewhere that were chaos. This was the opposite — small, organised, professional. The snorkel stop water was unreal.' },
  { title: 'Perfect family day', body: 'Two kids, 6 and 9. Both safe, both entertained the entire time. The team clearly do this every day and know exactly how to run it. Booked again before we left.' },
  { title: 'Sunset sailing was magic', body: 'Took the later departure and the light on the way back was something else. Quiet, warm, beautiful. Best photos of the trip.' },
  { title: 'Crew made the day', body: 'Multilingual, friendly, genuinely enthusiastic. Safety briefing was thorough and reassuring. Felt confident with the kids the whole time.' },
  { title: 'Brand new and spotless', body: 'Was expecting a tired old boat — completely wrong. Clean, well kept, gear in great condition. Big difference from the cheaper operators.' },
  { title: 'Lunch on board was a highlight', body: 'The sailing and snorkel were great but the food genuinely surprised us. Fresh, hot, plenty of it. Lovely touch.' },
  { title: 'Would 100% do again', body: 'On-time pickup, smooth boarding, calm sea, two reef stops. Everything you hope for and nothing you dread. Recommended it to everyone at our hotel.' },
];

const BOOKING_GUESTS = [
  { firstName: 'Marie', lastName: 'Lefebvre', email: 'marie.l@example.com', phone: '+33 612 345 678', country: 'France' },
  { firstName: 'Klaus', lastName: 'Wagner', email: 'klaus.w@example.com', phone: '+49 170 1234567', country: 'Germany' },
  { firstName: 'Anya', lastName: 'Kuznetsova', email: 'anya.k@example.com', phone: '+7 911 234 5678', country: 'Russia' },
  { firstName: 'Lukas', lastName: 'Mayer', email: 'lukas.m@example.com', phone: '+43 660 1234567', country: 'Austria' },
  { firstName: 'Sofia', lastName: 'Ricci', email: 'sofia.r@example.com', phone: '+39 333 1234567', country: 'Italy' },
  { firstName: 'Hassan', lastName: 'Al-Khaled', email: 'hassan.k@example.com', phone: '+966 50 123 4567', country: 'Saudi Arabia' },
  { firstName: 'Emma', lastName: 'Brown', email: 'emma.b@example.com', phone: '+44 7700 900123', country: 'United Kingdom' },
  { firstName: 'Diego', lastName: 'Fernández', email: 'diego.f@example.com', phone: '+34 600 123 456', country: 'Spain' },
];

const TENANT_SLUGS = [
  'royal-seascope',
  'pirates-premier-sailing',
  'nefertari-cruise',
  'elite-vip-cruise',
  'rosetta-classic-boat',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function dateOffset(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split('T')[0];
}

async function seedTenant(tenantSlug: string): Promise<void> {
  log(`\n═════════ ${tenantSlug} ═════════`);
  const tenant = await Tenant.findOne({ slug: tenantSlug });
  if (!tenant) {
    log(`⚠ tenant not found, skipping`);
    return;
  }
  log(`✓ tenant ${tenant._id} · ${tenant.name}`);

  const attractions = await Attraction.find({
    tenantIds: { $in: [tenant._id] },
    status: 'active',
  });
  log(`✓ ${attractions.length} attractions found`);
  if (attractions.length === 0) return;

  await Review.deleteMany({ attractionId: { $in: attractions.map((a) => a._id) } });
  await Booking.deleteMany({ tenantId: tenant._id });
  await SpecialOffer.deleteMany({ attractionId: { $in: attractions.map((a) => a._id) } });
  log(`🗑  cleared existing reviews / bookings / offers`);

  const reviews: unknown[] = [];
  for (const attr of attractions) {
    const count = randomInt(5, 8);
    for (let i = 0; i < count; i++) {
      const author = pick(REVIEW_AUTHORS);
      const template = pick(REVIEW_TEMPLATES);
      const rating = Math.random() < 0.85 ? 5 : Math.random() < 0.5 ? 4 : 3;
      reviews.push({
        attractionId: attr._id,
        author: author.name,
        country: author.country,
        rating,
        title: template.title,
        content: template.body,
        verified: true,
        helpful: randomInt(0, 30),
        status: 'approved',
        createdAt: new Date(Date.now() - randomInt(1, 180) * 24 * 60 * 60 * 1000),
      });
    }
  }
  await Review.insertMany(reviews);
  log(`✓ ${reviews.length} reviews seeded across ${attractions.length} tours`);

  const offerTargets = attractions.slice(0, Math.min(3, attractions.length));
  const offerTitles = [
    { t: 'Early Bird Special', d: 'Book 14 days ahead and save', pct: 20 },
    { t: 'Weekday Sailing', d: 'Sun – Thu departures only', pct: 15 },
    { t: 'Family of 4+', d: 'Bring the whole crew, save together', pct: 25 },
  ];
  const validFrom = new Date();
  const validUntil = new Date();
  validUntil.setMonth(validUntil.getMonth() + 3);
  const offers = offerTargets.map((attr, i) => ({
    attractionId: attr._id,
    title: offerTitles[i].t,
    description: offerTitles[i].d,
    discountType: 'percentage' as const,
    discountValue: offerTitles[i].pct,
    validFrom,
    validUntil,
    usageLimit: 100,
    usageCount: randomInt(5, 35),
    isActive: true,
  }));
  await SpecialOffer.insertMany(offers);
  log(`✓ ${offers.length} special offers seeded`);

  const bookings: unknown[] = [];
  const statuses: Array<{ status: 'pending' | 'confirmed' | 'cancelled' | 'completed'; payment: 'pending' | 'succeeded' | 'failed' }> = [
    { status: 'completed', payment: 'succeeded' },
    { status: 'completed', payment: 'succeeded' },
    { status: 'completed', payment: 'succeeded' },
    { status: 'completed', payment: 'succeeded' },
    { status: 'confirmed', payment: 'succeeded' },
    { status: 'confirmed', payment: 'succeeded' },
    { status: 'confirmed', payment: 'pending' },
    { status: 'confirmed', payment: 'pending' },
    { status: 'pending', payment: 'pending' },
    { status: 'pending', payment: 'pending' },
    { status: 'cancelled', payment: 'failed' },
    { status: 'completed', payment: 'succeeded' },
  ];
  for (let i = 0; i < statuses.length; i++) {
    const attr = pick(attractions);
    const guest = pick(BOOKING_GUESTS);
    const adults = randomInt(1, 3);
    const children = Math.random() < 0.4 ? randomInt(0, 2) : 0;
    const opt = attr.pricingOptions?.[0] || { id: 'adult', name: 'Adult', price: attr.priceFrom };
    const unitPrice = opt.price ?? attr.priceFrom;
    const subtotal = unitPrice * adults + unitPrice * 0.6 * children;
    const offset = statuses[i].status === 'completed'
      ? -randomInt(7, 90)
      : statuses[i].status === 'confirmed'
      ? randomInt(2, 45)
      : randomInt(-15, 30);
    bookings.push({
      reference: generateBookingReference(),
      tenantId: tenant._id,
      attractionId: attr._id,
      items: [{
        optionId: opt.id,
        optionName: opt.name,
        date: dateOffset(offset),
        quantities: { adults, children, infants: 0 },
        unitPrice,
        totalPrice: subtotal,
      }],
      guestDetails: {
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email,
        phone: guest.phone,
        country: guest.country,
      },
      subtotal,
      fees: 0,
      discount: 0,
      total: subtotal,
      currency: 'USD',
      paymentMethod: Math.random() < 0.5 ? 'pay-later' : 'card',
      paymentStatus: statuses[i].payment,
      status: statuses[i].status,
      createdAt: new Date(Date.now() - randomInt(1, 120) * 24 * 60 * 60 * 1000),
    });
  }
  await Booking.insertMany(bookings);
  log(`✓ ${bookings.length} sample bookings seeded`);
}

async function connectDb(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set in env');
  await mongoose.connect(uri);
  log(`✓ MongoDB connected`);
}

(async () => {
  await connectDb();
  try {
    for (const slug of TENANT_SLUGS) {
      await seedTenant(slug);
    }
  } finally {
    await mongoose.disconnect();
  }
  log('\n✨ All done.');
  process.exit(0);
})().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
