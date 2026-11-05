/**
 * Key of Egypt Tours (site 129, tenant `key-of-egypt-tours`): the two multi-day trips the site sells beside its
 * eight days, written as package listings (`listingType: 'package'` with `packageDetails`). They are the first
 * packages published anywhere on the network.
 *
 * WHAT THIS WRITES, AND FROM WHERE. Two listings, each built on one of the client's own published records, read
 * through the dated snapshot (`network-sites/eeo-snapshot.json`, both records read on 5 November 2026):
 * - `cairo-nile-cruise-6-day-egypt-highlights-abu-simbel-hot-air-balloon`: six days, five nights, three hotel
 *   levels (the record's own Premium, Deluxe and Luxury options), guide language as a choice.
 * - `egypt-in-9-days-cairo-alexandria-nile-cruise-luxor-abu-simbel`: nine days, eight nights, one level.
 * Every price, child rate and guide supplement is copied from the snapshot at build time; not one of them is
 * typed here. The two shorter Cairo records the client publishes exclude accommodation, so they are not packages
 * and are not written. The titles, the short and long descriptions, the highlights and the search words are this
 * site's own, written from the record and from nothing else: no hotel is named, no claim is made about the
 * company, and no fact the record does not state appears anywhere.
 *
 * THE PRECEDENT THIS FOLLOWS is `complete-cairo-package-content.ts`, which completed the same six-day record for
 * the `cairo-tours-packages` draft, and the shape of its decisions is kept here so the network says the same
 * thing about the same trip wherever it is sold:
 * - Unnamed properties are entered as "5-star hotel in Cairo" and the like, each saying that the operator
 *   confirms the exact property and that bed requests are subject to availability.
 * - A party of two sharing one room: two adults, or one adult and one child aged 6 to 12. Single and triple
 *   rooms are not offered, infants are not taken, and the adult price is the per-person price in a double.
 * - Children are 6 to 12 because both records include a sunrise balloon flight and the six-day record's own page
 *   sets six as the youngest age that can fly.
 * - The network's existing 7/3/0-day refund schedule, in the wording the Cairo work settled on.
 * - The guide language is an option group: English is included at no charge, and German, Spanish, French and
 *   Italian each cost what the record's own add-on publishes.
 *
 * PRODUCT DECISIONS MADE HERE, because the records state no equivalent:
 * - SEASON. One year-round season, from tomorrow to the end of the booking horizon (twelve months, the package
 *   default). The records publish no seasonal price, so one season carries every date the calendar can offer.
 * - DEPARTURES. Any day of the week, which is what both records publish, with the package default booking
 *   horizon and daily allocation, and the seven days' notice the Cairo configuration of the six-day record
 *   uses. Neither record publishes a seat allocation, so the default stands until the operator sets one.
 * - MEALS are not allocated day by day: the six-day record says only "meals as mentioned per day" without
 *   mentioning them, so that line is dropped rather than shown, and no day claims a meal.
 * - THE NIGHT ON THE TRAIN. The nine-day record names four nights in Cairo, one overnight sleeper train and
 *   three cruise nights, which is the trip's eight nights exactly. Its own day titles fix every night but one,
 *   so the remaining night — the third — is the train, and the itinerary says so.
 * - The nine-day record lists "All sites mentioned in the program" among its inclusions and "Entrance fees"
 *   among its exclusions. Both lines are carried exactly as published; this work does not resolve the operator's
 *   own wording, and a customer sees what the operator states.
 *
 * PICTURES. Each listing shows the one photograph the client publishes on its own record, copied onto the
 * network's own image account at apply time under a stable name, so a rerun reuses the same asset and no address
 * is ever typed into this file. The descriptions are written for what each photograph actually shows.
 *
 * PLACES. The site's day trips are fenced to the Nile valley so that no day implies a call at a town it does not
 * reach. These packages are not days: each one names the towns its own record's itinerary names — Alexandria,
 * Aswan, Abu Simbel, Edfu and Kom Ombo among them — because the record takes the traveller there and includes
 * the nights, the flights and the cruise that get them there.
 *
 * BOOKINGS stay refused for this tenant (`tenantBookingPolicy.service.ts`); the listings show their prices and
 * their calendar, and the booking endpoint answers 503 until the owner opens the site. Nothing here changes that.
 *
 * HOW IT RUNS. Verify-first, idempotent and reversible. A dry run is the default and touches nothing:
 *   npx ts-node src/scripts/seed-keyofegypt-packages.ts
 *   ... --apply  --confirm-tenant=key-of-egypt-tours
 *   ... --remove --confirm-tenant=key-of-egypt-tours
 * `--apply` writes only after every check passes for both records, so a refusal writes nothing at all.
 * `--remove` archives the two records this script created — soft, reversible, and refused for any record whose
 * address, owner, kind or title is not the one written here. No tenant, booking, availability, payment, media or
 * notification record is ever written, and no price is ever converted.
 */

import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { cancellationPolicyText } from '../services/packageBooking.service';
import {
  addDays,
  addMonths,
  firstBookableDate,
  packageFromPrice,
  todayInZone,
} from '../services/packagePricing.service';
import { DEFAULT_BOOKING_TIME_ZONE } from '../utils/bookingCutoff';
import {
  PackageDetails,
  PackageDetailsInput,
  packageDetailsSchema,
  packagePublishChecklist,
} from '../utils/packageDetails';
import { createAttractionSchema } from '../utils/validators';
import { EEO_BASE, EEO_SOURCE, type EeoSnapshot, type EeoTour } from './network-sites/eeo-source';
import { serverPayload, tripRecord } from './network-sites/eeo-reader';
import EEO_SNAPSHOT from './network-sites/eeo-snapshot.json';
import { FOREIGN_BRANDS, UNBACKED_CLAIMS } from './seed-network-sites';

export const KEYOFEGYPT_TENANT = 'key-of-egypt-tours';
/** The same catalogue namespace as the site's days, so one site owns one set of addresses. */
export const KEYOFEGYPT_SLUG_PREFIX = 'koe-';
export const KEYOFEGYPT_CURRENCY = 'USD';
/** Where the packages are filed on the site, and the network category multi-day trips are listed under. */
export const KEYOFEGYPT_PACKAGE_PARENT = { label: 'Packages', path: '/packages' } as const;
const CATEGORY = 'multi-day-tours';
const CAIRO = { lat: 30.0444, lng: 31.2357 };
/** The image account every network picture lives on. A photograph anywhere else is refused. */
const NETWORK_IMAGES = /^https:\/\/res\.cloudinary\.com\/dm3sxllch\/image\/upload\//;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{2714}\u{2728}]/u;
const PROCESS_MARKERS = /\b(seed|preview|placeholder|TODO|lorem|QA|staging|internal)\b/i;

