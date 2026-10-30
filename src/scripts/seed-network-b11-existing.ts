/**
 * Batch B11, the four sites that already exist (30 October 2026). Fouad's list moves
 * `cairo-tour-from-hurghada`, `luxor-tour-from-hurghada`, `hurghada-snorkeling` and `cairo-night-cruise` onto
 * domains of their own. Each is an active tenant already, so this run never creates one, and it writes **no
 * tenant document at all, in any mode** — not a name, not a word of copy, not a colour, a domain, a contact, a
 * payment setting, a language, a notification setting, a currency, a logo, a dark logo or a favicon.
 *
 * `makadi-bay-safari` was in an earlier draft of this batch and has been dropped from it entirely (coordinator,
 * 30 October): the tenant has been `inactive` since 24 May, the client asked for it to be deduplicated with
 * `makadi-bay-safari-center`, and it must stay exactly as it is. Nothing here names it.
 *
 * **Correcting the record of 30 October.** An earlier version of this file described these sites from a local
 * database, not from production: `env.ts` calls `dotenv.config()` with no path, so `DOTENV_CONFIG_PATH` is
 * ignored and dotenv reads `.env` from the working directory. Run from a worktree that has no `.env`, the
 * connection fell back to the hard-coded `mongodb://localhost:27017/attractions-network` in `env.ts` rather than
 * the cluster. Everything below was re-read from production (`attraction-network.ffybpa.mongodb.net`, database
 * `attractions-network`) on 30 October; the full read is in `readiness-proof/2026-10-30-b11/`.
 *
 * What the four carry in production today: ninety-nine listings between them — forty-one on
 * `cairo-tour-from-hurghada`, thirty on `luxor-tour-from-hurghada`, nine on `hurghada-snorkeling` and nineteen on
 * `cairo-night-cruise`. All four sell in USD, which is what the client publishes in, so no currency has to change.
 * None of the ninety-nine is one of the client's published records. But, unlike the old shared catalogue, **every
 * one of them is owned by one of these four sites**, several were written in May and edited on 26 October, and one
 * — `horse-riding-hurghada`, listed on both Hurghada sites — carries a **confirmed booking**.
 *
 * So the plan for each site is:
 *   - create the client's real trips, built from the dated snapshot at the client's published prices, owned by the
 *     site, and written with `rating: 0` and `reviewCount: 0` as every network trip is;
 *   - and take off only what is safe to take off. Two rules refuse, and they come before the batch's own intent:
 *     a listing with a **booking of any status** is never taken off, and a listing **one of these four sites owns**
 *     is never taken off. Both are reported instead, with the reason, so nothing a guest bought and nothing a site
 *     wrote disappears without someone deciding. On the production read of 30 October those two rules refuse all
 *     ninety-nine, so this run creates fifteen trips and takes nothing off at all. That is the honest result, not
 *     a failure: replacing this content is a separate decision for the coordinator and the client.
 *   - where a listing ever does become safe to take off, taking it off is **unlisting** — this tenant's id is
 *     pulled from the record's `tenantIds` and nothing else about the record changes, so no other site is touched.
 *     A record only this site lists would be archived instead, keeping the status it had. Nothing is ever deleted.
 *   - leave every rating alone. Ninety-six of the ninety-nine carry a rating with no approved review behind it,
 *     but the records belong to these sites and are shown on up to seven tenants each, so clearing one is a
 *     decision of its own. The figures are reported, and `fix-network-unbacked-ratings.ts` is the tool for it.
 *
 * Two things this batch cannot do, recorded so they are not forgotten: the sites' own taglines and descriptions
 * live on the tenant record, which this script never writes, so the Luxor site's "leaves Makadi Bay" line has to
 * be added there in the step that connects the domain; and `makadi-bay-safari`'s mark in the coordinator's
 * `--logos` file has nowhere to go, since `--logos` belongs to `seed-network-sites.ts` and that site is no longer
 * in this batch.
 *
 * Held back, and why (each is a question for the client in the build report):
 * - `luxor-tour-from-hurghada` has no record that leaves from Hurghada. The client publishes twenty-seven trips
 *   that name Luxor and exactly one of them starts on the Red Sea coast: `makadi-bay-to-luxor-...`, whose own
 *   inclusions say "Hotel pickup and drop-off from your hotel in Makadi Bay". Settled by the coordinator on
 *   30 October: both of its options are sold here, and the start is stated plainly in every place a guest sees it —
 *   each trip's summary, the opening line of each description, a highlight and a "Need to know" line all say the
 *   day **leaves Makadi Bay, south of Hurghada**, and each trip is filed as starting there rather than in the town
 *   the domain names. **Owner follow-up: a Hurghada pickup would fit the domain better**, so if the client adds one
 *   this site should sell that instead. One thing this batch cannot do: the site's own tagline and description live
 *   on the tenant record, which this script never writes (see below), so the same line has to be added there in the
 *   step that connects the domain.
 * - `cairo-tour-from-hurghada` has exactly one record, `from-hurghada-cairo-...-citadel-day-trip`. Its Grand
 *   Egyptian Museum visit is an extra bound to no booking option (batch B09 recorded the same), so the museum is
 *   not sold and the day's own conditional line about it is left out. The day itself includes hotel pickup, so
 *   unlike the records held back below it can be sold.
 * - `from-hurghada-paradise-island-yacht-speedboat-cruise-with-snorkeling-lunch`: the record prices each of its
 *   two departures apart from the booking option itself — the nine o'clock slot costs more than the option says,
 *   and each slot charges a child the adult price while the option publishes a child price of half. The seed
 *   refuses a slot priced apart from its option, because selling it would charge a guest one price and show
 *   another, so the record is held back whole. Hurghada Snorkeling would have had one more trip.
 * - `hurghada-snorkeling` sells the days whose own record names snorkelling in its title. All eleven are
 *   already sold by batch B09's Hurghada boat site, which sells six more whose titles do not. Same-subject sites
 *   sharing a record was decided for batch B10; the split here is the word in the client's own title.
 *
 * Read-only check (the default; connects to the database, writes nothing):
 *   npm run seed:network-b11-existing
 * Apply, three sites at a time (owner, 25 October):
 *   npm run seed:network-b11-existing -- --apply --confirm-sites=a,b,c --journal-dir=<directory outside git>
 *
 * Run it from a directory whose `.env` is the one you mean: `env.ts` reads `.env` from the working directory and
 * ignores `DOTENV_CONFIG_PATH`, and falls back to a local database when it finds none.
 * Put those sites back exactly as they were:
 *   npm run seed:network-b11-existing -- --restore --confirm-sites=a,b,c --journal-dir=<the same directory>
 */
import fs from 'fs';
import path from 'path';
import {
  copiedFactProblems, eeoSourceProgramme, sourceKey, tripDocument, FOREIGN_BRANDS, UNBACKED_CLAIMS,
  type NetworkTrip, type PriceSpec, type TripSiteFacts,
} from './seed-network-sites';
import { NETWORK_CATEGORIES, retirePlan, type TripOnSite } from './seed-network-high-ten';
import { EEO_SOURCE, eeoLiveDrift, type EeoSnapshot } from './network-sites/eeo-source';
import SNAPSHOT from './network-sites/eeo-snapshot.json';
import { PROGRAMMES_D as B08D } from './network-sites/b08';
import { PROGRAMMES_A as B09A } from './network-sites/b09';

const EEO = EEO_SOURCE;
const WATER = 'water-activities';
const DAY_TRIPS = 'day-trips';
const ADVENTURES = 'adventures';
const CHILD_NOTE = 'Children have their own price, and the booking applies it. The team confirms which ages count as children when it confirms your booking.';

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{2714}\u{2728}]/u;
const PROCESS_MARKERS = /\b(seed|preview|placeholder|TODO|lorem|QA|staging|internal)\b/i;
/** The words of the catalogue these trips were written from; a guest never reads them. */
const CATALOGUE_TALK = /\bpublished\b|does not sell|\b(?:the|on|in the) record\b|snapshot|pretend/i;
const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\/dm3sxllch\/image\/upload\//;

/**
 * The five programmes written here, for records no earlier batch sells. Each one's pickup line is replaced by the
 * site's own words where the record states it in a form the seed cannot recognise, and every price, child rate,
 * departure and inclusion is copied from the snapshot at build time.
 */
