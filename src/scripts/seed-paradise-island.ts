/**
 * Paradise Island Hurghada tenant and catalogue package.
 *
 * Paradise Island is one of two beach venues Queen Magi Corp. operates on Big
 * Giftun, off Hurghada. This package builds the booking site for that venue
 * only: the two Paradise products on the operator's live catalogue, the six
 * island facilities the venue published itself, and the recovered photography
 * that belongs to it.
 *
 * Every fact comes from a publication of the operator's own: the live
 * queenmagicorp.com catalogue (prices, durations, product names), and genuine
 * Internet Archive snapshots of the venue's former site at
 * paradiseislandhurghada.com (facilities, marina, island detail). Marketplace
 * listings supplied departure times, durations and what is included — facts
 * only, never wording. Nothing the operator has not published is added, and
 * every unconfirmed point is recorded in `openDecisions` (internal only).
 *
 * The sibling venue has its own tenant and its own package. The two must never
 * read as interchangeable: a Paradise ticket does not admit to the other
 * venue. `validateParadiseIslandPlan()` refuses any customer copy that names
 * the other venue, and every tour slug carries the `paradise-` prefix so the
 * two catalogues can never collide on the global slug index.
 *
 * The site previews on the shared demo origin behind its access code. No
 * custom domain is claimed: the operator lost paradiseislandhurghada.com and
 * the replacement is undecided, so it is recorded as an open decision rather
 * than guessed at.
 *
 * Dry run (no database or upload):
 *   npm run seed:paradise-island
 * Read-only collision check against the target database:
 *   npm run seed:paradise-island -- --check
 * Apply:
 *   npm run seed:paradise-island -- --apply --confirm-tenant=paradise-island-hurghada --preview-code-out=<file outside git>
 */

import crypto from 'crypto';
import fs from 'fs';

type PricingModel = 'per-person' | 'per-booking';

interface SeedOption {
  id: string;
  name: string;
  description: string;
  price: number;
  pricingModel: PricingModel;
  minParticipants: number;
  maxParticipants: number;
  /** Set only where the operator publishes a child fare for this product. */
  childPrice?: number;
}

interface ItineraryStep {
  time: string;
  duration?: string;
  title: string;
  description: string;
}

interface EntryWindow {
  label: string;
  startTime: string;
  endTime?: string;
}

export interface ParadiseTour {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: 'Island Cruises' | 'Speedboat Trips';
  duration: string;
  pricingOptions: SeedOption[];
  /** Published departure times. Empty where the operator publishes none. */
  entryWindows: EntryWindow[];
  /** True only where the product itself says the transfer is included. */
  hasHotelPickup: boolean;
  /** Guide languages only where a publication states them. */
  languages: string[];
  highlights: string[];
  itinerary: ItineraryStep[];
  inclusions: string[];
  exclusions: string[];
  whatToBring: string[];
  needToKnow: string[];
  accessibility: string[];
  participantRequirements: string[];
  /** Operator publications this record was built from. Provenance; never rendered. */
  sourceUrls: string[];
  /** Allowlisted client-owned imagery, in display order. */
  sourceImages: string[];
  seo: { metaTitle: string; metaDescription: string; keywords: string[] };
  /** Internal-only questions for the operator before launch. Never rendered. */
  openDecisions: string[];
}

export interface ParadiseFacilityPage {
  slug: string;
  title: string;
  heroDescription: string;
  body: string;
  heroImage: string;
  heroImageAlt: string;
  metaTitle: string;
  metaDescription: string;
  sourceUrl: string;
}

const TENANT_SLUG = 'paradise-island-hurghada';
const LISTING_PATH = '/experiences';
const FACILITIES_SLUG = 'facilities';
const VENUE_PREFIX = 'paradise-';

/** The operator's live shop. Prices, product names and durations come from here. */
const CATALOGUE_SOURCE = 'https://www.queenmagicorp.com/tours';
/** Corporate media library; the only place a usable brand asset exists today. */
const CORPORATE_IMAGE_BASE = 'https://www.queenmagicorp.com/web/image/';
/** The venue's former site, readable only through genuine archive snapshots. */
const ARCHIVE_SOURCE_HOST = 'https://www.paradiseislandhurghada.com';
/**
 * Marketplace listings for this operator. Used for departure times, durations
 * and inclusion lists only; no wording, imagery, rating or review is imported.
 */
const MARKETPLACE_CRUISE_SOURCE =
  'https://www.getyourguide.com/hurghada-l403/from-hurghada-paradise-island-snorkeling-cruise-with-lunch-t464623/';
const MARKETPLACE_DOLPHIN_SOURCE =
  'https://www.getyourguide.com/hurghada-l403/from-hurghada-paradise-island-speedboat-tour-with-dolphins-t1026191/';

/** Booking alerts stay with the platform inbox until the operator confirms a reservations address. */
const LAUNCH_BOOKING_INBOX = 'theegyptexcursionsonline@gmail.com';

/**
 * Raw archive replay: `id_` returns the stored bytes with no archive banner and
 * no redirect. Each URL below was fetched on 2026-09-30 and returned HTTP 200
 * with an `image/*` content type and zero redirects.
 */
const archive = (timestamp: string, path: string): string =>
  `https://web.archive.org/web/${timestamp}id_/${ARCHIVE_SOURCE_HOST}${path}`;

const IMG = {
  beachHero: archive('20231031104912', '/wp-content/uploads/Assets/Paradise-Island-beach-Hurghada-C.jpg'),
  beach1: archive('20231031104206', '/wp-content/uploads/Assets/Paradise-Island-beach-Hurghada-v1.jpg'),
  beach2: archive('20231102011636', '/wp-content/uploads/Assets/Paradise-Island-beach-Hurghada-v2.jpg'),
  beach3: archive('20231031235224', '/wp-content/uploads/Assets/Paradise-Island-Beach-Hurghada-2.jpeg'),
  restaurantHero: archive('20231031104726', '/wp-content/uploads/Assets/Paradise-Island-Restaurant-C.jpg'),
  restaurant1: archive('20231031104734', '/wp-content/uploads/Assets/Paradise-Island-Hurghada-Restaurant-2.jpeg'),
  restaurant2: archive('20231031104725', '/wp-content/uploads/Assets/Paradise-Island-Restaurant-v-02.jpg'),
  tropicana1: archive('20231101045323', '/wp-content/uploads/Assets/Paradise-Island-Hurghada-Tropicana-Bar-v-01.jpg'),
  tropicana2: archive('20231101233519', '/wp-content/uploads/Assets/Tropicana-Bar-on-Paradise-Island-Hurghada-1.jpeg'),
  iceCream1: archive('20231031104754', '/wp-content/uploads/Assets/Paradise-Island-Hurghada-Ice-Ice-cream-and-waffles-zone-v-01.jpg'),
  iceCream2: archive('20231031235709', '/wp-content/uploads/Assets/Ice-cream-on-Paradise-Island-Hurghada-2.jpeg'),
  kids1: archive('20231031104801', '/wp-content/uploads/Assets/Paradise-Island-Hurghada-Kids-Area-v-02.jpg'),
  kids2: archive('20231031104757', '/wp-content/uploads/Assets/kids-area-of-Paradise-Island-Hurghada.jpeg'),
  shisha1: archive('20231101223118', '/wp-content/uploads/Assets/Paradise-Island-Hurghada-Shisha-Corner-v-01.jpg'),
  speedboat1: archive('20231031104702', '/wp-content/uploads/2023/04/Private-speed-boat-to-Paradise-Island-5-v2.webp'),
  aeon1: archive('20231031104634', '/wp-content/uploads/Paradise-Island-Hurghada-boats/Aeon-one/Aeon-1-Boat-by-Paradise-Island-Hurghada-1-v2.jpg'),
  aeon2: archive('20231031104804', '/wp-content/uploads/Paradise-Island-Hurghada-boats/Aeon-two/Aeon-2-Boat-by-Paradise-Island-Hurghada-v.jpg'),
  paradise2: archive('20231031104635', '/wp-content/uploads/Paradise-Island-Hurghada-boats/Paradise-Boat-two/Paradise-2-Boat-by-Paradise-Island-Hurghada-v.jpg'),
  islandPlan: archive('20231104231307', '/wp-content/uploads/Assets/Plan-of-Paradise-Island-Hurghada.jpg'),
  /** The only corporate photograph whose own signage names this venue. */
  islandSign: `${CORPORATE_IMAGE_BASE}5977-358421c9/PARADISE01.jpg`,
} as const;

