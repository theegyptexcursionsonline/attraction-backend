/**
 * Batch B11, the five sites that already exist (30 October 2026). Fouad's list moves `makadi-bay-safari`,
 * `cairo-tour-from-hurghada`, `luxor-tour-from-hurghada`, `hurghada-snorkeling` and `cairo-night-cruise` onto
 * domains of their own. Each is an active tenant already, so this run never creates one and never touches a
 * tenant's name, words, colours, domain, custom domain, contacts, payments, languages or notification settings.
 *
 * What the five look like today, read from production on 30 October 2026 (`readiness-proof/2026-10-30-b11/`):
 * fifty-one trip listings across them, and **not one of them is the client's**. Every listing is a record from the
 * old demo catalogue: option ids `opt_1`/`opt_2`, round prices, a rating between 4.5 and 4.9 with a review count
 * between 89 and 456 behind which there is **no review at all** of any status, and `ownerTenantId` unset. Each is
 * listed on between four and twenty-one tenants at once. There are **no bookings** — none on any of the fifty-one
 * trips, and none on any of the five tenants, cancelled or otherwise.
 *
 * So the plan for each site is:
 *   - create the client's real trips, built from the dated snapshot at the client's published prices, owned by the
 *     site, and written with `rating: 0` and `reviewCount: 0` as every network trip is;
 *   - take every demo listing off the site. Because each is listed on other tenants too, taking it off is
 *     **unlisting**: this tenant's id is removed from the record's `tenantIds` and nothing else about the record
 *     changes, so no other site is touched. A record only this site listed would be archived instead, keeping the
 *     status it had; none is, today. Nothing is ever deleted.
 *   - leave the ratings on those demo records alone. They are unbacked, but the record is owned by no tenant and
 *     shown on up to twenty-one sites, so clearing one would change every one of them — outside this batch.
 *     Unlisting removes them from these five sites, which is what this batch is for. The figures are reported for
 *     the coordinator, and `fix-network-unbacked-ratings.ts` is the tool if the client wants them cleared network-wide.
 *
 * **No logo, dark logo or favicon is written on any of the five** (coordinator, 30 October). Four of them —
 * `cairo-tour-from-hurghada`, `luxor-tour-from-hurghada`, `hurghada-snorkeling` and `cairo-night-cruise` — carry
 * the client's own marks, which must stay exactly as they are; this script writes no mark on any site, so they
 * cannot be touched by it, and a test holds that. The seventh mark in the coordinator's `--logos` file, for
 * `makadi-bay-safari`, therefore has nowhere to go in this run: `--logos` belongs to `seed-network-sites.ts`, which
 * only ever creates or updates the six new tenants of batches b11a and b11b. **Open item: `makadi-bay-safari` needs
 * its new mark written by a separate, named step** — this batch deliberately does not grow a second way to write
 * tenant fields.
 *
 * One tenant field does have to change, and it is fenced on its own. All five sites carry `defaultCurrency: EGP`
 * while every record the client publishes is priced in USD, and a network trip's price is never converted. Until
 * the currency is corrected, not one of the client's trips can go on these sites. The correction is planned here,
 * written only when `--apply` is also given `--set-currency`, journalled with the value it replaced, and undone by
 * `--restore`. Nothing else about any tenant is written, in any mode.
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
 * - `from-makadi-bay-hurghada-desert-quad-bike-camel-ride`: the record lists "Hotel pickup and drop-off" and
 *   "Transportation in an air-conditioned vehicle" under what is **not** included and sells the transfer as an
 *   extra, so it does not include the pickup every network trip promises. Two of its four options are priced zero.
 * - `makadi-bay-atv-camel-safari-with-dinner-and-stargazing`, `makadi-bay-sunset-atv-quad-safari-with-stunning-sea-views`
 *   and `hurghada-quad-biking-adventure-with-dinner-show-stargazing-options`: each promises its pickup only as
 *   "Hotel pickup and drop-off (if selected)" and sells the transfer for each area as a separate extra bound to the
 *   entry-ticket option, so no option sold would carry the pickup. Two of the first record's options are priced
 *   zero and one is priced per group.
 * - `sunrise-buggy-safari-in-makadi-bay-with-breakfast`: the same conditional pickup, and every one of its six
 *   options is priced "Per Group" rather than per person, which the seed refuses.
 * - `makadi-bay-2-hour-quad-bike-adventure-across-desert-coast`, its "Double Quad" option: priced "Per Couple",
 *   which the seed refuses. The single quad is sold; the double quad is a question for the client.
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
 *   npm run seed:network-b11-existing -- --apply --confirm-sites=a,b,c --journal-dir=<directory outside git> \
 *     [--set-currency=a,b,c]
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
  // The record's inclusions carry a typo ("All ocal taxes") and promise pickup only inside Makadi Bay, with the
  // pickup from outside it sold as an exclusion; both are said plainly in the site's own words.
  MAKADI_SUNSET_QUAD: {
    provider: 'eeo',
    tenant: EEO,
    source: 'golden-sunset-quad-safari-in-makadi-bay',
    category: ADVENTURES,
    options: ['quad-sunset-6faa56b781a9'],
    addons: [],
    departures: ['18:00'],
    departureLabels: { '18:00': 'Late afternoon' },
    rename: {
      'quad-sunset-6faa56b781a9': {
        name: 'Sunset quad safari',
        description: 'Three hours into the desert behind Makadi Bay on a quad bike, with a guide, a helmet and the sun going down.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: ['All ocal taxes, fees and handling charges', 'Hotel pickup and drop-off (within Makadi Bay)'],
      exclusions: ['Hotel pickup and drop-off (if outside Makadi Bay)', 'Drinks other than complimentary drinks given.', 'DVD (available to purchase)'],
    },
    add: {
      inclusions: ['Hotel pickup and drop-off in Makadi Bay', 'All local taxes and fees'],
      exclusions: ['Drinks beyond the ones served on the trip'],
      needToKnow: [
        'Pickup from outside Makadi Bay costs extra and cannot be booked on this site. Ask the team before you book if your hotel is further out.',
        'A photo or video of the ride can be bought on the day.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'The car collects you from your hotel in Makadi Bay.' },
      { title: 'Safety briefing', description: 'The guide fits your helmet and walks you through the controls before you set off.' },
      { title: 'Into the desert', duration: '2 hours', description: 'Two hours on the quad bike across the desert behind the bay, with stops for photographs.' },
      { title: 'Back to your hotel', description: 'The car returns you to your hotel in Makadi Bay.' },
    ],
  },
  // The record writes its pickup as "Pickup From Makadi Hotels" and prices its two exclusions in the line itself;
  // both are replaced here. Its second option is priced per couple, which the seed refuses, so one is sold.
  MAKADI_TWO_HOUR_QUAD: {
    provider: 'eeo',
    tenant: EEO,
    source: 'makadi-bay-2-hour-quad-bike-adventure-across-desert-coast',
    category: ADVENTURES,
    options: ['single-quad-652928d03bae'],
    addons: [],
    // The record writes its length as "2h"; the network says it the way every other trip does.
    duration: '2 hours',
    departures: ['10:00', '13:00', '15:00'],
    rename: {
      'single-quad-652928d03bae': {
        name: 'One rider, one quad bike',
        description: 'Two hours on a quad bike of your own, across the desert and along the coast, with a guide and a helmet.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: ['Pickup From Makadi Hotels', 'All Fees and Taxes', '120min Quad bike'],
      exclusions: ['Optional: Scarf & Goggles for $5', 'Pickup from outside Makadi: $5 per person'],
    },
    add: {
      inclusions: ['Hotel pickup and drop-off in Makadi Bay', 'All fees and taxes', 'Two hours on the quad bike'],
      exclusions: ['A scarf and goggles, which can be bought on the day'],
      needToKnow: ['Pickup from outside Makadi Bay costs extra and cannot be booked on this site. Ask the team before you book if your hotel is further out.'],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'An air-conditioned vehicle collects you from your hotel in Makadi Bay.' },
      { title: 'Safety briefing', description: 'You meet the guides at the meeting point and are shown the controls and the route.' },
      { title: 'Across the desert', duration: '2 hours', description: 'Two hours on the quad bike over the sand and on along the coast road above the sea.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Makadi Bay.' },
    ],
  },
  // The option sold is the one that collects from Makadi Bay; its published name lists four other towns, so the
  // site names its own. The record's schedule is a list of pickup towns the option does not use.
  MAKADI_DESERT_DINNER: {
    provider: 'eeo',
    tenant: EEO,
    source: 'makadi-bay-luxury-desert-dinner-stargazing-experience',
    category: ADVENTURES,
    options: ['makadi-bay-soma-bay-safaga-alahyaa-sahl-hashe-a03ce8972937'],
    addons: [],
    departures: ['18:00'],
    departureLabels: { '18:00': 'Evening' },
    rename: {
      'makadi-bay-soma-bay-safaga-alahyaa-sahl-hashe-a03ce8972937': {
        name: 'Evening in the desert, with pickup in Makadi Bay',
        description: 'A four-hour evening at a Bedouin camp with tea, a four-course dinner, music and an hour under the stars.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Hotel pick-up and transfer'] },
    add: {
      inclusions: ['Hotel pickup and drop-off in Makadi Bay'],
      needToKnow: ['The desert is cold once the sun is down, so bring something warm whatever the day has been like.'],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'A car collects you from your hotel in Makadi Bay in the early evening.' },
      { title: 'The camp', duration: '3 hours', description: 'Bedouin tea, coffee and karkade on arrival, bread baked and coffee roasted in front of you, then a four-course dinner.' },
      { title: 'Music and stories', description: 'Bedouin music, dancing and storytelling around the camp.' },
      { title: 'Under the stars', description: 'A stargazing session away from the lights of the coast.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The car returns you to your hotel in Makadi Bay.' },
    ],
  },
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
  quadsAtSunset: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788291989/tours/hmowvbgjhywfuejbydvq.jpg',
  riderWithHelmet: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788292022/tours/jvcy9deqstjo3kaiu6le.jpg',
  telescopeUnderStars: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788291814/tours/uiqzszlpitf8kzc4iuj0.jpg',
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
  quadsAtSunset: 'Two riders on quad bikes in silhouette on desert sand, with a low orange sun on the horizon behind them',
  riderWithHelmet: 'A man in a white t-shirt carrying a helmet under his arm, standing on sand beside two red quad bikes',
  telescopeUnderStars: 'A person in a hooded jacket crouched in silhouette beside a telescope on a tripod, under a dense starry sky',
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
  /** The currency the tenant carries today, and the one its trips need. A difference is planned, never assumed. */
  currencyNow: 'EGP' | 'USD';
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
      slug: 'makadi-bay-safari',
      name: 'Makadi Bay Safari',
      domain: 'makadibaysafari.com',
      design: 'makadidunes',
      listingPath: '/trips',
      city: 'Makadi Bay',
      area: 'Makadi Bay',
      coordinates: MAKADI_BAY,
      currency: 'USD',
      currencyNow: 'EGP',
      slugPrefix: 'mbs-',
      category: ADVENTURES,
      foreignPlaces: NOT_MAKADI,
      keep: [],
      retire: ['makadi-bay-safari', 'makadi-bay-snorkeling'],
      trips: [
        {
          path: 'sunset-quad-safari',
          price: P.MAKADI_SUNSET_QUAD,
          title: 'Sunset Quad Safari in the Desert',
          short: 'Three hours on a quad bike behind Makadi Bay in the late afternoon, with a guide, a helmet and hotel pickup.',
          description: 'The car collects you at six, which is late enough that the sand has lost its heat and the light has started to go. The guide fits your helmet, shows you the controls, and then takes the group out across the desert behind the bay for two hours.\n\nThere are stops along the way to get off and look, and the ride turns for home with the sun low. The guide, the helmet and the pickup from your hotel in Makadi Bay are in the price, and children have their own.',
          highlights: [
            'Two hours on a quad bike across the desert',
            'A late-afternoon start, with the sun going down',
            'A guide and a helmet for every rider',
            'Hotel pickup in Makadi Bay included',
          ],
          seo: {
            metaTitle: 'Makadi Bay Sunset Quad Safari with Hotel Pickup',
            metaDescription: 'A three-hour quad bike safari into the desert behind Makadi Bay in the late afternoon, with a guide, a helmet and hotel pickup.',
          },
          images: [PHOTO.quadsAtSunset],
          imageAlts: [ALT.quadsAtSunset],
        },
        {
          path: 'two-hour-quad-bike-desert-and-coast',
          price: P.MAKADI_TWO_HOUR_QUAD,
          title: 'Two Hours by Quad Bike, Desert and Coast',
          short: 'A quad bike of your own for two hours across the desert and along the coast, with three starts to choose from.',
          description: 'This is the ride for people who would rather not share a machine: one rider, one quad bike, for the whole two hours. An air-conditioned vehicle collects you from your hotel in Makadi Bay and brings you to the meeting point, where the guides fit the helmets and run through the controls.\n\nThe route goes out over the sand and then turns along the coast, where the desert runs down to the sea. There are three starts through the day, and children have their own price.',
          highlights: [
            'One rider to a quad bike',
            'Two hours across the desert and along the coast',
            'Three starts through the day',
            'Helmet, guide and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Makadi Bay Quad Bike Safari: Desert and Coast',
            metaDescription: 'Two hours on your own quad bike across the desert and the coast at Makadi Bay, with a guide, a helmet and hotel pickup.',
          },
          images: [PHOTO.riderWithHelmet],
          imageAlts: [ALT.riderWithHelmet],
        },
        {
          path: 'desert-dinner-and-stargazing',
          price: P.MAKADI_DESERT_DINNER,
          title: 'Desert Dinner and Stargazing at a Bedouin Camp',
          short: 'Four hours at a desert camp: Bedouin tea, a four-course dinner, music and an hour under the stars.',
          description: 'The car collects you at six and drives inland, far enough that the lights of the coast are gone. At the camp there is tea, coffee and karkade to begin, bread baked on an iron dome and coffee roasted in front of you, then a dinner of four courses.\n\nAfterwards there is music and dancing and storytelling, and then the sky, which is the point of coming this far out. Children have their own price, and the pickup from your hotel in Makadi Bay is included.',
          highlights: [
            'A four-course Bedouin dinner at a desert camp',
            'Bread baked and coffee roasted in front of you',
            'Music, dancing and storytelling',
            'A stargazing session away from the coast',
          ],
          seo: {
            metaTitle: 'Makadi Bay Desert Dinner and Stargazing Evening',
            metaDescription: 'Four hours at a Bedouin desert camp from Makadi Bay with tea, a four-course dinner, music and a stargazing session.',
          },
          images: [PHOTO.telescopeUnderStars],
          imageAlts: [ALT.telescopeUnderStars],
        },
      ],
    },
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
      currencyNow: 'EGP',
      slugPrefix: 'cth-',
      category: DAY_TRIPS,
      foreignPlaces: NOT_CAIRO_DAY,
      keep: [],
      retire: [
        'cairo-night-cruise', 'camel-riding-hurghada', 'cairo-tour-from-hurghada', 'giftun-island-hurghada',
        'orange-bay-tours', 'cairo-tours-packages', 'horse-riding-hurghada', 'parasailing-hurghada',
        'hurghada-fishing', 'pyramids-excursions', 'hurghada-jeep-safari', 'hurghada-luxury-cruise',
        'hurghada-private-safari', 'hurghada-private-tours', 'hurghada-snorkeling', 'hurghada-spa', 'toureg-safari',
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
      currencyNow: 'EGP',
      slugPrefix: 'lth-',
      category: DAY_TRIPS,
      foreignPlaces: NOT_LUXOR_DAY,
      keep: [],
      retire: [
        'camel-riding-hurghada', 'luxor-air-balloon', 'giftun-island-hurghada', 'luxor-tour-from-hurghada',
        'orange-bay-tours', 'horse-riding-hurghada', 'parasailing-hurghada', 'hurghada-fishing',
        'hurghada-jeep-safari', 'hurghada-luxury-cruise', 'hurghada-private-safari', 'hurghada-private-tours',
        'hurghada-snorkeling', 'hurghada-spa', 'toureg-safari',
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
      currencyNow: 'EGP',
      slugPrefix: 'hsn-',
      category: WATER,
      foreignPlaces: NOT_HURGHADA,
      keep: [],
      retire: [
        'camel-riding-hurghada', 'giftun-island-hurghada', 'orange-bay-tours', 'horse-riding-hurghada',
        'parasailing-hurghada', 'hurghada-fishing', 'hurghada-jeep-safari', 'hurghada-luxury-cruise',
        'hurghada-private-safari', 'hurghada-private-tours', 'hurghada-snorkeling', 'hurghada-spa', 'toureg-safari',
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
      currencyNow: 'EGP',
      slugPrefix: 'cnc-',
      category: DAY_TRIPS,
      foreignPlaces: NOT_CAIRO,
      keep: [],
      retire: ['cairo-night-cruise', 'cairo-tour-from-hurghada', 'cairo-tours-packages', 'pyramids-excursions'],
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
}

/** What one site looks like today and what this run would do to it. */
export interface SiteState {
  site: ExistingSite;
  tenantId: unknown;
  status: string;
  domainMigrated: boolean;
  customDomain: string | null;
  currencyNow: string;
  currencyChange: { from: string; to: string } | null;
  create: string[];
  update: string[];
  archive: Array<{ slug: string; status: string }>;
  unlist: Array<{ slug: string; listedOn: number }>;
  demo: DemoListing[];
  unbackedRatings: string[];
  bookingsOnRetired: string[];
  problems: string[];
}

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
  const currencyNow = String(tenant.defaultCurrency || '');
  if (currencyNow !== site.currencyNow && currencyNow !== site.currency) {
    problems.push(`${site.slug}: the site sells in ${currencyNow}, which is neither the ${site.currencyNow} this batch read nor the ${site.currency} its trips need. Read the site again.`);
  }
  const currencyChange = currencyNow === site.currency ? null : { from: currencyNow, to: site.currency };

  const wanted = site.trips.map((trip) => `${site.slugPrefix}${trip.path}`);
  const held = await Attraction.find({ slug: { $in: wanted } }).select('slug ownerTenantId tenantIds').lean();
  for (const record of held) {
    const ours = String(record.ownerTenantId) === String(tenant._id)
      && (record.tenantIds || []).every((id: unknown) => String(id) === String(tenant._id));
    if (!ours) problems.push(`${site.slug}: ${record.slug} is another site's trip; nothing is overwritten.`);
  }

  const onSite = await Attraction.find({ tenantIds: tenant._id })
    .select('_id slug title status rating reviewCount ownerTenantId tenantIds').lean();
  const demo: DemoListing[] = [];
  const unbackedRatings: string[] = [];
  const bookingsOnRetired: string[] = [];
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
    };
    demo.push(listing);
    if ((listing.rating > 0 || listing.reviewCount > 0) && approved === 0) unbackedRatings.push(listing.slug);
    // A trip with a live booking is never taken off, whoever's record it is: it is kept and reported.
    if (site.retire.includes(listing.slug) && live > 0) bookingsOnRetired.push(`${listing.slug} (${live} booking(s) not cancelled)`);
  }

  const retire = site.retire.filter((slug) => !bookingsOnRetired.some((line) => line.startsWith(`${slug} `)));
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
    currencyChange,
    create: wanted.filter((slug) => !held.some((record) => record.slug === slug)),
    update: wanted.filter((slug) => held.some((record) => record.slug === slug)),
    archive,
    unlist,
    demo,
    unbackedRatings,
    bookingsOnRetired,
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

