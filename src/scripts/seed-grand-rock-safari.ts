/**
 * Grand Rock Safari tenant and catalogue package.
 *
 * Nine tours from grandrocksafari.com: seven desert rides from Makadi Bay and
 * two private speed-boat trips from Sahl Hasheesh. Prices, durations, group
 * sizes, inclusions and itineraries follow the operator's own published tour
 * pages (read 30 September 2026); the copy is rewritten without the source's
 * emoji and template slips, and nothing the operator has not published is
 * added. Where the source contradicts itself the claim is left out and the
 * question is recorded in `openDecisions` (internal only).
 *
 * The site previews on the shared demo origin behind its access code. The
 * custom domain is recorded as unconfigured and never migrated here, and
 * booking alerts go to the platform QA inbox until the operator confirms its
 * reservations address.
 *
 * Dry run (no database or upload):
 *   npm run seed:grand-rock-safari
 * Read-only collision check against the target database:
 *   npm run seed:grand-rock-safari -- --check
 * Apply:
 *   npm run seed:grand-rock-safari -- --apply --confirm-domain=grandrocksafari.com --preview-code-out=<file outside git>
 */

import fs from 'fs';

type PricingModel = 'per-person' | 'per-booking';

interface SeedOption {
  id: string;
  name: string;
  description: string;
  price: number;
  /** The crossed-out price the operator publishes next to the current one. */
  originalPrice?: number;
  pricingModel: PricingModel;
  minParticipants: number;
  maxParticipants: number;
  childPrice?: number;
  infantPrice?: number;
}

interface ItineraryStep {
  time: string;
  duration?: string;
  title: string;
  description: string;
}

type City = 'Makadi Bay' | 'Sahl Hasheesh';

export interface GrandRockTour {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: 'Quad Safari' | 'Buggy Safari' | 'Horse Riding' | 'Motocross' | 'Sea Trips';
  city: City;
  duration: string;
  pricingOptions: SeedOption[];
  highlights: string[];
  itinerary: ItineraryStep[];
  inclusions: string[];
  exclusions: string[];
  whatToBring: string[];
  needToKnow: string[];
  accessibility: string[];
  participantRequirements: string[];
  /** Operator page the record was built from. Provenance and the future redirect map; never rendered. */
  sourceUrl: string;
  /** Original-size images from the operator's own media library, in display order. */
  sourceImages: string[];
  seo: { metaTitle: string; metaDescription: string; keywords: string[] };
  /** Internal-only questions for the operator before launch. Never rendered. */
  openDecisions: string[];
}

const TENANT_SLUG = 'grand-rock-safari';
const CUSTOM_DOMAIN = 'grandrocksafari.com';
const SOURCE_ORIGIN = 'https://grandrocksafari.com';
const SOURCE_UPLOADS = `${SOURCE_ORIGIN}/wp-content/uploads/`;
const LISTING_PATH = '/safaris';
/** Published on the operator's About page for guides and assistance. */
const GUIDE_LANGUAGES = ['English', 'German', 'Russian', 'Polish'];
/** Booking alerts stay with the platform QA inbox until the operator confirms a reservations address. */
const PREVIEW_BOOKING_INBOX = 'theegyptexcursionsonline@gmail.com';

export const GRAND_ROCK_SOURCE_LOGO = `${SOURCE_UPLOADS}2024/08/Footer-logo416-x-351.png`;
export const GRAND_ROCK_HERO_SOURCES: string[] = [
  `${SOURCE_UPLOADS}2024/08/IMG_6793-jpg.webp`,
  `${SOURCE_UPLOADS}2025/03/b4806bf0-71a5-4752-ba80-027f9718c585.jpg`,
  `${SOURCE_UPLOADS}2025/03/PHOTO-2025-03-11-00-25-01.jpg`,
  `${SOURCE_UPLOADS}2025/03/95c275a3-9efb-452e-bd5a-696d09feabd4.jpg`,
];