/** No island wordmark exists in any recovered source; the corporate mark stands in. */
export const PARADISE_SOURCE_LOGO = `${CORPORATE_IMAGE_BASE}5612-3f1addb5/QUEENCO_LOGO.png`;

export const PARADISE_HERO_SOURCES: string[] = [IMG.beachHero, IMG.islandSign, IMG.beach1, IMG.restaurantHero];

/**
 * Areas the operator's published listings say guests are collected from, kept
 * to destinations that exist on the network. Safaga is also a published pickup
 * region but has no network destination, so it is left for the transfer-zone
 * work rather than guessed at here.
 */
export const PARADISE_PICKUP_DESTINATION_SLUGS = ['makadi-bay', 'sahl-hasheesh', 'el-gouna', 'soma-bay'];

export const PARADISE_TENANT = {
  slug: TENANT_SLUG,
  name: 'Paradise Island Hurghada',
  domain: 'paradise-island-hurghada.foxesnetwork.com',
  domainMigrated: false,
  customDomainStatus: 'unconfigured',
  tagline: 'A Red Sea island day from Hurghada',
  description:
    'Day trips to Paradise Island in the Giftun islands, with the beach, the island restaurant, guided snorkelling and a lunch included, sailing from Hurghada.',
  // Sand, reef teal and coral, the palette agreed for this venue.
  theme: { primaryColor: '#0B4F5C', secondaryColor: '#F2E7D5', accentColor: '#D96C4A' },
  fonts: { heading: 'Playfair Display', body: 'Inter' },
  designMode: 'paradise',
  defaultCurrency: 'EGP',
  defaultLanguage: 'en',
  supportedLanguages: ['en'],
  timezone: 'Africa/Cairo',
  contactInfo: {
    // Published by the operator. The island's former address is no longer reachable.
    email: 'admin@queenmagicorp.com',
    phone: '+20 107 099 7804',
    whatsapp: '+201070997804',
    address: 'Big Giftun Island, Hurghada, Red Sea, Egypt',
    supportHours: 'Every day',
  },
  socialLinks: { facebook: 'https://www.facebook.com/paradiseislandhurghada' },
  notificationSettings: { bookingEmail: LAUNCH_BOOKING_INBOX },
  pickupDestinationSlugs: PARADISE_PICKUP_DESTINATION_SLUGS,
  flatUrls: false,
  status: 'active',
  navigation: [
    { label: 'Home', href: '/' },
    { label: 'Experiences', href: LISTING_PATH },
    { label: 'Facilities', href: `/${FACILITIES_SLUG}` },
    { label: 'Destinations', href: '/destinations' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ],
  seoSettings: {
    metaTitle: 'Paradise Island Hurghada | Red Sea Island Day Trips',
    metaDescription:
      'Book a day on Paradise Island in the Giftun islands off Hurghada: beach, island restaurant, guided snorkelling and lunch, by yacht or speedboat.',
    keywords: ['Paradise Island Hurghada', 'Giftun island day trip', 'Hurghada island cruise', 'Red Sea snorkelling day'],
  },
  paymentSettings: { enabledGateways: ['pay-later'], ownPaymentGateway: false, stripe: { enabled: false } },
  bundleSettings: { mode: 'off', reason: 'The island launch package does not expose bundles.' },
  aiSettings: {
    bookingWidget: { enabled: false, position: 'bottom-right', languages: ['en'], autoOpen: false },
    voiceAgent: { enabled: false, languages: ['en'], buttonPosition: 'bottom-right' },
    searchWidget: {
      enabled: true,
      placeholder: 'Search island cruises, snorkelling and dolphin trips',
      showPopularSearches: true,
      maxSuggestions: 6,
    },
  },
} as const;

/** Repeated across both island products; each line traces to a published source. */
const ISLAND_BRING = [
  'Swimwear and a towel',
  'Sun cream, sunglasses and a sun hat',
  'Cash for anything you buy on the island',
];
const SEA_SUITABILITY = [
  'The crossing and the island are not suitable for guests with reduced mobility.',
  'Tell the team when you book about pregnancy, a medical condition or anything else that affects a day at sea.',
  'Children are welcome and must be accompanied by an adult for the whole day.',
];
const NOT_ALLOWED = ['Pets', 'Luggage or large bags'];
const TRANSFER_NOTE =
  'How do I get to the marina? The transfer is booked separately and priced by area. Ask for your area when you book and the team will confirm the pickup time.';
const PARK_FEE_NOTE =
  'Is the national park fee included? No. The Giftun national park fee is collected separately from the trip price.';

export const PARADISE_TOURS: ParadiseTour[] = [
  {
    slug: 'paradise-island-cruise-with-lunch-and-snorkelling',
    title: 'Paradise Island Cruise with Lunch, Massage and Snorkelling',
    shortDescription:
      'A seven-hour yacht day from Hurghada to Paradise Island, with a guided snorkelling stop, lunch on the island and a short massage on board.',
    description: [
      'Paradise Island sits in the Giftun islands off Hurghada, and this is the full day there. The yacht leaves the marina in the morning and sails out across the Red Sea, so the crossing itself is part of the trip rather than something to get through.',
      'The day on the island is the point. There is the beach, with the reef close enough in that the fish are visible from the sand, an open-buffet lunch in the island restaurant looking out over the marina, and enough free time that nobody is being moved along. A guided snorkelling stop with equipment is included, and a short massage is offered on board on the way.',
      'Your island entry ticket is part of the price, so there is nothing to pay at the landing. The transfer to the marina is arranged separately and priced by the area you are staying in.',
      'This ticket admits to Paradise Island. The operator runs a second beach venue on the same island with its own ticket, and the two are not interchangeable.',
    ].join('\n\n'),
    category: 'Island Cruises',
    duration: '7 hours',
    pricingOptions: [
      {
        id: 'standard',
        name: 'Per person',
        description: 'Price for each guest, including the island entry ticket.',
        price: 2100,
        pricingModel: 'per-person',
        minParticipants: 1,
        maxParticipants: 40,
      },
    ],
    entryWindows: [{ label: 'Morning departure', startTime: '09:30', endTime: '16:30' }],
    hasHotelPickup: false,
    languages: ['English'],
    highlights: [
      'A full day on Paradise Island in the Giftun islands',
      'Island entry ticket included in the price',
      'Guided snorkelling stop with equipment provided',
      'Open-buffet lunch and soft drinks in the island restaurant',
      'A short massage on board during the sail',
    ],
    itinerary: [
      { time: '09:30', title: 'Leave the marina', description: 'The yacht casts off from Hurghada and heads out towards the Giftun islands.' },
      { time: 'Crossing', duration: 'About 1 hour 30 minutes', title: 'Sail out', description: 'Open deck, open water and a safety briefing before you arrive.' },
      { time: 'Island', title: 'Land on Paradise Island', description: 'Your entry ticket is already covered, so you walk straight onto the beach.' },
      { time: 'Midday', title: 'Lunch in the island restaurant', description: 'An open buffet with soft drinks, with the marina and the sea in front of you.' },
      { time: 'Afternoon', title: 'Guided snorkelling and free time', description: 'A guided snorkelling stop with equipment, then the beach for as long as you like.' },
      { time: '16:30', title: 'Back in Hurghada', description: 'The yacht returns to the marina in the late afternoon.' },
    ],
    inclusions: [
      'Return yacht crossing from Hurghada',
      'Paradise Island entry ticket',
      'Guided snorkelling with mask, snorkel and fins',
      'Open-buffet lunch on the island',
      'Soft drinks',
      'A short massage on board',
      'Safety briefing and crew assistance',
    ],
    exclusions: [
      'Transfer between your hotel and the marina, priced separately by area',
      'Giftun national park fee',
      'Photographer and photo packages',
      'Anything you buy on the island',
    ],
    whatToBring: ISLAND_BRING,
    needToKnow: [
      'Which venue does this ticket admit to? Paradise Island. It does not admit to the operator’s other beach venue.',
      TRANSFER_NOTE,
      PARK_FEE_NOTE,
      'What language is the day run in? English.',
      `What cannot come on board? ${NOT_ALLOWED.join(', ').toLowerCase()}.`,
    ],
    accessibility: SEA_SUITABILITY,
    participantRequirements: [],
    sourceUrls: [CATALOGUE_SOURCE, MARKETPLACE_CRUISE_SOURCE, `${ARCHIVE_SOURCE_HOST}/`],
    sourceImages: [IMG.islandSign, IMG.beachHero, IMG.beach1, IMG.restaurantHero, IMG.aeon1],
    seo: {
      metaTitle: 'Paradise Island Cruise with Lunch and Snorkelling | Paradise Island Hurghada',
      metaDescription:
        'A seven-hour yacht day from Hurghada to Paradise Island with island entry, guided snorkelling, buffet lunch and a short massage on board.',
      keywords: ['Paradise Island cruise', 'Giftun island yacht day', 'Hurghada snorkelling cruise', 'Paradise Island lunch'],
    },
    openDecisions: [
      'Confirm whether a child fare applies to this product. The operator publishes child fares on some products and not on this one, so none is shown.',
      'Confirm the maximum guests per departure. Forty is used as the booking limit because that is the only group size any published listing gives.',
      'Confirm which marina the yacht leaves from. Published sources say a Hurghada marina without naming it, and older material named two different ones.',
      'Confirm whether the short massage runs on every departure of this product.',
      'Confirm the Giftun national park fee, who collects it and in which currency, so it can be shown before checkout rather than at the landing.',
      'Confirm the vessels that run this product. The photograph used is one of the named boats from the venue’s own former site and may be out of service.',
    ],
  },
  {
    slug: 'paradise-island-dolphin-experience-by-speedboat',
    title: 'Dolphin Experience to Paradise Island by Speedboat',
    shortDescription:
      'A four-hour speedboat run from Hurghada to Paradise Island, looking for wild dolphins on the way out and stopping at the island beach.',
    description: [
      'This is the fast version of the island day. A speedboat takes a small group out from Hurghada, and the run is routed so that the crew can look for the dolphins that live in these waters. They are wild animals, so nobody can promise you will see them, and the crew will tell you that before you book rather than after.',
      'The boat carries on to Paradise Island, where your entry ticket is included and the beach, the water and the reef are waiting. Four hours is enough for the island without the whole day being gone.',
      'Massage and water sports are part of the yacht day rather than this one, so what you get here is the speed, the dolphin run and the island itself.',
      'This ticket admits to Paradise Island. The operator runs a second beach venue on the same island with its own ticket, and the two are not interchangeable.',
    ].join('\n\n'),
    category: 'Speedboat Trips',
    duration: '4 hours',
    pricingOptions: [
      {
        id: 'standard',
        name: 'Per person',
        description: 'Price for each guest, including the island entry ticket.',
        price: 2950,
        pricingModel: 'per-person',
        minParticipants: 1,
        maxParticipants: 12,
      },
    ],
    entryWindows: [],
    hasHotelPickup: false,
    languages: [],
    highlights: [
      'A small-group speedboat run rather than a full-day yacht',
      'The route looks for wild dolphins on the way out',
      'Paradise Island entry ticket included',
      'Time on the island beach and in the water',
    ],
    itinerary: [
      { time: 'Marina', title: 'Meet the boat', description: 'Board the speedboat at the marina in Hurghada.' },
      { time: 'Out', title: 'The dolphin run', description: 'The crew takes the route where dolphins are most often seen, out in open water.' },
      { time: 'Island', title: 'Land on Paradise Island', description: 'Your entry ticket is covered, so you go straight onto the beach.' },
      { time: 'Beach', title: 'Time on the island', description: 'The beach, the shallows and the reef edge, with the boat waiting.' },
      { time: 'Return', title: 'Back to the marina', description: 'The speedboat runs back to Hurghada.' },
    ],
    inclusions: ['Return speedboat crossing from Hurghada', 'Paradise Island entry ticket', 'Life jackets', 'Captain and crew'],
    exclusions: [
      'Transfer between your hotel and the marina, priced separately by area',
      'Giftun national park fee',
      'Massage, which runs on the yacht day rather than this trip',
      'Water sports, which run on the yacht day rather than this trip',
      'Photographer and photo packages',
    ],
    whatToBring: ISLAND_BRING,
    needToKnow: [
      'Which venue does this ticket admit to? Paradise Island. It does not admit to the operator’s other beach venue.',
      'Will we definitely see dolphins? No. They are wild, the crew takes the route where they are seen most often, and some days they are not there.',
      TRANSFER_NOTE,
      PARK_FEE_NOTE,
      'Is lunch included? No. This is the four-hour trip; the buffet lunch belongs to the full-day cruise.',
    ],
    accessibility: [
      ...SEA_SUITABILITY,
      'A speedboat moves quickly and can be bumpy. Tell the crew before you board if that is a problem for you.',
    ],
    participantRequirements: [],
    sourceUrls: [CATALOGUE_SOURCE, MARKETPLACE_DOLPHIN_SOURCE],
    sourceImages: [IMG.speedboat1, IMG.beach2, IMG.beach3, IMG.paradise2],
    seo: {
      metaTitle: 'Dolphin Experience to Paradise Island by Speedboat | Paradise Island Hurghada',
      metaDescription:
        'A four-hour speedboat trip from Hurghada looking for wild dolphins, then time on Paradise Island with the entry ticket included.',
      keywords: ['Paradise Island dolphin trip', 'Hurghada speedboat dolphins', 'Giftun dolphin experience', 'Red Sea dolphin speedboat'],
    },
    openDecisions: [
      'Confirm the departure times for this product. The operator publishes 09:00, 13:00 and 16:00 for its speedboat trips generally but not for this one, so no departure is shown yet.',
      'Confirm whether a child fare applies to this product.',
      'Confirm the maximum guests per speedboat. Twelve is used as the booking limit and is not from a published source.',
      'Confirm the guide languages for this product. Nothing published states them, so none is shown.',
      'Confirm the Giftun national park fee and who collects it.',
      'Confirm whether lunch or a snack is served on this trip; no published source says either way.',
    ],
  },
];

export const PARADISE_FACILITY_PAGES: ParadiseFacilityPage[] = [
  {
    slug: 'paradise-beach',
    title: 'Paradise Beach',
    heroDescription: 'White sand, clear shallows and a reef close enough in that the fish are visible from where you are lying.',
    body: [
      'The beach is the reason most guests come. White sand, water clear enough to read the bottom through, and a reef that starts close enough to shore that you can see fish and coral without going far.',
      'It is a swimming beach, a snorkelling beach and a diving beach, and there is shade and somewhere to sit when the sun gets serious. Most of the day on the island happens here.',
    ].join('\n\n'),
    heroImage: IMG.beachHero,
    heroImageAlt: 'The white sand beach on Paradise Island with clear shallow water',
    metaTitle: 'Paradise Beach | Paradise Island Hurghada',
    metaDescription: 'The beach on Paradise Island: white sand, clear shallow water and a reef close to shore for swimming, snorkelling and diving.',
    sourceUrl: 'https://web.archive.org/web/20250425045147id_/https://www.paradiseislandhurghada.com/paradise-island-hurghada-services/paradise-beach/',
  },
  {
    slug: 'paradise-island-restaurant',
    title: 'Paradise Island Restaurant',
    heroDescription: 'Open-buffet dining on the island, with a run of seafood and a view over the marina and out to sea.',
    body: [
      'Lunch on the island is served as an open buffet, with a wide spread rather than a set plate, and a proper choice of seafood among it.',
      'The restaurant looks out over the marina, so you eat with the boats moving in front of you and the sea behind them. On the day trips that include lunch, this is where it is served.',
    ].join('\n\n'),
    heroImage: IMG.restaurantHero,
    heroImageAlt: 'The open-air island restaurant on Paradise Island looking over the marina',
    metaTitle: 'Paradise Island Restaurant | Paradise Island Hurghada',
    metaDescription: 'Open-buffet dining on Paradise Island with a seafood selection and a view over the marina and the Red Sea.',
    sourceUrl: 'https://web.archive.org/web/20251109042943id_/https://www.paradiseislandhurghada.com/paradise-island-hurghada-services/paradise-island-restaurant/',
  },
  {
    slug: 'tropicana-bar',
    title: 'Tropicana Bar',
    heroDescription: 'Tropical juices, cocktails and a long drinks list, open through the day.',
    body: [
      'More than a juice stand. The Tropicana Bar runs a long list of tropical juices and cocktails, and it is open through the day rather than at set hours.',
      'It sits within reach of the beach, which is the point: you do not have to leave the sand for long to get a drink.',
    ].join('\n\n'),
    heroImage: IMG.tropicana1,
    heroImageAlt: 'The Tropicana Bar on Paradise Island with tropical drinks on the counter',
    metaTitle: 'Tropicana Bar | Paradise Island Hurghada',
    metaDescription: 'The Tropicana Bar on Paradise Island: tropical juices, cocktails and a long drinks list, open through the day.',
    sourceUrl: 'https://web.archive.org/web/20251008104422id_/https://www.paradiseislandhurghada.com/paradise-island-hurghada-services/tropicana-bar/',
  },
  {
    slug: 'ice-cream-and-waffles-zone',
    title: 'Ice Cream and Waffles Zone',
    heroDescription: 'Ice cream, sundaes, milkshakes and waffles made fresh, a short walk from the beach.',
    body: [
      'A spot on the island for ice cream, and a wide enough range of flavours that it takes a minute to choose.',
      'Waffles are made fresh, and the counter also runs sundaes and milkshakes. It is the thing that keeps children happy for the last hour of a long beach day, and it is close enough to the sand that nobody has to walk far.',
    ].join('\n\n'),
    heroImage: IMG.iceCream1,
    heroImageAlt: 'The ice cream and waffles counter on Paradise Island',
    metaTitle: 'Ice Cream and Waffles Zone | Paradise Island Hurghada',
    metaDescription: 'Ice cream, sundaes, milkshakes and fresh waffles on Paradise Island, a short walk from the beach.',
    sourceUrl: 'https://web.archive.org/web/20251008100559id_/https://www.paradiseislandhurghada.com/paradise-island-hurghada-services/ice-cream-and-waffles-zone/',
  },
  {
    slug: 'kids-area',
    title: 'Kids Area',
    heroDescription: 'A play area built so that children have somewhere of their own and parents get to sit down.',
    body: [
      'A family day out only works if the children have somewhere to be. The island has a play area set aside for exactly that.',
      'It is designed so that parents can see what is happening without standing over it, which is the difference between a day at the beach and an afternoon of supervision.',
    ].join('\n\n'),
    heroImage: IMG.kids1,
    heroImageAlt: 'The children’s play area on Paradise Island',
    metaTitle: 'Kids Area | Paradise Island Hurghada',
    metaDescription: 'The play area on Paradise Island, set aside so children have somewhere of their own on a family beach day.',
    sourceUrl: 'https://web.archive.org/web/20251008104616id_/https://www.paradiseislandhurghada.com/paradise-island-hurghada-services/kids-area/',
  },
  {
    slug: 'shisha-corner',
    title: 'Shisha Corner',
    heroDescription: 'Shisha with a range of flavoured tobacco, and herbal hot drinks, in the shade.',
    body: [
      'The shisha corner is where the island slows down. A range of flavoured tobacco, herbal hot drinks, and shade to sit in while the afternoon goes by.',
      'It is a short walk from the beach and set up for sitting rather than passing through.',
    ].join('\n\n'),
    heroImage: IMG.shisha1,
    heroImageAlt: 'The shaded shisha corner on Paradise Island',
    metaTitle: 'Shisha Corner | Paradise Island Hurghada',
    metaDescription: 'The shisha corner on Paradise Island: flavoured tobacco, herbal hot drinks and shade, a short walk from the beach.',
    sourceUrl: 'https://web.archive.org/web/20250524055615id_/https://www.paradiseislandhurghada.com/paradise-island-hurghada-services/shisha-corner/',
  },
];

export const PARADISE_FACILITY_INDEX = {
  slug: FACILITIES_SLUG,
  title: 'Island Facilities',
  heroDescription: 'What is on the island: the beach, the restaurant, the bar, the ice cream counter, the kids area and the shisha corner.',
  heroImage: IMG.islandPlan,
  heroImageAlt: 'A plan drawing of Paradise Island showing where each facility sits',
  metaTitle: 'Island Facilities | Paradise Island Hurghada',
  metaDescription: 'Everything on Paradise Island: the beach, the island restaurant, the Tropicana Bar, the ice cream and waffles zone, the kids area and the shisha corner.',
} as const;

/**
 * Stable subdocument ids so the index page can link the facility pages without
 * a second write, and so a re-run updates the same pages rather than adding more.
 */
export function facilityPageId(slug: string): string {
  return crypto.createHash('sha256').update(`${TENANT_SLUG}:page:${slug}`).digest('hex').slice(0, 24);
}

/** Slugs the storefront already routes; a page here would never be reachable. */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  'about', 'accept-invitation', 'account', 'admin', 'adventures', 'api', 'attractions', 'auth', 'blog', 'booking',
  'bookings', 'bundle-orders', 'bundles', 'camel-treks', 'cart', 'categories', 'charters', 'checkout', 'contact',
  'cookies', 'cruises', 'dashboard', 'day-trips', 'deals', 'desert-safari', 'destinations', 'discover', 'dives',
  'dolphin-trips', 'evenings', 'excursions', 'experiences', 'faq', 'flights', 'forgot-password', 'heritage',
  'islands', 'jeep-tours', 'journeys', 'license', 'login', 'logout', 'luxury-cruises', 'makadi-adventures',
  'opening', 'orangebay', 'payment', 'payments', 'preview', 'preview-unlock', 'privacy', 'private-tours', 'profile',
  'reeftrips', 'refunds', 'register', 'reset-password', 'riding', 'robots', 'safaris', 'sailing', 'search', 'signup',
  'sitemap', 'snorkeling', 'submarines', 'terms', 'tours', 'trips', 'verify-email', 'water-activities',
  'water-sports', 'yachts',
]);

