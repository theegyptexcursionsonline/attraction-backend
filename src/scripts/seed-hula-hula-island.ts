/**
 * Hula Hula Island tenant and catalogue package.
 *
 * Hula Hula is one of two beach venues Queen Magi Corp. operates on Big
 * Giftun, off Hurghada. This package builds the booking site for that venue
 * only: the nine Hula Hula products on the operator's live catalogue and the
 * short list of facilities its own publications confirm.
 *
 * Every fact comes from a publication of the operator's own: the live
 * queenmagicorp.com catalogue (product names, prices, durations, child fares)
 * and the venue's own Facebook About page (location, contact, channels).
 * Marketplace listings supplied departure times, durations and what is
 * included — facts only, never wording. Nothing the operator has not published
 * is added, and every unconfirmed point is recorded in `openDecisions`
 * (internal only).
 *
 * Photography is the known gap. Almost no usable Hula Hula imagery exists:
 * two frames the operator itself files under this venue's name are mirrored as
 * site headers, and every tour and facility ships without a photograph until
 * either the operator supplies one or the generated-image plan fills it. That
 * gap is recorded rather than papered over with a picture of somewhere else.
 *
 * The sibling venue has its own tenant and its own package. The two must never
 * read as interchangeable: a Hula Hula ticket does not admit to the other
 * venue. `validateHulaHulaIslandPlan()` refuses any customer copy that names
 * the other venue, and every tour slug carries the `hula-hula-` prefix so the
 * two catalogues can never collide on the global slug index.
 *
 * Dry run (no database or upload):
 *   npm run seed:hula-hula-island
 * Read-only collision check against the target database:
 *   npm run seed:hula-hula-island -- --check
 * Apply:
 *   npm run seed:hula-hula-island -- --apply --confirm-tenant=hula-hula-island --preview-code-out=<file outside git>
 */

import crypto from 'crypto';
import fs from 'fs';
import { departureAvailabilityType } from '../utils/departureAvailability';

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

export interface HulaHulaTour {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: 'Beach Days' | 'Island Cruises' | 'Speedboat Trips' | 'Semi-Submarine';
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
  /** Allowlisted client-owned imagery, in display order. Empty where none exists. */
  sourceImages: string[];
  seo: { metaTitle: string; metaDescription: string; keywords: string[] };
  /** Internal-only questions for the operator before launch. Never rendered. */
  openDecisions: string[];
}

export interface HulaHulaFacilityPage {
  slug: string;
  title: string;
  heroDescription: string;
  body: string;
  /** Empty until the operator supplies a photograph of this venue. */
  heroImage: string;
  heroImageAlt: string;
  metaTitle: string;
  metaDescription: string;
  sourceUrl: string;
}

const TENANT_SLUG = 'hula-hula-island';
const LISTING_PATH = '/experiences';
const FACILITIES_SLUG = 'facilities';
const VENUE_PREFIX = 'hula-hula-';

/** The operator's live shop. Prices, product names and durations come from here. */
const CATALOGUE_SOURCE = 'https://www.queenmagicorp.com/tours';
/** Corporate media library; the only place a usable client-owned asset exists today. */
const CORPORATE_IMAGE_BASE = 'https://www.queenmagicorp.com/web/image/';
/** The venue's own page: location, contact channels and languages. */
const VENUE_ABOUT_SOURCE = 'https://www.facebook.com/hulahulabeachisland/about';
/**
 * Marketplace listing for this operator's Hula Hula cruise. Used for departure
 * times, durations and inclusion lists only; no wording, imagery, rating or
 * review is imported.
 */
const MARKETPLACE_CRUISE_SOURCE =
  'https://www.getyourguide.com/hurghada-l403/hurghada-hula-hula-cruise-with-lunch-massage-snorkeling-t610985/';
const MARKETPLACE_SPEEDBOAT_SOURCE =
  'https://www.getyourguide.com/hurghada-l403/hurghada-hula-hula-speedboat-w-optional-snorkeling-lunch-t741086/';

/** Booking alerts stay with the platform inbox until the operator confirms a reservations address. */
const LAUNCH_BOOKING_INBOX = 'theegyptexcursionsonline@gmail.com';

/**
 * The only two images the operator files under this venue's own name. Both are
 * atmospheric water frames with no venue marking, which is exactly why they can
 * carry a site header without asserting anything about which beach they show.
 * A third corporate file names both venues at once and is deliberately left out.
 */
export const HULA_HULA_HERO_SOURCES: string[] = [
  `${CORPORATE_IMAGE_BASE}5980-473d1497/hulapp.jpg`,
  `${CORPORATE_IMAGE_BASE}5981-efa4558d/Hula%20P.jpg`,
];

/** No island wordmark exists in any published source; the corporate mark stands in. */
export const HULA_HULA_SOURCE_LOGO = `${CORPORATE_IMAGE_BASE}5612-3f1addb5/QUEENCO_LOGO.png`;

/**
 * Areas the operator's published listings say guests are collected from, kept
 * to destinations that exist on the network. Safaga is also a published pickup
 * region but has no network destination, so it is left for the transfer-zone
 * work rather than guessed at here.
 */
export const HULA_HULA_PICKUP_DESTINATION_SLUGS = ['makadi-bay', 'sahl-hasheesh', 'el-gouna', 'soma-bay'];

/** Questions that belong to the package as a whole rather than one product. */
export const HULA_HULA_OPEN_DECISIONS: string[] = [
  'No photograph of this venue exists in any source we can use. Two water frames the operator files under this venue’s name carry the site header; every tour and facility page ships without an image. Supply a photograph set, or approve the generated illustration plan, before this site is shown to guests.',
  'A third corporate image file names both venues at once. It is left out of both sites rather than assigned to a guess. Confirm which venue it shows.',
  'No wordmark exists for this venue. The corporate mark is standing in; commission the island wordmark before launch.',
  'No custom domain is decided for this venue. hulahulaisland.com resolves to a registrar parking page today; confirm which domain this site launches on.',
  'Confirm the reservations inbox. Booking alerts currently go to the platform inbox, not to the operator.',
  'Confirm the booking languages. The venue’s own page lists English and Arabic; the site ships in English only until the Arabic copy is written.',
  'Confirm the transfer zones and what each costs. Transfers appear as a separate line on the operator’s own shop, so no transfer price is shown on any product here.',
  'Confirm the Giftun national park fee, who collects it and in which currency, so it can be shown before checkout rather than at the landing.',
  'Confirm the cancellation policy. Nothing the operator publishes states one, so none is shown.',
  'One product on the live shop is priced at zero. It belongs to the sibling venue and is left out of both sites until the price is fixed.',
];

export const HULA_HULA_TENANT = {
  slug: TENANT_SLUG,
  name: 'Hula Hula Island',
  domain: 'hula-hula-island.foxesnetwork.com',
  domainMigrated: false,
  customDomainStatus: 'unconfigured',
  tagline: 'A beach day on the Red Sea',
  description:
    'Beach days and boat trips to Hula Hula Island in the Giftun islands off Hurghada: timed beach access, full-day cruises with lunch, speedboat runs and a semi-submarine trip.',
  // Near-black with an amber-to-rose warmth, the palette agreed for this venue.
  theme: { primaryColor: '#121014', secondaryColor: '#E8A33D', accentColor: '#D96A6A' },
  fonts: { heading: 'Playfair Display', body: 'Inter' },
  designMode: 'hulahula',
  defaultCurrency: 'EGP',
  defaultLanguage: 'en',
  supportedLanguages: ['en'],
  timezone: 'Africa/Cairo',
  contactInfo: {
    // Published on the venue's own page.
    email: 'admin@queenmagicorp.com',
    phone: '+20 10 70997763',
    whatsapp: '+201070997763',
    address: 'Big Giftun Island, Hurghada, Red Sea, Egypt, 84517',
    supportHours: 'Every day',
  },
  socialLinks: {
    facebook: 'https://www.facebook.com/hulahulabeachisland',
    instagram: 'https://www.instagram.com/hulahulabeachisland',
    youtube: 'https://www.youtube.com/@HulaHulaBeachIsland',
  },
  notificationSettings: { bookingEmail: LAUNCH_BOOKING_INBOX },
  pickupDestinationSlugs: HULA_HULA_PICKUP_DESTINATION_SLUGS,
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
    metaTitle: 'Hula Hula Island | Red Sea Beach Days from Hurghada',
    metaDescription:
      'Book Hula Hula Island: timed beach access, full-day cruises with lunch and snorkelling, morning and sunset speedboat runs, and a semi-submarine trip.',
    keywords: ['Hula Hula Island', 'Hurghada beach day', 'Giftun island cruise', 'Red Sea speedboat trip'],
  },
  paymentSettings: { enabledGateways: ['pay-later'], ownPaymentGateway: false, stripe: { enabled: false } },
  bundleSettings: { mode: 'off', reason: 'The island launch package does not expose bundles.' },
  aiSettings: {
    bookingWidget: { enabled: false, position: 'bottom-right', languages: ['en'], autoOpen: false },
    voiceAgent: { enabled: false, languages: ['en'], buttonPosition: 'bottom-right' },
    searchWidget: {
      enabled: true,
      placeholder: 'Search beach access, cruises, speedboat and semi-submarine trips',
      showPopularSearches: true,
      maxSuggestions: 6,
    },
  },
} as const;