export class KeyOfEgyptPackageError extends Error {}
const fail = (message: string): never => { throw new KeyOfEgyptPackageError(message); };

// ── what each package is, in this site's own words ────────────────────────────────────────────

/** One hotel level: the record's booking option it is priced from, and what the stay is. */
interface LevelSpec {
  /** This package's own key for the level. */
  key: string;
  /** The booking option on the client's record whose adult and child prices this level charges. */
  pricingKey: string;
  /** That option's published name, so a renamed option stops the run rather than selling under an old name. */
  optionTitle: string;
  /** What the level is called here: the record's own name where it fits the field, otherwise this site's. */
  name: string;
  /** What the level is, in plain words, saying only what the record says. */
  description: string;
  /** The nights the level includes, in order, as the record's inclusions give them. */
  stays: Array<{
    name: string;
    city: string;
    nights: number;
    stars?: number;
    accommodationType: 'hotel' | 'cruise' | 'train';
    description: string;
  }>;
}

/** The guide languages a record sells, and the add-on each supplement is read from. */
interface GuideSpec {
  /** The language the record already includes, at no extra charge. */
  included: string;
  /** Each further language and the record add-on whose price it costs. */
  supplements: Array<{ language: string; addonId: string }>;
}

export interface KeyOfEgyptPackage {
  /** The record on the client's own site this package is built on. */
  source: string;
  /** The public address on this site; the stored slug is the site's prefix and this. */
  path: string;
  title: string;
  short: string;
  description: string;
  highlights: string[];
  seo: { metaTitle: string; metaDescription: string };
  durationDays: number;
  durationNights: number;
  startCity: string;
  endCity: string;
  levels: LevelSpec[];
  guide?: GuideSpec;
  /** Where each day of the record's itinerary spends its night; '' where the record does not say. */
  overnights: string[];
  /** Exact inclusion lines to leave out, because the record promises nothing checkable by them. */
  omitInclusions?: string[];
  /** Exact exclusion lines to say in this site's words, because the record's own describes an add-on. */
  rewriteExclusions?: Record<string, string>;
  /** The record includes pickup at the hotel rather than only an airport transfer. */
  hotelPickup: boolean;
  meetingPoint: { address: string; instructions: string };
  gettingThere: Array<{ mode: string; description: string }>;
  /** What the record's own photograph shows, written for the photograph. */
  photoAlt: string;
}

const CONFIRMED_BY_OPERATOR = 'The exact property will be confirmed by the operator. Double or twin beds may be requested, subject to availability.';

const SIX_DAY_STAYS: LevelSpec['stays'] = [
  { name: '5-star hotel in Cairo', city: 'Cairo', nights: 1, stars: 5, accommodationType: 'hotel', description: CONFIRMED_BY_OPERATOR },
  { name: '5-star hotel in Luxor', city: 'Luxor', nights: 1, stars: 5, accommodationType: 'hotel', description: CONFIRMED_BY_OPERATOR },
  {
    name: '5-star Nile cruise',
    city: 'Nile cruise',
    nights: 3,
    stars: 5,
    accommodationType: 'cruise',
    description: 'Three cruise nights with full board. The exact vessel will be confirmed by the operator; bed requests are subject to availability.',
  },
];

/** The six-day trip: Cairo, a flight south, Luxor and three nights on the river, ending at Abu Simbel. */
const SIX_DAYS: KeyOfEgyptPackage = {
  source: 'cairo-nile-cruise-6-day-egypt-highlights-abu-simbel-hot-air-balloon',
  path: 'six-days-cairo-luxor-and-three-nights-on-the-nile',
  title: 'Six Days: Cairo, Luxor and Three Nights on the Nile',
  short: 'Two days around Cairo, a flight south to Luxor, then three nights sailing, with a balloon at sunrise and Abu Simbel before the flight home.',
  description: `Six days from Cairo to Abu Simbel and back, with every night in the price: one in a five-star hotel in Cairo, one in a five-star hotel in Luxor, and three on a five-star Nile cruise with full board. The first day is the Giza pyramids and the Egyptian Museum. The second goes south to Memphis, Saqqara and Dahshur, and ends with the flight to Luxor. The east bank temples follow, and the cruise begins. A hot-air balloon lifts at sunrise over the west bank on the fourth day, the boat calls at Edfu and Kom Ombo on the fifth, and the last day stands before the temples of Abu Simbel before the flight back to Cairo.

Both domestic flights, Cairo to Luxor and Aswan to Cairo, are in the price, and so are the entrance fees, the transport in private air-conditioned vehicles, the felucca ride at Luxor, the balloon, and pickup and drop-off at your hotel in Cairo. The guide speaks English; German, Spanish, French or Italian can be chosen instead for the supplement the operator publishes. Three hotel levels are sold, each at its own price per person.`,
  highlights: [
    'The Giza pyramids and the Egyptian Museum on the first day',
    'Memphis, Saqqara and Dahshur, then the flight to Luxor',
    'Three nights on a five-star Nile cruise, full board',
    'A balloon at sunrise, and Abu Simbel on the last day',
  ],
  seo: {
    metaTitle: 'Six Days: Cairo, Luxor and Three Nights on the Nile',
    metaDescription: 'Six days, five nights: one in Cairo, one in Luxor and three on a five-star Nile cruise, with both domestic flights, a sunrise balloon and Abu Simbel.',
  },
  durationDays: 6,
  durationNights: 5,
  startCity: 'Cairo',
  endCity: 'Cairo',
  levels: [
    {
      key: 'premium',
      pricingKey: 'premium-5-star-hotels-nile-cruise-bafa5d5fbf9b',
      optionTitle: 'Premium 5-Star Hotels & Nile Cruise',
      name: 'Premium 5-Star Hotels & Nile Cruise',
      description: 'Five-star hotels in Cairo and Luxor and a five-star Nile cruise, at the first of the three levels the operator sells.',
      stays: SIX_DAY_STAYS,
    },
    {
      key: 'deluxe',
      pricingKey: 'deluxe-5-star-hotels-nile-cruise-6c4267df22fa',
      optionTitle: 'Deluxe 5-Star Hotels & Nile Cruise',
      name: 'Deluxe 5-Star Hotels & Nile Cruise',
      description: 'The same five nights at the second of the three levels the operator sells.',
      stays: SIX_DAY_STAYS,
    },
    {
      key: 'luxury',
      pricingKey: 'luxury-5-star-hotels-nile-cruise-7c7a662f2026',
      optionTitle: 'Luxury 5-Star Hotels & Nile Cruise',
      name: 'Luxury 5-Star Hotels & Nile Cruise',
      description: 'The same five nights at the third of the three levels the operator sells.',
      stays: SIX_DAY_STAYS,
    },
  ],
  guide: {
    included: 'English',
    supplements: [
      { language: 'German', addonId: '6a8f62bba83fdd8f8da53f0b' },
      { language: 'Spanish', addonId: '6a8f62bba83fdd8f8da53f0b' },
      { language: 'French', addonId: '6a8f62bba83fdd8f8da53f0b' },
      { language: 'Italian', addonId: '6a8f62bba83fdd8f8da53f0c' },
    ],
  },
  overnights: ['Cairo', 'Luxor', 'Nile cruise', 'Nile cruise', 'Nile cruise', ''],
  omitInclusions: ['Meals as mentioned per day'],
  rewriteExclusions: {
    'Spanish-, German-, Italian- or French-speaking guide (available as an add-on)':
      'Optional German-, Spanish-, French- or Italian-speaking guide (choose one language)',
  },
  hotelPickup: true,
  meetingPoint: {
    address: 'Your hotel in Cairo',
    instructions: 'The team confirms your pickup time when it confirms your booking.',
  },
  gettingThere: [{ mode: 'Hotel pickup', description: 'Pickup and drop-off at your hotel in Cairo.' }],
  photoAlt: 'Hot-air balloons above the green fields and village roofs of the Luxor west bank at first light, with two seated stone statues beside the road and the desert behind',
};