/** Words that must never reach customer copy: emoji, other businesses, internal vocabulary. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{2714}\u{2728}]/u;
const FOREIGN_BRANDS = /GetYourGuide|TripAdvisor|Wanderlog|Safari Red Sea|Orange Bay|Booking\.com/i;
/** The sibling venue must never be named in this site's customer copy. */
const SIBLING_VENUE = /hula/i;
const PROCESS_MARKERS = /\b(seed|preview|placeholder|TODO|lorem|QA|staging|internal|archive|wayback)\b/i;

function customerCopy(tour: ParadiseTour): string {
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
    entryWindows: tour.entryWindows,
    pricingOptions: tour.pricingOptions.map((option) => ({ name: option.name, description: option.description })),
    seo: tour.seo,
  });
}

function pageCopy(page: ParadiseFacilityPage): string {
  return JSON.stringify([page.title, page.heroDescription, page.body, page.heroImageAlt, page.metaTitle, page.metaDescription]);
}

/**
 * Client-owned imagery only: the operator's own media library, or a raw
 * Internet Archive replay of the venue's former site. The archive form is
 * pinned to `<14-digit timestamp>id_`, which returns the stored bytes with no
 * redirect and no archive chrome; any other archive form is refused.
 */
export function isApprovedSourceAsset(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.search || parsed.hash) return false;
    if (parsed.hostname === 'www.queenmagicorp.com') {
      return /^\/web\/image\/\d+-[0-9a-f]+\/[^/]+$/.test(parsed.pathname);
    }
    if (parsed.hostname === 'web.archive.org') {
      const match = /^\/web\/(\d{14})id_\/(https:\/\/www\.paradiseislandhurghada\.com\/wp-content\/uploads\/.+)$/
        .exec(decodeURIComponent(parsed.pathname));
      if (!match) return false;
      const original = new URL(match[2]);
      return original.protocol === 'https:'
        && original.hostname === 'www.paradiseislandhurghada.com'
        && original.pathname.startsWith('/wp-content/uploads/')
        && !original.search
        && !original.hash;
    }
    return false;
  } catch {
    return false;
  }
}