export const GRAND_ROCK_TENANT = {
  slug: TENANT_SLUG,
  name: 'Grand Rock Safari',
  domain: 'grand-rock-safari.foxesnetwork.com',
  customDomain: CUSTOM_DOMAIN,
  domainMigrated: false,
  customDomainStatus: 'unconfigured',
  tagline: 'Desert rides and Red Sea boat trips from Makadi Bay',
  description:
    'Quad, buggy, motocross and horse rides from Makadi Bay, and private speed-boat snorkelling and fishing trips from Sahl Hasheesh, with hotel pickup included.',
  // Brand colours and fonts from the operator's own site theme (logo orange and navy).
  theme: { primaryColor: '#13478A', secondaryColor: '#0A2547', accentColor: '#F79508' },
  fonts: { heading: 'League Spartan', body: 'Roboto' },
  designMode: 'savanna',
  defaultCurrency: 'EUR',
  defaultLanguage: 'en',
  supportedLanguages: ['en'],
  timezone: 'Africa/Cairo',
  contactInfo: {
    // The address the operator's site uses everywhere except one contact-page line.
    email: 'info@grandrocksafari.com',
    phone: '+20 103 230 0489',
    whatsapp: '+201032300489',
    address: 'Makadi Bay, Hurghada, Red Sea, Egypt',
    supportHours: 'Every day, 09:00–17:00',
  },
  socialLinks: {
    facebook: 'https://www.facebook.com/GrandRockSafari',
    instagram: 'https://www.instagram.com/_grandrocksafari_',
    tiktok: 'https://www.tiktok.com/@grand.rock.safari',
  },
  notificationSettings: { bookingEmail: PREVIEW_BOOKING_INBOX },
  flatUrls: false,
  status: 'active',
  navigation: [
    { label: 'Home', href: '/' },
    { label: 'Safaris', href: LISTING_PATH },
    { label: 'Destinations', href: '/destinations' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ],
  seoSettings: {
    metaTitle: 'Grand Rock Safari | Makadi Bay Safaris and Red Sea Boat Trips',
    metaDescription:
      'Book quad, buggy, motocross and horse rides in Makadi Bay, or a private speed boat for snorkelling or fishing in Sahl Hasheesh. Hotel pickup included.',
    keywords: ['Grand Rock Safari', 'Makadi Bay safari', 'quad safari Makadi Bay', 'buggy safari Hurghada', 'Sahl Hasheesh speed boat'],
  },
  paymentSettings: { enabledGateways: ['pay-later'], ownPaymentGateway: false, stripe: { enabled: false } },
  bundleSettings: { mode: 'off', reason: 'Tenant launch package does not expose bundles.' },
  aiSettings: {
    bookingWidget: { enabled: false, position: 'bottom-right', languages: ['en'], autoOpen: false },
    voiceAgent: { enabled: false, languages: ['en'], buttonPosition: 'bottom-right' },
    searchWidget: { enabled: true, placeholder: 'Search quad, buggy, motocross, horse or boat trips', showPopularSearches: true, maxSuggestions: 6 },
  },
} as const;

const DESERT_BRING = [
  'Closed shoes',
  'Sunglasses and sun cream',
  'Light clothes you do not mind getting dusty',
];
const BOAT_BRING = ['Swimwear and a towel', 'Sun cream and a hat', 'Sunglasses'];
const RIDE_ADVISORY = [
  'Off-road riding involves bumps and vibration. Tell the team before booking about pregnancy, back or neck problems, or any other medical condition.',
];
const BOAT_ADVISORY = [
  'Tell the team before booking about pregnancy, mobility needs or any medical condition that affects time on a fast boat or in the water.',
];
const PICKUP_NOTES = [
  'Hotel pickup and drop-off are included. Give your hotel name when you book.',
  'When is pickup? The team confirms your pickup time after you book.',
];
const GUIDE_LANGUAGE_NOTE = 'Which languages do the guides speak? English, German, Russian and Polish.';

const person = (price: number, maxParticipants: number, originalPrice?: number): SeedOption => ({
  id: 'standard',
  name: 'Per person',
  description: 'Price for each rider.',
  price,
  ...(originalPrice ? { originalPrice } : {}),
  childPrice: price,
  infantPrice: 0,
  pricingModel: 'per-person',
  minParticipants: 1,
  maxParticipants,
});

const vehicle = (id: string, name: string, description: string, price: number, maxParticipants: number, originalPrice?: number): SeedOption => ({
  id,
  name,
  description,
  price,
  ...(originalPrice ? { originalPrice } : {}),
  pricingModel: 'per-booking',
  minParticipants: 1,
  maxParticipants,
});

const desertRideSteps = (vehicleName: string, extra: ItineraryStep[] = []): ItineraryStep[] => [
  { time: 'Pickup', title: 'Hotel pickup', description: 'Transfer from your hotel to the desert station outside Makadi Bay.' },
  { time: 'Arrival', title: 'Safety briefing and test drive', description: `An introduction to the ${vehicleName}, the safety rules and a short test drive before the route.` },
  { time: 'First leg', title: 'Ride out, 13 km', description: 'Sand, desert tracks and rocky ground on the way to the coast.' },
  { time: 'Coast', title: 'Red Sea viewpoint', description: 'A stop where the desert meets the sea, with time for photos.' },
  { time: 'Second leg', title: 'Ride back, 13 km', description: 'A faster run back through the desert to the station.' },
  ...extra,
  { time: 'Return', title: 'Transfer to your hotel', description: 'The driver takes you back to your hotel.' },
];

const MOTOCROSS_DESCRIPTION = (bike: string) => [
  `Ride a ${bike} through the desert behind Makadi Bay, a landscape of canyons and fossilised coral left from the time this land lay under the sea.`,
  'The day starts with a pickup from your hotel and a transfer to the motocross club. The guides give a full safety briefing and teach the basics of handling the bike, from throttle to cornering, so first-time riders can start with confidence. Once you have seen the tracks, you choose the one that suits you: easy trails for beginners, or faster tracks for experienced riders, including a coastal route past cliffs and up mountain paths that climb to around 350 feet.',
  'The ride runs about 13 km out to a viewpoint above the Red Sea, with a short break for water and photos, and a quicker run back to the club before the transfer to your hotel. Safety gear, water and a guide are included.',
].join('\n\n');

const MOTOCROSS_STEPS: ItineraryStep[] = [
  { time: 'Pickup', title: 'Hotel pickup', description: 'Transfer from your hotel to the motocross club.' },
  { time: 'Arrival', title: 'Briefing and bike handling', description: 'The guides cover the safety rules and the basics of throttle, braking and cornering.' },
  { time: 'First leg', title: 'Desert ride, about 13 km', description: 'Sand dunes and off-road tracks chosen for your level.' },
  { time: 'Viewpoint', title: 'Break above the sea', description: 'Water, photos and a rest before the ride back.' },
  { time: 'Second leg', title: 'Return ride', description: 'A faster run back to the club.' },
  { time: 'Return', title: 'Transfer to your hotel', description: 'The driver takes you back to your hotel.' },
];

const MOTOCROSS_COMMON = {
  category: 'Motocross' as const,
  city: 'Makadi Bay' as const,
  duration: '2 hours',
  inclusions: ['Hotel pickup and drop-off', 'Motocross bike', 'Safety gear', 'Experienced guide', 'Bottle of water'],
  exclusions: ['Tips', 'Photographer service'],
  whatToBring: DESERT_BRING,
  needToKnow: [
    ...PICKUP_NOTES,
    'Do I need motocross experience? No. Beginners get a lesson first and ride an easier track.',
    'Can I choose the track? Yes. You see the tracks at the club and pick the one that suits your level.',
    GUIDE_LANGUAGE_NOTE,
  ],
  accessibility: RIDE_ADVISORY,
  participantRequirements: [] as string[],
  itinerary: MOTOCROSS_STEPS,
};

export const GRAND_ROCK_TOURS: GrandRockTour[] = [
  {
    slug: 'quad-safari-vip',
    title: 'Quad Safari VIP by the Sea',
    shortDescription:
      'Two hours on an automatic quad from Makadi Bay to a Red Sea viewpoint and back, finished with a short camel ride. Hotel pickup included.',
    description: [
      'This two-hour ride combines open desert, a stop on the Red Sea coast and a short camel ride. It starts with a pickup from your hotel and a transfer to the desert station outside Makadi Bay.',
      'After a safety briefing and a test drive, you ride 13 km across sand, desert tracks and rocky ground to a viewpoint where the desert meets the sea. After time for photos, you ride another 13 km back to the station, then climb onto a camel for a short, easy ride before the transfer back to your hotel.',
      'No experience is needed. The quads are automatic and a guide leads the group the whole way. A sunset departure is available on request.',
    ].join('\n\n'),
    category: 'Quad Safari',
    city: 'Makadi Bay',
    duration: '2 hours',
    pricingOptions: [person(40, 20)],
    highlights: [
      '26 km guided quad route, 13 km out and 13 km back',
      'Stop at a viewpoint where the desert meets the Red Sea',
      'Short camel ride included',
      'Automatic quads, no experience needed',
      'Sunset departure available on request',
    ],
    itinerary: desertRideSteps('quad', [
      { time: 'Camel', title: 'Short camel ride', description: 'An easy camel ride at the station before you head back.' },
    ]),
    inclusions: ['Hotel pickup and drop-off', 'Quad bike', 'Experienced guide', 'Short camel ride', 'Bottle of water', 'Scarf against sun and sand'],
    exclusions: ['Tips', 'Photographer service', 'Goggles'],
    whatToBring: DESERT_BRING,
    needToKnow: [
      ...PICKUP_NOTES,
      'Is a sunset ride possible? Yes, ask for the sunset departure when you book.',
      'Do I need a driving licence or experience? No experience is needed; the quads are automatic and you get a test drive first.',
      GUIDE_LANGUAGE_NOTE,
    ],
    accessibility: RIDE_ADVISORY,
    participantRequirements: [],
    sourceUrl: `${SOURCE_ORIGIN}/tours/quad-safari-vip/`,
    sourceImages: [
      `${SOURCE_UPLOADS}2024/08/IMG_48E2BFA90F9A-7-jpeg.webp`,
      `${SOURCE_UPLOADS}2024/08/IMG_48E2BFA90F9A-4-jpeg.webp`,
      `${SOURCE_UPLOADS}2024/08/IMG_48E2BFA90F9A-3-jpeg.webp`,
      `${SOURCE_UPLOADS}2024/08/IMG_6774-jpg.webp`,
      `${SOURCE_UPLOADS}2024/08/IMG_48E2BFA90F9A-8-jpeg.webp`,
    ],
    seo: {
      metaTitle: 'Quad Safari VIP by the Sea in Makadi Bay | Grand Rock Safari',
      metaDescription:
        'Two-hour quad safari from Makadi Bay to a Red Sea viewpoint and back, with a short camel ride and hotel pickup included. 40 € per person.',
      keywords: ['Makadi Bay quad safari', 'quad bike Hurghada', 'quad and camel ride', 'Red Sea desert quad'],
    },
    openDecisions: [
      'The source page lists no departure times; confirm daily departures, including the sunset slot, before switching from date-only booking to time slots.',
      'Confirm the maximum group size per departure (20 riders assumed for the booking limit).',
      'Confirm whether children ride their own quad or ride with an adult, and any minimum age.',
    ],
  },
  {
    slug: 'buggy-car-safari-2-seats',
    title: 'Buggy Car Safari, 2 Seats',
    shortDescription:
      'A two-hour, 26 km dune buggy route from Makadi Bay to the Red Sea coast and back. The price covers one two-seat buggy.',
    description: [
      'Drive your own dune buggy on a two-hour, 26 km route through the Eastern Desert behind Makadi Bay. After a hotel pickup and a short transfer to the buggy station, you get a safety briefing, driving instructions and a test drive.',
      'The route crosses sand dunes, desert trails and rocky ground, with mountains on the horizon, and stops at a viewpoint where the desert meets the Red Sea. After time for photos, you drive back to the station for the transfer to your hotel.',
      'The price covers one buggy with seats for two, so you can share the driving with a friend or partner.',
    ].join('\n\n'),
    category: 'Buggy Safari',
    city: 'Makadi Bay',
    duration: '2 hours',
    pricingOptions: [vehicle('buggy-2-seats', 'Two-seat buggy', 'One buggy for up to two people.', 100, 2, 120)],
    highlights: [
      'Your own two-seat dune buggy',
      '26 km route through dunes, desert trails and rocky ground',
      'Viewpoint stop where the desert meets the Red Sea',
      'Safety briefing and test drive before you set off',
    ],
    itinerary: desertRideSteps('buggy'),
    inclusions: ['Hotel pickup and drop-off', 'Two-seat buggy', 'Experienced guide', 'Bottle of water', 'Scarf against sun and sand'],
    exclusions: ['Tips', 'Photographer service', 'Goggles'],
    whatToBring: DESERT_BRING,
    needToKnow: [
      ...PICKUP_NOTES,
      'Is the price per person? No. It covers one buggy for up to two people.',
      'Can we swap drivers? Yes, the two people in the buggy can share the driving.',
      GUIDE_LANGUAGE_NOTE,
    ],
    accessibility: RIDE_ADVISORY,
    participantRequirements: [],
    sourceUrl: `${SOURCE_ORIGIN}/tours/buggy-car-safari-2-seats/`,
    sourceImages: [
      `${SOURCE_UPLOADS}2024/08/IMG_6851-jpg.webp`,
      `${SOURCE_UPLOADS}2024/08/IMG_6846-jpg.webp`,
      `${SOURCE_UPLOADS}2024/08/IMG_6847-jpg.webp`,
      `${SOURCE_UPLOADS}2024/08/IMG_6850-jpg.webp`,
    ],
    seo: {
      metaTitle: 'Buggy Car Safari, 2 Seats, in Makadi Bay | Grand Rock Safari',
      metaDescription:
        'Drive a two-seat dune buggy for two hours and 26 km through the Makadi Bay desert to the Red Sea coast. Hotel pickup included.',
      keywords: ['Makadi Bay buggy safari', 'dune buggy Hurghada', 'two-seat buggy', 'desert buggy Red Sea'],
    },
    openDecisions: [
      'The source shows the price under an "Adult" label; confirm that 100 € (was 120 €) covers the whole two-seat buggy, not each person.',
      'Confirm the crossed-out 120 € is a genuine former price before it is shown as a reduction.',
      'Confirm whether a passenger may be a child and any minimum driver age.',
    ],
  },
  {
    slug: 'buggy-car-safari-4-seats',
    title: 'Buggy Car Safari, 4 Seats',
    shortDescription:
      'A two-hour, 26 km dune buggy route from Makadi Bay to the Red Sea coast and back. The price covers one four-seat buggy.',
    description: [
      'Bring the family or a group of friends on a two-hour, 26 km buggy route through the Eastern Desert behind Makadi Bay. After a hotel pickup and a short transfer to the buggy station, you get a safety briefing, driving instructions and a test drive.',
      'The route crosses sand dunes, desert trails and rocky ground, with mountains on the horizon, and stops at a viewpoint where the desert meets the Red Sea. After time for photos, you drive back to the station for the transfer to your hotel.',
      'The price covers one buggy with seats for four.',
    ].join('\n\n'),
    category: 'Buggy Safari',
    city: 'Makadi Bay',
    duration: '2 hours',
    pricingOptions: [vehicle('buggy-4-seats', 'Four-seat buggy', 'One buggy for up to four people.', 150, 4, 160)],
    highlights: [
      'One four-seat buggy for your group',
      '26 km route through dunes, desert trails and rocky ground',
      'Viewpoint stop where the desert meets the Red Sea',
      'Safety briefing and test drive before you set off',
    ],
    itinerary: desertRideSteps('buggy'),
    inclusions: ['Hotel pickup and drop-off', 'Four-seat buggy', 'Experienced guide', 'Bottle of water', 'Scarf against sun and sand'],
    exclusions: ['Tips', 'Photographer service', 'Goggles'],
    whatToBring: DESERT_BRING,
    needToKnow: [
      ...PICKUP_NOTES,
      'Is the price per person? No. It covers one buggy for up to four people.',
      'Who drives? One of your group drives; drivers can swap during the stops.',
      GUIDE_LANGUAGE_NOTE,
    ],
    accessibility: RIDE_ADVISORY,
    participantRequirements: [],
    sourceUrl: `${SOURCE_ORIGIN}/tours/buggy-car-safari-4-seats/`,
    sourceImages: [
      `${SOURCE_UPLOADS}2024/08/IMG_6848-jpg.webp`,
      `${SOURCE_UPLOADS}2024/08/IMG_6851-jpg.webp`,
      `${SOURCE_UPLOADS}2024/08/IMG_6845-jpg.webp`,
      `${SOURCE_UPLOADS}2024/08/IMG_6849-jpg.webp`,
    ],
    seo: {
      metaTitle: 'Buggy Car Safari, 4 Seats, in Makadi Bay | Grand Rock Safari',
      metaDescription:
        'Drive a four-seat dune buggy for two hours and 26 km through the Makadi Bay desert to the Red Sea coast. Hotel pickup included.',
      keywords: ['family buggy safari Makadi Bay', 'four-seat buggy Hurghada', 'dune buggy Red Sea', 'group buggy tour'],
    },
    openDecisions: [
      'The source shows the price under an "Adult" label; confirm that 150 € (was 160 €) covers the whole four-seat buggy, not each person.',
      'Confirm the crossed-out 160 € is a genuine former price before it is shown as a reduction.',
      'Confirm minimum driver age and whether children may ride as passengers.',
      'The source shows two-seat buggy photos on the four-seat product; request photos of the four-seat buggy.',
    ],
  },
  {
    slug: 'horse-riding-by-the-sea',
    title: 'Horse Riding by the Sea',
    shortDescription:
      'A two-hour ride on an Arabian horse from a Makadi Bay stable through the desert or along the beach, with the option to ride into the sea.',
    description: [
      'Ride an Arabian horse through the desert or along the Red Sea shore on this two-hour outing from a stable in Makadi Bay. Beginners, children and experienced riders are all welcome: the team matches each rider to a suitable horse after a short briefing on riding and safety.',
      'You ride through golden sand or along the beach with a guide, and if you choose, finish by riding your horse into the sea for a swim. Wear your swimwear under your clothes for that part, as there are no changing rooms on the beach.',
      'Back at the stable there are soft drinks and Arabic tea, and time to meet the camels and donkeys. Hotel pickup and drop-off are included, and helmets are available.',
    ].join('\n\n'),
    category: 'Horse Riding',
    city: 'Makadi Bay',
    duration: '2 hours',
    pricingOptions: [person(35, 15)],
    highlights: [
      'Desert or beach ride on an Arabian horse',
      'Option to ride your horse into the Red Sea',
      'Horses matched to beginners, children and experienced riders',
      'Soft drinks and Arabic tea at the stable after the ride',
    ],
    itinerary: [
      { time: 'Pickup', title: 'Hotel pickup', description: 'Transfer from your hotel to the stable in Makadi Bay.' },
      { time: 'Arrival', title: 'Welcome and briefing', description: 'Meet the team, get matched to a horse for your level, and learn the basics of riding and the safety rules.' },
      { time: 'Ride', title: 'Desert or beach ride', description: 'A guided ride over the sand or along the shore.' },
      { time: 'Optional', title: 'Ride into the sea', description: 'For those who choose it, a swim with your horse in the Red Sea.' },
      { time: 'Stable', title: 'Drinks and animals', description: 'Soft drinks and Arabic tea, and a chance to meet the camels and donkeys.' },
      { time: 'Return', title: 'Transfer to your hotel', description: 'The driver takes you back to your hotel.' },
    ],
    inclusions: ['Hotel pickup and drop-off', 'Horse riding', 'Guide', 'Helmet'],
    exclusions: ['Tips'],
    whatToBring: [
      'Long trousers, recommended by the stable',
      'Swimwear under your clothes if you want to ride into the sea',
      'A towel',
      'Sun cream',
    ],
    needToKnow: [
      ...PICKUP_NOTES,
      'I have never ridden before. Can I join? Yes. The team picks a calm horse for beginners and children.',
      'Is there somewhere to change? No. Wear your swimwear under your clothes if you plan to ride into the sea.',
      GUIDE_LANGUAGE_NOTE,
    ],
    accessibility: [
      'Tell the team before booking about pregnancy, back problems, or any condition that affects riding.',
    ],
    participantRequirements: [],
    sourceUrl: `${SOURCE_ORIGIN}/tours/horse-riding-by-the-sea/`,
    sourceImages: [
      `${SOURCE_UPLOADS}2025/01/IMG_7198-scaled-1.jpg`,
      `${SOURCE_UPLOADS}2025/01/03-22.jpg`,
      `${SOURCE_UPLOADS}2025/01/02-2.jpeg`,
    ],
    seo: {
      metaTitle: 'Horse Riding by the Sea in Makadi Bay | Grand Rock Safari',
      metaDescription:
        'Two-hour Arabian horse ride in Makadi Bay through the desert or along the beach, with the option to swim with your horse. Hotel pickup included.',
      keywords: ['horse riding Makadi Bay', 'horse riding by the sea Hurghada', 'swim with horses Red Sea', 'Arabian horse ride'],
    },
    openDecisions: [
      'The source says photos and videos are "included in the package" but also lists "Photographer Service" as excluded; confirm before either is shown.',
      'Confirm whether the sea swim costs extra and whether it is available on every departure.',
      'Confirm the minimum age for children riding alone.',
      'Confirm Grand Rock owns the three horse photos used. The source gallery also carries images that appear to come from other websites; those were left out.',
    ],
  },
  {
    ...MOTOCROSS_COMMON,
    slug: 'motocross-ktm-350cc-vip',
    title: 'Motocross KTM 350cc VIP',
    shortDescription:
      'Two hours on a KTM 350cc motocross bike in the Makadi Bay desert, with tracks for beginners and experienced riders. Hotel pickup included.',
    description: MOTOCROSS_DESCRIPTION('KTM 350cc motocross bike'),
    pricingOptions: [person(130, 10, 160)],
    highlights: [
      'KTM 350cc motocross bike',
      'Tracks for beginners and experienced riders',
      'Canyons and fossilised coral in the Makadi Bay desert',
      'Coastal viewpoint above the Red Sea',
      'Safety gear and a lesson before you ride',
    ],
    sourceUrl: `${SOURCE_ORIGIN}/tours/motorcross-ktm-vip/`,
    sourceImages: [
      `${SOURCE_UPLOADS}2025/03/b4806bf0-71a5-4752-ba80-027f9718c585.jpg`,
      `${SOURCE_UPLOADS}2025/03/95c275a3-9efb-452e-bd5a-696d09feabd4.jpg`,
      `${SOURCE_UPLOADS}2025/03/9a82e988-d74f-4047-84e8-988185fd843a.jpg`,
      `${SOURCE_UPLOADS}2025/03/d4b8d898-6fbd-4ced-8b94-7142b421391f.jpg`,
    ],
    seo: {
      metaTitle: 'Motocross KTM 350cc VIP in Makadi Bay | Grand Rock Safari',
      metaDescription:
        'Ride a KTM 350cc motocross bike for two hours in the Makadi Bay desert, with tracks for every level, safety gear and hotel pickup included.',
      keywords: ['motocross Makadi Bay', 'KTM 350 Hurghada', 'dirt bike tour Red Sea', 'motocross Egypt'],
    },
    openDecisions: [
      'The 350cc and 530cc rides are both priced 130 € (was 160 €) on the source; confirm this is intended.',
      'Confirm the minimum rider age and any licence requirement.',
    ],
  },
  {
    ...MOTOCROSS_COMMON,
    slug: 'motocross-ktm-530cc-vip',
    title: 'Motocross KTM 530cc VIP',
    shortDescription:
      'Two hours on a KTM 530cc motocross bike in the Makadi Bay desert, for riders who want more power. Hotel pickup included.',
    description: MOTOCROSS_DESCRIPTION('KTM 530cc motocross bike'),
    pricingOptions: [person(130, 10, 160)],
    highlights: [
      'KTM 530cc motocross bike',
      'Faster tracks for confident riders, easier trails available',
      'Canyons and fossilised coral in the Makadi Bay desert',
      'Coastal viewpoint above the Red Sea',
      'Safety gear and a briefing before you ride',
    ],
    sourceUrl: `${SOURCE_ORIGIN}/tours/motorcross-ktm-530c-vip-copy/`,
    sourceImages: [
      `${SOURCE_UPLOADS}2025/03/5f66bece-ce74-4a56-8879-adcf36c2c858.jpg`,
      `${SOURCE_UPLOADS}2025/03/9322bab1-da00-47c5-ac51-d27ef58eba89.jpg`,
      `${SOURCE_UPLOADS}2025/03/95c275a3-9efb-452e-bd5a-696d09feabd4.jpg`,
      `${SOURCE_UPLOADS}2025/03/d4b8d898-6fbd-4ced-8b94-7142b421391f.jpg`,
    ],
    seo: {
      metaTitle: 'Motocross KTM 530cc VIP in Makadi Bay | Grand Rock Safari',
      metaDescription:
        'Ride a KTM 530cc motocross bike for two hours in the Makadi Bay desert, with safety gear, a guide and hotel pickup included.',
      keywords: ['KTM 530 motocross Makadi Bay', 'motocross Hurghada', 'dirt bike Red Sea', 'desert motocross Egypt'],
    },
    openDecisions: [
      'The 350cc and 530cc rides are both priced 130 € (was 160 €) on the source; confirm this is intended.',
      'Confirm the minimum rider age, experience and any licence requirement for the 530cc bike.',
    ],
  },
  {
    ...MOTOCROSS_COMMON,
    slug: 'motocross-yamaha-250cc-vip',
    title: 'Motocross Yamaha 250cc VIP',
    shortDescription:
      'Two hours on a Yamaha 250cc motocross bike in the Makadi Bay desert, a good first bike for new riders. Hotel pickup included.',
    description: MOTOCROSS_DESCRIPTION('Yamaha 250cc motocross bike'),
    pricingOptions: [person(80, 10, 100)],
    highlights: [
      'Yamaha 250cc motocross bike',
      'A lesson and an easier track for first-time riders',
      'Canyons and fossilised coral in the Makadi Bay desert',
      'Coastal viewpoint above the Red Sea',
      'Safety gear included',
    ],
    sourceUrl: `${SOURCE_ORIGIN}/tours/motorcross-yamaha-250c-vip-copy/`,
    sourceImages: [
      `${SOURCE_UPLOADS}2025/03/d4fe4fb1-78c2-4bfc-8d01-a7c1389b0d0d.jpg`,
      `${SOURCE_UPLOADS}2025/03/13485a68-0046-4166-ba49-c4e2deff1712.jpg`,
      `${SOURCE_UPLOADS}2025/03/95c275a3-9efb-452e-bd5a-696d09feabd4.jpg`,
      `${SOURCE_UPLOADS}2025/03/d4b8d898-6fbd-4ced-8b94-7142b421391f.jpg`,
    ],
    seo: {
      metaTitle: 'Motocross Yamaha 250cc VIP in Makadi Bay | Grand Rock Safari',
      metaDescription:
        'Ride a Yamaha 250cc motocross bike for two hours in the Makadi Bay desert, with a lesson, safety gear and hotel pickup included.',
      keywords: ['Yamaha 250 motocross Makadi Bay', 'beginner motocross Hurghada', 'dirt bike Red Sea', 'motocross Egypt'],
    },
    openDecisions: [
      'Confirm the crossed-out 100 € is a genuine former price before it is shown as a reduction.',
      'Confirm the minimum rider age and any licence requirement.',
    ],
  },
  {
    slug: 'private-speed-boat-snorkeling-sahl-hasheesh',
    title: 'Private Speed Boat Snorkelling in Sahl Hasheesh',
    shortDescription:
      'A three-hour private speed-boat trip from Sahl Hasheesh with two snorkelling stops on coral reefs. The price covers the boat for up to six people.',
    description: [
      'Have a speed boat to yourselves for three hours on the Red Sea. After a pickup from your hotel and a transfer to Sahl Hasheesh Marina, you head out across clear water to two coral reefs chosen for snorkelling.',
      'At each stop you swim among reef fish and coral gardens; dolphins and turtles are sometimes seen, though sightings are never certain. Between the reefs, the boat cruises along the Sahl Hasheesh coast.',
      'Masks, snorkels, fins and life jackets are provided, a captain and guide look after the group, and soft drinks are served on board. The price covers the private boat for up to six people.',
    ].join('\n\n'),
    category: 'Sea Trips',
    city: 'Sahl Hasheesh',
    duration: '3 hours',
    pricingOptions: [vehicle('private-boat', 'Private speed boat', 'The whole boat for up to six people.', 120, 6, 150)],
    highlights: [
      'Private speed boat for up to six people',
      'Two snorkelling stops on coral reefs',
      'Cruise along the Sahl Hasheesh coast',
      'Snorkelling gear, life jackets and soft drinks included',
    ],
    itinerary: [
      { time: 'Pickup', title: 'Hotel pickup', description: 'Transfer from your hotel to Sahl Hasheesh Marina.' },
      { time: 'Departure', title: 'Speed boat ride', description: 'Board your private boat and head out across the Red Sea.' },
      { time: 'First stop', title: 'Coral reef snorkelling', description: 'Snorkel the first reef with help from the guide.' },
      { time: 'Cruise', title: 'Along the coast', description: 'A ride along the Sahl Hasheesh shoreline between the two reefs.' },
      { time: 'Second stop', title: 'Second reef', description: 'A second snorkelling stop at a deeper reef.' },
      { time: 'Return', title: 'Back to the marina and your hotel', description: 'The boat returns to the marina for the transfer to your hotel.' },
    ],
    inclusions: [
      'Hotel pickup and drop-off',
      'Private speed boat',
      'Snorkelling equipment: mask, snorkel and fins',
      'Life jackets',
      'Captain and guide',
      'Soft drinks on board',
    ],
    exclusions: ['Tips', 'Photographer service'],
    whatToBring: BOAT_BRING,
    needToKnow: [
      ...PICKUP_NOTES,
      'Is the price per person? No. It covers the private boat for up to six people.',
      'Will we see dolphins? Dolphins and turtles are sometimes seen on this trip, but sightings are never guaranteed.',
      'Can non-swimmers join? Life jackets are provided; tell the guide if you are not a confident swimmer.',
    ],
    accessibility: BOAT_ADVISORY,
    participantRequirements: [],
    sourceUrl: `${SOURCE_ORIGIN}/tours/private-speed-boat/`,
    sourceImages: [
      `${SOURCE_UPLOADS}2025/03/PHOTO-2025-03-11-00-25-04-2.jpg`,
      `${SOURCE_UPLOADS}2025/03/PHOTO-2025-03-11-00-25-02-2.jpg`,
      `${SOURCE_UPLOADS}2025/03/PHOTO-2025-03-11-00-25-01-2.jpg`,
      `${SOURCE_UPLOADS}2025/03/PHOTO-2025-03-11-00-25-03.jpg`,
    ],
    seo: {
      metaTitle: 'Private Speed Boat Snorkelling in Sahl Hasheesh | Grand Rock Safari',
      metaDescription:
        'Three-hour private speed-boat trip from Sahl Hasheesh with two coral reef snorkelling stops, gear and soft drinks included. Up to six people.',
      keywords: ['private speed boat Sahl Hasheesh', 'snorkelling Sahl Hasheesh', 'private boat Hurghada', 'Red Sea snorkelling trip'],
    },
    openDecisions: [
      'Confirm the crossed-out 150 € is a genuine former price before it is shown as a reduction.',
      'Confirm any marina or national park fees and whether they are included.',
      'The source reef photos appear to be third-party images and were left out; request the operator\'s own underwater photos.',
    ],
  },
  {
    slug: 'private-speed-boat-fishing-sahl-hasheesh',
    title: 'Private Speed Boat Fishing in Sahl Hasheesh',
    shortDescription:
      'A three-hour private speed-boat fishing trip from Sahl Hasheesh with two fishing stops and all gear provided. The price covers the boat for up to six people.',
    description: [
      'Take a private speed boat out from Sahl Hasheesh for three hours of fishing on the Red Sea. After a pickup from your hotel and a transfer to the marina, you head for two fishing spots chosen by the crew.',
      'Rods, bait and tackle are provided and the crew helps beginners and experienced anglers alike. Snapper, grouper and barracuda are among the fish caught in these waters. Between the stops the boat cruises along the coast, where dolphins are sometimes seen.',
      'Life jackets and soft drinks are included, and the price covers the private boat for up to six people.',
    ].join('\n\n'),
    category: 'Sea Trips',
    city: 'Sahl Hasheesh',
    duration: '3 hours',
    pricingOptions: [vehicle('private-boat', 'Private speed boat', 'The whole boat for up to six people.', 130, 6, 150)],
    highlights: [
      'Private speed boat for up to six people',
      'Two fishing stops chosen by the crew',
      'Rods, bait and tackle provided',
      'Help from the crew for beginners',
    ],
    itinerary: [
      { time: 'Pickup', title: 'Hotel pickup', description: 'Transfer from your hotel to Sahl Hasheesh Marina.' },
      { time: 'Departure', title: 'Speed boat ride', description: 'Board your private boat and head out to the first fishing spot.' },
      { time: 'First stop', title: 'Reef fishing', description: 'Cast your line with help from the crew.' },
      { time: 'Cruise', title: 'Along the coast', description: 'A ride along the Sahl Hasheesh shoreline to the next spot.' },
      { time: 'Second stop', title: 'Deeper water', description: 'A second fishing stop further out.' },
      { time: 'Return', title: 'Back to the marina and your hotel', description: 'The boat returns to the marina for the transfer to your hotel.' },
    ],
    inclusions: [
      'Hotel pickup and drop-off',
      'Private speed boat',
      'Fishing equipment: rods, bait and tackle',
      'Life jackets',
      'Captain and guide',
      'Soft drinks on board',
    ],
    exclusions: ['Tips', 'Photographer service'],
    whatToBring: BOAT_BRING,
    needToKnow: [
      ...PICKUP_NOTES,
      'Is the price per person? No. It covers the private boat for up to six people.',
      'I have never fished before. Is that a problem? No. The crew shows you what to do.',
      'Is a catch guaranteed? No. The crew picks good spots, but what bites depends on the day.',
    ],
    accessibility: BOAT_ADVISORY,
    participantRequirements: [],
    sourceUrl: `${SOURCE_ORIGIN}/tours/private-speed-boat-fishing-adventure-in-sahl-hasheesh/`,
    sourceImages: [
      `${SOURCE_UPLOADS}2025/03/PHOTO-2025-03-11-00-25-01.jpg`,
      `${SOURCE_UPLOADS}2025/03/PHOTO-2025-03-11-00-27-27-2.jpg`,
      `${SOURCE_UPLOADS}2025/03/PHOTO-2025-03-11-00-25-02.jpg`,
      `${SOURCE_UPLOADS}2025/03/PHOTO-2025-03-11-00-27-27.jpg`,
      `${SOURCE_UPLOADS}2025/03/PHOTO-2025-03-11-00-25-03-2.jpg`,
    ],
    seo: {
      metaTitle: 'Private Speed Boat Fishing in Sahl Hasheesh | Grand Rock Safari',
      metaDescription:
        'Three-hour private fishing trip by speed boat from Sahl Hasheesh, with two fishing stops, gear and soft drinks included. Up to six people.',
      keywords: ['fishing trip Sahl Hasheesh', 'private fishing boat Hurghada', 'Red Sea fishing', 'speed boat fishing Egypt'],
    },
    openDecisions: [
      'Confirm the crossed-out 150 € is a genuine former price before it is shown as a reduction.',
      'Confirm whether guests may keep or have their catch cooked.',
    ],
  },
];

const CITY_COORDINATES: Record<City, { lat: number; lng: number }> = {
  // Same Makadi Bay point the platform already uses for Makadi departures.
  'Makadi Bay': { lat: 26.959788860058374, lng: 33.87428453424781 },
  'Sahl Hasheesh': { lat: 27.0333, lng: 33.8833 },
};

/** Words that must never reach customer copy: emoji, template names and internal vocabulary. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{2714}\u{2728}]/u;
const FOREIGN_BRANDS = /Hurghada Safari Tours|Safari Sahara|Makadi Excursions/i;
const PROCESS_MARKERS = /\b(seed|preview|placeholder|TODO|lorem|QA|staging|internal)\b/i;

function customerCopy(tour: GrandRockTour): string {
  return JSON.stringify({
    title: tour.title,
    shortDescription: tour.shortDescription,
    description: tour.description,
    highlights: tour.highlights,
    itinerary: tour.itinerary,
    inclusions: tour.inclusions,
    exclusions: tour.exclusions,
    whatToBring: tour.whatToBring,
    needToKnow: tour.needToKnow,
    accessibility: tour.accessibility,
    participantRequirements: tour.participantRequirements,
    pricingOptions: tour.pricingOptions.map((option) => ({ name: option.name, description: option.description })),
    seo: tour.seo,
  });
}

export function isApprovedSourceAsset(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:'
      && (parsed.hostname === 'grandrocksafari.com' || parsed.hostname === 'www.grandrocksafari.com')
      && parsed.pathname.startsWith('/wp-content/uploads/')
      && !parsed.search
      && !parsed.hash;
  } catch {
    return false;
  }
}

export function validateGrandRockPlan(): string[] {
  const errors: string[] = [];
  if (GRAND_ROCK_TOURS.length !== 9) errors.push('Catalogue must contain exactly the nine published source tours.');
  if (!isApprovedSourceAsset(GRAND_ROCK_SOURCE_LOGO)) errors.push('Logo must come from the operator media library.');
  if (GRAND_ROCK_HERO_SOURCES.length < 3) errors.push('At least three hero images are required.');
  for (const url of GRAND_ROCK_HERO_SOURCES) if (!isApprovedSourceAsset(url)) errors.push(`Unapproved hero image: ${url}`);

  const slugs = new Set<string>();
  for (const tour of GRAND_ROCK_TOURS) {
    const id = tour.slug;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tour.slug)) errors.push(`Invalid slug: ${id}`);
    if (slugs.has(tour.slug)) errors.push(`Duplicate slug: ${id}`);
    slugs.add(tour.slug);
    if (!tour.sourceUrl.startsWith(`${SOURCE_ORIGIN}/tours/`)) errors.push(`Source page is not an operator tour page: ${id}`);
    if (tour.sourceImages.length < 3) errors.push(`Fewer than three images: ${id}`);
    for (const url of tour.sourceImages) if (!isApprovedSourceAsset(url)) errors.push(`Unapproved image: ${id} ${url}`);
    if (new Set(tour.sourceImages).size !== tour.sourceImages.length) errors.push(`Duplicate image: ${id}`);

    if (!tour.pricingOptions.length) errors.push(`Missing pricing options: ${id}`);
    for (const option of tour.pricingOptions) {
      if (!(option.price > 0)) errors.push(`Price must be positive: ${id}/${option.id}`);
      if (option.originalPrice !== undefined && option.originalPrice <= option.price) errors.push(`Crossed-out price must exceed the price: ${id}/${option.id}`);
      if (option.minParticipants < 1 || option.minParticipants > option.maxParticipants) errors.push(`Invalid participant bounds: ${id}/${option.id}`);
    }

    if (tour.shortDescription.length < 90 || tour.shortDescription.length > 220) errors.push(`Summary length out of range: ${id}`);
    if (tour.description.length < 400) errors.push(`Description is too thin: ${id}`);
    if (tour.highlights.length < 4) errors.push(`Fewer than four highlights: ${id}`);
    if (tour.itinerary.length < 4) errors.push(`Itinerary has fewer than four steps: ${id}`);
    if (tour.inclusions.length < 3) errors.push(`Fewer than three inclusions: ${id}`);
    if (!tour.exclusions.length) errors.push(`Missing exclusions: ${id}`);
    if (tour.needToKnow.length < 4 || !tour.needToKnow.some((item) => item.includes('?'))) errors.push(`Need-to-know needs at least four notes with a question: ${id}`);
    if (!tour.accessibility.length) errors.push(`Missing suitability note: ${id}`);
    if (tour.seo.metaDescription.length < 80 || tour.seo.metaDescription.length > 170) errors.push(`Search description length out of range: ${id}`);
    if (!tour.openDecisions.length) errors.push(`No open decision recorded: ${id}`);

    const copy = customerCopy(tour);
    if (EMOJI.test(copy)) errors.push(`Emoji reached customer copy: ${id}`);
    if (FOREIGN_BRANDS.test(copy)) errors.push(`Another business name reached customer copy: ${id}`);
    if (PROCESS_MARKERS.test(copy)) errors.push(`Internal vocabulary reached customer copy: ${id}`);
  }
  return errors;
}

export interface ExistingTourRecord {
  slug: string;
  /** True when the Grand Rock tenant already owns the record. */
  ownedByGrandRock: boolean;
  hasOwner: boolean;
  /** True when any tenant other than Grand Rock lists the record. */
  listedByOtherTenant: boolean;
}

