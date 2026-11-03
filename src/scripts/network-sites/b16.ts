/**
 * Batch B16 (3 November 2026), the last ten sites of Fouad's 140-domain list. One group:
 *
 * - B16: the six places batch B15 held back in its own group C — the lagoon north of Dahab beyond Ras Abu Galum,
 *   the oasis where the two halves of the Sinai Trail meet, the snorkelling stop the trade calls Seven Pools
 *   inside Ras Mohammed, the lower reach of Wadi Zaghara, the bay below the mount of lead north of Marsa Alam
 *   and the sheltered inlet in the Abu Galawa reefs north of Hurghada — and four businesses on the client's own
 *   list: a Cairo car-with-driver service, a tour-package agency, a Makadi Bay desert-safari seller and a
 *   Hurghada speedboat seller.
 *
 * Sources: `docs/network-batches/b15/b16/places-facts.json` (every fact about a place, and every fact about a
 * business written as what that business states on its own site), `SELECTION.md` (which ten, which day, which
 * pictures) and `CONCEPTS.md` (one idea per site). Every price, child rate, departure, inclusion and schedule is
 * copied from the client's own published record at apply time, read through the dated snapshot
 * (`network-sites/eeo-snapshot.json`); not one of them is typed here.
 *
 * THE "NEAREST DAYS" RULE, as batches B12 to B15C set it. No client day names any of these six places as a stop,
 * so a site takes the day the client's records come closest to and says plainly, on every page, what its
 * programme names and that the programme does not name the site's own place. Where a place has no published
 * position the distance cannot be measured at all, and the pages say that instead of a figure.
 *
 * What each site sells, and how far it is (`SELECTION.md`, the table of ten):
 * - Blue Lagoon is 8.43 km from the Blue Hole, the nearest point its day's programme names, and sells the
 *   Coloured Canyon jeep day out of Sharm El Sheikh.
 * - Ein Kid has no published position, so no distance exists for it at all; it sells the Sinai desert quad and
 *   Bedouin dinner evening, the nearest kind of day the client sells to an inland Bedouin oasis.
 * - Seven Pools has no published position either, and sells the one day in the client's list whose named stops
 *   are inside the park the stop lies in: the White Island and Ras Mohammed small-group cruise. It is the only
 *   site of this group whose day works the same protected area as its place, and its pages say so and still
 *   promise no call there.
 * - Wadi Zaghara is 12.38 km from Dahab (9.84 km to its mapped mouth) and sells the Salama canyon day that names
 *   Dahab and the Coloured Canyon.
 * - Gebel El Rosas bay is 30.63 km from Shaab Samadai and sells that reef's cruise out of Marsa Alam. Three
 *   network sites already sell that record, B15C's Daedalus Reef among them at 88.95 km; this site is much the
 *   nearer, and sharing a record across batches is allowed.
 * - Marsa Abu Galawa has no position published by a second source, and sells the two-tank boat day out of El
 *   Gouna whose programme names no dive site at all — which is why it was chosen: nothing in the record
 *   contradicts the reef and nothing implies the boat calls there.
 *
 * The four business sites carry no price, telephone number, rating, count, tenure, licence or address of the
 * business: each sells a single day from the client's own catalogue, at the catalogue's own price, and says in
 * one plain sentence what it does not sell. None of their wording, pictures or marks is reused, and none of
 * their domains is touched by this work.
 *
 * THE MAKADI BAY DAY COULD NOT BE SOLD, AND A NEARER ONE IS. `SELECTION.md` assigns Makadi Bay Safari the
 * record `sunrise-buggy-safari-in-makadi-bay-with-breakfast`. Every one of that record's six booking options is
 * published "Per Group", and its family option prices its 05:00 departure at half its afternoon departures, so
 * the seed refuses it twice over: it sells per-person options only, and it refuses an option whose slot is
 * priced apart from the option. Rather than write a per-guest price the client does not publish, the site sells
 * `golden-sunset-quad-safari-in-makadi-bay`, which is the nearest record the client does publish per guest: a
 * Makadi Bay desert safari of the business's own kind (a quad, one of the three vehicles its own site sells),
 * with hotel pickup inside Makadi Bay, a camel ride and Bedouin tea, sold by no network site today. The one
 * programme this batch writes is that day's. If the client republishes the sunrise buggy day per guest, that
 * record replaces this one and one line here does it.
 *
 * TWO SLUGS ARE NOT THE SLUGS `SELECTION.md` NAMES, because the network already holds them:
 * - `hurghada-speedboat` is a live tenant, so this site is `hurghada-speedboat-day`, named apart from it, as
 *   `SELECTION.md` § 8 requires.
 * - `makadi-bay-safari` is an existing tenant too, inactive since May awaiting its deduplication with
 *   `makadi-bay-safari-center`, so this site is `makadi-bay-safari-day`. That tenant also holds the custom
 *   domain `makadibaysafari.com`, which this site's record names: until the owner releases it from that
 *   tenant, an apply of this batch stops on that site's namespace and writes nothing. Nothing here changes
 *   the existing tenant, which must stay exactly as it is.
 *
 * PICTURES: NO NEW ONES WERE MADE. The image account is out of credit, so every site shows two photographs the
 * network already publishes, chosen in `SELECTION.md` and described here in the exact words the batch that first
 * published each one carries, so the network never describes one photograph two ways. Not one of them is a
 * photograph of the place the site is named for, and every site therefore carries a `photoShortfall` note
 * saying so in its own words. Each trip carries the photograph the client publishes on the record it sells,
 * where the batch that first sold that record has one; the Makadi Bay day has no earlier seller, so its trip
 * carries the quad photograph the site itself shows.
 *
 * Three of `SELECTION.md`'s picture descriptions were written from an incomplete read and are corrected here
 * against `b03-rest.ts`'s own `ALT` strings, which are the words the network publishes: `twoBuggiesInDust`,
 * `buggyOnTheShore` and `riderOnACamel`. `twoBuggiesInDust` is not used at all: the Makadi Bay day sold here is
 * a quad ride, and a photograph of two buggies on a quad day would be a false record. The quad photograph
 * `quadOnTheDunes`, from the same already-uploaded group, stands in its place.
 *
 * The logos are supplied at apply time: `--apply` refuses to run without `--logos=<file>` naming every site's
 * approved logo, logoDark and favicon.
 */
import type { NetworkBatch, PriceSpec } from '../seed-network-sites';
import { PROGRAMMES as B02P } from './b02';
import { PROGRAMMES as B03RP } from './b03-rest';
import { PROGRAMMES_A as B09A, PROGRAMMES_B as B09B } from './b09';
import { NEW_PROGRAMMES as B10P } from './b10';

const EEO = 'egypt-excursions-online';
const DESERT = 'adventure';

/** The child terms every network trip writes for a record that publishes a child price of its own. */
const CHILD_NOTE = 'Children have their own price, and the booking applies it. The team confirms which ages count as children when it confirms your booking.';

/**
 * The one programme this batch writes: the Makadi Bay quad safari the site sells in place of the per-group
 * sunrise buggy record the seed refuses (see this file's opening note). The record publishes a bare schedule of
 * three unnamed legs, so the day's own stages are written here from the option's published text and from the
 * record's own list of what is included, and nothing else.
 */