export function validateParadiseIslandPlan(): string[] {
  const errors: string[] = [];

  if (PARADISE_TENANT.designMode !== 'paradise') errors.push('The tenant must use the paradise design.');
  if (PARADISE_TENANT.defaultCurrency !== 'EGP') errors.push('The operator sells in EGP.');
  if (Object.prototype.hasOwnProperty.call(PARADISE_TENANT, 'customDomain')) {
    errors.push('No custom domain is decided; it must not be claimed here.');
  }
  if (PARADISE_TENANT.domainMigrated !== false) errors.push('The tenant must not be marked as serving its own domain.');
  if (PARADISE_TENANT.paymentSettings.enabledGateways.join() !== 'pay-later') errors.push('Only pay-later is enabled at launch.');
  if (PARADISE_TENANT.paymentSettings.stripe.enabled) errors.push('No card gateway is configured at launch.');
  if (PARADISE_TENANT.bundleSettings.mode !== 'off') errors.push('Bundles must stay off.');
  if (PARADISE_TENANT.notificationSettings.bookingEmail !== LAUNCH_BOOKING_INBOX) errors.push('Booking alerts must stay with the platform inbox.');
  for (const href of [LISTING_PATH, `/${FACILITIES_SLUG}`, '/destinations', '/about', '/contact']) {
    if (!PARADISE_TENANT.navigation.some((item) => item.href === href)) errors.push(`Navigation is missing ${href}.`);
  }
  if (!PARADISE_TENANT.aiSettings.searchWidget.placeholder.trim()) errors.push('The search placeholder must name the real trip types.');
  if (!isApprovedSourceAsset(PARADISE_SOURCE_LOGO)) errors.push('The logo must come from an allowlisted client source.');
  if (PARADISE_HERO_SOURCES.length < 3) errors.push('At least three hero images are required.');
  for (const url of PARADISE_HERO_SOURCES) if (!isApprovedSourceAsset(url)) errors.push(`Unapproved hero image: ${url}`);
  for (const slug of PARADISE_TENANT.pickupDestinationSlugs) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push(`Invalid pickup destination slug: ${slug}`);
  }
  if (new Set(PARADISE_TENANT.pickupDestinationSlugs).size !== PARADISE_TENANT.pickupDestinationSlugs.length) {
    errors.push('Duplicate pickup destination slug.');
  }

  const slugs = new Set<string>();
  for (const tour of PARADISE_TOURS) {
    const id = tour.slug;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tour.slug)) errors.push(`Invalid slug: ${id}`);
    if (!tour.slug.startsWith(VENUE_PREFIX)) errors.push(`Slug must carry the venue prefix so the two sites can never collide: ${id}`);
    if (slugs.has(tour.slug)) errors.push(`Duplicate slug: ${id}`);
    slugs.add(tour.slug);
    if (!tour.sourceUrls.length) errors.push(`No source recorded: ${id}`);

    // Real imagery exists for this venue, so every tour carries a full set.
    if (tour.sourceImages.length === 0) {
      if (!tour.openDecisions.some((item) => /photograph|image/i.test(item))) {
        errors.push(`No imagery and no open decision naming the gap: ${id}`);
      }
    } else if (tour.sourceImages.length < 3) {
      errors.push(`Fewer than three images: ${id}`);
    }
    for (const url of tour.sourceImages) if (!isApprovedSourceAsset(url)) errors.push(`Unapproved image: ${id} ${url}`);
    if (new Set(tour.sourceImages).size !== tour.sourceImages.length) errors.push(`Duplicate image: ${id}`);

    if (!tour.pricingOptions.length) errors.push(`Missing pricing options: ${id}`);
    for (const option of tour.pricingOptions) {
      if (!(option.price > 0)) errors.push(`Price must be positive: ${id}/${option.id}`);
      if (option.childPrice !== undefined && !(option.childPrice > 0 && option.childPrice < option.price)) {
        errors.push(`Child fare must be positive and below the adult fare: ${id}/${option.id}`);
      }
      if (option.minParticipants < 1 || option.minParticipants > option.maxParticipants) errors.push(`Invalid participant bounds: ${id}/${option.id}`);
      // No fare the operator has not published: an absent child fare is a question, not a silence.
      if (option.childPrice === undefined && !tour.openDecisions.some((item) => /child fare/i.test(item))) {
        errors.push(`No child fare and no open decision naming the gap: ${id}/${option.id}`);
      }
      if (Object.prototype.hasOwnProperty.call(option, 'infantPrice')) {
        errors.push(`No under-five allowance is published by the operator: ${id}/${option.id}`);
      }
    }

    for (const window of tour.entryWindows) {
      if (!/^\d{2}:\d{2}$/.test(window.startTime)) errors.push(`Departure time must be HH:MM: ${id}`);
      if (window.endTime && !/^\d{2}:\d{2}$/.test(window.endTime)) errors.push(`Return time must be HH:MM: ${id}`);
      if (!window.label.trim()) errors.push(`Departure needs a label: ${id}`);
    }
    if (!tour.entryWindows.length && !tour.openDecisions.some((item) => /departure/i.test(item))) {
      errors.push(`No departure times and no open decision naming the gap: ${id}`);
    }
    if (!tour.languages.length && !tour.openDecisions.some((item) => /language/i.test(item))) {
      errors.push(`No guide language and no open decision naming the gap: ${id}`);
    }

    if (tour.shortDescription.length < 90 || tour.shortDescription.length > 220) errors.push(`Summary length out of range: ${id}`);
    if (tour.description.length < 600) errors.push(`Description is too thin: ${id}`);
    if (tour.highlights.length < 4) errors.push(`Fewer than four highlights: ${id}`);
    if (tour.itinerary.length < 4) errors.push(`Itinerary has fewer than four steps: ${id}`);
    if (tour.inclusions.length < 3) errors.push(`Fewer than three inclusions: ${id}`);
    if (!tour.exclusions.length) errors.push(`Missing exclusions: ${id}`);
    if (tour.needToKnow.length < 4 || !tour.needToKnow.some((item) => item.includes('?'))) errors.push(`Need-to-know needs at least four notes with a question: ${id}`);
    if (!tour.accessibility.length) errors.push(`Missing suitability note: ${id}`);
    if (tour.seo.metaDescription.length < 80 || tour.seo.metaDescription.length > 170) errors.push(`Search description length out of range: ${id}`);
    if (!tour.openDecisions.length) errors.push(`No open decision recorded: ${id}`);
    // The two venues share an island and guests already confuse the tickets.
    if (!JSON.stringify([tour.description, tour.needToKnow]).includes('does not admit')) {
      errors.push(`Customer copy must say the ticket does not admit to the other venue: ${id}`);
    }

    const copy = customerCopy(tour);
    if (EMOJI.test(copy)) errors.push(`Emoji reached customer copy: ${id}`);
    if (FOREIGN_BRANDS.test(copy)) errors.push(`Another business name reached customer copy: ${id}`);
    if (SIBLING_VENUE.test(copy)) errors.push(`The other venue is named in customer copy: ${id}`);
    if (PROCESS_MARKERS.test(copy)) errors.push(`Internal vocabulary reached customer copy: ${id}`);
  }

  if (PARADISE_FACILITY_PAGES.length !== 6) errors.push('The venue published six island facilities; all six must ship.');
  const pageSlugs = new Set<string>([PARADISE_FACILITY_INDEX.slug]);
  if (RESERVED_PAGE_SLUGS.has(PARADISE_FACILITY_INDEX.slug)) errors.push(`Index page slug is reserved by the storefront: ${PARADISE_FACILITY_INDEX.slug}`);
  if (!isApprovedSourceAsset(PARADISE_FACILITY_INDEX.heroImage)) errors.push('Unapproved index page image.');
  for (const page of PARADISE_FACILITY_PAGES) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)) errors.push(`Invalid page slug: ${page.slug}`);
    if (RESERVED_PAGE_SLUGS.has(page.slug)) errors.push(`Page slug is reserved by the storefront: ${page.slug}`);
    if (pageSlugs.has(page.slug)) errors.push(`Duplicate page slug: ${page.slug}`);
    pageSlugs.add(page.slug);
    if (!isApprovedSourceAsset(page.heroImage)) errors.push(`Unapproved page image: ${page.slug}`);
    if (!page.sourceUrl.startsWith('https://web.archive.org/web/')) errors.push(`Facility page must cite the venue's own publication: ${page.slug}`);
    if (page.heroDescription.length < 60) errors.push(`Page summary is too thin: ${page.slug}`);
    if (page.body.length < 200) errors.push(`Page body is too thin: ${page.slug}`);
    if (!page.heroImageAlt.trim()) errors.push(`Page image needs a description: ${page.slug}`);
    if (page.metaDescription.length < 80 || page.metaDescription.length > 170) errors.push(`Page search description length out of range: ${page.slug}`);
    if (!/^[0-9a-f]{24}$/.test(facilityPageId(page.slug))) errors.push(`Page id is not a valid identifier: ${page.slug}`);

    const copy = pageCopy(page);
    if (EMOJI.test(copy)) errors.push(`Emoji reached page copy: ${page.slug}`);
    if (FOREIGN_BRANDS.test(copy)) errors.push(`Another business name reached page copy: ${page.slug}`);
    if (SIBLING_VENUE.test(copy)) errors.push(`The other venue is named in page copy: ${page.slug}`);
    if (PROCESS_MARKERS.test(copy)) errors.push(`Internal vocabulary reached page copy: ${page.slug}`);
  }

  // A site's pages and its tours share one public URL namespace: the namespace
  // guard checks a new page slug against that site's tours before it writes.
  const tourSlugs = new Set(PARADISE_TOURS.map((tour) => tour.slug));
  for (const page of [PARADISE_FACILITY_INDEX, ...PARADISE_FACILITY_PAGES]) {
    if (tourSlugs.has(page.slug)) errors.push(`Page slug collides with a tour on the same site: ${page.slug}`);
  }

  return errors;
}