export const PROGRAMMES = {
  // The Grand Egyptian Museum is an extra bound to no booking option, so it is not sold and the record's own
  // conditional line about it is left out. The record's schedule is its pickup areas and its van legs.
  CAIRO_FROM_HURGHADA: {
    provider: 'eeo',
    tenant: EEO,
    source: 'from-hurghada-cairo-pyramids-grand-egyptian-museum-citadel-day-trip',
    category: DAY_TRIPS,
    options: ['hurghada-cairo-pyramids-grand-museum-citadel--be8c73f90f01'],
    addons: [],
    departures: ['01:00'],
    departureLabels: { '01:00': 'Overnight start' },
    rename: {
      'hurghada-cairo-pyramids-grand-museum-citadel--be8c73f90f01': {
        name: 'Cairo in a day, by road',
        description: 'An air-conditioned minivan from your hotel in Hurghada, a guide for the day, the Giza plateau, the Citadel and lunch.',
      },
    },
    omit: {
      inclusions: [
        'Hotel pickup and drop-off',
        'Transportation by air-conditioned minivan',
        'Live tour guide',
        'Visit to the Grand Egyptian Museum ( if option selected)',
      ],
      exclusions: ['Nile trip'],
    },
    childNote: CHILD_NOTE,
    add: {
      inclusions: [
        'Hotel pickup and drop-off in Hurghada',
        'An air-conditioned minivan for the day',
        'A guide for the day',
      ],
      exclusions: ['The Grand Egyptian Museum', 'A trip on the Nile'],
      needToKnow: [
        'The van leaves Hurghada at one in the morning and the day runs about twenty-two hours: the road to Cairo is long each way.',
        'The Grand Egyptian Museum and a trip on the Nile are sold as extras by the operator and cannot be booked on this site. Ask the team before you book if you want either.',
      ],
    },
    itinerary: [
      { time: '01:00', title: 'Hotel pickup', description: 'An air-conditioned minivan collects you from your hotel in Hurghada.' },
      { title: 'The road to Cairo', description: 'The long drive north along the coast and across the desert.' },
      { title: 'The Citadel of Salah El-Din', description: 'The fortress above the city, with its mosque, walked with the guide.' },
      { title: 'The Giza plateau', description: 'The pyramids and the Great Sphinx with the guide.' },
      { title: 'Lunch', description: 'Lunch at a local restaurant.' },
      { title: 'Back to Hurghada', description: 'The drive back to your hotel.' },
    ],
  },
  // The shared and the private day leave at different hours, so each is sold as its own trip. The Spanish guide
  // is an extra bound to no booking option, so the record's conditional line is replaced by plain words.
  LUXOR_FROM_MAKADI_SHARED: {
    provider: 'eeo',
    tenant: EEO,
    source: 'makadi-bay-to-luxor-discover-the-valley-of-the-kings-king-tut-s-tomb',
    category: DAY_TRIPS,
    options: ['shared-tour-option-76af73858fc8'],
    addons: [],
    departures: ['04:00'],
    departureLabels: { '04:00': 'Before dawn' },
    rename: {
      'shared-tour-option-76af73858fc8': {
        name: 'Shared day in Luxor',
        description: 'A shared air-conditioned minivan, an Egyptologist guide, lunch in Luxor and the entry tickets for the four sites the day visits.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { exclusions: ['Spanish guide (available as an add-on)'] },
    add: {
      inclusions: ['Hotel pickup and drop-off in Makadi Bay'],
      needToKnow: [
        'The day leaves Makadi Bay, south of Hurghada, where the minivan collects you, and it is sixteen hours long: the road to Luxor is about four hours each way.',
        'The guide speaks English, French or German. A guide in Spanish costs extra and cannot be booked on this site.',
        'Bring your passport or an identity card; a copy is accepted.',
      ],
    },
    itinerary: [
      { time: '04:00', title: 'Hotel pickup', description: 'An air-conditioned minivan collects you from your hotel in Makadi Bay.' },
      { title: 'The road to Luxor', description: 'The drive inland to the Nile valley.' },
      { title: 'Karnak Temple', description: 'The temple complex with the guide, and its hall of columns.' },
      { title: 'Lunch', description: 'Lunch at a local restaurant in Luxor.' },
      { title: 'A short felucca ride', description: 'A sail across the Nile to the west bank.' },
      { title: 'The Valley of the Kings', description: 'Three royal tombs, the tomb of Tutankhamun among them, with the tickets covered.' },
      { title: 'The Temple of Hatshepsut', description: 'The terraces cut into the cliff at Deir el-Bahari.' },
      { title: 'The Colossi of Memnon', description: 'A stop at the two seated statues on the plain.' },
      { title: 'Back to your hotel', description: 'The drive back to your hotel in Makadi Bay.' },
    ],
  },
  LUXOR_FROM_MAKADI_PRIVATE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'makadi-bay-to-luxor-discover-the-valley-of-the-kings-king-tut-s-tomb',
    category: DAY_TRIPS,
    options: ['private-tour-option-62f3c32eec8e'],
    addons: [],
    departures: ['05:00'],
    departureLabels: { '05:00': 'Early morning' },
    rename: {
      'private-tour-option-62f3c32eec8e': {
        name: 'Private day in Luxor',
        description: 'Your own air-conditioned minivan and Egyptologist guide, lunch in Luxor and the entry tickets for the four sites the day visits.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { exclusions: ['Spanish guide (available as an add-on)'] },
    add: {
      inclusions: ['Hotel pickup and drop-off in Makadi Bay'],
      needToKnow: [
        'The day leaves Makadi Bay, south of Hurghada, where the minivan collects you, and it is sixteen hours long: the road to Luxor is about four hours each way.',
        'The guide speaks English, French or German. A guide in Spanish costs extra and cannot be booked on this site.',
        'Bring your passport or an identity card; a copy is accepted.',
      ],
    },
    itinerary: [
      { time: '05:00', title: 'Hotel pickup', description: 'Your own air-conditioned minivan collects you from your hotel in Makadi Bay.' },
      { title: 'The road to Luxor', description: 'The drive inland to the Nile valley.' },
      { title: 'Karnak Temple', description: 'The temple complex with your own guide, and its hall of columns.' },
      { title: 'Lunch', description: 'Lunch at a local restaurant in Luxor.' },
      { title: 'A short felucca ride', description: 'A sail across the Nile to the west bank.' },
      { title: 'The Valley of the Kings', description: 'Three royal tombs, the tomb of Tutankhamun among them, with the tickets covered.' },
      { title: 'The Temple of Hatshepsut', description: 'The terraces cut into the cliff at Deir el-Bahari.' },
      { title: 'The Colossi of Memnon', description: 'A stop at the two seated statues on the plain.' },
      { title: 'Back to your hotel', description: 'The drive back to your hotel in Makadi Bay.' },
    ],
  },
} satisfies Record<string, PriceSpec>;

/** Every programme the five sites sell: twelve from the batches that first wrote them, five written above. */
const P = {
  ...PROGRAMMES,
  DINNER_CRUISE: B08D.EGM_DINNER_CRUISE,
  HULA_SPEEDBOAT: B09A.HBT_HULA_SPEEDBOAT,
  ORANGE_MASSAGE: B09A.HBT_ORANGE_MASSAGE,
  INTRO_DIVE_YACHT: B09A.HBT_INTRO_DIVE_YACHT,
  ORANGE_YACHT: B09A.HBT_ORANGE_YACHT,
  SEMI_SUBMARINE: B09A.HBT_SEMI_SUBMARINE,
  BANANA: B09A.HBT_BANANA,
  DOLPHIN_WATCH: B09A.HBT_DOLPHIN_WATCH,
  SPEEDBOAT_SNORKEL: B09A.HBT_SPEEDBOAT_SNORKEL,
  SIX_ISLANDS: B09A.HBT_SIX_ISLANDS,
  ORANGE_DIVE: B09A.HBT_ORANGE_DIVE,
  SUNSET: B09A.HBT_SUNSET,
} satisfies Record<string, PriceSpec>;

/** Each record's own photo, as the client publishes it, with the Hurghada set as batch B09 chose it. */
const PHOTO = {
  camelsAtGiza: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788791945/tours/yjqr6fs1oba2lvki3z6j.jpg',
  paintedTomb: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788292235/tours/z3ccgjomvqg4seawox1i.jpg',
  citadelMosque: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085642/attractions-network/network-b08/egyptian-museum/ujbyb8aj5cxiaqgtiboj.jpg',
  hulaHulaSign: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795095/tours/daplx8xddplpnqmxbmhp.jpg',
  beachClub: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788289814/tours/mqucr1dumbvdnyqejzc6.jpg',
  diverOverReef: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795165/tours/qrhdatgwm8zww53clwpq.jpg',
  bowOverLagoon: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787782233/tours/wirlheh3pj6ibboavetn.jpg',
  semiSubmarine: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788290690/tours/g2uozxnbzbkcu1gnhanf.jpg',
  snorkellerByCoralWall: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781999/tours/n4iiykztyszzlhk5mavf.jpg',
  speedboatAtSpeed: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787782177/tours/tpfuorpe6kgzzx78smwe.jpg',
  snorkellerThumbsUp: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788290961/tours/pxb310hq6keozafoaqdx.jpg',
  snorkellerOverCoral: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788291087/tours/a5hjhquanje6nm8wbsbf.jpg',
  diversDescending: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788292330/tours/qgmeqrxj4kngqfei9snq.jpg',
  sailboatAtSunset: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788796522/tours/jxzuelgfb5r9vdl36xoa.jpg',
};

/** Each photo described as it is, not as the trip it illustrates. */
const ALT: Record<keyof typeof PHOTO, string> = {
  camelsAtGiza: 'A line of riders on camels crossing the sand at Giza, with three pyramids and the smaller queens’ pyramids behind under a clear blue sky',
  paintedTomb: 'The painted wall of a royal tomb, covered in rows of hieroglyphs and figures in red, yellow and blue, with a blue-painted rock formation in front',
  citadelMosque: 'A large mosque with a central dome, half-domes and two tall minarets against a clear sky, with flags flying beside it',
  hulaHulaSign: 'A carved wooden sign reading Hula Hula on a white beach, with straw sunshades and turquoise water behind',
  beachClub: 'A beach club of wooden decks and terraces on a sandy shore, with shallow turquoise water in front',
  diverOverReef: 'A scuba diver with arms spread over a coral reef, with striped fish nearby',
  bowOverLagoon: 'The white bow of a boat heading across a turquoise lagoon towards a low sandy shore',
  semiSubmarine: 'A yellow semi-submarine boat with passengers on its deck, moving fast across blue water',
  snorkellerByCoralWall: 'A snorkeller in a mask and wetsuit swimming beside a coral wall',
  speedboatAtSpeed: 'A white and blue speedboat at speed on calm blue sea, with spray at its stern',
  snorkellerThumbsUp: 'A snorkeller in a mask giving a thumbs-up underwater in deep blue water',
  snorkellerOverCoral: 'A snorkeller in a mask taking a photo of himself underwater above a coral reef',
  diversDescending: 'A scuba diver descending through blue water above a reef, with other divers below',
  sailboatAtSunset: 'A sailing boat on calm water with the sun setting low behind it',
};

const HURGHADA = { lat: 27.2579, lng: 33.8116 };
const MAKADI_BAY = { lat: 26.9956, lng: 33.8955 };
const CAIRO = { lat: 30.0444, lng: 31.2357 };

/** The Luxor day starts in Makadi Bay, not in the town the site is named for; every trip says so. */
const FROM_MAKADI = { city: 'Makadi Bay', area: 'Makadi Bay', coordinates: MAKADI_BAY };

const NOT_MAKADI = /Cairo|Giza|Luxor|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Hurghada|Safaga|Soma Bay|Gouna|Sahl|Alexandria|Siwa|Bahariya|Fayoum/i;
/** The day to Cairo leaves from Hurghada and visits Cairo and Giza, so those three towns are its own. */
const NOT_CAIRO_DAY = /Luxor|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Gouna|Sahl|Makadi|Alexandria|Siwa|Bahariya|Fayoum/i;
/** The day to Luxor leaves from Makadi Bay and spends itself in Luxor, so those two towns are its own. */
const NOT_LUXOR_DAY = /Cairo|Giza|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Gouna|Sahl|Alexandria|Siwa|Bahariya|Fayoum/i;
/** The Hurghada water days, exactly as batch B09's boat site reads them. */
const NOT_HURGHADA = /Cairo|Giza|Luxor|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Gouna|Sahl|Makadi|Alexandria|Siwa|Bahariya|Fayoum|Sataya|Samadai/i;
/** The Nile dinner cruise stays in Cairo and Giza. */
const NOT_CAIRO = /Hurghada|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum/i;

export interface ExistingSite extends TripSiteFacts {
  /** The tenant that already exists. This run refuses to create one. */
  slug: string;
  name: string;
  /** The domain Fouad's list moves the site onto. Recorded here; this run never writes it. */
  domain: string;
  /** The storefront design the network build queue gives the site, picked by slug on the storefront. */
  design: string;
  /** The one category every trip this site creates is filed under. */
  category: (typeof NETWORK_CATEGORIES)[number];
  /** Trips on the site today that have a record behind them; this run leaves them alone. */
  keep: string[];
  /** Trips on the site today with no record behind them; this run takes them off. */
  retire: string[];
  trips: NetworkTrip[];
}

export interface ExistingBatch { id: string; readAt: string; sites: ExistingSite[] }

/**
 * The five sites, with the demo listings each carries today. `retire` is the exact list read from production on
 * 30 October 2026; a trip that is no longer there, or one on the site that this file does not name, stops the run
 * rather than being guessed at.
 */
export const B11_EXISTING: ExistingBatch = {
  id: 'b11-existing',
  readAt: '2026-10-30',
  sites: [
    {
      slug: 'cairo-tour-from-hurghada',
      name: 'Cairo Tour From Hurghada',
      domain: 'cairotourfromhurghada.com',
      design: 'cairoday',
      listingPath: '/trips',
      city: 'Hurghada',
      area: 'Hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'cth-',
      category: DAY_TRIPS,
      foreignPlaces: NOT_CAIRO_DAY,
      keep: [],
      retire: [
        'cairo-2-days-trip-bus',
        'cairo-citadel-mosque-tour',
        'cairo-day-trip-pyramids-museum',
        'cairo-food-street-tour',
        'cairo-night-cruise',
        'cairo-old-city-walking-tour',
        'cairo-overnight-pyramids-khan-khalili',
        'cairo-private-day-car-felucca',
        'cairo-private-tour-hurghada-bus',
        'cairo-private-tour-plane',
        'cairo-private-vip-tour-hurghada',
        'cairo-pyramids-nile-dinner-cruise',
        'cairo-pyramids-sakkara-dahshur',
        'cairo-quad-bike-pyramids',
        'cairo-small-group-tour-bus',
        'cairo-sound-light-show-pyramids',
        'cairo-sunset-felucca-ride',
        'cairo-tour-from-hurghada',
        'cairo-tour-from-hurghada-experience',
        'cairo-tours-packages',
        'camel-riding-hurghada',
        'egyptian-museum-vip-tour',
        'giftun-island-hurghada',
        'horse-riding-hurghada',
        'hurghada-beginner-guided-reef-snorkel',
        'hurghada-dolphin-house-snorkel-trip',
        'hurghada-fishing',
        'hurghada-giftun-island-snorkel-beach-day',
        'hurghada-luxury-cruise',
        'hurghada-orange-bay-snorkel-beach-day',
        'hurghada-private-snorkel-boat-charter',
        'hurghada-private-tours',
        'hurghada-snorkeling',
        'hurghada-sunset-snorkel-cruise',
        'hurghada-three-reef-snorkel-safari',
        'orange-bay-tours',
        'parasailing-hurghada',
        'pyramids-excursions',
        'ramadan-iftar-cruise',
        'test-abc-123',
        'test-with-addons-xyz',
      ],
      trips: [
        {
          path: 'cairo-in-a-day-by-road',
          price: P.CAIRO_FROM_HURGHADA,
          title: 'Cairo in a Day from Hurghada, by Road',
          short: 'The Giza plateau, the Great Sphinx and the Citadel in one long day, with a guide, lunch and hotel pickup in Hurghada.',
          description: 'The minivan leaves at one in the morning, which is what it takes to be standing in front of the pyramids by the middle of the day and back at your hotel the same night. The road runs north along the coast and then inland, and you sleep most of it.\n\nThe day itself is the Citadel of Salah El-Din above the city, the Giza plateau with its pyramids and the Great Sphinx, and lunch at a restaurant in between. A guide is with you throughout and the vehicle is air-conditioned. Pickup from your hotel in Hurghada and the drive back are included.',
          highlights: [
            'The Giza plateau and the Great Sphinx',
            'The Citadel of Salah El-Din above the city',
            'A guide for the whole day and lunch included',
            'Hotel pickup in Hurghada and the drive back',
          ],
          seo: {
            metaTitle: 'Cairo Day Trip from Hurghada by Road, with a Guide',
            metaDescription: 'A long day from Hurghada to the Giza pyramids, the Great Sphinx and the Citadel, with a guide, lunch and hotel pickup.',
          },
          images: [PHOTO.camelsAtGiza],
          imageAlts: [ALT.camelsAtGiza],
        },
      ],
    },
    {
      slug: 'luxor-tour-from-hurghada',
      name: 'Luxor Tour From Hurghada',
      domain: 'luxortourfromhurghada.com',
      design: 'luxorday',
      listingPath: '/trips',
      city: 'Hurghada',
      area: 'Hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'lth-',
      category: DAY_TRIPS,
      foreignPlaces: NOT_LUXOR_DAY,
      keep: [],
      retire: [
        '5-day-nile-cruise-luxor-aswan',
        'camel-riding-hurghada',
        'giftun-island-hurghada',
        'horse-riding-hurghada',
        'hurghada-2-day-luxor-hot-air-balloon',
        'hurghada-beginner-guided-reef-snorkel',
        'hurghada-dolphin-house-snorkel-trip',
        'hurghada-fishing',
        'hurghada-giftun-island-snorkel-beach-day',
        'hurghada-luxury-cruise',
        'hurghada-orange-bay-snorkel-beach-day',
        'hurghada-private-snorkel-boat-charter',
        'hurghada-private-tours',
        'hurghada-snorkeling',
        'hurghada-sunset-snorkel-cruise',
        'hurghada-three-reef-snorkel-safari',
        'luxor-air-balloon',
        'luxor-day-trip-hurghada-bus',
        'luxor-day-trip-valley-kings',
        'luxor-express-karnak-valley-kings',
        'luxor-hot-air-balloon-temples',
        'luxor-overnight-dendera-abydos',
        'luxor-private-full-day-east-west',
        'luxor-tour-from-hurghada',
        'luxor-tour-from-hurghada-excursion',
        'luxor-two-days-trip-hurghada',
        'orange-bay-tours',
        'overnight-tour-luxor-abu-simbel',
        'parasailing-hurghada',
        'private-luxor-tour-hurghada-car',
      ],
      trips: [
        {
          path: 'shared-day-in-luxor',
          price: P.LUXOR_FROM_MAKADI_SHARED,
          title: 'Shared Day in Luxor: the Valley of the Kings and Karnak',
          short: 'Sixteen hours to Luxor and back in a shared minivan, with an Egyptologist guide, lunch and the entry tickets. It leaves Makadi Bay, south of Hurghada.',
          description: 'The day leaves Makadi Bay, south of Hurghada: the minivan collects you there at four in the morning and drives inland to the Nile valley. Karnak comes first, the temple complex with its hall of columns, then lunch at a restaurant in Luxor and a short sail across the river on a felucca.\n\nThe west bank is the afternoon: three royal tombs in the Valley of the Kings including Tutankhamun’s, the terraces of the Temple of Hatshepsut cut into the cliff, and a stop at the Colossi of Memnon. The entry tickets for all four are in the price, with the guide and the lunch.',
          highlights: [
            'Three tombs in the Valley of the Kings, Tutankhamun’s among them',
            'Karnak Temple and the Temple of Hatshepsut',
            'An Egyptologist guide and lunch in Luxor',
            'The entry tickets and hotel pickup in Makadi Bay, south of Hurghada',
          ],
          seo: {
            metaTitle: 'Shared Luxor Day Trip: Valley of the Kings and Karnak',
            metaDescription: 'A sixteen-hour shared day to Luxor with the Valley of the Kings, Karnak, Hatshepsut, a guide, lunch and the entry tickets.',
          },
          images: [PHOTO.paintedTomb],
          imageAlts: [ALT.paintedTomb],
          where: FROM_MAKADI,
        },
        {
          path: 'private-day-in-luxor',
          price: P.LUXOR_FROM_MAKADI_PRIVATE,
          title: 'Private Day in Luxor: the Valley of the Kings and Karnak',
          short: 'The same day with your own minivan and guide, and a five o’clock start. It leaves Makadi Bay, south of Hurghada.',
          description: 'The private way to make the crossing to Luxor, and it leaves Makadi Bay, south of Hurghada: your own air-conditioned minivan and your own Egyptologist guide, and an hour’s later start because you are not collecting anyone else.\n\nThe day is Karnak with its hall of columns, lunch at a restaurant in Luxor, a short sail across the Nile, then three royal tombs in the Valley of the Kings including Tutankhamun’s, the Temple of Hatshepsut and the Colossi of Memnon. The entry tickets for all four are in the price, and children have their own.',
          highlights: [
            'Your own guide and minivan for the whole day',
            'Three tombs in the Valley of the Kings, Tutankhamun’s among them',
            'Karnak, Hatshepsut and the Colossi of Memnon',
            'The entry tickets, lunch and hotel pickup in Makadi Bay, south of Hurghada',
          ],
          seo: {
            metaTitle: 'Private Luxor Day Trip: Valley of the Kings and Karnak',
            metaDescription: 'A private sixteen-hour day to Luxor with your own guide and minivan, the Valley of the Kings, Karnak, lunch and the entry tickets.',
          },
          images: [PHOTO.paintedTomb],
          imageAlts: [ALT.paintedTomb],
          where: FROM_MAKADI,
        },
      ],
    },
    {
      slug: 'hurghada-snorkeling',
      name: 'Hurghada Snorkeling',
      domain: 'hurghadasnorkeling.com',
      design: 'hrgsnorkel',
      listingPath: '/trips',
      city: 'Hurghada',
      area: 'Hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'hsn-',
      category: WATER,
      foreignPlaces: NOT_HURGHADA,
      keep: [],
      retire: [
        'giftun-island-hurghada',
        'hurghada-beginner-guided-reef-snorkel',
        'hurghada-dolphin-house-snorkel-trip',
        'hurghada-giftun-island-snorkel-beach-day',
        'hurghada-orange-bay-snorkel-beach-day',
        'hurghada-private-snorkel-boat-charter',
        'hurghada-snorkeling',
        'hurghada-sunset-snorkel-cruise',
        'hurghada-three-reef-snorkel-safari',
      ],
      trips: [
        {
          path: 'speedboat-snorkelling-trip',
          price: P.SPEEDBOAT_SNORKEL,
          title: 'Speedboat Snorkelling Trip',
          short: 'A four-hour speedboat trip over the reefs off Hurghada, with the gear, drinks and fruit aboard.',
          description: 'A speedboat is over the reef within minutes of leaving the marina, which is the whole point of taking one: the time a day boat spends motoring out is time you spend in the water. There are two starts, one at eight and one after lunch.\n\nThe guide takes you in at the snorkelling stops, the mask, snorkel, fins and life jackets are aboard, and there is a shaded area on deck. Drinks and seasonal fruit are served, the nature reserve fees are covered, and pickup from your hotel in Hurghada is included.',
          highlights: [
            'Over the reef within minutes of leaving',
            'A morning or an afternoon start',
            'Gear, life jackets and a shaded deck',
            'Drinks, fruit and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Hurghada Speedboat Snorkelling Trip with Pickup',
            metaDescription: 'A four-hour speedboat snorkelling trip over the reefs off Hurghada, with the gear, drinks and fruit aboard and hotel pickup.',
          },
          images: [PHOTO.snorkellerThumbsUp],
          imageAlts: [ALT.snorkellerThumbsUp],
        },
        {
          path: 'six-islands-by-speedboat',
          price: P.SIX_ISLANDS,
          title: 'Six Islands by Speedboat with Three Snorkelling Stops',
          short: 'A full day around six islands off Hurghada with three guided snorkelling stops and the island entry fees.',
          description: 'Six islands in a day is a speedboat’s kind of trip: quick enough between them that the day is spent at the stops rather than on the way. The route takes in Orange Bay, White Island, Magawish, Abu Minqar and a sandbank, and the entry fees for them are in the price.\n\nThere are three guided snorkelling stops, one of them over a wreck, with the gear and life jackets aboard. Drinks and seasonal fruit are served, the captain watches for dolphins in the open water, and pickup from your hotel in Hurghada is included. Lunch is not part of this price.',
          highlights: [
            'Six islands in one day',
            'Three guided snorkelling stops, one over a wreck',
            'The island entry fees included',
            'Drinks and fruit aboard, with hotel pickup',
          ],
          seo: {
            metaTitle: 'Six Islands Snorkelling Day by Speedboat, Hurghada',
            metaDescription: 'A full day around six islands off Hurghada with three guided snorkelling stops, the island entry fees and hotel pickup.',
          },
          images: [PHOTO.snorkellerOverCoral],
          imageAlts: [ALT.snorkellerOverCoral],
        },
        {
          path: 'dolphin-watching-and-snorkelling-by-speedboat',
          price: P.DOLPHIN_WATCH,
          title: 'Dolphin Watching and Snorkelling by Speedboat',
          short: 'A speedboat into open water to look for dolphins, with two or three snorkelling stops. This option makes no island stop.',
          description: 'This is the trip that spends its time in open water rather than queueing at a beach. The captain looks for dolphins, and if they are there and the sea allows it you can swim near them — but they are wild animals and no boat can promise a sighting.\n\nBetween the looking there are two or three guided snorkelling stops, with the gear and life jackets aboard, and drinks and fruit are served on the boat. There are two starts, morning and early afternoon. This is the option that does not stop at an island, and pickup from your hotel in Hurghada is included.',
          highlights: [
            'Open water by speedboat, looking for dolphins',
            'Two or three guided snorkelling stops',
            'Gear, life jackets, drinks and fruit aboard',
            'A morning or an afternoon start, with hotel pickup',
          ],
          seo: {
            metaTitle: 'Dolphin Watching and Snorkelling Speedboat, Hurghada',
            metaDescription: 'A speedboat trip from Hurghada looking for dolphins, with two or three guided snorkelling stops and hotel pickup. No island stop.',
          },
          images: [PHOTO.speedboatAtSpeed],
          imageAlts: [ALT.speedboatAtSpeed],
        },
        {
          path: 'hula-hula-island-by-speedboat',
          price: P.HULA_SPEEDBOAT,
          title: 'Hula Hula Island by Speedboat',
          short: 'Four hours out to the Hula Hula beach by speedboat, with a guided snorkelling stop and the entry ticket.',
          description: 'Hula Hula is a stretch of white sand with straw sunshades and shallow turquoise water in front of it, and the speedboat is there in a fraction of the time a day boat takes. There are two starts, morning and early afternoon, and the island entry ticket is in the price.\n\nThe crew makes a guided snorkelling stop, the gear and life jackets are aboard, and the rest of the time is yours on the beach. Fruit and soft drinks are served, and pickup from your hotel in Hurghada is included.',
          highlights: [
            'The Hula Hula beach by fast boat',
            'A guided snorkelling stop',
            'The island entry ticket included',
            'Fruit, soft drinks and hotel pickup',
          ],
          seo: {
            metaTitle: 'Hula Hula Island Speedboat and Snorkelling Trip',
            metaDescription: 'A four-hour speedboat trip from Hurghada to the Hula Hula beach, with a guided snorkelling stop, the entry ticket and hotel pickup.',
          },
          images: [PHOTO.hulaHulaSign],
          imageAlts: [ALT.hulaHulaSign],
        },
        {
          path: 'orange-bay-yacht-with-breakfast',
          price: P.ORANGE_YACHT,
          title: 'Orange Bay by Yacht with Breakfast and Lunch',
          short: 'A yacht day to Orange Bay with snorkelling stops, breakfast, lunch and drinks aboard.',
          description: 'A full day on a yacht out to Orange Bay, the long white sandbar with shallow water either side of it. The boat stops over the reefs on the way for snorkelling, with the gear aboard and a guide in the water.\n\nBreakfast is served after the boat leaves, lunch during the day, and drinks throughout. The rest of the time is spent on the sand or in the shallows. Pickup from your hotel in Hurghada and the drive back are included.',
          highlights: [
            'A full yacht day to the Orange Bay sandbar',
            'Snorkelling stops with the gear aboard',
            'Breakfast, lunch and drinks served',
            'Hotel pickup and drop-off included',
          ],
          seo: {
            metaTitle: 'Orange Bay Yacht Day with Snorkelling and Lunch',
            metaDescription: 'A yacht day from Hurghada to Orange Bay with snorkelling stops, breakfast, lunch, drinks aboard and hotel pickup.',
          },
          images: [PHOTO.bowOverLagoon],
          imageAlts: [ALT.bowOverLagoon],
        },
        {
          path: 'orange-bay-cruise-with-massage',
          price: P.ORANGE_MASSAGE,
          title: 'Orange Bay Cruise with Snorkelling, a Massage and Lunch',
          short: 'A day to Orange Bay with snorkelling stops, lunch and a massage on board.',
          description: 'The same sandbar, taken slowly. The boat leaves early, stops over the reefs for snorkelling with the gear and a guide, and ties up at Orange Bay for the middle of the day.\n\nA massage is given on board, lunch is served, and the rest of the day is yours between the beach club on the shore and the water in front of it. Pickup from your hotel in Hurghada and the drive back are included.',
          highlights: [
            'Snorkelling stops over the reefs',
            'A massage given on board',
            'Lunch served during the day',
            'Hotel pickup and drop-off included',
          ],
          seo: {
            metaTitle: 'Orange Bay Snorkelling Cruise with a Massage',
            metaDescription: 'A day cruise from Hurghada to Orange Bay with snorkelling stops, lunch and a massage on board, with hotel pickup.',
          },
          images: [PHOTO.beachClub],
          imageAlts: [ALT.beachClub],
        },
        {
          path: 'orange-bay-snorkelling-and-diving-day',
          price: P.ORANGE_DIVE,
          title: 'Orange Bay Snorkelling and Diving Day',
          short: 'A full day at Orange Bay with snorkelling over the reefs and a first dive for those who want one.',
          description: 'A day for a group that cannot agree: the snorkellers go over the side at each reef stop with the gear and a guide, and anyone who wants to try breathing underwater can take a first dive with an instructor instead.\n\nNo certificate is needed for the dive, which is supervised throughout, and the rest of the day is spent at Orange Bay. Lunch is served on board. Pickup from your hotel in Hurghada and the drive back are included.',
          highlights: [
            'Snorkelling over the reefs with a guide',
            'A first dive with an instructor, no certificate needed',
            'A full day at Orange Bay',
            'Lunch aboard and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Orange Bay Snorkelling and First-Dive Day',
            metaDescription: 'A full day from Hurghada at Orange Bay with guided snorkelling, an optional first dive with an instructor, lunch and hotel pickup.',
          },
          images: [PHOTO.diversDescending],
          imageAlts: [ALT.diversDescending],
        },
        {
          path: 'yacht-day-with-an-introductory-dive',
          price: P.INTRO_DIVE_YACHT,
          title: 'Yacht Day with Snorkelling and an Introductory Dive',
          short: 'A yacht day over the reefs with snorkelling, an introductory dive, a massage and lunch aboard.',
          description: 'The boat leaves early and spends the day between reef stops, with the snorkelling gear aboard and a guide in the water at each one. An introductory dive is part of the day for anyone who wants to go deeper, taken with an instructor.\n\nThere is a massage on board, lunch is served, and the day includes a stop at an island. Pickup from your hotel in Hurghada and the drive back are included.',
          highlights: [
            'Snorkelling at the reef stops with a guide',
            'An introductory dive with an instructor',
            'A massage on board and lunch served',
            'Hotel pickup and drop-off included',
          ],
          seo: {
            metaTitle: 'Hurghada Yacht Day: Snorkelling and a First Dive',
            metaDescription: 'A yacht day from Hurghada with guided snorkelling, an introductory dive, a massage on board, lunch and hotel pickup.',
          },
          images: [PHOTO.diverOverReef],
          imageAlts: [ALT.diverOverReef],
        },
        {
          path: 'semi-submarine-and-snorkelling',
          price: P.SEMI_SUBMARINE,
          title: 'Semi-Submarine Cruise with Snorkelling',
          short: 'Three hours on a semi-submarine over the reef, with a snorkelling stop and two starts to choose from.',
          description: 'A semi-submarine runs with its hull below the surface and its deck above it, so the reef is watched through windows from a dry seat. It is the way to take children, or anyone who would rather not put their face in the water.\n\nThere is a snorkelling stop for those who do want to swim, with the gear aboard. The trip is three hours, there are two starts, and pickup from your hotel in Hurghada and the drive back are included.',
          highlights: [
            'The reef watched through windows from a dry seat',
            'A snorkelling stop for those who want one',
            'A morning or an afternoon start',
            'Hotel pickup and drop-off included',
          ],
          seo: {
            metaTitle: 'Hurghada Semi-Submarine Cruise with Snorkelling',
            metaDescription: 'A three-hour semi-submarine cruise over the reefs off Hurghada with a snorkelling stop and hotel pickup.',
          },
          images: [PHOTO.semiSubmarine],
          imageAlts: [ALT.semiSubmarine],
        },
        {
          path: 'afternoon-yacht-and-snorkelling',
          price: P.SUNSET,
          title: 'Afternoon Yacht Cruise with Snorkelling',
          short: 'Five hours out in the afternoon with snorkelling stops, and the sun going down on the way back.',
          description: 'The boat leaves in the middle of the afternoon, which most of the fleet has already come back from, so the reefs are quieter than they were in the morning. There are snorkelling stops with the gear aboard and a guide in the water.\n\nThe sun is low by the time the boat turns for the marina, and the light on the water is the reason to take this one rather than the morning. Pickup from your hotel in Hurghada and the drive back are included.',
          highlights: [
            'An afternoon start, when the reefs are quieter',
            'Snorkelling stops with the gear aboard',
            'The sun low on the way back',
            'Hotel pickup and drop-off included',
          ],
          seo: {
            metaTitle: 'Afternoon Yacht and Snorkelling Cruise, Hurghada',
            metaDescription: 'A five-hour afternoon yacht cruise from Hurghada with snorkelling stops, a guide in the water and hotel pickup.',
          },
          images: [PHOTO.sailboatAtSunset],
          imageAlts: [ALT.sailboatAtSunset],
        },
        {
          path: 'water-sports-and-snorkelling',
          price: P.BANANA,
          title: 'Water Sports and Snorkelling on the Reef',
          short: 'A banana boat and a sofa ride with a snorkelling stop, with eight starts through the day.',
          description: 'A short trip for the part of the group that wants to be thrown about rather than float quietly: a banana boat and a sofa ride towed behind the speedboat, with a snorkelling stop over the reef in between.\n\nThe gear and life jackets are aboard, and there are eight starts spread across the day, so this is the one to take around whatever else you have planned. Pickup from your hotel in Hurghada and the drive back are included.',
          highlights: [
            'A banana boat and a sofa ride',
            'A snorkelling stop over the reef',
            'Eight starts through the day',
            'Gear, life jackets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Hurghada Water Sports and Reef Snorkelling Trip',
            metaDescription: 'A banana boat and sofa ride off Hurghada with a snorkelling stop over the reef, the gear aboard and hotel pickup.',
          },
          images: [PHOTO.snorkellerByCoralWall],
          imageAlts: [ALT.snorkellerByCoralWall],
        },
      ],
    },
    {
      slug: 'cairo-night-cruise',
      name: 'Cairo Night Cruise',
      domain: 'caironightcruise.com',
      design: 'nightnile',
      listingPath: '/trips',
      city: 'Cairo',
      area: 'Cairo or Giza',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'cnc-',
      category: DAY_TRIPS,
      foreignPlaces: NOT_CAIRO,
      keep: [],
      retire: [
        'cairo-citadel-mosque-tour',
        'cairo-food-street-tour',
        'cairo-night-cruise',
        'cairo-old-city-walking-tour',
        'cairo-quad-bike-pyramids',
        'cairo-sound-light-show-pyramids',
        'cairo-sunset-felucca-ride',
        'cairo-tour-from-hurghada',
        'cairo-tours-packages',
        'classic-5-course-nile-dinner',
        'couples-anniversary-cruise',
        'egyptian-museum-vip-tour',
        'family-cruise-kids-menu',
        'late-night-jazz-felucca',
        'private-yacht-charter',
        'pyramids-excursions',
        'ramadan-iftar-cruise',
        'sunset-felucca-dinner',
        'tanoura-folkloric-dinner',
      ],
      trips: [
        {
          path: 'museum-citadel-old-cairo-and-a-nile-dinner-cruise',
          price: P.DINNER_CRUISE,
          title: 'A Day in Cairo Ending with a Nile Dinner Cruise',
          short: 'The Egyptian Museum, the Citadel and Coptic Cairo by day, then dinner on the river with a show.',
          description: 'The dinner cruise is what the day is built towards. Before it there is the Egyptian Museum on Tahrir Square, the Citadel above the city with the mosque of Muhammad Ali inside its walls, and the churches of Coptic Cairo, all walked with a private guide.\n\nWhen the light goes, the boat casts off for dinner on the Nile, with the city lit on both banks and a show on board. Your own vehicle takes you between the stops, the entrance fees and lunch are in the price, and children have their own.',
          highlights: [
            'Dinner on the Nile with the city lit on both banks',
            'The Egyptian Museum on Tahrir Square',
            'The Citadel and the mosque of Muhammad Ali',
            'A private guide, the entrance fees and lunch',
          ],
          seo: {
            metaTitle: 'Cairo Day and Nile Dinner Cruise, with Hotel Pickup',
            metaDescription: 'A private day at the Egyptian Museum, the Citadel and Coptic Cairo, ending with dinner and a show on the Nile. Hotel pickup included.',
          },
          images: [PHOTO.citadelMosque],
          imageAlts: [ALT.citadelMosque],
        },
      ],
    },
  ],
};

const copyOf = (trip: NetworkTrip) => [trip.title, trip.short, trip.description, ...trip.highlights,
  trip.seo.metaTitle, trip.seo.metaDescription, ...trip.imageAlts].join('\n');

const specCopyOf = (trip: NetworkTrip) => [
  ...Object.values(trip.price.rename || {}).flatMap((words) => [words.name, words.description]),
  ...Object.values(trip.price.extras || {}).flatMap((words) => [words.name, words.description]),
  trip.price.childNote || '',
  ...Object.values(trip.price.departureLabels || {}),
  ...(trip.price.itinerary || []).flatMap((step) => [step.title, step.description]),
  ...(trip.price.add?.inclusions || []), ...(trip.price.add?.exclusions || []), ...(trip.price.add?.needToKnow || []),
].join('\n');

/** Every rule that can be checked without the database. An empty list is a valid batch. */
export function validateExisting(batch: ExistingBatch): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const tripSlugs = new Set<string>();
  for (const site of batch.sites) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(site.slug)) errors.push(`${site.slug}: invalid site slug.`);
    if (seen.has(site.slug)) errors.push(`${site.slug}: the batch names this site twice.`);
    seen.add(site.slug);
    if (site.currency !== 'USD') errors.push(`${site.slug}: the client's records are priced in USD.`);
    if (!/^[a-z]+$/.test(site.design)) errors.push(`${site.slug}: invalid design name.`);
    if (!(NETWORK_CATEGORIES as readonly string[]).includes(site.category)) errors.push(`${site.slug}: "${site.category}" is not one of the network's categories.`);
    if (!site.trips.length) errors.push(`${site.slug}: no trips.`);
    const overlap = site.keep.filter((slug) => site.retire.includes(slug));
    if (overlap.length) errors.push(`${site.slug}: ${overlap.join(', ')} is both kept and taken off.`);
    if (new Set(site.retire).size !== site.retire.length) errors.push(`${site.slug}: a trip is named twice to take off.`);

    const paths = new Set<string>();
    for (const trip of site.trips) {
      const slug = `${site.slugPrefix}${trip.path}`;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trip.path)) errors.push(`${slug}: invalid public path.`);
      if (paths.has(trip.path)) errors.push(`${slug}: duplicate public path.`);
      if (tripSlugs.has(slug)) errors.push(`${slug}: two sites of this batch would write the same trip slug.`);
      paths.add(trip.path);
      tripSlugs.add(slug);
      if (site.retire.includes(slug) || site.keep.includes(slug)) errors.push(`${slug}: a trip cannot be created and retired in one run.`);
      if (!trip.images.length || trip.images.length !== trip.imageAlts.length) errors.push(`${slug}: every photo needs its own description.`);
      for (const url of trip.images) if (!CLOUDINARY.test(url)) errors.push(`${slug}: photo is not on the network's Cloudinary: ${url}`);
      for (const alt of trip.imageAlts) if (alt.trim().length < 20) errors.push(`${slug}: a photo description is too short.`);
      const copy = `${copyOf(trip)}\n${specCopyOf(trip)}`;
      if (EMOJI.test(copy)) errors.push(`${slug}: emoji in customer copy.`);
      if (FOREIGN_BRANDS.test(copy)) errors.push(`${slug}: another brand in customer copy.`);
      if (PROCESS_MARKERS.test(copy)) errors.push(`${slug}: process marker in customer copy.`);
      if (UNBACKED_CLAIMS.test(copy)) errors.push(`${slug}: unbacked claim in customer copy.`);
      if (CATALOGUE_TALK.test(copy)) errors.push(`${slug}: the catalogue's own words in customer copy.`);
      if (site.foreignPlaces.test(copy)) errors.push(`${slug}: copy names a place this site does not serve.`);
      if (!trip.seo.metaTitle || trip.seo.metaTitle.length > 70) errors.push(`${slug}: SEO title missing or too long.`);
      if (!trip.seo.metaDescription || trip.seo.metaDescription.length > 165) errors.push(`${slug}: SEO description missing or too long.`);
      const spec = trip.price;
      if (spec.category !== site.category) errors.push(`${slug}: filed under "${spec.category}", not the site's "${site.category}".`);
      if (!spec.options.length) errors.push(`${slug}: sells no option.`);
      if (spec.addons.length) errors.push(`${slug}: this batch sells no extras.`);
      if (spec.provider !== 'eeo' || spec.tenant !== EEO_SOURCE) errors.push(`${slug}: every trip here is built on the client's own record.`);
      if (new Set(spec.departures).size !== spec.departures.length || spec.departures.some((label) => !label.trim())) {
        errors.push(`${slug}: departures must name distinct departures of the record.`);
      }
      for (const id of Object.keys(spec.rename || {})) if (!spec.options.includes(id)) errors.push(`${slug}: option "${id}" to rename is not sold.`);
    }
  }
  return errors;
}

