/**
 * Batch B10 (30 October 2026): ten sites for ten monument domains on Fouad's list — the Great Sphinx, the Giza
 * complex, the Great Pyramid, Mit Rahina, Sakkara, Khafre, Menkaure, Dahshur, the statues of Ramesses II and the
 * Three Pools day near Dahab. Four groups:
 *
 * - B10A: Great Sphinx of Giza, Pyramid Complex Giza, Great Pyramid of Cheops (the Giza plateau days).
 * - B10B: Mit Rahina Museum, Sakkara Pyramids, Pyramids of Dahshur (the days south of Giza).
 * - B10C: Pyramid of Khafre, Pyramid of Menkaure, Statue of Ramesses II.
 * - B10D: Three Pools Dahab.
 *
 * Every trip is built on the record the client publishes on its own main site, read into the dated snapshot
 * (`network-sites/eeo-snapshot.json`); prices, child rates, departures and inclusions are copied from that record
 * at apply time and never typed here. Six records were read into the snapshot for this batch on 30 October 2026
 * (`npm run read:eeo-snapshot`), and the client's published list was re-read the same day: 217 trips, the same
 * slugs and the same prices as on 27 and 28 October.
 *
 * A trip stays on a site only where the client's own record visits that site's place. The Great Sphinx takes the
 * days whose record names the Sphinx; Pyramid Complex Giza the days that walk the plateau; the Great Pyramid of
 * Cheops the days whose record names the Great Pyramid, Khufu or Cheops; Khafre and Menkaure only the days whose
 * record names that pyramid (a day that says no more than "the pyramids of Giza" goes to Pyramid Complex Giza);
 * Mit Rahina and Sakkara the days that stop at Memphis and at Saqqara; Dahshur the days whose own booking option
 * goes there; and the statues of Ramesses II the days that stand before one — the colossus at Memphis or the one
 * in the Grand Egyptian Museum's hall.
 *
 * Fourteen of the records are already written in earlier batches, so this batch imports those programmes rather
 * than restating them (`b03`, `b03-rest`, `b08`, `b09`): the same options, departures, renames and schedules, so
 * the network says the same thing about the same trip wherever it is sold. Five programmes are new here, written
 * to the same rules: no claim the network never shows, a conditional line replaced by the site's own words, a
 * schedule that is a list of pickup areas rewritten as the day, a child price only where an option sets one, an
 * extra only where the published record binds it to every option sold.
 *
 * Two things the coordinator must decide:
 * - Four pairs of sites in this batch sell the same records, because the client's days visit these monuments
 *   together: Great Sphinx of Giza and Pyramid Complex Giza (seventeen each), Mit Rahina Museum and Sakkara
 *   Pyramids (five each), Pyramid of Khafre and Pyramid of Menkaure (six each). The sites differ in their words,
 *   their photos and their design, not in their catalogue. If they should be split, the natural line is the
 *   half-days that stay on the plateau against the full days that carry on into Cairo; one edit either way.
 * - Every record here is also sold by a site already live (Giza Plateau Pyramids, Pyramids of Giza Egypt, Memphis
 *   and Sakkara, Pyramids Camel Tour, Egyptian Museum, Grand Egyptian Museum, Coral Reefs Dahab, Sharm Tour
 *   Guide, Pyramids Excursions). These ten domains are monument names rather than new subjects, so the owner's
 *   "do not duplicate what is already built" was read as satisfied by the domains themselves.
 *
 * Held back, and why (each is a question for the client in the build report):
 * - The long packages: `cairo-3-day-tour-pyramids-museums-islamic-cairo-nile-cruise`,
 *   `cairo-4-day-highlights-pyramids-ancient-sites-old-cairo`,
 *   `cairo-nile-cruise-6-day-egypt-highlights-abu-simbel-hot-air-balloon` and
 *   `egypt-in-9-days-cairo-alexandria-nile-cruise-luxor-abu-simbel`. Each runs for days across Alexandria, Aswan,
 *   Luxor and Abu Simbel with hotels, a Nile cruise and internal flights; no batch on the network sells one, and
 *   none of these ten sites can describe such a day without naming places it does not serve. The 9-day and 6-day
 *   records are also the only ones that reach the Abu Simbel statues, so the Ramesses site sells none of them.
 * - `luxor-day-tour-to-cairo-by-flight-with-pyramids-egyptian-museum` and
 *   `overnight-cairo-day-tour-from-luxor-by-vip-train`: both start in Luxor, by flight and by sleeper train. No
 *   network batch sells a record that starts there, and a Luxor pickup is outside every one of these ten sites.
 * - `cairo-museum-tour-choose-your-museum-explore-egypt-s-history` (its Memphis Museum option, $50/$30) and
 *   `cairo-private-guided-tour-to-your-choice-of-top-attractions` (its Saqqara option, $56/$36): both records
 *   exclude hotel transfers and sell them as an add-on bound to no booking option, so neither includes the hotel
 *   pickup every network trip promises. Mit Rahina and Sakkara would each have had one more trip.
 * - `sharm-el-sheikh-2-day-cairo-pyramids-gem-luxury-stay`, its second option ("Day 1 Pyramids & GEM + Day 2
 *   Memphis, Saqqara & Old Cairo", $408.24/$262.44): the option's name says Memphis, while its own description
 *   says the second day is three sites chosen from Saqqara, the Citadel, the Hanging Church, the Amr Ibn Al-As
 *   Mosque and the Museum of Civilization — a list without Memphis — and that its entrance fees are not included.
 *   The first option of the same record is sold here, as batch B09 sells it.
 * - `from-hurghada-cairo-pyramids-grand-egyptian-museum-citadel-day-trip`: the museum visit is an extra bound to
 *   no booking option, as batch B09 recorded.
 * - `giza-pyramids-sphinx-custom-cairo-sightseeing-tour`, two of its four options: the museum-only option leaves
 *   at 11:00 while the others leave at 08:00 and never reaches the pyramids, and the VIP option adds the Citadel,
 *   lunch and a felucca that the record's own schedule does not show.
 * - `sakkara-memphis-dahshur-giza-pyramids-day-tour` is not sold on the three Giza-plateau sites: that record
 *   makes the Giza pyramids and the Sphinx an optional add-on, and the options sold stop at Dahshur, Sakkara and
 *   Memphis only.
 * - The photo the client publishes on `cairo-private-day-trip-by-car-from-sharm-el-sheikh` shows another
 *   company's coach with its name and web address on the side, so it is not used; that trip carries a photo from
 *   the plateau instead.
 *
 * Photos are the ones each record publishes, already on the network's Cloudinary, with three from batch B08's
 * rehosted Dahab set. Copying them into a network-b10 folder, each site's own photos and the ten logos are open
 * questions: `--apply` now refuses to run without `--logos=<file>` naming every site's approved logo, logoDark
 * and favicon.
 */
import type { NetworkBatch, PriceSpec } from '../seed-network-sites';
import { PROGRAMMES as B03 } from './b03';
import { PROGRAMMES as B03R } from './b03-rest';
import { PROGRAMMES_C as B08C, PROGRAMMES_D as B08D, PHOTO_C as B08_PHOTO } from './b08';
import { PROGRAMMES_A as B09A } from './b09';

const EEO = 'egypt-excursions-online';
const DAY_TRIPS = 'day-trips';

/** Said once, where every option sold prices children separately. */
const CHILD_NOTE = 'Children have their own price, and the booking applies it. The team confirms which ages count as children when it confirms your booking.';
/** Said where some options sold price children separately and others do not. */
const MIXED_CHILD_NOTE = 'Children have their own price on the option that publishes one; on the other they pay the adult price. The team confirms which ages count as children when it confirms your booking.';
/** Options whose child price equals the adult one publish no child price at all, so none is claimed. */
const SAME_PRICE = 'Children pay the same price as adults.';
const PICKUP_CAIRO = 'Hotel pickup and drop-off in Cairo or Giza';

/**
 * The five programmes written here. The other fourteen are imported from the batches that first wrote them.
 */