/** A page image already on the tenant, which a re-run carries forward. */
export interface ExistingPageImage {
  slug: string;
  heroImage?: string;
  heroImageAlt?: string;
}

/**
 * The exact page set written to the tenant, built from a resolved image map so
 * the shape can be validated against the schema without touching a database.
 */
export function buildCustomPages(
  imageFor: (slug: string) => string | undefined,
  existing: ExistingPageImage[] = [],
): Record<string, unknown>[] {
  // The recovered photograph wins; anything a later image run added is kept.
  const resolve = (slug: string) => imageFor(slug) || existing.find((page) => page.slug === slug)?.heroImage;
  const facilityPages = PARADISE_FACILITY_PAGES.map((page, index) => ({
    _id: facilityPageId(page.slug),
    slug: page.slug,
    title: page.title,
    metaTitle: page.metaTitle,
    metaDescription: page.metaDescription,
    layoutMode: 'website',
    heroImage: resolve(page.slug),
    heroImageAlt: page.heroImageAlt,
    heroDescription: page.heroDescription,
    body: page.body,
    pageType: 'attraction',
    parentPath: `/${FACILITIES_SLUG}`,
    isPublished: true,
    status: 'active',
    sortOrder: index + 1,
  }));
  const indexPage = {
    _id: facilityPageId(PARADISE_FACILITY_INDEX.slug),
    slug: PARADISE_FACILITY_INDEX.slug,
    title: PARADISE_FACILITY_INDEX.title,
    metaTitle: PARADISE_FACILITY_INDEX.metaTitle,
    metaDescription: PARADISE_FACILITY_INDEX.metaDescription,
    layoutMode: 'website',
    heroImage: resolve(PARADISE_FACILITY_INDEX.slug),
    heroImageAlt: PARADISE_FACILITY_INDEX.heroImageAlt,
    heroDescription: PARADISE_FACILITY_INDEX.heroDescription,
    body: '',
    sections: [{
      id: 'island-facilities',
      type: 'pages',
      title: 'On the island',
      layout: 'vertical',
      pageIds: PARADISE_FACILITY_PAGES.map((page) => facilityPageId(page.slug)),
    }],
    pageType: 'category',
    parentPath: '/',
    isPublished: true,
    status: 'active',
    sortOrder: 0,
  };
  return [indexPage, ...facilityPages];
}