/** The nine-day trip: Cairo and Alexandria, the sleeper train south, and the river from Aswan to Luxor. */
const NINE_DAYS: KeyOfEgyptPackage = {
  source: 'egypt-in-9-days-cairo-alexandria-nile-cruise-luxor-abu-simbel',
  path: 'nine-days-cairo-alexandria-and-the-nile-from-aswan-to-luxor',
  title: 'Nine Days: Cairo, Alexandria and the Nile from Aswan to Luxor',
  short: 'Four nights in Cairo, a day in Alexandria, the overnight train south and three nights sailing down to Luxor, with Abu Simbel and a balloon at dawn.',
  description: `Nine days that begin and end in Cairo, with door-to-door transfers from and to the airport at both ends and someone to meet you on arrival and at departure. Four of the nights are in a three-star hotel in Cairo with breakfast, and the first days go to the Giza pyramids complex and then out to Alexandria and its landmarks. The overnight sleeper train carries you south in a cabin with its own facilities, and the cruise is boarded at Aswan: three nights on a five-star boat with every meal from lunch on the first day to breakfast on the last.

The boat calls at Kom Ombo and at Edfu, Luxor follows, and the flight back to Cairo is in the price; the last full day is spent in old Cairo. The temples of Abu Simbel are included, and so are a hot-air balloon flight at Luxor, the horse and carriage, the taxes and charges and an Egyptology guide throughout. Entrance fees and tipping are not in the price, as the list below says.`,
  highlights: [
    'Four nights in Cairo, with the Giza pyramids complex',
    'A day among the landmarks of Alexandria',
    'The overnight sleeper train down to Aswan',
    'Three nights sailing to Luxor, with Abu Simbel and a balloon',
  ],
  seo: {
    metaTitle: 'Nine Days: Cairo, Alexandria and the Nile from Aswan to Luxor',
    metaDescription: 'Nine days from Cairo: four nights with breakfast, a day in Alexandria, the sleeper train south and three nights on a five-star cruise from Aswan to Luxor.',
  },
  durationDays: 9,
  durationNights: 8,
  startCity: 'Cairo',
  endCity: 'Cairo',
  levels: [
    {
      key: 'cairo-hotel-and-cruise',
      pricingKey: 'egypt-9-day-cairo-alexandria-aswan-luxor-crui-d8f4776027f0',
      // The record's own name for its one option is longer than a level name may be, so the level is named
      // here for what the stay is; the published name is still checked, and a rename stops the run.
      optionTitle: 'Egypt: 9-Day Cairo, Alexandria, Aswan, Luxor Cruise and Abu Simbel',
      name: '3-star hotel in Cairo and a 5-star Nile cruise',
      description: 'The one level the operator sells on this trip: four nights in Cairo with breakfast, a night on the sleeper train and three cruise nights.',
      stays: [
        {
          name: '3-star hotel in Cairo',
          city: 'Cairo',
          nights: 4,
          stars: 3,
          accommodationType: 'hotel',
          description: `Four nights with breakfast. ${CONFIRMED_BY_OPERATOR}`,
        },
        {
          name: 'Overnight sleeper train to Aswan',
          city: 'Cairo to Aswan',
          nights: 1,
          accommodationType: 'train',
          description: 'One night in a cabin with its own facilities. The exact service will be confirmed by the operator.',
        },
        {
          name: '5-star Nile cruise',
          city: 'Nile cruise',
          nights: 3,
          stars: 5,
          accommodationType: 'cruise',
          description: 'Three nights from Aswan to Luxor, with every meal from lunch on the first day to breakfast on the last. The exact vessel will be confirmed by the operator; bed requests are subject to availability.',
        },
      ],
    },
  ],
  overnights: ['Cairo', 'Cairo', 'Sleeper train to Aswan', 'Nile cruise', 'Nile cruise', 'Nile cruise', 'Cairo', 'Cairo', ''],
  hotelPickup: false,
  meetingPoint: {
    address: 'Cairo International Airport',
    instructions: 'You are met on arrival and taken to your hotel, and taken back to the airport at the end of the trip.',
  },
  gettingThere: [{ mode: 'Airport transfer', description: 'Door-to-door transfers from and to Cairo International Airport.' }],
  photoAlt: 'A Giza pyramid keeping its stone cap, a smaller pyramid behind it to the left, and the ruined block walls of tombs in the foreground under a clouded sky at low sun',
};

export const KEYOFEGYPT_PACKAGES: KeyOfEgyptPackage[] = [SIX_DAYS, NINE_DAYS];

/** The stored address of a package on this site. */
export const packageSlug = (spec: KeyOfEgyptPackage): string => `${KEYOFEGYPT_SLUG_PREFIX}${spec.path}`;

// ── the shared terms both packages carry ──────────────────────────────────────────────────────