const BEACH_BRING = [
  'Swimwear and a towel',
  'Sun cream, sunglasses and a sun hat',
  'Cash for anything you buy on the island',
];
const SEA_SUITABILITY = [
  'The crossing and the island are not suitable for guests with reduced mobility.',
  'Tell the team when you book about pregnancy, a medical condition or anything else that affects a day at sea.',
  'Children are welcome and must be accompanied by an adult for the whole day.',
];
const SPEEDBOAT_SUITABILITY = [
  ...SEA_SUITABILITY,
  'A speedboat moves quickly and can be bumpy. Tell the crew before you board if that is a problem for you.',
];
const VENUE_NOTE =
  'Which venue does this ticket admit to? Hula Hula Island. It does not admit to the operator’s other beach venue.';
const TRANSFER_NOTE =
  'How do I get to the marina? The transfer is booked separately and priced by area. Ask for your area when you book and the team will confirm the pickup time.';
const PARK_FEE_NOTE =
  'Is the national park fee included? No. The Giftun national park fee is collected separately from the trip price.';
const IMAGE_GAP_DECISION =
  'No photograph of this product exists in any source we can use. It ships without an image until the operator supplies one or the generated illustration plan is approved.';

const CRUISE_INCLUSIONS = [
  'Return crossing from Hurghada',
  'Hula Hula Island entry ticket',
  'Guided snorkelling with mask, snorkel and fins',
  'Lunch on the island',
  'Soft drinks',
  'Water sports on the day',
  'A short massage on board',
  'Safety briefing and crew assistance',
];
const CRUISE_EXCLUSIONS = [
  'Transfer between your hotel and the marina, priced separately by area',
  'Giftun national park fee',
  'Photographer and photo packages',
  'Anything you buy on the island',
];