/** The exact catalogue record written for one tour. */
export function buildTourDocument(
  tour: ParadiseTour,
  index: number,
  images: string[],
  tenantId: unknown,
): Record<string, unknown> {
  return {
    slug: tour.slug,
    pathSlug: tour.slug,
    parentPage: { label: 'Experiences', path: LISTING_PATH },
    title: tour.title,
    shortDescription: tour.shortDescription,
    description: tour.description,
    images,
    category: tour.category,
    // Every crossing leaves from a Hurghada marina; the marina itself is unconfirmed.
    destination: { city: 'Hurghada', country: 'Egypt', coordinates: { lat: 27.2579, lng: 33.8116 } },
    duration: tour.duration,
    languages: tour.languages,
    rating: 0,
    reviewCount: 0,
    priceFrom: Math.min(...tour.pricingOptions.map((option) => option.price)),
    currency: 'EGP',
    pricingOptions: tour.pricingOptions,
    addons: [],
    entryWindows: tour.entryWindows,
    itinerary: tour.itinerary,
    participantRequirements: tour.participantRequirements,
    highlights: tour.highlights,
    inclusions: tour.inclusions,
    exclusions: tour.exclusions,
    whatToBring: tour.whatToBring,
    needToKnow: tour.needToKnow,
    accessibility: tour.accessibility,
    gettingThere: [{
      mode: 'Marina departure',
      description: 'The trip leaves from a marina in Hurghada. The transfer from your hotel is booked separately and priced by area.',
    }],
    meetingPoint: {
      address: 'Hurghada, Red Sea, Egypt',
      instructions: 'Your confirmed marina and boarding time appear on your booking confirmation.',
      mapUrl: '',
    },
    instantConfirmation: false,
    mobileTicket: true,
    hasHotelPickup: tour.hasHotelPickup,
    availability: { type: 'date-only', advanceBooking: 365 },
    seo: tour.seo,
    tenantIds: [tenantId],
    ownerTenantId: tenantId,
    reseller: { enabled: false, value: 0, allowedTenants: [] },
    enquiryOnly: false,
    status: 'active',
    featured: true,
    sortOrder: index + 1,
  };
}

