/**
 * Seed 6 brand-exclusive Royal SeaScope submarine trips with AI-generated
 * cover images. Each trip's `tenantIds` includes BOTH the seascope tenant
 * AND the egypt-sunmarine mother portfolio — so the same trip is bookable
 * from both surfaces (shared multi-tenant catalog).
 *
 * Idempotent: skips trips whose slug already exists.
 *
 * Usage:
 *   npx ts-node src/scripts/seed-royal-seascope-tours.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { generateImageFromPrompt } from '../services/image-generation.service';
import { uploadBase64Image } from '../services/upload.service';

const TENANT_SLUG = 'royal-seascope';
const PORTFOLIO_SLUG = 'egypt-sunmarine';

const TRIPS = [
  {
    slug: 'royal-seascope-hurghada-reef',
    title: 'Royal SeaScope Hurghada · Giftun Reef',
    shortDescription: 'The flagship trip. 1.5 hours below the surface on the Giftun Island reef from Hurghada Marina.',
    description:
      "Our most-booked submarine trip. Hotel pickup at 08:30, marina arrival 09:00, board the yellow Royal SeaScope, sail to the Giftun Island reef. 15 minutes on the sun deck, then the cabin descends two metres for a 90-minute reef tour through coral gardens, anemone fields, parrotfish schools, and frequent turtle sightings. Complimentary cold drink on the return. Door-to-door ~3 hours.",
    duration: '~1.5 h cabin · ~3 h door-to-door',
    priceFrom: 35,
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Standard cabin window · age 13+', price: 35 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · window seat reserved', price: 20 },
      { id: 'family', name: 'Family pack (2A + 2C)', description: 'Family group rate', price: 95 },
    ],
    addons: [
      { id: 'pickup', name: 'Hotel pickup & drop-off', description: 'Air-conditioned van from any Hurghada hotel', price: 8 },
      { id: 'snorkel', name: 'Snorkel stop add-on', description: '30 min surface snorkel at the reef · mask/fins/vest included', price: 15 },
      { id: 'lunch', name: 'Lunch upgrade', description: 'Hot Egyptian-style lunch on the sun deck', price: 12 },
      { id: 'photos', name: 'Photo package', description: 'Photographer captures your family at the window · digital delivery', price: 18 },
    ],
    highlights: ['Giftun Island house reef', '16 panoramic underwater windows', 'Turtle & parrotfish sightings', 'Hotel pickup available', 'Family-safe · no swimming required'],
    inclusions: ['Marina boarding', 'Safety briefing in 5 languages', '~1.5 h reef cruise', 'Cold drink on return', 'Marine insurance'],
    exclusions: ['Tips', 'Hotel pickup (available as add-on)', 'Photo package (available as add-on)'],
    imagePrompt: 'Bright cinematic photograph of a yellow semi-submarine boat called Royal SeaScope on the turquoise Red Sea near Hurghada Egypt, families visible through the cabin windows, sunshine, coral reef visible below the boat, photorealistic professional travel photography, 16:9 wide composition.',
  },
  {
    slug: 'royal-seascope-sharm-tiran',
    title: 'Royal SeaScope Sharm El Sheikh · Tiran Strait',
    shortDescription: 'The original boat, the original reef. Tiran Strait submarine trip from Sharm El Sheikh.',
    description:
      "Where Royal SeaScope started in 2004. Hotel pickup 08:30, board at Sharm Marina, sail to the Tiran Strait reef — one of the world's top dive sites, made accessible to non-swimmers. 90 minutes below the surface. Frequent sightings: blue-spotted stingrays, moray eels, big schools of fusilier, turtles. Cold drink + light refreshments included.",
    duration: '~1.5 h cabin · ~3.5 h door-to-door',
    priceFrom: 38,
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Standard cabin window · age 13+', price: 38 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · window seat', price: 22 },
    ],
    addons: [
      { id: 'pickup', name: 'Hotel pickup & drop-off', description: 'Air-conditioned van from any Sharm hotel', price: 8 },
      { id: 'snorkel', name: 'Snorkel stop add-on', description: '30 min surface snorkel · gear included', price: 18 },
      { id: 'pro-photos', name: 'Pro photographer package', description: 'Professional underwater photographer · gallery delivery', price: 28 },
    ],
    highlights: ['Tiran Strait world-class reef', 'The original 2004 fleet base', 'Frequent stingray + moray sightings', 'Multilingual crew', 'Family-friendly'],
    inclusions: ['Marina boarding', 'Safety briefing', '~1.5 h cabin time', 'Cold drink + refreshments', 'Marine insurance'],
    exclusions: ['Tips', 'Pickup (add-on)', 'Photos (add-on)'],
    imagePrompt: 'Aerial photograph of a yellow semi-submarine boat sailing over the Tiran Strait reef near Sharm El Sheikh Egypt, crystal-clear turquoise water, coral patterns visible below the surface, mountains of Saudi Arabia visible across the strait, photorealistic professional travel photography, 16:9.',
  },
  {
    slug: 'royal-seascope-marsa-alam-deep-south',
    title: 'Royal SeaScope Marsa Alam · Deep South',
    shortDescription: 'Warmest water, biggest schools. Marsa Alam submarine trip with optional whale-shark season slot (April-June).',
    description:
      "The deep-south boat. Marsa Alam's reefs sit in the warmest water in the Red Sea, with the biggest schools of fish anywhere on our route. 90 minutes below the surface, often crossing paths with dolphins (year-round) and whale sharks (April-June season). Premium cold drinks, family-friendly crew, the longest reef-cruise of any of our submarines.",
    duration: '~1.5 h cabin · ~3.5 h door-to-door',
    priceFrom: 42,
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Standard cabin window · age 13+', price: 42 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate · window seat', price: 25 },
      { id: 'whale-shark', name: 'Whale Shark Season (Apr-Jun)', description: 'Premium slot · extra 20 min sailing time', price: 65 },
    ],
    addons: [
      { id: 'pickup', name: 'Hotel pickup & drop-off', description: 'Van from Marsa Alam, Port Ghalib, Coraya Bay', price: 10 },
      { id: 'snorkel', name: 'Reef snorkel stop', description: '40 min surface snorkel', price: 18 },
      { id: 'lunch', name: 'Lunch upgrade', description: 'Hot lunch on the sun deck', price: 14 },
    ],
    highlights: ['Warmest Red Sea water', 'Biggest schools of fish', 'Frequent dolphin sightings', 'Whale-shark season slot', 'Longest reef cruise in the fleet'],
    inclusions: ['Marina boarding', 'Safety briefing', '~1.5 h cabin time', 'Cold drinks', 'Marine insurance'],
    exclusions: ['Tips', 'Pickup (add-on)', 'Lunch (add-on)'],
    imagePrompt: 'Wide cinematic photograph of a yellow semi-submarine in the deep Red Sea near Marsa Alam Egypt, glassy water, large school of yellow fusilier fish visible just below the surface near the boat, distant desert mountains, photorealistic professional travel photography, 16:9.',
  },
  {
    slug: 'royal-seascope-makadi-bay-house-reef',
    title: 'Royal SeaScope Makadi Bay · House Reef',
    shortDescription: 'Short transfer, big reef. Makadi Bay submarine trip — perfect for resort-bound families.',
    description:
      "Makadi Bay opened in 2025 as Royal SeaScope's newest base. The house reef sits just minutes from the marina — minimal sailing time, maximum below-surface time. Two boats running daily. Ideal for families staying at Makadi-area resorts who want a short trip with all the reef-window magic.",
    duration: '~1.5 h cabin · ~2.5 h door-to-door',
    priceFrom: 32,
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Standard cabin window · age 13+', price: 32 },
      { id: 'child', name: 'Child (4-12)', description: 'Reduced rate', price: 18 },
    ],
    addons: [
      { id: 'pickup', name: 'Hotel pickup (Makadi area)', description: 'Short transfer from any Makadi hotel', price: 5 },
      { id: 'snorkel', name: 'House reef snorkel', description: '25 min surface snorkel', price: 12 },
      { id: 'dolphin', name: 'Dolphin World combo', description: 'Add Dolphin World Egypt visit same day', price: 35 },
    ],
    highlights: ['Shortest transfer in the fleet', 'House reef · ideal for first-timers', 'Resort-bound family favourite', 'Newest 2025 base', 'Dolphin World combo available'],
    inclusions: ['Marina boarding', 'Safety briefing', '~1.5 h cabin time', 'Cold drink', 'Marine insurance'],
    exclusions: ['Tips', 'Pickup (add-on)', 'Dolphin World (combo add-on)'],
    imagePrompt: 'Photograph of a yellow semi-submarine boat moored at a small modern marina in Makadi Bay Egypt, families boarding, palm trees and Red Sea resort buildings in the background, calm turquoise water, photorealistic professional travel photography, 16:9.',
  },
  {
    slug: 'royal-seascope-private-charter',
    title: 'Royal SeaScope Private Charter',
    shortDescription: 'Charter an entire 60-77 capacity submarine for your group, event or photo shoot. Available in all 7 cities.',
    description:
      "The whole boat. Up to 77 guests for the larger submarines, 60 for the smaller. Customise the route, the timing, the duration. Wedding parties, corporate retreats, birthday celebrations, photo shoots. Charter prices vary by city and season — the rate below is starting from Hurghada in shoulder season.",
    duration: '~2 h cabin · ~4 h door-to-door (customisable)',
    priceFrom: 850,
    pricingOptions: [
      { id: 'small', name: 'Charter — 60-guest boat', description: 'Available in Makadi, Safaga, Dahab, Ain Sokhna', price: 850 },
      { id: 'large', name: 'Charter — 77-guest flagship', description: 'Available in Sharm, Hurghada, Marsa Alam', price: 1250 },
    ],
    addons: [
      { id: 'photographer', name: 'On-board photographer', description: 'Pro photographer · full digital gallery', price: 180 },
      { id: 'catering', name: 'Catering upgrade', description: 'Cold + hot buffet · drinks · 1 h service', price: 320 },
      { id: 'sunset', name: 'Sunset window slot', description: 'Reserved 17:00 departure · premium golden-hour light', price: 200 },
      { id: 'transport', name: 'Group transport', description: 'Majestic Travel coach for your group · all cities', price: 220 },
    ],
    highlights: ['Entire boat reserved', 'Customised route + duration', 'All seven cities available', 'Wedding / corporate / event ready', 'Pro photographer add-on'],
    inclusions: ['Entire boat charter', 'Crew + captain', 'Customised itinerary', 'Cold drinks', 'Marine insurance'],
    exclusions: ['Tips', 'Catering (add-on)', 'Transport (add-on)', 'Photographer (add-on)'],
    imagePrompt: 'Elegant cinematic photograph of a private yellow semi-submarine charter on the Red Sea at sunset, well-dressed guests on the sun deck enjoying drinks, warm golden-hour light, photorealistic professional event photography, 16:9.',
  },
  {
    slug: 'royal-seascope-family-day-out',
    title: 'Royal SeaScope Family Day Out',
    shortDescription: 'Half-day combo: submarine reef tour + sun deck snorkel + lunch + dolphin spotting transfer. Built for families with kids.',
    description:
      "The all-in family combo. Hotel pickup at 08:00. Board the Royal SeaScope. 90-minute submarine reef tour. 45 minutes on the sun deck with optional snorkel for adults and supervised paddle for kids. Hot Egyptian lunch served on the upper deck. Optional Dolphin World combo at Makadi Bay for the afternoon. Drop-off at hotel by 16:00. Built for families who want the full day taken care of.",
    duration: '~6 h door-to-door (half-day)',
    priceFrom: 75,
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Full family combo package', price: 75 },
      { id: 'child', name: 'Child (4-12)', description: 'Full family combo · kids menu lunch', price: 45 },
      { id: 'toddler', name: 'Toddler (under 4)', description: 'Free with paying adult · booster seat provided', price: 0 },
    ],
    addons: [
      { id: 'dolphin-world', name: 'Dolphin World afternoon', description: 'Combo with Dolphin World Egypt show + interactive swim', price: 45 },
      { id: 'extended-snorkel', name: 'Extended snorkel session', description: 'Add 30 min snorkel time at the reef', price: 15 },
    ],
    highlights: ['Full half-day taken care of', 'Submarine + snorkel + lunch', 'Hotel pickup + drop-off included', 'Kids menu + booster seats', 'Optional Dolphin World combo'],
    inclusions: ['Hotel pickup + drop-off', 'Submarine reef tour', '45 min sun-deck stop', 'Hot Egyptian lunch', 'Soft drinks', 'Marine insurance'],
    exclusions: ['Tips', 'Dolphin World (combo add-on)', 'Alcoholic drinks'],
    imagePrompt: 'Joyful photograph of a family with two children on the sun deck of a yellow semi-submarine on the Red Sea, mother applying sunscreen to a kid, father pointing at the water, table set with lunch, photorealistic warm family travel photography, 16:9.',
  },
];

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG });
    if (!tenant) {
      console.error(`Tenant '${TENANT_SLUG}' not found. Run seed-royal-seascope-tenant.ts first.`);
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

      console.log(`[${i}/${TRIPS.length}] ${trip.title}`);

      let imageUrl = '';
      try {
        console.log(`  Generating image…`);
        const { base64, mimeType } = await generateImageFromPrompt({
          prompt: trip.imagePrompt,
          size: '1536x1024',
          quality: 'medium',
          outputFormat: 'jpeg',
        });
        const dataUri = `data:${mimeType};base64,${base64}`;
        const uploaded = await uploadBase64Image(dataUri, `tours/${trip.slug}`);
        imageUrl = uploaded.url;
        console.log(`  ✅ ${imageUrl}`);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : err && typeof err === 'object'
              ? JSON.stringify(err)
              : String(err);
        console.error(`  ⚠️ Image failed: ${msg} — proceeding without`);
      }

      await Attraction.create({
        slug: trip.slug,
        title: trip.title,
        shortDescription: trip.shortDescription,
        description: trip.description,
        images: imageUrl ? [imageUrl] : [],
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
          { label: 'Morning', startTime: '09:00', endTime: '10:30' },
          { label: 'Midday', startTime: '12:00', endTime: '13:30' },
          { label: 'Afternoon', startTime: '15:00', endTime: '16:30' },
        ],
        itinerary: [],
        highlights: trip.highlights,
        inclusions: trip.inclusions,
        exclusions: trip.exclusions,
        meetingPoint: {
          address: 'Hurghada Marina · Red Sea coast',
          instructions: 'Hotel pickup is available as an add-on. Otherwise meet at the SeaScope counter at the marina 30 min before departure.',
          mapUrl: 'https://maps.google.com/?q=27.2287,33.8487',
        },
        cancellationPolicy: 'Free cancellation up to 24 hours before',
        instantConfirmation: true,
        mobileTicket: true,
        badges: ['bestseller', 'family-friendly', 'free-cancellation', 'instant-confirm'],
        availability: { type: 'date-only', advanceBooking: 30 },
        tenantIds: [tenant._id, portfolio._id],
        status: 'active',
        featured: true,
      });
      console.log(`  CREATED ✅ (tenantIds: seascope + sunmarine portfolio)\n`);
      created++;

      await new Promise((r) => setTimeout(r, 2000));
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