export const HULA_HULA_TOURS: HulaHulaTour[] = [
  {
    slug: 'hula-hula-island-beach-access',
    title: 'Hula Hula Island Beach Access, Two Hours',
    shortDescription:
      'A two-hour beach ticket for Hula Hula Island in the Giftun islands off Hurghada. The entry only, for guests already coming out to the island.',
    description: [
      'This is the shortest way onto the island: a timed beach ticket, two hours, and nothing bundled around it. It is the ticket for guests who are already coming out to the Giftun islands and want the beach itself rather than a whole organised day.',
      'Hula Hula is a beach venue on Big Giftun, the larger and nearer of the two Giftun islands off Hurghada. What this ticket buys is entry: the sand, the shallows and the time on them.',
      'It does not include the boat out, a meal, or snorkelling equipment. Those belong to the full-day cruises and the speedboat trips, which are sold separately on this site. If you have not arranged a crossing, book one of those instead.',
      'This ticket admits to Hula Hula Island. The operator runs a second beach venue on the same island with its own ticket, and the two are not interchangeable.',
    ].join('\n\n'),
    category: 'Beach Days',
    duration: '2 hours',
    pricingOptions: [{
      id: 'standard',
      name: 'Per person',
      description: 'Beach entry for each guest, for a two-hour stay.',
      price: 560,
      pricingModel: 'per-person',
      minParticipants: 1,
      maxParticipants: 40,
    }],
    entryWindows: [],
    hasHotelPickup: false,
    languages: [],
    highlights: [
      'A timed beach ticket rather than a full organised day',
      'Entry to the island beach on Big Giftun',
      'The shortest and least expensive way onto the island',
      'For guests who have already arranged their crossing',
    ],
    itinerary: [
      { time: 'Arrival', title: 'Come ashore', description: 'Arrive at the island by your own arrangement and present your ticket.' },
      { time: 'On the beach', duration: '2 hours', title: 'Your two hours', description: 'The sand, the shallows and the time on them.' },
      { time: 'Swimming', title: 'The water', description: 'Clear shallow water off the beach on the southern shore of Big Giftun.' },
      { time: 'Departure', title: 'Leave the island', description: 'Your two hours end and you return the way you came.' },
    ],
    inclusions: ['Hula Hula Island beach entry', 'A two-hour stay on the island', 'Access to the beach and the shallows'],
    exclusions: [
      'The boat to and from the island',
      'Transfer between your hotel and the marina',
      'Giftun national park fee',
      'Food and drink',
      'Snorkelling equipment',
    ],
    whatToBring: BEACH_BRING,
    needToKnow: [
      VENUE_NOTE,
      'Does this include the boat? No. This is the island entry only. Book one of the cruises or speedboat trips if you need the crossing.',
      'How long is the stay? Two hours from when you come ashore.',
      PARK_FEE_NOTE,
      'Is lunch included? No. Food and drink on the island are paid for separately.',
    ],
    accessibility: SEA_SUITABILITY,
    participantRequirements: [],
    sourceUrls: [CATALOGUE_SOURCE, VENUE_ABOUT_SOURCE],
    sourceImages: [],
    seo: {
      metaTitle: 'Hula Hula Island Beach Access, Two Hours | Hula Hula Island',
      metaDescription:
        'A two-hour beach entry ticket for Hula Hula Island in the Giftun islands off Hurghada, for guests who have already arranged their crossing.',
      keywords: ['Hula Hula beach access', 'Giftun island beach ticket', 'Hurghada island day pass', 'Hula Hula entry'],
    },
    openDecisions: [
      IMAGE_GAP_DECISION,
      'The operator publishes two different beach-access products: a two-hour stay at 560 EGP on the live shop and a 1.5-hour stay at 650 EGP as a product record. Confirm which is current; the two-hour ticket is used here.',
      'Confirm what the beach ticket actually includes on the island. Nothing the operator publishes says whether a sunbed, shade or anything else comes with it.',
      'Confirm the daily hours this ticket is sold for, so departures can be offered instead of a date-only booking.',
      'Confirm whether a child fare applies to this product; none is published, so none is shown.',
      'Confirm the guide languages for this product. Nothing published states them, so none is shown.',
      'Confirm how guests holding this ticket are expected to reach the island, and whether the operator will sell it without a crossing at all.',
      'An unexplained second figure of 400 EGP appears alongside this product on the operator’s shop. Confirm what it is before anything is shown next to the price.',
    ],
  },
  {
    slug: 'hula-hula-island-cruise-with-lunch-and-snorkelling',
    title: 'Hula Hula Island Cruise with Lunch, Massage, Snorkelling and Transfers',
    shortDescription:
      'A seven-hour yacht day to Hula Hula Island with the hotel transfer included, plus guided snorkelling, lunch on the island and water sports.',
    description: [
      'This is the full day, and the only product on this site with the transfer built into the price. You are collected from your hotel, taken to the marina in Hurghada, and the yacht sails out to the Giftun islands from there.',
      'The island is the middle of the day: the beach, the water and lunch, with enough time that the day does not feel like a schedule. A guided snorkelling stop with equipment is included, water sports run on the day, and a short massage is offered on board during the sail.',
      'Your island entry ticket is part of the price, so there is nothing to pay when you come ashore. The yacht leaves in the morning and is back at the marina in the late afternoon, and the transfer takes you home from there.',
      'A child fare applies to this product at half the adult price. This ticket admits to Hula Hula Island. The operator runs a second beach venue on the same island with its own ticket, and the two are not interchangeable.',
    ].join('\n\n'),
    category: 'Island Cruises',
    duration: '7 hours',
    pricingOptions: [{
      id: 'standard',
      name: 'Per person',
      description: 'Price for each guest, including the island entry ticket and the hotel transfer.',
      price: 1570,
      childPrice: 785,
      pricingModel: 'per-person',
      minParticipants: 1,
      maxParticipants: 40,
    }],
    entryWindows: [{ label: 'Morning departure', startTime: '09:30', endTime: '16:30' }],
    hasHotelPickup: true,
    languages: ['English'],
    highlights: [
      'Hotel transfer included, unlike the rest of the catalogue',
      'A full day on Hula Hula Island with the entry ticket covered',
      'Guided snorkelling with equipment provided',
      'Lunch and soft drinks on the island',
      'Water sports on the day and a short massage on board',
    ],
    itinerary: [
      { time: 'Morning', title: 'Hotel pickup', description: 'You are collected from your hotel and taken to the marina in Hurghada.' },
      { time: '09:30', title: 'Leave the marina', description: 'The yacht casts off and heads out towards the Giftun islands.' },
      { time: 'Crossing', duration: 'About 1 hour 30 minutes', title: 'Sail out', description: 'Open deck, open water, and a safety briefing before you arrive.' },
      { time: 'Island', title: 'Come ashore', description: 'Your entry ticket is already covered, so you walk straight onto the beach.' },
      { time: 'Midday', title: 'Lunch and the beach', description: 'Lunch with soft drinks, then the sand and the shallows.' },
      { time: 'Afternoon', title: 'Snorkelling and water sports', description: 'A guided snorkelling stop with equipment, and the water sports that run on the day.' },
      { time: '16:30', title: 'Back in Hurghada', description: 'The yacht returns to the marina and the transfer takes you to your hotel.' },
    ],
    inclusions: ['Hotel pickup and drop-off', ...CRUISE_INCLUSIONS],
    exclusions: CRUISE_EXCLUSIONS.slice(1),
    whatToBring: BEACH_BRING,
    needToKnow: [
      VENUE_NOTE,
      'Is the transfer included? Yes. On this product the hotel pickup and drop-off are part of the price.',
      'Is there a child fare? Yes. Children pay half the adult price on this product.',
      PARK_FEE_NOTE,
      'What language is the day run in? English.',
    ],
    accessibility: SEA_SUITABILITY,
    participantRequirements: [],
    sourceUrls: [CATALOGUE_SOURCE, MARKETPLACE_CRUISE_SOURCE, VENUE_ABOUT_SOURCE],
    sourceImages: [],
    seo: {
      metaTitle: 'Hula Hula Island Cruise with Lunch and Transfers | Hula Hula Island',
      metaDescription:
        'A seven-hour yacht day to Hula Hula Island with the hotel transfer included, guided snorkelling, lunch on the island and water sports.',
      keywords: ['Hula Hula cruise', 'Giftun island yacht day', 'Hurghada snorkelling cruise', 'Hula Hula with transfers'],
    },
    openDecisions: [
      IMAGE_GAP_DECISION,
      'Confirm the child age band. The operator publishes a child fare at half the adult price but never says which ages it covers.',
      'Confirm whether under-fives travel free. Only resellers say so; the operator does not, so nothing is shown.',
      'Confirm which areas the included transfer covers, and what guests outside those areas pay.',
      'Confirm the maximum guests per departure. Forty is used as the booking limit because that is the only group size any published listing gives.',
      'Confirm which marina the yacht leaves from; published sources say a Hurghada marina without naming it.',
      'Confirm that the short massage and the water sports run on every departure of this product.',
    ],
  },
  {
    slug: 'hula-hula-island-sunset-cruise-with-lunch-and-snorkelling',
    title: 'Hula Hula Island Sunset Cruise with Lunch, Massage and Snorkelling',
    shortDescription:
      'The same seven-hour yacht day to Hula Hula Island shifted into the afternoon, sailing back as the light goes and the sea turns.',
    description: [
      'The same day as the morning cruise, moved two hours later so that the return leg happens in the best light of the day. The yacht leaves the marina towards midday and sails out to the Giftun islands.',
      'On the island there is the beach, the water and lunch, with a guided snorkelling stop and equipment included, and water sports running on the day. A short massage is offered on board during the sail.',
      'The difference is the way home. You leave the island in the late afternoon and come back across the Red Sea with the sun going down behind Hurghada, which is a materially different trip from the same route at midday.',
      'Your island entry ticket is part of the price. A child fare applies at half the adult price. This ticket admits to Hula Hula Island. The operator runs a second beach venue on the same island with its own ticket, and the two are not interchangeable.',
    ].join('\n\n'),
    category: 'Island Cruises',
    duration: '7 hours',
    pricingOptions: [{
      id: 'standard',
      name: 'Per person',
      description: 'Price for each guest, including the island entry ticket.',
      price: 1570,
      childPrice: 785,
      pricingModel: 'per-person',
      minParticipants: 1,
      maxParticipants: 40,
    }],
    entryWindows: [{ label: 'Midday departure', startTime: '11:30', endTime: '17:30' }],
    hasHotelPickup: false,
    languages: [],
    highlights: [
      'The island day shifted into the afternoon',
      'The return leg runs as the light goes',
      'Guided snorkelling with equipment provided',
      'Lunch and soft drinks on the island',
      'Water sports on the day and a short massage on board',
    ],
    itinerary: [
      { time: '11:30', title: 'Leave the marina', description: 'The yacht casts off from Hurghada towards midday.' },
      { time: 'Crossing', duration: 'About 1 hour 30 minutes', title: 'Sail out', description: 'Open water and a safety briefing on the way to the Giftun islands.' },
      { time: 'Island', title: 'Come ashore', description: 'Your entry ticket is covered, so you go straight onto the beach.' },
      { time: 'Afternoon', title: 'Lunch, snorkelling and water sports', description: 'Lunch with soft drinks, a guided snorkelling stop, and the water sports that run on the day.' },
      { time: 'Late afternoon', title: 'Sail back into the light', description: 'The return leg across the Red Sea as the sun goes down behind Hurghada.' },
      { time: '17:30', title: 'Back at the marina', description: 'The yacht returns to Hurghada.' },
    ],
    inclusions: CRUISE_INCLUSIONS,
    exclusions: CRUISE_EXCLUSIONS,
    whatToBring: BEACH_BRING,
    needToKnow: [
      VENUE_NOTE,
      'How is this different from the morning cruise? Same day, two hours later, so you sail home in the evening light.',
      'Is there a child fare? Yes. Children pay half the adult price on this product.',
      TRANSFER_NOTE,
      PARK_FEE_NOTE,
    ],
    accessibility: SEA_SUITABILITY,
    participantRequirements: [],
    sourceUrls: [CATALOGUE_SOURCE, MARKETPLACE_CRUISE_SOURCE],
    sourceImages: [],
    seo: {
      metaTitle: 'Hula Hula Island Sunset Cruise with Lunch | Hula Hula Island',
      metaDescription:
        'A seven-hour afternoon yacht day to Hula Hula Island with guided snorkelling, lunch on the island and the return leg in the evening light.',
      keywords: ['Hula Hula sunset cruise', 'Giftun sunset yacht', 'Hurghada evening cruise', 'Hula Hula afternoon trip'],
    },
    openDecisions: [
      IMAGE_GAP_DECISION,
      'Confirm the child age band for the half-price child fare.',
      'Confirm the guide languages for this product. Nothing published states them, so none is shown.',
      'Confirm the maximum guests per departure; forty is used as the booking limit.',
      'Confirm whether the sunset departure runs every day or only in certain months.',
    ],
  },
  {
    slug: 'hula-hula-island-semi-submarine',
    title: 'Hula Hula Island Semi-Submarine Day',
    shortDescription:
      'A seven-hour day to Hula Hula Island with a semi-submarine ride, for guests who want to see the reef without getting in the water.',
    description: [
      'A semi-submarine sits low in the water with windows below the surface, so you look straight out at the reef from a dry seat. It is the answer for anyone who wants to see what is down there without snorkelling for it: guests who do not swim, children, and anyone who simply would rather watch.',
      'The day runs to the Giftun islands and Hula Hula Island in the usual seven-hour shape, with the semi-submarine ride as the thing that makes it different. The island, the beach and the water are all still there.',
      'Your island entry ticket is part of the price. A child fare applies at half the adult price, which on a product built around watching rather than swimming is the one that tends to matter.',
      'This ticket admits to Hula Hula Island. The operator runs a second beach venue on the same island with its own ticket, and the two are not interchangeable.',
    ].join('\n\n'),
    category: 'Semi-Submarine',
    duration: '7 hours',
    pricingOptions: [{
      id: 'standard',
      name: 'Per person',
      description: 'Price for each guest, including the island entry ticket and the semi-submarine ride.',
      price: 1730,
      childPrice: 865,
      pricingModel: 'per-person',
      minParticipants: 1,
      maxParticipants: 40,
    }],
    entryWindows: [],
    hasHotelPickup: false,
    languages: [],
    highlights: [
      'See the reef from a dry seat below the waterline',
      'Works for guests who do not swim',
      'A full day on Hula Hula Island with the entry ticket covered',
      'A child fare at half the adult price',
    ],
    itinerary: [
      { time: 'Marina', title: 'Meet the boat', description: 'Board at the marina in Hurghada for the run out to the Giftun islands.' },
      { time: 'Crossing', title: 'Sail out', description: 'Out across the Red Sea towards Big Giftun.' },
      { time: 'Reef', title: 'The semi-submarine ride', description: 'Below the waterline behind the windows, looking straight out at the reef.' },
      { time: 'Island', title: 'Come ashore', description: 'Your entry ticket is covered, so you go straight onto the beach.' },
      { time: 'Afternoon', title: 'The island', description: 'The beach, the shallows and the rest of the day.' },
      { time: 'Return', title: 'Back to the marina', description: 'The boat returns to Hurghada.' },
    ],
    inclusions: ['Return crossing from Hurghada', 'Hula Hula Island entry ticket', 'The semi-submarine ride', 'Safety briefing and crew assistance'],
    exclusions: CRUISE_EXCLUSIONS,
    whatToBring: BEACH_BRING,
    needToKnow: [
      VENUE_NOTE,
      'Do I have to swim? No. The semi-submarine is the point of this trip: you see the reef from a seat.',
      'Is there a child fare? Yes. Children pay half the adult price on this product.',
      TRANSFER_NOTE,
      PARK_FEE_NOTE,
    ],
    accessibility: SEA_SUITABILITY,
    participantRequirements: [],
    sourceUrls: [CATALOGUE_SOURCE],
    sourceImages: [],
    seo: {
      metaTitle: 'Hula Hula Island Semi-Submarine Day | Hula Hula Island',
      metaDescription:
        'A seven-hour day to Hula Hula Island with a semi-submarine ride, for guests who want to see the Red Sea reef without getting in the water.',
      keywords: ['Hula Hula semi-submarine', 'Giftun glass boat', 'Hurghada reef without swimming', 'semi submarine Red Sea'],
    },
    openDecisions: [
      IMAGE_GAP_DECISION,
      'Confirm the departure times for this product; nothing the operator publishes states them, so no departure is shown.',
      'Confirm whether lunch and snorkelling are included on this product as they are on the cruises.',
      'Confirm the child age band for the half-price child fare.',
      'Confirm the guide languages for this product. Nothing published states them, so none is shown.',
      'Confirm the vessel and how long the semi-submarine ride itself lasts.',
    ],
  },
  {
    slug: 'hula-hula-island-speedboat-morning-escape',
    title: 'Hula Hula Island Speedboat Morning Escape',
    shortDescription:
      'A four-hour speedboat run to Hula Hula Island leaving at nine in the morning, for guests who want the island without the whole day.',
    description: [
      'Four hours, leaving at nine. This is the island without committing the whole day to it: a speedboat out from Hurghada, time on Hula Hula Island, and back before the afternoon is gone.',
      'A speedboat crosses to the Giftun islands considerably faster than a yacht, which is where the time saving comes from. You are on the island for the good part of the morning rather than watching the water go past.',
      'Your island entry ticket is part of the price, and the boat carries a small group rather than a full deck. Water sports run on the island day.',
      'This ticket admits to Hula Hula Island. The operator runs a second beach venue on the same island with its own ticket, and the two are not interchangeable.',
    ].join('\n\n'),
    category: 'Speedboat Trips',
    duration: '4 hours',
    pricingOptions: [{
      id: 'standard',
      name: 'Per person',
      description: 'Price for each guest, including the island entry ticket.',
      price: 2360,
      pricingModel: 'per-person',
      minParticipants: 1,
      maxParticipants: 12,
    }],
    entryWindows: [{ label: 'Morning departure', startTime: '09:00' }],
    hasHotelPickup: false,
    languages: [],
    highlights: [
      'A nine o’clock start and back by early afternoon',
      'A speedboat crossing rather than a full-day yacht',
      'Hula Hula Island entry ticket included',
      'Water sports on the island day',
    ],
    itinerary: [
      { time: '09:00', title: 'Leave the marina', description: 'Board the speedboat in Hurghada and head out.' },
      { time: 'Crossing', title: 'The fast run', description: 'Out to the Giftun islands at speed.' },
      { time: 'Island', title: 'Come ashore', description: 'Your entry ticket is covered, so you go straight onto the beach.' },
      { time: 'Beach', title: 'Time on the island', description: 'The sand, the shallows and the water sports that run on the day.' },
      { time: 'Return', title: 'Back to the marina', description: 'The speedboat runs back to Hurghada.' },
    ],
    inclusions: ['Return speedboat crossing from Hurghada', 'Hula Hula Island entry ticket', 'Water sports on the island day', 'Life jackets', 'Captain and crew'],
    exclusions: [
      'Transfer between your hotel and the marina, priced separately by area',
      'Giftun national park fee',
      'A massage, which runs on the yacht days rather than this trip',
      'Photographer and photo packages',
    ],
    whatToBring: BEACH_BRING,
    needToKnow: [
      VENUE_NOTE,
      'What time does it leave? Nine in the morning.',
      'Is lunch included? No. The buffet lunch belongs to the seven-hour cruises.',
      TRANSFER_NOTE,
      PARK_FEE_NOTE,
    ],
    accessibility: SPEEDBOAT_SUITABILITY,
    participantRequirements: [],
    sourceUrls: [CATALOGUE_SOURCE, MARKETPLACE_SPEEDBOAT_SOURCE],
    sourceImages: [],
    seo: {
      metaTitle: 'Hula Hula Island Speedboat Morning Escape | Hula Hula Island',
      metaDescription:
        'A four-hour speedboat run from Hurghada to Hula Hula Island leaving at nine in the morning, with the island entry ticket included.',
      keywords: ['Hula Hula speedboat morning', 'Giftun speedboat trip', 'Hurghada half day island', 'Hula Hula four hours'],
    },
    openDecisions: [
      IMAGE_GAP_DECISION,
      'The operator sells this as a four-hour trip and a marketplace listing sells the same run as three hours. Confirm which is current; four hours is used here.',
      'Confirm whether a child fare applies to this product; none is published, so none is shown.',
      'Confirm the maximum guests per speedboat. Twelve is used as the booking limit and is not from a published source.',
      'Confirm the guide languages for this product. Nothing published states them, so none is shown.',
      'Confirm whether snorkelling and equipment are included on the speedboat trips.',
    ],
  },
  {
    slug: 'hula-hula-island-speedboat-sunset',
    title: 'Hula Hula Island Speedboat Sunset',
    shortDescription:
      'A four-hour speedboat run to Hula Hula Island leaving at one in the afternoon, so the island time lands in the best light.',
    description: [
      'The same four-hour speedboat trip as the morning escape, leaving at one in the afternoon instead of nine in the morning. The run out is the same; what changes is the light you spend it in.',
      'An afternoon start puts your time on Hula Hula Island in the part of the day when the heat has come off and the water has gone from bright to deep, and it puts the return leg in the evening light over the Red Sea.',
      'Your island entry ticket is part of the price, and the boat carries a small group. Water sports run on the island day.',
      'This ticket admits to Hula Hula Island. The operator runs a second beach venue on the same island with its own ticket, and the two are not interchangeable.',
    ].join('\n\n'),
    category: 'Speedboat Trips',
    duration: '4 hours',
    pricingOptions: [{
      id: 'standard',
      name: 'Per person',
      description: 'Price for each guest, including the island entry ticket.',
      price: 2360,
      pricingModel: 'per-person',
      minParticipants: 1,
      maxParticipants: 12,
    }],
    entryWindows: [{ label: 'Afternoon departure', startTime: '13:00' }],
    hasHotelPickup: false,
    languages: [],
    highlights: [
      'A one o’clock start, so the island time lands late in the day',
      'A speedboat crossing rather than a full-day yacht',
      'Hula Hula Island entry ticket included',
      'The return leg runs in the evening light',
    ],
    itinerary: [
      { time: '13:00', title: 'Leave the marina', description: 'Board the speedboat in Hurghada and head out.' },
      { time: 'Crossing', title: 'The fast run', description: 'Out to the Giftun islands at speed.' },
      { time: 'Island', title: 'Come ashore', description: 'Your entry ticket is covered, so you go straight onto the beach.' },
      { time: 'Late afternoon', title: 'Time on the island', description: 'The beach as the heat comes off, and the water sports that run on the day.' },
      { time: 'Return', title: 'Back in the evening light', description: 'The speedboat runs back to Hurghada as the light goes.' },
    ],
    inclusions: ['Return speedboat crossing from Hurghada', 'Hula Hula Island entry ticket', 'Water sports on the island day', 'Life jackets', 'Captain and crew'],
    exclusions: [
      'Transfer between your hotel and the marina, priced separately by area',
      'Giftun national park fee',
      'A massage, which runs on the yacht days rather than this trip',
      'Photographer and photo packages',
    ],
    whatToBring: BEACH_BRING,
    needToKnow: [
      VENUE_NOTE,
      'What time does it leave? One in the afternoon.',
      'How is this different from the morning trip? Same run, four hours later, so the island time and the way home land in the evening light.',
      TRANSFER_NOTE,
      PARK_FEE_NOTE,
    ],
    accessibility: SPEEDBOAT_SUITABILITY,
    participantRequirements: [],
    sourceUrls: [CATALOGUE_SOURCE, MARKETPLACE_SPEEDBOAT_SOURCE],
    sourceImages: [],
    seo: {
      metaTitle: 'Hula Hula Island Speedboat Sunset | Hula Hula Island',
      metaDescription:
        'A four-hour speedboat run from Hurghada to Hula Hula Island leaving at one in the afternoon, with the island entry ticket included.',
      keywords: ['Hula Hula speedboat sunset', 'Giftun afternoon speedboat', 'Hurghada sunset boat trip', 'Hula Hula evening run'],
    },
    openDecisions: [
      IMAGE_GAP_DECISION,
      'The operator sells this as a four-hour trip and a marketplace listing sells the same run as three hours. Confirm which is current; four hours is used here.',
      'Confirm whether a child fare applies to this product; none is published, so none is shown.',
      'Confirm the maximum guests per speedboat. Twelve is used as the booking limit and is not from a published source.',
      'Confirm the guide languages for this product. Nothing published states them, so none is shown.',
      'Confirm how late this departure runs in winter, when the light goes earlier.',
    ],
  },
  {
    slug: 'hula-hula-island-dolphin-experience-by-speedboat',
    title: 'Dolphin Experience to Hula Hula Island by Speedboat',
    shortDescription:
      'A four-hour speedboat run to Hula Hula Island routed to look for the wild dolphins that live in these waters, then time on the island.',
    description: [
      'A speedboat run out from Hurghada, routed so that the crew can look for the dolphins that live in these waters. They are wild animals, so nobody can promise you will see them, and the crew will tell you that before you book rather than after.',
      'The boat carries on to Hula Hula Island, where your entry ticket is included and the beach and the shallows are waiting. Four hours is enough for the island and the dolphin run without the whole day going.',
      'Water sports run on the island day. The buffet lunch and the onboard massage belong to the seven-hour cruises rather than this trip.',
      'This ticket admits to Hula Hula Island. The operator runs a second beach venue on the same island with its own ticket, and the two are not interchangeable.',
    ].join('\n\n'),
    category: 'Speedboat Trips',
    duration: '4 hours',
    pricingOptions: [{
      id: 'standard',
      name: 'Per person',
      description: 'Price for each guest, including the island entry ticket.',
      price: 2880,
      pricingModel: 'per-person',
      minParticipants: 1,
      maxParticipants: 12,
    }],
    entryWindows: [],
    hasHotelPickup: false,
    languages: [],
    highlights: [
      'The route looks for wild dolphins on the way out',
      'A small-group speedboat rather than a full-day yacht',
      'Hula Hula Island entry ticket included',
      'Water sports on the island day',
    ],
    itinerary: [
      { time: 'Marina', title: 'Meet the boat', description: 'Board the speedboat at the marina in Hurghada.' },
      { time: 'Out', title: 'The dolphin run', description: 'The crew takes the route where dolphins are most often seen, out in open water.' },
      { time: 'Island', title: 'Come ashore', description: 'Your entry ticket is covered, so you go straight onto the beach.' },
      { time: 'Beach', title: 'Time on the island', description: 'The sand, the shallows and the water sports that run on the day.' },
      { time: 'Return', title: 'Back to the marina', description: 'The speedboat runs back to Hurghada.' },
    ],
    inclusions: ['Return speedboat crossing from Hurghada', 'Hula Hula Island entry ticket', 'Water sports on the island day', 'Life jackets', 'Captain and crew'],
    exclusions: [
      'Transfer between your hotel and the marina, priced separately by area',
      'Giftun national park fee',
      'A massage, which runs on the yacht days rather than this trip',
      'Photographer and photo packages',
    ],
    whatToBring: BEACH_BRING,
    needToKnow: [
      VENUE_NOTE,
      'Will we definitely see dolphins? No. They are wild, the crew takes the route where they are seen most often, and some days they are not there.',
      'Is lunch included? No. The buffet lunch belongs to the seven-hour cruises.',
      TRANSFER_NOTE,
      PARK_FEE_NOTE,
    ],
    accessibility: SPEEDBOAT_SUITABILITY,
    participantRequirements: [],
    sourceUrls: [CATALOGUE_SOURCE, MARKETPLACE_SPEEDBOAT_SOURCE],
    sourceImages: [],
    seo: {
      metaTitle: 'Dolphin Experience to Hula Hula Island by Speedboat | Hula Hula Island',
      metaDescription:
        'A four-hour speedboat trip from Hurghada looking for wild dolphins, then time on Hula Hula Island with the entry ticket included.',
      keywords: ['Hula Hula dolphin trip', 'Hurghada speedboat dolphins', 'Giftun dolphin experience', 'Red Sea dolphin speedboat'],
    },
    openDecisions: [
      IMAGE_GAP_DECISION,
      'Confirm the departure times for this product. The operator publishes 09:00, 13:00 and 16:00 for its speedboat trips generally but not for this one, so no departure is shown yet.',
      'Confirm whether a child fare applies to this product; none is published, so none is shown.',
      'Confirm the maximum guests per speedboat. Twelve is used as the booking limit and is not from a published source.',
      'Confirm the guide languages for this product. Nothing published states them, so none is shown.',
      'Confirm the wildlife-approach rules the crew works to, so they can be published rather than described in general terms.',
    ],
  },
  {
    slug: 'hula-hula-island-private-speedboat-morning',
    title: 'Private Speedboat to Hula Hula Island, Morning',
    shortDescription:
      'The whole speedboat for your group on a four-hour morning run to Hula Hula Island. One price for the boat, not for each guest.',
    description: [
      'This is the boat rather than a seat on it. One price covers the whole speedboat for four hours in the morning, so the group on board is the group you arrived with and nobody else.',
      'The run goes out from Hurghada to Hula Hula Island in the Giftun islands, and the island entry is included. Having the boat to yourselves changes how the day works: you are not waiting on anyone, and the crew answers to your group.',
      'Water sports run on the island day. The buffet lunch and the onboard massage belong to the seven-hour cruises rather than this trip.',
      'This ticket admits to Hula Hula Island. The operator runs a second beach venue on the same island with its own ticket, and the two are not interchangeable.',
    ].join('\n\n'),
    category: 'Speedboat Trips',
    duration: '4 hours',
    pricingOptions: [{
      id: 'private-boat',
      name: 'Private speedboat',
      description: 'The whole boat for your group, including island entry.',
      price: 15000,
      pricingModel: 'per-booking',
      minParticipants: 1,
      maxParticipants: 8,
    }],
    entryWindows: [],
    hasHotelPickup: false,
    languages: [],
    highlights: [
      'The whole speedboat for your group',
      'One price for the boat rather than for each guest',
      'Hula Hula Island entry included',
      'Water sports on the island day',
    ],
    itinerary: [
      { time: 'Marina', title: 'Meet your boat', description: 'Board your private speedboat at the marina in Hurghada.' },
      { time: 'Crossing', title: 'The run out', description: 'Out to the Giftun islands with only your group on board.' },
      { time: 'Island', title: 'Come ashore', description: 'Island entry is covered, so you go straight onto the beach.' },
      { time: 'Beach', title: 'Time on the island', description: 'The sand, the shallows and the water sports that run on the day.' },
      { time: 'Return', title: 'Back to the marina', description: 'Your boat runs back to Hurghada.' },
    ],
    inclusions: ['The private speedboat for four hours', 'Hula Hula Island entry', 'Water sports on the island day', 'Life jackets', 'Captain and crew'],
    exclusions: [
      'Transfer between your hotel and the marina, priced separately by area',
      'Giftun national park fee',
      'A massage, which runs on the yacht days rather than this trip',
      'Photographer and photo packages',
    ],
    whatToBring: BEACH_BRING,
    needToKnow: [
      VENUE_NOTE,
      'Is the price per person? No. It covers the whole boat for your group.',
      'Is lunch included? No. The buffet lunch belongs to the seven-hour cruises.',
      TRANSFER_NOTE,
      PARK_FEE_NOTE,
    ],
    accessibility: SPEEDBOAT_SUITABILITY,
    participantRequirements: [],
    sourceUrls: [CATALOGUE_SOURCE],
    sourceImages: [],
    seo: {
      metaTitle: 'Private Speedboat to Hula Hula Island, Morning | Hula Hula Island',
      metaDescription:
        'The whole speedboat for your group on a four-hour morning run from Hurghada to Hula Hula Island, with island entry included.',
      keywords: ['private speedboat Hurghada', 'Hula Hula private boat', 'Giftun private charter', 'whole boat Red Sea'],
    },
    openDecisions: [
      IMAGE_GAP_DECISION,
      'Confirm the morning departure time for the private boat. The shared morning run leaves at 09:00; nothing published states the private one, so no departure is shown.',
      'Confirm the maximum guests on the private speedboat. Eight is used as the booking limit and is not from a published source.',
      'Confirm whether a child fare applies on a whole-boat booking, or whether children simply count towards the boat limit; none is published, so none is shown.',
      'Confirm the duration. The operator titles this a four-hour trip but files it under a one-day product shape; four hours is used here.',
      'Confirm the guide languages for this product. Nothing published states them, so none is shown.',
      'Confirm whether the island entry for every guest is inside the boat price or charged per head on top.',
    ],
  },
  {
    slug: 'hula-hula-island-private-speedboat-sunset',
    title: 'Private Speedboat to Hula Hula Island, Sunset',
    shortDescription:
      'The whole speedboat for your group on a four-hour run leaving at one in the afternoon, so the island time and the way home run late.',
    description: [
      'The same private boat as the morning charter, leaving at one in the afternoon. One price covers the whole speedboat for four hours, so the group on board is yours and nobody else’s.',
      'An afternoon start puts your time on Hula Hula Island in the part of the day when the heat has come off, and it puts the run home over the Red Sea in the evening light. On a boat you have to yourselves, that is the version most groups are actually after.',
      'Island entry is included and water sports run on the island day. The buffet lunch and the onboard massage belong to the seven-hour cruises rather than this trip.',
      'This ticket admits to Hula Hula Island. The operator runs a second beach venue on the same island with its own ticket, and the two are not interchangeable.',
    ].join('\n\n'),
    category: 'Speedboat Trips',
    duration: '4 hours',
    pricingOptions: [{
      id: 'private-boat',
      name: 'Private speedboat',
      description: 'The whole boat for your group, including island entry.',
      price: 15000,
      pricingModel: 'per-booking',
      minParticipants: 1,
      maxParticipants: 8,
    }],
    entryWindows: [{ label: 'Afternoon departure', startTime: '13:00' }],
    hasHotelPickup: false,
    languages: [],
    highlights: [
      'The whole speedboat for your group',
      'A one o’clock start, so the day runs late',
      'The run home in the evening light',
      'Hula Hula Island entry included',
    ],
    itinerary: [
      { time: '13:00', title: 'Meet your boat', description: 'Board your private speedboat at the marina in Hurghada.' },
      { time: 'Crossing', title: 'The run out', description: 'Out to the Giftun islands with only your group on board.' },
      { time: 'Island', title: 'Come ashore', description: 'Island entry is covered, so you go straight onto the beach.' },
      { time: 'Late afternoon', title: 'Time on the island', description: 'The beach as the heat comes off, and the water sports that run on the day.' },
      { time: 'Return', title: 'Back in the evening light', description: 'Your boat runs back to Hurghada as the light goes.' },
    ],
    inclusions: ['The private speedboat for four hours', 'Hula Hula Island entry', 'Water sports on the island day', 'Life jackets', 'Captain and crew'],
    exclusions: [
      'Transfer between your hotel and the marina, priced separately by area',
      'Giftun national park fee',
      'A massage, which runs on the yacht days rather than this trip',
      'Photographer and photo packages',
    ],
    whatToBring: BEACH_BRING,
    needToKnow: [
      VENUE_NOTE,
      'Is the price per person? No. It covers the whole boat for your group.',
      'What time does it leave? One in the afternoon.',
      TRANSFER_NOTE,
      PARK_FEE_NOTE,
    ],
    accessibility: SPEEDBOAT_SUITABILITY,
    participantRequirements: [],
    sourceUrls: [CATALOGUE_SOURCE],
    sourceImages: [],
    seo: {
      metaTitle: 'Private Speedboat to Hula Hula Island, Sunset | Hula Hula Island',
      metaDescription:
        'The whole speedboat for your group on a four-hour afternoon run from Hurghada to Hula Hula Island, with island entry included.',
      keywords: ['private sunset speedboat', 'Hula Hula private charter', 'Giftun evening boat', 'Hurghada private boat hire'],
    },
    openDecisions: [
      IMAGE_GAP_DECISION,
      'Confirm the maximum guests on the private speedboat. Eight is used as the booking limit and is not from a published source.',
      'Confirm whether a child fare applies on a whole-boat booking, or whether children simply count towards the boat limit; none is published, so none is shown.',
      'Confirm the duration. The operator titles this a four-hour trip but files it under a one-day product shape; four hours is used here.',
      'Confirm the guide languages for this product. Nothing published states them, so none is shown.',
      'Confirm whether the island entry for every guest is inside the boat price or charged per head on top.',
      'Confirm how late this charter runs in winter, when the light goes earlier.',
    ],
  },
];