export interface ExistingTourRecord {
  slug: string;
  ownedByParadise: boolean;
  hasOwner: boolean;
  listedByOtherTenant: boolean;
}

/**
 * Returns why this run must not write, or null. A slug already used by any
 * other tenant is refused: on a first run there is no tenant yet, so every
 * existing owner is foreign.
 */
export function catalogueCollision(records: ExistingTourRecord[]): string | null {
  for (const record of records) {
    if ((record.hasOwner && !record.ownedByParadise) || record.listedByOtherTenant) {
      return `Refusing cross-tenant catalogue overwrite: ${record.slug}.`;
    }
    if (!record.hasOwner) return `Refusing to adopt an unowned catalogue record: ${record.slug}.`;
  }
  return null;
}

async function mirrorSourceImage(url: string, folder: string): Promise<string> {
  if (!isApprovedSourceAsset(url)) throw new Error(`Refusing non-allowlisted asset: ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
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
    $or: [{ domain: PARADISE_TENANT.domain }, { slug: TENANT_SLUG }],
  }).select('_id slug');
  const existingTours = await Attraction.find({ slug: { $in: PARADISE_TOURS.map((tour) => tour.slug) } })
    .select('_id slug ownerTenantId tenantIds images status')
    .lean();
  const collision = catalogueCollision(existingTours.map((record) => ({
    slug: record.slug,
    ownedByParadise: Boolean(existingTenant && record.ownerTenantId && String(record.ownerTenantId) === String(existingTenant._id)),
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
      tenant: existingTenant
        ? { action: 'update', status: existingTenant.status, designMode: existingTenant.designMode }
        : { action: 'create', slug: TENANT_SLUG },
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
  if (!process.argv.includes(`--confirm-tenant=${TENANT_SLUG}`)) {
    throw new Error(`Apply fence missing. Pass --confirm-tenant=${TENANT_SLUG}.`);
  }
  const codeOut = argValue('preview-code-out');
  if (!codeOut) throw new Error('Pass --preview-code-out=<file outside the repository> to receive the access code.');

  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const { generatePreviewAccessCode } = await import('../utils/hash');
  const { urlNamespaceReadiness } = await import('../plugins/urlNamespace');

  // The catalogue and the facility pages claim public addresses, which the
  // namespace guard refuses while writes are paused. Fail before the first
  // write so the run either does all of its work or none of it.
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
    if (namespaceConflict) throw new Error(`The namespace is already owned by another tenant: ${namespaceConflict.slug}.`);
    if (collision) throw new Error(collision);

    console.log(JSON.stringify({
      mode: 'pre-apply-report',
      tenant: existingTenant ? { action: 'update', status: existingTenant.status } : { action: 'create', slug: TENANT_SLUG },
      customDomain: { value: null, reason: 'undecided; recorded as an open decision' },
      catalogue: PARADISE_TOURS.map((tour) => ({
        slug: tour.slug,
        path: `${LISTING_PATH}/${tour.slug}`,
        action: existingTours.some((record) => record.slug === tour.slug) ? 'update' : 'create',
        priceFrom: Math.min(...tour.pricingOptions.map((option) => option.price)),
        images: tour.sourceImages.length,
      })),
      pages: [PARADISE_FACILITY_INDEX.slug, ...PARADISE_FACILITY_PAGES.map((page) => page.slug)],
    }, null, 2));

    // Images first: a failed upload leaves the database untouched.
    const mirrored = new Map<string, string>();
    const mirror = async (url: string, folder: string): Promise<string> => {
      const hit = mirrored.get(url);
      if (hit) return hit;
      const uploaded = await mirrorSourceImage(url, folder);
      mirrored.set(url, uploaded);
      return uploaded;
    };

    const logo = existingTenant?.logo?.includes('res.cloudinary.com')
      ? existingTenant.logo
      : await mirrorSourceImage(PARADISE_SOURCE_LOGO, `tenant-logos/${TENANT_SLUG}`);
    const heroImages = existingTenant?.heroImages?.length && existingTenant.heroImages.every((url: string) => url.includes('res.cloudinary.com'))
      ? existingTenant.heroImages
      : await Promise.all(PARADISE_HERO_SOURCES.map((url, index) => mirror(url, `tenant-heroes/${TENANT_SLUG}/${index + 1}`)));

    const tourImages = new Map<string, string[]>();
    for (const tour of PARADISE_TOURS) {
      const existing = existingTours.find((record) => record.slug === tour.slug)?.images as string[] | undefined;
      tourImages.set(tour.slug, existing?.length === tour.sourceImages.length && existing.every((url) => url.includes('res.cloudinary.com'))
        ? existing
        : await Promise.all(tour.sourceImages.map((url) => mirror(url, `tours/${TENANT_SLUG}/${tour.slug}`))));
    }

    const pageImages = new Map<string, string>();
    for (const page of [PARADISE_FACILITY_INDEX, ...PARADISE_FACILITY_PAGES]) {
      pageImages.set(page.slug, await mirror(page.heroImage, `pages/${TENANT_SLUG}/${page.slug}`));
    }

    const customPages = buildCustomPages(
      (slug) => pageImages.get(slug),
      (existingTenant?.customPages || []).map((page) => ({
        slug: page.slug,
        heroImage: page.heroImage,
        heroImageAlt: page.heroImageAlt,
      })),
    );

    const previewAccessCode = existingTenant?.previewAccessCode || generatePreviewAccessCode();
    const previewAccessCodeUpdatedAt = existingTenant?.previewAccessCodeUpdatedAt || new Date();
    const tenant = await Tenant.findOneAndUpdate(
      { slug: TENANT_SLUG },
      {
        $set: {
          ...PARADISE_TENANT,
          logo,
          logoDark: logo,
          favicon: logo,
          heroImages,
          customPages,
          previewAccessCode,
          previewAccessCodeUpdatedAt,
        },
        // No custom domain is decided for this venue; never carry one over.
        $unset: { customDomain: 1 },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    fs.writeFileSync(codeOut, `${previewAccessCode}\n`, { mode: 0o600 });

    for (const [index, tour] of PARADISE_TOURS.entries()) {
      await Attraction.findOneAndUpdate(
        { slug: tour.slug },
        {
          $set: buildTourDocument(tour, index, tourImages.get(tour.slug) || [], tenant._id),
          // The operator has not published a cancellation policy for these products.
          $unset: { cancellationPolicy: 1, badges: 1 },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
    }

    const owned = await Attraction.countDocuments({
      ownerTenantId: tenant._id,
      status: 'active',
      slug: { $in: PARADISE_TOURS.map((tour) => tour.slug) },
    });
    const foreignListed = await Attraction.countDocuments({ tenantIds: tenant._id, ownerTenantId: { $ne: tenant._id } });
    if (owned !== PARADISE_TOURS.length || foreignListed !== 0) {
      throw new Error(`Post-apply check failed (owned=${owned}, foreignListed=${foreignListed}).`);
    }

    console.log(JSON.stringify({
      mode: 'applied',
      tenant: {
        slug: tenant.slug,
        status: tenant.status,
        designMode: tenant.designMode,
        domainMigrated: tenant.domainMigrated,
        customDomain: tenant.customDomain ?? null,
        pages: tenant.customPages?.length ?? 0,
      },
      catalogue: { active: owned, foreignListed },
      safeguards: [
        'access code written to the requested file only, never printed',
        'booking alerts routed to the platform inbox',
        'no DNS, domain alias, admin account, notification or deployment change',
      ],
    }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

export async function main(): Promise<void> {
  const errors = validateParadiseIslandPlan();
  if (errors.length) throw new Error(`Seed plan is invalid:\n- ${errors.join('\n- ')}`);

  if (process.argv.includes('--check')) return checkPlan();
  if (process.argv.includes('--apply')) return applyPlan();

  console.log(JSON.stringify({
    mode: 'dry-run',
    tenant: {
      slug: TENANT_SLUG,
      designMode: PARADISE_TENANT.designMode,
      status: PARADISE_TENANT.status,
      currency: PARADISE_TENANT.defaultCurrency,
      customDomain: null,
      domainMigrated: false,
      pickupAreas: PARADISE_TENANT.pickupDestinationSlugs,
      heroImages: PARADISE_HERO_SOURCES.length,
    },
    catalogue: PARADISE_TOURS.map((tour) => ({
      path: `${LISTING_PATH}/${tour.slug}`,
      title: tour.title,
      price: `${tour.pricingOptions.map((option) => option.price).join('/')} EGP ${tour.pricingOptions[0].pricingModel}`,
      departures: tour.entryWindows.map((window) => window.startTime),
      hotelPickup: tour.hasHotelPickup,
      images: tour.sourceImages.length,
      openDecisions: tour.openDecisions.length,
    })),
    pages: [PARADISE_FACILITY_INDEX, ...PARADISE_FACILITY_PAGES].map((page) => `/${page.slug}`),
    safeguards: ['no database connection', 'no asset upload', 'no DNS or deployment', 'no notification'],
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[paradise-island] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