/** The party both records are configured for, in the words the Cairo work settled on. */
export const PARTY_NOTICE = 'This package is for two travellers sharing one room: two adults, or one adult aged 13 or older and one child aged 6–12. Single rooms, triple rooms, infants and children under 6 are not offered.';
export const DEPARTURE_NOTICE = 'Select an available departure date when booking.';
export const CANCELLATION_SCHEDULE = [
  { daysBefore: 7, refundPercent: 100 },
  { daysBefore: 3, refundPercent: 50 },
  { daysBefore: 0, refundPercent: 0 },
];
export const CANCELLATION_NOTICE = 'Cancellation refunds: 100% at least seven days before departure; 50% from three to fewer than seven days; no refund within three days. Online cancellation with a full refund is available at least seven days before departure. Contact the operator for later cancellation or refund requests under these terms.';
const PARTICIPANT_NOTICES = [
  'Children must be 6–12 years old; adults are 13 or older. Children under 6 cannot join this package because of the included balloon flight.',
  'Double or twin beds may be requested, subject to availability.',
];
/** One season carries every bookable date: neither record publishes a seasonal price. */
const SEASON_KEY = 'year-round';
const SEASON_NAME = 'Year-round';
const BAND_KEY = 'two-travellers';
/** Days between booking and departure, as the Cairo configuration of the six-day record uses. */
const MIN_NOTICE_DAYS = 7;
/** The booking horizon and the daily allocation: the package defaults, until the operator sets its own. */
const HORIZON_MONTHS = 12;
const DAILY_CAPACITY = 20;

// ── reading the client's record out of the dated snapshot ─────────────────────────────────────

const snapshotTour = (source: string, snapshot: EeoSnapshot): EeoTour => {
  const tour = snapshot.tours.find((item) => item.slug === source);
  if (!tour) fail(`${EEO_SOURCE}/${source}: not in the snapshot read ${snapshot.readAt}.`);
  return tour as EeoTour;
};

/** A level's adult and child price, from the record's own booking option. Fails closed on anything unsold. */
function levelPrices(spec: KeyOfEgyptPackage, tour: EeoTour, level: LevelSpec): { adult: number; child: number } {
  const where = `${EEO_SOURCE}/${spec.source}`;
  const option = tour.options.find((item) => item.pricingKey === level.pricingKey);
  if (!option) fail(`${where}: option "${level.pricingKey}" is missing from the published record.`);
  if (option!.type !== 'Per Person') fail(`${where}: option "${level.pricingKey}" is priced "${option!.type}", not per person.`);
  if (option!.title.trim() !== level.optionTitle) fail(`${where}: option "${level.pricingKey}" is now called "${option!.title.trim()}"; read the record again.`);
  const adult = Number(option!.guestPrices?.adult);
  const child = Number(option!.guestPrices?.child);
  if (!(adult > 0)) fail(`${where}: option "${level.pricingKey}" has no adult price.`);
  // A package that cannot price the child of a two-person party cannot be sold to one, and the party
  // this trip is configured for allows a child. A missing or larger child price stops the run.
  if (!(child > 0) || child > adult) fail(`${where}: option "${level.pricingKey}" has no usable child price.`);
  for (const slot of option!.timeSlots || []) {
    if (slot.guestPrices && (Number(slot.guestPrices.adult) !== adult || Number(slot.guestPrices.child) !== child)) {
      fail(`${where}: option "${level.pricingKey}" prices its ${slot.time} departure apart from the option.`);
    }
  }
  return { adult, child };
}

/** The guide choices, priced from the record's own add-ons. One language is included; the rest cost extra. */
function guideChoices(spec: KeyOfEgyptPackage, tour: EeoTour): Pick<PackageDetailsInput, 'extras' | 'optionGroups'> {
  if (!spec.guide) return { extras: [], optionGroups: [] };
  const where = `${EEO_SOURCE}/${spec.source}`;
  const extras: NonNullable<PackageDetailsInput['extras']> = [{
    id: `guide-${spec.guide.included.toLowerCase()}`,
    name: `${spec.guide.included}-speaking guide`,
    description: `Included ${spec.guide.included}-speaking Egyptologist guide.`,
    unit: 'per_booking',
    price: 0,
    priceChild: null,
    maxQuantity: 1,
  }];
  for (const { language, addonId } of spec.guide.supplements) {
    const addon = tour.addons.find((item) => item.id === addonId);
    if (!addon) fail(`${where}: the guide extra "${addonId}" is no longer published.`);
    if (addon!.perGuest) fail(`${where}: the guide extra "${addon!.title}" is now charged per guest; read the record again.`);
    if (!(Number(addon!.price) > 0)) fail(`${where}: the guide extra "${addon!.title}" has no price.`);
    extras.push({
      id: `guide-${language.toLowerCase()}`,
      name: `${language}-speaking guide`,
      description: `Choose ${language} as the guide language for the booking. Replaces the included ${spec.guide.included}-language choice.`,
      unit: 'per_booking',
      price: Number(addon!.price),
      priceChild: null,
      maxQuantity: 1,
    });
  }
  return {
    extras,
    optionGroups: [{
      id: 'guide-language',
      name: 'Guide language',
      kind: 'guide',
      required: true,
      extraIds: extras.map((extra) => extra.id),
    }],
  };
}

const trimmed = (items: unknown): string[] => (Array.isArray(items) ? items : [])
  .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  .map((item) => item.trim());

/** The record's own inclusions, without the lines this package names as promising nothing checkable. */
function inclusionsOf(spec: KeyOfEgyptPackage, tour: EeoTour): string[] {
  const published = trimmed(tour.detail.whatsIncluded?.length ? tour.detail.whatsIncluded : tour.detail.includes);
  for (const line of spec.omitInclusions || []) {
    if (!published.includes(line)) fail(`${EEO_SOURCE}/${spec.source}: "${line}" is not in the record's inclusions; read the record again.`);
  }
  // A line that makes a claim the network cannot back is dropped, exactly as every network trip drops it.
  return published.filter((line) => !(spec.omitInclusions || []).includes(line) && !UNBACKED_CLAIMS.test(line));
}

/** The record's own exclusions, with the lines this package restates in its own words. */
function exclusionsOf(spec: KeyOfEgyptPackage, tour: EeoTour): string[] {
  const published = trimmed(tour.detail.whatsNotIncluded);
  for (const line of Object.keys(spec.rewriteExclusions || {})) {
    if (!published.includes(line)) fail(`${EEO_SOURCE}/${spec.source}: "${line}" is not in the record's exclusions; read the record again.`);
  }
  return published.map((line) => spec.rewriteExclusions?.[line] ?? line).filter((line) => !UNBACKED_CLAIMS.test(line));
}

/** One day of the record's itinerary, without the "Day 3 - " the record writes in front of some of them. */
export const recordDayTitle = (raw: string): string => raw.trim().replace(/^Day\s*\d+\s*[-–—:]\s*/i, '').trim();