/**
 * Returns why this run must not write, or null. A slug already used by any
 * other tenant is refused: on a first run there is no Grand Rock tenant yet,
 * so every existing owner is foreign.
 */
export function catalogueCollision(records: ExistingTourRecord[]): string | null {
  for (const record of records) {
    if ((record.hasOwner && !record.ownedByGrandRock) || record.listedByOtherTenant) {
      return `Refusing cross-tenant catalogue overwrite: ${record.slug}.`;
    }
    if (!record.hasOwner) return `Refusing to adopt an unowned catalogue record: ${record.slug}.`;
  }
  return null;
}

async function mirrorSourceImage(url: string, folder: string): Promise<string> {
  if (!isApprovedSourceAsset(url)) throw new Error(`Refusing non-allowlisted asset: ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error(`Source image returned ${response.status}: ${url}`);
    const mimeType = response.headers.get('content-type')?.split(';')[0] || '';
    if (!mimeType.startsWith('image/')) throw new Error(`Source asset is not an image: ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error(`Source image size is invalid: ${url}`);
    const { uploadBase64Image } = await import('../services/upload.service');
    const upload = await uploadBase64Image(`data:${mimeType};base64,${bytes.toString('base64')}`, folder);
    return upload.url;
  } finally {
    clearTimeout(timeout);
  }
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function loadExisting() {
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const existingTenant = await Tenant.findOne({ slug: TENANT_SLUG }).select('+previewAccessCode +previewAccessCodeUpdatedAt');
  const namespaceConflict = await Tenant.findOne({
    _id: { $ne: existingTenant?._id },
    $or: [{ domain: GRAND_ROCK_TENANT.domain }, { customDomain: CUSTOM_DOMAIN }, { slug: TENANT_SLUG }],
  }).select('_id slug');
  const existingTours = await Attraction.find({ slug: { $in: GRAND_ROCK_TOURS.map((tour) => tour.slug) } })
    .select('_id slug ownerTenantId tenantIds images status')
    .lean();
  const collision = catalogueCollision(existingTours.map((record) => ({
    slug: record.slug,
    ownedByGrandRock: Boolean(existingTenant && record.ownerTenantId && String(record.ownerTenantId) === String(existingTenant._id)),
    hasOwner: Boolean(record.ownerTenantId),
    listedByOtherTenant: (record.tenantIds || []).some((id: unknown) => !existingTenant || String(id) !== String(existingTenant._id)),
  })));
  return { existingTenant, namespaceConflict, existingTours, collision };
}

async function checkPlan(): Promise<void> {
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  await connectDatabase();
  try {
    const { existingTenant, namespaceConflict, existingTours, collision } = await loadExisting();
    console.log(JSON.stringify({
      mode: 'check',
      tenant: existingTenant ? { action: 'update', status: existingTenant.status, designMode: existingTenant.designMode } : { action: 'create' },
      namespaceConflict: namespaceConflict ? namespaceConflict.slug : null,
      existingTourSlugs: existingTours.map((record) => record.slug),
      collision,
      writes: 'none',
    }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

async function applyPlan(): Promise<void> {
  if (!process.argv.includes(`--confirm-domain=${CUSTOM_DOMAIN}`)) {
    throw new Error(`Apply fence missing. Pass --confirm-domain=${CUSTOM_DOMAIN}.`);
  }
  const codeOut = argValue('preview-code-out');
  if (!codeOut) throw new Error('Pass --preview-code-out=<file outside the repository> to receive the preview access code.');

  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const { generatePreviewAccessCode } = await import('../utils/hash');
  const { urlNamespaceReadiness } = await import('../plugins/urlNamespace');

  // The catalogue claims public addresses, which the namespace guard refuses
  // while writes are paused. Fail before the first write so the run either
  // does all of its work or none of it.
  if (!urlNamespaceReadiness().writesReady) {
    throw new Error('URL namespace writes are paused in this environment. Nothing was written.');
  }

  await connectDatabase();
  try {
    const { existingTenant, namespaceConflict, existingTours, collision } = await loadExisting();
    if (existingTenant && !['active', 'coming_soon', 'pending'].includes(existingTenant.status)) {
      throw new Error(`Refusing to change a tenant in protected status: ${existingTenant.status}.`);
    }
    if (existingTenant?.domainMigrated) throw new Error('Tenant already serves its own domain. Refusing a launch-package rewrite.');
    if (namespaceConflict) throw new Error(`Grand Rock Safari namespace is already owned by another tenant: ${namespaceConflict.slug}.`);
    if (collision) throw new Error(collision);

    console.log(JSON.stringify({
      mode: 'pre-apply-report',
      tenant: existingTenant ? { action: 'update', status: existingTenant.status } : { action: 'create', slug: TENANT_SLUG },
      customDomain: { value: CUSTOM_DOMAIN, status: 'unconfigured', migrated: false, dnsChanged: false },
      catalogue: GRAND_ROCK_TOURS.map((tour) => ({
        slug: tour.slug,
        path: `${LISTING_PATH}/${tour.slug}`,
        action: existingTours.some((record) => record.slug === tour.slug) ? 'update' : 'create',
        priceFrom: Math.min(...tour.pricingOptions.map((option) => option.price)),
        images: tour.sourceImages.length,
      })),
    }, null, 2));

    // Images first: a failed upload leaves the database untouched.
    const logo = existingTenant?.logo?.includes('res.cloudinary.com')
      ? existingTenant.logo
      : await mirrorSourceImage(GRAND_ROCK_SOURCE_LOGO, `tenant-logos/${TENANT_SLUG}`);
    const heroImages = existingTenant?.heroImages?.length && existingTenant.heroImages.every((url: string) => url.includes('res.cloudinary.com'))
      ? existingTenant.heroImages
      : await Promise.all(GRAND_ROCK_HERO_SOURCES.map((url, index) => mirrorSourceImage(url, `tenant-heroes/${TENANT_SLUG}/${index + 1}`)));
    const tourImages = new Map<string, string[]>();
    for (const tour of GRAND_ROCK_TOURS) {
      const existing = existingTours.find((record) => record.slug === tour.slug)?.images as string[] | undefined;
      tourImages.set(tour.slug, existing?.length === tour.sourceImages.length && existing.every((url) => url.includes('res.cloudinary.com'))
        ? existing
        : await Promise.all(tour.sourceImages.map((url) => mirrorSourceImage(url, `tours/${TENANT_SLUG}/${tour.slug}`))));
    }

    const previewAccessCode = existingTenant?.previewAccessCode || generatePreviewAccessCode();
    const previewAccessCodeUpdatedAt = existingTenant?.previewAccessCodeUpdatedAt || new Date();
    const tenant = await Tenant.findOneAndUpdate(
      { slug: TENANT_SLUG },
      {
        $set: {
          ...GRAND_ROCK_TENANT,
          logo,
          logoDark: logo,
          favicon: logo,
          heroImages,
          previewAccessCode,
          previewAccessCodeUpdatedAt,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    fs.writeFileSync(codeOut, `${previewAccessCode}\n`, { mode: 0o600 });

    for (const [index, tour] of GRAND_ROCK_TOURS.entries()) {
      const priceFrom = Math.min(...tour.pricingOptions.map((option) => option.price));
      await Attraction.findOneAndUpdate(
        { slug: tour.slug },
        {
          $set: {
            slug: tour.slug,
            pathSlug: tour.slug,
            parentPage: { label: 'Safaris', path: LISTING_PATH },
            title: tour.title,
            shortDescription: tour.shortDescription,
            description: tour.description,
            images: tourImages.get(tour.slug),
            category: tour.category,
            destination: { city: tour.city, country: 'Egypt', coordinates: CITY_COORDINATES[tour.city] },
            duration: tour.duration,
            languages: GUIDE_LANGUAGES,
            rating: 0,
            reviewCount: 0,
            priceFrom,
            currency: 'EUR',
            pricingOptions: tour.pricingOptions,
            addons: [],
            entryWindows: [],
            itinerary: tour.itinerary,
            participantRequirements: tour.participantRequirements,
            highlights: tour.highlights,
            inclusions: tour.inclusions,
            exclusions: tour.exclusions,
            whatToBring: tour.whatToBring,
            needToKnow: tour.needToKnow,
            accessibility: tour.accessibility,
            gettingThere: [{ mode: 'Hotel pickup', description: 'Give your hotel name when you book; the team confirms the pickup time.' }],
            meetingPoint: { address: tour.city, instructions: 'Pickup from your hotel. The confirmed pickup time appears on your booking confirmation.', mapUrl: '' },
            instantConfirmation: false,
            mobileTicket: true,
            hasHotelPickup: true,
            availability: { type: 'date-only', advanceBooking: 365 },
            seo: tour.seo,
            tenantIds: [tenant._id],
            ownerTenantId: tenant._id,
            reseller: { enabled: false, value: 0, allowedTenants: [] },
            enquiryOnly: false,
            status: 'active',
            featured: index < 6,
            sortOrder: index + 1,
          },
          // No cancellation terms are published by the operator yet; never carry one over.
          $unset: { cancellationPolicy: 1, badges: 1 },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
    }

    const owned = await Attraction.countDocuments({ ownerTenantId: tenant._id, status: 'active', slug: { $in: GRAND_ROCK_TOURS.map((tour) => tour.slug) } });
    const foreignListed = await Attraction.countDocuments({ tenantIds: tenant._id, ownerTenantId: { $ne: tenant._id } });
    if (owned !== GRAND_ROCK_TOURS.length || foreignListed !== 0) {
      throw new Error(`Post-apply check failed (owned=${owned}, foreignListed=${foreignListed}).`);
    }

    console.log(JSON.stringify({
      mode: 'applied',
      tenant: { slug: tenant.slug, status: tenant.status, designMode: tenant.designMode, domainMigrated: tenant.domainMigrated, customDomainStatus: tenant.customDomainStatus },
      catalogue: { active: owned, foreignListed },
      safeguards: [
        'preview access code written to the requested file only, never printed',
        'booking alerts routed to the platform QA inbox',
        'no DNS, domain alias, admin account, notification or deployment change',
      ],
    }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

export async function main(): Promise<void> {
  const errors = validateGrandRockPlan();
  if (errors.length) throw new Error(`Seed plan is invalid:\n- ${errors.join('\n- ')}`);

  if (process.argv.includes('--check')) return checkPlan();
  if (process.argv.includes('--apply')) return applyPlan();

  console.log(JSON.stringify({
    mode: 'dry-run',
    tenant: { slug: TENANT_SLUG, designMode: GRAND_ROCK_TENANT.designMode, status: GRAND_ROCK_TENANT.status, customDomain: CUSTOM_DOMAIN, domainMigrated: false },
    catalogue: GRAND_ROCK_TOURS.map((tour) => ({
      path: `${LISTING_PATH}/${tour.slug}`,
      title: tour.title,
      city: tour.city,
      prices: tour.pricingOptions.map((option) => `${option.price} EUR ${option.pricingModel}`),
      images: tour.sourceImages.length,
    })),
    safeguards: ['no database connection', 'no asset upload', 'no DNS or deployment', 'no notification'],
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[grand-rock-safari] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