/** The sites whose currency this run may correct. A tenant field is never written without its own fence. */
function currencyFenced(site: ExistingSite): boolean {
  const named = (argValue('set-currency') || '').split(',').map((slug) => slug.trim()).filter(Boolean);
  return named.includes(site.slug);
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
      currencyCorrection: isState(state) ? state.currencyChange : null,
      wouldCreate: isState(state) ? state.create : [],
      wouldUpdate: isState(state) ? state.update : [],
      wouldUnlist: isState(state) ? state.unlist : [],
      wouldArchive: isState(state) ? state.archive : [],
      keptBecauseTheyHaveARecord: site.keep,
      keptBecauseTheyHaveALiveBooking: isState(state) ? state.bookingsOnRetired : [],
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
        problems: report.reduce((total, site) => total + site.problems.length, 0),
      },
      writes: 'none',
      safeguards: [
        'no tenant is created, renamed, re-domained or re-themed',
        'no record is deleted; a listing is unlisted or archived, and the journal reverses it',
        'a trip with a booking that is not cancelled is kept and reported',
        'the currency correction is the only tenant field written, and only behind --set-currency',
      ],
    }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

interface Journal {
  site: string;
  appliedAt: string;
  currency: { from: string; to: string } | null;
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
    for (const site of sites) {
      const needs = report.find((item) => item.slug === site.slug)?.currencyCorrection;
      if (needs && !currencyFenced(site)) {
        throw new Error(`${site.slug}: its trips are priced in ${needs.to} and the site sells in ${needs.from}. Pass --set-currency=${sites.filter((item) => report.find((r) => r.slug === item.slug)?.currencyCorrection).map((item) => item.slug).join(',')} to correct it, or take the site out of this run.`);
      }
    }