/** The itinerary, day by day from the record, with the night each day ends on. */
function itineraryOf(spec: KeyOfEgyptPackage, tour: EeoTour): NonNullable<PackageDetailsInput['itinerary']> {
  const days = tour.detail.itinerary || [];
  if (days.length !== spec.durationDays) {
    fail(`${EEO_SOURCE}/${spec.source}: the record now publishes ${days.length} days, not ${spec.durationDays}; read the record again.`);
  }
  if (spec.overnights.length !== spec.durationDays) fail(`${spec.path}: every day needs its overnight.`);
  return days.map((day, index) => {
    const title = recordDayTitle(String(day.title || ''));
    if (!title) fail(`${EEO_SOURCE}/${spec.source}: day ${index + 1} of the record has no title.`);
    return {
      day: index + 1,
      title,
      description: String(day.description || '').trim(),
      meals: [],
      overnight: spec.overnights[index],
    };
  });
}

/**
 * The package document: the trip, its hotel levels, its one season, the party it is sold to, its prices and
 * its day-by-day itinerary. Every price comes from the record; everything else is the configuration above.
 */
export function buildPackageDetails(spec: KeyOfEgyptPackage, today: string, snapshot: EeoSnapshot = EEO_SNAPSHOT as EeoSnapshot): PackageDetails {
  const tour = snapshotTour(spec.source, snapshot);
  const currency = String(tour.detail.pricingSummary?.currency || '').trim().toUpperCase();
  if (currency !== KEYOFEGYPT_CURRENCY) {
    fail(`${EEO_SOURCE}/${spec.source}: the record is priced in ${currency || 'no currency'} and the site sells in ${KEYOFEGYPT_CURRENCY}. Prices are never converted.`);
  }
  const { extras, optionGroups } = guideChoices(spec, tour);
  const input: PackageDetailsInput = {
    version: 1,
    durationDays: spec.durationDays,
    durationNights: spec.durationNights,
    startCity: spec.startCity,
    endCity: spec.endCity,
    departureMode: 'daily',
    minNoticeDays: MIN_NOTICE_DAYS,
    daily: { weekdays: [0, 1, 2, 3, 4, 5, 6], blackoutDates: [], horizonMonths: HORIZON_MONTHS, dailyCapacity: DAILY_CAPACITY },
    seasons: [{ key: SEASON_KEY, name: SEASON_NAME, from: addDays(today, 1), to: addMonths(today, HORIZON_MONTHS) }],
    tiers: spec.levels.map((level) => ({
      key: level.key,
      name: level.name,
      description: level.description,
      hotels: level.stays.map((stay) => ({ ...stay })),
    })),
    groupBands: [{ key: BAND_KEY, min: 2, max: 2 }],
    rates: spec.levels.map((level) => {
      const { adult, child } = levelPrices(spec, tour, level);
      return { tierKey: level.key, seasonKey: SEASON_KEY, bandKey: BAND_KEY, double: adult, child, single: null, triple: null, infant: null };
    }),
    rooms: { allowSingle: false, allowTriple: false, maxChildrenPerRoom: 1, maxInfantsPerRoom: 0, bedPreferences: ['double', 'twin'] },
    travellers: { allowChildren: true, allowInfants: false, childMinAge: 6, childMaxAge: 12, childWithOneAdult: 'child' },
    extras,
    optionGroups,
    bookingRequirements: { travellerNames: true, dateOfBirth: true, nationality: false, arrivalDetails: 'optional', bedPreference: true },
    cancellation: CANCELLATION_SCHEDULE.map((rule) => ({ ...rule })),
    itinerary: itineraryOf(spec, tour),
  };
  const parsed = packageDetailsSchema.safeParse(input);
  if (!parsed.success) fail(`${spec.path}: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  return parsed.data!;
}

/**
 * The listing itself: the same document the attraction editor would hold, with the package's own duration,
 * from-price and cancellation wording, which the package editor is otherwise the only writer of.
 */
export function buildPackageListing(
  spec: KeyOfEgyptPackage,
  details: PackageDetails,
  input: { tenantId: unknown; today: string; images: Array<{ url: string; alt: string }>; snapshot?: EeoSnapshot },
): Record<string, unknown> {
  const tour = snapshotTour(spec.source, input.snapshot ?? (EEO_SNAPSHOT as EeoSnapshot));
  const fromPrice = packageFromPrice(details, input.today);
  if (!fromPrice) fail(`${spec.path}: no date in the next ${HORIZON_MONTHS} months can be priced for two travellers.`);
  for (const image of input.images) {
    if (!NETWORK_IMAGES.test(image.url)) fail(`${spec.path}: the photograph must be on the network's own image account: ${image.url}`);
  }
  return {
    slug: packageSlug(spec),
    pathSlug: spec.path,
    parentPage: { ...KEYOFEGYPT_PACKAGE_PARENT },
    listingType: 'package',
    title: spec.title,
    shortDescription: spec.short,
    description: spec.description,
    images: input.images.map((image) => image.url),
    imageAltTexts: input.images.map((image) => ({ url: image.url, alt: image.alt })),
    category: CATEGORY,
    destination: { city: spec.startCity, country: 'Egypt', coordinates: { ...CAIRO } },
    duration: `${details.durationDays} days / ${details.durationNights} night${details.durationNights === 1 ? '' : 's'}`,
    languages: ['English'],
    rating: 0,
    reviewCount: 0,
    currency: KEYOFEGYPT_CURRENCY,
    enquiryOnly: false,
    priceFrom: fromPrice!.perPerson,
    packageDetails: details,
    // Prices, dates and schedule live in the package document; a package lists no tour options.
    pricingOptions: [],
    addons: [],
    entryWindows: [],
    itinerary: [],
    highlights: [...spec.highlights],
    inclusions: inclusionsOf(spec, tour),
    exclusions: exclusionsOf(spec, tour),
    whatToBring: trimmed(tour.detail.whatToBring),
    needToKnow: [PARTY_NOTICE, DEPARTURE_NOTICE, CANCELLATION_NOTICE],
    participantRequirements: [...PARTICIPANT_NOTICES],
    accessibility: [],
    gettingThere: spec.gettingThere.map((step) => ({ ...step })),
    meetingPoint: { ...spec.meetingPoint, mapUrl: '' },
    cancellationPolicy: cancellationPolicyText(details.cancellation),
    instantConfirmation: false,
    mobileTicket: true,
    hasHotelPickup: spec.hotelPickup,
    availability: { type: 'date-only', advanceBooking: 30 },
    seo: { metaTitle: spec.seo.metaTitle, metaDescription: spec.seo.metaDescription },
    tenantIds: [input.tenantId],
    ownerTenantId: input.tenantId,
    reseller: { enabled: false, value: 0, allowedTenants: [] },
    status: 'active',
    featured: false,
    sortOrder: KEYOFEGYPT_PACKAGES.indexOf(spec) + 1,
  };
}

// ── everything that must be true before a single write ────────────────────────────────────────

