/**
 * Give hurghada-fishing and hurghada-submarine their own brand-correct tour
 * catalogs. Both currently show a generic shared "Hurghada" tour pool
 * (snorkel/city tours assigned to ~17 tenants at once), which is wrong for a
 * fishing brand and a semi-submarine brand.
 *
 * This script:
 *   1. DETACHES each tenant from every shared tour it currently sits on
 *      (pulls the tenantId from those tours' tenantIds — never deletes the
 *      shared docs, so the other tenants keep them).
 *   2. Seeds a real brand catalog owned by the tenant.
 *
 * IMAGES: reuses existing real Cloudinary photos already in the DB —
 *   submarine -> the Royal SeaScope semi-submarine gallery (same activity)
 *   fishing   -> real Red Sea boat/deck photos (Classic + Pirates galleries)
 * No new image generation.
 *
 * Idempotent: skips any tour whose slug already exists.
 * Run: npx ts-node src/scripts/seed-fishing-submarine-tours.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';

const C = 'https://res.cloudinary.com/dm3sxllch/image/upload';
const IMG = {
  // Royal SeaScope semi-submarine gallery (real underwater-viewing photos)
  subExterior: `${C}/v1779648880/attractions-network/tenant-heroes/royal-seascope/real/royal-seascope-real-01.jpg`,
  subWindows: `${C}/v1779648881/attractions-network/tenant-heroes/royal-seascope/real/royal-seascope-real-02.jpg`,
  subGallery: `${C}/v1779648882/attractions-network/tenant-heroes/royal-seascope/real/royal-seascope-real-03.jpg`,
  subFish: `${C}/v1779648884/attractions-network/tenant-heroes/royal-seascope/real/royal-seascope-real-04.jpg`,
  subChild: `${C}/v1779648886/attractions-network/tenant-heroes/royal-seascope/real/royal-seascope-real-05.jpg`,
  subCabin: `${C}/v1779648887/attractions-network/tenant-heroes/royal-seascope/real/royal-seascope-real-06.jpg`,
  // Real Red Sea boat / deck photography (Classic + Pirates galleries)
  boatMen: `${C}/v1779648917/attractions-network/tenant-heroes/rosetta-classic-boat/real/rosetta-classic-boat-real-01.jpg`,
  boatDeck: `${C}/v1779648919/attractions-network/tenant-heroes/rosetta-classic-boat/real/rosetta-classic-boat-real-02.jpg`,
  boatGear: `${C}/v1779648920/attractions-network/tenant-heroes/rosetta-classic-boat/real/rosetta-classic-boat-real-03.jpg`,
  boatSea: `${C}/v1779648889/attractions-network/tenant-heroes/pirates-premier-sailing/real/pirates-premier-sailing-real-01.jpg`,
  boatOpen: `${C}/v1779648892/attractions-network/tenant-heroes/pirates-premier-sailing/real/pirates-premier-sailing-real-03.jpg`,
  boatRail: `${C}/v1779648893/attractions-network/tenant-heroes/pirates-premier-sailing/real/pirates-premier-sailing-real-04.jpg`,
};

interface Seed {
  slug: string; title: string; shortDescription: string; description: string;
  duration: string; priceFrom: number; images: string[];
  pricing: Array<[string, string, string, number]>;
  addons: Array<[string, string, string, number]>;
  highlights: string[]; inclusions: string[]; exclusions: string[];
  windows: Array<[string, string, string]>;
}

const CITY = 'Hurghada';

const SUBMARINE: Seed[] = [
  {
    slug: 'hurghada-semi-submarine-reef-discovery',
    title: 'Hurghada · Semi-Submarine Reef Discovery',
    shortDescription: 'See the Red Sea reef from a dry, air-conditioned cabin two metres below the surface — 90 minutes of coral and fish through panoramic windows.',
    description: 'No mask, no wetsuit, no swimming required. Step down into a real semi-submarine and take a seat beside a large panoramic window as the cabin descends two metres below the surface. For 90 minutes you glide over living coral gardens while a guide points out parrotfish, butterflyfish, sea turtles and the occasional ray. Air-conditioned, stable and completely dry — the easiest way for the whole family, grandparents included, to meet the reef.',
    duration: '~90 min underwater · hotel pickup',
    priceFrom: 28,
    images: [IMG.subExterior, IMG.subGallery, IMG.subWindows, IMG.subFish],
    pricing: [['adult', 'Adult', 'Window seat + guided commentary · age 12+', 28], ['child', 'Child (4-11)', 'Kids window seat', 16], ['family', 'Family (2A + 2C)', 'Family group rate', 78]],
    addons: [['pickup', 'Hotel pickup & drop-off', 'Air-conditioned transfer from your Hurghada hotel', 8], ['photos', 'Onboard photo set', 'Digital photos of your trip', 12]],
    highlights: ['Stay completely dry — no swimming', '16 panoramic underwater windows', 'Air-conditioned cabin', 'Guided reef commentary', 'Perfect for all ages'],
    inclusions: ['90-min semi-submarine reef tour', 'Window seat', 'Guided commentary', 'Life jackets onboard'],
    exclusions: ['Hotel pickup (add-on)', 'Photos (add-on)', 'Tips'],
    windows: [['Morning', '09:30', '11:00'], ['Midday', '12:00', '13:30'], ['Afternoon', '14:30', '16:00']],
  },
  {
    slug: 'hurghada-family-submarine-snorkel-combo',
    title: 'Hurghada · Family Submarine & Snorkel Combo',
    shortDescription: 'Best of both worlds — a dry semi-submarine reef tour plus a guided snorkel stop in calm water, built for families with mixed swimmers.',
    description: 'Some of the family want to get in the water; some would rather stay dry. This half-day does both. Cruise out to a sheltered reef, drop down in the semi-submarine for a panoramic reef tour, then anchor for a supervised snorkel stop where confident swimmers can get in with a guide while everyone else watches from the shaded deck. Gear, vests and a light snack included.',
    duration: '~4 h · pickup included',
    priceFrom: 42,
    images: [IMG.subWindows, IMG.subExterior, IMG.boatOpen, IMG.subFish],
    pricing: [['adult', 'Adult', 'Submarine + snorkel + gear', 42], ['child', 'Child (4-11)', 'Kids gear + extra supervision', 24], ['nonswim', 'Non-swimmer', 'Submarine + deck only', 30]],
    addons: [['photos', 'Underwater photo set', 'Guide captures your reef moments', 14], ['lunch', 'Hot lunch upgrade', 'Cooked lunch onboard', 9]],
    highlights: ['Dry submarine tour + snorkel stop', 'Calm, sheltered reef', 'Gear & vests included', 'Shaded deck for non-swimmers', 'Family-paced day'],
    inclusions: ['Semi-submarine reef tour', 'Guided snorkel stop', 'Snorkel gear & vest', 'Hotel pickup', 'Light snack & water'],
    exclusions: ['Photos (add-on)', 'Hot lunch (add-on)', 'Tips'],
    windows: [['Morning', '08:30', '12:30'], ['Afternoon', '13:00', '17:00']],
  },
  {
    slug: 'hurghada-private-semi-submarine-charter',
    title: 'Hurghada · Private Semi-Submarine Charter',
    shortDescription: 'Book the whole semi-submarine for your group — your schedule, your route, no strangers. Ideal for families, birthdays and small events.',
    description: 'Take the entire vessel for yourselves. A private charter means your own departure time, an unhurried run over the best nearby reefs, and a guide who tailors the commentary to your group — whether that is curious kids or photography-minded adults. Great for birthdays, family reunions and small corporate outings. Decorations and a cake can be arranged on request.',
    duration: '~2 h private · flexible start',
    priceFrom: 240,
    images: [IMG.subCabin, IMG.subExterior, IMG.subGallery, IMG.subChild],
    pricing: [['boat', 'Private vessel (up to 12)', 'Whole semi-submarine, your schedule', 240], ['boat20', 'Private vessel (up to 20)', 'Larger group charter', 360]],
    addons: [['decor', 'Celebration setup', 'Banner + cake arrangement onboard', 35], ['pickup', 'Group hotel pickup', 'Air-conditioned transfer', 18]],
    highlights: ['Whole vessel to yourselves', 'Choose your own start time', 'Tailored guided commentary', 'Great for celebrations', 'No shared groups'],
    inclusions: ['Private semi-submarine charter', 'Dedicated guide', 'Life jackets', 'Flexible routing'],
    exclusions: ['Celebration setup (add-on)', 'Hotel pickup (add-on)', 'Tips'],
    windows: [['Flexible', '08:00', '17:00']],
  },
  {
    slug: 'hurghada-kids-underwater-explorer',
    title: "Hurghada · Kids' Underwater Explorer Trip",
    shortDescription: 'A short, gentle semi-submarine trip designed for younger children — a window seat, a friendly guide and a fish-spotting game.',
    description: 'Built around little attention spans. A shorter, gentler run keeps younger children engaged: every child gets a front-row window seat, a guide turns the reef into a fish-spotting game with a fun checklist, and the calm, air-conditioned cabin means no seasickness or sunburn. A small explorer certificate at the end seals the adventure.',
    duration: '~60 min · family-first',
    priceFrom: 14,
    images: [IMG.subChild, IMG.subWindows, IMG.subGallery, IMG.subFish],
    pricing: [['child', 'Child (3-11)', 'Window seat + explorer game', 14], ['adult', 'Accompanying adult', 'Window seat', 22]],
    addons: [['cert', 'Printed explorer certificate', 'Personalised keepsake', 4], ['photos', 'Photo set', 'Digital photos', 10]],
    highlights: ['Short, gentle 60-min trip', 'Front-row window for every child', 'Fish-spotting game', 'Air-conditioned, no seasickness', 'Explorer certificate'],
    inclusions: ['60-min reef tour', "Kids' window seats", 'Guided fish-spotting game', 'Life jackets'],
    exclusions: ['Certificate (add-on)', 'Photos (add-on)', 'Tips'],
    windows: [['Morning', '10:00', '11:00'], ['Afternoon', '15:00', '16:00']],
  },
  {
    slug: 'hurghada-sunset-submarine-cruise',
    title: 'Hurghada · Sunset Submarine & Deck Cruise',
    shortDescription: 'Golden-hour reef viewing from the submarine, then back up to the open deck for the Red Sea sunset with a drink in hand.',
    description: 'Time it for the best light. Head out late afternoon, drop into the semi-submarine while the low sun lights the reef in warm gold, then surface and move up to the open deck for the main event — the Red Sea sunset over the mountains, soft drinks and tea served as the sky changes. A calmer, more grown-up version of the reef trip.',
    duration: '~2.5 h · golden hour',
    priceFrom: 34,
    images: [IMG.subExterior, IMG.boatSea, IMG.subGallery, IMG.boatRail],
    pricing: [['adult', 'Adult', 'Submarine + sunset deck + drinks', 34], ['child', 'Child (4-11)', 'Kids rate', 20]],
    addons: [['pickup', 'Hotel pickup', 'Air-conditioned transfer', 8], ['canapes', 'Canapé platter', 'Light bites on deck', 11]],
    highlights: ['Reef in warm golden light', 'Open-deck Red Sea sunset', 'Soft drinks & tea included', 'Calmer, grown-up pace', 'Great photos'],
    inclusions: ['Semi-submarine reef tour', 'Open-deck sunset cruise', 'Soft drinks & tea', 'Life jackets'],
    exclusions: ['Hotel pickup (add-on)', 'Canapés (add-on)', 'Tips'],
    windows: [['Sunset', '16:30', '19:00']],
  },
];

const FISHING: Seed[] = [
  {
    slug: 'hurghada-deep-sea-fishing-charter',
    title: 'Hurghada · Deep-Sea Fishing Charter',
    shortDescription: 'A full day offshore on the Red Sea chasing barracuda, tuna and trevally — gear, crew and bait included, beginners welcome.',
    description: 'Head out past the reefs into deeper blue water where the bigger fish run. The crew sets you up with rods, reels and bait and shows newcomers the ropes, then it is trolling and bottom-fishing through the day with the chance of barracuda, tuna, trevally and grouper. Whatever you land, the crew can clean and bag it; many hotels will cook your catch for dinner. Shade, soft drinks and a relaxed crew make the day as much about the sea as the fish.',
    duration: '~7 h offshore · pickup included',
    priceFrom: 65,
    images: [IMG.boatMen, IMG.boatSea, IMG.boatGear, IMG.boatOpen],
    pricing: [['adult', 'Adult angler', 'Rod, reel, bait + crew', 65], ['child', 'Child (6-11)', 'Junior setup + supervision', 38], ['observer', 'Non-fishing guest', 'Along for the ride', 30]],
    addons: [['pickup', 'Hotel pickup & drop-off', 'Air-conditioned transfer', 10], ['clean', 'Clean & bag your catch', 'Crew fillets and bags your fish', 8], ['lunch', 'Onboard lunch', 'Hot lunch cooked at sea', 12]],
    highlights: ['Offshore deep-water grounds', 'Rods, reels & bait included', 'Beginners coached by the crew', 'Barracuda, tuna, trevally, grouper', 'Keep & cook your catch'],
    inclusions: ['Full-day fishing charter', 'All tackle & bait', 'Experienced crew', 'Soft drinks & water', 'Life jackets'],
    exclusions: ['Hotel pickup (add-on)', 'Lunch (add-on)', 'Fishing licence if required', 'Tips'],
    windows: [['Full day', '07:00', '14:00']],
  },
  {
    slug: 'hurghada-morning-trolling-trip',
    title: 'Hurghada · Morning Trolling Trip',
    shortDescription: 'A half-day trolling run at first light when the fish are most active — fast-paced, hands-on and ideal if you only have a morning.',
    description: 'The early boat catches the fish. Leave at dawn while the water is calm and the pelagics are feeding, and spend the morning trolling lures along the drop-offs. It is the most action-packed style of fishing — lines out, reels screaming, everyone ready to grab a rod. Back at the marina by lunchtime with a cooler box hopefully a little heavier. Great value for a focused half-day.',
    duration: '~4 h · early start',
    priceFrom: 45,
    images: [IMG.boatSea, IMG.boatRail, IMG.boatMen, IMG.boatOpen],
    pricing: [['adult', 'Adult angler', 'Trolling setup + crew', 45], ['child', 'Child (6-11)', 'Junior rod + help', 26]],
    addons: [['pickup', 'Hotel pickup', 'Air-conditioned transfer', 10], ['clean', 'Clean & bag catch', 'Crew prepares your fish', 8]],
    highlights: ['Dawn departure, calm water', 'Fast-paced trolling action', 'Lures & tackle included', 'Back by lunchtime', 'Great half-day value'],
    inclusions: ['Half-day trolling trip', 'Tackle, lures & bait', 'Crew', 'Water & soft drinks', 'Life jackets'],
    exclusions: ['Hotel pickup (add-on)', 'Catch cleaning (add-on)', 'Tips'],
    windows: [['Dawn', '06:00', '10:00']],
  },
  {
    slug: 'hurghada-private-fishing-boat-charter',
    title: 'Hurghada · Private Fishing Boat Charter',
    shortDescription: 'Your own boat and crew for the day — fish where and how you like, perfect for a group of friends or a serious angler.',
    description: 'Charter the whole boat and the day is yours. Tell the skipper whether you want fast trolling, patient bottom-fishing on the reefs, or a mix, and set your own pace and route. The crew handles the tackle, bait and the hard work; you handle the rods and the cooler. Ideal for a group of friends, a father-and-son day, or a keen angler who wants the boat to themselves.',
    duration: '~6 h private · flexible',
    priceFrom: 320,
    images: [IMG.boatOpen, IMG.boatMen, IMG.boatSea, IMG.boatGear],
    pricing: [['boat6', 'Private boat (up to 6)', 'Whole boat + crew + tackle', 320], ['boat10', 'Private boat (up to 10)', 'Larger group charter', 460]],
    addons: [['pickup', 'Group hotel pickup', 'Air-conditioned transfer', 18], ['lunch', 'Onboard lunch for group', 'Hot lunch cooked at sea', 45], ['clean', 'Clean & bag catch', 'Crew prepares the catch', 10]],
    highlights: ['Whole boat to your group', 'Choose your style & route', 'All tackle & bait included', 'Experienced skipper & crew', 'Set your own pace'],
    inclusions: ['Private full-boat charter', 'All tackle & bait', 'Skipper & crew', 'Soft drinks & water', 'Life jackets'],
    exclusions: ['Hotel pickup (add-on)', 'Lunch (add-on)', 'Tips'],
    windows: [['Flexible', '06:00', '16:00']],
  },
  {
    slug: 'hurghada-beginner-fishing-reef-day',
    title: 'Hurghada · Beginner Fishing & Reef Day',
    shortDescription: 'A relaxed, patient day of reef fishing built for first-timers and families — gentle water, simple gear and a friendly crew.',
    description: 'Never held a rod before? Start here. This is calm, reef-based bottom-fishing in sheltered water, with a patient crew who set everyone up and stay close to help. The pace is gentle, the catches are frequent enough to keep kids interested, and there is time for a swim or snorkel off the back of the boat between bites. A friendly, no-pressure introduction to fishing the Red Sea.',
    duration: '~5 h · families & first-timers',
    priceFrom: 40,
    images: [IMG.boatMen, IMG.boatDeck, IMG.boatGear, IMG.boatOpen],
    pricing: [['adult', 'Adult', 'Gear + coaching + crew', 40], ['child', 'Child (5-11)', 'Junior gear + close help', 23], ['family', 'Family (2A + 2C)', 'Family group rate', 110]],
    addons: [['pickup', 'Hotel pickup', 'Air-conditioned transfer', 10], ['snorkel', 'Snorkel gear hire', 'Mask, snorkel & fins for the swim stop', 6]],
    highlights: ['Calm, sheltered reef fishing', 'Patient crew, lots of help', 'Frequent catches for kids', 'Swim/snorkel stop included', 'No experience needed'],
    inclusions: ['Reef fishing day', 'Simple tackle & bait', 'Crew coaching', 'Swim stop', 'Water & soft drinks', 'Life jackets'],
    exclusions: ['Hotel pickup (add-on)', 'Snorkel hire (add-on)', 'Tips'],
    windows: [['Morning', '08:30', '13:30'], ['Afternoon', '13:00', '18:00']],
  },
  {
    slug: 'hurghada-sunset-jigging-session',
    title: 'Hurghada · Sunset Jigging Session',
    shortDescription: 'An evening light-tackle jigging trip when the predators come on the bite — fast, sporty fishing in the best light of the day.',
    description: 'A short, sporty evening session for anglers who like it active. As the sun drops the predators move up to feed, and light-tackle jigging over the reefs and wrecks gets you fast, visual strikes. The crew runs you to the best marks and keeps the lines busy until the light goes. Fewer hours, more action — and the Red Sea sunset thrown in.',
    duration: '~3 h · evening bite',
    priceFrom: 38,
    images: [IMG.boatSea, IMG.boatRail, IMG.boatOpen, IMG.boatMen],
    pricing: [['adult', 'Adult angler', 'Jigging setup + crew', 38], ['observer', 'Non-fishing guest', 'Along for the sunset', 22]],
    addons: [['pickup', 'Hotel pickup', 'Air-conditioned transfer', 10], ['clean', 'Clean & bag catch', 'Crew prepares your fish', 8]],
    highlights: ['Evening predator bite', 'Sporty light-tackle jigging', 'Fast, visual strikes', 'Red Sea sunset', 'Short, focused session'],
    inclusions: ['Evening jigging session', 'Light tackle & jigs', 'Crew', 'Water & soft drinks', 'Life jackets'],
    exclusions: ['Hotel pickup (add-on)', 'Catch cleaning (add-on)', 'Tips'],
    windows: [['Sunset', '16:00', '19:00']],
  },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildDoc(s: Seed, tenantId: any): any {
  return {
    slug: s.slug,
    title: s.title,
    shortDescription: s.shortDescription,
    description: s.description,
    images: s.images,
    category: 'water-activities',
    destination: { city: CITY, country: 'Egypt', coordinates: { lat: 27.2579, lng: 33.8116 } },
    duration: s.duration,
    languages: ['English', 'Arabic', 'German', 'Russian', 'Italian', 'French'],
    rating: 4.6 + Math.round(Math.random() * 3) / 10,
    reviewCount: 60 + Math.floor(Math.random() * 320),
    priceFrom: s.priceFrom,
    currency: 'USD',
    pricingOptions: s.pricing.map(([id, name, description, price]) => ({ id, name, description, price })),
    addons: s.addons.map(([id, name, description, price]) => ({ id, name, description, price })),
    entryWindows: s.windows.map(([label, startTime, endTime]) => ({ label, startTime, endTime })),
    itinerary: [],
    highlights: s.highlights,
    inclusions: s.inclusions,
    exclusions: s.exclusions,
    meetingPoint: {
      address: 'Hurghada Marina · Red Sea coast',
      instructions: 'Meet at Hurghada Marina 30 minutes before departure. Hotel pickup is available as an add-on on boat trips.',
      mapUrl: 'https://maps.google.com/?q=27.2579,33.8116',
    },
    cancellationPolicy: 'Free cancellation up to 24 hours before',
    instantConfirmation: true,
    mobileTicket: true,
    hasHotelPickup: true,
    badges: ['free-cancellation', 'instant-confirm'],
    availability: { type: 'date-only', advanceBooking: 30 },
    tenantIds: [tenantId],
    status: 'active',
    featured: true,
  };
}

async function seedTenant(slug: string, catalog: Seed[]): Promise<void> {
  const tenant: any = await Tenant.findOne({ slug });
  if (!tenant) { console.log(`  ✗ ${slug} NOT FOUND`); return; }
  console.log(`\n${slug}:`);

  // 1. Detach from the shared generic pool (pull tenantId; never delete shared docs).
  const detach = await Attraction.updateMany(
    { tenantIds: tenant._id, slug: { $nin: catalog.map((c) => c.slug) } },
    { $pull: { tenantIds: tenant._id } },
  );
  console.log(`  ↩ detached from ${detach.modifiedCount} shared/old tours`);

  // 2. Seed the brand catalog (idempotent on slug).
  let created = 0;
  for (const s of catalog) {
    const exists = await Attraction.findOne({ slug: s.slug });
    if (exists) {
      if (!(exists.tenantIds || []).some((id: any) => String(id) === String(tenant._id))) {
        (exists as any).tenantIds = [...(exists.tenantIds || []), tenant._id];
        await exists.save();
      }
      console.log(`  • ${s.slug} (exists)`);
      continue;
    }
    await Attraction.create(buildDoc(s, tenant._id));
    created++;
    console.log(`  ✓ ${s.slug}`);
  }
  const total = await Attraction.countDocuments({ tenantIds: tenant._id });
  console.log(`  → created ${created}; tenant now has ${total} tours`);
}

async function main(): Promise<void> {
  await connectDatabase();
  try {
    console.log('\n— Seeding fishing + submarine catalogs —');
    await seedTenant('hurghada-submarine', SUBMARINE);
    await seedTenant('hurghada-fishing', FISHING);
    console.log('\n✅ Done.\n');
  } finally {
    await disconnectDatabase();
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

main().catch(async (e) => { console.error(e); await disconnectDatabase(); process.exit(1); });
