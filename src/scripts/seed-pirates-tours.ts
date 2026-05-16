/**
 * Seed 6 brand-exclusive Pirates Premier Sailing voyages. Each voyage's
 * `tenantIds` includes BOTH the pirates tenant AND the egypt-sunmarine
 * mother portfolio — shared multi-tenant catalog.
 *
 * Uses the real deck photos (already on Cloudinary) for cover images —
 * no AI generation.
 *
 * Idempotent: skips voyages whose slug already exists.
 *
 * Usage:
 *   npx ts-node src/scripts/seed-pirates-tours.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';

const TENANT_SLUG = 'pirates-premier-sailing';
const PORTFOLIO_SLUG = 'egypt-sunmarine';

const IMG = {
  galleon:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873205/attractions-network/tenant-heroes/pirates-premier-sailing/tvjrbjwhcss7ibmgy6bd.jpg',
  kids:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873208/attractions-network/tenant-heroes/pirates-premier-sailing/te7dn5qo9bg1gwhobxr2.jpg',
  snorkel:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873213/attractions-network/tenant-heroes/pirates-premier-sailing/nyynsp23tbtvjinhw3d4.jpg',
  dining:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873216/attractions-network/tenant-heroes/pirates-premier-sailing/fmpgineuhcts9l6huyva.jpg',
  helm:
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873219/attractions-network/tenant-heroes/pirates-premier-sailing/p9sxnawhzrdwwzzjyc6a.jpg',
};

const TRIPS = [
  {
    slug: 'pirates-hurghada-giftun-adventure',
    title: 'Pirates Hurghada · Giftun Galleon Adventure',
    shortDescription:
      'The flagship voyage. A full day under sail on a 37m pirate galleon from Hurghada to the Giftun Island reef.',
    description:
      "Our most-booked voyage. Hotel pickup at 08:00, board the flagship galleon at Hurghada Marina, raise the colours and sail for Giftun Island. Treasure hunt across the deck while the kids are kitted out as crew, a supervised snorkel stop over a living reef, then a themed feast served below in the carved pirate cabin. Sail back into the late afternoon. Door-to-door ~7 hours.",
    duration: '~6 h sailing · ~7 h door-to-door',
    priceFrom: 45,
    images: [IMG.galleon, IMG.kids, IMG.snorkel, IMG.dining],
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Full voyage · age 13+', price: 45 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · costume + treasure hunt', price: 28 },
      { id: 'family', name: 'Family pack (2A + 2C)', description: 'Family group rate', price: 130 },
    ],
    addons: [
      { id: 'pickup', name: 'Hotel pickup & drop-off', description: 'Air-conditioned van from any Hurghada hotel', price: 8 },
      { id: 'photos', name: 'Photo package', description: 'Crew photographer captures the day · digital gallery', price: 20 },
      { id: 'private-table', name: 'Reserved feast table', description: 'Priority window table at the themed feast', price: 14 },
    ],
    highlights: ['Giftun Island reef', 'Deck-wide treasure hunt', 'Supervised reef snorkel', 'Themed feast below deck', 'Costumes for the young crew'],
    inclusions: ['Marina boarding', 'Costumes + treasure hunt', 'Snorkel gear', 'Themed hot buffet', 'Soft drinks', 'Marine insurance'],
    exclusions: ['Tips', 'Hotel pickup (add-on)', 'Photo package (add-on)'],
  },
  {
    slug: 'pirates-sharm-tiran-voyage',
    title: 'Pirates Sharm El Sheikh · Tiran Strait Voyage',
    shortDescription: 'World-class snorkel water. A full-day pirate galleon voyage to the Tiran Strait from Sharm El Sheikh.',
    description:
      "Sharm's themed galleon works the Tiran Strait — some of the clearest snorkel water on the planet, made into a family pirate day. Hotel pickup 08:00, board at Sharm Marina, dramatic open-sea sailing, treasure hunt under way, a long snorkel stop on the Tiran reef, themed feast below deck, sunset sail home.",
    duration: '~6 h sailing · ~7.5 h door-to-door',
    priceFrom: 48,
    images: [IMG.snorkel, IMG.galleon, IMG.helm, IMG.dining],
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Full voyage · age 13+', price: 48 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · full pirate experience', price: 30 },
    ],
    addons: [
      { id: 'pickup', name: 'Hotel pickup & drop-off', description: 'Air-conditioned van from any Sharm hotel', price: 8 },
      { id: 'pro-photos', name: 'Pro photographer package', description: 'Professional photographer · gallery delivery', price: 28 },
      { id: 'extended-snorkel', name: 'Extended snorkel', description: 'Add 30 min on the Tiran reef', price: 15 },
    ],
    highlights: ['Tiran Strait world-class reef', 'Open-sea sail work', 'Long supervised snorkel stop', 'Themed feast', 'Multilingual crew'],
    inclusions: ['Marina boarding', 'Costumes + treasure hunt', 'Snorkel gear', 'Themed hot buffet', 'Soft drinks', 'Marine insurance'],
    exclusions: ['Tips', 'Pickup (add-on)', 'Photos (add-on)'],
  },
  {
    slug: 'pirates-marsa-alam-deep-south',
    title: 'Pirates Marsa Alam · Deep South Voyage',
    shortDescription: 'Warmest water, quietest reefs, frequent dolphins. The southern pirate galleon from Marsa Alam.',
    description:
      "The deep-south galleon. Marsa Alam's water is the warmest on our route and the reefs are the quietest — and dolphins often join the galleon on the sail out. Full pirate programme: costumes, treasure hunt, a long snorkel over untouched coral, themed feast below deck, relaxed sail home.",
    duration: '~6 h sailing · ~7.5 h door-to-door',
    priceFrom: 52,
    images: [IMG.galleon, IMG.snorkel, IMG.kids, IMG.helm],
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Full voyage · age 13+', price: 52 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · full pirate experience', price: 32 },
    ],
    addons: [
      { id: 'pickup', name: 'Hotel pickup & drop-off', description: 'Van from Marsa Alam, Port Ghalib, Coraya Bay', price: 10 },
      { id: 'dolphin-watch', name: 'Dolphin-watch slot', description: 'Reserved bow seating for the dolphin sail-out', price: 16 },
      { id: 'lunch-upgrade', name: 'Captain’s table upgrade', description: 'Premium feast service at the captain’s table', price: 18 },
    ],
    highlights: ['Warmest Red Sea water', 'Frequent dolphin sightings', 'Quietest reefs on the route', 'Long snorkel stop', 'Themed feast'],
    inclusions: ['Marina boarding', 'Costumes + treasure hunt', 'Snorkel gear', 'Themed hot buffet', 'Soft drinks', 'Marine insurance'],
    exclusions: ['Tips', 'Pickup (add-on)', 'Captain’s table (add-on)'],
  },
  {
    slug: 'pirates-sunset-galleon-cruise',
    title: 'Pirates Sunset Galleon Cruise',
    shortDescription: 'The golden-hour sail. A shorter 13:30 → 18:30 themed cruise — fewer kids, more romance, the same theatre.',
    description:
      "The sunset ship. Departing 13:30 and returning at 18:30, this is the quieter, more grown-up version of the pirate day — though families are still very welcome. Sail out under the colours, a short snorkel stop, drinks on deck as the sun drops, and the themed cabin lit for an evening feast on the sail home.",
    duration: '~5 h sailing (13:30 → 18:30)',
    priceFrom: 42,
    images: [IMG.helm, IMG.galleon, IMG.dining],
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Sunset cruise · age 13+', price: 42 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate', price: 26 },
      { id: 'couple', name: 'Couple (sunset)', description: 'Two adults · reserved sunset deck seating', price: 95 },
    ],
    addons: [
      { id: 'pickup', name: 'Hotel pickup & drop-off', description: 'Air-conditioned van', price: 8 },
      { id: 'sunset-deck', name: 'Reserved sunset deck', description: 'Premium bow seating for the sunset', price: 18 },
      { id: 'drinks', name: 'Drinks package', description: 'Soft drinks + mocktails on deck', price: 12 },
    ],
    highlights: ['Golden-hour sailing', 'Quieter, grown-up version', 'Short snorkel stop', 'Evening themed feast', 'Reserved sunset seating available'],
    inclusions: ['Marina boarding', 'Snorkel gear', 'Themed evening feast', 'Soft drinks', 'Marine insurance'],
    exclusions: ['Tips', 'Pickup (add-on)', 'Drinks package (add-on)'],
  },
  {
    slug: 'pirates-kids-treasure-voyage',
    title: 'Pirates Kids Treasure Voyage',
    shortDescription: 'Built around the children. Full costumes, a story-driven treasure hunt, kid-paced snorkel and a kids feast.',
    description:
      "The family special. The whole voyage is built around the under-12s: a full costume fit-out, a story-driven treasure hunt with a buried-chest finale, a kid-paced supervised snorkel in the calm zone, and a kids feast in the themed cabin. Parents get to relax on deck while the crew runs the show. Hotel pickup 08:00, drop-off ~16:00.",
    duration: '~6 h sailing · ~7 h door-to-door',
    priceFrom: 40,
    images: [IMG.kids, IMG.galleon, IMG.snorkel, IMG.dining],
    pricingOptions: [
      { id: 'child', name: 'Child (4-12)', description: 'Full kids programme · costume + treasure hunt + kids feast', price: 40 },
      { id: 'adult', name: 'Accompanying adult', description: 'Adult seat · feast included', price: 38 },
      { id: 'toddler', name: 'Toddler (under 4)', description: 'Free with paying adult · mini costume provided', price: 0 },
    ],
    addons: [
      { id: 'pickup', name: 'Hotel pickup & drop-off', description: 'Air-conditioned van', price: 8 },
      { id: 'birthday', name: 'Birthday package', description: 'Cake, captain’s announcement, photo with the crew', price: 35 },
      { id: 'photos', name: 'Photo package', description: 'Crew photographer · digital gallery', price: 20 },
    ],
    highlights: ['Built entirely around kids', 'Full costume fit-out', 'Story-driven treasure hunt', 'Kid-paced supervised snorkel', 'Birthday package available'],
    inclusions: ['Marina boarding', 'Full costumes + props', 'Treasure hunt', 'Kids feast', 'Snorkel gear', 'Marine insurance'],
    exclusions: ['Tips', 'Pickup (add-on)', 'Birthday package (add-on)'],
  },
  {
    slug: 'pirates-private-charter-galleon',
    title: 'Pirates Private Charter Galleon',
    shortDescription: 'Charter the whole 89-guest galleon. Birthdays, weddings, corporate days — customisable route and theming.',
    description:
      "The whole ship. Up to 89 guests, your route, your timing, your theming. Pirate-wedding deck ceremonies, corporate team days, milestone birthdays, brand events and photo shoots. The rate below starts from Hurghada in shoulder season; Sharm and Marsa Alam quoted on request.",
    duration: '~6 h sailing (fully customisable)',
    priceFrom: 1450,
    images: [IMG.helm, IMG.galleon, IMG.dining],
    pricingOptions: [
      { id: 'charter', name: 'Whole-galleon charter', description: 'Up to 89 guests · Hurghada · shoulder season', price: 1450 },
      { id: 'charter-peak', name: 'Whole-galleon charter (peak)', description: 'Up to 89 guests · peak season', price: 1950 },
    ],
    addons: [
      { id: 'catering', name: 'Premium catering upgrade', description: 'Cold + hot buffet · live station · 2 h service', price: 420 },
      { id: 'photographer', name: 'On-board photographer', description: 'Pro photographer · full digital gallery', price: 200 },
      { id: 'ceremony', name: 'Deck ceremony setup', description: 'Wedding/celebration deck dressing + officiant coordination', price: 360 },
      { id: 'transport', name: 'Group transport', description: 'Majestic Travel coach for your group · all cities', price: 240 },
    ],
    highlights: ['Entire 89-guest galleon', 'Customised route + theming', 'Wedding / corporate / event ready', 'Deck ceremony setup', 'Pro photographer add-on'],
    inclusions: ['Whole-galleon charter', 'Crew + captain', 'Customised itinerary', 'Soft drinks', 'Marine insurance'],
    exclusions: ['Tips', 'Catering (add-on)', 'Transport (add-on)', 'Photographer (add-on)'],
  },
];

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG });
    if (!tenant) {
      console.error(`Tenant '${TENANT_SLUG}' not found. Run seed-pirates-tenant.ts first.`);
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
        rating: 4.7 + Math.round(Math.random() * 3) / 10,
        reviewCount: 200 + Math.floor(Math.random() * 800),
        priceFrom: trip.priceFrom,
        currency: 'USD',
        pricingOptions: trip.pricingOptions,
        addons: trip.addons,
        entryWindows: [
          { label: 'Morning departure', startTime: '09:00', endTime: '15:00' },
          { label: 'Sunset departure', startTime: '13:30', endTime: '18:30' },
        ],
        itinerary: [],
        highlights: trip.highlights,
        inclusions: trip.inclusions,
        exclusions: trip.exclusions,
        meetingPoint: {
          address: 'Hurghada Marina · Red Sea coast',
          instructions:
            'Hotel pickup is available as an add-on. Otherwise meet at the Pirates Premier Sailing counter at the marina 30 min before departure.',
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
      console.log(`[${i}/${TRIPS.length}] CREATED ✅ ${trip.slug} (tenantIds: pirates + sunmarine portfolio)`);
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
