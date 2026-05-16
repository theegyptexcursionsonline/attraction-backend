/**
 * Seed 6 brand-exclusive Rosetta II Classic Boat snorkel trips. Each trip's
 * `tenantIds` includes BOTH the rosetta-classic-boat tenant AND the
 * egypt-sunmarine mother portfolio — shared multi-tenant catalog.
 *
 * Uses the real deck photos (already on Cloudinary) for cover images.
 *
 * Idempotent: skips trips whose slug already exists.
 *
 * Usage:
 *   npx ts-node src/scripts/seed-classic-boat-tours.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';

const TENANT_SLUG = 'rosetta-classic-boat';
const PORTFOLIO_SLUG = 'egypt-sunmarine';

const IMG = {
  rosetta:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873265/attractions-network/tenant-heroes/classic-boat/qrfef8aujsvztpel4lsf.jpg',
  dining:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873268/attractions-network/tenant-heroes/classic-boat/iigaht2f0e9u57j3rxev.jpg',
  loungers:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873270/attractions-network/tenant-heroes/classic-boat/g8oxpbzzus05hbmobfbq.jpg',
  deck:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873275/attractions-network/tenant-heroes/classic-boat/nregvzctkamycxvnlfqd.jpg',
  snorkelers:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873277/attractions-network/tenant-heroes/classic-boat/uwgtognnlwjnutlqbm49.jpg',
};

const TRIPS = [
  {
    slug: 'rosetta-hurghada-classic-snorkel',
    title: 'Rosetta II Hurghada · Classic Snorkel Day',
    shortDescription:
      'The dependable Hurghada day. Two Giftun reef stops, lunch on board, all gear included.',
    description:
      "The family default. Hotel pickup 08:30, board the classic boat at Hurghada Marina, short snorkel briefing, gear fitted on deck. Two snorkel stops on two Giftun Island reefs with a guide in the water, a hot lunch served on board between them, sun-deck time, soft drinks on the sail home. Honest, easy, well-priced. Door-to-door ~7 hours.",
    duration: '~5 h sailing · ~7 h door-to-door',
    priceFrom: 25,
    images: [IMG.rosetta, IMG.snorkelers, IMG.dining, IMG.deck],
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Classic snorkel day · age 13+', price: 25 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · kids lunch', price: 15 },
      { id: 'family', name: 'Family pack (2A + 2C)', description: 'Family group rate', price: 70 },
    ],
    addons: [
      { id: 'pickup', name: 'Hotel pickup & drop-off', description: 'Air-conditioned van from any Hurghada hotel', price: 6 },
      { id: 'extra-reef', name: 'Third reef stop', description: 'Add a third snorkel stop on the way home', price: 10 },
      { id: 'photos', name: 'Photo package', description: 'Crew photographer · digital gallery', price: 14 },
    ],
    highlights: ['Two Giftun reef stops', 'Lunch + gear included', 'Guide in the water', 'Most affordable in the family', 'Family-friendly'],
    inclusions: ['Marina boarding', 'Two reef snorkel stops', 'All snorkel gear', 'Hot lunch on board', 'Soft drinks', 'Marine insurance'],
    exclusions: ['Tips', 'Hotel pickup (add-on)', 'Photo package (add-on)'],
  },
  {
    slug: 'rosetta-sharm-tiran-classic',
    title: 'Rosetta II Sharm El Sheikh · Tiran Classic',
    shortDescription: 'World-class snorkel water at the classic price. Two Tiran Strait reef stops from Sharm.',
    description:
      "The Tiran Strait — some of the clearest snorkel water on the planet — at the dependable classic price. Hotel pickup 08:30, two snorkel stops on the Tiran reefs with a guide, hot lunch on board between them, sun-deck time, soft drinks home.",
    duration: '~5 h sailing · ~7 h door-to-door',
    priceFrom: 28,
    images: [IMG.snorkelers, IMG.rosetta, IMG.deck, IMG.dining],
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Classic snorkel day · age 13+', price: 28 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · kids lunch', price: 17 },
    ],
    addons: [
      { id: 'pickup', name: 'Hotel pickup & drop-off', description: 'Air-conditioned van from any Sharm hotel', price: 6 },
      { id: 'extra-reef', name: 'Third reef stop', description: 'Add a third snorkel stop', price: 10 },
      { id: 'photos', name: 'Photo package', description: 'Crew photographer · digital gallery', price: 14 },
    ],
    highlights: ['Tiran Strait clarity', 'Two reef stops', 'Lunch + gear included', 'Classic price', 'Guide in the water'],
    inclusions: ['Marina boarding', 'Two reef snorkel stops', 'All snorkel gear', 'Hot lunch on board', 'Soft drinks', 'Marine insurance'],
    exclusions: ['Tips', 'Pickup (add-on)', 'Photos (add-on)'],
  },
  {
    slug: 'rosetta-dahab-quiet-reefs',
    title: 'Rosetta II Dahab · Quiet Reefs',
    shortDescription: 'The relaxed classic day. Smaller boats, gentle Dahab reefs, fewer crowds.',
    description:
      "Dahab's classic boats are smaller and the reefs gentler — the most relaxed, uncrowded day in the fleet. Hotel pickup 08:30, two snorkel stops on quiet Dahab reefs, hot lunch on board, generous sun-deck time, soft drinks home. Ideal for first-timers and nervous swimmers.",
    duration: '~5 h sailing · ~6.5 h door-to-door',
    priceFrom: 26,
    images: [IMG.deck, IMG.rosetta, IMG.snorkelers],
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Classic snorkel day · age 13+', price: 26 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · kids lunch', price: 16 },
    ],
    addons: [
      { id: 'pickup', name: 'Hotel pickup & drop-off', description: 'Air-conditioned van from any Dahab hotel', price: 6 },
      { id: 'beginner-lesson', name: 'Beginner snorkel lesson', description: '30 min in-water guided lesson for first-timers', price: 12 },
      { id: 'photos', name: 'Photo package', description: 'Crew photographer · digital gallery', price: 14 },
    ],
    highlights: ['Quietest reefs in the fleet', 'Smaller, relaxed boats', 'Great for first-timers', 'Lunch + gear included', 'Two reef stops'],
    inclusions: ['Marina boarding', 'Two reef snorkel stops', 'All snorkel gear', 'Hot lunch on board', 'Soft drinks', 'Marine insurance'],
    exclusions: ['Tips', 'Pickup (add-on)', 'Beginner lesson (add-on)'],
  },
  {
    slug: 'rosetta-ain-sokhna-cairo-day',
    title: 'Rosetta II Ain Sokhna · Cairo Day Trip',
    shortDescription: 'The closest Red Sea snorkel day to Cairo. Short drive, classic boat, two reef stops.',
    description:
      "The northern boats — the shortest Red Sea drive from the capital. A genuine snorkel day-trip for Cairo guests who don't want to fly south. Two reef stops, hot lunch on board, all gear included, the same dependable classic price. Cairo round-trip transfer available as an add-on.",
    duration: '~5 h sailing · ~7 h door-to-door (from Ain Sokhna)',
    priceFrom: 27,
    images: [IMG.rosetta, IMG.deck, IMG.dining],
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Classic snorkel day · age 13+', price: 27 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · kids lunch', price: 16 },
    ],
    addons: [
      { id: 'transfer-cairo', name: 'Cairo round-trip transfer', description: 'Air-conditioned coach from Cairo · round trip', price: 35 },
      { id: 'transfer-local', name: 'Local hotel pickup', description: 'Van from any Ain Sokhna hotel', price: 6 },
      { id: 'photos', name: 'Photo package', description: 'Crew photographer · digital gallery', price: 14 },
    ],
    highlights: ['Closest snorkel day to Cairo', 'Cairo transfer available', 'Two reef stops', 'Lunch + gear included', 'Classic price'],
    inclusions: ['Marina boarding', 'Two reef snorkel stops', 'All snorkel gear', 'Hot lunch on board', 'Soft drinks', 'Marine insurance'],
    exclusions: ['Tips', 'Cairo transfer (add-on)', 'Photos (add-on)'],
  },
  {
    slug: 'rosetta-family-snorkel-special',
    title: 'Rosetta II Family Snorkel Special',
    shortDescription: 'Built for families with young kids. Calm zone, beginner guide, kids lunch, under-4s free.',
    description:
      "The family special. The same dependable classic day, set up around young children: a roped calm shallow zone, a dedicated beginner guide in the water, a kids lunch menu, and under-4s free. Two gentle reef stops, hot lunch on board, all gear included.",
    duration: '~5 h sailing · ~7 h door-to-door',
    priceFrom: 23,
    images: [IMG.snorkelers, IMG.deck, IMG.rosetta, IMG.dining],
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Family classic day · age 13+', price: 23 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · kids lunch + beginner guide', price: 14 },
      { id: 'toddler', name: 'Toddler (under 4)', description: 'Free with paying adult · vest provided', price: 0 },
    ],
    addons: [
      { id: 'pickup', name: 'Hotel pickup & drop-off', description: 'Air-conditioned van', price: 6 },
      { id: 'beginner-lesson', name: 'Kids snorkel lesson', description: '30 min guided in-water lesson for children', price: 10 },
      { id: 'photos', name: 'Photo package', description: 'Crew photographer · digital gallery', price: 14 },
    ],
    highlights: ['Built for young families', 'Roped calm zone', 'Dedicated beginner guide', 'Under-4s free', 'Most affordable family day'],
    inclusions: ['Marina boarding', 'Two reef snorkel stops', 'All snorkel gear', 'Kids + adult lunch', 'Soft drinks', 'Marine insurance'],
    exclusions: ['Tips', 'Pickup (add-on)', 'Kids lesson (add-on)'],
  },
  {
    slug: 'rosetta-private-boat-charter',
    title: 'Rosetta II Private Boat Charter',
    shortDescription: 'Charter a whole classic boat for your group. Up to 70 guests, your reefs, your timing.',
    description:
      "The whole boat at the classic price. Up to 70 guests, choose your reefs and your timing. Group days, family reunions, club outings and school trips. The rate below starts from Hurghada in shoulder season; other cities and peak dates quoted on request.",
    duration: '~5 h sailing (customisable)',
    priceFrom: 650,
    images: [IMG.rosetta, IMG.deck, IMG.dining],
    pricingOptions: [
      { id: 'charter', name: 'Whole-boat charter', description: 'Up to 70 guests · Hurghada · shoulder season', price: 650 },
      { id: 'charter-peak', name: 'Whole-boat charter (peak)', description: 'Up to 70 guests · peak season', price: 900 },
    ],
    addons: [
      { id: 'catering', name: 'Catering upgrade', description: 'Extended buffet + BBQ · 1.5 h service', price: 280 },
      { id: 'extra-reef', name: 'Third reef stop', description: 'Add a third snorkel stop', price: 60 },
      { id: 'transport', name: 'Group transport', description: 'Majestic Travel coach for your group · all cities', price: 180 },
    ],
    highlights: ['Whole 70-guest boat', 'Choose your reefs', 'Group / club / school ready', 'Classic price', 'Catering upgrade available'],
    inclusions: ['Whole-boat charter', 'Crew + captain', 'Two reef stops', 'All snorkel gear', 'Soft drinks', 'Marine insurance'],
    exclusions: ['Tips', 'Catering (add-on)', 'Transport (add-on)'],
  },
];

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG });
    if (!tenant) {
      console.error(`Tenant '${TENANT_SLUG}' not found. Run seed-classic-boat-tenant.ts first.`);
      process.exitCode = 1;
      return;
    }
    const portfolio = await Tenant.findOne({ slug: PORTFOLIO_SLUG });
    if (!portfolio) {
      console.error(`Mother portfolio '${PORTFOLIO_SLUG}' not found. Aborting.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Tenant: ${tenant.name} (_id=${tenant._id})`);
    console.log(`Portfolio cross-link: ${portfolio.name} (_id=${portfolio._id})\n`);

    let created = 0;
    let skipped = 0;
    let i = 0;

    for (const trip of TRIPS) {
      i++;
      const exists = await Attraction.findOne({ slug: trip.slug });
      if (exists) {
        console.log(`[${i}/${TRIPS.length}] SKIP  ${trip.slug} (exists)`);
        skipped++;
        continue;
      }

      await Attraction.create({
        slug: trip.slug,
        title: trip.title,
        shortDescription: trip.shortDescription,
        description: trip.description,
        images: trip.images,
        category: 'water-activities',
        destination: {
          city: 'Hurghada',
          country: 'Egypt',
          coordinates: { lat: 27.2574, lng: 33.8129 },
        },
        duration: trip.duration,
        languages: ['English', 'Arabic', 'German', 'Russian', 'Italian', 'French'],
        rating: 4.5 + Math.round(Math.random() * 4) / 10,
        reviewCount: 250 + Math.floor(Math.random() * 900),
        priceFrom: trip.priceFrom,
        currency: 'USD',
        pricingOptions: trip.pricingOptions,
        addons: trip.addons,
        entryWindows: [{ label: 'Day sail', startTime: '09:00', endTime: '15:00' }],
        itinerary: [],
        highlights: trip.highlights,
        inclusions: trip.inclusions,
        exclusions: trip.exclusions,
        meetingPoint: {
          address: 'Hurghada Marina · Red Sea coast',
          instructions:
            'Hotel pickup is available as an add-on. Otherwise meet at the Rosetta II Classic Boat counter at the marina 30 min before departure.',
          mapUrl: 'https://maps.google.com/?q=27.2287,33.8487',
        },
        cancellationPolicy: 'Free cancellation up to 24 hours before',
        instantConfirmation: true,
        mobileTicket: true,
        badges: ['bestseller', 'free-cancellation', 'instant-confirm'],
        availability: { type: 'date-only', advanceBooking: 30 },
        tenantIds: [tenant._id, portfolio._id],
        status: 'active',
        featured: true,
      });
      console.log(`[${i}/${TRIPS.length}] CREATED ✅ ${trip.slug} (tenantIds: rosetta-classic + sunmarine portfolio)`);
      created++;
    }

    console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
