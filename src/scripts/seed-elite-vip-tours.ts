/**
 * Seed 6 brand-exclusive Elite VIP Cruise sailings. Each sailing's
 * `tenantIds` includes BOTH the elite-vip-cruise tenant AND the
 * egypt-sunmarine mother portfolio — shared multi-tenant catalog.
 *
 * Uses the real deck photos (already on Cloudinary) for cover images.
 *
 * Idempotent: skips sailings whose slug already exists.
 *
 * Usage:
 *   npx ts-node src/scripts/seed-elite-vip-tours.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';

const TENANT_SLUG = 'elite-vip-cruise';
const PORTFOLIO_SLUG = 'egypt-sunmarine';

const IMG = {
  yacht:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873249/attractions-network/tenant-heroes/elite-vip-cruise/qdoi3tifd7sv3mwyqb8n.jpg',
  snorkel:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873251/attractions-network/tenant-heroes/elite-vip-cruise/mviwed3xj2ayv5l8tjk0.jpg',
  corridor:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873255/attractions-network/tenant-heroes/elite-vip-cruise/nmera67xtw74b0h8f7cr.jpg',
  deck:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873260/attractions-network/tenant-heroes/elite-vip-cruise/bchtrmlqreojk9esho6n.jpg',
  salon:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873262/attractions-network/tenant-heroes/elite-vip-cruise/v9fgsw3dpzjdlivavp1g.jpg',
};

const TRIPS = [
  {
    slug: 'elite-vip-marsa-alam-flagship-day',
    title: 'Elite VIP Marsa Alam · Flagship Day',
    shortDescription:
      'The flagship sailing. A full capped-list day aboard a white luxury yacht from Marsa Alam — sun deck, guided snorkel, BBQ at the table.',
    description:
      "Our signature day. Private transfer 08:00, board the flagship yacht at Marsa Alam Marina, welcome drink on the teak aft deck. Loungers on the sun deck as the yacht sails the warm southern water, a guided reef snorkel from the dive platform, then a five-star BBQ served at the table — never a queue. Coffee and fruit on the sail home. Door-to-door ~8 hours. Maximum 75 guests.",
    duration: '~6 h sailing · ~8 h door-to-door',
    priceFrom: 68,
    images: [IMG.yacht, IMG.deck, IMG.snorkel, IMG.salon],
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Full VIP day · age 13+', price: 68 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · kids BBQ menu', price: 42 },
      { id: 'family', name: 'Family pack (2A + 2C)', description: 'Family group rate', price: 195 },
    ],
    addons: [
      { id: 'transfer', name: 'Private transfer', description: 'Private car from any Marsa Alam / Port Ghalib hotel', price: 12 },
      { id: 'photos', name: 'Photo package', description: 'Crew photographer · digital gallery', price: 22 },
      { id: 'front-lounger', name: 'Bow lounger reservation', description: 'Reserved front sun-deck loungers for the day', price: 18 },
    ],
    highlights: ['Capped 75-guest list', 'Five-star BBQ at the table', 'Guided reef snorkel', 'Warmest southern water', 'Private transfer available'],
    inclusions: ['Marina boarding', 'Sun deck + salon', 'Guided snorkel + gear', 'Five-star BBQ', 'Soft drinks + coffee', 'Marine insurance'],
    exclusions: ['Tips', 'Private transfer (add-on)', 'Photo package (add-on)'],
  },
  {
    slug: 'elite-vip-sharm-tiran-yacht',
    title: 'Elite VIP Sharm El Sheikh · Tiran Yacht',
    shortDescription: 'The clearest snorkel water on the map. A capped-list white-yacht day on the Tiran Strait from Sharm.',
    description:
      "Sharm's yacht works the Tiran Strait — the clearest snorkel water in the fleet's map — kept to a 72-guest list. Private transfer 08:00, dramatic open-sea sailing, a long guided snorkel over the Tiran reef, the five-star BBQ at the table, sunset sail home.",
    duration: '~6 h sailing · ~8 h door-to-door',
    priceFrom: 72,
    images: [IMG.snorkel, IMG.yacht, IMG.deck, IMG.corridor],
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Full VIP day · age 13+', price: 72 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · kids BBQ menu', price: 44 },
    ],
    addons: [
      { id: 'transfer', name: 'Private transfer', description: 'Private car from any Sharm hotel', price: 12 },
      { id: 'extended-snorkel', name: 'Extended snorkel', description: 'Add 40 min on the Tiran reef', price: 16 },
      { id: 'photos', name: 'Photo package', description: 'Crew photographer · digital gallery', price: 22 },
    ],
    highlights: ['Tiran Strait clarity', '72-guest capped list', 'Long guided snorkel', 'Five-star BBQ', 'Open-sea sailing'],
    inclusions: ['Marina boarding', 'Sun deck + salon', 'Guided snorkel + gear', 'Five-star BBQ', 'Soft drinks + coffee', 'Marine insurance'],
    exclusions: ['Tips', 'Transfer (add-on)', 'Photos (add-on)'],
  },
  {
    slug: 'elite-vip-hurghada-giftun-yacht',
    title: 'Elite VIP Hurghada · Giftun Yacht',
    shortDescription: 'The calmest day of the fleet. Sheltered Giftun reefs, short transfer, capped guest list.',
    description:
      "Hurghada's yacht runs the sheltered Giftun Island reefs — the calmest, easiest sailing in the fleet, capped at 72 guests. Short transfer, plenty of sun-deck time, a relaxed guided snorkel, and the five-star BBQ at the table. Ideal for families and first-time cruisers.",
    duration: '~6 h sailing · ~7.5 h door-to-door',
    priceFrom: 64,
    images: [IMG.yacht, IMG.deck, IMG.snorkel],
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Full VIP day · age 13+', price: 64 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · kids BBQ menu', price: 40 },
      { id: 'family', name: 'Family pack (2A + 2C)', description: 'Family group rate', price: 185 },
    ],
    addons: [
      { id: 'transfer', name: 'Private transfer', description: 'Private car from any Hurghada hotel', price: 8 },
      { id: 'photos', name: 'Photo package', description: 'Crew photographer · digital gallery', price: 22 },
      { id: 'cabana', name: 'Shaded cabana reservation', description: 'Reserved shaded deck cabana for the day', price: 20 },
    ],
    highlights: ['Calmest sailing in the fleet', 'Sheltered Giftun reefs', '72-guest capped list', 'Family-friendly', 'Five-star BBQ'],
    inclusions: ['Marina boarding', 'Sun deck + salon', 'Guided snorkel + gear', 'Five-star BBQ', 'Soft drinks + coffee', 'Marine insurance'],
    exclusions: ['Tips', 'Transfer (add-on)', 'Cabana (add-on)'],
  },
  {
    slug: 'elite-vip-ain-sokhna-northern-yacht',
    title: 'Elite VIP Ain Sokhna · Northern Yacht',
    shortDescription: 'The closest cruise to Cairo. A quiet northern reef and the shortest drive for capital guests.',
    description:
      "The northern yacht — the closest Elite VIP cruise to Cairo. A short drive from the capital, a quiet reef few boats visit, and the same capped 70-guest list and five-star BBQ. The day-trip choice for Cairo guests who don't want to fly south.",
    duration: '~5.5 h sailing · ~7 h door-to-door',
    priceFrom: 62,
    images: [IMG.deck, IMG.yacht, IMG.salon],
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Full VIP day · age 13+', price: 62 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · kids BBQ menu', price: 38 },
    ],
    addons: [
      { id: 'transfer-cairo', name: 'Cairo private transfer', description: 'Private car from Cairo · round trip', price: 45 },
      { id: 'transfer-local', name: 'Local transfer', description: 'Private car from any Ain Sokhna hotel', price: 8 },
      { id: 'photos', name: 'Photo package', description: 'Crew photographer · digital gallery', price: 22 },
    ],
    highlights: ['Closest cruise to Cairo', 'Quiet northern reef', '70-guest capped list', 'Cairo transfer available', 'Five-star BBQ'],
    inclusions: ['Marina boarding', 'Sun deck + salon', 'Guided snorkel + gear', 'Five-star BBQ', 'Soft drinks + coffee', 'Marine insurance'],
    exclusions: ['Tips', 'Cairo transfer (add-on)', 'Photos (add-on)'],
  },
  {
    slug: 'elite-vip-sunset-yacht-cruise',
    title: 'Elite VIP Sunset Yacht Cruise',
    shortDescription: 'The grown-up version. A shorter golden-hour sailing — drinks on deck, BBQ under the sunset.',
    description:
      "The sunset yacht. A shorter, more adult sailing — drinks on the teak deck, a brief snorkel for those who want it, and the five-star BBQ served as the sun drops. The capped list makes the deck genuinely quiet at golden hour. Private transfer included on this sailing.",
    duration: '~4.5 h sailing (afternoon → sunset)',
    priceFrom: 58,
    images: [IMG.deck, IMG.yacht, IMG.salon],
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Sunset cruise · age 13+', price: 58 },
      { id: 'couple', name: 'Couple (sunset)', description: 'Two adults · reserved sunset deck', price: 130 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate', price: 36 },
    ],
    addons: [
      { id: 'sunset-deck', name: 'Reserved sunset deck', description: 'Premium aft-deck seating for the sunset', price: 22 },
      { id: 'drinks', name: 'Drinks package', description: 'Soft drinks + mocktails on deck', price: 14 },
      { id: 'photos', name: 'Photo package', description: 'Crew photographer · digital gallery', price: 22 },
    ],
    highlights: ['Golden-hour sailing', 'Genuinely quiet capped deck', 'BBQ under the sunset', 'Private transfer included', 'Reserved sunset seating available'],
    inclusions: ['Private transfer', 'Marina boarding', 'Sun deck + salon', 'Five-star BBQ', 'Soft drinks + coffee', 'Marine insurance'],
    exclusions: ['Tips', 'Drinks package (add-on)', 'Photos (add-on)'],
  },
  {
    slug: 'elite-vip-private-yacht-charter',
    title: 'Elite VIP Private Yacht Charter',
    shortDescription: 'Charter the whole 75-guest white yacht. Weddings, corporate days, milestone events — fully bespoke.',
    description:
      "The whole yacht. Up to 75 guests, your route, your timing, your menu. Deck weddings, corporate retreats, milestone celebrations and brand shoots. The rate below starts from Marsa Alam in shoulder season; other cities and peak dates quoted on request.",
    duration: '~6 h sailing (fully customisable)',
    priceFrom: 2600,
    images: [IMG.yacht, IMG.deck, IMG.salon],
    pricingOptions: [
      { id: 'charter', name: 'Whole-yacht charter', description: 'Up to 75 guests · Marsa Alam · shoulder season', price: 2600 },
      { id: 'charter-peak', name: 'Whole-yacht charter (peak)', description: 'Up to 75 guests · peak season', price: 3400 },
    ],
    addons: [
      { id: 'catering', name: 'Premium menu upgrade', description: 'Extended grill + live stations · 2.5 h service', price: 680 },
      { id: 'ceremony', name: 'Deck ceremony setup', description: 'Wedding/celebration staging + officiant coordination', price: 520 },
      { id: 'photographer', name: 'On-board photographer', description: 'Pro photographer · full digital gallery', price: 260 },
      { id: 'transport', name: 'Group transport', description: 'Majestic Travel coach for your group · all cities', price: 280 },
    ],
    highlights: ['Entire 75-guest yacht', 'Customised route + menu', 'Wedding / corporate ready', 'Deck ceremony setup', 'Pro photographer add-on'],
    inclusions: ['Whole-yacht charter', 'Crew + captain', 'Customised itinerary', 'Soft drinks + coffee', 'Marine insurance'],
    exclusions: ['Tips', 'Catering (add-on)', 'Transport (add-on)', 'Photographer (add-on)'],
  },
];

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG });
    if (!tenant) {
      console.error(`Tenant '${TENANT_SLUG}' not found. Run seed-elite-vip-tenant.ts first.`);
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
        category: 'cruises',
        destination: {
          city: 'Marsa Alam',
          country: 'Egypt',
          coordinates: { lat: 25.0676, lng: 34.8896 },
        },
        duration: trip.duration,
        languages: ['English', 'Arabic', 'German', 'Russian', 'Italian', 'French'],
        rating: 4.7 + Math.round(Math.random() * 3) / 10,
        reviewCount: 150 + Math.floor(Math.random() * 700),
        priceFrom: trip.priceFrom,
        currency: 'USD',
        pricingOptions: trip.pricingOptions,
        addons: trip.addons,
        entryWindows: [
          { label: 'Day sail', startTime: '09:00', endTime: '15:00' },
          { label: 'Sunset sail', startTime: '14:30', endTime: '19:00' },
        ],
        itinerary: [],
        highlights: trip.highlights,
        inclusions: trip.inclusions,
        exclusions: trip.exclusions,
        meetingPoint: {
          address: 'Marsa Alam Marina · Red Sea coast',
          instructions:
            'Private transfer is available as an add-on. Otherwise meet at the Elite VIP Cruise counter at the marina 30 min before departure.',
          mapUrl: 'https://maps.google.com/?q=25.0676,34.8896',
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
      console.log(`[${i}/${TRIPS.length}] CREATED ✅ ${trip.slug} (tenantIds: elite-vip + sunmarine portfolio)`);
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