const listingFieldProblems = (listing: Record<string, unknown>): string[] => {
  // The same schema the attraction endpoints publish against, minus the fields a package does not
  // use (its prices, duration and schedule belong to the package document, which is checked below).
  const candidate: Record<string, unknown> = {
    ...listing,
    tenantIds: ((listing.tenantIds as unknown[]) || []).map(String),
  };
  for (const field of ['priceFrom', 'pricingOptions', 'entryWindows', 'addons', 'duration', 'packageDetails']) delete candidate[field];
  const parsed = createAttractionSchema.innerType().safeParse(candidate);
  return parsed.success ? [] : parsed.error.issues.map((issue) => `listing ${issue.path.join('.') || 'record'}: ${issue.message}`);
};

/**
 * Words this site writes itself: they may carry no claim, no other brand, no emoji and no process word.
 * The three notices are judged for brands, emoji and process words only: they state the package's own terms,
 * and the refund one has to say in plain words what the package's own schedule gives back.
 */
const writtenCopyProblems = (spec: KeyOfEgyptPackage, details: PackageDetails): string[] => {
  const written = [
    spec.title, spec.short, spec.description, ...spec.highlights, spec.seo.metaTitle, spec.seo.metaDescription,
    spec.photoAlt, spec.meetingPoint.address, spec.meetingPoint.instructions,
    ...spec.gettingThere.flatMap((step) => [step.mode, step.description]),
    ...details.tiers.flatMap((tier) => [tier.description, ...tier.hotels.map((hotel) => hotel.description ?? '')]),
    ...details.extras.flatMap((extra) => [extra.name, extra.description]),
    ...PARTICIPANT_NOTICES,
  ].join('\n');
  const terms = [written, PARTY_NOTICE, DEPARTURE_NOTICE, CANCELLATION_NOTICE].join('\n');
  const problems: string[] = [];
  if (UNBACKED_CLAIMS.test(written)) problems.push(`${spec.path}: written copy carries a claim the network cannot back.`);
  if (FOREIGN_BRANDS.test(terms)) problems.push(`${spec.path}: written copy names another brand.`);
  if (EMOJI.test(terms)) problems.push(`${spec.path}: written copy carries an emoji.`);
  if (PROCESS_MARKERS.test(terms)) problems.push(`${spec.path}: written copy carries a process word.`);
  return problems;
};

/** Text copied from the client's record: it may name no other brand, no emoji and no process word. */
const copiedTextProblems = (spec: KeyOfEgyptPackage, listing: Record<string, unknown>, details: PackageDetails): string[] => [
  ...(listing.inclusions as string[]), ...(listing.exclusions as string[]), ...(listing.whatToBring as string[]),
  ...details.itinerary.map((day) => day.title), ...details.tiers.map((tier) => tier.name),
]
  .filter((line) => FOREIGN_BRANDS.test(line) || EMOJI.test(line) || PROCESS_MARKERS.test(line))
  .map((line) => `${spec.path}: copied text names another brand or carries a process word: "${line}"`);

/**
 * Everything that stops one package being published, in the words the editor would see. An empty list means
 * the listing and its package document pass exactly the checks the admin publish path runs.
 */
export function packageProblems(
  spec: KeyOfEgyptPackage,
  listing: Record<string, unknown>,
  details: PackageDetails,
  today: string,
): string[] {
  const checklist = packagePublishChecklist(details, today);
  const problems = [
    ...listingFieldProblems(listing),
    ...checklist.problems.map((problem) => `${problem.section}: ${problem.message}`),
    ...writtenCopyProblems(spec, details),
    ...copiedTextProblems(spec, listing, details),
  ];
  if (!firstBookableDate(details, today)) problems.push('departures: no date can be booked yet');
  if (!packageFromPrice(details, today)) problems.push('prices: the catalogue needs a bookable price for its reference adult party');
  if (listing.currency !== KEYOFEGYPT_CURRENCY) problems.push(`listing currency: the site sells in ${KEYOFEGYPT_CURRENCY}`);
  if (!(listing.images as string[]).length) problems.push('listing images: the record\'s own photograph is missing');
  if ((listing.seo as { metaTitle: string }).metaTitle.length > 70) problems.push('listing seo.metaTitle: use at most 70 characters');
  if ((listing.seo as { metaDescription: string }).metaDescription.length > 165) problems.push('listing seo.metaDescription: use at most 165 characters');
  return problems;
}

// ── the record's own photograph: read from its page, copied onto the network's image account ──

export type PhotoReader = (source: string) => Promise<string>;
export type PhotoUploader = (url: string, publicId: string) => Promise<string>;

/** The stable name each photograph is stored under, so a rerun reuses the asset instead of adding one. */
export const photoPublicId = (spec: KeyOfEgyptPackage): string => `${KEYOFEGYPT_TENANT}-${spec.path}`;
export const photoFolder = 'package-photos';

/** The address of the photograph the client publishes on its own record. GET only; nothing is sent. */
export const readRecordPhoto: PhotoReader = async (source) => {
  const response = await fetch(`${EEO_BASE}/${source}`, { headers: { accept: 'text/html' }, redirect: 'follow' });
  if (!response.ok) fail(`${EEO_SOURCE}/${source}: the page answered ${response.status}.`);
  const record = tripRecord(serverPayload(await response.text()), source);
  if (!record) fail(`${EEO_SOURCE}/${source}: the page carries no record for this trip.`);
  const gallery = Array.isArray(record!.imageMetadata) ? (record!.imageMetadata as Array<{ url?: unknown }>) : [];
  const url = String(gallery.find((item) => typeof item?.url === 'string')?.url || record!.image || '');
  if (!/^https:\/\/\S+$/.test(url)) fail(`${EEO_SOURCE}/${source}: the record publishes no photograph.`);
  return url;
};

/** Copies one photograph onto the network's own image account under a stable name. */
export const copyPhotoToNetwork: PhotoUploader = async (url, publicId) => {
  const { uploadBase64Image } = await import('../services/upload.service');
  // The image service passes its first argument straight to the image account, which accepts a
  // remote address as readily as inline data; the stable name makes a repeated run reuse the asset.
  const result = await uploadBase64Image(url, photoFolder, { publicId, overwrite: false });
  if (!NETWORK_IMAGES.test(result.url)) fail(`${publicId}: the image account answered with an address off the network: ${result.url}`);
  return result.url;
};

// ── the plan, and the writes ──────────────────────────────────────────────────────────────────

export interface KeyOfEgyptPackagePlan {
  spec: KeyOfEgyptPackage;
  slug: string;
  listing: Record<string, unknown>;
  details: PackageDetails;
  problems: string[];
}