export const PROGRAMMES = {
  MKD_QUAD_SUNSET: {
    provider: 'eeo',
    tenant: EEO,
    source: 'golden-sunset-quad-safari-in-makadi-bay',
    category: DESERT,
    options: ['quad-sunset-6faa56b781a9'],
    addons: [],
    departures: ['18:00'],
    departureLabels: { '18:00': 'Late afternoon' },
    rename: {
      'quad-sunset-6faa56b781a9': {
        name: 'The late ride',
        description: 'A guided quad ride on the desert tracks behind the bay, with a camel ride, Bedouin tea and time at the shore.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      // The record's own line is mistyped ("All ocal taxes"), and its pickup line holds for one area only; both
      // are written plainly below instead of being published as they stand.
      inclusions: ['All ocal taxes, fees and handling charges'],
      exclusions: ['Hotel pickup and drop-off (if outside Makadi Bay)'],
    },
    add: {
      inclusions: ['Local taxes, fees and handling charges'],
      exclusions: ['Pickup from a hotel outside Makadi Bay'],
      needToKnow: ['The pickup is from a hotel in Makadi Bay; the team confirms the time when it confirms your booking.'],
    },
    itinerary: [
      { time: '18:00', title: 'Hotel pickup', description: 'The car collects you from your hotel in Makadi Bay.' },
      { title: 'The briefing', description: 'The guide hands out the helmets and takes the group through the route before the quads are started.' },
      { title: 'The ride', duration: '2 hours', description: 'A guided ride on the desert tracks behind the bay, with stops along the way.' },
      { title: 'The camel and the tea', description: 'A camel ride and Bedouin tea at the stop the day makes.' },
      { title: 'The shore', description: 'Time at the beach the day visits before the ride back.' },
      { title: 'Back to your hotel', description: 'The car returns you to your hotel in Makadi Bay.' },
    ],
  },
} satisfies Record<string, PriceSpec>;

/** Every programme this batch sells: nine imported from the batch that first sold the record, and one written above. */
const P = {
  COLOURED_CANYON: B03RP.SSS_COLOURED_CANYON,
  SINAI_EVENING: B03RP.SSS_FIVE_IN_ONE,
  WHITE_ISLAND: B02P.EEO_WHITE_SMALL,
  SALAMA_CANYON: B03RP.STG_SALAMA_CANYON,
  SHAAB_SAMADAI: B09B.SHAAB_SAMADAI,
  GOUNA_TWO_TANK: B09A.D2E_GOUNA_TWO_TANK,
  TWO_DAY_CAIRO: B10P.TWO_DAY_PRIVATE,
  CUSTOM_CAIRO: B10P.CUSTOM_DAY,
  MAKADI_QUAD: PROGRAMMES.MKD_QUAD_SUNSET,
  SPEEDBOAT: B09A.HBT_SPEEDBOAT_SNORKEL,
} satisfies Record<string, PriceSpec>;

/**
 * The twenty photographs this batch shows, every one of them already published on the network, at the exact
 * address the batch that first published it carries. No upload is made for this batch.
 */
const PHOTO = {
  // b09: the Hurghada and Marsa Alam boat records.
  bowOverLagoon: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787782233/tours/wirlheh3pj6ibboavetn.jpg',
  sailboatSunset: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788796522/tours/jxzuelgfb5r9vdl36xoa.jpg',
  diverRedCoral: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788528182/tours/xpacckqybvfyq4vbnas1.jpg',
  diveBoatFromAbove: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788212485/tours/c3syeyx758xwhljxpfqk.jpg',
  whiteDiveYacht: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788292140/tours/od1x6rhlyxx6fz6atv12.jpg',
  speedboatAtSpeed: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787782177/tours/tpfuorpe6kgzzx78smwe.jpg',
  snorkellerByReef: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781999/tours/n4iiykztyszzlhk5mavf.jpg',
  dolphinsAndSwimmer: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795260/tours/fs65spccs0uncfww6z9k.jpg',
  snorkellerThumbsUp: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788290961/tours/pxb310hq6keozafoaqdx.jpg',
  // b03-rest: the Sharm El Sheikh and Hurghada desert records.
  jeepBelowTheRocks: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936173/attractions-network/network-b03/sharm-tour-guide/xvskdnp6simwnlxvry6x.jpg',
  riderOnACamel: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936195/attractions-network/network-b03/safari-sharm-el-sheikh/qqo25k0p0m1qtvfzz3hd.jpg',
  whiteIslandFromTheAir: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936158/attractions-network/network-b03/sharm-tour-guide/mn1pbadyiqwld8zrsne6.jpg',
  snorkellerOverCoral: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936160/attractions-network/network-b03/sharm-tour-guide/jarhqtfzkmkjlqh8mdiz.jpg',
  camelInTheCanyon: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936174/attractions-network/network-b03/sharm-tour-guide/wpygg5o9iwxlr8lxp9q4.jpg',
  jeepOnStonyGround: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936198/attractions-network/network-b03/safari-sharm-el-sheikh/ihzuvhkpdyzmh1dguahw.jpg',
  quadOnTheDunes: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936187/attractions-network/network-b03/quad-safari-hurghada/p8fqna6unqcyjvvl9s86.jpg',
  buggyOnTheShore: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936184/attractions-network/network-b03/quad-safari-hurghada/unpa2hggou46q91yae5q.jpg',
  // b08 and b10: the Dahab canyon and the Cairo records.
  canyonWalls: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085619/attractions-network/network-b08/coral-reefs-dahab/lfsrxdbnyahmgcgfn9zl.jpg',
  threePyramids: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787780674/tours/cyqhwwakyack600gfghk.jpg',
  museumHall: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795937/tours/wmork7lo2zbrpokbb4sn.jpg',
  sphinxAndPyramid: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788796912/tours/mhbnyzl0vhwyxopd4hzk.jpg',
  plateauAtLowSun: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781847/tours/ira2tyqp7tp0acwe6ztd.jpg',
  stepPyramidAtDusk: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781377/tours/wkmxhvoiwvc36jaxfrr6.jpg',
  // b14: the Marsa Alam coast records.
  dayBoatAtAnchor: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788794476/tours/smf4lqwlugbxjepjbagn.jpg',
  // b02: the Sharm El Sheikh boat records.
  yachtOffARockyShore: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792826499/attractions-network/network-sites/eeo/jukhmljqqiogdxbc3bim.jpg',
};

/**
 * Each photograph described as it is, not as the trip or the place it stands beside: the words the batch that
 * first published it wrote for it, word for word, so no photograph on the network is described two ways.
 */
const ALT: Record<keyof typeof PHOTO, string> = {
  bowOverLagoon: 'The white bow of a boat heading across a turquoise lagoon towards a low sandy shore',
  sailboatSunset: 'A sailing boat on calm water with the sun setting low behind it',
  diverRedCoral: 'A scuba diver beside a reef wall with long red whip coral in the foreground',
  diveBoatFromAbove: 'A small dive boat on turquoise water seen from above, with a diver and a coral head nearby',
  whiteDiveYacht: 'A large white diving yacht moored in clear shallow water',
  speedboatAtSpeed: 'A white and blue speedboat at speed on calm blue sea, with spray at its stern',
  snorkellerByReef: 'A snorkeller in a mask and wetsuit swimming beside a coral wall',
  dolphinsAndSwimmer: 'Three dolphins swimming above a coral reef, with a snorkeller in a yellow top swimming nearby',
  snorkellerThumbsUp: 'A snorkeller in a mask giving a thumbs-up underwater in deep blue water',
  jeepBelowTheRocks: 'A white four-wheel-drive parked on open desert gravel in front of a low red rock outcrop under a pale sky',
  riderOnACamel: 'A rider in a blue shirt and red headscarf sitting on a camel with a hand raised, red desert cliffs behind',
  whiteIslandFromTheAir: 'A pale sandbar island seen from the air in turquoise water, with dark patches of coral scattered across the shallows',
  snorkellerOverCoral: 'A snorkeller in a mask and snorkel swimming just under the surface above a coral reef, with a green and pink parrotfish below',
  camelInTheCanyon: 'A rider on a camel in the narrow floor of a sandstone canyon, with smooth red and orange walls rising on both sides',
  jeepOnStonyGround: 'A white four-wheel-drive standing on stony desert ground with bare brown hills behind it',
  quadOnTheDunes: 'A quad bike with a helmet strapped to it, parked on a dune with rolling red sand stretching away behind',
  buggyOnTheShore: 'A buggy standing on a flat shore at sunset with its riders aboard, a headland and a small tower on the point behind',
  canyonWalls: 'Weathered red rock walls above a sandy canyon floor, with a green shrub in the shade and blue sky over the ridge',
  threePyramids: 'The three Giza pyramids under a blue sky with white cloud, the smaller queens’ pyramids and loose blocks in front and rippled sand in the foreground',
  museumHall: 'A long museum hall of arched stone galleries on two floors, with statues and display cases down the middle',
  sphinxAndPyramid: 'The Great Sphinx seen from the side in warm light, worn at the face and shoulders, with a pyramid rising behind it under a pale sky',
  plateauAtLowSun: 'The Giza plateau at low sun, with the pyramids of Khafre and Menkaure above the temple ruins and the Sphinx between them',
  stepPyramidAtDusk: 'The stepped pyramid of Djoser rising in six tiers of worn stone above flat open sand, under a hazy sky at the end of the day',
  dayBoatAtAnchor: 'A white day boat at anchor in clear water near a low desert shore',
  yachtOffARockyShore: 'A white yacht anchored in clear turquoise water close to a rocky desert shore',
};

/**
 * What each site shows on its pages, in the order the creation run writes it: the home page's opening
 * photograph first, then the one its inner pages carry. Both are `SELECTION.md`'s own choices, and neither is a
 * photograph of the place or the business the site is named for.
 */
const SITE_PICTURES: Record<string, string[]> = {
  'blue-lagoon-dahab': [PHOTO.bowOverLagoon, PHOTO.sailboatSunset],
  'ein-kid': [PHOTO.jeepBelowTheRocks, PHOTO.riderOnACamel],
  'seven-pools': [PHOTO.whiteIslandFromTheAir, PHOTO.snorkellerOverCoral],
  'wadi-zaghara': [PHOTO.canyonWalls, PHOTO.camelInTheCanyon],
  'gebel-el-rosas-bay': [PHOTO.dayBoatAtAnchor, PHOTO.diverRedCoral],
  'marsa-abu-galawa': [PHOTO.diveBoatFromAbove, PHOTO.whiteDiveYacht],
  'skar-transport-cairo': [PHOTO.threePyramids, PHOTO.museumHall],
  'future-travel-egypt': [PHOTO.sphinxAndPyramid, PHOTO.plateauAtLowSun],
  // The quad, not `SELECTION.md`'s two buggies: the day sold here is a quad ride (see this file's opening note).
  'makadi-bay-safari-day': [PHOTO.quadOnTheDunes, PHOTO.buggyOnTheShore],
  'hurghada-speedboat-day': [PHOTO.speedboatAtSpeed, PHOTO.snorkellerByReef],
};

/**
 * Why no site opens on a photograph of its own subject: there is none, and none was made for this batch. The
 * note is written for a reader of the tenant record, in each site's own words, and it never calls a photograph
 * the place or the business the site is named for.
 */
const SHORTFALL: Record<string, string> = {
  'blue-lagoon-dahab': 'No photograph of this lagoon could be made for the site, so it shows two the client publishes of sheltered water reached by boat, and neither of them is a photograph of the lagoon.',
  'ein-kid': 'No photograph of this oasis could be made for the site, so it shows two the client publishes of how the approach is made, by vehicle and then by camel, and neither of them is a photograph of the oasis.',
  'seven-pools': 'No photograph of this stop could be made for the site, so it shows two the client publishes of its day: the sandbar island the programme names and a snorkeller over shallow coral. Neither is a photograph of the stop.',
  'wadi-zaghara': 'No photograph of this valley could be made for the site, so it shows two the client publishes of a sandstone canyon floor and a camel ride through one, and neither of them is a photograph of the valley.',
  'gebel-el-rosas-bay': 'No photograph of this bay could be made for the site, so it shows two the client publishes of a boat at anchor on this coast and a diver at a reef wall, and neither of them is a photograph of the bay.',
  'marsa-abu-galawa': 'No photograph of this reef could be made for the site, so it shows two the client publishes of a two-dive day on this coast, and neither of them is a photograph of the reef.',
  'skar-transport-cairo': 'No photograph of this company could be made for the site, and none of its own is reused, so it shows two the client publishes of the day it sells: the pyramids of Giza and a museum hall.',
  'future-travel-egypt': 'No photograph of this company could be made for the site, and none of its own is reused, so it shows two the client publishes of the day it sells, the Sphinx and the Giza plateau.',
  'makadi-bay-safari-day': 'No photograph of this company could be made for the site, and none of its own is reused, so it shows two the client publishes of the desert riding it sells, a quad and a buggy.',
  'hurghada-speedboat-day': 'No photograph of this company could be made for the site, and none of its own is reused, so it shows two the client publishes of the day it sells, a speedboat under way and a snorkeller at a reef.',
};

const SHARM = { lat: 27.7369, lng: 34.3394 };
const MARSA_ALAM = { lat: 25.0676, lng: 34.879 };
const EL_GOUNA = { lat: 27.3942, lng: 33.6782 };
const MAKADI = { lat: 26.9806, lng: 33.9056 };
const HURGHADA = { lat: 27.2579, lng: 33.8116 };
const CAIRO = { lat: 30.0444, lng: 31.2357 };

/**
 * The fence batch B10 gave its own Dahab-coast site, which lets Dahab, the Blue Hole and Abu Galum through and
 * bars every other town. The lagoon of the same name on the Red Sea coast is therefore named as that and not by
 * its town, which is the one thing a reader needs to tell the two apart.
 */
const NOT_DAHAB_COAST = /Hurghada|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Cairo|Giza|pyramid|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Tiran|Ras Mohamed|Ras Muhammad|Nabq|Taba/i;
/** Wadi Zaghara's fence: the Dahab-coast fence with St Catherine and Nuweiba allowed, because its facts name both. */
const NOT_ZAGHARA = NOT_DAHAB_COAST;
/**
 * Ein Kid's fence: the Dahab-coast fence with Dahab barred as well. The oasis lies inland in the Wadi Kid
 * country and no source puts a distance between it and any town, so no page here names one.
 */
const NOT_EIN_KID = new RegExp(`${NOT_DAHAB_COAST.source}|Dahab`, 'i');
/**
 * Seven Pools' fence: the fence batch B12 gave its own Ras Mohammed site, which bars Dahab, with "Three Pools"
 * barred outright as well. The client sells Dahab's Three Pools and the network has a site for it; that name
 * may not reach any page here, and the one place the two are told apart is this site's tenant description.
 */
const NOT_RAS_MOHAMMED = /Hurghada|Giftun|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Nabq|Hamata|Dahab|Tiran|Cairo|Giza|pyramid|Luxor|Aswan|Fayoum|Alexandria|Siwa|Bahariya|Taba|Nuweiba/i;
const NOT_SEVEN_POOLS = new RegExp(`${NOT_RAS_MOHAMMED.source}|Three Pools`, 'i');
/**
 * Gebel El Rosas bay's fence: the Marsa Alam coast fence of batches B14 and B15C, with "Dolphin House" barred,
 * because the record this site sells is published under that title and the reef of that name lies off another
 * town, and with "Ras Muhammad" barred as well: an operator region label uses those words for this coast and
 * they belong to a national park six hundred kilometres away.
 */
const NOT_MARSA = /Gouna|Hurghada|Makadi|Sahl|Safaga|Soma Bay|Quseir|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Ras Muhammad|Catherine|Cairo|Giza|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Pyramid|Sphinx/i;
const NOT_ROSAS = new RegExp(`${NOT_MARSA.source}|Dolphin House`, 'i');
/**
 * Marsa Abu Galawa's fence: the boats leave El Gouna and Hurghada for the water the reef lies in, and the far
 * southern group of the same name is named once to be set aside, so El Gouna, Hurghada, Fury Shoals and Hamata
 * are the four places this site may name and nothing else is.
 */
const NOT_GALAWA = /Cairo|Giza|Luxor|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Ras Muhammad|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Sahl|Makadi|Alexandria|Siwa|Bahariya|Fayoum|Sataya|Samadai/i;
/** The fence batch B10 gave its own Giza and Cairo sites, which lets the plateau, Saqqara and Memphis through. */
const NOT_GIZA_WIDE = /Hurghada|Dahab|Nabq|Tiran|Ras Mohamed|Ras Muhammad|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum/i;
/**
 * Future Travel Egypt's fence is the widest of the ten, because the one fact this site carries about where the
 * agency works names ten places across Egypt, this site's own day among them. What it bars is everything
 * neither that list nor the record names.
 */
const NOT_FUTURE_TRAVEL = /Dahab|Nuweiba|Taba|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Nabq|Tiran|Ras Mohamed|Ras Muhammad|Siwa|Fayoum|Dahshur/i;
/**
 * Makadi Bay Safari's fence: the five places the business's own destination pages cover are the five it may
 * name, and the day it sells stays inside the first of them.
 */
const NOT_MAKADI = /Cairo|Giza|pyramid|Luxor|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Ras Muhammad|Marsa Alam|Quseir|Ghalib|Alexandria|Siwa|Bahariya|Fayoum|Sataya|Samadai|Giftun|Orange Bay|Dolphin House/i;
/**
 * Hurghada Speedboat's fence: the Hurghada boat fence of batches B09 and B13 to B15, with the three places the
 * business's own pages name barred outright. The day's own programme names no island and no reef, so no page of
 * this site names one.
 */
const NOT_HURGHADA_BOATS = /Cairo|Giza|Luxor|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Ras Muhammad|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Gouna|Sahl|Makadi|Alexandria|Siwa|Bahariya|Fayoum|Sataya|Samadai|Giftun|Orange Bay|Dolphin House/i;

/** The closing line every B11 to B15C site ends on, and every site here. */
const CLOSING = 'Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.';

/** B16: six places the client's days do not reach, and four businesses selling one of its days each. */
export const B16: NetworkBatch = {
  id: 'b16',
  sites: [
    {
      slug: 'blue-lagoon-dahab',
      name: 'Blue Lagoon Dahab',
      listingPath: '/trips',
      domain: 'dahabbluelagoon.com',
      city: 'Sharm El Sheikh',
      area: 'Sharm El Sheikh',
      pickupDestination: 'sharm-el-sheikh',
      coordinates: SHARM,
      currency: 'USD',
      slugPrefix: 'bld-',
      foreignPlaces: NOT_DAHAB_COAST,
      tagline: 'A jeep day eight kilometres short of it',
      description: `The Blue Lagoon is a shallow, sheltered lagoon on the Gulf of Aqaba coast north of Dahab, beyond Ras Abu Galum. It is not the Laguna in Dahab town, and it is not the lagoon of the same name far down the Red Sea coast. Two independent registers publish it a hundred and seventeen metres apart, at about 28.638 N, 34.578 E, and it stands at a sandspit the gazetteers carry as Al Qurdud, or El Gardud, القردود. No road reaches it: it is reached by boat, on foot or by camel along the coast path from the Blue Hole, or by four-wheel drive from the north. It lies inside the Abu Galum protected area, declared in 1992, where building is restricted to traditional Bedouin structures, so camps of simple huts stand on its shore and serve meals and there is no hotel development. It is shallow and sheltered, listed as a wind and kite spot rather than as a dive site, and no dive register for the town lists it at all.\n\nThis jeep day stops at the Colored Canyon, in Dahab and at the Blue Hole; its programme does not name the Blue Lagoon, the shallow lagoon about eight kilometres further north up the coast, beyond Ras Abu Galum. One trip is sold here, and the furthest north it goes is that Blue Hole: ten hours by road and four-wheel drive, with two hours walking the canyon, a camel ride by the sea and lunch in a Bedouin tent on the beach. ${CLOSING}`,
      seo: {
        metaTitle: 'Blue Lagoon Dahab: the Coloured Canyon Jeep Day',
        metaDescription: 'A ten-hour jeep day from Sharm El Sheikh: two hours walking the Coloured Canyon, a camel ride by the sea and lunch in a Bedouin tent at Dahab.',
        keywords: ['blue lagoon dahab beyond ras abu galum', 'shallow lagoon with no road to it', 'abu galum protected area bedouin huts', 'coloured canyon jeep day from sharm', 'al qurdud sandspit gulf of aqaba'],
      },
      theme: { primaryColor: '#15282B', secondaryColor: '#F1F4F3', accentColor: '#0E5A63' },
      heroImages: [...SITE_PICTURES['blue-lagoon-dahab']],
      photoShortfall: SHORTFALL['blue-lagoon-dahab'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/blue-lagoon-dahab/monogram.png',
      trips: [
        {
          path: 'ten-hours-to-the-coloured-canyon-and-the-dahab-shore',
          price: P.COLOURED_CANYON,
          title: 'Ten Hours to the Coloured Canyon and the Dahab Shore',
          short: 'Ten hours inland and back: the canyon on foot with a guide, a four-wheel drive down to the water, a swim, a camel and a meal under canvas.',
          description: 'The minibus is at your hotel for eight, and the road north runs an hour before a four-wheel drive takes over for the climb. The canyon is the long stop of the morning, led on foot by a guide who reads the banded rock back to you. Then the day drops to the water: time to walk the town, a stretch in the sea with a mask, a camel waiting on the sand and a meal served under canvas. What the programme names is the Colored Canyon, Dahab and the Blue Hole, not the Blue Lagoon, the shallow lagoon about eight kilometres further north up the coast beyond Ras Abu Galum; nothing on this day goes past the Blue Hole.\n\nThree ways of taking it are published: the walk and a swim off the shore; the same with a quad run added along the water and up between the hills; or that pair again with the two protected-area entries settled for you. A mask and fins, anything bought at the restaurant and whatever you tip are yours to pay. Everyone needs an original passport on the day, and a child carries a price of its own.',
          highlights: [
            'The canyon read back to you on foot',
            'A four-wheel drive down to the water',
            'A swim and a camel on the sand',
            'A meal served under canvas',
          ],
          seo: {
            metaTitle: 'Coloured Canyon and the Dahab Shore: a Ten-Hour Jeep Day',
            metaDescription: 'Ten hours from the hotel door: the canyon on foot with a guide, a four-wheel drive down to the water, a swim, a camel and a meal under canvas.',
          },
          images: [PHOTO.jeepOnStonyGround],
          imageAlts: [ALT.jeepOnStonyGround],
        },
      ],
    },
    {
      slug: 'ein-kid',
      name: 'Ein Kid',
      listingPath: '/trips',
      domain: 'einkiddahab.com',
      city: 'Sharm El Sheikh',
      area: 'Sharm El Sheikh',
      pickupDestination: 'sharm-el-sheikh',
      coordinates: SHARM,
      currency: 'USD',
      slugPrefix: 'ekd-',
      foreignPlaces: NOT_EIN_KID,
      tagline: 'A desert evening, and no distance to give',
      description: `Ein Kid, also written Ein Kidd, is a desert oasis of palm trees and bamboo, inland in South Sinai. It is the junction of the two halves of the Sinai Trail: the first part runs from Ras Shetan on the Gulf of Aqaba coast to Ein Kidd, and the second carries on from there towards St Katherine. No road reaches it. Visitors go by four-wheel drive to a trailhead and continue on foot, by camel or by donkey, walking with Bedouin guides on a trail the Bedouin run themselves, and the approach is a wadi and mountain walk of several days, usually taken as part of a longer trek rather than as a day out. No public source publishes a position for it: there is no coordinate in the mapping records, the gazetteers, Wikidata or the encyclopaedias, and the trail's own pages give none either. So this site shows no coordinates, no map, no pin and no bearing, and it gives no distance from anywhere.\n\nThis day goes inland into the Sinai desert behind Sharm El Sheikh for a quad ride, a camel ride and a Bedouin dinner; its programme does not name Ein Kid, and because no position for the oasis has ever been published, how far that desert camp lies from it cannot be said. One trip is sold here: five hours in stages, the riding broken by tea, a camel and a buffet dinner at a camp, with telescopes and an astronomy guide at the end of it. ${CLOSING}`,
      seo: {
        metaTitle: 'Ein Kid: a Sinai Desert Evening from Sharm',
        metaDescription: 'A five-hour Sinai desert evening from Sharm El Sheikh: quad riding in stages, Bedouin tea, a camel ride, a buffet dinner and telescopes after dark.',
        keywords: ['ein kid ein kidd sinai oasis', 'where the sinai trail halves meet', 'palms and bamboo oasis south sinai', 'no published position for ein kid', 'sinai desert quad and bedouin dinner evening'],
      },
      theme: { primaryColor: '#241F18', secondaryColor: '#F6F3EC', accentColor: '#6B4A14' },
      heroImages: [...SITE_PICTURES['ein-kid']],
      photoShortfall: SHORTFALL['ein-kid'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/ein-kid/monogram.png',
      trips: [
        {
          path: 'an-evening-on-a-quad-in-the-sinai-desert',
          price: P.SINAI_EVENING,
          title: 'An Evening on a Quad in the Sinai Desert',
          short: 'Five hours taken in stages: a run out, a halt for tea and a camel, a buffet and a show at the camp, then an astronomer with telescopes.',
          description: 'A van collects the group and drives out to the desert base, where half an hour goes on the safety talk before anyone takes a machine out. The crossing is made in stages rather than in one run: a stretch away from the base, a halt for tea and a turn on a camel, a second stretch, and the camp at the end of it. What the programme names is the Sinai desert behind the town and the safari centre, not Ein Kid, the inland oasis where the two halves of the Sinai Trail meet; and because no position for that oasis is published, how far this camp lies from it cannot be said.\n\nAt the camp a buffet is laid out with an oriental show, and when that is done the telescopes are set up and an astronomer walks you round the sky. A short final leg brings you back to the van. Two starts are published, one in the late afternoon and one late at night. Riders may have a machine each or pair up on one and take turns at the wheel. A desert conservation fee of a dollar a head is handed over in cash at the gate, under-sixteens may ride behind an adult but may not drive, and a meatless plate can be arranged.',
          highlights: [
            'The crossing made in stages, not one run',
            'A halt for tea and a turn on a camel',
            'A buffet and an oriental show',
            'An astronomer and the telescopes',
          ],
          seo: {
            metaTitle: 'A Sinai Desert Quad Evening with Dinner and Telescopes',
            metaDescription: 'Five hours in the Sinai desert from Sharm El Sheikh, taken in stages: a halt for tea and a camel, a buffet and a show, then the telescopes.',
          },
          images: [PHOTO.riderOnACamel],
          imageAlts: [ALT.riderOnACamel],
        },
      ],
    },
    {
      slug: 'seven-pools',
      name: 'Seven Pools',
      listingPath: '/trips',
      domain: 'sevenpoolscoralreef.com',
      city: 'Sharm El Sheikh',
      area: 'Sharm El Sheikh',
      pickupDestination: 'sharm-el-sheikh',
      coordinates: SHARM,
      currency: 'USD',
      slugPrefix: 'svp-',
      foreignPlaces: NOT_SEVEN_POOLS,
      tagline: 'A cruise inside the same park',
      description: `Seven Pools is the name the snorkelling trade uses for a shallow coral stop inside Ras Mohammed National Park, at the southern tip of the Sinai peninsula. It is reached by boat, on trips leaving from the marina at Sharm El Sheikh. No position is published for it: one snorkelling register carries a single map pin, and no gazetteer, no mapping record, no dive register and no encyclopaedia holds the name in Egypt at all, so nothing on these pages places it. Four statements about it are carried by two independent sources, and two of those four are about the park and about the boat day rather than about the stop, which is why these pages say so little and claim no more: boat days out of the town commonly pair reef snorkelling with a stop at White Island, which depends on the tide, and the park's other well-known stops, the mangrove channel and the earthquake crack, are stops on land rather than part of a boat snorkel. The name belongs to this stop alone: a similarly named row of pools lies on another Sinai coast and is a separate place in a separate town, and nothing on this site is taken from it.\n\nThis small-group cruise snorkels inside Ras Mohammed National Park and calls at White Island; its programme does not name Seven Pools, and because no position for that stop is published, how far the boat passes from it cannot be said. One trip is sold here: eight hours, with the park fees and the hotel transfer in the price and the snorkelling gear hired or added at booking. ${CLOSING}`,
      seo: {
        metaTitle: 'Seven Pools: a Ras Mohammed Small-Group Cruise',
        metaDescription: 'Eight hours by boat from Sharm El Sheikh into Ras Mohammed National Park, calling at White Island, with the park fees and the hotel transfer.',
        keywords: ['seven pools ras mohammed snorkelling stop', 'shallow coral stop with no published position', 'white island ras mohammed small group cruise', 'ras mohammed boat day from sharm el sheikh', 'snorkelling trade name for a park stop'],
      },
      theme: { primaryColor: '#17262B', secondaryColor: '#EFF5F6', accentColor: '#15565C' },
      heroImages: [...SITE_PICTURES['seven-pools']],
      photoShortfall: SHORTFALL['seven-pools'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/seven-pools/monogram.png',
      trips: [
        {
          path: 'eight-hours-inside-ras-mohammed-and-white-island',
          price: P.WHITE_ISLAND,
          title: 'Eight Hours Inside Ras Mohammed, and White Island',
          short: 'Eight hours by boat in a small group: into Ras Mohammed National Park and on to the sandbar at White Island, with the park fees and the transfer.',
          description: 'A coach collects you from your hotel and runs down to the marina, and the boat leaves at eight for the national park. The sailing is in a small group, the park entry is settled inside the price, and the sandbar at White Island is the stop the programme names beside the park itself; the island stands out of the water with the tide, so what it looks like depends on the hour. What the programme names is the park and that island, not Seven Pools, the shallow coral stop the snorkelling trade names inside the same park; no position for that stop is published, so how far the boat passes from it cannot be said.\n\nThe snorkelling gear sits outside this price and can be added when you book or hired at the marina, and a beginner dive can be added in the same way. A child carries a price of its own. Bring something to cover your shoulders for the open deck, and expect the order of the day to follow the sea rather than a clock.',
          highlights: [
            'A small group for the whole sailing',
            'Into Ras Mohammed National Park',
            'The sandbar at White Island',
            'The park fees inside the price',
          ],
          seo: {
            metaTitle: 'Ras Mohammed and White Island: an Eight-Hour Cruise',
            metaDescription: 'A small-group boat day from Sharm El Sheikh: eight hours into Ras Mohammed National Park and on to the White Island sandbar, park fees included.',
          },
          images: [PHOTO.yachtOffARockyShore],
          imageAlts: [ALT.yachtOffARockyShore],
        },
      ],
    },
    {
      slug: 'wadi-zaghara',
      name: 'Wadi Zaghara',
      listingPath: '/trips',
      domain: 'wadizagharadahab.com',
      city: 'Sharm El Sheikh',
      area: 'Sharm El Sheikh',
      pickupDestination: 'sharm-el-sheikh',
      coordinates: SHARM,
      currency: 'USD',
      slugPrefix: 'wzg-',
      foreignPlaces: NOT_ZAGHARA,
      tagline: 'A Dahab day twelve kilometres off',
      description: `Wadi Zaghara lies north-west of Dahab, inland of the Dahab to Nuweiba road, and the mouth of its mapped lower reach is about ten kilometres from the town. Its name is written four ways — وادي زغرة on the map, Wadi Zaghrah as the gazetteer transliterates it, and Wadi Zaghra and Wadi Zaghara in common use — and all four belong to one corridor, of which this site is about the lower reach, the one the town's own camel safaris use. It is an intermittent desert wadi, a watercourse dry for most of the year rather than a running stream, and it is the corridor by which the inland route from the town reaches the St Catherine area, climbing substantially on the way from near sea level at the coast road to several hundred metres inland. Guided Bedouin camel safaris work it and carry on to Wadi Hamam and the El Hadudah dune. The way in is a sand track open to vehicles as well as to walkers, horses and bicycles, with a police checkpoint on the way out of the town.\n\nThis day drives up to Dahab for a camel ride and snorkelling and takes a jeep out to the Colored Canyon; its programme does not name Wadi Zaghara, the sand-floored valley inland of the coast road whose mouth lies about ten kilometres from the town. One trip is sold here: ten and a half hours, with a guided walk in the Salama canyon, a camel ride along the shore, a stretch of snorkelling and lunch by the sea. ${CLOSING}`,
      seo: {
        metaTitle: 'Wadi Zaghara: the Dahab and Salama Canyon Day',
        metaDescription: 'A ten-and-a-half-hour day from Sharm El Sheikh: the Salama canyon by jeep, a camel ride on the Dahab shore, snorkelling and lunch by the sea.',
        keywords: ['wadi zaghara lower reach dahab', 'wadi zaghrah intermittent desert wadi', 'inland route from dahab to st catherine', 'bedouin camel safari wadi hamam el hadudah', 'salama canyon and dahab day from sharm'],
      },
      theme: { primaryColor: '#2A2017', secondaryColor: '#F7F2EC', accentColor: '#7A3A1C' },
      heroImages: [...SITE_PICTURES['wadi-zaghara']],
      photoShortfall: SHORTFALL['wadi-zaghara'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/wadi-zaghara/monogram.png',
      trips: [
        {
          path: 'the-salama-canyon-and-a-day-on-the-dahab-coast',
          price: P.SALAMA_CANYON,
          title: 'The Salama Canyon and a Day on the Dahab Coast',
          short: 'Ten and a half hours: the Salama canyon by jeep with a guide, a short camel ride on the shore, forty minutes in the water and lunch by the sea.',
          description: 'A minivan is at the hotel at half past seven; the road north runs a little under two hours. A jeep carries the group into the Salama canyon, and the walk through it is guided, with its entry and the government fees already covered. The coast takes the rest of the day: a short camel ride along the shore, forty minutes in the water, a long lunch and time in the town for the shops. What the programme names is the town, the canyon and the water, not Wadi Zaghara, the sand valley inland of the coast road whose mouth lies about ten kilometres from that town; no part of this day turns inland to it.\n\nThere are two ways to book it: the day with its snorkelling at the canyon site, or the same day with the entry to the Blue Hole instead. A child carries a price of its own, and the team confirms which ages count as children when it confirms the booking.',
          highlights: [
            'The Salama canyon by jeep, walked with a guide',
            'A camel ride along the shore',
            'Forty minutes in the water',
            'A long lunch and time in the town',
          ],
          seo: {
            metaTitle: 'The Salama Canyon and the Dahab Coast in a Day',
            metaDescription: 'Ten and a half hours from Sharm El Sheikh: a guided walk in the Salama canyon, a camel ride on the shore, snorkelling and lunch by the sea.',
          },
          images: [PHOTO.jeepBelowTheRocks],
          imageAlts: [ALT.jeepBelowTheRocks],
        },
      ],
    },
    {
      slug: 'gebel-el-rosas-bay',
      name: 'Gebel El Rosas Bay',
      listingPath: '/trips',
      domain: 'gebelelrosasbay.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'grb-',
      foreignPlaces: NOT_ROSAS,
      tagline: 'A reef day thirty kilometres down the coast',
      description: `Gebel El Rosas is a bay and anchorage on the Red Sea coast north of Marsa Alam, carried in the gazetteers under that name and also as Marsa Gabal Elrosas and Marsa Jabal ar Rasas. Two independent sources publish its position a hundred and seventy-eight metres apart, at 25.2054 N, 34.8093 E, with an anchorage entry for the same feature three hundred and fourteen metres away, and it lies roughly fifteen to seventeen kilometres north of the town along the coast. A wadi and a named mountain ridge stand directly behind it, both recorded under the same name, and the name itself is lead: جبل الرصاص, the mount of lead. The mine of that name is a different, inland place, and no distance to it is given anywhere on this site, because its own two published positions disagree by thirteen kilometres. Dive guides list the bay as a boat-dive location and describe a narrow sandy-bottomed entrance and a coral garden. Hotels along the surrounding stretch of coast are marketed under the bay's name; none is named here and nothing on this site is a recommendation.\n\nThis cruise snorkels at Shaab Samadai, the dolphin reef off Marsa Alam; its programme does not name Gebel El Rosas, the bay about thirty kilometres north-west of that reef on the coast above the town. One trip is sold here, and all seven hours of it stay at that reef: two guided sessions in the water and a buffet lunch between them. ${CLOSING}`,
      seo: {
        metaTitle: 'Gebel El Rosas Bay: the Shaab Samadai Cruise',
        metaDescription: 'A boat day at the dolphin reef of Shaab Samadai from a Marsa Alam hotel: one led session in its inner water, one on the coral outside it, a buffet.',
        keywords: ['gebel el rosas bay anchorage', 'marsa jabal ar rasas red sea coast', 'the bay below the mount of lead', 'shaab samadai reef cruise marsa alam', 'boat dive location north of marsa alam'],
      },
      theme: { primaryColor: '#1E2328', secondaryColor: '#F2F3F4', accentColor: '#3B4A77' },
      heroImages: [...SITE_PICTURES['gebel-el-rosas-bay']],
      photoShortfall: SHORTFALL['gebel-el-rosas-bay'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/gebel-el-rosas-bay/monogram.png',
      trips: [
        {
          path: 'seven-hours-at-the-dolphin-reef-off-the-town',
          price: P.SHAAB_SAMADAI,
          title: 'Seven Hours at the Dolphin Reef off the Town',
          short: 'Seven hours at Shaab Samadai: one led session in the quiet water the reef encloses, another along the coral outside it, and a buffet set out aboard.',
          description: 'Pickup is from your hotel, and the boat heads for Shaab Samadai, a reef bent into a horseshoe whose quiet inner water spinner dolphins hold through the day for their rest. Two sessions in the water, each of them led, carry the whole day: one inside that quiet water, one along the coral on the open side, with masks, fins and a jacket for whoever asks. The programme holds to that reef alone, not Gebel El Rosas, the bay lying about thirty kilometres north-west of it on the coast above the town; the boat spends the day at the reef and nowhere else.\n\nBetween the two a buffet is set out on board with soft drinks to go round. The dolphins are wild and in open water, so the crew keep watch and nobody will tell you that you are certain to see one. A wetsuit, the park fee itself and a pickup from the far ends of the coast road are each charged on top, and a child has a price of its own.',
          highlights: [
            'A reef bent into a horseshoe',
            'One session in the quiet inner water',
            'One along the coral outside it',
            'A buffet set out between them',
          ],
          seo: {
            metaTitle: 'Seven Hours at the Horseshoe of Shaab Samadai',
            metaDescription: 'Seven hours afloat at Shaab Samadai: a led session in the quiet water the reef encloses, another along the coral outside it, and a buffet aboard.',
          },
          images: [PHOTO.dolphinsAndSwimmer],
          imageAlts: [ALT.dolphinsAndSwimmer],
        },
      ],
    },
    {
      slug: 'marsa-abu-galawa',
      name: 'Marsa Abu Galawa',
      listingPath: '/trips',
      domain: 'marsaabugalawahurghada.com',
      city: 'El Gouna',
      area: 'El Gouna',
      pickupDestination: 'el-gouna',
      coordinates: EL_GOUNA,
      currency: 'USD',
      slugPrefix: 'mag-',
      foreignPlaces: NOT_GALAWA,
      tagline: 'A two-dive day that names no site',
      description: `Marsa Abu Galawa is a sheltered lagoon or inlet in the Abu Galawa reef group, which lies north of Hurghada and is reached by boat: sandy shallows giving way to coral at a drop-off. Abu Galawa is a group of several named sites sharing one name — Marsa, Sakhwa, which the registers also write as El Sachwa, Gota and Erg — and Sakhwa is the northernmost of them, while the dive registers record "Abu Galawa" as the nickname of the Hurghada reef itself. It is not Careless Reef: no source treats the two names as one place, and two independent sources put them roughly fourteen kilometres apart, which is the one figure this site gives. A second, unrelated Abu Galawa group lies in the far south, around Fury Shoals and Hamata, about three hundred and eighty kilometres from Hurghada; it is named here only to be set aside, and nothing of it is described. No position for this inlet is published by a second source — only one mapping record carries a coordinate for it — so no figure, no map and no bearing for the inlet appears here at all.\n\nThis is a two-dive boat day out of El Gouna; its programme names neither of the sites it dives and does not name Marsa Abu Galawa, and because only one map record publishes a position for that reef, how far the boat passes from it cannot be said. One trip is sold here, for certified divers: eight hours, two guided dives with a surface interval between them, with or without the rental set. ${CLOSING}`,
      seo: {
        metaTitle: 'Marsa Abu Galawa: El Gouna Two-Tank Boat Dives',
        metaDescription: 'Eight hours out of El Gouna for certified divers: two guided boat dives with a surface interval, with or without the rental equipment.',
        keywords: ['marsa abu galawa sheltered reef inlet', 'abu galawa group marsa sakhwa gota erg', 'abu galawa is not careless reef', 'no published position for the inlet', 'el gouna two tank boat dives certified divers'],
      },
      theme: { primaryColor: '#17251C', secondaryColor: '#F0F4F1', accentColor: '#17584A' },
      heroImages: [...SITE_PICTURES['marsa-abu-galawa']],
      photoShortfall: SHORTFALL['marsa-abu-galawa'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/marsa-abu-galawa/monogram.png',
      trips: [
        {
          path: 'two-guided-boat-dives-out-of-el-gouna',
          price: P.GOUNA_TWO_TANK,
          title: 'Two Guided Boat Dives Out of El Gouna',
          short: 'Eight hours for divers already certified: two dives at two separate sites with an interval on deck between them, tanks and weights aboard, no meal.',
          description: 'This one is for divers who hold a certification already. A car is at the door at eight for the run to the harbour, and the kit goes together on deck as the boat clears the moorings. Two dives follow at two separate sites with an interval on the surface between them, and there are toilets and a shower on board. What the programme names is the town the day leaves from, and neither of the two sites it works: it does not name Marsa Abu Galawa, the sheltered inlet in the Abu Galawa reefs; only one map record publishes a position for that reef, so how far the boat passes from it cannot be said, and no page here promises a dive at any named site.\n\nTanks, weights, Nitrox for those qualified to breathe it, water and fruit come with the day. Pick the option that carries a full rental set unless you travel with your own; have your certification card and your log book on you; and plan to feed yourself, because no meal is in this price. A child carries a price of its own.',
          highlights: [
            'Two dives at two separate sites',
            'An interval on the surface between them',
            'Tanks, weights and Nitrox provided',
            'A full rental set for anyone who needs one',
          ],
          seo: {
            metaTitle: 'Two Guided Boat Dives Out of El Gouna in a Day',
            metaDescription: 'An eight-hour day for divers already certified: two dives at separate sites off El Gouna, an interval on deck, Nitrox aboard, a car both ways.',
          },
          images: [PHOTO.diveBoatFromAbove],
          imageAlts: [ALT.diveBoatFromAbove],
        },
      ],
    },
    {
      slug: 'skar-transport-cairo',
      name: 'SKAR Transport Cairo',
      listingPath: '/trips',
      domain: 'skartransportcairo.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'skr-',
      foreignPlaces: NOT_GIZA_WIDE,
      tagline: 'Two private days in Cairo and Giza by car',
      description: `SKAR Transport Cairo presents itself as a private airport-transfer and car-with-driver service in Cairo, with transfers to and from Cairo and Giza, business transfers and a tours section. Its own site gives its service area as Cairo, Giza, New Cairo and 6th of October, and names Cairo International Airport and the pyramids of Giza; it offers three vehicle classes sorted by how many passengers and bags they take rather than by make or model; and it is published in English and Arabic, as this site is. Every one of those statements is what the company publishes about itself: no independent listing of it was found, so nothing here is written as corroborated, and the things its own site does not publish — a licence or registration number, a street address, a telephone number, an e-mail, any count of drivers or vehicles and any number of years in business — are claimed nowhere on these pages. Its own fares are not reproduced either: every price here comes from the trip record this site sells.\n\nThe day sold here is a two-day private sightseeing tour of Cairo and Giza by car, which can be collected from and returned to Cairo International Airport; it is not an airport transfer, and no page on this site sells one. One trip is sold here: two days with a private vehicle, a guide and lunch on each of them, and the entry fees for the sites they visit. ${CLOSING}`,
      seo: {
        metaTitle: 'SKAR Transport Cairo: Two Private Days by Car',
        metaDescription: 'A two-day private sightseeing tour of Cairo and Giza by car: the plateau, Sakkara and Memphis on day one, the two great museums on day two.',
        keywords: ['skar transport cairo car with driver', 'private sightseeing day cairo and giza by car', 'two day private tour with guide and lunch', 'collected from cairo international airport', 'vehicle classes by passengers and luggage'],
      },
      theme: { primaryColor: '#23211C', secondaryColor: '#F4F3F0', accentColor: '#8A2F4C' },
      heroImages: [...SITE_PICTURES['skar-transport-cairo']],
      photoShortfall: SHORTFALL['skar-transport-cairo'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/skar-transport-cairo/monogram.png',
      trips: [
        {
          path: 'two-private-days-in-cairo-and-giza-by-car',
          price: P.TWO_DAY_CAIRO,
          title: 'Two Private Days in Cairo and Giza by Car',
          short: 'Two days by private car with a guide and a meal: Giza, Sakkara and Memphis on day one; the two great museums of the city on day two.',
          description: 'A private air-conditioned car stands at your hotel for eight on both mornings. The first day works the Giza plateau — its pyramids, the Valley Temple, the Sphinx itself — before turning south to Sakkara for the Step Pyramid and ending at Memphis, where the old capital lies in ruins with a fallen colossus of Ramses II and an alabaster sphinx laid out beside it. Indoors on the second: the museum on Tahrir Square, then the national museum of Egyptian civilization and its royal mummies. What the programme names is those stops, by car, with a guide; it is not an airport transfer, and no page on this site sells one.\n\nThe guide speaks English. A meal is eaten on each of the two days, and the entry to every site the pair of them takes in is settled inside the price. The car comes for you both mornings and brings you back both evenings. A child carries a price of its own.',
          highlights: [
            'The plateau, then Sakkara and Memphis',
            'A fallen colossus and an alabaster sphinx',
            'Both museums on the second day',
            'A car and a guide of your own throughout',
          ],
          seo: {
            metaTitle: 'Two Private Days by Car: Giza, Sakkara and the Museums',
            metaDescription: 'Two days by private car with a guide and a meal: the plateau, Sakkara and Memphis, then the museum on Tahrir Square and the national museum.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'future-travel-egypt',
      name: 'Future Travel Egypt',
      listingPath: '/trips',
      domain: 'futuretravelegypt.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'fte-',
      foreignPlaces: NOT_FUTURE_TRAVEL,
      tagline: 'A Cairo sightseeing day, built to order',
      description: `Future Travel Egypt is a tour-package agency: what it publishes is multi-day Egypt packages, Nile cruise packages, sightseeing day tours, weekend and overnight trips, and bus and sleeper-train itineraries, across the ten places its own pages name — Cairo, Giza, Aswan, Luxor, Alexandria, Hurghada, Sharm El Sheikh, the White Desert, Bahariya Oasis and the Nile. All of that is the agency's own account of itself. Nothing in it is confirmed anywhere else: the search for a separate listing, under this domain or under the name, turned up nothing at all, and no page here presents any of it as checked. Its own site trades under a different name from this domain and the contact details it publishes belong to that other name, so neither is repeated here; nor is the address it gives, which is garbled where it stands; nor any of its figures, which put one identical price on four different packages. What this site sells is a single day of what the agency advertises rather than a package, and the price of that day is the trip record's.\n\nThe day sold here is a Cairo sightseeing day built to order around the Giza pyramids and the Sphinx; the multi-day packages the business advertises elsewhere are not sold on this site. One trip is sold here, shared or private: the plateau, the Egyptian Museum and Old Cairo, with the entry tickets and the choice of how to take it made at booking. ${CLOSING}`,
      seo: {
        metaTitle: 'Future Travel Egypt: a Custom Cairo Day',
        metaDescription: 'A Cairo sightseeing day built around the Giza pyramids and the Sphinx, with the Egyptian Museum and Old Cairo, shared or private, tickets included.',
        keywords: ['future travel egypt cairo sightseeing day', 'custom giza pyramids and sphinx day', 'shared or private cairo day with tickets', 'egyptian museum and old cairo day tour', 'tour package agency selling one cairo day'],
      },
      theme: { primaryColor: '#1F1E2A', secondaryColor: '#F3F2F6', accentColor: '#3C3A8A' },
      heroImages: [...SITE_PICTURES['future-travel-egypt']],
      photoShortfall: SHORTFALL['future-travel-egypt'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/future-travel-egypt/monogram.png',
      trips: [
        {
          path: 'a-cairo-day-around-the-pyramids-and-the-sphinx',
          price: P.CUSTOM_CAIRO,
          title: 'A Cairo Day Around the Pyramids and the Sphinx',
          short: 'A day with its tickets paid: two hours on the plateau and the Sphinx, two in the museum on Tahrir Square, an hour among the old churches.',
          description: 'An air-conditioned vehicle is at the door at eight, in the city or out at Giza. The plateau takes the first two hours, on foot between the pyramids of Khufu, Khafre and Menkaure and up to the Great Sphinx. An hour in town follows, and it is the hour to buy yourself something to eat. Two more hours go to the museum on Tahrir Square with the guide, and the last to the old Christian quarter and the churches in it. What the programme names is those three stops with their entry tickets, assembled around them; the multi-day packages advertised elsewhere are not sold on this site.\n\nTake it in a shared group, guided in English, or with a guide and vehicle to yourself, and name the language you want at booking if it is not English. The record also allows a stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school, which you may ask for or do without. No meal is in the price. How long the day runs, and the order it takes its stops in, move with the traffic and with the sites, and a child has its own price on the option that publishes one.',
          highlights: [
            'Two hours on foot between the pyramids',
            'The museum on Tahrir Square with the guide',
            'The churches of the old quarter',
            'Every ticket the day needs, paid',
          ],
          seo: {
            metaTitle: 'A Cairo Day: the Plateau, the Museum and the Churches',
            metaDescription: 'A day with its tickets paid: two hours on the plateau and the Sphinx, two in the museum on Tahrir Square, an hour among the old churches.',
          },
          images: [PHOTO.sphinxAndPyramid],
          imageAlts: [ALT.sphinxAndPyramid],
        },
      ],
    },
    {
      slug: 'makadi-bay-safari-day',
      name: 'Makadi Bay Safari Day',
      listingPath: '/trips',
      domain: 'makadibaysafari.com',
      city: 'Makadi Bay',
      area: 'Makadi Bay',
      pickupDestination: 'makadi-bay',
      coordinates: MAKADI,
      currency: 'USD',
      slugPrefix: 'mbs-',
      foreignPlaces: NOT_MAKADI,
      tagline: 'A quad ride in the desert behind the bay',
      description: `Makadi Bay Safari sells desert safaris from Makadi Bay by quad bike, dune buggy and jeep, in morning, sunset and private forms, and a combined safari among them; its own destination pages cover Makadi Bay, Hurghada, El Gouna, Sahl Hasheesh and Soma Bay. It states its own booking terms as well: a booking cancelled more than twenty-four hours ahead is refunded in whole, and payment is half by card with the balance in cash, or in whole by card. Each of those is the operator's own statement, and not one of them is confirmed by anybody else: no separate listing was found under the name. The link its own site offers for what its guests think of it points at a listing under a different brand, so nothing of that kind is attributed to it here. It publishes no prices at all, and the telephone number on its own site does not connect, so it is not reproduced here. It claims no licence, no tally of vehicles and no span of trading, because its own site states none. Prices here are the trip record's own, and a booking made through this site keeps that record's terms wherever the two part company.\n\nThe day sold here is a late-afternoon quad safari that starts and ends at a Makadi Bay hotel and rides the desert behind the bay; its programme names no other place, and nothing on this site promises a route it does not carry. One trip is sold here: three hours, with a guided ride on the desert tracks, a camel ride, Bedouin tea and time at the shore. ${CLOSING}`,
      seo: {
        metaTitle: 'Makadi Bay Safari: a Late Quad Ride Behind the Bay',
        metaDescription: 'A three-hour quad safari from a Makadi Bay hotel: a guided ride on the desert tracks behind the bay, a camel ride, Bedouin tea and time at the shore.',
        keywords: ['makadi bay safari quad ride', 'desert tracks behind makadi bay', 'quad safari with camel ride and bedouin tea', 'makadi bay hotel pickup desert safari', 'late afternoon quad safari red sea coast'],
      },
      theme: { primaryColor: '#27221B', secondaryColor: '#F7F4EF', accentColor: '#8A4312' },
      heroImages: [...SITE_PICTURES['makadi-bay-safari-day']],
      photoShortfall: SHORTFALL['makadi-bay-safari-day'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/makadi-bay-safari-day/monogram.png',
      trips: [
        {
          path: 'a-late-quad-ride-behind-makadi-bay',
          price: P.MAKADI_QUAD,
          title: 'A Late Quad Ride Behind Makadi Bay',
          short: 'Three hours from your hotel: a guided quad ride on the desert tracks behind the bay, a camel ride, Bedouin tea and time at the shore before the ride back.',
          description: 'The car collects you from your hotel in Makadi Bay in the late afternoon. The guide hands out the helmets and takes the group through the route before the quads are started, and the riding itself runs about two hours on the desert tracks behind the bay, with stops along the way. A camel ride and Bedouin tea come at the stop the day makes, and there is time at the beach before the ride back. What the programme names is the bay and that desert: it names no other place, and no page here promises a route it does not carry.\n\nA guide, the helmet and the local taxes and fees are inside the price. Drinks beyond the ones handed round, a scarf and glasses are not, and a pickup from a hotel outside the bay is not sold on this page. A child carries a price of its own, and the team confirms the pickup time when it confirms your booking.',
          highlights: [
            'A guided ride on the desert tracks',
            'About two hours in the saddle',
            'A turn on a camel, and tea',
            'Time at the shore before the return',
          ],
          seo: {
            metaTitle: 'A Late Quad Ride in the Desert Behind Makadi Bay',
            metaDescription: 'Three hours from a Makadi Bay hotel: a guided quad ride on the desert tracks behind the bay, a camel ride, Bedouin tea and time at the shore.',
          },
          images: [PHOTO.quadOnTheDunes],
          imageAlts: [ALT.quadOnTheDunes],
        },
      ],
    },
    {
      slug: 'hurghada-speedboat-day',
      name: 'Hurghada Speedboat Day',
      listingPath: '/trips',
      domain: 'hurghadaspeedboat.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'hsd-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'Four hours out of Hurghada, gear aboard',
      description: `Hurghada Speedboat sells speedboat and Red Sea day trips out of Hurghada: island runs, a dolphin-swim trip, water sports, a private charter, a sunset cruise, a snorkelling safari and a glass-bottom boat trip. It states that snorkelling gear and life jackets are provided and that a booking can be cancelled at no charge up to twenty-four hours ahead, and its own site is published with alternates for English, Arabic, German, French, Spanish and Russian. All of it is the seller's own account, and it is uncorroborated: nothing published anywhere else answers to this name. Its own site gives two accounts of how long it has traded which cannot both hold, so no length of trading is written anywhere here. The figures its front page puts up for how well it is thought of carry no source and its own trip cards contradict them, so none of those figures appears. The telephone number it publishes is not a working number and is not repeated. It gives no licence and no address, so this site claims neither. Its own prices are left where they are: the price on these pages is the trip record's, and a booking here follows that record wherever its terms and the seller's differ.\n\nThe day sold here is a four-hour speedboat snorkelling trip with a car from your hotel; its programme names no island and no reef, so no page on this site names one either. One trip is sold here, at two starting times: four hours, with the gear, a guide, the nature reserve fees, fruit and drinks aboard. ${CLOSING}`,
      seo: {
        metaTitle: 'Hurghada Speedboat Day: Four Hours Snorkelling',
        metaDescription: 'A four-hour speedboat snorkelling trip out of Hurghada with a car from your hotel: the gear, a guide, the reserve fees, fruit and drinks aboard.',
        keywords: ['hurghada speedboat snorkelling trip', 'four hour speedboat trip with hotel car', 'speedboat day with gear and guide aboard', 'red sea snorkelling out of hurghada marina', 'nature reserve fees inside the price'],
      },
      theme: { primaryColor: '#1E231D', secondaryColor: '#F2F3F1', accentColor: '#4A5A14' },
      heroImages: [...SITE_PICTURES['hurghada-speedboat-day']],
      photoShortfall: SHORTFALL['hurghada-speedboat-day'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/hurghada-speedboat-day/monogram.png',
      trips: [
        {
          path: 'four-hours-by-speedboat-with-the-gear-aboard',
          price: P.SPEEDBOAT,
          title: 'Four Hours by Speedboat with the Gear Aboard',
          short: 'Four hours out of the marina by speedboat: snorkelling with a guide, the gear and life jackets aboard, the reserve fees, fruit and drinks included.',
          description: 'A car comes for you at your hotel and runs down to the marina, and the speedboat goes out with shade and music on board. The snorkelling is done with the guide, the gear and the life jackets are handed out aboard, and fruit and drinks go round between the stops. What the programme names is the town and the water off it: it names no island and no reef at all, so no page here names one either, and where the boat stops on the day is for the crew and the sea to decide.\n\nThere are two starting times, morning and early afternoon. The nature reserve fees are inside the price. A pickup from outside the town costs extra and cannot be booked on this page, so ask the team first if your hotel is further out. A child carries a price of its own.',
          highlights: [
            'Four hours out of the marina',
            'A guide in the water with you',
            'The gear and life jackets aboard',
            'The nature reserve fees in the price',
          ],
          seo: {
            metaTitle: 'Four Hours by Speedboat Out of Hurghada Marina',
            metaDescription: 'A four-hour speedboat snorkelling trip from Hurghada with a car both ways: a guide, the gear and life jackets aboard, and the reserve fees paid.',
          },
          images: [PHOTO.snorkellerThumbsUp],
          imageAlts: [ALT.snorkellerThumbsUp],
        },
      ],
    },
  ],
};