type SourceDoc = Record<string, any>;
export type SchemaCheck = (document: Record<string, unknown>) => string[];

/**
 * Every record the batch sells, read from the dated snapshot and only while the live booking options still match
 * it. Anything missing or drifted is named and nothing is written.
 */
export async function loadProgrammes(batch: ExistingBatch, snapshot: EeoSnapshot = SNAPSHOT as EeoSnapshot) {
  const sources = new Map<string, SourceDoc>();
  const missing: string[] = [];
  for (const site of batch.sites) {
    for (const trip of site.trips) {
      const key = `${site.slug}/${sourceKey(trip.price)}`;
      if (sources.has(key)) continue;
      const tour = snapshot.tours.find((item) => item.slug === trip.price.source);
      if (!tour) { missing.push(`${key}: not in the record read ${snapshot.readAt}.`); continue; }
      const drift = await eeoLiveDrift(tour, trip.price.options, trip.price.addons)
        .catch((error: unknown) => [`${key}: the live check failed: ${error instanceof Error ? error.message : String(error)}`]);
      if (drift.length) { missing.push(`${key} (${drift.join('; ')})`); continue; }
      try { sources.set(key, { ...eeoSourceProgramme(trip.price, snapshot), category: site.category }); }
      catch (error) { missing.push(`${key} (${error instanceof Error ? error.message : String(error)})`); }
    }
  }
  return { sources, missing };
}