export interface PackagePorts {
  readPhoto?: PhotoReader;
  uploadPhoto?: PhotoUploader;
  snapshot?: EeoSnapshot;
}

/**
 * Both packages as they would be written, with everything that would stop either of them. `images` is empty
 * on a dry run, which never touches the network: the photograph is read and copied when the run applies.
 */
export async function planKeyOfEgyptPackages(
  tenantId: unknown,
  today: string,
  options: PackagePorts & { withPhotos: boolean } = { withPhotos: false },
): Promise<KeyOfEgyptPackagePlan[]> {
  const snapshot = options.snapshot ?? (EEO_SNAPSHOT as EeoSnapshot);
  const plans: KeyOfEgyptPackagePlan[] = [];
  for (const spec of KEYOFEGYPT_PACKAGES) {
    const details = buildPackageDetails(spec, today, snapshot);
    const images: Array<{ url: string; alt: string }> = [];
    if (options.withPhotos) {
      const read = options.readPhoto ?? readRecordPhoto;
      const upload = options.uploadPhoto ?? copyPhotoToNetwork;
      images.push({ url: await upload(await read(spec.source), photoPublicId(spec)), alt: spec.photoAlt });
    }
    const listing = buildPackageListing(spec, details, { tenantId, today, images, snapshot });
    plans.push({
      spec,
      slug: packageSlug(spec),
      listing,
      details,
      // A dry run has no photograph yet, so the one problem that only applies to a write is left out.
      problems: packageProblems(spec, listing, details, today)
        .filter((problem) => options.withPhotos || !problem.startsWith('listing images')),
    });
  }
  return plans;
}

interface StoredPackage {
  _id: Types.ObjectId;
  slug: string;
  title?: string;
  status?: string;
  listingType?: string;
  ownerTenantId?: unknown;
  tenantIds?: unknown[];
  packageRevision?: number;
  presentationRevision?: number;
}

/**
 * Whether a stored record is one this script wrote: its address, its owner, the one site it is listed on, its
 * kind and its title. Anything else with the same address is another person's work and is never touched.
 */
export const isOwnRecord = (spec: KeyOfEgyptPackage, tenantId: unknown, record: StoredPackage | null): boolean =>
  Boolean(record
    && record.slug === packageSlug(spec)
    && record.listingType === 'package'
    && record.title === spec.title
    && String(record.ownerTenantId ?? '') === String(tenantId)
    && (record.tenantIds || []).length === 1
    && String((record.tenantIds || [])[0]) === String(tenantId));

const PACKAGE_FIELDS = '_id slug title status listingType ownerTenantId tenantIds packageRevision presentationRevision';

/** The tenant this script may write to, found by its own slug. Nothing else is ever a target. */
async function keyOfEgyptTenant(): Promise<{ _id: Types.ObjectId; slug: string; status?: string; defaultCurrency?: string }> {
  const { Tenant } = await import('../models/Tenant');
  const tenant = await Tenant.findOne({ slug: KEYOFEGYPT_TENANT }).select('_id slug status defaultCurrency').lean<{ _id: Types.ObjectId; slug: string; status?: string; defaultCurrency?: string }>();
  if (!tenant) fail(`The site ${KEYOFEGYPT_TENANT} does not exist here; nothing was written.`);
  if (tenant!.defaultCurrency && tenant!.defaultCurrency !== KEYOFEGYPT_CURRENCY) {
    fail(`The site sells in ${tenant!.defaultCurrency}; these packages are priced in ${KEYOFEGYPT_CURRENCY} and prices are never converted.`);
  }
  return tenant!;
}

const storedBySlug = async (slugs: string[]): Promise<Map<string, StoredPackage>> => {
  const rows = await Attraction.find({ slug: { $in: slugs } }).select(PACKAGE_FIELDS).lean<StoredPackage[]>();
  return new Map(rows.map((row) => [row.slug, row]));
};

export interface PackageWriteReport {
  slug: string;
  result: 'created' | 'updated' | 'unchanged';
  packageRevision: number;
  priceFrom: number;
}

/**
 * Writes both packages, after every check has passed for both of them, so a refusal writes nothing at all.
 * Each record is created or updated under its own compare-and-set, and a record this script did not create is
 * never overwritten.
 */
export async function applyKeyOfEgyptPackages(today: string, options: PackagePorts = {}): Promise<PackageWriteReport[]> {
  const { urlNamespaceReadiness } = await import('../plugins/urlNamespace');
  if (!urlNamespaceReadiness().writesReady) fail('Website URL writes are paused in this environment. Nothing was written.');
  const tenant = await keyOfEgyptTenant();
  const plans = await planKeyOfEgyptPackages(tenant._id, today, { ...options, withPhotos: true });
  const problems = plans.flatMap((plan) => plan.problems);
  if (problems.length) fail(`Nothing was written.\n- ${problems.join('\n- ')}`);
  const existing = await storedBySlug(plans.map((plan) => plan.slug));
  for (const plan of plans) {
    const record = existing.get(plan.slug) ?? null;
    if (record && !isOwnRecord(plan.spec, tenant._id, record)) {
      fail(`${plan.slug} is held by another record on this network; nothing was written.`);
    }
    // The public address is one per site: a path another record already serves on this site stops the run.
    const sharedPath = await Attraction.findOne({
      pathSlug: plan.spec.path,
      tenantIds: tenant._id,
      status: { $ne: 'archived' },
      ...(record ? { _id: { $ne: record._id } } : {}),
    }).select('slug').lean<{ slug: string } | null>();
    if (sharedPath) fail(`${plan.slug}: the address /${plan.spec.path} is already used by ${sharedPath.slug}; nothing was written.`);
  }

  const report: PackageWriteReport[] = [];
  for (const plan of plans) {
    const record = existing.get(plan.slug) ?? null;
    if (!record) {
      const created = await Attraction.create({ ...plan.listing, packageRevision: 0, presentationRevision: 0 });
      report.push({ slug: plan.slug, result: 'created', packageRevision: created.packageRevision ?? 0, priceFrom: plan.listing.priceFrom as number });
      continue;
    }
    const current = await Attraction.findById(record._id).lean<Record<string, unknown>>();
    if (current && sameAsPlanned(current, plan.listing)) {
      report.push({ slug: plan.slug, result: 'unchanged', packageRevision: record.packageRevision ?? 0, priceFrom: plan.listing.priceFrom as number });
      continue;
    }
    const updated = await Attraction.findOneAndUpdate(
      {
        _id: record._id,
        slug: plan.slug,
        listingType: 'package',
        ownerTenantId: tenant._id,
        packageRevision: record.packageRevision ?? 0,
      },
      { $set: plan.listing, $inc: { packageRevision: 1, presentationRevision: 1 } },
      { new: true, runValidators: true, context: 'query' },
    ).lean<StoredPackage | null>();
    if (!updated) fail(`${plan.slug} changed while this run was working; nothing further was written.`);
    report.push({ slug: plan.slug, result: 'updated', packageRevision: updated!.packageRevision ?? 0, priceFrom: plan.listing.priceFrom as number });
  }
  return report;
}