export const NEW_PROGRAMMES = {
  // The record lists its pickup as "Pickup service from your Hotel by a private A/C. vehicle and return" and its
  // guide as a sentence of its own; both are said once, in the site's words. It names no entrance fee, so no
  // trip here says the plateau ticket is covered.
  FULL_DAY_MUSEUM: {
    provider: 'eeo',
    tenant: EEO,
    source: 'full-day-cairo-giza-pyramids-egyptian-museum',
    category: DAY_TRIPS,
    options: ['giza-pyramids-and-egyptian-museum-b15c5ccaa122'],
    addons: [],
    departures: ['06:05', '07:00', '08:00', '09:00', '10:00', '11:00'],
    rename: {
      'giza-pyramids-and-egyptian-museum-b15c5ccaa122': {
        name: 'Private day at the plateau and the Egyptian Museum',
        description: 'A private air-conditioned car, an Egyptology guide and a bottle of water for the eight hours.',
      },
    },
    omit: {
      inclusions: [
        'Pickup service from your Hotel by a private A/C. vehicle and return.',
        'Professional English speaking Egyptology Tour guide.',
        'All services and charges.',
      ],
    },
    add: {
      inclusions: [PICKUP_CAIRO, 'A private air-conditioned car', 'An English-speaking Egyptology guide'],
      needToKnow: [
        SAME_PRICE,
        'The record names no entrance fee, so buy your own ticket for the plateau and for the museum unless the team confirms otherwise.',
      ],
    },
    // The record publishes no schedule of its own; the day is written from the stops its own text names.
    itinerary: [
      { title: 'Hotel pickup', description: 'A private air-conditioned car collects you from your hotel in Cairo or Giza.' },
      { title: 'The Giza plateau', description: 'A guided walk among the pyramids of Khufu, Khafre and Menkaure, then the Valley Temple and the Great Sphinx beside it.' },
      { title: 'The Egyptian Museum', description: 'The museum on Tahrir Square with the guide, among the finds of ancient Egypt.' },
      { title: 'Back to your hotel', description: 'The car returns you to your hotel in Cairo or Giza.' },
    ],
  },
  // The two options that make the same day from the same eight o'clock start: a shared group and a private one.
  // The record's two other options are held back (see the header).
  CUSTOM_DAY: {
    provider: 'eeo',
    tenant: EEO,
    source: 'giza-pyramids-sphinx-custom-cairo-sightseeing-tour',
    category: DAY_TRIPS,
    options: [
      'pyramids-egyptian-museum-old-cairo-shared-wit-d7d116d74da4',
      'pyramids-egyptian-museum-old-cairo-private-wi-b9e6510bf37e',
    ],
    addons: [],
    departures: ['08:00'],
    departureLabels: { '08:00': 'Morning' },
    rename: {
      'pyramids-egyptian-museum-old-cairo-shared-wit-d7d116d74da4': {
        name: 'Shared day with the tickets',
        description: 'The Giza plateau, the Egyptian Museum and Old Cairo in a shared group, guided in English, with the entry tickets. Lunch is not included.',
      },
      'pyramids-egyptian-museum-old-cairo-private-wi-b9e6510bf37e': {
        name: 'Private day with the tickets',
        description: 'The same three stops with your own guide and vehicle, with the entry tickets. Lunch is not included.',
      },
    },
    childNote: MIXED_CHILD_NOTE,
    omit: {
      inclusions: [
        'Professional licensed guide',
        'Shared Tour: Professional English-speaking guide only',
        'Private Tour: Professional guide available in all languages',
        'Entry tickets to selected landmarks',
        'Hotel pickup and drop-off from Cairo or Giza',
        'Visits: Papyrus Gallery, Oils Factory, Bazaar, Cotton Store, Carpet School (upon request)',
      ],
    },
    add: {
      inclusions: [PICKUP_CAIRO, 'The entry tickets for the stops the day makes'],
      exclusions: ['Lunch'],
      needToKnow: [
        'The shared day is guided in English; the private day can be guided in another language, so say which when you book.',
        'A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
        'The length of the day and the order of its stops change with the traffic and with the sites.',
      ],
    },
    // The record's schedule is its car legs and its pickup areas; the day is written from the stops it names.
    itinerary: [
      { time: '08:00', title: 'Hotel pickup', duration: '30 minutes', description: 'An air-conditioned vehicle collects you from your hotel in Cairo or Giza.' },
      { title: 'The Giza plateau', duration: '2 hours', description: 'A guided walk among the pyramids of Khufu, Khafre and Menkaure and the Great Sphinx.' },
      { title: 'Break', duration: '1 hour', description: 'A break in Cairo. Lunch is not included, so this is the hour to buy your own.' },
      { title: 'The Egyptian Museum of Antiquities', duration: '2 hours', description: 'The museum on Tahrir Square with the guide.' },
      { title: 'Old Cairo', duration: '1 hour', description: 'The churches of Old Cairo, the Hanging Church among them.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  // The guide in Spanish, German or French is an extra bound to no booking option, so the record's conditional
  // line is replaced by the plain English-speaking guide the option carries.
  FROM_SHARM_PRIVATE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-private-day-trip-by-car-from-sharm-el-sheikh',
    category: DAY_TRIPS,
    options: ['from-sharm-el-sheikh-cairo-private-day-trip-b-1c33a0b74d33'],
    addons: [],
    departures: ['01:00'],
    departureLabels: { '01:00': 'Overnight start' },
    rename: {
      'from-sharm-el-sheikh-cairo-private-day-trip-b-1c33a0b74d33': {
        name: 'Private day in Cairo by car',
        description: 'A private air-conditioned car from your hotel in Sharm El Sheikh, an English-speaking guide, lunch and the entrance fees.',
      },
    },
    omit: {
      inclusions: ['English-speaking guide (if you need a Spanish, German, or French-speaking guide please select the relevant add-on during booking)'],
    },
    add: {
      inclusions: ['An English-speaking guide'],
      needToKnow: [
        SAME_PRICE,
        'The car leaves Sharm El Sheikh at one in the morning and the day runs about twenty-two hours: the road to Cairo is long each way.',
        'A guide in Spanish, German or French costs extra and cannot be booked on this site.',
      ],
    },
    itinerary: [
      { time: '01:00', title: 'Hotel pickup', description: 'A private air-conditioned car collects you from your hotel in Sharm El Sheikh.' },
      { title: 'The road to Cairo', description: 'The long drive north across Sinai.' },
      { title: 'The Giza plateau', description: 'The pyramids and the Great Sphinx with the guide, the entrance fees covered.' },
      { title: 'Lunch', description: 'Lunch at a restaurant in Cairo.' },
      { title: 'The Egyptian Museum', description: 'The museum on Tahrir Square with the guide.' },
      { title: 'Khan El-Khalili', description: 'The lanes and the shops of the bazaar.' },
      { title: 'Back to Sharm El Sheikh', description: 'The drive back to your hotel.' },
    ],
  },
  // The record promises its hotel transfers in its own words rather than in its list of what is included, and
  // types its two lunches as "Lunch x 2"; both are said plainly here.
  TWO_DAY_PRIVATE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'secrets-of-cairo-2-day-private-sightseeing-tour',
    category: DAY_TRIPS,
    options: ['secrets-of-cairo-a-2-day-private-magical-adve-b8969b9ddc98'],
    addons: [],
    departures: ['08:00'],
    departureLabels: { '08:00': 'Morning' },
    rename: {
      'secrets-of-cairo-a-2-day-private-magical-adve-b8969b9ddc98': {
        name: 'Two private days in Cairo',
        description: 'Day one at the Giza plateau, Sakkara and Memphis; day two at the Egyptian Museum and the National Museum of Egyptian Civilization.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Lunch x 2', 'Private transportation', 'Air-conditioned vehicle', 'Tour Guide', 'Entry Fees'] },
    add: {
      inclusions: [
        PICKUP_CAIRO,
        'A private air-conditioned vehicle on both days',
        'An English-speaking guide on both days',
        'Lunch on both days',
        'The entry fees for the sites the two days visit',
      ],
      needToKnow: ['The trip runs over two days, and the vehicle collects you from your hotel on each of them.'],
    },
    itinerary: [
      { time: '08:00', title: 'Day one, hotel pickup', duration: '1 hour', description: 'A private air-conditioned vehicle collects you from your hotel in Cairo or Giza.' },
      { title: 'Day one, the Giza plateau', description: 'The pyramids with the guide, then the Valley Temple and the Great Sphinx.' },
      { title: 'Day one, Sakkara', description: 'The Step Pyramid of Djoser.' },
      { title: 'Day one, Memphis', description: 'The ruins of the old capital, its colossal statue of Ramses II and the alabaster sphinx beside it.' },
      { title: 'Day two, the Egyptian Museum', description: 'The museum on Tahrir Square with the guide.' },
      { title: 'Day two, the Museum of Egyptian Civilization', description: 'The national museum and its hall of royal mummies.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel at the end of each day.' },
    ],
  },
} satisfies Record<string, PriceSpec>;

/** Every programme this batch sells: fourteen from the batches that first wrote them, five written above. */
const P = {
  HALF_DAY: B03.GPP_HALF_DAY,
  SUNRISE_SHARED: B03R.PCT_SHARED_SUNRISE,
  SUNRISE_PRIVATE: B03R.PCT_PRIVATE_SUNRISE,
  CAMEL_LUNCH: B03R.PCT_CAMEL_LUNCH,
  FELUCCA: B03.GPP_FELUCCA,
  GEM_PRIVATE: B03.PGE_GEM,
  BAZAAR_PRIVATE: B03.PGE_BAZAAR,
  NMEC: B03.PGE_NMEC,
  MUSEUM_BAZAAR: B08D.EGM_PYRAMIDS,
  SOUTH_SHARED: B03.MAS_SHARED,
  SOUTH_PRIVATE: B03.MAS_PRIVATE,
  GIZA_SOUTH: B03.MAS_WITH_GIZA,
  GIZA_SOUTH_VIP: B03.MAS_NILE_SAIL,
  FROM_SHARM_DAY: B09A.GEM_FROM_SHARM,
  FROM_SHARM_TWO_DAYS: B09A.GEM_TWO_DAYS,
  GEM_VISIT: B09A.GEM_VISIT,
  THREE_POOLS: B08C.CRD_THREE_POOLS,
  ...NEW_PROGRAMMES,
} satisfies Record<string, PriceSpec>;

/** Each record's own photo, as the client publishes it; the Dahab three are batch B08's rehosted copies. */
const PHOTO = {
  plateauAtLowSun: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781847/tours/ira2tyqp7tp0acwe6ztd.jpg',
  camelAtSunrise: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788797185/tours/yoge0wgzwbrw8zhfeels.jpg',
  threePyramids: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787780674/tours/cyqhwwakyack600gfghk.jpg',
  felucca: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781643/tours/ppovupzztby04d2o9wqq.jpg',
  pharaohStatue: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781469/tours/pb4ohpdfkiik9alomm7s.jpg',
  pyramidsOverDunes: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788891906/tours/idsqp9obgnragpxbmjpp.jpg',
  sphinxHead: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787780808/tours/k77qvyvbryzwhgkcmgzu.jpg',
  lampMarket: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787780863/tours/upf8g1fhghiy9jihxqne.jpg',
  stepPyramid: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788797085/tours/m87zl1cmmc4kcv2nrv4o.jpg',
  feluccasAtCairo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788797148/tours/i7hlesmpg9oel1enka8o.jpg',
  museumFacade: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788380892/tours/ltcducpras9ji7yoyhip.jpg',
  goldenMask: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788381754/tours/zdn6p7f5sjbqmsks7jwx.jpg',
  museumHall: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795937/tours/wmork7lo2zbrpokbb4sn.jpg',
  museumPharaohBust: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781420/tours/fitsfzpmfhlemacqtxd4.jpg',
  sphinxAndPyramid: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788796912/tours/mhbnyzl0vhwyxopd4hzk.jpg',
  stepPyramidAtDusk: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781377/tours/wkmxhvoiwvc36jaxfrr6.jpg',
  canyonCamel: B08_PHOTO.canyonCamel,
  canyonWalls: B08_PHOTO.canyonWalls,
  layeredRock: B08_PHOTO.layeredRock,
};

/** Each photo described as it is, not as the trip it illustrates. */
const ALT: Record<keyof typeof PHOTO, string> = {
  plateauAtLowSun: 'The Giza plateau at low sun, with the pyramids of Khafre and Menkaure above the temple ruins and the Sphinx between them',
  camelAtSunrise: 'A saddled camel standing between two pyramids, with the sun low in a yellow sky behind it',
  threePyramids: 'The three Giza pyramids under a blue sky with white cloud, the smaller queens’ pyramids and loose blocks in front and rippled sand in the foreground',
  felucca: 'A felucca under a tall white sail carrying passengers on the river, with more feluccas and a moored river boat along the far bank',
  pharaohStatue: 'A dark granite statue of a pharaoh in a striped headcloth with a cobra at the brow, standing beside a pale stone wall with a modern building and palms behind',
  pyramidsOverDunes: 'Three pyramids on the horizon at sunset, seen across rippled sand dunes under a pink and orange sky',
  sphinxHead: 'The head and shoulders of the Great Sphinx in close-up against a blue sky with thin cloud',
  lampMarket: 'A busy market street of stalls hung with brass lamps and metalware, with shoppers walking between the shops',
  stepPyramid: 'The stepped pyramid at Sakkara rising behind the restored stone walls and doorways of its funerary enclosure, across open sand',
  feluccasAtCairo: 'Two feluccas under white sails on the river, with the Cairo waterfront, a tall latticed tower and palms behind',
  museumFacade: 'A pink stone museum front with an arched entrance, palm trees and a small sphinx in the garden before it',
  goldenMask: 'A gold funerary mask inlaid with blue stripes, lit in a dark display case',
  museumHall: 'A long museum hall of arched stone galleries on two floors, with statues and display cases down the middle',
  museumPharaohBust: 'The head and shoulders of a dark stone pharaoh in a striped nemes headcloth with a false beard, lit against the dark wall of a museum hall',
  sphinxAndPyramid: 'The Great Sphinx seen from the side in warm light, worn at the face and shoulders, with a pyramid rising behind it under a pale sky',
  stepPyramidAtDusk: 'The stepped pyramid of Djoser rising in six tiers of worn stone above flat open sand, under a hazy sky at the end of the day',
  canyonCamel: 'A rider on a camel in a narrow canyon of smooth red sandstone, with sunlight falling through the gap above',
  canyonWalls: 'Weathered red rock walls above a sandy canyon floor, with a green shrub in the shade and blue sky over the ridge',
  layeredRock: 'A close view of layered red sandstone, worn by the wind into shelves and hollows',
};

const CAIRO = { lat: 30.0444, lng: 31.2357 };
const SHARM = { lat: 27.7369, lng: 34.3394 };

/** A trip on a Cairo site that starts in Sharm El Sheikh instead. */
const FROM_SHARM = { city: 'Sharm El Sheikh', area: 'Sharm El Sheikh', coordinates: SHARM };

/**
 * Places the Giza sites never name. Their days stay in Cairo and Giza, carry on to Sakkara, Memphis and Dahshur,
 * or start in Sharm El Sheikh, so those names are theirs to use; the rest of Egypt is not.
 */
const NOT_GIZA_WIDE = /Hurghada|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum/i;
/** The two single-pyramid sites sell only days that stay on the plateau and in Cairo. */
const NOT_ONE_PYRAMID = /Hurghada|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur/i;
/** The sites south of Giza: their days run between Cairo, Giza, Sakkara, Memphis and Dahshur. */
const NOT_SOUTH_OF_GIZA = /Hurghada|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum/i;
/** The Three Pools day stays between Sharm El Sheikh and Dahab. */
const NOT_THREE_POOLS = /Hurghada|Cairo|Giza|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Saqqara|Sakkara|Memphis|Dahshur|Tiran|Ras Mohamed|Nabq|Catherine/i;


/** B10A: the three Giza plateau sites. */
export const B10A: NetworkBatch = {
  id: 'b10a',
  sites: [
    {
      slug: 'great-sphinx-of-giza',
      name: 'Great Sphinx of Giza',
      listingPath: '/trips',
      domain: 'greatsphinxofgiza.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'gsg-',
      foreignPlaces: NOT_GIZA_WIDE,
      tagline: 'Guided days that stand before the Great Sphinx',
      description: 'Great Sphinx of Giza sells the days that bring you to the Sphinx itself: the lion-bodied figure cut from the bedrock below the pyramids, with the Valley Temple of Khafre beside it. Some are half days that stay on the plateau, some are full days that carry on into the museums of Cairo and the Khan el-Khalili bazaar, and some come by road from Sharm El Sheikh.\n\nEvery trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Great Sphinx of Giza Tours with Hotel Pickup',
        metaDescription: 'Guided days at the Great Sphinx and the Giza pyramids, from half days on the plateau to full days in Cairo, with hotel pickup.',
        keywords: ['great sphinx of giza tour', 'sphinx and pyramids day trip', 'giza sphinx guided tour', 'valley temple and sphinx tour', 'cairo sphinx tour with pickup'],
      },
      theme: { primaryColor: '#1F2347', secondaryColor: '#F3EFE6', accentColor: '#D9643A' },
      heroImages: [PHOTO.sphinxHead, PHOTO.plateauAtLowSun, PHOTO.sphinxAndPyramid],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/great-sphinx-of-giza/monogram.png',
      trips: [
        {
          path: 'private-half-day-pyramids-and-sphinx',
          price: P.HALF_DAY,
          title: 'Private Half Day at the Pyramids and the Great Sphinx',
          short: 'Four hours on the Giza plateau with a private guide and car: the three pyramids, the Valley Temple and the Great Sphinx, with the entry fees.',
          description: 'The Great Sphinx closes this half day, reached on foot from the pyramids with the Valley Temple of Khafre on the way. The car collects you from your hotel in Cairo or Giza at eight or at nine and drives straight to the plateau, where a private guide walks you through the pyramids of Khufu, Khafre and Menkaure and on to the Valley Temple of Khafre and the Great Sphinx beside it.\n\nThe guide, the private vehicle, the entry fees and a bottle of water are in the price, and the car is yours alone. The day is four hours, and children have their own price.',
          highlights: [
            'The Valley Temple and the Great Sphinx',
            'Khufu, Khafre and Menkaure with a guide',
            'A private car and guide for your group',
            'Entry fees and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Private Half-Day Giza Pyramids Tour',
            metaDescription: 'Four hours on the Giza plateau with a private guide and car, the Valley Temple, the entry fees and hotel pickup in Cairo or Giza.',
          },
          images: [PHOTO.plateauAtLowSun],
          imageAlts: [ALT.plateauAtLowSun],
        },
        {
          path: 'sunrise-camel-ride-and-breakfast',
          price: P.SUNRISE_SHARED,
          title: 'Sunrise or Morning at the Pyramids with a Camel Ride and Breakfast',
          short: 'A shared five-hour trip: an hour on a camel or a horse beside the plateau, an Egyptian breakfast and two guided hours among the pyramids.',
          description: 'The Sphinx is the last stop of the guided walk, after the camel ride and breakfast. There are two starts, half past four for the hour when the sun comes up behind the plateau and eight o’clock for a later morning. An hour on a camel or a horse opens the day, a traditional Egyptian breakfast follows, and a guide then takes you through the pyramids complex and the Sphinx for two hours.\n\nThe entry ticket for the Giza pyramids complex is in the price, with the air-conditioned transport and the pickup from your hotel. The vehicle and the guide are shared with other guests, and children pay the same price as adults.',
          highlights: [
            'The pyramids complex and the Sphinx with a guide',
            'An hour on a camel or a horse',
            'A traditional Egyptian breakfast',
            'Two guided hours among the pyramids',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Giza Pyramids Sunrise Tour with Camel Ride',
            metaDescription: 'A shared five-hour trip with a sunrise or morning start, an hour on a camel or horse, breakfast, a guided walk and hotel pickup.',
          },
          images: [PHOTO.camelAtSunrise],
          imageAlts: [ALT.camelAtSunrise],
        },
        {
          path: 'private-sunrise-camel-ride-and-breakfast',
          price: P.SUNRISE_PRIVATE,
          title: 'Private Sunrise or Morning Ride with Breakfast at the Pyramids',
          short: 'The same hour in the saddle, breakfast and guided walk, with the vehicle and the guide for your group alone, and a third start in the afternoon.',
          description: 'The Sphinx comes at the end of the private walk, when the group before you has gone. This is the private way to take the ride: half past four for the sunrise, eight o’clock for the morning or one in the afternoon. The hour on a camel or a horse runs on the sand beside the plateau, breakfast follows, and your own guide walks you through the pyramids complex and the Sphinx.\n\nThe entry ticket for the Giza pyramids complex is in the price, as are the private air-conditioned vehicle and the pickup from your hotel in Cairo or Giza. Children have their own price.',
          highlights: [
            'The Sphinx walked with your own guide',
            'Your own vehicle and guide',
            'Three starts, from before dawn to the afternoon',
            'The pyramids entry ticket included',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Private Giza Sunrise Camel Ride and Breakfast',
            metaDescription: 'A private hour on a camel or horse beside the plateau, breakfast and a guided walk of the pyramids, with the entry ticket and hotel pickup.',
          },
          images: [PHOTO.threePyramids],
          imageAlts: [ALT.threePyramids],
        },
        {
          path: 'private-day-with-a-camel-ride-and-lunch',
          price: P.CAMEL_LUNCH,
          title: 'Private Pyramids Day with a Camel Ride and Lunch',
          short: 'Four hours with a private guide and car: the Giza plateau, a camel ride around it, lunch at a local restaurant and the entrance fees.',
          description: 'The Sphinx is walked with your own guide, before the camel ride goes round the plateau. You pick the start from a quarter-hourly list that runs from eight in the morning to a quarter to one. Your own English-speaking guide walks the plateau with you, a camel ride goes round it, and lunch is taken at a local restaurant.\n\nThe entrance fees for the Giza pyramids complex are in the price, as is the pickup from your hotel in Cairo or Giza. Children have their own price. Pickup from outside the city centre costs extra and cannot be booked here.',
          highlights: [
            'The Sphinx on the plateau with your own guide',
            'Your own guide and vehicle',
            'A camel ride around the plateau',
            'Lunch at a local restaurant',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Private Giza Pyramids Tour with Camel Ride and Lunch',
            metaDescription: 'A four-hour private day with your own guide and car, a camel ride around the plateau, lunch and the entrance fees, from Cairo or Giza.',
          },
          images: [PHOTO.threePyramids],
          imageAlts: [ALT.threePyramids],
        },
        {
          path: 'pyramids-and-an-hour-on-the-nile',
          price: P.FELUCCA,
          title: 'Giza Pyramids and an Hour Under Sail on the Nile',
          short: 'Five hours with a private vehicle: three hours on the plateau with the Great Pyramid, Khafre, Menkaure and the Sphinx, then an hour on a felucca.',
          description: 'Half an hour of this day belongs to the Sphinx alone, after the three pyramids. The car collects you from your hotel in Cairo or Giza for a start at eight, nine, ten or eleven o’clock. Three hours on the plateau follow, with half an hour each at the Great Pyramid, the pyramid of Khafre, the pyramid of Menkaure and the Sphinx, before the day finishes with an hour on the Nile aboard a felucca.\n\nPrivate air-conditioned transfers, the guide on site, the entry fees and bottled water are in the price. The day is five hours, and children have their own price.',
          highlights: [
            'Half an hour at the Great Sphinx',
            'Half an hour each at the three pyramids',
            'An hour on the Nile under sail',
            'Entry fees and private transfers included',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Giza Pyramids Tour with a Nile Felucca Sail',
            metaDescription: 'Five hours from Cairo or Giza: the three pyramids and the Sphinx with a guide, then an hour on the Nile on a felucca, entry fees included.',
          },
          images: [PHOTO.felucca],
          imageAlts: [ALT.felucca],
        },
        {
          path: 'pyramids-sphinx-and-the-grand-egyptian-museum',
          price: P.GEM_PRIVATE,
          title: 'The Pyramids, the Sphinx and the Grand Egyptian Museum',
          short: 'A private day from your hotel: three hours on the plateau, an hour at the Sphinx and three hours in the Grand Egyptian Museum, tickets included.',
          description: 'A full hour goes to the Great Sphinx on this day, with its own entry ticket in the price. Your own guide and car take the day at your pace, starting at nine. Three hours go to the pyramids of Giza and an hour to the Great Sphinx, with a break between them, and the rest of the day is three hours in the Grand Egyptian Museum with time of your own among the galleries.\n\nThe entry tickets for the pyramids, the Sphinx and the museum are in the price. Lunch is not, so the break in the middle of the day is the hour to buy your own. Children have their own price.',
          highlights: [
            'An hour at the Great Sphinx',
            'Three hours at the pyramids, an hour at the Sphinx',
            'Three hours in the Grand Egyptian Museum',
            'Entry tickets for all three included',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Giza Pyramids and Grand Egyptian Museum Private Day',
            metaDescription: 'A private day at the Giza pyramids and the Sphinx with three hours in the Grand Egyptian Museum, entry tickets and hotel pickup.',
          },
          images: [PHOTO.pharaohStatue],
          imageAlts: [ALT.pharaohStatue],
        },
        {
          path: 'pyramids-egyptian-museum-and-khan-el-khalili',
          price: P.BAZAAR_PRIVATE,
          title: 'The Pyramids, the Egyptian Museum and Khan el-Khalili',
          short: 'Eight hours with a private guide and car: the Giza plateau, the Egyptian Museum of Antiquities, the Khan el-Khalili bazaar and lunch.',
          description: 'The Sphinx is walked with the guide at the start of a long private day that carries on into the city. The day runs eight hours from an eight o’clock pickup at your hotel in Cairo or Giza, with about an hour in the car at each end. It takes in the pyramids of Giza with a guide, the Egyptian Museum of Antiquities and the lanes of the Khan el-Khalili bazaar.\n\nThe entry fees, the guide on site, lunch, a private air-conditioned vehicle and a bottle of water are in the price. Children have their own price.',
          highlights: [
            'The Giza pyramids and the Sphinx with a guide',
            'The Egyptian Museum of Antiquities',
            'The lanes of Khan el-Khalili',
            'Entry fees, lunch and private transfers',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Private Giza Pyramids, Museum and Bazaar Day',
            metaDescription: 'An eight-hour private day from Cairo or Giza taking in the pyramids, the Egyptian Museum of Antiquities and Khan el-Khalili, with lunch.',
          },
          images: [PHOTO.pyramidsOverDunes],
          imageAlts: [ALT.pyramidsOverDunes],
        },
        {
          path: 'pyramids-civilization-museum-and-old-cairo',
          price: P.NMEC,
          title: 'The Pyramids, the Civilization Museum and Old Cairo',
          short: 'A private day with the National Museum of Egyptian Civilization, the Giza plateau and Old Cairo, or a longer one with the Citadel and a Nile sail.',
          description: 'The Sphinx stands at the end of the plateau the day crosses, between the museum and the churches of Old Cairo. The trip comes as two private days, both leaving at eight. The shorter gives two hours to the National Museum of Egyptian Civilization, then the Giza plateau and the churches of Old Cairo, with the entry tickets included and lunch left out; the longer adds the Citadel and finishes with a sail on the Nile.\n\nBoth are private, with an English-speaking guide and an air-conditioned vehicle, collected from your hotel in Cairo or Giza. Lunch is in the price of the longer day only. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request.',
          highlights: [
            'The plateau and the Sphinx with a private guide',
            'The Museum of Egyptian Civilization',
            'The churches of Old Cairo',
            'A longer day with the Citadel and a Nile sail',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Pyramids, Civilization Museum and Old Cairo Day',
            metaDescription: 'A private day at the Giza pyramids, the National Museum of Egyptian Civilization and Old Cairo, or a longer one with the Citadel and a sail.',
          },
          images: [PHOTO.sphinxHead],
          imageAlts: [ALT.sphinxHead],
        },
        {
          path: 'private-day-pyramids-museum-and-bazaar',
          price: P.MUSEUM_BAZAAR,
          title: 'Private Day: the Pyramids, the Egyptian Museum and the Bazaar',
          short: 'Five hours with an Egyptologist guide: the Giza pyramids and the Sphinx, the Egyptian Museum, lunch and the lanes of Khan El-Khalili.',
          description: 'The Sphinx below the pyramids opens this private day before it turns towards the museum. A private vehicle collects you from your hotel in Cairo or Giza at eight or at nine. The pyramids on the plateau and the Sphinx below them come first with the guide, then a guided walk through the halls of the museum on Tahrir Square, lunch at a local restaurant and the shops of the historic bazaar.\n\nThe entry tickets, the private tour with an Egyptologist guide, lunch and bottled water are in the price. This day visits the museum on Tahrir Square, not the Grand Egyptian Museum. Children pay the same price as adults.',
          highlights: [
            'The pyramids and the Sphinx below them',
            'An Egyptologist guide for your group',
            'The Egyptian Museum on Tahrir Square',
            'Lunch and the Khan El-Khalili bazaar',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Private Pyramids, Egyptian Museum and Bazaar Day',
            metaDescription: 'A private day with an Egyptologist guide: the Giza pyramids and the Sphinx, the Egyptian Museum, lunch and Khan El-Khalili, with hotel pickup.',
          },
          images: [PHOTO.lampMarket],
          imageAlts: [ALT.lampMarket],
        },
        {
          path: 'full-day-pyramids-and-the-egyptian-museum',
          price: P.FULL_DAY_MUSEUM,
          title: 'Full Day at the Giza Plateau and the Egyptian Museum',
          short: 'Eight hours with a private car and an Egyptology guide: the pyramids of Khufu, Khafre and Menkaure, the Valley Temple, the Sphinx and the Egyptian Museum.',
          description: 'The Great Sphinx and the Valley Temple beside it are named in the record of this eight-hour day. Six starts are published, from five past six in the morning to eleven. A private air-conditioned car collects you from your hotel in Cairo or Giza, and an Egyptology guide walks you among the pyramids of Khufu, Khafre and Menkaure, on to the Valley Temple and the Great Sphinx, and then through the museum on Tahrir Square.\n\nThe private car, the guide and a bottle of water are in the price. The record names no entrance fee, so bring the price of your own tickets unless the team confirms otherwise, and children pay the same price as adults.',
          highlights: [
            'The Valley Temple and the Great Sphinx',
            'Khufu, Khafre and Menkaure with a guide',
            'The Valley Temple and the Great Sphinx',
            'The Egyptian Museum on Tahrir Square',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Full-Day Giza Pyramids and Egyptian Museum Tour',
            metaDescription: 'Eight hours with a private car and an Egyptology guide: the three Giza pyramids, the Valley Temple, the Sphinx and the Egyptian Museum.',
          },
          images: [PHOTO.museumPharaohBust],
          imageAlts: [ALT.museumPharaohBust],
        },
        {
          path: 'pyramids-egyptian-museum-and-old-cairo',
          price: P.CUSTOM_DAY,
          title: 'The Pyramids, the Egyptian Museum and Old Cairo',
          short: 'An eight o’clock start for three stops with the tickets: two hours on the plateau, two in the Egyptian Museum and an hour among the churches of Old Cairo.',
          description: 'The Sphinx is part of the two hours this day spends on the plateau. The day comes two ways from the same eight o’clock pickup, in a shared group or with your own guide and vehicle. Two hours go to the plateau and the Great Sphinx, an hour to a break in Cairo, two more to the Egyptian Museum of Antiquities and the last to the churches of Old Cairo, the Hanging Church among them.\n\nThe entry tickets for the stops the day makes are in the price, with the air-conditioned transport and the pickup from your hotel. Lunch is not included. The shared day is guided in English; the private day can be guided in another language, so say which when you book.',
          highlights: [
            'Two hours on the plateau with the Sphinx',
            'Two hours on the plateau with the Sphinx',
            'The Egyptian Museum and Old Cairo',
            'Shared, or private with your own guide',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Giza Pyramids, Egyptian Museum and Old Cairo Day',
            metaDescription: 'A day from Cairo or Giza with the plateau and the Sphinx, the Egyptian Museum of Antiquities and the churches of Old Cairo, tickets included.',
          },
          images: [PHOTO.sphinxAndPyramid],
          imageAlts: [ALT.sphinxAndPyramid],
        },
        {
          path: 'cairo-day-trip-from-sharm-el-sheikh',
          price: P.FROM_SHARM_DAY,
          title: 'Cairo Day Trip from Sharm El Sheikh: the Pyramids and the Museum',
          short: 'A long day by coach from Sharm El Sheikh: the Giza pyramids, the Sphinx and the Grand Egyptian Museum with an Egyptologist guide and lunch.',
          description: 'The Great Sphinx is in the price of this coach day, with the pyramids and the museum. The coach collects you from your hotel in Sharm El Sheikh just after midnight for the long drive north, arriving on the Giza plateau in the morning for the pyramids and the Great Sphinx with an Egyptologist guide. Lunch is at a restaurant looking out at the pyramids, and the Grand Egyptian Museum follows before the drive back.\n\nThe entrance fees for the pyramids, the Sphinx and the museum, lunch and the coach are in the price; drinks, a Nile boat, a camel ride and the burial chambers are not. Bring your passport. Children have their own price.',
          highlights: [
            'The Giza pyramids and the Great Sphinx',
            'An Egyptologist guide for the day',
            'Lunch looking out at the pyramids',
            'The Grand Egyptian Museum',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Pyramids Day Trip from Sharm El Sheikh',
            metaDescription: 'From Sharm El Sheikh by coach: the Giza pyramids, the Sphinx and the Grand Egyptian Museum with a guide, lunch and the entrance fees.',
          },
          images: [PHOTO.museumFacade],
          imageAlts: [ALT.museumFacade],
          where: FROM_SHARM,
        },
        {
          path: 'two-days-in-cairo-from-sharm-el-sheikh',
          price: P.FROM_SHARM_TWO_DAYS,
          title: 'Two Days in Cairo from Sharm El Sheikh with a Night in Giza',
          short: 'Two days from Sharm El Sheikh: the Giza pyramids, the Sphinx and the Grand Egyptian Museum, a night by the pyramids and free time in Cairo.',
          description: 'The Great Sphinx belongs to the first of the two days, with its entrance fee covered. The transfer collects you from your hotel in the night, and day one is the Giza pyramids, the Great Sphinx and the Grand Egyptian Museum with an Egyptologist guide, the entrance fees covered. The night is in an apartment with a view of the pyramids, and day two is free time in Cairo before the drive back.\n\nBreakfast and lunch are in the price with the transfers, the guide and the entrance fees. Extra visits for the second day cannot be booked on this site. Tips and personal spending are not included, and children have their own price.',
          highlights: [
            'The pyramids, the Sphinx and the museum',
            'Two days in Cairo and Giza',
            'A night with a view of the pyramids',
            'Breakfast and lunch included',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Two-Day Cairo Trip from Sharm El Sheikh',
            metaDescription: 'Two days from Sharm El Sheikh: the pyramids, the Sphinx and the Grand Egyptian Museum with a guide, a night by the pyramids and free time.',
          },
          images: [PHOTO.goldenMask],
          imageAlts: [ALT.goldenMask],
          where: FROM_SHARM,
        },
        {
          path: 'private-cairo-day-by-car-from-sharm-el-sheikh',
          price: P.FROM_SHARM_PRIVATE,
          title: 'Private Cairo Day by Car from Sharm El Sheikh',
          short: 'A twenty-two hour private day: a car from your hotel in Sharm El Sheikh, the Giza plateau, the Egyptian Museum, Khan El-Khalili and lunch.',
          description: 'The Sphinx is where this private day begins once the car reaches Giza. A private air-conditioned car collects you at one in the morning for the long drive north across Sinai. The day on the ground is the pyramids and the Great Sphinx with your guide, lunch at a restaurant in Cairo, the Egyptian Museum on Tahrir Square and the lanes of the Khan El-Khalili bazaar before the drive back.\n\nThe private car, the licensed driver, an English-speaking guide, lunch and all the entrance fees are in the price. The day runs about twenty-two hours. A guide in Spanish, German or French costs extra and cannot be booked here, and children pay the same price as adults.',
          highlights: [
            'The Giza plateau and the Great Sphinx',
            'A private car and driver for your group',
            'All the entrance fees and lunch included',
            'The Egyptian Museum and Khan El-Khalili',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Private Cairo Day Trip by Car from Sharm',
            metaDescription: 'A private twenty-two hour day from Sharm El Sheikh by car: the Giza plateau, the Egyptian Museum, Khan El-Khalili, lunch and the entrance fees.',
          },
          images: [PHOTO.sphinxAndPyramid],
          imageAlts: [ALT.sphinxAndPyramid],
          where: FROM_SHARM,
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: the Plateau, Sakkara, Memphis and the Museums',
          short: 'Two private days from your hotel: the Giza plateau, Sakkara and Memphis on the first, the Egyptian Museum and the Museum of Egyptian Civilization on the second.',
          description: 'The Great Sphinx and the Valley Temple open the first of the two days. Both days start at eight with a private air-conditioned vehicle at your hotel. Day one runs from the Giza plateau and its Valley Temple and Great Sphinx to the Step Pyramid of Djoser at Sakkara and on to Memphis, for the ruins of the old capital, its colossal statue of Ramses II and the alabaster sphinx. Day two is the Egyptian Museum on Tahrir Square and the national museum’s hall of royal mummies.\n\nThe private vehicle and guide on both days, lunch on both days, the entry fees for the sites the two days visit and bottled water are in the price. Children have their own price.',
          highlights: [
            'The Valley Temple and the Great Sphinx',
            'Two full days with your own guide',
            'Sakkara, Memphis and the Giza plateau',
            'Lunch and the entry fees on both days',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Two-Day Private Cairo, Sakkara and Memphis Tour',
            metaDescription: 'Two private days from Cairo or Giza: the plateau, Sakkara and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'The Giza Pyramids, Sakkara and Memphis in One Day',
          short: 'Two hours on the Giza plateau, an hour at Sakkara and an hour at Memphis, shared or private, with the entry tickets included.',
          description: 'The Sphinx is walked in the first two hours, before the day runs south. An eight o’clock start, half an hour in the car, then two hours on the Giza plateau with a guide. Sakkara follows for an hour, with the Step Pyramid of Djoser, and Memphis for an hour among the ruins of the old capital and its colossal statue of Ramses II.\n\nThe day comes three ways: a shared group in English, a private tour in English, and a private tour in Italian or Spanish. All three carry the entry tickets for the sites, and lunch is not included. The two private ways have their own child price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'Two hours on the plateau with the Sphinx',
            'The Step Pyramid of Djoser at Sakkara',
            'An hour among the ruins of Memphis',
            'Shared, or private in English, Italian or Spanish',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Giza Pyramids, Sakkara and Memphis Day Tour',
            metaDescription: 'A day from Cairo or Giza with two hours on the Giza plateau, the Step Pyramid at Sakkara and the ruins of Memphis, shared or private.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'Private Day: the Pyramids, Memphis, Sakkara and Dahshur with a Nile Sail',
          short: 'A private day with lunch that takes in the Giza pyramids, Memphis, Sakkara and Dahshur and finishes with a felucca sail on the Nile.',
          description: 'The Sphinx opens the longest day sold here, before Memphis, Sakkara and Dahshur. The longest day on offer here, private from start to finish and leaving at eight. It takes in the Giza pyramids and the Sphinx, the ruins of Memphis with its colossal statue of Ramses II, the Step Pyramid of Djoser at Sakkara and the Bent and Red Pyramids at Dahshur, with an English-speaking guide throughout.\n\nLunch is included on this option, and the day ends with a sail on the Nile aboard a felucca. The entry tickets for the sites are in the price, as is the pickup and drop-off at your hotel in Cairo or Giza. Children have their own price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'The Giza pyramids and the Sphinx',
            'Giza, Memphis, Sakkara and Dahshur in one day',
            'Lunch included',
            'A felucca sail on the Nile to finish',
          ],
          seo: {
            metaTitle: 'Great Sphinx: Private Pyramids, Memphis, Sakkara and Dahshur Day',
            metaDescription: 'A private day from Cairo or Giza taking in the Giza pyramids, Memphis, Sakkara and Dahshur, with lunch and a felucca sail to finish.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
      ],
    },
    {
      slug: 'pyramid-complex-giza',
      name: 'Pyramid Complex Giza',
      listingPath: '/trips',
      domain: 'pyramidcomplexgiza.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'pcg-',
      foreignPlaces: NOT_GIZA_WIDE,
      tagline: 'Guided days across the whole Giza complex',
      description: 'Pyramid Complex Giza sells the days that take the plateau as a whole: the three pyramids and the queens’ pyramids beside them, the causeway, the Valley Temple of Khafre and the Great Sphinx. Half days stay inside the complex; longer days add the Egyptian Museum, the Grand Egyptian Museum, Old Cairo or the bazaar, and a few run south to Sakkara, Memphis and Dahshur.\n\nEvery trip collects you from your hotel and brings you back, and each page says which stops its own option makes. Hold a place online and pay later, or ask the team first.',
      seo: {
        metaTitle: 'Giza Pyramid Complex Tours from Cairo and Giza',
        metaDescription: 'Guided days across the Giza pyramid complex: the three pyramids, the Valley Temple and the Sphinx, with museums, bazaar or Sakkara.',
        keywords: ['giza pyramid complex tour', 'pyramids of giza day trip', 'valley temple giza tour', 'giza plateau guided tour', 'pyramids complex entry tour'],
      },
      theme: { primaryColor: '#4B2E4F', secondaryColor: '#F4EFE7', accentColor: '#C49A55' },
      heroImages: [PHOTO.plateauAtLowSun, PHOTO.threePyramids, PHOTO.pyramidsOverDunes],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/pyramid-complex-giza/monogram.png',
      trips: [
        {
          path: 'private-half-day-pyramids-and-sphinx',
          price: P.HALF_DAY,
          title: 'Private Half Day at the Pyramids and the Great Sphinx',
          short: 'Four hours on the Giza plateau with a private guide and car: the three pyramids, the Valley Temple and the Great Sphinx, with the entry fees.',
          description: 'This half day stays inside the complex: the three pyramids, the Valley Temple of Khafre and the Sphinx, walked in one go. The car collects you from your hotel in Cairo or Giza at eight or at nine and drives straight to the plateau, where a private guide walks you through the pyramids of Khufu, Khafre and Menkaure and on to the Valley Temple of Khafre and the Great Sphinx beside it.\n\nThe guide, the private vehicle, the entry fees and a bottle of water are in the price, and the car is yours alone. The day is four hours, and children have their own price.',
          highlights: [
            'The three pyramids, the Valley Temple and the Sphinx',
            'Khufu, Khafre and Menkaure with a guide',
            'A private car and guide for your group',
            'Entry fees and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Giza Complex: Private Half-Day Giza Pyramids Tour',
            metaDescription: 'The Giza pyramid complex: four hours on the Giza plateau with a private guide and car, the Valley Temple, the entry fees and hotel pickup in Cairo or Giza.',
          },
          images: [PHOTO.plateauAtLowSun],
          imageAlts: [ALT.plateauAtLowSun],
        },
        {
          path: 'sunrise-camel-ride-and-breakfast',
          price: P.SUNRISE_SHARED,
          title: 'Sunrise or Morning at the Pyramids with a Camel Ride and Breakfast',
          short: 'A shared five-hour trip: an hour on a camel or a horse beside the plateau, an Egyptian breakfast and two guided hours among the pyramids.',
          description: 'The entry ticket for the Giza pyramids complex is in this price, which is what the two guided hours buy. There are two starts, half past four for the hour when the sun comes up behind the plateau and eight o’clock for a later morning. An hour on a camel or a horse opens the day, a traditional Egyptian breakfast follows, and a guide then takes you through the pyramids complex and the Sphinx for two hours.\n\nThe entry ticket for the Giza pyramids complex is in the price, with the air-conditioned transport and the pickup from your hotel. The vehicle and the guide are shared with other guests, and children pay the same price as adults.',
          highlights: [
            'The entry ticket for the pyramids complex',
            'An hour on a camel or a horse',
            'A traditional Egyptian breakfast',
            'Two guided hours among the pyramids',
          ],
          seo: {
            metaTitle: 'Giza Complex: Giza Pyramids Sunrise Tour with Camel Ride',
            metaDescription: 'The Giza pyramid complex: a shared five-hour trip with a sunrise or morning start, an hour on a camel or horse, breakfast, a guided walk and hotel pickup.',
          },
          images: [PHOTO.camelAtSunrise],
          imageAlts: [ALT.camelAtSunrise],
        },
        {
          path: 'private-sunrise-camel-ride-and-breakfast',
          price: P.SUNRISE_PRIVATE,
          title: 'Private Sunrise or Morning Ride with Breakfast at the Pyramids',
          short: 'The same hour in the saddle, breakfast and guided walk, with the vehicle and the guide for your group alone, and a third start in the afternoon.',
          description: 'The complex is walked privately after the ride, with its entry ticket in the price. This is the private way to take the ride: half past four for the sunrise, eight o’clock for the morning or one in the afternoon. The hour on a camel or a horse runs on the sand beside the plateau, breakfast follows, and your own guide walks you through the pyramids complex and the Sphinx.\n\nThe entry ticket for the Giza pyramids complex is in the price, as are the private air-conditioned vehicle and the pickup from your hotel in Cairo or Giza. Children have their own price.',
          highlights: [
            'The pyramids complex with your own guide',
            'Your own vehicle and guide',
            'Three starts, from before dawn to the afternoon',
            'The pyramids entry ticket included',
          ],
          seo: {
            metaTitle: 'Giza Complex: Private Giza Sunrise Camel Ride and Breakfast',
            metaDescription: 'The Giza pyramid complex: a private hour on a camel or horse beside the plateau, breakfast and a guided walk of the pyramids, with the entry ticket and hotel pickup.',
          },
          images: [PHOTO.threePyramids],
          imageAlts: [ALT.threePyramids],
        },
        {
          path: 'private-day-with-a-camel-ride-and-lunch',
          price: P.CAMEL_LUNCH,
          title: 'Private Pyramids Day with a Camel Ride and Lunch',
          short: 'Four hours with a private guide and car: the Giza plateau, a camel ride around it, lunch at a local restaurant and the entrance fees.',
          description: 'The camel ride goes round the outside of the complex and the guided walk goes through it. You pick the start from a quarter-hourly list that runs from eight in the morning to a quarter to one. Your own English-speaking guide walks the plateau with you, a camel ride goes round it, and lunch is taken at a local restaurant.\n\nThe entrance fees for the Giza pyramids complex are in the price, as is the pickup from your hotel in Cairo or Giza. Children have their own price. Pickup from outside the city centre costs extra and cannot be booked here.',
          highlights: [
            'The entrance fees for the pyramids complex',
            'Your own guide and vehicle',
            'A camel ride around the plateau',
            'Lunch at a local restaurant',
          ],
          seo: {
            metaTitle: 'Giza Complex: Private Giza Pyramids Tour with Camel Ride and Lunch',
            metaDescription: 'The Giza pyramid complex: a four-hour private day with your own guide and car, a camel ride around the plateau, lunch and the entrance fees, from Cairo or Giza.',
          },
          images: [PHOTO.threePyramids],
          imageAlts: [ALT.threePyramids],
        },
        {
          path: 'pyramids-and-an-hour-on-the-nile',
          price: P.FELUCCA,
          title: 'Giza Pyramids and an Hour Under Sail on the Nile',
          short: 'Five hours with a private vehicle: three hours on the plateau with the Great Pyramid, Khafre, Menkaure and the Sphinx, then an hour on a felucca.',
          description: 'The plan is the complex pyramid by pyramid: half an hour each at Khufu, Khafre, Menkaure and the Sphinx. The car collects you from your hotel in Cairo or Giza for a start at eight, nine, ten or eleven o’clock. Three hours on the plateau follow, with half an hour each at the Great Pyramid, the pyramid of Khafre, the pyramid of Menkaure and the Sphinx, before the day finishes with an hour on the Nile aboard a felucca.\n\nPrivate air-conditioned transfers, the guide on site, the entry fees and bottled water are in the price. The day is five hours, and children have their own price.',
          highlights: [
            'Khufu, Khafre, Menkaure and the Sphinx in turn',
            'Half an hour each at the three pyramids',
            'An hour on the Nile under sail',
            'Entry fees and private transfers included',
          ],
          seo: {
            metaTitle: 'Giza Complex: Giza Pyramids Tour with a Nile Felucca Sail',
            metaDescription: 'The Giza pyramid complex: five hours from Cairo or Giza: the three pyramids and the Sphinx with a guide, then an hour on the Nile on a felucca, entry fees included.',
          },
          images: [PHOTO.felucca],
          imageAlts: [ALT.felucca],
        },
        {
          path: 'pyramids-sphinx-and-the-grand-egyptian-museum',
          price: P.GEM_PRIVATE,
          title: 'The Pyramids, the Sphinx and the Grand Egyptian Museum',
          short: 'A private day from your hotel: three hours on the plateau, an hour at the Sphinx and three hours in the Grand Egyptian Museum, tickets included.',
          description: 'Four of the day’s hours belong to the complex, three among the pyramids and one at the Sphinx. Your own guide and car take the day at your pace, starting at nine. Three hours go to the pyramids of Giza and an hour to the Great Sphinx, with a break between them, and the rest of the day is three hours in the Grand Egyptian Museum with time of your own among the galleries.\n\nThe entry tickets for the pyramids, the Sphinx and the museum are in the price. Lunch is not, so the break in the middle of the day is the hour to buy your own. Children have their own price.',
          highlights: [
            'Four hours inside the Giza complex',
            'Three hours at the pyramids, an hour at the Sphinx',
            'Three hours in the Grand Egyptian Museum',
            'Entry tickets for all three included',
          ],
          seo: {
            metaTitle: 'Giza Complex: Giza Pyramids and Grand Egyptian Museum Private Day',
            metaDescription: 'The Giza pyramid complex: a private day at the Giza pyramids and the Sphinx with three hours in the Grand Egyptian Museum, entry tickets and hotel pickup.',
          },
          images: [PHOTO.pharaohStatue],
          imageAlts: [ALT.pharaohStatue],
        },
        {
          path: 'pyramids-egyptian-museum-and-khan-el-khalili',
          price: P.BAZAAR_PRIVATE,
          title: 'The Pyramids, the Egyptian Museum and Khan el-Khalili',
          short: 'Eight hours with a private guide and car: the Giza plateau, the Egyptian Museum of Antiquities, the Khan el-Khalili bazaar and lunch.',
          description: 'The complex opens a long private day that carries on into the Egyptian Museum and the bazaar. The day runs eight hours from an eight o’clock pickup at your hotel in Cairo or Giza, with about an hour in the car at each end. It takes in the pyramids of Giza with a guide, the Egyptian Museum of Antiquities and the lanes of the Khan el-Khalili bazaar.\n\nThe entry fees, the guide on site, lunch, a private air-conditioned vehicle and a bottle of water are in the price. Children have their own price.',
          highlights: [
            'The Giza plateau with a private guide',
            'The Egyptian Museum of Antiquities',
            'The lanes of Khan el-Khalili',
            'Entry fees, lunch and private transfers',
          ],
          seo: {
            metaTitle: 'Giza Complex: Private Giza Pyramids, Museum and Bazaar Day',
            metaDescription: 'The Giza pyramid complex: an eight-hour private day from Cairo or Giza taking in the pyramids, the Egyptian Museum of Antiquities and Khan el-Khalili, with lunch.',
          },
          images: [PHOTO.pyramidsOverDunes],
          imageAlts: [ALT.pyramidsOverDunes],
        },
        {
          path: 'pyramids-civilization-museum-and-old-cairo',
          price: P.NMEC,
          title: 'The Pyramids, the Civilization Museum and Old Cairo',
          short: 'A private day with the National Museum of Egyptian Civilization, the Giza plateau and Old Cairo, or a longer one with the Citadel and a Nile sail.',
          description: 'The plateau is one of three stops on this private day, between the national museum and Old Cairo. The trip comes as two private days, both leaving at eight. The shorter gives two hours to the National Museum of Egyptian Civilization, then the Giza plateau and the churches of Old Cairo, with the entry tickets included and lunch left out; the longer adds the Citadel and finishes with a sail on the Nile.\n\nBoth are private, with an English-speaking guide and an air-conditioned vehicle, collected from your hotel in Cairo or Giza. Lunch is in the price of the longer day only. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request.',
          highlights: [
            'The Giza plateau with the entry tickets',
            'The Museum of Egyptian Civilization',
            'The churches of Old Cairo',
            'A longer day with the Citadel and a Nile sail',
          ],
          seo: {
            metaTitle: 'Giza Complex: Pyramids, Civilization Museum and Old Cairo Day',
            metaDescription: 'A private day at the Giza pyramids, the National Museum of Egyptian Civilization and Old Cairo, or a longer one with the Citadel and a sail.',
          },
          images: [PHOTO.sphinxHead],
          imageAlts: [ALT.sphinxHead],
        },
        {
          path: 'private-day-pyramids-museum-and-bazaar',
          price: P.MUSEUM_BAZAAR,
          title: 'Private Day: the Pyramids, the Egyptian Museum and the Bazaar',
          short: 'Five hours with an Egyptologist guide: the Giza pyramids and the Sphinx, the Egyptian Museum, lunch and the lanes of Khan El-Khalili.',
          description: 'The complex comes first on this private day, with its entry tickets in the price. A private vehicle collects you from your hotel in Cairo or Giza at eight or at nine. The pyramids on the plateau and the Sphinx below them come first with the guide, then a guided walk through the halls of the museum on Tahrir Square, lunch at a local restaurant and the shops of the historic bazaar.\n\nThe entry tickets, the private tour with an Egyptologist guide, lunch and bottled water are in the price. This day visits the museum on Tahrir Square, not the Grand Egyptian Museum. Children pay the same price as adults.',
          highlights: [
            'The plateau and the Sphinx with the tickets',
            'An Egyptologist guide for your group',
            'The Egyptian Museum on Tahrir Square',
            'Lunch and the Khan El-Khalili bazaar',
          ],
          seo: {
            metaTitle: 'Giza Complex: Private Pyramids, Egyptian Museum and Bazaar Day',
            metaDescription: 'A private day with an Egyptologist guide: the Giza pyramids and the Sphinx, the Egyptian Museum, lunch and Khan El-Khalili, with hotel pickup.',
          },
          images: [PHOTO.lampMarket],
          imageAlts: [ALT.lampMarket],
        },
        {
          path: 'full-day-pyramids-and-the-egyptian-museum',
          price: P.FULL_DAY_MUSEUM,
          title: 'Full Day at the Giza Plateau and the Egyptian Museum',
          short: 'Eight hours with a private car and an Egyptology guide: the pyramids of Khufu, Khafre and Menkaure, the Valley Temple, the Sphinx and the Egyptian Museum.',
          description: 'The whole plateau is in this day: the three pyramids, the Valley Temple and the Great Sphinx. Six starts are published, from five past six in the morning to eleven. A private air-conditioned car collects you from your hotel in Cairo or Giza, and an Egyptology guide walks you among the pyramids of Khufu, Khafre and Menkaure, on to the Valley Temple and the Great Sphinx, and then through the museum on Tahrir Square.\n\nThe private car, the guide and a bottle of water are in the price. The record names no entrance fee, so bring the price of your own tickets unless the team confirms otherwise, and children pay the same price as adults.',
          highlights: [
            'The plateau, the Valley Temple and the Sphinx',
            'Khufu, Khafre and Menkaure with a guide',
            'The Valley Temple and the Great Sphinx',
            'The Egyptian Museum on Tahrir Square',
          ],
          seo: {
            metaTitle: 'Giza Complex: Full-Day Giza Pyramids and Egyptian Museum Tour',
            metaDescription: 'The Giza pyramid complex: eight hours with a private car and an Egyptology guide: the three Giza pyramids, the Valley Temple, the Sphinx and the Egyptian Museum.',
          },
          images: [PHOTO.museumPharaohBust],
          imageAlts: [ALT.museumPharaohBust],
        },
        {
          path: 'pyramids-egyptian-museum-and-old-cairo',
          price: P.CUSTOM_DAY,
          title: 'The Pyramids, the Egyptian Museum and Old Cairo',
          short: 'An eight o’clock start for three stops with the tickets: two hours on the plateau, two in the Egyptian Museum and an hour among the churches of Old Cairo.',
          description: 'Two hours go to the complex, with the Egyptian Museum and Old Cairo after it. The day comes two ways from the same eight o’clock pickup, in a shared group or with your own guide and vehicle. Two hours go to the plateau and the Great Sphinx, an hour to a break in Cairo, two more to the Egyptian Museum of Antiquities and the last to the churches of Old Cairo, the Hanging Church among them.\n\nThe entry tickets for the stops the day makes are in the price, with the air-conditioned transport and the pickup from your hotel. Lunch is not included. The shared day is guided in English; the private day can be guided in another language, so say which when you book.',
          highlights: [
            'Two hours in the Giza complex',
            'Two hours on the plateau with the Sphinx',
            'The Egyptian Museum and Old Cairo',
            'Shared, or private with your own guide',
          ],
          seo: {
            metaTitle: 'Giza Complex: Giza Pyramids, Egyptian Museum and Old Cairo Day',
            metaDescription: 'A day from Cairo or Giza with the plateau and the Sphinx, the Egyptian Museum of Antiquities and the churches of Old Cairo, tickets included.',
          },
          images: [PHOTO.sphinxAndPyramid],
          imageAlts: [ALT.sphinxAndPyramid],
        },
        {
          path: 'cairo-day-trip-from-sharm-el-sheikh',
          price: P.FROM_SHARM_DAY,
          title: 'Cairo Day Trip from Sharm El Sheikh: the Pyramids and the Museum',
          short: 'A long day by coach from Sharm El Sheikh: the Giza pyramids, the Sphinx and the Grand Egyptian Museum with an Egyptologist guide and lunch.',
          description: 'The complex is reached by coach from the coast, with its entrance fees in the price. The coach collects you from your hotel in Sharm El Sheikh just after midnight for the long drive north, arriving on the Giza plateau in the morning for the pyramids and the Great Sphinx with an Egyptologist guide. Lunch is at a restaurant looking out at the pyramids, and the Grand Egyptian Museum follows before the drive back.\n\nThe entrance fees for the pyramids, the Sphinx and the museum, lunch and the coach are in the price; drinks, a Nile boat, a camel ride and the burial chambers are not. Bring your passport. Children have their own price.',
          highlights: [
            'The Giza complex with its entrance fees',
            'An Egyptologist guide for the day',
            'Lunch looking out at the pyramids',
            'The Grand Egyptian Museum',
          ],
          seo: {
            metaTitle: 'Giza Complex: Pyramids Day Trip from Sharm El Sheikh',
            metaDescription: 'The Giza pyramid complex: from Sharm El Sheikh by coach: the Giza pyramids, the Sphinx and the Grand Egyptian Museum with a guide, lunch and the entrance fees.',
          },
          images: [PHOTO.museumFacade],
          imageAlts: [ALT.museumFacade],
          where: FROM_SHARM,
        },
        {
          path: 'two-days-in-cairo-from-sharm-el-sheikh',
          price: P.FROM_SHARM_TWO_DAYS,
          title: 'Two Days in Cairo from Sharm El Sheikh with a Night in Giza',
          short: 'Two days from Sharm El Sheikh: the Giza pyramids, the Sphinx and the Grand Egyptian Museum, a night by the pyramids and free time in Cairo.',
          description: 'The complex fills the first day, and the night that follows looks out at it. The transfer collects you from your hotel in the night, and day one is the Giza pyramids, the Great Sphinx and the Grand Egyptian Museum with an Egyptologist guide, the entrance fees covered. The night is in an apartment with a view of the pyramids, and day two is free time in Cairo before the drive back.\n\nBreakfast and lunch are in the price with the transfers, the guide and the entrance fees. Extra visits for the second day cannot be booked on this site. Tips and personal spending are not included, and children have their own price.',
          highlights: [
            'A day in the complex and a night beside it',
            'Two days in Cairo and Giza',
            'A night with a view of the pyramids',
            'Breakfast and lunch included',
          ],
          seo: {
            metaTitle: 'Giza Complex: Two-Day Cairo Trip from Sharm El Sheikh',
            metaDescription: 'The Giza pyramid complex: two days from Sharm El Sheikh: the pyramids, the Sphinx and the Grand Egyptian Museum with a guide, a night by the pyramids and free time.',
          },
          images: [PHOTO.goldenMask],
          imageAlts: [ALT.goldenMask],
          where: FROM_SHARM,
        },
        {
          path: 'private-cairo-day-by-car-from-sharm-el-sheikh',
          price: P.FROM_SHARM_PRIVATE,
          title: 'Private Cairo Day by Car from Sharm El Sheikh',
          short: 'A twenty-two hour private day: a car from your hotel in Sharm El Sheikh, the Giza plateau, the Egyptian Museum, Khan El-Khalili and lunch.',
          description: 'The complex is the first stop once the private car reaches Giza, with all the entrance fees covered. A private air-conditioned car collects you at one in the morning for the long drive north across Sinai. The day on the ground is the pyramids and the Great Sphinx with your guide, lunch at a restaurant in Cairo, the Egyptian Museum on Tahrir Square and the lanes of the Khan El-Khalili bazaar before the drive back.\n\nThe private car, the licensed driver, an English-speaking guide, lunch and all the entrance fees are in the price. The day runs about twenty-two hours. A guide in Spanish, German or French costs extra and cannot be booked here, and children pay the same price as adults.',
          highlights: [
            'The Giza plateau with all the entrance fees',
            'A private car and driver for your group',
            'All the entrance fees and lunch included',
            'The Egyptian Museum and Khan El-Khalili',
          ],
          seo: {
            metaTitle: 'Giza Complex: Private Cairo Day Trip by Car from Sharm',
            metaDescription: 'A private twenty-two hour day from Sharm El Sheikh by car: the Giza plateau, the Egyptian Museum, Khan El-Khalili, lunch and the entrance fees.',
          },
          images: [PHOTO.sphinxAndPyramid],
          imageAlts: [ALT.sphinxAndPyramid],
          where: FROM_SHARM,
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: the Plateau, Sakkara, Memphis and the Museums',
          short: 'Two private days from your hotel: the Giza plateau, Sakkara and Memphis on the first, the Egyptian Museum and the Museum of Egyptian Civilization on the second.',
          description: 'The complex and its Valley Temple open two private days that carry on to Sakkara and Memphis. Both days start at eight with a private air-conditioned vehicle at your hotel. Day one runs from the Giza plateau and its Valley Temple and Great Sphinx to the Step Pyramid of Djoser at Sakkara and on to Memphis, for the ruins of the old capital, its colossal statue of Ramses II and the alabaster sphinx. Day two is the Egyptian Museum on Tahrir Square and the national museum’s hall of royal mummies.\n\nThe private vehicle and guide on both days, lunch on both days, the entry fees for the sites the two days visit and bottled water are in the price. Children have their own price.',
          highlights: [
            'The complex and its Valley Temple',
            'Two full days with your own guide',
            'Sakkara, Memphis and the Giza plateau',
            'Lunch and the entry fees on both days',
          ],
          seo: {
            metaTitle: 'Giza Complex: Two-Day Private Cairo, Sakkara and Memphis Tour',
            metaDescription: 'The Giza pyramid complex: two private days from Cairo or Giza: the plateau, Sakkara and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'The Giza Pyramids, Sakkara and Memphis in One Day',
          short: 'Two hours on the Giza plateau, an hour at Sakkara and an hour at Memphis, shared or private, with the entry tickets included.',
          description: 'Two hours in the complex open a day that goes on to Sakkara and Memphis. An eight o’clock start, half an hour in the car, then two hours on the Giza plateau with a guide. Sakkara follows for an hour, with the Step Pyramid of Djoser, and Memphis for an hour among the ruins of the old capital and its colossal statue of Ramses II.\n\nThe day comes three ways: a shared group in English, a private tour in English, and a private tour in Italian or Spanish. All three carry the entry tickets for the sites, and lunch is not included. The two private ways have their own child price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'Two hours on the Giza plateau',
            'The Step Pyramid of Djoser at Sakkara',
            'An hour among the ruins of Memphis',
            'Shared, or private in English, Italian or Spanish',
          ],
          seo: {
            metaTitle: 'Giza Complex: Giza Pyramids, Sakkara and Memphis Day Tour',
            metaDescription: 'The Giza pyramid complex: a day from Cairo or Giza with two hours on the Giza plateau, the Step Pyramid at Sakkara and the ruins of Memphis, shared or private.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'Private Day: the Pyramids, Memphis, Sakkara and Dahshur with a Nile Sail',
          short: 'A private day with lunch that takes in the Giza pyramids, Memphis, Sakkara and Dahshur and finishes with a felucca sail on the Nile.',
          description: 'The complex is the first of four ancient sites on the longest day sold here. The longest day on offer here, private from start to finish and leaving at eight. It takes in the Giza pyramids and the Sphinx, the ruins of Memphis with its colossal statue of Ramses II, the Step Pyramid of Djoser at Sakkara and the Bent and Red Pyramids at Dahshur, with an English-speaking guide throughout.\n\nLunch is included on this option, and the day ends with a sail on the Nile aboard a felucca. The entry tickets for the sites are in the price, as is the pickup and drop-off at your hotel in Cairo or Giza. Children have their own price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'The Giza pyramids with three more ancient sites',
            'Giza, Memphis, Sakkara and Dahshur in one day',
            'Lunch included',
            'A felucca sail on the Nile to finish',
          ],
          seo: {
            metaTitle: 'Giza Complex: Private Pyramids, Memphis, Sakkara and Dahshur Day',
            metaDescription: 'The Giza pyramid complex: a private day from Cairo or Giza taking in the Giza pyramids, Memphis, Sakkara and Dahshur, with lunch and a felucca sail to finish.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
      ],
    },
    {
      slug: 'great-pyramid-of-cheops',
      name: 'Great Pyramid of Cheops',
      listingPath: '/trips',
      domain: 'greatpyramidofcheops.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'gpc-',
      foreignPlaces: NOT_GIZA_WIDE,
      tagline: 'Guided days at the Great Pyramid of Khufu',
      description: 'Great Pyramid of Cheops sells the days whose own programme names the Great Pyramid: the tomb Khufu built, which the Greeks called Cheops, the oldest of the seven wonders and the only one still standing. Some days walk the plateau and nothing else; others go on to the Egyptian Museum, the Grand Egyptian Museum, Old Cairo or the bazaar, and one comes by private car from Sharm El Sheikh.\n\nEvery trip collects you from your hotel and brings you back. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Great Pyramid of Cheops Tours with Hotel Pickup',
        metaDescription: 'Guided days at the Great Pyramid of Khufu, called Cheops: half days on the Giza plateau and full days into Cairo, with hotel pickup.',
        keywords: ['great pyramid of cheops tour', 'pyramid of khufu guided tour', 'great pyramid giza day trip', 'cheops pyramid tour cairo', 'khufu pyramid entry tour'],
      },
      theme: { primaryColor: '#3D3A3A', secondaryColor: '#F2EEE6', accentColor: '#C08A2E' },
      heroImages: [PHOTO.pyramidsOverDunes, PHOTO.threePyramids, PHOTO.museumPharaohBust],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/great-pyramid-of-cheops/monogram.png',
      trips: [
        {
          path: 'private-half-day-pyramids-and-sphinx',
          price: P.HALF_DAY,
          title: 'Private Half Day at the Pyramids and the Great Sphinx',
          short: 'Four hours on the Giza plateau with a private guide and car: the three pyramids, the Valley Temple and the Great Sphinx, with the entry fees.',
          description: 'The Great Pyramid of Khufu, which the Greeks called Cheops, is the first of the three this half day walks. The car collects you from your hotel in Cairo or Giza at eight or at nine and drives straight to the plateau, where a private guide walks you through the pyramids of Khufu, Khafre and Menkaure and on to the Valley Temple of Khafre and the Great Sphinx beside it.\n\nThe guide, the private vehicle, the entry fees and a bottle of water are in the price, and the car is yours alone. The day is four hours, and children have their own price.',
          highlights: [
            'The Great Pyramid of Khufu, called Cheops',
            'Khufu, Khafre and Menkaure with a guide',
            'A private car and guide for your group',
            'Entry fees and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Great Pyramid: Private Half-Day Giza Pyramids Tour',
            metaDescription: 'The Great Pyramid of Khufu: four hours on the Giza plateau with a private guide and car, the Valley Temple, the entry fees and hotel pickup in Cairo or Giza.',
          },
          images: [PHOTO.plateauAtLowSun],
          imageAlts: [ALT.plateauAtLowSun],
        },
        {
          path: 'sunrise-camel-ride-and-breakfast',
          price: P.SUNRISE_SHARED,
          title: 'Sunrise or Morning at the Pyramids with a Camel Ride and Breakfast',
          short: 'A shared five-hour trip: an hour on a camel or a horse beside the plateau, an Egyptian breakfast and two guided hours among the pyramids.',
          description: 'The Great Pyramid stands over the camel ride at first light and is walked with the guide afterwards. There are two starts, half past four for the hour when the sun comes up behind the plateau and eight o’clock for a later morning. An hour on a camel or a horse opens the day, a traditional Egyptian breakfast follows, and a guide then takes you through the pyramids complex and the Sphinx for two hours.\n\nThe entry ticket for the Giza pyramids complex is in the price, with the air-conditioned transport and the pickup from your hotel. The vehicle and the guide are shared with other guests, and children pay the same price as adults.',
          highlights: [
            'The Great Pyramid at first light',
            'An hour on a camel or a horse',
            'A traditional Egyptian breakfast',
            'Two guided hours among the pyramids',
          ],
          seo: {
            metaTitle: 'Great Pyramid: Giza Pyramids Sunrise Tour with Camel Ride',
            metaDescription: 'The Great Pyramid of Khufu: a shared five-hour trip with a sunrise or morning start, an hour on a camel or horse, breakfast, a guided walk and hotel pickup.',
          },
          images: [PHOTO.camelAtSunrise],
          imageAlts: [ALT.camelAtSunrise],
        },
        {
          path: 'private-sunrise-camel-ride-and-breakfast',
          price: P.SUNRISE_PRIVATE,
          title: 'Private Sunrise or Morning Ride with Breakfast at the Pyramids',
          short: 'The same hour in the saddle, breakfast and guided walk, with the vehicle and the guide for your group alone, and a third start in the afternoon.',
          description: 'The Great Pyramid is walked privately after the ride, at whichever of the three starts you pick. This is the private way to take the ride: half past four for the sunrise, eight o’clock for the morning or one in the afternoon. The hour on a camel or a horse runs on the sand beside the plateau, breakfast follows, and your own guide walks you through the pyramids complex and the Sphinx.\n\nThe entry ticket for the Giza pyramids complex is in the price, as are the private air-conditioned vehicle and the pickup from your hotel in Cairo or Giza. Children have their own price.',
          highlights: [
            'The Great Pyramid walked with your own guide',
            'Your own vehicle and guide',
            'Three starts, from before dawn to the afternoon',
            'The pyramids entry ticket included',
          ],
          seo: {
            metaTitle: 'Great Pyramid: Private Giza Sunrise Camel Ride and Breakfast',
            metaDescription: 'A private hour on a camel or horse beside the plateau, breakfast and a guided walk of the pyramids, with the entry ticket and hotel pickup.',
          },
          images: [PHOTO.threePyramids],
          imageAlts: [ALT.threePyramids],
        },
        {
          path: 'private-day-with-a-camel-ride-and-lunch',
          price: P.CAMEL_LUNCH,
          title: 'Private Pyramids Day with a Camel Ride and Lunch',
          short: 'Four hours with a private guide and car: the Giza plateau, a camel ride around it, lunch at a local restaurant and the entrance fees.',
          description: 'The Great Pyramid of Khufu is where the guided walk begins, with the entrance fees in the price. You pick the start from a quarter-hourly list that runs from eight in the morning to a quarter to one. Your own English-speaking guide walks the plateau with you, a camel ride goes round it, and lunch is taken at a local restaurant.\n\nThe entrance fees for the Giza pyramids complex are in the price, as is the pickup from your hotel in Cairo or Giza. Children have their own price. Pickup from outside the city centre costs extra and cannot be booked here.',
          highlights: [
            'The Great Pyramid with the entrance fees',
            'Your own guide and vehicle',
            'A camel ride around the plateau',
            'Lunch at a local restaurant',
          ],
          seo: {
            metaTitle: 'Great Pyramid: Private Giza Pyramids Tour with Camel Ride and Lunch',
            metaDescription: 'The Great Pyramid of Khufu: a four-hour private day with your own guide and car, a camel ride around the plateau, lunch and the entrance fees, from Cairo or Giza.',
          },
          images: [PHOTO.threePyramids],
          imageAlts: [ALT.threePyramids],
        },
        {
          path: 'pyramids-and-an-hour-on-the-nile',
          price: P.FELUCCA,
          title: 'Giza Pyramids and an Hour Under Sail on the Nile',
          short: 'Five hours with a private vehicle: three hours on the plateau with the Great Pyramid, Khafre, Menkaure and the Sphinx, then an hour on a felucca.',
          description: 'Half an hour of this day is given to the Great Pyramid alone, before Khafre and Menkaure. The car collects you from your hotel in Cairo or Giza for a start at eight, nine, ten or eleven o’clock. Three hours on the plateau follow, with half an hour each at the Great Pyramid, the pyramid of Khafre, the pyramid of Menkaure and the Sphinx, before the day finishes with an hour on the Nile aboard a felucca.\n\nPrivate air-conditioned transfers, the guide on site, the entry fees and bottled water are in the price. The day is five hours, and children have their own price.',
          highlights: [
            'Half an hour at the Great Pyramid',
            'Half an hour each at the three pyramids',
            'An hour on the Nile under sail',
            'Entry fees and private transfers included',
          ],
          seo: {
            metaTitle: 'Great Pyramid: Giza Pyramids Tour with a Nile Felucca Sail',
            metaDescription: 'Five hours from Cairo or Giza: the three pyramids and the Sphinx with a guide, then an hour on the Nile on a felucca, entry fees included.',
          },
          images: [PHOTO.felucca],
          imageAlts: [ALT.felucca],
        },
        {
          path: 'pyramids-sphinx-and-the-grand-egyptian-museum',
          price: P.GEM_PRIVATE,
          title: 'The Pyramids, the Sphinx and the Grand Egyptian Museum',
          short: 'A private day from your hotel: three hours on the plateau, an hour at the Sphinx and three hours in the Grand Egyptian Museum, tickets included.',
          description: 'Three hours on the plateau begin at the Great Pyramid of Khufu, with the ticket in the price. Your own guide and car take the day at your pace, starting at nine. Three hours go to the pyramids of Giza and an hour to the Great Sphinx, with a break between them, and the rest of the day is three hours in the Grand Egyptian Museum with time of your own among the galleries.\n\nThe entry tickets for the pyramids, the Sphinx and the museum are in the price. Lunch is not, so the break in the middle of the day is the hour to buy your own. Children have their own price.',
          highlights: [
            'The Great Pyramid with its entry ticket',
            'Three hours at the pyramids, an hour at the Sphinx',
            'Three hours in the Grand Egyptian Museum',
            'Entry tickets for all three included',
          ],
          seo: {
            metaTitle: 'Great Pyramid: Giza Pyramids and Grand Egyptian Museum Private Day',
            metaDescription: 'The Great Pyramid of Khufu: a private day at the Giza pyramids and the Sphinx with three hours in the Grand Egyptian Museum, entry tickets and hotel pickup.',
          },
          images: [PHOTO.pharaohStatue],
          imageAlts: [ALT.pharaohStatue],
        },
        {
          path: 'pyramids-egyptian-museum-and-khan-el-khalili',
          price: P.BAZAAR_PRIVATE,
          title: 'The Pyramids, the Egyptian Museum and Khan el-Khalili',
          short: 'Eight hours with a private guide and car: the Giza plateau, the Egyptian Museum of Antiquities, the Khan el-Khalili bazaar and lunch.',
          description: 'The Great Pyramid opens a private day that runs on into the Egyptian Museum and the bazaar. The day runs eight hours from an eight o’clock pickup at your hotel in Cairo or Giza, with about an hour in the car at each end. It takes in the pyramids of Giza with a guide, the Egyptian Museum of Antiquities and the lanes of the Khan el-Khalili bazaar.\n\nThe entry fees, the guide on site, lunch, a private air-conditioned vehicle and a bottle of water are in the price. Children have their own price.',
          highlights: [
            'The Great Pyramid with a private guide',
            'The Egyptian Museum of Antiquities',
            'The lanes of Khan el-Khalili',
            'Entry fees, lunch and private transfers',
          ],
          seo: {
            metaTitle: 'Great Pyramid: Private Giza Pyramids, Museum and Bazaar Day',
            metaDescription: 'The Great Pyramid of Khufu: an eight-hour private day from Cairo or Giza taking in the pyramids, the Egyptian Museum of Antiquities and Khan el-Khalili, with lunch.',
          },
          images: [PHOTO.pyramidsOverDunes],
          imageAlts: [ALT.pyramidsOverDunes],
        },
        {
          path: 'pyramids-civilization-museum-and-old-cairo',
          price: P.NMEC,
          title: 'The Pyramids, the Civilization Museum and Old Cairo',
          short: 'A private day with the National Museum of Egyptian Civilization, the Giza plateau and Old Cairo, or a longer one with the Citadel and a Nile sail.',
          description: 'The Great Pyramid is reached in the middle of this private day, after the national museum. The trip comes as two private days, both leaving at eight. The shorter gives two hours to the National Museum of Egyptian Civilization, then the Giza plateau and the churches of Old Cairo, with the entry tickets included and lunch left out; the longer adds the Citadel and finishes with a sail on the Nile.\n\nBoth are private, with an English-speaking guide and an air-conditioned vehicle, collected from your hotel in Cairo or Giza. Lunch is in the price of the longer day only. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request.',
          highlights: [
            'The Great Pyramid with the entry tickets',
            'The Museum of Egyptian Civilization',
            'The churches of Old Cairo',
            'A longer day with the Citadel and a Nile sail',
          ],
          seo: {
            metaTitle: 'Great Pyramid: Pyramids, Civilization Museum and Old Cairo Day',
            metaDescription: 'A private day at the Giza pyramids, the National Museum of Egyptian Civilization and Old Cairo, or a longer one with the Citadel and a sail.',
          },
          images: [PHOTO.sphinxHead],
          imageAlts: [ALT.sphinxHead],
        },
        {
          path: 'private-day-pyramids-museum-and-bazaar',
          price: P.MUSEUM_BAZAAR,
          title: 'Private Day: the Pyramids, the Egyptian Museum and the Bazaar',
          short: 'Five hours with an Egyptologist guide: the Giza pyramids and the Sphinx, the Egyptian Museum, lunch and the lanes of Khan El-Khalili.',
          description: 'The Great Pyramid is the first of the day, with its entry ticket and an Egyptologist guide. A private vehicle collects you from your hotel in Cairo or Giza at eight or at nine. The pyramids on the plateau and the Sphinx below them come first with the guide, then a guided walk through the halls of the museum on Tahrir Square, lunch at a local restaurant and the shops of the historic bazaar.\n\nThe entry tickets, the private tour with an Egyptologist guide, lunch and bottled water are in the price. This day visits the museum on Tahrir Square, not the Grand Egyptian Museum. Children pay the same price as adults.',
          highlights: [
            'The Great Pyramid with an Egyptologist guide',
            'An Egyptologist guide for your group',
            'The Egyptian Museum on Tahrir Square',
            'Lunch and the Khan El-Khalili bazaar',
          ],
          seo: {
            metaTitle: 'Great Pyramid: Private Pyramids, Egyptian Museum and Bazaar Day',
            metaDescription: 'A private day with an Egyptologist guide: the Giza pyramids and the Sphinx, the Egyptian Museum, lunch and Khan El-Khalili, with hotel pickup.',
          },
          images: [PHOTO.lampMarket],
          imageAlts: [ALT.lampMarket],
        },
        {
          path: 'full-day-pyramids-and-the-egyptian-museum',
          price: P.FULL_DAY_MUSEUM,
          title: 'Full Day at the Giza Plateau and the Egyptian Museum',
          short: 'Eight hours with a private car and an Egyptology guide: the pyramids of Khufu, Khafre and Menkaure, the Valley Temple, the Sphinx and the Egyptian Museum.',
          description: 'The record of this day names the Great Pyramid of Khufu, called Cheops, first of its three. Six starts are published, from five past six in the morning to eleven. A private air-conditioned car collects you from your hotel in Cairo or Giza, and an Egyptology guide walks you among the pyramids of Khufu, Khafre and Menkaure, on to the Valley Temple and the Great Sphinx, and then through the museum on Tahrir Square.\n\nThe private car, the guide and a bottle of water are in the price. The record names no entrance fee, so bring the price of your own tickets unless the team confirms otherwise, and children pay the same price as adults.',
          highlights: [
            'Khufu, called Cheops, with Khafre and Menkaure',
            'Khufu, Khafre and Menkaure with a guide',
            'The Valley Temple and the Great Sphinx',
            'The Egyptian Museum on Tahrir Square',
          ],
          seo: {
            metaTitle: 'Great Pyramid: Full-Day Giza Pyramids and Egyptian Museum Tour',
            metaDescription: 'The Great Pyramid of Khufu: eight hours with a private car and an Egyptology guide: the three Giza pyramids, the Valley Temple, the Sphinx and the Egyptian Museum.',
          },
          images: [PHOTO.museumPharaohBust],
          imageAlts: [ALT.museumPharaohBust],
        },
        {
          path: 'pyramids-egyptian-museum-and-old-cairo',
          price: P.CUSTOM_DAY,
          title: 'The Pyramids, the Egyptian Museum and Old Cairo',
          short: 'An eight o’clock start for three stops with the tickets: two hours on the plateau, two in the Egyptian Museum and an hour among the churches of Old Cairo.',
          description: 'The Great Pyramid is walked in the two hours this day gives the plateau. The day comes two ways from the same eight o’clock pickup, in a shared group or with your own guide and vehicle. Two hours go to the plateau and the Great Sphinx, an hour to a break in Cairo, two more to the Egyptian Museum of Antiquities and the last to the churches of Old Cairo, the Hanging Church among them.\n\nThe entry tickets for the stops the day makes are in the price, with the air-conditioned transport and the pickup from your hotel. Lunch is not included. The shared day is guided in English; the private day can be guided in another language, so say which when you book.',
          highlights: [
            'The Great Pyramid in the day’s two plateau hours',
            'Two hours on the plateau with the Sphinx',
            'The Egyptian Museum and Old Cairo',
            'Shared, or private with your own guide',
          ],
          seo: {
            metaTitle: 'Great Pyramid: Giza Pyramids, Egyptian Museum and Old Cairo Day',
            metaDescription: 'A day from Cairo or Giza with the plateau and the Sphinx, the Egyptian Museum of Antiquities and the churches of Old Cairo, tickets included.',
          },
          images: [PHOTO.sphinxAndPyramid],
          imageAlts: [ALT.sphinxAndPyramid],
        },
        {
          path: 'private-cairo-day-by-car-from-sharm-el-sheikh',
          price: P.FROM_SHARM_PRIVATE,
          title: 'Private Cairo Day by Car from Sharm El Sheikh',
          short: 'A twenty-two hour private day: a car from your hotel in Sharm El Sheikh, the Giza plateau, the Egyptian Museum, Khan El-Khalili and lunch.',
          description: 'The Great Pyramid is the reason the car leaves Sharm El Sheikh at one in the morning. A private air-conditioned car collects you at one in the morning for the long drive north across Sinai. The day on the ground is the pyramids and the Great Sphinx with your guide, lunch at a restaurant in Cairo, the Egyptian Museum on Tahrir Square and the lanes of the Khan El-Khalili bazaar before the drive back.\n\nThe private car, the licensed driver, an English-speaking guide, lunch and all the entrance fees are in the price. The day runs about twenty-two hours. A guide in Spanish, German or French costs extra and cannot be booked here, and children pay the same price as adults.',
          highlights: [
            'The Great Pyramid, reached by private car',
            'A private car and driver for your group',
            'All the entrance fees and lunch included',
            'The Egyptian Museum and Khan El-Khalili',
          ],
          seo: {
            metaTitle: 'Great Pyramid: Private Cairo Day Trip by Car from Sharm',
            metaDescription: 'A private twenty-two hour day from Sharm El Sheikh by car: the Giza plateau, the Egyptian Museum, Khan El-Khalili, lunch and the entrance fees.',
          },
          images: [PHOTO.sphinxAndPyramid],
          imageAlts: [ALT.sphinxAndPyramid],
          where: FROM_SHARM,
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: the Plateau, Sakkara, Memphis and the Museums',
          short: 'Two private days from your hotel: the Giza plateau, Sakkara and Memphis on the first, the Egyptian Museum and the Museum of Egyptian Civilization on the second.',
          description: 'The Great Pyramid opens the first of two private days that reach Sakkara and Memphis as well. Both days start at eight with a private air-conditioned vehicle at your hotel. Day one runs from the Giza plateau and its Valley Temple and Great Sphinx to the Step Pyramid of Djoser at Sakkara and on to Memphis, for the ruins of the old capital, its colossal statue of Ramses II and the alabaster sphinx. Day two is the Egyptian Museum on Tahrir Square and the national museum’s hall of royal mummies.\n\nThe private vehicle and guide on both days, lunch on both days, the entry fees for the sites the two days visit and bottled water are in the price. Children have their own price.',
          highlights: [
            'The Great Pyramid on the first of the two days',
            'Two full days with your own guide',
            'Sakkara, Memphis and the Giza plateau',
            'Lunch and the entry fees on both days',
          ],
          seo: {
            metaTitle: 'Great Pyramid: Two-Day Private Cairo, Sakkara and Memphis Tour',
            metaDescription: 'The Great Pyramid of Khufu: two private days from Cairo or Giza: the plateau, Sakkara and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
  ],
};

/** B10B: the three sites south of Giza. */
export const B10B: NetworkBatch = {
  id: 'b10b',
  sites: [
    {
      slug: 'mit-rahina-museum',
      name: 'Mit Rahina Museum',
      listingPath: '/trips',
      domain: 'mitrahinamuseum.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'mrm-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Days at the open-air museum of Memphis',
      description: 'Mit Rahina Museum sells the days that stop at Memphis, the first capital of ancient Egypt, where the open-air museum at Mit Rahina keeps the colossal statue of Ramses II and the alabaster sphinx among the palms. Every day here pairs it with Sakkara, and most with the Giza plateau or Dahshur as well.\n\nEvery trip collects you from your hotel in Cairo or Giza and brings you back, with the entry tickets for the sites it visits. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Mit Rahina and Memphis Day Tours from Cairo',
        metaDescription: 'Day trips to the open-air museum at Mit Rahina and ancient Memphis, with Sakkara, the Giza plateau or Dahshur and hotel pickup.',
        keywords: ['mit rahina museum tour', 'memphis egypt day trip', 'memphis and sakkara tour', 'open air museum memphis', 'ramses ii colossus memphis'],
      },
      theme: { primaryColor: '#2F5D3A', secondaryColor: '#F1EDE2', accentColor: '#B5543A' },
      heroImages: [PHOTO.stepPyramid, PHOTO.stepPyramidAtDusk, PHOTO.feluccasAtCairo],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/mit-rahina-museum/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'Dahshur, Sakkara and Memphis in One Shared Day',
          short: 'A shared late-morning day to the Bent and Red Pyramids at Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, tickets included.',
          description: 'Memphis is the last of the three stops on this shared day, an hour among the ruins of the old capital. A shared group leaves at eleven for the three sites south of Giza. Dahshur comes first, an hour among the Bent and the Red Pyramids, then an hour and a half at Sakkara for the Step Pyramid of Djoser and the tombs around it, and an hour at Memphis.\n\nThe guide is English-speaking, the vehicle is air-conditioned, and the entry tickets for the sites are in the price. Lunch is not included. Pickup and drop-off are at your hotel in Cairo or Giza, and children pay the same price as adults. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'An hour at Memphis, the old capital',
            'The Bent and Red Pyramids at Dahshur',
            'The Step Pyramid of Djoser at Sakkara',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Mit Rahina: Dahshur, Sakkara and Memphis Shared Day Tour',
            metaDescription: 'A shared day from Cairo or Giza to the Bent and Red Pyramids at Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, tickets included.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'Private Day at Dahshur, Sakkara and Memphis',
          short: 'The same three sites with your own guide and vehicle, leaving at eight: Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis.',
          description: 'Memphis closes the private run south, with the colossal statue of Ramses II lying in its hall. An eight o’clock start, with a vehicle and a guide for your group alone. The route runs to Dahshur for the Bent and the Red Pyramids, to Sakkara for the Step Pyramid of Djoser and its tombs, and to Memphis for the ruins of the old capital and the colossal statue of Ramses II.\n\nThe entry tickets are in the price; lunch is not included and cannot be added on this site. Pickup and drop-off are at your hotel in Cairo or Giza, and children have their own price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'Memphis and its colossal statue of Ramses II',
            'A private guide and vehicle for your group',
            'The Bent and Red Pyramids at Dahshur',
            'The ruins of Memphis and its colossal statue',
          ],
          seo: {
            metaTitle: 'Mit Rahina: Private Dahshur, Sakkara and Memphis Day Tour',
            metaDescription: 'A private day from Cairo or Giza to Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, with entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'The Giza Pyramids, Sakkara and Memphis in One Day',
          short: 'Two hours on the Giza plateau, an hour at Sakkara and an hour at Memphis, shared or private, with the entry tickets included.',
          description: 'Memphis takes the last hour of this day, after the Giza plateau and Sakkara. An eight o’clock start, half an hour in the car, then two hours on the Giza plateau with a guide. Sakkara follows for an hour, with the Step Pyramid of Djoser, and Memphis for an hour among the ruins of the old capital and its colossal statue of Ramses II.\n\nThe day comes three ways: a shared group in English, a private tour in English, and a private tour in Italian or Spanish. All three carry the entry tickets for the sites, and lunch is not included. The two private ways have their own child price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'An hour among the ruins of Memphis',
            'The Step Pyramid of Djoser at Sakkara',
            'An hour among the ruins of Memphis',
            'Shared, or private in English, Italian or Spanish',
          ],
          seo: {
            metaTitle: 'Mit Rahina: Giza Pyramids, Sakkara and Memphis Day Tour',
            metaDescription: 'A day from Cairo or Giza with two hours on the Giza plateau, the Step Pyramid at Sakkara and the ruins of Memphis, shared or private.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'Private Day: the Pyramids, Memphis, Sakkara and Dahshur with a Nile Sail',
          short: 'A private day with lunch that takes in the Giza pyramids, Memphis, Sakkara and Dahshur and finishes with a felucca sail on the Nile.',
          description: 'Memphis comes second on the longest day sold here, between the Giza plateau and Sakkara. The longest day on offer here, private from start to finish and leaving at eight. It takes in the Giza pyramids and the Sphinx, the ruins of Memphis with its colossal statue of Ramses II, the Step Pyramid of Djoser at Sakkara and the Bent and Red Pyramids at Dahshur, with an English-speaking guide throughout.\n\nLunch is included on this option, and the day ends with a sail on the Nile aboard a felucca. The entry tickets for the sites are in the price, as is the pickup and drop-off at your hotel in Cairo or Giza. Children have their own price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'Memphis with its colossal statue',
            'Giza, Memphis, Sakkara and Dahshur in one day',
            'Lunch included',
            'A felucca sail on the Nile to finish',
          ],
          seo: {
            metaTitle: 'Mit Rahina: Private Pyramids, Memphis, Sakkara and Dahshur Day',
            metaDescription: 'A private day from Cairo or Giza taking in the Giza pyramids, Memphis, Sakkara and Dahshur, with lunch and a felucca sail to finish.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: the Plateau, Sakkara, Memphis and the Museums',
          short: 'Two private days from your hotel: the Giza plateau, Sakkara and Memphis on the first, the Egyptian Museum and the Museum of Egyptian Civilization on the second.',
          description: 'Memphis ends the first of two private days, with the colossus and the alabaster sphinx. Both days start at eight with a private air-conditioned vehicle at your hotel. Day one runs from the Giza plateau and its Valley Temple and Great Sphinx to the Step Pyramid of Djoser at Sakkara and on to Memphis, for the ruins of the old capital, its colossal statue of Ramses II and the alabaster sphinx. Day two is the Egyptian Museum on Tahrir Square and the national museum’s hall of royal mummies.\n\nThe private vehicle and guide on both days, lunch on both days, the entry fees for the sites the two days visit and bottled water are in the price. Children have their own price.',
          highlights: [
            'Memphis, its colossus and the alabaster sphinx',
            'Two full days with your own guide',
            'Sakkara, Memphis and the Giza plateau',
            'Lunch and the entry fees on both days',
          ],
          seo: {
            metaTitle: 'Mit Rahina: Two-Day Private Cairo, Sakkara and Memphis Tour',
            metaDescription: 'Two private days from Cairo or Giza: the plateau, Sakkara and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'sakkara-pyramids',
      name: 'Sakkara Pyramids',
      listingPath: '/trips',
      domain: 'sakkarapyramids.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'skp-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Days at Djoser’s Step Pyramid and the necropolis',
      description: 'Sakkara Pyramids sells the days that go to Sakkara: the Step Pyramid of Djoser, the oldest large stone building in Egypt, and the burial ground that spreads around it. Each day pairs it with Memphis, and most with the Giza plateau or the Bent and Red Pyramids at Dahshur.\n\nEvery trip collects you from your hotel in Cairo or Giza and brings you back, with the entry tickets for the sites it visits. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Sakkara Step Pyramid Day Tours from Cairo',
        metaDescription: 'Day trips to the Step Pyramid of Djoser at Sakkara and its necropolis, with Memphis, Dahshur or the Giza plateau and hotel pickup.',
        keywords: ['sakkara pyramids tour', 'step pyramid of djoser tour', 'saqqara day trip from cairo', 'sakkara and memphis day tour', 'saqqara necropolis guided tour'],
      },
      theme: { primaryColor: '#1E7B74', secondaryColor: '#F2EFE4', accentColor: '#8A5A22' },
      heroImages: [PHOTO.stepPyramidAtDusk, PHOTO.stepPyramid, PHOTO.feluccasAtCairo],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/sakkara-pyramids/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'Dahshur, Sakkara and Memphis in One Shared Day',
          short: 'A shared late-morning day to the Bent and Red Pyramids at Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, tickets included.',
          description: 'Sakkara gets the longest stop of this shared day: an hour and a half for the Step Pyramid of Djoser and the tombs around it. A shared group leaves at eleven for the three sites south of Giza. Dahshur comes first, an hour among the Bent and the Red Pyramids, then an hour and a half at Sakkara for the Step Pyramid of Djoser and the tombs around it, and an hour at Memphis.\n\nThe guide is English-speaking, the vehicle is air-conditioned, and the entry tickets for the sites are in the price. Lunch is not included. Pickup and drop-off are at your hotel in Cairo or Giza, and children pay the same price as adults. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'An hour and a half at the Step Pyramid and its tombs',
            'The Bent and Red Pyramids at Dahshur',
            'The Step Pyramid of Djoser at Sakkara',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Sakkara: Dahshur, Sakkara and Memphis Shared Day Tour',
            metaDescription: 'A shared day from Cairo or Giza to the Bent and Red Pyramids at Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, tickets included.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'Private Day at Dahshur, Sakkara and Memphis',
          short: 'The same three sites with your own guide and vehicle, leaving at eight: Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis.',
          description: 'Sakkara is the middle stop of the private run south, with the Step Pyramid and its tombs. An eight o’clock start, with a vehicle and a guide for your group alone. The route runs to Dahshur for the Bent and the Red Pyramids, to Sakkara for the Step Pyramid of Djoser and its tombs, and to Memphis for the ruins of the old capital and the colossal statue of Ramses II.\n\nThe entry tickets are in the price; lunch is not included and cannot be added on this site. Pickup and drop-off are at your hotel in Cairo or Giza, and children have their own price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'The Step Pyramid of Djoser with your own guide',
            'A private guide and vehicle for your group',
            'The Bent and Red Pyramids at Dahshur',
            'The ruins of Memphis and its colossal statue',
          ],
          seo: {
            metaTitle: 'Sakkara: Private Dahshur, Sakkara and Memphis Day Tour',
            metaDescription: 'The Step Pyramid at Sakkara: a private day from Cairo or Giza to Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, with entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'The Giza Pyramids, Sakkara and Memphis in One Day',
          short: 'Two hours on the Giza plateau, an hour at Sakkara and an hour at Memphis, shared or private, with the entry tickets included.',
          description: 'Sakkara takes an hour of this day, between the Giza plateau and Memphis. An eight o’clock start, half an hour in the car, then two hours on the Giza plateau with a guide. Sakkara follows for an hour, with the Step Pyramid of Djoser, and Memphis for an hour among the ruins of the old capital and its colossal statue of Ramses II.\n\nThe day comes three ways: a shared group in English, a private tour in English, and a private tour in Italian or Spanish. All three carry the entry tickets for the sites, and lunch is not included. The two private ways have their own child price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'An hour at the Step Pyramid of Djoser',
            'The Step Pyramid of Djoser at Sakkara',
            'An hour among the ruins of Memphis',
            'Shared, or private in English, Italian or Spanish',
          ],
          seo: {
            metaTitle: 'Sakkara: Giza Pyramids, Sakkara and Memphis Day Tour',
            metaDescription: 'The Step Pyramid at Sakkara: a day from Cairo or Giza with two hours on the Giza plateau, the Step Pyramid at Sakkara and the ruins of Memphis, shared or private.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'Private Day: the Pyramids, Memphis, Sakkara and Dahshur with a Nile Sail',
          short: 'A private day with lunch that takes in the Giza pyramids, Memphis, Sakkara and Dahshur and finishes with a felucca sail on the Nile.',
          description: 'Sakkara is one of four ancient sites on the longest day sold here. The longest day on offer here, private from start to finish and leaving at eight. It takes in the Giza pyramids and the Sphinx, the ruins of Memphis with its colossal statue of Ramses II, the Step Pyramid of Djoser at Sakkara and the Bent and Red Pyramids at Dahshur, with an English-speaking guide throughout.\n\nLunch is included on this option, and the day ends with a sail on the Nile aboard a felucca. The entry tickets for the sites are in the price, as is the pickup and drop-off at your hotel in Cairo or Giza. Children have their own price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'The Step Pyramid of Djoser at Sakkara',
            'Giza, Memphis, Sakkara and Dahshur in one day',
            'Lunch included',
            'A felucca sail on the Nile to finish',
          ],
          seo: {
            metaTitle: 'Sakkara: Private Pyramids, Memphis, Sakkara and Dahshur Day',
            metaDescription: 'The Step Pyramid at Sakkara: a private day from Cairo or Giza taking in the Giza pyramids, Memphis, Sakkara and Dahshur, with lunch and a felucca sail to finish.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: the Plateau, Sakkara, Memphis and the Museums',
          short: 'Two private days from your hotel: the Giza plateau, Sakkara and Memphis on the first, the Egyptian Museum and the Museum of Egyptian Civilization on the second.',
          description: 'Sakkara stands in the middle of the first of two private days. Both days start at eight with a private air-conditioned vehicle at your hotel. Day one runs from the Giza plateau and its Valley Temple and Great Sphinx to the Step Pyramid of Djoser at Sakkara and on to Memphis, for the ruins of the old capital, its colossal statue of Ramses II and the alabaster sphinx. Day two is the Egyptian Museum on Tahrir Square and the national museum’s hall of royal mummies.\n\nThe private vehicle and guide on both days, lunch on both days, the entry fees for the sites the two days visit and bottled water are in the price. Children have their own price.',
          highlights: [
            'The Step Pyramid of Djoser on day one',
            'Two full days with your own guide',
            'Sakkara, Memphis and the Giza plateau',
            'Lunch and the entry fees on both days',
          ],
          seo: {
            metaTitle: 'Sakkara: Two-Day Private Cairo, Sakkara and Memphis Tour',
            metaDescription: 'The Step Pyramid at Sakkara: two private days from Cairo or Giza: the plateau, Sakkara and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'pyramids-of-dahshur',
      name: 'Pyramids of Dahshur',
      listingPath: '/trips',
      domain: 'pyramidsofdahshur.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'pod-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Days at the Bent and Red Pyramids',
      description: 'Pyramids of Dahshur sells the days whose own booking option goes to Dahshur, the quiet field south of Sakkara where Sneferu built the Bent Pyramid and then the Red Pyramid, the first that came out true. A shared day and a private day start there; a longer private day reaches it after Giza, Memphis and Sakkara.\n\nEvery trip collects you from your hotel in Cairo or Giza and brings you back, with the entry tickets for the sites it visits. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Dahshur Bent and Red Pyramid Day Tours from Cairo',
        metaDescription: 'Day trips to the Bent Pyramid and the Red Pyramid at Dahshur, with Sakkara and Memphis or the Giza plateau, and hotel pickup.',
        keywords: ['pyramids of dahshur tour', 'bent pyramid day trip', 'red pyramid dahshur tour', 'dahshur sakkara memphis day tour', 'dahshur guided tour from cairo'],
      },
      theme: { primaryColor: '#B45F4D', secondaryColor: '#F3EEE6', accentColor: '#6E9CC7' },
      heroImages: [PHOTO.feluccasAtCairo, PHOTO.stepPyramid, PHOTO.stepPyramidAtDusk],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/pyramids-of-dahshur/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'Dahshur, Sakkara and Memphis in One Shared Day',
          short: 'A shared late-morning day to the Bent and Red Pyramids at Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, tickets included.',
          description: 'Dahshur comes first on this shared day: an hour among the Bent Pyramid and the Red Pyramid before the road goes on to Sakkara. A shared group leaves at eleven for the three sites south of Giza. Dahshur comes first, an hour among the Bent and the Red Pyramids, then an hour and a half at Sakkara for the Step Pyramid of Djoser and the tombs around it, and an hour at Memphis.\n\nThe guide is English-speaking, the vehicle is air-conditioned, and the entry tickets for the sites are in the price. Lunch is not included. Pickup and drop-off are at your hotel in Cairo or Giza, and children pay the same price as adults. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'An hour at the Bent and Red Pyramids',
            'The Bent and Red Pyramids at Dahshur',
            'The Step Pyramid of Djoser at Sakkara',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Dahshur: Dahshur, Sakkara and Memphis Shared Day Tour',
            metaDescription: 'A shared day from Cairo or Giza to the Bent and Red Pyramids at Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, tickets included.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'Private Day at Dahshur, Sakkara and Memphis',
          short: 'The same three sites with your own guide and vehicle, leaving at eight: Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis.',
          description: 'Dahshur opens the private run south, an hour at the Bent and the Red Pyramids with your own guide. An eight o’clock start, with a vehicle and a guide for your group alone. The route runs to Dahshur for the Bent and the Red Pyramids, to Sakkara for the Step Pyramid of Djoser and its tombs, and to Memphis for the ruins of the old capital and the colossal statue of Ramses II.\n\nThe entry tickets are in the price; lunch is not included and cannot be added on this site. Pickup and drop-off are at your hotel in Cairo or Giza, and children have their own price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'The Bent and Red Pyramids with your own guide',
            'A private guide and vehicle for your group',
            'The Bent and Red Pyramids at Dahshur',
            'The ruins of Memphis and its colossal statue',
          ],
          seo: {
            metaTitle: 'Dahshur: Private Dahshur, Sakkara and Memphis Day Tour',
            metaDescription: 'A private day from Cairo or Giza to Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, with entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'Private Day: the Pyramids, Memphis, Sakkara and Dahshur with a Nile Sail',
          short: 'A private day with lunch that takes in the Giza pyramids, Memphis, Sakkara and Dahshur and finishes with a felucca sail on the Nile.',
          description: 'Dahshur is the last of the four ancient sites on this private day, after Giza, Memphis and Sakkara. The longest day on offer here, private from start to finish and leaving at eight. It takes in the Giza pyramids and the Sphinx, the ruins of Memphis with its colossal statue of Ramses II, the Step Pyramid of Djoser at Sakkara and the Bent and Red Pyramids at Dahshur, with an English-speaking guide throughout.\n\nLunch is included on this option, and the day ends with a sail on the Nile aboard a felucca. The entry tickets for the sites are in the price, as is the pickup and drop-off at your hotel in Cairo or Giza. Children have their own price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'Dahshur after Giza, Memphis and Sakkara',
            'Giza, Memphis, Sakkara and Dahshur in one day',
            'Lunch included',
            'A felucca sail on the Nile to finish',
          ],
          seo: {
            metaTitle: 'Dahshur: Private Pyramids, Memphis, Sakkara and Dahshur Day',
            metaDescription: 'A private day from Cairo or Giza taking in the Giza pyramids, Memphis, Sakkara and Dahshur, with lunch and a felucca sail to finish.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
      ],
    },
  ],
};

/** B10C: the two single pyramids and the statues of Ramesses II. */
export const B10C: NetworkBatch = {
  id: 'b10c',
  sites: [
    {
      slug: 'pyramid-of-khafre',
      name: 'Pyramid of Khafre',
      listingPath: '/trips',
      domain: 'pyramidofkhafre.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'pok-',
      foreignPlaces: NOT_ONE_PYRAMID,
      tagline: 'Guided days at the second pyramid and its valley temple',
      description: 'Pyramid of Khafre sells the days whose own programme names Khafre: the second pyramid at Giza, the one that still keeps its cap of casing stone, with the causeway and the Valley Temple below it and the Sphinx at the end of them. Each day on this site walks it with a guide; the longer ones carry on into the museums of Cairo or Old Cairo.\n\nEvery trip collects you from your hotel in Cairo or Giza and brings you back. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Pyramid of Khafre Guided Tours from Cairo and Giza',
        metaDescription: 'Guided days at the pyramid of Khafre, the Valley Temple and the Sphinx, with the Egyptian Museum or Old Cairo and hotel pickup.',
        keywords: ['pyramid of khafre tour', 'khafre pyramid guided tour', 'valley temple of khafre', 'second pyramid giza tour', 'chephren pyramid day trip'],
      },
      theme: { primaryColor: '#8E3B2E', secondaryColor: '#F2EDE3', accentColor: '#2A2522' },
      heroImages: [PHOTO.sphinxAndPyramid, PHOTO.plateauAtLowSun, PHOTO.threePyramids],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/pyramid-of-khafre/monogram.png',
      trips: [
        {
          path: 'private-half-day-pyramids-and-sphinx',
          price: P.HALF_DAY,
          title: 'Private Half Day at the Pyramids and the Great Sphinx',
          short: 'Four hours on the Giza plateau with a private guide and car: the three pyramids, the Valley Temple and the Great Sphinx, with the entry fees.',
          description: 'The pyramid of Khafre and the Valley Temple below it are both named in this half day, which ends at the Sphinx between them. The car collects you from your hotel in Cairo or Giza at eight or at nine and drives straight to the plateau, where a private guide walks you through the pyramids of Khufu, Khafre and Menkaure and on to the Valley Temple of Khafre and the Great Sphinx beside it.\n\nThe guide, the private vehicle, the entry fees and a bottle of water are in the price, and the car is yours alone. The day is four hours, and children have their own price.',
          highlights: [
            'The pyramid of Khafre and his Valley Temple',
            'Khufu, Khafre and Menkaure with a guide',
            'A private car and guide for your group',
            'Entry fees and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Pyramid of Khafre: Private Half-Day Giza Pyramids Tour',
            metaDescription: 'The pyramid of Khafre: four hours on the Giza plateau with a private guide and car, the Valley Temple, the entry fees and hotel pickup in Cairo or Giza.',
          },
          images: [PHOTO.plateauAtLowSun],
          imageAlts: [ALT.plateauAtLowSun],
        },
        {
          path: 'private-day-with-a-camel-ride-and-lunch',
          price: P.CAMEL_LUNCH,
          title: 'Private Pyramids Day with a Camel Ride and Lunch',
          short: 'Four hours with a private guide and car: the Giza plateau, a camel ride around it, lunch at a local restaurant and the entrance fees.',
          description: 'Khafre is the second of the three pyramids this private day walks, and the camel ride passes beneath it. You pick the start from a quarter-hourly list that runs from eight in the morning to a quarter to one. Your own English-speaking guide walks the plateau with you, a camel ride goes round it, and lunch is taken at a local restaurant.\n\nThe entrance fees for the Giza pyramids complex are in the price, as is the pickup from your hotel in Cairo or Giza. Children have their own price. Pickup from outside the city centre costs extra and cannot be booked here.',
          highlights: [
            'Khafre walked with your own guide',
            'Your own guide and vehicle',
            'A camel ride around the plateau',
            'Lunch at a local restaurant',
          ],
          seo: {
            metaTitle: 'Private Giza Pyramids Tour with Camel Ride and Lunch',
            metaDescription: 'The pyramid of Khafre: a four-hour private day with your own guide and car, a camel ride around the plateau, lunch and the entrance fees, from Cairo or Giza.',
          },
          images: [PHOTO.threePyramids],
          imageAlts: [ALT.threePyramids],
        },
        {
          path: 'pyramids-and-an-hour-on-the-nile',
          price: P.FELUCCA,
          title: 'Giza Pyramids and an Hour Under Sail on the Nile',
          short: 'Five hours with a private vehicle: three hours on the plateau with the Great Pyramid, Khafre, Menkaure and the Sphinx, then an hour on a felucca.',
          description: 'Half an hour of this day belongs to the pyramid of Khafre, named on the record as a stop of its own. The car collects you from your hotel in Cairo or Giza for a start at eight, nine, ten or eleven o’clock. Three hours on the plateau follow, with half an hour each at the Great Pyramid, the pyramid of Khafre, the pyramid of Menkaure and the Sphinx, before the day finishes with an hour on the Nile aboard a felucca.\n\nPrivate air-conditioned transfers, the guide on site, the entry fees and bottled water are in the price. The day is five hours, and children have their own price.',
          highlights: [
            'Half an hour at the pyramid of Khafre',
            'Half an hour each at the three pyramids',
            'An hour on the Nile under sail',
            'Entry fees and private transfers included',
          ],
          seo: {
            metaTitle: 'Pyramid of Khafre: Giza Pyramids Tour with a Nile Felucca Sail',
            metaDescription: 'The pyramid of Khafre: five hours from Cairo or Giza: the three pyramids and the Sphinx with a guide, then an hour on the Nile on a felucca, entry fees included.',
          },
          images: [PHOTO.felucca],
          imageAlts: [ALT.felucca],
        },
        {
          path: 'pyramids-sphinx-and-the-grand-egyptian-museum',
          price: P.GEM_PRIVATE,
          title: 'The Pyramids, the Sphinx and the Grand Egyptian Museum',
          short: 'A private day from your hotel: three hours on the plateau, an hour at the Sphinx and three hours in the Grand Egyptian Museum, tickets included.',
          description: 'Khafre stands in the three hours this day gives the plateau, with the Valley Temple that carries his name. Your own guide and car take the day at your pace, starting at nine. Three hours go to the pyramids of Giza and an hour to the Great Sphinx, with a break between them, and the rest of the day is three hours in the Grand Egyptian Museum with time of your own among the galleries.\n\nThe entry tickets for the pyramids, the Sphinx and the museum are in the price. Lunch is not, so the break in the middle of the day is the hour to buy your own. Children have their own price.',
          highlights: [
            'Khafre and the Valley Temple below him',
            'Three hours at the pyramids, an hour at the Sphinx',
            'Three hours in the Grand Egyptian Museum',
            'Entry tickets for all three included',
          ],
          seo: {
            metaTitle: 'Pyramid of Khafre: Giza Pyramids and Grand Egyptian Museum Private Day',
            metaDescription: 'The pyramid of Khafre: a private day at the Giza pyramids and the Sphinx with three hours in the Grand Egyptian Museum, entry tickets and hotel pickup.',
          },
          images: [PHOTO.pharaohStatue],
          imageAlts: [ALT.pharaohStatue],
        },
        {
          path: 'full-day-pyramids-and-the-egyptian-museum',
          price: P.FULL_DAY_MUSEUM,
          title: 'Full Day at the Giza Plateau and the Egyptian Museum',
          short: 'Eight hours with a private car and an Egyptology guide: the pyramids of Khufu, Khafre and Menkaure, the Valley Temple, the Sphinx and the Egyptian Museum.',
          description: 'Khafre is named on the record of this eight-hour day, with the Valley Temple that belonged to him. Six starts are published, from five past six in the morning to eleven. A private air-conditioned car collects you from your hotel in Cairo or Giza, and an Egyptology guide walks you among the pyramids of Khufu, Khafre and Menkaure, on to the Valley Temple and the Great Sphinx, and then through the museum on Tahrir Square.\n\nThe private car, the guide and a bottle of water are in the price. The record names no entrance fee, so bring the price of your own tickets unless the team confirms otherwise, and children pay the same price as adults.',
          highlights: [
            'Khafre and the Valley Temple',
            'Khufu, Khafre and Menkaure with a guide',
            'The Valley Temple and the Great Sphinx',
            'The Egyptian Museum on Tahrir Square',
          ],
          seo: {
            metaTitle: 'Pyramid of Khafre: Full-Day Giza Pyramids and Egyptian Museum Tour',
            metaDescription: 'The pyramid of Khafre: eight hours with a private car and an Egyptology guide: the three Giza pyramids, the Valley Temple, the Sphinx and the Egyptian Museum.',
          },
          images: [PHOTO.museumPharaohBust],
          imageAlts: [ALT.museumPharaohBust],
        },
        {
          path: 'pyramids-egyptian-museum-and-old-cairo',
          price: P.CUSTOM_DAY,
          title: 'The Pyramids, the Egyptian Museum and Old Cairo',
          short: 'An eight o’clock start for three stops with the tickets: two hours on the plateau, two in the Egyptian Museum and an hour among the churches of Old Cairo.',
          description: 'Khafre is one of the three pyramids the record names for the two hours on the plateau. The day comes two ways from the same eight o’clock pickup, in a shared group or with your own guide and vehicle. Two hours go to the plateau and the Great Sphinx, an hour to a break in Cairo, two more to the Egyptian Museum of Antiquities and the last to the churches of Old Cairo, the Hanging Church among them.\n\nThe entry tickets for the stops the day makes are in the price, with the air-conditioned transport and the pickup from your hotel. Lunch is not included. The shared day is guided in English; the private day can be guided in another language, so say which when you book.',
          highlights: [
            'Khafre among the three pyramids',
            'Two hours on the plateau with the Sphinx',
            'The Egyptian Museum and Old Cairo',
            'Shared, or private with your own guide',
          ],
          seo: {
            metaTitle: 'Pyramid of Khafre: Giza Pyramids, Egyptian Museum and Old Cairo Day',
            metaDescription: 'The pyramid of Khafre: a day from Cairo or Giza with the plateau and the Sphinx, the Egyptian Museum of Antiquities and the churches of Old Cairo, tickets included.',
          },
          images: [PHOTO.sphinxAndPyramid],
          imageAlts: [ALT.sphinxAndPyramid],
        },
      ],
    },
    {
      slug: 'pyramid-of-menkaure',
      name: 'Pyramid of Menkaure',
      listingPath: '/trips',
      domain: 'pyramidofmenkaure.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'pom-',
      foreignPlaces: NOT_ONE_PYRAMID,
      tagline: 'Guided days at the third pyramid of Giza',
      description: 'Pyramid of Menkaure sells the days whose own programme names Menkaure: the smallest and last of the three pyramids at Giza, with its three queens’ pyramids in a row beside it and the granite still on its lower courses. Each day here walks it with a guide, and the longer ones go on into Cairo.\n\nEvery trip collects you from your hotel in Cairo or Giza and brings you back. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Pyramid of Menkaure Guided Tours from Cairo and Giza',
        metaDescription: 'Guided days at the pyramid of Menkaure and the Giza plateau, with the Egyptian Museum, Old Cairo or the Sphinx, and hotel pickup.',
        keywords: ['pyramid of menkaure tour', 'menkaure pyramid guided tour', 'third pyramid giza tour', 'mykerinos pyramid day trip', 'giza three pyramids tour'],
      },
      theme: { primaryColor: '#1E1E1E', secondaryColor: '#F4EFE8', accentColor: '#D9A089' },
      heroImages: [PHOTO.threePyramids, PHOTO.plateauAtLowSun, PHOTO.felucca],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/pyramid-of-menkaure/monogram.png',
      trips: [
        {
          path: 'private-half-day-pyramids-and-sphinx',
          price: P.HALF_DAY,
          title: 'Private Half Day at the Pyramids and the Great Sphinx',
          short: 'Four hours on the Giza plateau with a private guide and car: the three pyramids, the Valley Temple and the Great Sphinx, with the entry fees.',
          description: 'Menkaure, the smallest of the three and the last built, is walked with the other two on this half day. The car collects you from your hotel in Cairo or Giza at eight or at nine and drives straight to the plateau, where a private guide walks you through the pyramids of Khufu, Khafre and Menkaure and on to the Valley Temple of Khafre and the Great Sphinx beside it.\n\nThe guide, the private vehicle, the entry fees and a bottle of water are in the price, and the car is yours alone. The day is four hours, and children have their own price.',
          highlights: [
            'Menkaure, the smallest of the three',
            'Khufu, Khafre and Menkaure with a guide',
            'A private car and guide for your group',
            'Entry fees and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Pyramid of Menkaure: Private Half-Day Giza Pyramids Tour',
            metaDescription: 'The pyramid of Menkaure: four hours on the Giza plateau with a private guide and car, the Valley Temple, the entry fees and hotel pickup in Cairo or Giza.',
          },
          images: [PHOTO.plateauAtLowSun],
          imageAlts: [ALT.plateauAtLowSun],
        },
        {
          path: 'private-day-with-a-camel-ride-and-lunch',
          price: P.CAMEL_LUNCH,
          title: 'Private Pyramids Day with a Camel Ride and Lunch',
          short: 'Four hours with a private guide and car: the Giza plateau, a camel ride around it, lunch at a local restaurant and the entrance fees.',
          description: 'Menkaure closes the line of three this private day walks, with its own queens’ pyramids beside it. You pick the start from a quarter-hourly list that runs from eight in the morning to a quarter to one. Your own English-speaking guide walks the plateau with you, a camel ride goes round it, and lunch is taken at a local restaurant.\n\nThe entrance fees for the Giza pyramids complex are in the price, as is the pickup from your hotel in Cairo or Giza. Children have their own price. Pickup from outside the city centre costs extra and cannot be booked here.',
          highlights: [
            'Menkaure and the queens’ pyramids beside it',
            'Your own guide and vehicle',
            'A camel ride around the plateau',
            'Lunch at a local restaurant',
          ],
          seo: {
            metaTitle: 'Private Giza Pyramids Tour with Camel Ride and Lunch',
            metaDescription: 'The pyramid of Menkaure: a four-hour private day with your own guide and car, a camel ride around the plateau, lunch and the entrance fees, from Cairo or Giza.',
          },
          images: [PHOTO.threePyramids],
          imageAlts: [ALT.threePyramids],
        },
        {
          path: 'pyramids-and-an-hour-on-the-nile',
          price: P.FELUCCA,
          title: 'Giza Pyramids and an Hour Under Sail on the Nile',
          short: 'Five hours with a private vehicle: three hours on the plateau with the Great Pyramid, Khafre, Menkaure and the Sphinx, then an hour on a felucca.',
          description: 'Half an hour of this day is given to the pyramid of Menkaure, named on the record as a stop of its own. The car collects you from your hotel in Cairo or Giza for a start at eight, nine, ten or eleven o’clock. Three hours on the plateau follow, with half an hour each at the Great Pyramid, the pyramid of Khafre, the pyramid of Menkaure and the Sphinx, before the day finishes with an hour on the Nile aboard a felucca.\n\nPrivate air-conditioned transfers, the guide on site, the entry fees and bottled water are in the price. The day is five hours, and children have their own price.',
          highlights: [
            'Half an hour at the pyramid of Menkaure',
            'Half an hour each at the three pyramids',
            'An hour on the Nile under sail',
            'Entry fees and private transfers included',
          ],
          seo: {
            metaTitle: 'Pyramid of Menkaure: Giza Pyramids Tour with a Nile Felucca Sail',
            metaDescription: 'The pyramid of Menkaure: five hours from Cairo or Giza: the three pyramids and the Sphinx with a guide, then an hour on the Nile on a felucca, entry fees included.',
          },
          images: [PHOTO.felucca],
          imageAlts: [ALT.felucca],
        },
        {
          path: 'pyramids-sphinx-and-the-grand-egyptian-museum',
          price: P.GEM_PRIVATE,
          title: 'The Pyramids, the Sphinx and the Grand Egyptian Museum',
          short: 'A private day from your hotel: three hours on the plateau, an hour at the Sphinx and three hours in the Grand Egyptian Museum, tickets included.',
          description: 'Menkaure is the third of the pyramids the record names for the plateau hours of this private day. Your own guide and car take the day at your pace, starting at nine. Three hours go to the pyramids of Giza and an hour to the Great Sphinx, with a break between them, and the rest of the day is three hours in the Grand Egyptian Museum with time of your own among the galleries.\n\nThe entry tickets for the pyramids, the Sphinx and the museum are in the price. Lunch is not, so the break in the middle of the day is the hour to buy your own. Children have their own price.',
          highlights: [
            'Menkaure on the plateau with a private guide',
            'Three hours at the pyramids, an hour at the Sphinx',
            'Three hours in the Grand Egyptian Museum',
            'Entry tickets for all three included',
          ],
          seo: {
            metaTitle: 'Giza Pyramids and Grand Egyptian Museum Private Day',
            metaDescription: 'The pyramid of Menkaure: a private day at the Giza pyramids and the Sphinx with three hours in the Grand Egyptian Museum, entry tickets and hotel pickup.',
          },
          images: [PHOTO.pharaohStatue],
          imageAlts: [ALT.pharaohStatue],
        },
        {
          path: 'full-day-pyramids-and-the-egyptian-museum',
          price: P.FULL_DAY_MUSEUM,
          title: 'Full Day at the Giza Plateau and the Egyptian Museum',
          short: 'Eight hours with a private car and an Egyptology guide: the pyramids of Khufu, Khafre and Menkaure, the Valley Temple, the Sphinx and the Egyptian Museum.',
          description: 'Menkaure is named on the record of this eight-hour day, after Khufu and Khafre. Six starts are published, from five past six in the morning to eleven. A private air-conditioned car collects you from your hotel in Cairo or Giza, and an Egyptology guide walks you among the pyramids of Khufu, Khafre and Menkaure, on to the Valley Temple and the Great Sphinx, and then through the museum on Tahrir Square.\n\nThe private car, the guide and a bottle of water are in the price. The record names no entrance fee, so bring the price of your own tickets unless the team confirms otherwise, and children pay the same price as adults.',
          highlights: [
            'Menkaure, after Khufu and Khafre',
            'Khufu, Khafre and Menkaure with a guide',
            'The Valley Temple and the Great Sphinx',
            'The Egyptian Museum on Tahrir Square',
          ],
          seo: {
            metaTitle: 'Pyramid of Menkaure: Full-Day Giza Pyramids and Egyptian Museum Tour',
            metaDescription: 'The pyramid of Menkaure: eight hours with a private car and an Egyptology guide: the three Giza pyramids, the Valley Temple, the Sphinx and the Egyptian Museum.',
          },
          images: [PHOTO.museumPharaohBust],
          imageAlts: [ALT.museumPharaohBust],
        },
        {
          path: 'pyramids-egyptian-museum-and-old-cairo',
          price: P.CUSTOM_DAY,
          title: 'The Pyramids, the Egyptian Museum and Old Cairo',
          short: 'An eight o’clock start for three stops with the tickets: two hours on the plateau, two in the Egyptian Museum and an hour among the churches of Old Cairo.',
          description: 'Menkaure is one of the three pyramids the record names for the two hours on the plateau. The day comes two ways from the same eight o’clock pickup, in a shared group or with your own guide and vehicle. Two hours go to the plateau and the Great Sphinx, an hour to a break in Cairo, two more to the Egyptian Museum of Antiquities and the last to the churches of Old Cairo, the Hanging Church among them.\n\nThe entry tickets for the stops the day makes are in the price, with the air-conditioned transport and the pickup from your hotel. Lunch is not included. The shared day is guided in English; the private day can be guided in another language, so say which when you book.',
          highlights: [
            'Menkaure among the three pyramids',
            'Two hours on the plateau with the Sphinx',
            'The Egyptian Museum and Old Cairo',
            'Shared, or private with your own guide',
          ],
          seo: {
            metaTitle: 'Pyramid of Menkaure: Giza Pyramids, Egyptian Museum and Old Cairo Day',
            metaDescription: 'A day from Cairo or Giza with the plateau and the Sphinx, the Egyptian Museum of Antiquities and the churches of Old Cairo, tickets included.',
          },
          images: [PHOTO.sphinxAndPyramid],
          imageAlts: [ALT.sphinxAndPyramid],
        },
      ],
    },
    {
      slug: 'statue-of-ramesses-ii',
      name: 'Statue of Ramesses II',
      listingPath: '/trips',
      domain: 'statueoframessesii.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'sr2-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Days that stand before a colossus of Ramesses II',
      description: 'Statue of Ramesses II sells the days that bring you to one of his colossi. One lies on its back under cover at Mit Rahina, in the open-air museum of ancient Memphis; another stands in the entrance hall of the Grand Egyptian Museum, eleven metres of red granite raised again beside the Giza plateau. Most days here reach the first, with Sakkara and often Dahshur or Giza; one goes to the second.\n\nEvery trip collects you from your hotel in Cairo or Giza and brings you back. Hold a place online and pay later, or ask the team first.',
      seo: {
        metaTitle: 'Statue of Ramesses II Tours: Memphis and the Grand Museum',
        metaDescription: 'Day trips to the colossal statues of Ramesses II at Memphis and in the Grand Egyptian Museum, with Sakkara or Giza and hotel pickup.',
        keywords: ['statue of ramesses ii tour', 'colossus of ramses ii memphis', 'ramses ii grand egyptian museum', 'memphis colossus day trip', 'ramesses statue cairo tour'],
      },
      theme: { primaryColor: '#8C6A2F', secondaryColor: '#F3EFE5', accentColor: '#18222E' },
      heroImages: [PHOTO.museumHall, PHOTO.stepPyramid, PHOTO.stepPyramidAtDusk],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/statue-of-ramesses-ii/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'Dahshur, Sakkara and Memphis in One Shared Day',
          short: 'A shared late-morning day to the Bent and Red Pyramids at Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, tickets included.',
          description: 'The colossal statue of Ramses II lies on its back at Memphis, the last stop of this shared day. A shared group leaves at eleven for the three sites south of Giza. Dahshur comes first, an hour among the Bent and the Red Pyramids, then an hour and a half at Sakkara for the Step Pyramid of Djoser and the tombs around it, and an hour at Memphis.\n\nThe guide is English-speaking, the vehicle is air-conditioned, and the entry tickets for the sites are in the price. Lunch is not included. Pickup and drop-off are at your hotel in Cairo or Giza, and children pay the same price as adults. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'The colossal statue of Ramses II at Memphis',
            'The Bent and Red Pyramids at Dahshur',
            'The Step Pyramid of Djoser at Sakkara',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Ramesses II: Dahshur, Sakkara and Memphis Shared Day Tour',
            metaDescription: 'A shared day from Cairo or Giza to the Bent and Red Pyramids at Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, tickets included.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'Private Day at Dahshur, Sakkara and Memphis',
          short: 'The same three sites with your own guide and vehicle, leaving at eight: Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis.',
          description: 'The colossus of Ramses II at Memphis closes this private run south. An eight o’clock start, with a vehicle and a guide for your group alone. The route runs to Dahshur for the Bent and the Red Pyramids, to Sakkara for the Step Pyramid of Djoser and its tombs, and to Memphis for the ruins of the old capital and the colossal statue of Ramses II.\n\nThe entry tickets are in the price; lunch is not included and cannot be added on this site. Pickup and drop-off are at your hotel in Cairo or Giza, and children have their own price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'The colossus of Ramses II with your own guide',
            'A private guide and vehicle for your group',
            'The Bent and Red Pyramids at Dahshur',
            'The ruins of Memphis and its colossal statue',
          ],
          seo: {
            metaTitle: 'Ramesses II: Private Dahshur, Sakkara and Memphis Day Tour',
            metaDescription: 'A colossus of Ramesses II: a private day from Cairo or Giza to Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, with entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'The Giza Pyramids, Sakkara and Memphis in One Day',
          short: 'Two hours on the Giza plateau, an hour at Sakkara and an hour at Memphis, shared or private, with the entry tickets included.',
          description: 'The colossal statue of Ramses II is what the last hour of this day goes to see at Memphis. An eight o’clock start, half an hour in the car, then two hours on the Giza plateau with a guide. Sakkara follows for an hour, with the Step Pyramid of Djoser, and Memphis for an hour among the ruins of the old capital and its colossal statue of Ramses II.\n\nThe day comes three ways: a shared group in English, a private tour in English, and a private tour in Italian or Spanish. All three carry the entry tickets for the sites, and lunch is not included. The two private ways have their own child price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'The colossal statue of Ramses II',
            'The Step Pyramid of Djoser at Sakkara',
            'An hour among the ruins of Memphis',
            'Shared, or private in English, Italian or Spanish',
          ],
          seo: {
            metaTitle: 'Ramesses II: Giza Pyramids, Sakkara and Memphis Day Tour',
            metaDescription: 'A colossus of Ramesses II: a day from Cairo or Giza with two hours on the Giza plateau, the Step Pyramid at Sakkara and the ruins of Memphis, shared or private.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'Private Day: the Pyramids, Memphis, Sakkara and Dahshur with a Nile Sail',
          short: 'A private day with lunch that takes in the Giza pyramids, Memphis, Sakkara and Dahshur and finishes with a felucca sail on the Nile.',
          description: 'The colossus of Ramses II stands in the middle of the longest day sold here. The longest day on offer here, private from start to finish and leaving at eight. It takes in the Giza pyramids and the Sphinx, the ruins of Memphis with its colossal statue of Ramses II, the Step Pyramid of Djoser at Sakkara and the Bent and Red Pyramids at Dahshur, with an English-speaking guide throughout.\n\nLunch is included on this option, and the day ends with a sail on the Nile aboard a felucca. The entry tickets for the sites are in the price, as is the pickup and drop-off at your hotel in Cairo or Giza. Children have their own price. A stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school can be added on request, and can be left out.',
          highlights: [
            'The colossus of Ramses II at Memphis',
            'Giza, Memphis, Sakkara and Dahshur in one day',
            'Lunch included',
            'A felucca sail on the Nile to finish',
          ],
          seo: {
            metaTitle: 'Ramesses II: Private Pyramids, Memphis, Sakkara and Dahshur Day',
            metaDescription: 'A colossus of Ramesses II: a private day from Cairo or Giza taking in the Giza pyramids, Memphis, Sakkara and Dahshur, with lunch and a felucca sail to finish.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: the Plateau, Sakkara, Memphis and the Museums',
          short: 'Two private days from your hotel: the Giza plateau, Sakkara and Memphis on the first, the Egyptian Museum and the Museum of Egyptian Civilization on the second.',
          description: 'The colossal statue of Ramses II and the alabaster sphinx end the first of two private days. Both days start at eight with a private air-conditioned vehicle at your hotel. Day one runs from the Giza plateau and its Valley Temple and Great Sphinx to the Step Pyramid of Djoser at Sakkara and on to Memphis, for the ruins of the old capital, its colossal statue of Ramses II and the alabaster sphinx. Day two is the Egyptian Museum on Tahrir Square and the national museum’s hall of royal mummies.\n\nThe private vehicle and guide on both days, lunch on both days, the entry fees for the sites the two days visit and bottled water are in the price. Children have their own price.',
          highlights: [
            'The colossus and the alabaster sphinx',
            'Two full days with your own guide',
            'Sakkara, Memphis and the Giza plateau',
            'Lunch and the entry fees on both days',
          ],
          seo: {
            metaTitle: 'Ramesses II: Two-Day Private Cairo, Sakkara and Memphis Tour',
            metaDescription: 'A colossus of Ramesses II: two private days from Cairo or Giza: the plateau, Sakkara and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'grand-egyptian-museum-visit',
          price: P.GEM_VISIT,
          title: 'Grand Egyptian Museum Visit with Hotel Pickup',
          short: 'Four hours from your hotel in Cairo or Giza: three hours in the Grand Egyptian Museum with a guide, the entry fees and private transfers.',
          description: 'The standing colossus of Ramses II is the first thing the museum shows, in the hall beyond the entrance. A private air-conditioned car collects you from your hotel at eight, and the drive to the museum takes about an hour. Three hours in the galleries follow, with a guide on site, the entry fees covered and a bottle of water, before the car takes you back.\n\nYour entry ticket is sent to you separately. The museum is not yet fully open, so some galleries may be closed on the day. Children have their own price.',
          highlights: [
            'The colossus of Ramses II in the museum hall',
            'Three hours in the galleries with a guide',
            'Private transfers from Cairo or Giza',
            'The entry fees included',
          ],
          seo: {
            metaTitle: 'Ramesses II: Grand Egyptian Museum Visit with Hotel Pickup',
            metaDescription: 'A colossus of Ramesses II: three hours in the Grand Egyptian Museum with a guide on site, the entry fees and private transfers from your hotel in Cairo or Giza.',
          },
          images: [PHOTO.museumHall],
          imageAlts: [ALT.museumHall],
        },
      ],
    },
  ],
};

/** B10D: the Three Pools day on the Dahab coast. */
export const B10D: NetworkBatch = {
  id: 'b10d',
  sites: [
    {
      slug: 'three-pools-dahab',
      name: 'Three Pools Dahab',
      listingPath: '/trips',
      domain: 'threepoolsdahab.com',
      city: 'Sharm El Sheikh',
      area: 'Sharm El Sheikh',
      pickupDestination: 'sharm-el-sheikh',
      coordinates: SHARM,
      currency: 'USD',
      slugPrefix: 'tpd-',
      foreignPlaces: NOT_THREE_POOLS,
      tagline: 'The Three Pools day on the Dahab coast',
      description: 'Three Pools Dahab sells the day that goes to the Three Pools: the sheltered water north of Dahab where the reef makes three basins close to the shore. The day reaches them by road from Sharm El Sheikh, takes in Salama Canyon by jeep on the way, and gives the middle of the day to the pools, with a camel ride, a snorkelling stop and lunch by the sea in the town.\n\nThe trip collects you from your hotel in Sharm El Sheikh and brings you back. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Three Pools Dahab Day Trip from Sharm El Sheikh',
        metaDescription: 'The Three Pools on the Dahab coast with a camel ride, a snorkelling stop, Salama Canyon by jeep and lunch by the sea.',
        keywords: ['three pools dahab', '3 pools dahab day trip', 'dahab three pools snorkelling', 'red canyon and three pools tour', 'dahab day trip from sharm'],
      },
      theme: { primaryColor: '#0D3B66', secondaryColor: '#F0F4F6', accentColor: '#2BB3B1' },
      heroImages: [PHOTO.canyonWalls, PHOTO.canyonCamel, PHOTO.layeredRock],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/three-pools-dahab/monogram.png',
      trips: [
        {
          path: 'three-pools-camel-ride-and-red-canyon-day',
          price: P.THREE_POOLS,
          title: 'Three Pools, Camel Ride and Red Canyon Day from Sharm El Sheikh',
          short: 'Eight to nine hours from Sharm El Sheikh: Salama Canyon by jeep, the Three Pools with a camel ride and a snorkelling stop, and lunch by the sea in Dahab.',
          description: 'The Three Pools are the middle of this day and the longest stop in it: three hours of sheltered water on the Dahab coast. An air-conditioned vehicle collects you from the main gate of your hotel at eight, and the first stop is Salama Canyon, which a jeep takes you into for a guided walk. The day then moves to the Three Pools on the Dahab coast, where there is a camel ride, a snorkelling stop and time by the water, and on into the town for lunch at a seaside restaurant.\n\nThere are two ways to book it: the day as it stands, or the same day with a quad ride between the mountains of the Red Canyon. The guide, the entry to the Three Pools area and bottled water are in the price; snorkelling equipment is not. Children have their own price.',
          highlights: [
            'Three hours at the Three Pools',
            'Salama Canyon by jeep, with a guided walk',
            'A camel ride and a snorkelling stop at the Three Pools',
            'Lunch at a seaside restaurant in Dahab',
          ],
          seo: {
            metaTitle: 'Three Pools: Three Pools and Red Canyon Day from Sharm',
            metaDescription: 'Eight to nine hours from Sharm El Sheikh: Salama Canyon by jeep, a camel ride and snorkelling at the Three Pools, and lunch by the sea in Dahab.',
          },
          images: [PHOTO.canyonCamel],
          imageAlts: [ALT.canyonCamel],
        },
      ],
    },
  ],
};