/** The trip documents of one site, with everything the copy or the schema would refuse. */
export function planSite(site: ExistingSite, sources: Map<string, SourceDoc>, tenantId: unknown, schemaCheck: SchemaCheck) {
  const problems: string[] = [];
  const documents = site.trips.flatMap((trip, index) => {
    const source = sources.get(`${site.slug}/${sourceKey(trip.price)}`);
    if (!source) return [];
    try {
      const document = tripDocument(site, trip, source, index, tenantId);
      problems.push(...copiedFactProblems(site, document), ...schemaCheck(document).map((problem) => `${String(document.slug)}: ${problem}`));
      return [document];
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  return { documents, problems };
}

/** A demo listing as it stands today, for the coordinator and for the journal. */
export interface DemoListing {
  slug: string;
  title: string;
  status: string;
  rating: number;
  reviewCount: number;
  approvedReviews: number;
  bookings: number;
  bookingsNotCancelled: number;
  listedOn: number;
  owned: boolean;
  /** The slug of the site that owns the record, where one does; a record with no owner has none. */
  ownerSlug: string | null;
}

/** What one site looks like today and what this run would do to it. */
export interface SiteState {
  site: ExistingSite;
  tenantId: unknown;
  status: string;
  domainMigrated: boolean;
  customDomain: string | null;
  currencyNow: string;
  /** Listings this run will not take off, and why: a guest's booking, or a record one of these sites owns. */
  refused: Array<{ slug: string; reason: string }>;
  create: string[];
  update: string[];
  archive: Array<{ slug: string; status: string }>;
  unlist: Array<{ slug: string; listedOn: number }>;
  demo: DemoListing[];
  unbackedRatings: string[];
  problems: string[];
}

/**
 * The sites this batch touches. A listing owned by any of them is the site's own content, not a leftover of the
 * old shared catalogue, so it is never taken off: it is reported and left exactly as it is.
 */
const OWNED_BY: string[] = B11_EXISTING.sites.map((site) => site.slug);

export async function readSiteState(site: ExistingSite): Promise<SiteState | { site: ExistingSite; problems: string[] }> {
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const { Review } = await import('../models/Review');
  const { Booking } = await import('../models/Booking');
  const problems: string[] = [];
  const tenant = await Tenant.findOne({ slug: site.slug })
    .select('_id slug status domainMigrated customDomain defaultCurrency').lean();
  if (!tenant) return { site, problems: [`${site.slug}: no such site on the network. This batch never creates one.`] };
  if (!['active', 'coming_soon', 'pending'].includes(String(tenant.status))) problems.push(`${site.slug}: protected status ${tenant.status}.`);
  if (tenant.domainMigrated) problems.push(`${site.slug}: already serves its own domain; its catalogue is not changed here.`);
  // Nothing converts a price, so a site whose currency is not the one its trips are published in stops the run.
  // This batch writes no tenant field at all, so the currency is read and judged, never corrected here.
  const currencyNow = String(tenant.defaultCurrency || '');
  if (currencyNow !== site.currency) {
    problems.push(`${site.slug}: the site sells in ${currencyNow} and its trips are published in ${site.currency}. A price is never converted, so nothing is written.`);
  }

  const wanted = site.trips.map((trip) => `${site.slugPrefix}${trip.path}`);
  const held = await Attraction.find({ slug: { $in: wanted } }).select('slug ownerTenantId tenantIds').lean();
  for (const record of held) {
    const ours = String(record.ownerTenantId) === String(tenant._id)
      && (record.tenantIds || []).every((id: unknown) => String(id) === String(tenant._id));
    if (!ours) problems.push(`${site.slug}: ${record.slug} is another site's trip; nothing is overwritten.`);
  }

  const onSite = await Attraction.find({ tenantIds: tenant._id })
    .select('_id slug title status rating reviewCount ownerTenantId tenantIds').lean();
  // Who owns each listing, by slug: a record one of these four sites owns is theirs, not the old shared catalogue.
  const ownerIds = [...new Set(onSite.map((record) => record.ownerTenantId).filter(Boolean).map(String))];
  const owners = await Tenant.find({ _id: { $in: ownerIds } }).select('_id slug').lean();
  const ownerSlugOf = new Map(owners.map((owner) => [String(owner._id), owner.slug as string]));
  const demo: DemoListing[] = [];
  const unbackedRatings: string[] = [];
  const refused: Array<{ slug: string; reason: string }> = [];
  for (const record of onSite) {
    const approved = await Review.countDocuments({ attractionId: record._id, status: 'approved' });
    const bookings = await Booking.find({ attractionId: record._id }).select('status').lean();
    const live = bookings.filter((booking) => String(booking.status) !== 'cancelled').length;
    const listing: DemoListing = {
      slug: String(record.slug),
      title: String(record.title || ''),
      status: String(record.status),
      rating: Number(record.rating || 0),
      reviewCount: Number(record.reviewCount || 0),
      approvedReviews: approved,
      bookings: bookings.length,
      bookingsNotCancelled: live,
      listedOn: (record.tenantIds || []).length,
      owned: String(record.ownerTenantId) === String(tenant._id),
      ownerSlug: record.ownerTenantId ? (ownerSlugOf.get(String(record.ownerTenantId)) ?? null) : null,
    };
    demo.push(listing);
    if ((listing.rating > 0 || listing.reviewCount > 0) && approved === 0) unbackedRatings.push(listing.slug);
    if (!site.retire.includes(listing.slug)) continue;
    // Two things are never taken off a site, whatever the batch intended, because either would lose something a
    // guest or a site owns: a record with a booking of any status, and a record one of these sites owns itself.
    // Both are reported instead, for the coordinator to decide what becomes of them.
    if (bookings.length > 0) {
      refused.push({ slug: listing.slug, reason: `${bookings.length} booking(s) (${[...new Set(bookings.map((booking) => String(booking.status)))].join(', ')})` });
      continue;
    }
    const ownerSlug = listing.ownerSlug;
    if (ownerSlug && OWNED_BY.includes(ownerSlug)) {
      refused.push({ slug: listing.slug, reason: ownerSlug === site.slug ? 'this site owns the record' : `${ownerSlug} owns the record` });
    }
  }

  const retire = site.retire.filter((slug) => !refused.some((entry) => entry.slug === slug));
  const { archive, unlist, problems: retireProblems } = retirePlan(retire, onSite.map((trip): TripOnSite => ({
    slug: trip.slug as string, status: String(trip.status), listedOn: (trip.tenantIds || []).length,
  })));
  problems.push(...retireProblems.map((problem) => `${site.slug}: ${problem}`));
  const byId = new Set(onSite.map((trip) => String(trip.slug)));
  for (const slug of site.keep) if (!byId.has(slug)) problems.push(`${site.slug}: ${slug} was to be kept but is no longer on the site.`);
  const unnamed = onSite
    .filter((trip) => trip.status !== 'archived')
    .map((trip) => String(trip.slug))
    .filter((slug) => !site.retire.includes(slug) && !site.keep.includes(slug) && !wanted.includes(slug));
  for (const slug of unnamed) problems.push(`${site.slug}: ${slug} is on the site and the batch says nothing about it; read the site again.`);

  return {
    site,
    tenantId: tenant._id,
    status: String(tenant.status),
    domainMigrated: Boolean(tenant.domainMigrated),
    customDomain: (tenant as Record<string, unknown>).customDomain as string ?? null,
    currencyNow,
    refused,
    create: wanted.filter((slug) => !held.some((record) => record.slug === slug)),
    update: wanted.filter((slug) => held.some((record) => record.slug === slug)),
    archive,
    unlist,
    demo,
    unbackedRatings,
    problems,
  };
}

const isState = (value: SiteState | { site: ExistingSite; problems: string[] }): value is SiteState =>
  Object.prototype.hasOwnProperty.call(value, 'tenantId');

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

/** The sites this run may touch: named in full, in the batch's order, and nothing else. */
function confirmedSites(batch: ExistingBatch): ExistingSite[] {
  const named = (argValue('confirm-sites') || '').split(',').map((slug) => slug.trim()).filter(Boolean);
  if (!named.length) throw new Error(`Pass --confirm-sites=<slugs>, in this order: ${batch.sites.map((site) => site.slug).join(',')}`);
  const unknown = named.filter((slug) => !batch.sites.some((site) => site.slug === slug));
  if (unknown.length) throw new Error(`Not in this batch: ${unknown.join(', ')}.`);
  if (new Set(named).size !== named.length) throw new Error('A site is named twice.');
  const chosen = batch.sites.filter((site) => named.includes(site.slug));
  if (chosen.map((site) => site.slug).join(',') !== named.join(',')) {
    throw new Error(`Name the sites in the batch's own order: ${chosen.map((site) => site.slug).join(',')}`);
  }
  return chosen;
}

function journalFile(site: ExistingSite): string {
  const dir = argValue('journal-dir');
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('Pass --journal-dir=<existing directory outside git>.');
  return path.join(dir, `${site.slug}.json`);
}

async function schemaChecker(): Promise<SchemaCheck> {
  const { Attraction } = await import('../models/Attraction');
  const { Types } = await import('mongoose');
  return (document) => {
    const candidate = {
      ...document,
      ownerTenantId: document.ownerTenantId ?? new Types.ObjectId(),
      tenantIds: (document.tenantIds as unknown[]).map((id) => id ?? new Types.ObjectId()),
    };
    const error = new Attraction(candidate).validateSync();
    return error ? Object.values(error.errors).map((item) => item.message) : [];
  };
}

const tripSummary = (document: Record<string, unknown>) => ({
  slug: document.slug,
  title: document.title,
  from: `${String(document.priceFrom)} ${String(document.currency)}`,
  duration: document.duration ?? null,
  options: (document.pricingOptions as Array<Record<string, any>>).map((option) =>
    `${option.name}: ${option.price}${option.childPrice !== undefined ? ` (child ${option.childPrice})` : ''}`),
  departures: (document.entryWindows as Array<Record<string, any>>).map((window) => `${window.label} ${window.startTime}`),
});

/** What one site's report looks like in every mode; the check prints it and writes nothing. */
async function describe(batch: ExistingBatch, sites: ExistingSite[]) {
  const schemaCheck = await schemaChecker();
  const { sources, missing } = await loadProgrammes({ ...batch, sites });
  const report = [];
  for (const site of sites) {
    const state = await readSiteState(site);
    const plan = isState(state) ? planSite(site, sources, state.tenantId, schemaCheck) : { documents: [], problems: [] };
    report.push({
      slug: site.slug,
      domainOnFouadsList: site.domain,
      storefrontDesign: site.design,
      tenant: isState(state)
        ? { status: state.status, customDomain: state.customDomain, domainMigrated: state.domainMigrated, currency: state.currencyNow }
        : { missing: true },
      wouldCreate: isState(state) ? state.create : [],
      wouldUpdate: isState(state) ? state.update : [],
      wouldUnlist: isState(state) ? state.unlist : [],
      wouldArchive: isState(state) ? state.archive : [],
      keptBecauseTheyHaveARecord: site.keep,
      refusedAndLeftExactlyAsTheyAre: isState(state) ? state.refused : [],
      unbackedRatingsLeftAlone: isState(state) ? state.unbackedRatings : [],
      listingsOnTheSiteToday: isState(state) ? state.demo : [],
      problems: [...state.problems, ...plan.problems],
      trips: plan.documents.map(tripSummary),
    });
  }
  return { missing, report, sources, schemaCheck };
}

async function check(batch: ExistingBatch): Promise<void> {
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  await connectDatabase();
  try {
    const { missing, report } = await describe(batch, batch.sites);
    console.log(JSON.stringify({
      mode: 'check',
      batch: batch.id,
      recordReadAt: batch.readAt,
      checkedAt: new Date().toISOString(),
      missingProgrammesOrLiveDrift: missing,
      sites: report,
      totals: {
        sites: report.length,
        tripsToCreate: report.reduce((total, site) => total + site.wouldCreate.length, 0),
        listingsToUnlist: report.reduce((total, site) => total + site.wouldUnlist.length, 0),
        listingsToArchive: report.reduce((total, site) => total + site.wouldArchive.length, 0),
        listingsRefused: report.reduce((total, site) => total + site.refusedAndLeftExactlyAsTheyAre.length, 0),
        problems: report.reduce((total, site) => total + site.problems.length, 0),
      },
      writes: 'none',
      safeguards: [
        'no tenant is created, renamed, re-domained or re-themed',
        'no record is deleted; a listing is unlisted or archived, and the journal reverses it',
        'a listing with a booking of any status is never taken off; it is reported',
        'a listing one of these sites owns is never taken off; it is reported',
        'no tenant document is written at all, in any mode',
      ],
    }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

interface Journal {
  site: string;
  appliedAt: string;
  created: string[];
  updated: Array<{ slug: string; before: Record<string, unknown> }>;
  unlisted: Array<{ slug: string; tenantId: string }>;
  archived: Array<{ slug: string; status: string }>;
}

async function apply(batch: ExistingBatch): Promise<void> {
  const sites = confirmedSites(batch);
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const { urlNamespaceReadiness } = await import('../plugins/urlNamespace');
  if (!urlNamespaceReadiness().writesReady) throw new Error('URL namespace writes are paused in this environment. Nothing was written.');
  await connectDatabase();
  try {
    const { missing, report, sources, schemaCheck } = await describe(batch, sites);
    // The whole run is checked before the first write, so a guard failure writes nothing at all.
    if (missing.length) throw new Error(`Records missing or drifted since they were read: ${missing.join(', ')}.`);
    for (const site of report) if (site.problems.length) throw new Error(`${site.slug}: nothing was written.\n- ${site.problems.join('\n- ')}`);
    const done = [];
    for (const site of sites) {
      const state = await readSiteState(site);
      if (!isState(state)) throw new Error(`${site.slug}: ${state.problems.join('; ')}`);
      const file = journalFile(site);
      const journal: Journal = { site: site.slug, appliedAt: new Date().toISOString(), created: [], updated: [], unlisted: [], archived: [] };
      const record = () => fs.writeFileSync(file, JSON.stringify(journal, null, 2), { mode: 0o600 });
      record();

      for (const [index, trip] of site.trips.entries()) {
        const source = sources.get(`${site.slug}/${sourceKey(trip.price)}`);
        if (!source) throw new Error(`${site.slug}: the record for ${trip.price.source} vanished mid-run.`);
        const document = tripDocument(site, trip, source, index, state.tenantId);
        const refused = schemaCheck(document);
        if (refused.length) throw new Error(`${String(document.slug)}: ${refused.join('; ')}`);
        const before = await Attraction.findOne({ slug: document.slug }).lean();
        if (before) journal.updated.push({ slug: String(document.slug), before: before as Record<string, unknown> });
        else journal.created.push(String(document.slug));
        record();
        await Attraction.findOneAndUpdate(
          { slug: document.slug },
          // Never carried: the source's cancellation promise and badges.
          { $set: document, $unset: { cancellationPolicy: 1, badges: 1 } },
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
        );
      }

      for (const entry of state.unlist) {
        journal.unlisted.push({ slug: entry.slug, tenantId: String(state.tenantId) });
        record();
        await Attraction.updateOne({ slug: entry.slug }, { $pull: { tenantIds: state.tenantId } });
      }
      for (const entry of state.archive) {
        journal.archived.push(entry);
        record();
        await Attraction.updateOne({ slug: entry.slug, status: entry.status }, { $set: { status: 'archived', statusBeforeArchive: entry.status, archivedAt: new Date() } });
      }

      const owned = await Attraction.countDocuments({ ownerTenantId: state.tenantId, status: 'active', slug: { $in: site.trips.map((trip) => `${site.slugPrefix}${trip.path}`) } });
      // Only this batch's trips must be unrated: records the site already owned are refused and left exactly as they
      // were (their unbacked ratings are reported, not changed), so they are not part of this check.
      const rated = await Attraction.countDocuments({ ownerTenantId: state.tenantId, slug: { $in: site.trips.map((trip) => `${site.slugPrefix}${trip.path}`) }, $or: [{ rating: { $gt: 0 } }, { reviewCount: { $gt: 0 } }] });
      const otherCurrency = await Attraction.countDocuments({ ownerTenantId: state.tenantId, currency: { $ne: site.currency } });
      if (owned !== site.trips.length || rated !== 0 || otherCurrency !== 0) {
        throw new Error(`${site.slug}: post-apply check failed (owned=${owned}, rated=${rated}, otherCurrency=${otherCurrency}). The journal reverses what was written.`);
      }
      done.push({ slug: site.slug, created: journal.created.length, updated: journal.updated.length, unlisted: journal.unlisted.length, archived: journal.archived.length, refused: state.refused.length });
    }
    console.log(JSON.stringify({ mode: 'applied', batch: batch.id, sites: done, deleted: 'none' }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

async function restore(batch: ExistingBatch): Promise<void> {
  const sites = confirmedSites(batch);
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  await connectDatabase();
  try {
    const done = [];
    for (const site of sites) {
      const journal = JSON.parse(fs.readFileSync(journalFile(site), 'utf8')) as Journal;
      if (journal.site !== site.slug) throw new Error(`${site.slug}: the journal names ${journal.site}.`);
      for (const entry of journal.archived) {
        await Attraction.updateOne({ slug: entry.slug, status: 'archived' }, { $set: { status: entry.status }, $unset: { statusBeforeArchive: 1, archivedAt: 1 } });
      }
      for (const entry of journal.unlisted) await Attraction.updateOne({ slug: entry.slug }, { $addToSet: { tenantIds: entry.tenantId } });
      for (const entry of journal.updated) await Attraction.replaceOne({ slug: entry.slug }, entry.before);
      if (journal.created.length) await Attraction.deleteMany({ slug: { $in: journal.created } });
      done.push({ slug: site.slug, restored: journal.created.length + journal.updated.length + journal.unlisted.length + journal.archived.length });
    }
    console.log(JSON.stringify({ mode: 'restored', batch: batch.id, sites: done }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

export async function main(): Promise<void> {
  const errors = validateExisting(B11_EXISTING);
  if (errors.length) throw new Error(`Batch ${B11_EXISTING.id} is invalid:\n- ${errors.join('\n- ')}`);
  if (process.argv.includes('--restore')) return restore(B11_EXISTING);
  if (process.argv.includes('--apply')) return apply(B11_EXISTING);
  return check(B11_EXISTING);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[network-b11-existing] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