/**
 * Only the facilities the operator's own publications confirm. Everything else
 * reported about this venue comes from third parties and is not published here.
 */
export const HULA_HULA_FACILITY_PAGES: HulaHulaFacilityPage[] = [
  {
    slug: 'beach-access',
    title: 'The Beach',
    heroDescription: 'The beach on Big Giftun is what the island is for, and every ticket sold here includes entry to it.',
    body: [
      'Hula Hula is a beach venue on Big Giftun, the larger and nearer of the two Giftun islands off Hurghada. The beach is the whole proposition.',
      'Entry is a real ticket rather than an assumption: every trip on this site has the island entry built into its price, and there is a two-hour beach ticket sold on its own for guests who have already arranged a crossing.',
    ].join('\n\n'),
    heroImage: '',
    heroImageAlt: '',
    metaTitle: 'The Beach | Hula Hula Island',
    metaDescription: 'The beach on Hula Hula Island, on Big Giftun off Hurghada. Every ticket sold on this site includes entry to it.',
    sourceUrl: VENUE_ABOUT_SOURCE,
  },
  {
    slug: 'hula-hula-water-sports',
    title: 'Water Sports',
    heroDescription: 'Water sports run on every island day here, which is not true of every trip in these waters.',
    body: [
      'Water sports are part of the island day on every trip to Hula Hula, rather than an extra you find out about when you arrive and then pay for.',
      'That is a genuine difference from the operator’s other venue, where the speedboat trips do not carry them. If water sports matter to your day, this is the venue that includes them.',
    ].join('\n\n'),
    heroImage: '',
    heroImageAlt: '',
    metaTitle: 'Water Sports | Hula Hula Island',
    metaDescription: 'Water sports are part of the island day on every Hula Hula trip, rather than an extra bought separately on arrival.',
    sourceUrl: MARKETPLACE_CRUISE_SOURCE,
  },
  {
    slug: 'hula-hula-massage',
    title: 'Massage on the Yacht Days',
    heroDescription: 'A short massage is offered on board during the sail, on the seven-hour yacht days only.',
    body: [
      'The seven-hour cruises include a short massage on board during the sail out. It is a few minutes rather than a treatment, and it is offered while the boat is under way.',
      'It belongs to the yacht days. The four-hour speedboat trips do not carry it, and the product pages say so rather than leaving guests to discover it on the boat.',
    ].join('\n\n'),
    heroImage: '',
    heroImageAlt: '',
    metaTitle: 'Massage on the Yacht Days | Hula Hula Island',
    metaDescription: 'A short massage is offered on board during the sail on the seven-hour Hula Hula yacht days, not on the speedboat trips.',
    sourceUrl: MARKETPLACE_CRUISE_SOURCE,
  },
  {
    slug: 'island-lunch',
    title: 'Lunch on the Island',
    heroDescription: 'Lunch and soft drinks are served on the island and are included on the seven-hour cruise days.',
    body: [
      'Lunch is served on the island and is included in the price on the seven-hour cruises, along with soft drinks.',
      'It is not included on the four-hour speedboat trips or on the beach ticket. Those are shorter days, and the product pages say what they do and do not carry rather than implying a meal that is not there.',
    ].join('\n\n'),
    heroImage: '',
    heroImageAlt: '',
    metaTitle: 'Lunch on the Island | Hula Hula Island',
    metaDescription: 'Lunch and soft drinks are served on Hula Hula Island and are included on the seven-hour cruise days, not the shorter trips.',
    sourceUrl: MARKETPLACE_CRUISE_SOURCE,
  },
];