/** Two values the database may hold in different shapes, compared as the same value. */
const same = (stored: unknown, planned: unknown): boolean => {
  if (planned instanceof Types.ObjectId || stored instanceof Types.ObjectId) return String(stored) === String(planned);
  if (Array.isArray(planned)) {
    return Array.isArray(stored) && stored.length === planned.length && planned.every((item, index) => same((stored as unknown[])[index], item));
  }
  if (planned && typeof planned === 'object') {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return false;
    // Only what the plan states is compared: the database's own additions to a record it stores —
    // the id it gives each step of "getting there", the empty list it keeps for search keywords —
    // are not this script's words and never make a record look changed.
    return Object.entries(planned as Record<string, unknown>)
      .every(([key, item]) => same((stored as Record<string, unknown>)[key], item));
  }
  return JSON.stringify(stored ?? null) === JSON.stringify(planned ?? null);
};

/** Whether the stored record already says exactly what this run would write, field by written field. */
export function sameAsPlanned(stored: Record<string, unknown>, planned: Record<string, unknown>): boolean {
  return Object.keys(planned).every((field) => same(stored[field], planned[field]));
}

export interface PackageRemoveReport { slug: string; result: 'archived' | 'already-archived' }

/**
 * Archives both packages: soft, reversible, and only for the records this script created. A record whose
 * address, owner, kind or title is not the one written here is reported and left exactly as it is.
 */
export async function removeKeyOfEgyptPackages(): Promise<PackageRemoveReport[]> {
  const tenant = await keyOfEgyptTenant();
  const existing = await storedBySlug(KEYOFEGYPT_PACKAGES.map(packageSlug));
  const foreign = KEYOFEGYPT_PACKAGES
    .filter((spec) => existing.has(packageSlug(spec)) && !isOwnRecord(spec, tenant._id, existing.get(packageSlug(spec))!))
    .map((spec) => packageSlug(spec));
  if (foreign.length) fail(`Refusing to archive ${foreign.join(', ')}: not written by this script. Nothing was changed.`);

  const report: PackageRemoveReport[] = [];
  for (const spec of KEYOFEGYPT_PACKAGES) {
    const record = existing.get(packageSlug(spec));
    if (!record) continue;
    if (record.status === 'archived') { report.push({ slug: record.slug, result: 'already-archived' }); continue; }
    const archived = await Attraction.findOneAndUpdate(
      { _id: record._id, slug: record.slug, listingType: 'package', ownerTenantId: tenant._id, status: record.status },
      { $set: { statusBeforeArchive: record.status, status: 'archived', archivedAt: new Date() }, $unset: { trashedAt: 1 } },
      { new: true },
    ).lean<StoredPackage | null>();
    if (!archived) fail(`${record.slug} changed while this run was working; nothing further was changed.`);
    report.push({ slug: record.slug, result: 'archived' });
  }
  return report;
}

// ── command line ──────────────────────────────────────────────────────────────────────────────

/** What a dry run prints: the tenant it found, and both records as they would be written. */
export async function dryRunReport(today: string, options: PackagePorts = {}): Promise<Record<string, unknown>> {
  const tenant = await keyOfEgyptTenant();
  const plans = await planKeyOfEgyptPackages(tenant._id, today, { ...options, withPhotos: false });
  const existing = await storedBySlug(plans.map((plan) => plan.slug));
  return {
    mode: 'dry-run',
    today,
    tenant: { slug: tenant.slug, id: String(tenant._id), status: tenant.status ?? 'unknown' },
    packages: plans.map((plan) => {
      const record = existing.get(plan.slug) ?? null;
      return {
        slug: plan.slug,
        address: `/${plan.spec.path}`,
        title: plan.spec.title,
        record: `${EEO_SOURCE}/${plan.spec.source}`,
        action: record ? (isOwnRecord(plan.spec, tenant._id, record) ? 'update' : 'refuse: held by another record') : 'create',
        days: plan.details.durationDays,
        nights: plan.details.durationNights,
        season: plan.details.seasons.map((season) => `${season.name} ${season.from} to ${season.to}`),
        levels: plan.details.tiers.map((tier) => {
          const rate = plan.details.rates.find((row) => row.tierKey === tier.key);
          return `${tier.name}: adult ${rate?.double}, child ${rate?.child} ${KEYOFEGYPT_CURRENCY}`;
        }),
        guideChoices: plan.details.extras.map((extra) => `${extra.name}: ${extra.price}`),
        fromPrice: plan.listing.priceFrom,
        itinerary: plan.details.itinerary.map((day) => `${day.day}. ${day.title}${day.overnight ? ` → ${day.overnight}` : ''}`),
        inclusions: plan.listing.inclusions,
        exclusions: plan.listing.exclusions,
        photo: { readFrom: `${EEO_BASE}/${plan.spec.source}`, storedAs: `${photoFolder}/${photoPublicId(plan.spec)}` },
        problems: plan.problems,
      };
    }),
    writes: 'none',
    safeguards: [
      'no listing, tenant, booking, availability, payment or media record written',
      'no photograph read or copied on a dry run',
      'bookings stay refused for this site until the owner opens it',
    ],
  };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const apply = argv.includes('--apply');
  const remove = argv.includes('--remove');
  const confirm = argv.find((arg) => arg.startsWith('--confirm-tenant='))?.slice('--confirm-tenant='.length);
  if (argv.some((arg) => arg !== '--apply' && arg !== '--remove' && !/^--confirm-tenant=.+$/.test(arg))) fail('Unknown or empty argument.');
  if (apply && remove) fail('Choose --apply or --remove, not both.');
  if ((apply || remove) && confirm !== KEYOFEGYPT_TENANT) fail(`Writing requires --confirm-tenant=${KEYOFEGYPT_TENANT}.`);

  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  await connectDatabase();
  try {
    const today = todayInZone(DEFAULT_BOOKING_TIME_ZONE);
    if (apply) {
      console.log(JSON.stringify({ mode: 'applied', today, packages: await applyKeyOfEgyptPackages(today) }, null, 2));
      return;
    }
    if (remove) {
      console.log(JSON.stringify({ mode: 'removed', packages: await removeKeyOfEgyptPackages() }, null, 2));
      return;
    }
    console.log(JSON.stringify(await dryRunReport(today), null, 2));
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[keyofegypt-packages] ${error instanceof KeyOfEgyptPackageError ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