    const done = [];
    for (const site of sites) {
      const state = await readSiteState(site);
      if (!isState(state)) throw new Error(`${site.slug}: ${state.problems.join('; ')}`);
      const file = journalFile(site);
      const journal: Journal = { site: site.slug, appliedAt: new Date().toISOString(), currency: null, created: [], updated: [], unlisted: [], archived: [] };
      const record = () => fs.writeFileSync(file, JSON.stringify(journal, null, 2), { mode: 0o600 });
      record();

      if (state.currencyChange) {
        const result = await Tenant.updateOne({ slug: site.slug, defaultCurrency: state.currencyChange.from }, { $set: { defaultCurrency: state.currencyChange.to } });
        if (result.modifiedCount !== 1) throw new Error(`${site.slug}: the currency changed since it was read; nothing further was written.`);
        journal.currency = state.currencyChange;
        record();
      }

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
      const rated = await Attraction.countDocuments({ ownerTenantId: state.tenantId, $or: [{ rating: { $gt: 0 } }, { reviewCount: { $gt: 0 } }] });
      const otherCurrency = await Attraction.countDocuments({ ownerTenantId: state.tenantId, currency: { $ne: site.currency } });
      if (owned !== site.trips.length || rated !== 0 || otherCurrency !== 0) {
        throw new Error(`${site.slug}: post-apply check failed (owned=${owned}, rated=${rated}, otherCurrency=${otherCurrency}). The journal reverses what was written.`);
      }
      done.push({ slug: site.slug, created: journal.created.length, updated: journal.updated.length, unlisted: journal.unlisted.length, archived: journal.archived.length, currency: journal.currency });
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
      if (journal.currency) await Tenant.updateOne({ slug: site.slug }, { $set: { defaultCurrency: journal.currency.from } });
      done.push({ slug: site.slug, restored: journal.created.length + journal.updated.length + journal.unlisted.length + journal.archived.length, currency: journal.currency ? journal.currency.from : 'unchanged' });
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