export const HULA_HULA_FACILITY_INDEX = {
  slug: FACILITIES_SLUG,
  title: 'On the Island',
  heroDescription: 'What the operator confirms is on the island: the beach itself, water sports on every day, massage on the yacht days and lunch on the cruises.',
  heroImage: '',
  heroImageAlt: '',
  metaTitle: 'On the Island | Hula Hula Island',
  metaDescription: 'What the operator confirms about Hula Hula Island: beach entry, water sports on every day, massage on the yacht days and lunch on the cruises.',
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
const SIBLING_VENUE = /paradise/i;
const PROCESS_MARKERS = /\b(seed|preview|placeholder|TODO|lorem|QA|staging|internal|archive|wayback)\b/i;

function customerCopy(tour: HulaHulaTour): string {
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

function pageCopy(page: HulaHulaFacilityPage): string {
  return JSON.stringify([page.title, page.heroDescription, page.body, page.heroImageAlt, page.metaTitle, page.metaDescription]);
}

/**
 * Client-owned imagery only: the operator's own media library. This venue has
 * no recoverable site of its own, so no archive source is allowed here.
 */
export function isApprovedSourceAsset(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:'
      && parsed.hostname === 'www.queenmagicorp.com'
      && /^\/web\/image\/\d+-[0-9a-f]+\/[^/]+$/.test(parsed.pathname)
      && !parsed.search
      && !parsed.hash;
  } catch {
    return false;
  }
}

export function validateHulaHulaIslandPlan(): string[] {
  const errors: string[] = [];

  if (HULA_HULA_TENANT.designMode !== 'hulahula') errors.push('The tenant must use the hulahula design.');
  if (HULA_HULA_TENANT.defaultCurrency !== 'EGP') errors.push('The operator sells in EGP.');
  if (Object.prototype.hasOwnProperty.call(HULA_HULA_TENANT, 'customDomain')) {
    errors.push('No custom domain is decided; it must not be claimed here.');
  }
  if (HULA_HULA_TENANT.domainMigrated !== false) errors.push('The tenant must not be marked as serving its own domain.');
  if (HULA_HULA_TENANT.paymentSettings.enabledGateways.join() !== 'pay-later') errors.push('Only pay-later is enabled at launch.');
  if (HULA_HULA_TENANT.paymentSettings.stripe.enabled) errors.push('No card gateway is configured at launch.');
  if (HULA_HULA_TENANT.bundleSettings.mode !== 'off') errors.push('Bundles must stay off.');
  if (HULA_HULA_TENANT.notificationSettings.bookingEmail !== LAUNCH_BOOKING_INBOX) errors.push('Booking alerts must stay with the platform inbox.');
  for (const href of [LISTING_PATH, `/${FACILITIES_SLUG}`, '/destinations', '/about', '/contact']) {
    if (!HULA_HULA_TENANT.navigation.some((item) => item.href === href)) errors.push(`Navigation is missing ${href}.`);
  }
  if (!HULA_HULA_TENANT.aiSettings.searchWidget.placeholder.trim()) errors.push('The search placeholder must name the real trip types.');
  if (!isApprovedSourceAsset(HULA_HULA_SOURCE_LOGO)) errors.push('The logo must come from an allowlisted client source.');
  if (!HULA_HULA_HERO_SOURCES.length) errors.push('At least one site header image is required.');
  for (const url of HULA_HULA_HERO_SOURCES) if (!isApprovedSourceAsset(url)) errors.push(`Unapproved hero image: ${url}`);
  if (new Set(HULA_HULA_HERO_SOURCES).size !== HULA_HULA_HERO_SOURCES.length) errors.push('Duplicate hero image.');
  // Real photography for this venue barely exists; the gap must stay named.
  if (HULA_HULA_HERO_SOURCES.length < 3 && !HULA_HULA_OPEN_DECISIONS.some((item) => /photograph/i.test(item))) {
    errors.push('Fewer than three site headers and no open decision naming the imagery gap.');
  }
  for (const slug of HULA_HULA_TENANT.pickupDestinationSlugs) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push(`Invalid pickup destination slug: ${slug}`);
  }
  if (new Set(HULA_HULA_TENANT.pickupDestinationSlugs).size !== HULA_HULA_TENANT.pickupDestinationSlugs.length) {
    errors.push('Duplicate pickup destination slug.');
  }

  const slugs = new Set<string>();
  for (const tour of HULA_HULA_TOURS) {
    const id = tour.slug;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tour.slug)) errors.push(`Invalid slug: ${id}`);
    if (!tour.slug.startsWith(VENUE_PREFIX)) errors.push(`Slug must carry the venue prefix so the two sites can never collide: ${id}`);
    if (slugs.has(tour.slug)) errors.push(`Duplicate slug: ${id}`);
    slugs.add(tour.slug);
    if (!tour.sourceUrls.length) errors.push(`No source recorded: ${id}`);

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
    if (!tour.entryWindows.length && !tour.openDecisions.some((item) => /departure|daily hours/i.test(item))) {
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

  if (!HULA_HULA_FACILITY_PAGES.length) errors.push('At least one confirmed facility must ship.');
  const pageSlugs = new Set<string>([HULA_HULA_FACILITY_INDEX.slug]);
  if (RESERVED_PAGE_SLUGS.has(HULA_HULA_FACILITY_INDEX.slug)) errors.push(`Index page slug is reserved by the storefront: ${HULA_HULA_FACILITY_INDEX.slug}`);
  for (const page of HULA_HULA_FACILITY_PAGES) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)) errors.push(`Invalid page slug: ${page.slug}`);
    if (RESERVED_PAGE_SLUGS.has(page.slug)) errors.push(`Page slug is reserved by the storefront: ${page.slug}`);
    if (pageSlugs.has(page.slug)) errors.push(`Duplicate page slug: ${page.slug}`);
    pageSlugs.add(page.slug);
    if (page.heroImage && !isApprovedSourceAsset(page.heroImage)) errors.push(`Unapproved page image: ${page.slug}`);
    if (page.heroImage && !page.heroImageAlt.trim()) errors.push(`Page image needs a description: ${page.slug}`);
    if (!page.heroImage && !HULA_HULA_OPEN_DECISIONS.some((item) => /photograph/i.test(item))) {
      errors.push(`Page has no image and no open decision naming the gap: ${page.slug}`);
    }
    if (!page.sourceUrl.trim()) errors.push(`Facility page must cite its source: ${page.slug}`);
    if (page.heroDescription.length < 60) errors.push(`Page summary is too thin: ${page.slug}`);
    if (page.body.length < 200) errors.push(`Page body is too thin: ${page.slug}`);
    if (page.metaDescription.length < 80 || page.metaDescription.length > 170) errors.push(`Page search description length out of range: ${page.slug}`);
    if (!/^[0-9a-f]{24}$/.test(facilityPageId(page.slug))) errors.push(`Page id is not a valid identifier: ${page.slug}`);

    const copy = pageCopy(page);
    if (EMOJI.test(copy)) errors.push(`Emoji reached page copy: ${page.slug}`);
    if (FOREIGN_BRANDS.test(copy)) errors.push(`Another business name reached page copy: ${page.slug}`);
    if (SIBLING_VENUE.test(copy)) errors.push(`The other venue is named in page copy: ${page.slug}`);
    if (PROCESS_MARKERS.test(copy)) errors.push(`Internal vocabulary reached page copy: ${page.slug}`);
  }

  if (!HULA_HULA_OPEN_DECISIONS.length) errors.push('The package-level open decisions must be recorded.');

  // A site's pages and its tours share one public URL namespace: the namespace
  // guard checks a new page slug against that site's tours before it writes.
  const tourSlugs = new Set(HULA_HULA_TOURS.map((tour) => tour.slug));
  for (const page of [HULA_HULA_FACILITY_INDEX, ...HULA_HULA_FACILITY_PAGES]) {
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
 * The exact page set written to the tenant. Pages here carry no image: this
 * venue has no photography, and a page is published without one rather than
 * borrowed from somewhere else.
 */
export function buildCustomPages(existing: ExistingPageImage[] = []): Record<string, unknown>[] {
  // A later generated-image run sets these; a re-run must never wipe one.
  const carried = (slug: string) => existing.find((page) => page.slug === slug);
  const facilityPages = HULA_HULA_FACILITY_PAGES.map((page, index) => ({
    _id: facilityPageId(page.slug),
    slug: page.slug,
    title: page.title,
    metaTitle: page.metaTitle,
    metaDescription: page.metaDescription,
    layoutMode: 'website',
    ...(carried(page.slug)?.heroImage
      ? { heroImage: carried(page.slug)!.heroImage, heroImageAlt: carried(page.slug)!.heroImageAlt }
      : {}),
    heroDescription: page.heroDescription,
    body: page.body,
    pageType: 'attraction',
    parentPath: `/${FACILITIES_SLUG}`,
    isPublished: true,
    status: 'active',
    sortOrder: index + 1,
  }));
  const indexPage = {
    _id: facilityPageId(HULA_HULA_FACILITY_INDEX.slug),
    slug: HULA_HULA_FACILITY_INDEX.slug,
    title: HULA_HULA_FACILITY_INDEX.title,
    metaTitle: HULA_HULA_FACILITY_INDEX.metaTitle,
    metaDescription: HULA_HULA_FACILITY_INDEX.metaDescription,
    layoutMode: 'website',
    ...(carried(HULA_HULA_FACILITY_INDEX.slug)?.heroImage
      ? { heroImage: carried(HULA_HULA_FACILITY_INDEX.slug)!.heroImage, heroImageAlt: carried(HULA_HULA_FACILITY_INDEX.slug)!.heroImageAlt }
      : {}),
    heroDescription: HULA_HULA_FACILITY_INDEX.heroDescription,
    body: '',
    sections: [{
      id: 'island-facilities',
      type: 'pages',
      title: 'On the island',
      layout: 'vertical',
      pageIds: HULA_HULA_FACILITY_PAGES.map((page) => facilityPageId(page.slug)),
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
  tour: HulaHulaTour,
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
      mode: tour.hasHotelPickup ? 'Hotel pickup' : 'Marina departure',
      description: tour.hasHotelPickup
        ? 'Hotel pickup and drop-off are included. Give your hotel name when you book; the team confirms the pickup time.'
        : 'The trip leaves from a marina in Hurghada. The transfer from your hotel is booked separately and priced by area.',
    }],
    meetingPoint: {
      address: 'Hurghada, Red Sea, Egypt',
      instructions: 'Your confirmed marina and boarding time appear on your booking confirmation.',
      mapUrl: '',
    },
    instantConfirmation: false,
    mobileTicket: true,
    hasHotelPickup: tour.hasHotelPickup,
    // A fixed departure is sold by its time slot: the availability API only returns slots for
    // 'time-slots' tours, and the storefront asks for a time whenever a tour has a window.
    availability: { type: departureAvailabilityType(tour.entryWindows), advanceBooking: 365 },
    seo: tour.seo,
    tenantIds: [tenantId],
    ownerTenantId: tenantId,
    reseller: { enabled: false, value: 0, allowedTenants: [] },
    enquiryOnly: false,
    status: 'active',
    featured: index < 4,
    sortOrder: index + 1,
  };
}

export interface ExistingTourRecord {
  slug: string;
  ownedByHulaHula: boolean;
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
    if ((record.hasOwner && !record.ownedByHulaHula) || record.listedByOtherTenant) {
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
    $or: [{ domain: HULA_HULA_TENANT.domain }, { slug: TENANT_SLUG }],
  }).select('_id slug');
  const existingTours = await Attraction.find({ slug: { $in: HULA_HULA_TOURS.map((tour) => tour.slug) } })
    .select('_id slug ownerTenantId tenantIds images status')
    .lean();
  const collision = catalogueCollision(existingTours.map((record) => ({
    slug: record.slug,
    ownedByHulaHula: Boolean(existingTenant && record.ownerTenantId && String(record.ownerTenantId) === String(existingTenant._id)),
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
      catalogue: HULA_HULA_TOURS.map((tour) => ({
        slug: tour.slug,
        path: `${LISTING_PATH}/${tour.slug}`,
        action: existingTours.some((record) => record.slug === tour.slug) ? 'update' : 'create',
        priceFrom: Math.min(...tour.pricingOptions.map((option) => option.price)),
        images: tour.sourceImages.length,
      })),
      pages: [HULA_HULA_FACILITY_INDEX.slug, ...HULA_HULA_FACILITY_PAGES.map((page) => page.slug)],
      imageryGap: 'every tour and facility page ships without a photograph',
    }, null, 2));

    // Images first: a failed upload leaves the database untouched.
    const logo = existingTenant?.logo?.includes('res.cloudinary.com')
      ? existingTenant.logo
      : await mirrorSourceImage(HULA_HULA_SOURCE_LOGO, `tenant-logos/${TENANT_SLUG}`);
    const heroImages = existingTenant?.heroImages?.length && existingTenant.heroImages.every((url: string) => url.includes('res.cloudinary.com'))
      ? existingTenant.heroImages
      : await Promise.all(HULA_HULA_HERO_SOURCES.map((url, index) => mirrorSourceImage(url, `tenant-heroes/${TENANT_SLUG}/${index + 1}`)));

    const tourImages = new Map<string, string[]>();
    for (const tour of HULA_HULA_TOURS) {
      const existing = existingTours.find((record) => record.slug === tour.slug)?.images as string[] | undefined;
      // A later generated-image run fills these; never wipe what it added.
      tourImages.set(tour.slug, existing?.length ? existing : []);
    }

    const customPages = buildCustomPages((existingTenant?.customPages || []).map((page) => ({
      slug: page.slug,
      heroImage: page.heroImage,
      heroImageAlt: page.heroImageAlt,
    })));

    const previewAccessCode = existingTenant?.previewAccessCode || generatePreviewAccessCode();
    const previewAccessCodeUpdatedAt = existingTenant?.previewAccessCodeUpdatedAt || new Date();
    const tenant = await Tenant.findOneAndUpdate(
      { slug: TENANT_SLUG },
      {
        $set: {
          ...HULA_HULA_TENANT,
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

    for (const [index, tour] of HULA_HULA_TOURS.entries()) {
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
      slug: { $in: HULA_HULA_TOURS.map((tour) => tour.slug) },
    });
    const foreignListed = await Attraction.countDocuments({ tenantIds: tenant._id, ownerTenantId: { $ne: tenant._id } });
    if (owned !== HULA_HULA_TOURS.length || foreignListed !== 0) {
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
      openDecisions: HULA_HULA_OPEN_DECISIONS.length,
      safeguards: [
        'access code written to the requested file only, never printed',
        'booking alerts routed to the platform inbox',
        'no image invented or borrowed from the sibling venue',
        'no DNS, domain alias, admin account, notification or deployment change',
      ],
    }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

export async function main(): Promise<void> {
  const errors = validateHulaHulaIslandPlan();
  if (errors.length) throw new Error(`Seed plan is invalid:\n- ${errors.join('\n- ')}`);

  if (process.argv.includes('--check')) return checkPlan();
  if (process.argv.includes('--apply')) return applyPlan();

  console.log(JSON.stringify({
    mode: 'dry-run',
    tenant: {
      slug: TENANT_SLUG,
      designMode: HULA_HULA_TENANT.designMode,
      status: HULA_HULA_TENANT.status,
      currency: HULA_HULA_TENANT.defaultCurrency,
      customDomain: null,
      domainMigrated: false,
      pickupAreas: HULA_HULA_TENANT.pickupDestinationSlugs,
      heroImages: HULA_HULA_HERO_SOURCES.length,
    },
    catalogue: HULA_HULA_TOURS.map((tour) => ({
      path: `${LISTING_PATH}/${tour.slug}`,
      title: tour.title,
      price: `${tour.pricingOptions[0].price} EGP ${tour.pricingOptions[0].pricingModel}`,
      childPrice: tour.pricingOptions[0].childPrice ?? null,
      departures: tour.entryWindows.map((window) => window.startTime),
      hotelPickup: tour.hasHotelPickup,
      images: tour.sourceImages.length,
      openDecisions: tour.openDecisions.length,
    })),
    pages: [HULA_HULA_FACILITY_INDEX.slug, ...HULA_HULA_FACILITY_PAGES.map((page) => page.slug)].map((slug) => `/${slug}`),
    packageOpenDecisions: HULA_HULA_OPEN_DECISIONS.length,
    safeguards: ['no database connection', 'no asset upload', 'no DNS or deployment', 'no notification'],
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[hula-hula-island] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
