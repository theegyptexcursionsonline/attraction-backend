/**
 * Batch B09, the network build queue (docs/NETWORK_BUILD_QUEUE.md in the storefront repository, sections 4 and 6.4,
 * read 28 October 2026). Eight new sites, in three groups:
 *
 * - B09A: Grand Egyptian Museum, Hurghada Boat Tour and Dive2Egypt (queue group 1).
 * - B09B: Marsa Alam Red Sea Egypt, Wadi El Gemal Reserve and Shaab Samadai.
 * - B09C: Bahria Oasis and Turtle Bay Hurghada, the two sites built on a network partner's trip. The client has not
 *   yet agreed to sell either partner's trip (queue 4.6), so these two stay out of the storefront's LIVE list and
 *   take no booking until it does.
 *
 * Every client trip is built on the record the client publishes on its own main site, read into the dated snapshot
 * (`network-sites/eeo-snapshot.json`) by `network-sites/eeo-reader.ts` on 28 October 2026; prices, child rates,
 * departures and inclusions are copied from that record at apply time and never typed here. The two partner trips
 * are read from the partner's live record the same way. No trip sells an extra the published record does not bind
 * to every option sold.
 *
 * Where a record says something the network never shows (a ranking, "expert", "authentic", a promised animal, a
 * line that holds only for an option or add-on the trip does not sell), the line is left out and, where the trip
 * needs it, replaced by the site's own words; each replacement says why next to it. Where a record's schedule is a
 * list of pickup areas, map codes or transfer legs, the site writes the day from the stops the record names.
 *
 * Held back, and why (each is a question for the client in the build report):
 * - Paradise Island yacht, Hula Hula snorkelling and water sports, Hula Hula yacht: the booking API prices the 09:00
 *   departure apart from its option (55 against 46.50 for an adult, and the same price for a child), so neither
 *   price can be sold until the client says which is right.
 * - Tawila Island day use and the Tondoba shore dive: no option includes hotel pickup.
 * - Orange Bay snorkelling and diving with massage: the record's length reads "$$69".
 * - From Hurghada: Cairo Pyramids, GEM and Citadel: the museum visit is an extra bound to no booking option.
 * - Marsa Alam quad and stargazing: no hotel pickup, and the stargazing photo is not of Egypt.
 * - The second semi-submarine record (`hurghada-panoramic-semi-submarine-cruise-with-snorkeling`), the second
 *   intro-dive record (`hurghada-beginner-intro-diving-experience-in-the-red-sea`) and the second Dolphin House
 *   yacht (`hurghada-dolphin-house-yacht-trip-with-snorkeling-lunch`): each sells the same day as a record already
 *   sold here, at the same times and within a few cents, so one of each pair is sold.
 *
 * Photos are the ones each record publishes, already on the network's Cloudinary; copying them into a network-b09
 * folder (as B08 did into network-b08) and each site's own photos are open questions, as are the logos: the
 * monogram public ids below are where the owner uploads them before --apply.
 */
import type { NetworkBatch, PriceSpec } from '../seed-network-sites';
import { PHOTO_C, PROGRAMMES_C } from './b08';

const EEO = 'egypt-excursions-online';
const DAY_TRIPS = 'day-trips';
const WATER = 'water-activities';
const ADVENTURE = 'adventure';

/** Said once, where every option sold prices children separately. */
const CHILD_NOTE = 'Children have their own price, and the booking applies it. The team confirms which ages count as children when it confirms your booking.';
/** Options whose child price equals the adult one publish no child price at all, so none is claimed. */
const SAME_PRICE = 'Children pay the same price as adults.';
/** Where the trip names no departure, the time is settled with the booking. */
const DAY_PICKUP = 'The trip is sold by the day; the team confirms your pickup time when it confirms your booking.';

const PICKUP_CAIRO = 'Hotel pickup and drop-off in Cairo or Giza';
const PICKUP_SHARM = 'Pickup and drop-off at your hotel in Sharm El Sheikh';
const PICKUP_HURGHADA = 'Pickup and drop-off at your hotel in Hurghada';
const PICKUP_DAHAB = 'Pickup and drop-off at your hotel in Dahab';
/** The client sells pickup from further out as add-ons no booking option carries, so it cannot be booked here. */
const FAR_HURGHADA = 'Pickup from outside Hurghada costs extra and cannot be booked on this site. Ask the team before you book if your hotel is further out.';
/** Dolphins are wild: a trip says where to look for them, never that you will see one or swim beside one. */
const WILD_DOLPHINS = 'Dolphins are wild animals, so no boat can promise a sighting, and swimming near them depends on the sea and on how many boats are there.';
/** The camel and horse rides price each pickup area as its own option. */
const BY_AREA = 'The price depends on where your hotel is: choose the option for your area.';

const pickupLegs = (town: string) => ({
  from: { title: 'Hotel pickup', description: `The car collects you from your hotel in ${town}.` },
  back: { title: 'Back to your hotel', description: `The car returns you to your hotel in ${town}.` },
});
const HRG = pickupLegs('Hurghada');

// ================================================================================================================
// B09A: Grand Egyptian Museum, Hurghada Boat Tour and Dive2Egypt.
// ================================================================================================================

const PROGRAMMES_A = {
  // ---- Grand Egyptian Museum ---------------------------------------------------------------------------------
  GEM_VISIT: {
    provider: 'eeo',
    tenant: EEO,
    source: 'vip-grand-egyptian-museum-experience-with-hotel-transfer',
    category: DAY_TRIPS,
    options: ['grand-egyptian-museum-with-hotel-pickup-b3deaaec07e2'],
    addons: [],
    departures: ['08:00'],
    rename: {
      // The record's option text is a list of notes, not a description of what is sold.
      'grand-egyptian-museum-with-hotel-pickup-b3deaaec07e2': {
        name: 'The museum with hotel pickup',
        description: 'Private transfers from your hotel in Cairo or Giza, the entry fees, a guide at the museum and a bottle of water.',
      },
    },
    childNote: CHILD_NOTE,
    // The transfer lines are said once, in the site's words; "guide on site" reads as a note.
    omit: { inclusions: ['All transfers by a private air-conditioned vehicle', 'Private transportation', 'guide on site'] },
    add: {
      // The option sold is named "With Hotel Pickup", and the record's schedule starts and ends in Giza.
      inclusions: [PICKUP_CAIRO, 'Private air-conditioned transport', 'A guide at the museum'],
      needToKnow: [
        // From the option's own notes.
        'The Grand Egyptian Museum is not yet fully open, so some galleries may be closed on the day.',
        'Your entry ticket is a separate ticket, sent to you directly.',
      ],
    },
    // The record's schedule is its transfer legs; the visit is written from the stops it names.
    itinerary: [
      { time: '08:00', title: 'Hotel pickup', duration: '1 hour', description: 'A private air-conditioned car collects you from your hotel in Cairo or Giza and drives to the museum.' },
      { title: 'The Grand Egyptian Museum', duration: '3 hours', description: 'Three hours in the galleries with the guide, the entry fees covered.' },
      { title: 'Back to your hotel', duration: '1 hour', description: 'The car returns you to your hotel in Cairo or Giza.' },
    ],
  },
  GEM_PYRAMIDS: {
    provider: 'eeo',
    tenant: EEO,
    source: 'giza-pyramids-sphinx-grand-egyptian-museum-private',
    category: DAY_TRIPS,
    // Only the private option carries the entry tickets (as B03's Giza site sells it); the sharing option publishes
    // "not include TKT" against a list that names them, and it leaves at another time.
    options: ['private-pyramids-of-giza-sphinx-gem-included--5a45eefa5360'],
    addons: [],
    departures: ['09:00'],
    departureLabels: { '09:00': 'Morning' },
    rename: {
      'private-pyramids-of-giza-sphinx-gem-included--5a45eefa5360': {
        name: 'Private day with the tickets included',
        description: 'Your own guide at the pyramids, the Sphinx and the Grand Egyptian Museum, with the tickets. Lunch is not included.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        // The long-range pickup add-on is bound to no option, so it cannot be booked here.
        'Pickup and drop-off in Cairo or Giza (long-range pickup also available as an add-on)',
        // The option sold says "Lunch not included", so the programme's line does not describe it.
        'Lunch at a restaurant',
      ],
    },
    add: {
      inclusions: [PICKUP_CAIRO],
      exclusions: ['Lunch'],
      needToKnow: ['Pickup from outside Cairo or Giza costs extra and cannot be booked on this site.'],
    },
    itinerary: [
      { time: '09:00', title: 'Hotel pickup', description: 'Pickup from your hotel in Cairo or Giza in an air-conditioned vehicle.' },
      { title: 'Pyramids of Giza', duration: '3 hours', description: 'A guided walk on the plateau with your own guide.' },
      { title: 'The Sphinx', duration: '1 hour', description: 'The Great Sphinx and the ground around it.' },
      { title: 'Break', duration: '1 hour', description: 'A break in Giza. Lunch is not included, so this is the hour to buy your own.' },
      { title: 'The Grand Egyptian Museum', duration: '3 hours', description: 'The museum with the guide, and time of your own among the galleries.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  GEM_FROM_SHARM: {
    provider: 'eeo',
    tenant: EEO,
    source: 'discover-cairo-from-sharm-el-sheikh-pyramids-sphinx-and-museum-day-tour',
    category: DAY_TRIPS,
    // The Grand Egyptian Museum option only (queue section 4); the record's other option visits the museum on
    // Tahrir Square instead.
    options: ['giza-pyramids-sphinx-grand-egyptian-museum-en-ddc5355863f0'],
    addons: [],
    departures: ['00:10'],
    departureLabels: { '00:10': 'Overnight start' },
    rename: {
      'giza-pyramids-sphinx-grand-egyptian-museum-en-ddc5355863f0': {
        name: 'Pyramids, Sphinx and the Grand Egyptian Museum',
        description: 'The coach from Sharm El Sheikh, an Egyptologist guide, lunch and the entrance fees for the Giza pyramids, the Sphinx and the Grand Egyptian Museum.',
      },
    },
    childNote: CHILD_NOTE,
    // The record names both museums in one line; the option sold carries the Grand Egyptian Museum ticket.
    omit: { inclusions: ['Entrance fees for the Giza Pyramids, the Sphinx, and the GEM or the Old Egyptian Museum (depending on the option you choose)'] },
    add: {
      inclusions: [PICKUP_SHARM, 'Entrance fees for the Giza pyramids, the Sphinx and the Grand Egyptian Museum'],
      needToKnow: ['The coach leaves Sharm El Sheikh just after midnight and returns late at night: the road to Cairo is long each way.'],
    },
    // The record's schedule visits both museums and an optional Nile boat, which this option does not include.
    itinerary: [
      { time: '00:10', title: 'Hotel pickup', description: 'The coach collects you from your hotel in Sharm El Sheikh in the middle of the night.' },
      { title: 'The road to Cairo', description: 'The long drive north across Sinai.' },
      { title: 'The Giza plateau', description: 'The pyramids and the Great Sphinx with an Egyptologist guide, the entrance fees covered.' },
      { title: 'Lunch', description: 'Lunch at a restaurant looking out at the pyramids.' },
      { title: 'The Grand Egyptian Museum', description: 'The museum with the guide, its entry ticket covered.' },
      { title: 'Back to Sharm El Sheikh', description: 'The drive back to your hotel.' },
    ],
  },
  GEM_TWO_DAYS: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-2-day-cairo-pyramids-gem-luxury-stay',
    category: DAY_TRIPS,
    options: ['day-1-giza-pyramids-gem-with-luxury-stay-flex-28f5307915a5'],
    addons: [],
    departures: ['01:30'],
    departureLabels: { '01:30': 'Overnight start' },
    rename: {
      'day-1-giza-pyramids-gem-with-luxury-stay-flex-28f5307915a5': {
        name: 'Two days: the pyramids, the museum and a night by the pyramids',
        description: 'Day one at the Giza pyramids, the Sphinx and the Grand Egyptian Museum, a night in an apartment looking at the pyramids, then free time in Cairo.',
      },
    },
    childNote: CHILD_NOTE,
    // The four visits for day two are add-ons bound to no booking option, so the record lists them "if add-on
    // selected" and none can be booked here.
    omit: {
      inclusions: [
        'Nile Dinner Cruise (if add-on selected)',
        'National Museum of Egyptian Civilization (if add-on selected)',
        'The Citadel of Saladin (if add-on selected)',
        'Saqqara, Memphis & Dahshur (if add-on selected)',
      ],
    },
    add: {
      inclusions: [PICKUP_SHARM],
      needToKnow: ['Day two is free time in Cairo. Extra visits for that day cannot be booked on this site; ask the team before you book.'],
    },
    itinerary: [
      { time: '01:30', title: 'Hotel pickup', description: 'The transfer collects you from your hotel in Sharm El Sheikh in the night for the drive to Cairo.' },
      { title: 'The Giza pyramids and the Sphinx', description: 'Day one starts on the plateau with an Egyptologist guide, the entrance fees covered.' },
      { title: 'The Grand Egyptian Museum', description: 'The museum with the guide, its entrance fee covered, and lunch.' },
      { title: 'A night by the pyramids', description: 'The night in an apartment with a view of the pyramids, and breakfast.' },
      { title: 'Free time in Cairo', description: 'Day two is yours to explore Cairo.' },
      { title: 'Back to Sharm El Sheikh', description: 'The transfer drives you back to your hotel.' },
    ],
  },

  // ---- Hurghada Boat Tour ------------------------------------------------------------------------------------
  HBT_DOLPHIN_MORNING: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-dolphin-house-morning-cruise-dolphin-swim',
    category: WATER,
    options: ['hurghada-dolphin-house-cruise-dolphin-swim-8b90321d0aa0'],
    addons: [],
    departures: ['08:30'],
    rename: {
      'hurghada-dolphin-house-cruise-dolphin-swim-8b90321d0aa0': {
        name: 'Morning cruise to Dolphin House',
        description: 'Breakfast on board, two forty-minute snorkelling and swimming sessions at the Dolphin House reef, drinks and the gear.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        'Pick-up and drop-off from Hurghada',
        'Long-range pickup from Makadi Bay, Safaga, El Gouna, Sahl Hasheesh, and the Soma Bay area is available as a product option',
        // "Common, but can't be guaranteed": the site says it its own way, once, in "Need to know".
        'Dolphin sightings are common, but can’t be guaranteed (wild animals)',
        'Swimming with dolphins depends on the weather and the number of boats in the area',
        // The line carries typesetting code ("2 \times").
        '2 \\times 40-minute snorkeling & swimming sessions',
        // Points to a section the network page does not have.
        'Please read the Know Before You Go section',
      ],
    },
    add: {
      inclusions: [PICKUP_HURGHADA, 'Two snorkelling and swimming sessions of forty minutes'],
      needToKnow: [WILD_DOLPHINS, FAR_HURGHADA],
    },
    // The record's schedule names the reef "Sataya", which is far to the south; the site names the stops it visits.
    itinerary: [
      { time: '08:30', ...HRG.from },
      { title: 'Out to Dolphin House', duration: '1 hour', description: 'The boat sails from Hurghada to the Dolphin House reef.' },
      { title: 'First session', duration: '40 minutes', description: 'Snorkelling at the reef, where dolphins often feed and rest.' },
      { title: 'Breakfast on board', duration: '20 minutes', description: 'Breakfast with tea, coffee and soft drinks.' },
      { title: 'Second session', duration: '40 minutes', description: 'Swimming and snorkelling at the reef, with a guide for non-swimmers.' },
      { title: 'Back to Hurghada', duration: '1 hour', description: 'The sail back to the marina, and the car to your hotel.' },
    ],
  },
  HBT_DOLPHIN_SPEEDBOAT: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-dolphin-house-speedboat-trip-dolphin-swim',
    category: WATER,
    options: ['hurghada-dolphin-house-speedboat-trip-dolphin-00c7455b2b05'],
    addons: [],
    departures: ['08:30'],
    rename: {
      // The option's own text says only "Choose this option to join a small-group tour."
      'hurghada-dolphin-house-speedboat-trip-dolphin-00c7455b2b05': {
        name: 'Speedboat to Dolphin House',
        description: 'Two snorkelling and swimming stops at Dolphin House by speedboat, with the gear, water, soft drinks and fruit.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        'Pick-up and drop-off from Hurghada (see Know Before You Go for details)',
        'Long-range pickup from Makadi Bay, Safaga, El Gouna, Sahl Hasheesh, and the Soma Bay area is available as a product option',
      ],
    },
    add: { inclusions: [PICKUP_HURGHADA], needToKnow: [WILD_DOLPHINS, FAR_HURGHADA] },
    itinerary: [
      { time: '08:30', ...HRG.from },
      { title: 'By speedboat to Dolphin House', duration: '1 hour', description: 'The speedboat runs out to the reef, with shade on board.' },
      { title: 'Dolphin House', duration: '1.5 hours', description: 'Two guided snorkelling and swimming stops at the reef, where dolphins often feed and rest.' },
      { title: 'Back to Hurghada', duration: '1 hour', description: 'The speedboat returns to the marina, and the car takes you back to your hotel.' },
    ],
  },
  HBT_DOLPHIN_YACHT: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-dolphin-house-yacht-cruise-with-dolphin-swim-lunch',
    category: WATER,
    options: ['hurghada-dolphin-house-yacht-cruise-with-snor-de457a266747'],
    // The record's extras are bound to no booking option.
    addons: [],
    departures: ['08:30', '14:30'],
    rename: {
      'hurghada-dolphin-house-yacht-cruise-with-snor-de457a266747': {
        name: 'Yacht to Dolphin House with a seafood lunch',
        description: 'Five hours on a yacht: dolphin watching and swimming at Dolphin House, two snorkelling stops, a breakfast buffet and a seafood lunch.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      // "Expert crew": the site's own line says what the record backs.
      inclusions: ['Pick-up and drop-off from Hurghada (see Know Before You Go for details)', 'Expert crew and guide assistance'],
      // Both are add-ons the option does not carry.
      exclusions: [
        'Water activities: banana ride 5min & sofa ride 5min (availabile as an add-on)',
        'Long-range pickup from Makadi, Safaga, El Gouna, Sahl Hasheesh, and Soma Bay (available as an add-on)',
      ],
    },
    add: {
      inclusions: [PICKUP_HURGHADA, 'The crew’s help through the day'],
      exclusions: ['Banana and sofa rides'],
      needToKnow: [WILD_DOLPHINS, FAR_HURGHADA],
    },
    // The record's schedule opens and closes with lists of pickup areas.
    itinerary: [
      HRG.from,
      { title: 'Dolphin House', duration: '1 hour', description: 'Dolphin watching and a swim at the reef, where dolphins often feed and rest.' },
      { title: 'Snorkelling at Dolphin House', duration: '30 minutes', description: 'A guided snorkelling stop on the reef.' },
      { title: 'The small reef', duration: '30 minutes', description: 'A second snorkelling stop nearby.' },
      { title: 'Lunch on board', description: 'A seafood lunch, with hot and soft drinks.' },
      { title: 'Back to Hurghada', description: 'The yacht returns to the marina, and the car takes you back to your hotel.' },
    ],
  },
  HBT_HULA_SPEEDBOAT: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-hula-hula-island-speedboat-tour-with-snorkeling',
    category: WATER,
    options: ['4-hour-hula-hula-island-speedboat-tour-from-h-6967a6687074'],
    addons: [],
    departures: ['09:00', '13:00'],
    // The record's length ("4 - 6 hours") covers options this trip does not sell; the option sold is four hours.
    duration: '4 hours',
    rename: {
      // The option's text names a massage no inclusion carries.
      '4-hour-hula-hula-island-speedboat-tour-from-h-6967a6687074': {
        name: 'Four hours by speedboat to Hula Hula Island',
        description: 'Pickup from your hotel in Hurghada, the speedboat, the island ticket, a guided snorkelling stop, beach time and lunch.',
      },
    },
    // Each line holds for the four-hour option sold; the record writes them for several lengths.
    omit: {
      inclusions: [
        'Hotel pickup and drop-off (if option selected)',
        'Hula Hula entry ticket (included for 4-hour and 5-hour options)',
        'Fruits and soft drinks (included in 4-hour and 5-hour options)',
      ],
    },
    add: {
      inclusions: [PICKUP_HURGHADA, 'The Hula Hula Island entry ticket', 'Fruit and soft drinks'],
      needToKnow: [SAME_PRICE],
    },
    itinerary: [
      { ...HRG.from, duration: '1 hour' },
      { title: 'By speedboat', duration: '20 minutes', description: 'The speedboat crosses to Hula Hula Island.' },
      { title: 'Hula Hula Island', description: 'A guided snorkelling stop with the gear and life jackets, free time on the beach, and lunch.' },
      { title: 'Back to your hotel', duration: '1 hour', description: 'The speedboat returns, and the car takes you back to your hotel in Hurghada.' },
    ],
  },
  HBT_CATAMARAN: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-luxury-catamaran-semi-submarine-island-sunset',
    category: WATER,
    options: ['luxury-catamaran-semi-submarine-island-and-su-f706641a1aaa'],
    // The transfer and parasailing extras are priced for other pickup areas or bound to the option as transfers.
    addons: [],
    departures: ['10:00'],
    rename: {
      'luxury-catamaran-semi-submarine-island-and-su-f706641a1aaa': {
        name: 'Catamaran day with the semi-submarine',
        description: 'Hotel pickup in Hurghada, a catamaran with a pool, a snorkelling stop, two hours on an island, forty-five minutes of underwater views and a buffet lunch.',
      },
    },
    childNote: CHILD_NOTE,
    // The exclusions are the record's list of other pickup areas, split mid-sentence.
    omit: { exclusions: ['Makadi', 'Sahl Hasheesh', 'El Gouna Safaga', 'Soma Bay transfer Extras requested by customer'] },
    add: { exclusions: ['Pickup from outside Hurghada'], needToKnow: [FAR_HURGHADA] },
    itinerary: [
      { time: '10:00', ...HRG.from },
      { title: 'On the catamaran', description: 'The catamaran sails out, with a pool on board and music.' },
      { title: 'Snorkelling stop', description: 'A guided stop with the gear and life jackets.' },
      { title: 'The island', duration: '2 hours', description: 'Two hours on an island, the entry fees covered.' },
      { title: 'Underwater views', duration: '45 minutes', description: 'Forty-five minutes looking out at the reef from below the waterline.' },
      { title: 'Lunch and the sail back', description: 'An open buffet lunch on board with soft drinks, then the sail back to the marina and the car to your hotel.' },
    ],
  },
  HBT_ORANGE_MASSAGE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-luxury-orange-bay-cruise-with-snorkeling-massage-lunch',
    category: WATER,
    options: ['hurghada-hotel-pickup-return-luxury-cruise-16d1ffa32338'],
    addons: [],
    departures: ['07:30'],
    rename: {
      'hurghada-hotel-pickup-return-luxury-cruise-16d1ffa32338': {
        name: 'Orange Bay cruise with a massage',
        description: 'Hotel pickup in Hurghada, a snorkelling stop with the gear, Orange Bay, an open buffet, drinks and one massage for each guest.',
      },
    },
    childNote: CHILD_NOTE,
    // The record marks every stop after Orange Bay "Optional", without saying who chooses; the day is written
    // from the stops its inclusions name.
    itinerary: [
      { time: '07:30', ...HRG.from, duration: '30 minutes' },
      { title: 'Out to sea', duration: '45 minutes', description: 'The boat leaves the marina.' },
      { title: 'Orange Bay', duration: '75 minutes', description: 'Time on the white beach of Orange Bay Island.' },
      { title: 'Snorkelling stop', duration: '45 minutes', description: 'Snorkelling with the gear and life jackets, with the guide.' },
      { title: 'Lunch and a massage', description: 'An open buffet with salads and fruit, unlimited drinks and snacks, and one massage for each guest.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The boat returns to the marina and the car takes you back to your hotel.' },
    ],
  },
  HBT_INTRO_DIVE_YACHT: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-luxury-red-sea-diving-snorkeling-island-lunch',
    category: WATER,
    options: ['tour-from-hurghada-32f15f6b5aaf'],
    addons: [],
    departures: ['07:30'],
    rename: {
      'tour-from-hurghada-32f15f6b5aaf': {
        name: 'Yacht day with an introductory dive',
        description: 'A short introductory dive with the gear, snorkelling, Orange Bay, an open buffet lunch, drinks and a massage for each guest.',
      },
    },
    childNote: CHILD_NOTE,
    // The two transfer legs are said once, in the site's words.
    omit: { inclusions: ['Transfer from Hotel', 'Transfer back to the Hotel'] },
    add: { inclusions: [PICKUP_HURGHADA] },
    itinerary: [
      { time: '07:30', ...HRG.from },
      { title: 'Out to Orange Bay', duration: '45 minutes', description: 'The yacht sails from Hurghada.' },
      { title: 'Orange Bay', duration: '75 minutes', description: 'Time on the beach of Orange Bay Island.' },
      { title: 'Introductory dive', description: 'A short first dive of ten to fifteen minutes for each guest, with an instructor and the equipment. No certificate is needed.' },
      { title: 'Lunch and snorkelling', description: 'An open buffet lunch on board, then a snorkelling stop with the gear.' },
      { title: 'Back to your hotel', duration: '45 minutes', description: 'The yacht returns to Hurghada and the car takes you back to your hotel.' },
    ],
  },
  HBT_ORANGE_YACHT: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-orange-bay-yacht-cruise-with-snorkeling-breakfast-lunch-drinks',
    category: WATER,
    options: ['5-hour-orange-bay-trip-with-breakfast-c611b52197e1', '8-hour-orange-bay-trip-with-breakfast-lunch-5ca8942ae903'],
    addons: [],
    departures: ['08:30'],
    // The record types the programme's length as "5 - 8 hours".
    duration: '5 to 8 hours',
    rename: {
      '5-hour-orange-bay-trip-with-breakfast-c611b52197e1': {
        name: 'Five hours with breakfast',
        description: 'A breakfast buffet, one snorkelling stop and an hour at Orange Bay, with drinks and fruit.',
      },
      '8-hour-orange-bay-trip-with-breakfast-lunch-5ca8942ae903': {
        name: 'Eight hours with breakfast and lunch',
        description: 'Breakfast and lunch, two snorkelling stops and two hours at Orange Bay, with drinks and fruit.',
      },
    },
    childNote: CHILD_NOTE,
    // The record writes its two lengths as headings and "5h Tour:"/"8h Tour:" lines; the site says the same once.
    omit: {
      inclusions: [
        'Pick-up and drop-off from Hurghada (see Know Before You Go for details)',
        'Food & Drinks',
        '5h Tour: Breakfast buffet',
        '8h Tour: Breakfast + Lunch',
        'Activities',
        '5h Tour: 45-min snorkeling stop',
        '8h Tour: 2 snorkeling stops',
        '1 hour at Orange Bay Island (white sand beaches & turquoise waters)',
      ],
      exclusions: ['Long-range pickup from Makadi, Safaga, El Gouna, Sahl Hasheesh, and Soma Bay (available as an add-on)'],
    },
    add: {
      inclusions: [
        PICKUP_HURGHADA,
        'A breakfast buffet, and lunch on the eight-hour trip',
        'One snorkelling stop on the five-hour trip, two on the eight-hour trip',
        'Time at Orange Bay Island',
      ],
      needToKnow: [FAR_HURGHADA],
    },
    itinerary: [
      { time: '08:30', ...HRG.from, duration: '25 minutes' },
      { title: 'Breakfast on board', description: 'A breakfast buffet as the yacht sails out.' },
      { title: 'Snorkelling', description: 'One stop on the five-hour trip and two on the eight-hour trip, with the gear and a guide for non-swimmers.' },
      { title: 'Orange Bay', description: 'One hour on the island on the five-hour trip, two on the eight-hour trip, with lunch on the longer day.' },
      { title: 'Back to your hotel', duration: '25 minutes', description: 'The yacht returns to the marina and the car takes you back to your hotel.' },
    ],
  },
  HBT_SEMI_SUBMARINE: {
    provider: 'eeo',
    tenant: EEO,
    // Of the client's two semi-submarine records, this one is sold: the other publishes the same option, at the
    // same price and the same two departures.
    source: 'hurghada-panoramic-semi-submarine-cruise-snorkeling',
    category: WATER,
    options: ['hurghada-panoramic-semi-submarine-cruise-with-93680a2ef1f6'],
    addons: [],
    departures: ['09:00', '15:00'],
    rename: {
      'hurghada-panoramic-semi-submarine-cruise-with-93680a2ef1f6': {
        name: 'Semi-submarine and snorkelling',
        description: 'Underwater views from about five metres below the surface, a snorkelling stop with the gear, a soft drink and water.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: ['Hotel pick-up and drop-off', 'Submarine trip'],
      exclusions: ['Transfer from El Gouna Hotels (available for an extra fee)'],
    },
    add: {
      inclusions: [PICKUP_HURGHADA, 'The semi-submarine trip'],
      needToKnow: [FAR_HURGHADA],
    },
    itinerary: [
      { ...HRG.from, duration: '45 minutes' },
      { title: 'Hurghada Marina', description: 'Boarding the semi-submarine, with all the entry tickets covered.' },
      { title: 'Below the waterline', description: 'The reef and its fish through the windows of the hull, about five metres down.' },
      { title: 'Snorkelling stop', description: 'A stop to snorkel with the gear.' },
      { title: 'Back to your hotel', duration: '45 minutes', description: 'The coach takes you back to your hotel in Hurghada.' },
    ],
  },
  HBT_BANANA: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-red-sea-water-sports-twister-snorkeling',
    category: WATER,
    options: ['banana-boat-sofa-ride-d1d8b4d9b644'],
    addons: [],
    departures: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'],
    // The record types the programme's length as "2 - 5 hours".
    duration: '2 to 5 hours',
    rename: {
      'banana-boat-sofa-ride-d1d8b4d9b644': {
        name: 'Banana boat and sofa ride',
        description: 'Fifteen minutes on a banana boat, then fifteen minutes on the sofa ride, with life jackets and a bottle of water.',
      },
    },
    childNote: CHILD_NOTE,
    // The option sold is the two rides; every other line belongs to another option or to an add-on.
    omit: {
      inclusions: [
        'Pick-up and drop-off from Hurghada (see Know Before You Go for details)',
        '15 mins Tube ride',
        '1 stop snorkeling (if option selected)',
        'Snorkeling equipment',
        'Guide snorkeling',
        'Speedboat ride (if option selected)',
        'Search with dolphins (if add on selected )',
        'Speedboat cruise (if add on selected )',
        'Lunch in hotel (if add on selected )',
      ],
      exclusions: ['Long-range pickup from Makadi, Safaga, El Gouna, Sahl Hasheesh, and the Soma Bay (available as an add-on)'],
    },
    add: {
      inclusions: [PICKUP_HURGHADA, '15 minutes on the sofa ride'],
      exclusions: ['Snorkelling', 'Lunch'],
      needToKnow: [FAR_HURGHADA],
    },
    itinerary: [
      { ...HRG.from, duration: '30 minutes' },
      { title: 'Banana boat', duration: '15 minutes', description: 'Fifteen minutes on the banana boat, in a life jacket.' },
      { title: 'Sofa ride', duration: '15 minutes', description: 'Fifteen minutes on the sofa ride behind the boat.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The car takes you back to your hotel in Hurghada.' },
    ],
  },
  HBT_DOLPHIN_WATCH: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-speedboat-dolphin-watching-snorkeling-2-islands',
    category: WATER,
    // The option without the islands: the record's title names two, and this option visits neither.
    options: ['group-dolphin-watching-swimming-without-islan-06f657cf3e48'],
    addons: [],
    departures: ['08:30', '13:00'],
    rename: {
      'group-dolphin-watching-swimming-without-islan-06f657cf3e48': {
        name: 'Dolphin watching by speedboat, without the islands',
        description: 'A speedboat out to look for dolphins, two or three snorkelling stops, the gear, drinks and fruit. No island visit.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        'Pick-up and drop-off from Hurghada (see Know Before You Go for details)',
        'Long-distance pickup from Makadi Bay, Safaga, El Gouna, Sahl Hasheesh, and Soma Bay (extra fee - add at checkout)',
        'Water sports Banana § Sofa (if option selected)',
      ],
      exclusions: ['The long-range pickup service from Makadi, Safaga, El Gouna, Sahl Hasheesh, and the Soma bay area’s is available to book in the checkout process as "add on"'],
    },
    add: {
      inclusions: [PICKUP_HURGHADA],
      needToKnow: [WILD_DOLPHINS, FAR_HURGHADA, 'This option does not stop at an island.'],
    },
    // The record's schedule visits islands this option does not.
    itinerary: [
      { ...HRG.from, duration: '20 minutes' },
      { title: 'Out by speedboat', description: 'The speedboat leaves the marina, with shade and music on board.' },
      { title: 'Dolphin watching', description: 'The captain looks for dolphins; if they are there and the sea allows, you can swim near them.' },
      { title: 'Snorkelling stops', description: 'Two or three guided snorkelling stops with the gear and life jackets.' },
      { title: 'Back to your hotel', duration: '20 minutes', description: 'The speedboat returns and the car takes you back to your hotel.' },
    ],
  },
  HBT_SPEEDBOAT_SNORKEL: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-speedboat-snorkeling-trip-with-hotel-pickup',
    category: WATER,
    options: ['hurghada-small-group-snorkeling-speedboat-tou-cbf8ee280392'],
    addons: [],
    departures: ['08:00', '13:00'],
    rename: {
      // The option's text promises a group size the network cannot back.
      'hurghada-small-group-snorkeling-speedboat-tou-cbf8ee280392': {
        name: 'Speedboat snorkelling trip',
        description: 'A speedboat from Hurghada with snorkelling, the gear, a guide, fruit and drinks, and the nature reserve fees.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: ['Pick-up and drop-off from Hurghada (see Know Before You Go for details)'],
      exclusions: ['The long-range pickup service from Makadi, Safaga, El Gouna, Sahl Hasheesh, and the Soma bay area’s is available to book in the checkout process as "add on"'],
    },
    add: { inclusions: [PICKUP_HURGHADA], needToKnow: [FAR_HURGHADA] },
    // The record publishes no schedule.
    itinerary: [
      HRG.from,
      { title: 'Out by speedboat', description: 'The speedboat leaves the marina, with shade and music on board.' },
      { title: 'Snorkelling', description: 'Snorkelling with the guide, the gear and life jackets, with fruit and drinks between stops.' },
      HRG.back,
    ],
  },
  HBT_SIX_ISLANDS: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-speedboat-trip-to-6-islands-with-dolphin-watching-snorkeling',
    category: WATER,
    options: ['6-island-small-group-tour-with-dolphin-watchi-277b7487db82'],
    addons: [],
    departures: ['08:30'],
    rename: {
      '6-island-small-group-tour-with-dolphin-watchi-277b7487db82': {
        name: 'Six islands by speedboat',
        description: 'Dolphin watching, three snorkelling stops including a wreck, and the island entrance fees, with drinks and fruit.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        'Pick-up and drop-off from Hurghada (see Know Before You Go for details)',
        'Pickup from Makadi, Safaga, El Gouna, Sahl Hasheesh, and Soma Bay (if add-on selected)',
        '5-minute parasailing (if add-on selected)',
        'Lunch on the island (if add-on selected)',
      ],
      exclusions: [
        'The long-range pickup service from Makadi, Safaga, El Gouna, Sahl Hasheesh, and the Soma bay areaâ\u0080\u0099s is available to book in the checkout process as "Add on"',
        'and it cost 10 euro per person.',
      ],
    },
    add: {
      inclusions: [PICKUP_HURGHADA],
      exclusions: ['Lunch'],
      needToKnow: [WILD_DOLPHINS, FAR_HURGHADA],
    },
    itinerary: [
      { time: '08:30', ...HRG.from, duration: '20 minutes' },
      { title: 'Giftun', duration: '2 hours', description: 'Dolphin watching and snorkelling in the Giftun National Park area.' },
      { title: 'Nemo Bay', duration: '1 hour', description: 'A stop at the island.' },
      { title: 'Orange Bay', duration: '1 hour', description: 'Time on the beach, the entrance fee covered.' },
      { title: 'Magawish Island', duration: '1 hour', description: 'Swimming and snorkelling, the entrance fee covered.' },
      { title: 'Wreck snorkelling and Abu Minqar', duration: '1 hour', description: 'A snorkelling stop at a wreck, then a stop at Abu Minqar Island.' },
      { title: 'Back to your hotel', duration: '25 minutes', description: 'The speedboat returns and the car takes you back to your hotel.' },
    ],
  },
  HBT_THREE_ISLANDS: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-yacht-cruise-to-orange-bay-giftun-magawish-with-dolphins',
    category: WATER,
    options: ['hurghada-3-island-yacht-adventure-with-dolphi-324f544a94cc'],
    addons: [],
    departures: ['08:30'],
    // The record types the length as "Duration 8 hours".
    duration: '8 hours',
    rename: {
      'hurghada-3-island-yacht-adventure-with-dolphi-324f544a94cc': {
        name: 'Three islands by yacht',
        description: 'Orange Bay, Giftun and Magawish with their fees, two snorkelling stops, breakfast, a seafood lunch and drinks.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: ['Pick-up and drop-off from Hurghada (see Know Before You Go for details)'],
      exclusions: ['Long-range pickup from Makadi, Safaga, El Gouna, Sahl Hasheesh, and the Soma Bay (available as an add-on)'],
    },
    add: { inclusions: [PICKUP_HURGHADA], needToKnow: [WILD_DOLPHINS, FAR_HURGHADA] },
    itinerary: [
      { time: '08:30', ...HRG.from },
      { title: 'Breakfast on board', description: 'Breakfast as the yacht sails out, keeping a look out for dolphins.' },
      { title: 'Orange Bay', duration: '1 hour', description: 'Swimming and time on the beach.' },
      { title: 'Giftun Island', duration: '40 minutes', description: 'Swimming and snorkelling in the nature reserve.' },
      { title: 'Magawish Island', duration: '1 hour', description: 'Swimming and snorkelling, then a seafood lunch on board.' },
      HRG.back,
    ],
  },
  HBT_ORANGE_DIVE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'makadi-bay-snorkeling-and-diving-at-orange-bay',
    category: WATER,
    // The Hurghada option: "This option includes pickup and drop-off in Hurghada".
    options: ['tour-from-hurghada-5a8a06dd2db1'],
    addons: [],
    departures: ['07:30'],
    rename: {
      'tour-from-hurghada-5a8a06dd2db1': {
        name: 'Snorkelling and diving day to Orange Bay',
        description: 'Pickup in Hurghada, snorkelling by boat with the gear, a dive with the equipment, Orange Bay and an open buffet lunch.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Roundtrip transfers'] },
    add: { inclusions: [PICKUP_HURGHADA] },
    // The record marks most stops "Optional" without saying who chooses; the day is written from its inclusions.
    itinerary: [
      { time: '07:30', ...HRG.from },
      { title: 'Out to Giftun', duration: '45 minutes', description: 'The boat sails from the marina.' },
      { title: 'Orange Bay', duration: '75 minutes', description: 'A stop at Orange Bay Island.' },
      { title: 'Snorkelling and a dive', description: 'Snorkelling with the gear, and a scuba dive with the diving equipment.' },
      { title: 'Lunch on board', duration: '45 minutes', description: 'An open buffet lunch with soft and hot drinks.' },
      { title: 'Back to your hotel', duration: '45 minutes', description: 'The boat returns and the car takes you back to your hotel.' },
    ],
  },
  HBT_ORANGE_LUNCH: {
    provider: 'eeo',
    tenant: EEO,
    source: 'orange-island-premium-cruise-from-hurghada-with-lunch-transfer',
    category: WATER,
    options: ['premium-hurghada-orange-island-cruise-with-lu-39540c37238c'],
    addons: [],
    departures: ['08:00'],
    rename: {
      'premium-hurghada-orange-island-cruise-with-lu-39540c37238c': {
        name: 'Orange Bay cruise with lunch',
        description: 'Two snorkelling stops with the gear, the entry to Orange Bay, a buffet lunch and drinks on board.',
      },
    },
    childNote: CHILD_NOTE,
    // The lunch line is split in two halfway through its list.
    omit: { inclusions: ['Buffet lunch ( French Fries , Spaghetti , Rice', 'Oven Roasted Potato , Chicken Nuggets and Kofta)'] },
    add: { inclusions: ['A buffet lunch of chips, spaghetti, rice, roast potatoes, chicken nuggets and kofta'] },
    itinerary: [
      { time: '08:00', ...HRG.from, duration: '30 minutes' },
      { title: 'Out to sea', description: 'The boat sails out for the first snorkelling stop.' },
      { title: 'Orange Bay', duration: '2 hours', description: 'Time on the island with the guide, the entry covered.' },
      { title: 'Lunch and the second stop', description: 'The buffet lunch on board and a second snorkelling stop.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The boat returns and the coach takes you back to your hotel.' },
    ],
  },
  HBT_SUNSET: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sunset-yacht-and-snorkeling-cruise-in-hurghada-5-hour-excursion',
    category: WATER,
    options: ['5-hour-sunset-yacht-and-snorkeling-trip-from--35ee79105ac6'],
    addons: [],
    departures: ['15:30'],
    rename: {
      '5-hour-sunset-yacht-and-snorkeling-trip-from--35ee79105ac6': {
        name: 'Afternoon yacht and snorkelling',
        description: 'Three hours on the water, forty minutes of snorkelling, a fish and chips meal and unlimited drinks.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        'Pick-up and drop-off from Hurghada',
        'Long-range pickup from Makadi Bay, Safaga, El Gouna, Sahl Hasheesh, and the Soma Bay area is available as a product option',
        'Please read the "Know Before You Go" section',
        'Clamari, Fish & chips meal',
      ],
    },
    add: {
      inclusions: [PICKUP_HURGHADA, 'Calamari, fish and chips'],
      needToKnow: [FAR_HURGHADA],
    },
    itinerary: [
      { time: '15:30', ...HRG.from },
      { title: 'Sailing', duration: '1.5 hours', description: 'The yacht sails out along the coast.' },
      { title: 'Snorkelling at Giftun', duration: '40 minutes', description: 'A snorkelling session with the gear, and a guide for non-swimmers.' },
      { title: 'Sailing back', duration: '1.5 hours', description: 'Calamari, fish and chips on board as the yacht returns towards evening.' },
      HRG.back,
    ],
  },

  // ---- Dive2Egypt --------------------------------------------------------------------------------------------
  D2E_DAHAB_FIRST_DIVE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'beginner-scuba-diving-experience-at-dahab-lighthouse-reef-with-transfer-photos',
    category: WATER,
    options: ['dahab-lighthouse-beginner-scuba-dive-with-pho-2b6608032ddd'],
    addons: [],
    departures: ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'],
    rename: {
      'dahab-lighthouse-beginner-scuba-dive-with-pho-2b6608032ddd': {
        name: 'First dive at the Lighthouse Reef',
        description: 'A briefing, a shallow-water practice and a guided dive of forty to fifty minutes, with the equipment, photos of your dive and the transfer.',
      },
    },
    childNote: CHILD_NOTE,
    add: {
      // The option sold is named "with Photos & Transfer"; the record's inclusions name neither.
      inclusions: [PICKUP_DAHAB, 'Photos of your dive'],
      needToKnow: ['No diving experience is needed: the instructor teaches the basics before the dive.'],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'The transfer collects you from your hotel in Dahab and drives to the Lighthouse Reef.' },
      { title: 'Briefing', description: 'An introductory scuba briefing with your instructor.' },
      { title: 'Practice in the shallows', description: 'A practice session in shallow water with the full equipment.' },
      { title: 'The dive', duration: '40 to 50 minutes', description: 'A guided dive on the reef with the instructor, who takes photos of your dive.' },
      { title: 'Back to your hotel', description: 'The transfer returns you to your hotel in Dahab.' },
    ],
  },
  D2E_GOUNA_TWO_TANK: {
    provider: 'eeo',
    tenant: EEO,
    source: 'el-gouna-2-tank-guided-boat-dives-for-certified-divers',
    category: WATER,
    options: ['bring-your-own-scuba-equipment-c6f9b7889912', 'including-scuba-equipment-3f641511932b'],
    addons: [],
    departures: ['08:00'],
    rename: {
      'bring-your-own-scuba-equipment-c6f9b7889912': {
        name: 'Two boat dives with your own equipment',
        description: 'Two guided dives from the boat for certified divers. Tanks and weights are included; bring your own scuba set.',
      },
      'including-scuba-equipment-3f641511932b': {
        name: 'Two boat dives with the equipment included',
        description: 'The same two dives with a full rental set: BCD, regulator, mask, fins, tanks and weights.',
      },
    },
    childNote: CHILD_NOTE,
    // The rental line holds for one option only, and "Small groups" is a group size the network cannot back.
    omit: { inclusions: ['Full scuba equipment rental (if option selected)', 'Small groups'] },
    add: {
      needToKnow: [
        'This trip is for certified divers: bring your certification card and your dive log.',
        'The rental equipment comes with the option that names it.',
      ],
    },
    itinerary: [
      { time: '08:00', title: 'Hotel pickup', description: 'The car collects you from your hotel in El Gouna and drives to the harbour.' },
      { title: 'On board', description: 'You board the dive boat and set up your gear on the way out.' },
      { title: 'First dive', description: 'A site briefing, then the first guided dive.' },
      { title: 'Surface interval', description: 'Time on deck as the boat moves to the second site. Lunch is not included.' },
      { title: 'Second dive', description: 'A briefing and the second guided dive at a new site.' },
      { title: 'Back to your hotel', description: 'The boat returns to the harbour and the car takes you back to your hotel.' },
    ],
  },
  D2E_RAS_MOHAMED_DIVES: {
    provider: 'eeo',
    tenant: EEO,
    source: 'harm-el-sheikh-discover-ras-mohamed-white-island-underwater',
    category: WATER,
    options: ['white-island-ras-mohamed-diving-snorkeling-al-15134d8d20f7', 'pro-diving-for-certified-divers-all-equipment-66a4df2b374a'],
    addons: [],
    departures: ['08:00'],
    rename: {
      // The record's option text calls the day "unforgettable".
      'white-island-ras-mohamed-diving-snorkeling-al-15134d8d20f7': {
        name: 'One introductory dive with snorkelling',
        description: 'An introductory dive, snorkelling at Ras Mohamed and White Island, the diving and snorkelling equipment and the park entry.',
      },
      'pro-diving-for-certified-divers-all-equipment-66a4df2b374a': {
        name: 'Two dives for certified divers',
        description: 'Two dives with standard air tanks and the full gear except a computer, the entrance fees, lunch and drinks. For divers with a valid certification.',
      },
    },
    childNote: CHILD_NOTE,
    // "VIP" is a claim, and the "(if selected)" lines are the record's options written as conditions; the two
    // options sold carry the park entry and the equipment in their own words.
    omit: {
      inclusions: [
        'Pick-up and drop-off from your hotel',
        'Full-day, 7-hour VIP boat trip',
        'Entrance ticket to Ras Mohamed National Park (if selected)',
        'Marina entrance fees (if selected)',
        'Introductory scuba diving ages 10â\u0080\u009350 (if selected)',
        'Snorkeling equipment rental (if selected)',
        'Professional deep diving for certified divers (if selected)',
      ],
    },
    add: {
      inclusions: [PICKUP_SHARM, 'A seven-hour boat day', 'The Ras Mohamed National Park entry', 'Diving and snorkelling equipment'],
      needToKnow: [
        'The introductory dive is for guests aged ten to fifty.',
        'The two-dive option is for certified divers only: bring your certification card.',
      ],
    },
    itinerary: [
      { time: '08:00', title: 'Hotel pickup', description: 'The coach collects you from your hotel in Sharm El Sheikh and drives to the marina.' },
      { title: 'Ras Mohamed', description: 'The boat cruises into the national park for the dive.' },
      { title: 'White Island', description: 'A stop to swim and walk on the sandbank.' },
      { title: 'Snorkelling at Ras Mohamed', description: 'A guided snorkelling stop on the park’s reefs.' },
      { title: 'Lunch on board', description: 'A buffet lunch with soft drinks, tea and coffee.' },
      { title: 'Back to your hotel', description: 'The boat returns to the marina and the coach takes you back to your hotel.' },
    ],
  },
  D2E_HURGHADA_INTRO: {
    provider: 'eeo',
    tenant: EEO,
    // Of the client's two Hurghada intro-dive records, this one is sold: the other publishes the same day at the
    // same price and departure.
    source: 'hurghada-beginner-intro-diving-tour-with-2-dives-lunch',
    category: WATER,
    options: ['intro-diving-beginner-and-discover-red-sea-un-3ebafa4f7718'],
    addons: [],
    departures: ['08:00'],
    rename: {
      'intro-diving-beginner-and-discover-red-sea-un-3ebafa4f7718': {
        name: 'Two introductory dives with lunch',
        description: 'Two beginner dives with an instructor, the scuba equipment, lunch on board and tea or coffee.',
      },
    },
    childNote: CHILD_NOTE,
    add: {
      // The record charges only for transfers "from outside Hurghada", and its schedule starts at Hurghada hotels.
      inclusions: [PICKUP_HURGHADA],
      needToKnow: ['No diving experience is needed: the instructor teaches the basics before each dive.'],
    },
    itinerary: [
      { time: '08:00', ...HRG.from, duration: '30 minutes' },
      { title: 'First dive', duration: '20 minutes', description: 'A beginner dive with the instructor, after a briefing.' },
      { title: 'Lunch on board', duration: '45 minutes', description: 'Lunch with tea or coffee, and time to snorkel.' },
      { title: 'Second dive', duration: '20 minutes', description: 'A second beginner dive at another site.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The boat returns and the coach takes you back to your hotel.' },
    ],
  },
  D2E_MAKADI_DIVES: {
    provider: 'eeo',
    tenant: EEO,
    source: 'makadi-bay-full-day-red-sea-diving-cruise-with-lunch',
    category: WATER,
    options: ['makadi-bay-red-sea-scuba-diving-boat-trip-wit-8d74c0cf242d'],
    addons: [],
    departures: ['07:45'],
    rename: {
      // The option's text sends you diving "alongside expert guides".
      'makadi-bay-red-sea-scuba-diving-boat-trip-wit-8d74c0cf242d': {
        name: 'Two guided dives from Makadi Bay',
        description: 'A full day on a diving boat: two guided dives with the full equipment, a buffet lunch and soft drinks.',
      },
    },
    childNote: CHILD_NOTE,
    // The line names towns the site does not collect from, and reads as two words run together.
    omit: { exclusions: ['Transportation from El Gouna or Sahl Hasheeshare only add-ons'] },
    add: {
      exclusions: ['Pickup from outside Makadi Bay'],
      needToKnow: ['Ask the team before you book whether these dives suit your level and whether you need a diving certificate.'],
    },
    itinerary: [
      { time: '07:45', title: 'Hotel pickup', description: 'The car collects you from your hotel in Makadi Bay and drives to the marina.' },
      { title: 'On board', description: 'A safety briefing and the equipment set up as the boat leaves.' },
      { title: 'First dive', description: 'A guided dive on the reef with the instructor.' },
      { title: 'Lunch', description: 'A buffet lunch on board.' },
      { title: 'Second dive', description: 'A second guided dive on another reef.' },
      { title: 'Back to your hotel', description: 'The boat returns to the marina and the car takes you back to your hotel.' },
    ],
  },
  D2E_UNDERWATER_MUSEUM: {
    provider: 'eeo',
    tenant: EEO,
    source: 'red-sea-museum-an-underwater-diving-experience',
    category: WATER,
    options: ['museum-diving-experience-in-the-red-sea-0aa17b3f5190'],
    addons: [],
    departures: ['08:00'],
    rename: {
      'museum-diving-experience-in-the-red-sea-0aa17b3f5190': {
        name: 'Dive at the underwater museum',
        description: 'Dives among the sunken military pieces of the Red Sea underwater museum, with the scuba equipment and lunch.',
      },
    },
    childNote: CHILD_NOTE,
    add: {
      // The record charges only for transfers "outside of Hurghada" and names an air-conditioned vehicle.
      inclusions: [PICKUP_HURGHADA],
      needToKnow: ['Ask the team before you book whether these dives suit your level and whether you need a diving certificate.'],
    },
    // The record's schedule names its sites by map code.
    itinerary: [
      { time: '08:00', ...HRG.from, duration: '30 minutes' },
      { title: 'Briefing', duration: '30 minutes', description: 'A guided briefing before the boat sails.' },
      { title: 'The first site', duration: '2 hours', description: 'Diving among the pieces laid on the seabed.' },
      { title: 'Lunch', duration: '45 minutes', description: 'Lunch on board.' },
      { title: 'The second site', duration: '2 hours', description: 'A second dive at the museum’s other site.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The boat returns and the vehicle takes you back to your hotel.' },
    ],
  },
  D2E_RAS_MOHAMED_SNORKEL: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-ras-mohamed-white-island-snorkeling-diving-lunch',
    category: WATER,
    options: ['snorkeling-with-1-dive-eedd0fbe9f74', 'snorkeling-with-2-dives-700a8b61e41c'],
    // The record's extras are bound to its other options only.
    addons: [],
    departures: ['08:45'],
    rename: {
      'snorkeling-with-1-dive-eedd0fbe9f74': {
        name: 'Snorkelling with one introductory dive',
        description: 'One introductory dive with a certified instructor and time to swim and snorkel. Snorkelling gear is not included.',
      },
      'snorkeling-with-2-dives-700a8b61e41c': {
        name: 'Snorkelling with two introductory dives',
        description: 'Two introductory dives with a certified instructor and time to snorkel between them. Snorkelling gear is not included.',
      },
    },
    childNote: CHILD_NOTE,
    // Both options sold say snorkelling gear is not included; "the famous" ranks the island.
    omit: { inclusions: ['Snorkeling gear (if option is selected)', 'Stop at the famous White Island'] },
    add: {
      inclusions: ['A stop at White Island'],
      exclusions: ['Snorkelling equipment: bring your own'],
    },
    itinerary: [
      { time: '08:45', title: 'Hotel pickup', duration: '30 minutes', description: 'The car collects you from your hotel in Sharm El Sheikh and drives to the marina.' },
      { title: 'Into Ras Mohamed', duration: '2 hours', description: 'The yacht cruises into the national park, the park fee covered.' },
      { title: 'First stop', duration: '1.5 hours', description: 'Snorkelling and your introductory dive at Ras Mohamed.' },
      { title: 'White Island', duration: '1 hour', description: 'Lunch on board and a swim at White Island.' },
      { title: 'Second stop', duration: '1.5 hours', description: 'More snorkelling at Ras Mohamed, and the second dive on the two-dive option.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The yacht returns and the car takes you back to your hotel.' },
    ],
  },
  D2E_TIRAN: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-tiran-island-cruise-with-snorkeling-diving-lunch',
    category: WATER,
    options: ['diving-for-beginners-and-professional-divers--c99b482d518a'],
    addons: [],
    departures: ['08:00'],
    rename: {
      'diving-for-beginners-and-professional-divers--c99b482d518a': {
        name: 'Tiran Island yacht day with one dive',
        description: 'Snorkelling and dive stops near Tiran Island, one introductory dive, a buffet lunch and drinks. Beginners dive to five or six metres.',
      },
    },
    childNote: CHILD_NOTE,
    // The option sold carries one introductory dive; the record writes it as two conditional lines.
    omit: { inclusions: ['10 minutes introduction diving (if option selected)', '1 dive (if option selected)'] },
    add: { inclusions: ['One introductory dive'] },
    itinerary: [
      { time: '08:00', title: 'Hotel pickup', duration: '30 minutes', description: 'The van collects you from your hotel in Sharm El Sheikh and drives to the marina.' },
      { title: 'Along the coast', duration: '2 hours', description: 'The yacht sails north along the coast.' },
      { title: 'Tiran Island', duration: '1.5 hours', description: 'Snorkelling with the guide near Tiran Island.' },
      { title: 'The dive stop', duration: '1.5 hours', description: 'Your introductory dive, and lunch on board.' },
      { title: 'Back to your hotel', description: 'The yacht returns and the van takes you back to your hotel.' },
    ],
  },
} satisfies Record<string, PriceSpec>;

/** Each record's own photo; the three dolphin photos that show people holding dolphins are not used. */
const PHOTO_A = {
  museumHall: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795937/tours/wmork7lo2zbrpokbb4sn.jpg',
  pharaohBust: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781469/tours/pb4ohpdfkiik9alomm7s.jpg',
  museumFacade: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788380892/tours/ltcducpras9ji7yoyhip.jpg',
  goldenMask: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788381754/tours/zdn6p7f5sjbqmsks7jwx.jpg',
  yachtAndDolphins: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788289757/tours/h8x27bcg3l2oc311wf1k.jpg',
  dolphinUnderwater: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788791898/tours/xnv6gdxnnn9dxzs5pdhf.jpg',
  hulaSign: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795095/tours/daplx8xddplpnqmxbmhp.jpg',
  whiteSpeedboat: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788290634/tours/bgacpsik0esq6rcwnmmq.jpg',
  semiSubmarines: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795203/tours/ynzfklun6arugq5l5ej4.jpg',
  orangeBayBeach: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788289814/tours/mqucr1dumbvdnyqejzc6.jpg',
  diverOnReef: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795165/tours/qrhdatgwm8zww53clwpq.jpg',
  snorkellerSelfie: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788291087/tours/a5hjhquanje6nm8wbsbf.jpg',
  bowOverLagoon: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787782233/tours/wirlheh3pj6ibboavetn.jpg',
  yellowSemiSubmarine: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788290690/tours/g2uozxnbzbkcu1gnhanf.jpg',
  snorkellerByReef: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781999/tours/n4iiykztyszzlhk5mavf.jpg',
  speedboatAtSpeed: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787782177/tours/tpfuorpe6kgzzx78smwe.jpg',
  snorkellerThumbsUp: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788290961/tours/pxb310hq6keozafoaqdx.jpg',
  yachtAtSunset: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781893/tours/uaguqygoeo7djujix5fy.jpg',
  diverDescending: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788292330/tours/qgmeqrxj4kngqfei9snq.jpg',
  boatAtAnchor: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788794476/tours/smf4lqwlugbxjepjbagn.jpg',
  sailboatSunset: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788796522/tours/jxzuelgfb5r9vdl36xoa.jpg',
  diverRedCoral: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788528182/tours/xpacckqybvfyq4vbnas1.jpg',
  diveBoatFromAbove: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788212485/tours/c3syeyx758xwhljxpfqk.jpg',
  snorkelMask: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788381298/tours/o3k5jtuvlgtwzrrb3s3f.jpg',
  diverWithFish: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788291718/tours/fuf4gksfbbxd7kplarvi.jpg',
  whiteDiveYacht: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788292140/tours/od1x6rhlyxx6fz6atv12.jpg',
  sunkenTank: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788292058/tours/xqzd9aoi1o3numxyom8w.jpg',
  snorkellerOverCoral: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788381248/tours/jk1brlww5egdkx3pmoqg.jpg',
  snorkellerAndParrotfish: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788381093/tours/jarhqtfzkmkjlqh8mdiz.jpg',
};

/** Each photo described as it is, not as the trip it illustrates. */
const ALT_A: Record<keyof typeof PHOTO_A, string> = {
  museumHall: 'A long museum hall of arched stone galleries on two floors, with statues and display cases down the middle',
  pharaohBust: 'A grey stone head and shoulders of a pharaoh in a striped headdress, seen against a modern wall and blue sky',
  museumFacade: 'A pink stone museum front with an arched entrance, palm trees and a small sphinx in the garden before it',
  goldenMask: 'A gold funerary mask inlaid with blue stripes, lit in a dark display case',
  yachtAndDolphins: 'A white motor yacht on bright blue water, with a group of dolphins swimming at the surface in front of it',
  dolphinUnderwater: 'A dolphin swimming underwater in green-blue water, with a second dolphin behind it',
  hulaSign: 'A carved wooden sign reading Hula Hula on a white beach, with straw sunshades and turquoise water behind',
  whiteSpeedboat: 'A white speedboat with a blue stripe cutting across open water, leaving a wake',
  semiSubmarines: 'The yellow and orange decks of two semi-submarines moored side by side on blue water',
  orangeBayBeach: 'A beach club of wooden decks and terraces on a sandy shore, with shallow turquoise water in front',
  diverOnReef: 'A scuba diver with arms spread over a coral reef, with striped fish nearby',
  snorkellerSelfie: 'A snorkeller in a mask taking a photo of himself underwater above a coral reef',
  bowOverLagoon: 'The white bow of a boat heading across a turquoise lagoon towards a low sandy shore',
  yellowSemiSubmarine: 'A yellow semi-submarine boat with passengers on its deck, moving fast across blue water',
  snorkellerByReef: 'A snorkeller in a mask and wetsuit swimming beside a coral wall',
  speedboatAtSpeed: 'A white and blue speedboat at speed on calm blue sea, with spray at its stern',
  snorkellerThumbsUp: 'A snorkeller in a mask giving a thumbs-up underwater in deep blue water',
  yachtAtSunset: 'A motor yacht in silhouette on the sea under an orange sunset, with hills on the horizon',
  diverDescending: 'A scuba diver descending through blue water above a reef, with other divers below',
  boatAtAnchor: 'A white day boat at anchor in clear water near a low desert shore',
  sailboatSunset: 'A sailing boat on calm water with the sun setting low behind it',
  diverRedCoral: 'A scuba diver beside a reef wall with long red whip coral in the foreground',
  diveBoatFromAbove: 'A small dive boat on turquoise water seen from above, with a diver and a coral head nearby',
  snorkelMask: 'A swimmer in a full-face snorkel mask at the surface, looking towards a rocky shore',
  diverWithFish: 'A scuba diver in a blue wetsuit and head torch beside coral, with yellow and blue fish around',
  whiteDiveYacht: 'A large white diving yacht moored in clear shallow water',
  sunkenTank: 'A scuba diver swimming above an old tank lying on a sandy seabed',
  snorkellerOverCoral: 'A snorkeller swimming down over a wide shallow coral garden',
  snorkellerAndParrotfish: 'A snorkeller in a mask close above a coral reef, with a large parrotfish below',
};

const CAIRO = { lat: 30.0444, lng: 31.2357 };
const SHARM = { lat: 27.7369, lng: 34.3394 };
const HURGHADA = { lat: 27.2579, lng: 33.8116 };
const DAHAB = { lat: 28.5091, lng: 34.5136 };
const EL_GOUNA = { lat: 27.3942, lng: 33.6782 };
const MAKADI = { lat: 26.9806, lng: 33.9056 };
const MARSA_ALAM = { lat: 25.0676, lng: 34.879 };

const FROM_SHARM = { city: 'Sharm El Sheikh', area: 'Sharm El Sheikh', coordinates: SHARM };

/** Places the Grand Egyptian Museum site never names: its trips start in Cairo or Giza, or in Sharm El Sheikh. */
const NOT_GEM = /Hurghada|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Citadel|Coptic|Tahrir|Civilization/i;
/** Places the Hurghada boat site never names: its boats leave from Hurghada for the islands off it. */
const NOT_HURGHADA_BOATS = /Cairo|Giza|Luxor|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Gouna|Sahl|Makadi|Alexandria|Siwa|Bahariya|Fayoum|Sataya|Samadai/i;
/** Places Dive2Egypt never names: it dives from Hurghada, El Gouna, Makadi Bay, Sharm El Sheikh and Dahab. */
const NOT_DIVE2EGYPT = /Cairo|Giza|Luxor|Aswan|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Sahl|Alexandria|Siwa|Bahariya|Fayoum|Nabq|Sataya|Samadai/i;

export const B09A: NetworkBatch = {
  id: 'b09a',
  sites: [
    {
      slug: 'grand-egyptian-museum',
      name: 'Grand Egyptian Museum',
      listingPath: '/trips',
      domain: 'grandegyptianmuseum.org',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'gem-',
      foreignPlaces: NOT_GEM,
      tagline: 'Guided visits to the Grand Egyptian Museum',
      // The client's record opens "the world's largest archaeological museum dedicated to a single civilization":
      // a ranking the network cannot back, so the site says what the trips do.
      description: 'Grand Egyptian Museum sells guided visits to the new museum beside the Giza pyramids: a morning in the galleries with hotel pickup in Cairo or Giza, a private day that adds the pyramids and the Sphinx, and from Sharm El Sheikh either a long day or a stay with a night by the pyramids.\n\nThe museum is not yet fully open, so some galleries may be closed on the day. Every trip collects you from your hotel and brings you back. Hold a place online and pay later, or ask the team first.',
      seo: {
        metaTitle: 'Grand Egyptian Museum Guided Visits with Hotel Pickup',
        metaDescription: 'Guided visits to the Grand Egyptian Museum from Cairo or Giza, with the pyramids and the Sphinx, or from Sharm El Sheikh. Hotel pickup on every trip.',
        keywords: ['grand egyptian museum tour', 'grand egyptian museum visit', 'gem museum tour giza', 'grand egyptian museum from sharm el sheikh', 'pyramids and grand egyptian museum'],
      },
      theme: { primaryColor: '#3B2F22', secondaryColor: '#F4EFE6', accentColor: '#B8892F' },
      heroImages: [PHOTO_A.pharaohBust, PHOTO_A.goldenMask, PHOTO_A.museumHall],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/grand-egyptian-museum/monogram.png',
      trips: [
        {
          path: 'grand-egyptian-museum-visit-with-hotel-pickup',
          price: PROGRAMMES_A.GEM_VISIT,
          title: 'Grand Egyptian Museum Visit with Hotel Pickup',
          short: 'Four hours from your hotel in Cairo or Giza: three hours in the Grand Egyptian Museum with a guide, the entry fees and private transfers.',
          description: 'A morning at the Grand Egyptian Museum. A private air-conditioned car collects you from your hotel in Cairo or Giza at eight, and the drive to the museum takes about an hour.\n\nYou then have three hours in the galleries with a guide on site, the entry fees covered and a bottle of water, before the car takes you back. Your entry ticket is sent to you separately. The museum is not yet fully open, so some galleries may be closed on the day. Children have their own price.',
          highlights: ['Three hours in the Grand Egyptian Museum', 'A guide at the museum', 'Private transfers from Cairo or Giza', 'The entry fees included'],
          seo: {
            metaTitle: 'Grand Egyptian Museum Visit with Hotel Pickup in Cairo',
            metaDescription: 'Three hours in the Grand Egyptian Museum with a guide on site, the entry fees and private transfers from your hotel in Cairo or Giza.',
          },
          images: [PHOTO_A.museumHall],
          imageAlts: [ALT_A.museumHall],
        },
        {
          path: 'private-pyramids-sphinx-and-grand-egyptian-museum',
          price: PROGRAMMES_A.GEM_PYRAMIDS,
          title: 'Private Day at the Pyramids, the Sphinx and the Grand Egyptian Museum',
          short: 'A private day from Cairo or Giza with your own guide: the Giza pyramids, the Sphinx and the Grand Egyptian Museum, with the tickets.',
          description: 'A private day with your own Egyptologist guide. The car collects you from your hotel in Cairo or Giza at nine for three hours on the Giza plateau and an hour at the Great Sphinx.\n\nAfter an hour’s break, the afternoon is three hours in the Grand Egyptian Museum, with time of your own among the galleries. The tickets for the pyramids, the Sphinx and the museum are in the price; lunch is not. Children have their own price.',
          highlights: ['Your own guide all day', 'The Giza pyramids and the Sphinx', 'Three hours in the Grand Egyptian Museum', 'The tickets included'],
          seo: {
            metaTitle: 'Private Giza Pyramids, Sphinx and Grand Egyptian Museum Day',
            metaDescription: 'A private day from Cairo or Giza: the pyramids, the Sphinx and the Grand Egyptian Museum with your own guide, the tickets and hotel pickup.',
          },
          images: [PHOTO_A.pharaohBust],
          imageAlts: [ALT_A.pharaohBust],
        },
        {
          path: 'grand-egyptian-museum-and-pyramids-from-sharm-el-sheikh',
          price: PROGRAMMES_A.GEM_FROM_SHARM,
          title: 'Grand Egyptian Museum and the Pyramids from Sharm El Sheikh',
          short: 'A long day by coach from Sharm El Sheikh: the Giza pyramids, the Sphinx and the Grand Egyptian Museum with an Egyptologist guide and lunch.',
          description: 'A day trip to Cairo from Sharm El Sheikh. The coach collects you from your hotel just after midnight for the long drive north, arriving on the Giza plateau in the morning for the pyramids and the Great Sphinx with an Egyptologist guide.\n\nLunch is at a restaurant looking out at the pyramids, then the guide takes you through the Grand Egyptian Museum before the drive back. The entrance fees for the pyramids, the Sphinx and the museum, lunch and the coach are in the price; drinks, a Nile boat, a camel ride and the burial chambers are not. Bring your passport. Children have their own price.',
          highlights: ['The Giza pyramids and the Sphinx', 'The Grand Egyptian Museum', 'An Egyptologist guide', 'Lunch looking out at the pyramids'],
          seo: {
            metaTitle: 'Grand Egyptian Museum and Pyramids Day Trip from Sharm',
            metaDescription: 'From Sharm El Sheikh by coach: the Giza pyramids, the Sphinx and the Grand Egyptian Museum with a guide, lunch and the entrance fees.',
          },
          images: [PHOTO_A.museumFacade],
          imageAlts: [ALT_A.museumFacade],
          where: FROM_SHARM,
        },
        {
          path: 'two-days-pyramids-and-grand-egyptian-museum-from-sharm',
          price: PROGRAMMES_A.GEM_TWO_DAYS,
          title: 'Two Days from Sharm El Sheikh: the Pyramids, the Museum and a Night in Giza',
          short: 'Two days from Sharm El Sheikh: the Giza pyramids, the Sphinx and the Grand Egyptian Museum, a night by the pyramids and free time in Cairo.',
          description: 'Two days in Cairo from Sharm El Sheikh. The transfer collects you from your hotel in the night, and day one is the Giza pyramids, the Great Sphinx and the Grand Egyptian Museum with an Egyptologist guide, the entrance fees covered.\n\nThe night is in an apartment with a view of the pyramids, with breakfast and lunch in the price, and day two is free time in Cairo before the drive back. Extra visits for the second day cannot be booked on this site. Tips and personal spending are not included. Children have their own price.',
          highlights: ['Two days in Cairo', 'The pyramids, the Sphinx and the Grand Egyptian Museum', 'A night with a view of the pyramids', 'Breakfast and lunch included'],
          seo: {
            metaTitle: 'Two-Day Pyramids and Grand Egyptian Museum Trip from Sharm',
            metaDescription: 'Two days from Sharm El Sheikh: the pyramids, the Sphinx and the Grand Egyptian Museum with a guide, a night by the pyramids and free time in Cairo.',
          },
          images: [PHOTO_A.goldenMask],
          imageAlts: [ALT_A.goldenMask],
          where: FROM_SHARM,
        },
      ],
    },
    {
      slug: 'hurghada-boat-tour',
      name: 'Hurghada Boat Tour',
      listingPath: '/trips',
      domain: 'hurghadaboattour.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'hbt-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'Boat trips from Hurghada',
      description: 'Hurghada Boat Tour sells days on the water from Hurghada: yachts and speedboats to Dolphin House, Orange Bay, Giftun, Magawish and the islands around them, a catamaran, a semi-submarine, an afternoon yacht, a banana boat ride and a day with an introductory dive.\n\nDolphins are wild animals, so no boat can promise a sighting. Every trip collects you from your hotel in Hurghada and brings you back; pickup from further out costs extra and is arranged with the team. Hold a place online and pay later, or ask the team first.',
      seo: {
        metaTitle: 'Hurghada Boat Trips: Yachts, Speedboats and Islands',
        metaDescription: 'Boat trips from Hurghada to Dolphin House, Orange Bay, Giftun and Magawish by yacht, speedboat or catamaran, with hotel pickup in Hurghada.',
        keywords: ['hurghada boat trip', 'hurghada yacht trip', 'orange bay hurghada', 'dolphin house hurghada', 'hurghada speedboat trip'],
      },
      theme: { primaryColor: '#0B4F6C', secondaryColor: '#EAF4F8', accentColor: '#F2A541' },
      heroImages: [PHOTO_A.yachtAndDolphins, PHOTO_A.orangeBayBeach, PHOTO_A.sailboatSunset],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/hurghada-boat-tour/monogram.png',
      trips: [
        {
          path: 'dolphin-house-yacht-with-seafood-lunch',
          price: PROGRAMMES_A.HBT_DOLPHIN_YACHT,
          title: 'Dolphin House Yacht Trip with Snorkelling and a Seafood Lunch',
          short: 'Five hours on a yacht from Hurghada: dolphin watching and a swim at Dolphin House, two snorkelling stops, breakfast and a seafood lunch.',
          description: 'A five-hour yacht day from Hurghada, with a morning and an afternoon departure. The car collects you from your hotel, and the yacht sails to the Dolphin House reef, where dolphins often feed and rest; if they are there and the sea allows, you can swim near them. Dolphins are wild, so no boat can promise a sighting.\n\nThere are two guided snorkelling stops, at Dolphin House and a smaller reef nearby, with the gear included. A breakfast buffet and a seafood lunch are served on board, with hot and soft drinks. Towels, underwater photos and tips are not included. Children have their own price.',
          highlights: ['Dolphin watching at Dolphin House', 'Two guided snorkelling stops', 'Breakfast and a seafood lunch', 'Morning or afternoon departure'],
          seo: {
            metaTitle: 'Hurghada Dolphin House Yacht Trip with Seafood Lunch',
            metaDescription: 'Five hours on a yacht from Hurghada: dolphin watching at Dolphin House, two snorkelling stops, breakfast, a seafood lunch and hotel pickup.',
          },
          images: [PHOTO_A.yachtAndDolphins],
          imageAlts: [ALT_A.yachtAndDolphins],
        },
        {
          path: 'dolphin-house-morning-cruise',
          price: PROGRAMMES_A.HBT_DOLPHIN_MORNING,
          title: 'Dolphin House Morning Cruise with Breakfast',
          short: 'Five hours from Hurghada: two forty-minute snorkelling and swimming sessions at Dolphin House, breakfast on board and unlimited drinks.',
          description: 'An early cruise from Hurghada to the Dolphin House reef. The car collects you from your hotel, and the boat takes about an hour to reach the reef, where dolphins often feed and rest. Dolphins are wild animals, so no boat can promise a sighting, and swimming near them depends on the sea and on how many boats are there.\n\nThere are two forty-minute sessions of snorkelling and swimming, with breakfast on board between them and a guide for non-swimmers. The gear, tea, coffee, soft drinks and water are in the price; the nature reserve fee, towels and underwater photos are not. Children have their own price.',
          highlights: ['Two forty-minute sessions at Dolphin House', 'Breakfast on board', 'Unlimited hot and soft drinks', 'A guide for non-swimmers'],
          seo: {
            metaTitle: 'Hurghada Dolphin House Morning Cruise with Breakfast',
            metaDescription: 'Five hours from Hurghada: two snorkelling and swimming sessions at Dolphin House, breakfast on board, unlimited drinks and hotel pickup.',
          },
          images: [PHOTO_A.dolphinUnderwater],
          imageAlts: [ALT_A.dolphinUnderwater],
        },
        {
          path: 'dolphin-house-by-speedboat',
          price: PROGRAMMES_A.HBT_DOLPHIN_SPEEDBOAT,
          title: 'Dolphin House by Speedboat from Hurghada',
          short: 'Four hours by speedboat: two snorkelling and swimming stops at Dolphin House, with the gear, water, soft drinks and fruit.',
          description: 'A quicker way to Dolphin House. The car collects you from your hotel in Hurghada, and the speedboat runs out to the reef in about an hour, with shade on board.\n\nAn hour and a half at the reef gives two guided stops to snorkel and swim, where dolphins often feed and rest. Dolphins are wild, so no boat can promise a sighting. The gear, life jackets, water, soft drinks and fruit are in the price; the nature reserve fee is paid on the day. Children have their own price.',
          highlights: ['By speedboat to Dolphin House', 'Two snorkelling and swimming stops', 'Shade on board', 'Fruit and soft drinks'],
          seo: {
            metaTitle: 'Dolphin House Speedboat Trip from Hurghada',
            metaDescription: 'Four hours by speedboat from Hurghada: two snorkelling and swimming stops at Dolphin House, the gear, drinks, fruit and hotel pickup.',
          },
          images: [PHOTO_A.whiteSpeedboat],
          imageAlts: [ALT_A.whiteSpeedboat],
        },
        {
          path: 'dolphin-watching-by-speedboat',
          price: PROGRAMMES_A.HBT_DOLPHIN_WATCH,
          title: 'Dolphin Watching and Snorkelling by Speedboat',
          short: 'Four hours by speedboat from Hurghada to look for dolphins, with two or three snorkelling stops. No island stop.',
          description: 'A speedboat morning or afternoon given to the open water. The car collects you from your hotel in Hurghada, and the captain heads out to look for dolphins; if they are there and the sea allows, you can swim near them. Dolphins are wild animals, so no boat can promise a sighting.\n\nThe trip makes two or three guided snorkelling stops, with the gear and life jackets, water, soft drinks and fruit, and the nature reserve fees in the price. It does not stop at an island. Children and infants have their own prices.',
          highlights: ['Dolphin watching by speedboat', 'Two or three snorkelling stops', 'The nature reserve fees included', 'Morning or afternoon departure'],
          seo: {
            metaTitle: 'Hurghada Dolphin Watching and Snorkelling by Speedboat',
            metaDescription: 'Four hours by speedboat from Hurghada: dolphin watching, two or three snorkelling stops, the gear, drinks, fruit and hotel pickup.',
          },
          images: [PHOTO_A.speedboatAtSpeed],
          imageAlts: [ALT_A.speedboatAtSpeed],
        },
        {
          path: 'speedboat-snorkelling-trip',
          price: PROGRAMMES_A.HBT_SPEEDBOAT_SNORKEL,
          title: 'Speedboat Snorkelling Trip from Hurghada',
          short: 'Four hours by speedboat with a guide: snorkelling on the reefs off Hurghada, with the gear, fruit and drinks.',
          description: 'A short snorkelling trip by speedboat, with a morning and an afternoon departure. The car collects you from your hotel in Hurghada, and the speedboat heads for the reefs, with shade and music on board.\n\nThe guide takes you snorkelling with the gear and life jackets, and fruit, soft drinks and water are served between stops. The nature reserve fees are in the price. Children and infants have their own prices.',
          highlights: ['Snorkelling with a guide', 'By speedboat', 'The nature reserve fees included', 'Fruit and drinks on board'],
          seo: {
            metaTitle: 'Hurghada Speedboat Snorkelling Trip with Hotel Pickup',
            metaDescription: 'Four hours by speedboat from Hurghada: guided snorkelling with the gear, fruit and drinks, the reserve fees and hotel pickup.',
          },
          images: [PHOTO_A.snorkellerThumbsUp],
          imageAlts: [ALT_A.snorkellerThumbsUp],
        },
        {
          path: 'hula-hula-island-by-speedboat',
          price: PROGRAMMES_A.HBT_HULA_SPEEDBOAT,
          title: 'Hula Hula Island by Speedboat with Snorkelling and Lunch',
          short: 'Four hours from Hurghada: the speedboat to Hula Hula Island, a guided snorkelling stop, time on the beach and lunch.',
          description: 'Four hours on a small island off Hurghada. The car collects you from your hotel at nine or one, and a twenty-minute speedboat ride takes you to Hula Hula Island.\n\nThe island ticket is in the price, with a guided snorkelling stop with the gear and life jackets, free time on the beach, fruit, soft drinks and lunch. Personal spending is not included. Children pay the same price as adults.',
          highlights: ['The speedboat to Hula Hula Island', 'A guided snorkelling stop', 'Time on the beach', 'Lunch and soft drinks'],
          seo: {
            metaTitle: 'Hula Hula Island Speedboat Trip from Hurghada',
            metaDescription: 'Four hours from Hurghada: the speedboat to Hula Hula Island, a snorkelling stop, beach time, lunch, the island ticket and hotel pickup.',
          },
          images: [PHOTO_A.hulaSign],
          imageAlts: [ALT_A.hulaSign],
        },
        {
          path: 'six-islands-by-speedboat',
          price: PROGRAMMES_A.HBT_SIX_ISLANDS,
          title: 'Six Islands by Speedboat with Dolphin Watching',
          short: 'Eight hours by speedboat from Hurghada: Giftun, Nemo Bay, Orange Bay, Magawish, White Island and Abu Minqar, with three snorkelling stops.',
          description: 'A full day around the islands off Hurghada. The car collects you from your hotel at half past eight, and the speedboat spends two hours in the Giftun National Park area looking for dolphins and snorkelling. Dolphins are wild, so no boat can promise a sighting.\n\nThe day goes on to Nemo Bay, Orange Bay, Magawish Island, a sandbank and Abu Minqar, with a snorkelling stop at a wreck, and the entrance fees for Orange Bay, White Island, Magawish and Abu Minqar are in the price, with soft drinks, water and fruit. Lunch is not included. Children have their own price.',
          highlights: ['Six islands in a day', 'Three snorkelling stops, one at a wreck', 'Dolphin watching at Giftun', 'The island entrance fees included'],
          seo: {
            metaTitle: 'Hurghada Six Islands Speedboat Trip with Snorkelling',
            metaDescription: 'Eight hours by speedboat from Hurghada: six islands, three snorkelling stops, dolphin watching, the island fees and hotel pickup.',
          },
          images: [PHOTO_A.snorkellerSelfie],
          imageAlts: [ALT_A.snorkellerSelfie],
        },
        {
          path: 'three-islands-by-yacht',
          price: PROGRAMMES_A.HBT_THREE_ISLANDS,
          title: 'Orange Bay, Giftun and Magawish by Yacht with a Seafood Lunch',
          short: 'Eight hours on a yacht from Hurghada: Orange Bay, Giftun and Magawish, two snorkelling stops, breakfast and a seafood lunch.',
          description: 'A yacht day to three islands. The car collects you from your hotel at half past eight, and breakfast is served as the yacht sails out; keep a look out for dolphins, which are wild and never promised.\n\nThe day spends an hour at Orange Bay, forty minutes snorkelling at Giftun Island and an hour at Magawish, with their entrance fees, two snorkelling stops with the gear and a guide, a seafood lunch, fruit and unlimited drinks. Bring a towel and a copy of your passport. Children have their own price.',
          highlights: ['Orange Bay, Giftun and Magawish', 'Two snorkelling stops', 'Breakfast and a seafood lunch', 'The island fees included'],
          seo: {
            metaTitle: 'Hurghada Three Islands Yacht Trip with Seafood Lunch',
            metaDescription: 'Eight hours on a yacht from Hurghada: Orange Bay, Giftun and Magawish, two snorkelling stops, breakfast, a seafood lunch and hotel pickup.',
          },
          images: [PHOTO_A.yachtAtSunset],
          imageAlts: [ALT_A.yachtAtSunset],
        },
        {
          path: 'orange-bay-yacht-with-breakfast',
          price: PROGRAMMES_A.HBT_ORANGE_YACHT,
          title: 'Orange Bay Yacht Trip with Breakfast and Snorkelling',
          short: 'Five or eight hours on a yacht from Hurghada: breakfast, snorkelling and time on Orange Bay Island, with lunch on the longer day.',
          description: 'A yacht day to Orange Bay Island in two lengths. The car collects you from your hotel in Hurghada at half past eight, and a breakfast buffet is served as the yacht sails out.\n\nThe five-hour trip makes one snorkelling stop and spends an hour on the island; the eight-hour trip makes two stops, spends two hours there and adds lunch. Both include the snorkelling gear, the island entry and marine tax, unlimited drinks and fruit, and a guide for non-swimmers. Towels, underwater photos and tips are not included. Children have their own price.',
          highlights: ['Five or eight hours', 'Time on Orange Bay Island', 'Breakfast, and lunch on the longer trip', 'The island entry included'],
          seo: {
            metaTitle: 'Orange Bay Yacht Trip from Hurghada with Breakfast',
            metaDescription: 'Five or eight hours on a yacht from Hurghada: breakfast, snorkelling and Orange Bay Island, lunch on the longer day and hotel pickup.',
          },
          images: [PHOTO_A.bowOverLagoon],
          imageAlts: [ALT_A.bowOverLagoon],
        },
        {
          path: 'orange-bay-cruise-with-lunch',
          price: PROGRAMMES_A.HBT_ORANGE_LUNCH,
          title: 'Orange Bay Cruise with Two Snorkelling Stops and Lunch',
          short: 'Eight hours from Hurghada: two snorkelling stops, two hours on Orange Bay Island and a buffet lunch on board.',
          description: 'A full day at sea with a long stop at Orange Bay. The coach collects you from your hotel in Hurghada at eight, and the boat sails out for the first of two snorkelling stops with an instructor and the gear.\n\nTwo hours on Orange Bay Island follow, the entry covered, then a buffet lunch with salads and fruit and unlimited juice, cola, tea and coffee. The boat has toilets and showers. Drinks on the island and photos are not included. Children have their own price.',
          highlights: ['Two hours on Orange Bay Island', 'Two snorkelling stops', 'A buffet lunch on board', 'Unlimited drinks'],
          seo: {
            metaTitle: 'Orange Bay Cruise from Hurghada with Snorkelling and Lunch',
            metaDescription: 'Eight hours from Hurghada: two snorkelling stops, two hours on Orange Bay Island, a buffet lunch, unlimited drinks and hotel pickup.',
          },
          images: [PHOTO_A.boatAtAnchor],
          imageAlts: [ALT_A.boatAtAnchor],
        },
        {
          path: 'orange-bay-cruise-with-massage',
          price: PROGRAMMES_A.HBT_ORANGE_MASSAGE,
          title: 'Orange Bay Cruise with Snorkelling, a Massage and Lunch',
          short: 'Eight and a half hours from Hurghada: Orange Bay, a snorkelling stop, an open buffet and one massage for each guest.',
          description: 'A long day out to Orange Bay. The car collects you from your hotel in Hurghada at half past seven, and the boat sails for about forty-five minutes to the island, where you have an hour and a quarter on the beach.\n\nThere is a snorkelling stop with the gear and the guide, an open buffet of fish, chicken, kofta, pasta, rice, salads and fruit, unlimited soft and hot drinks and snacks, and one massage for each guest. The marine fee and tax are in the price; drinks on the island are not. Children have their own price.',
          highlights: ['Time on Orange Bay Island', 'A snorkelling stop', 'An open buffet lunch', 'One massage for each guest'],
          seo: {
            metaTitle: 'Orange Bay Cruise from Hurghada with Massage and Lunch',
            metaDescription: 'Eight and a half hours from Hurghada: Orange Bay, a snorkelling stop, an open buffet, unlimited drinks, a massage each and hotel pickup.',
          },
          images: [PHOTO_A.orangeBayBeach],
          imageAlts: [ALT_A.orangeBayBeach],
        },
        {
          path: 'orange-bay-snorkelling-and-diving-day',
          price: PROGRAMMES_A.HBT_ORANGE_DIVE,
          title: 'Orange Bay Snorkelling and Diving Day',
          short: 'Eight and a half hours from Hurghada: snorkelling with the gear, a scuba dive with the equipment, Orange Bay and an open buffet lunch.',
          description: 'A day that mixes snorkelling and a first look at diving. The car collects you from your hotel in Hurghada at half past seven, and the boat sails past Giftun to Orange Bay Island for an hour and a quarter.\n\nThe day includes snorkelling with the gear, a scuba dive with the diving equipment and a life vest, the marine fee, snacks, an open buffet lunch on board and soft and hot drinks. Bring a hat, a towel and reef-safe sunscreen. Children have their own price.',
          highlights: ['Snorkelling and a scuba dive', 'Orange Bay Island', 'The diving equipment included', 'An open buffet lunch'],
          seo: {
            metaTitle: 'Hurghada Orange Bay Snorkelling and Diving Day',
            metaDescription: 'Eight and a half hours from Hurghada: snorkelling, a scuba dive with the equipment, Orange Bay, an open buffet lunch and hotel pickup.',
          },
          images: [PHOTO_A.diverDescending],
          imageAlts: [ALT_A.diverDescending],
        },
        {
          path: 'yacht-day-with-an-introductory-dive',
          price: PROGRAMMES_A.HBT_INTRO_DIVE_YACHT,
          title: 'Yacht Day with an Introductory Dive, Orange Bay and Lunch',
          short: 'Eight hours on a yacht from Hurghada: a short introductory dive, snorkelling, Orange Bay, an open buffet lunch and a massage.',
          description: 'A full yacht day for anyone curious about diving. The car collects you from your hotel in Hurghada at half past seven, and the yacht sails to Orange Bay Island for an hour and a quarter on the beach.\n\nEach guest has a short introductory dive of ten to fifteen minutes with an instructor and the full equipment, with no certificate needed, and there is a snorkelling stop with the gear. An open buffet lunch, salads, fruit, soft and hot drinks, snacks and a massage for each guest are in the price, with the nature reserve and marine fees. Diving is not allowed under thirteen. Children have their own price.',
          highlights: ['An introductory dive for each guest', 'Snorkelling and Orange Bay', 'An open buffet lunch', 'A massage for each guest'],
          seo: {
            metaTitle: 'Hurghada Yacht Day with Introductory Dive and Orange Bay',
            metaDescription: 'Eight hours from Hurghada: an introductory dive, snorkelling, Orange Bay, an open buffet lunch, a massage and hotel pickup.',
          },
          images: [PHOTO_A.diverOnReef],
          imageAlts: [ALT_A.diverOnReef],
        },
        {
          path: 'catamaran-day-with-semi-submarine',
          price: PROGRAMMES_A.HBT_CATAMARAN,
          title: 'Catamaran Day with a Semi-Submarine, an Island and Lunch',
          short: 'Seven hours from Hurghada: a catamaran with a pool, a snorkelling stop, two hours on an island and forty-five minutes of underwater views.',
          description: 'A catamaran day from Hurghada. The car collects you from your hotel at ten, and the catamaran sails out with a pool on board, including one suited to children, and music.\n\nThere is a guided snorkelling stop with the gear and life jackets, two hours on an island with the entry fees, and forty-five minutes looking out at the reef from a semi-submarine. An open buffet lunch, soft drinks and the national park fees are in the price. Pickup from outside Hurghada costs extra. Children have their own price.',
          highlights: ['A catamaran with a pool', 'Forty-five minutes of underwater views', 'Two hours on an island', 'An open buffet lunch'],
          seo: {
            metaTitle: 'Hurghada Catamaran Day with Semi-Submarine and Island',
            metaDescription: 'Seven hours from Hurghada: a catamaran with a pool, snorkelling, two hours on an island, a semi-submarine, lunch and hotel pickup.',
          },
          images: [PHOTO_A.semiSubmarines],
          imageAlts: [ALT_A.semiSubmarines],
        },
        {
          path: 'semi-submarine-and-snorkelling',
          price: PROGRAMMES_A.HBT_SEMI_SUBMARINE,
          title: 'Semi-Submarine and Snorkelling Trip from Hurghada',
          short: 'Three hours from Hurghada: the reef through the windows of a semi-submarine, about five metres down, and a snorkelling stop.',
          description: 'A short trip that shows the reef without getting wet, then lets you in. The coach collects you from your hotel in Hurghada at nine or three, and the semi-submarine leaves Hurghada Marina.\n\nFrom the cabin below the waterline you watch the reef and its fish through the windows, about five metres down, before a stop to snorkel with the gear. One soft drink, water on board and all the entry tickets are in the price; drinks and snacks at the floating station and photos are not. Children have their own price.',
          highlights: ['Underwater views about five metres down', 'A snorkelling stop', 'Morning or afternoon departure', 'The entry tickets included'],
          seo: {
            metaTitle: 'Hurghada Semi-Submarine and Snorkelling Trip',
            metaDescription: 'Three hours from Hurghada: the reef through a semi-submarine’s windows, a snorkelling stop, the entry tickets and hotel pickup.',
          },
          images: [PHOTO_A.yellowSemiSubmarine],
          imageAlts: [ALT_A.yellowSemiSubmarine],
        },
        {
          path: 'afternoon-yacht-and-snorkelling',
          price: PROGRAMMES_A.HBT_SUNSET,
          title: 'Afternoon Yacht and Snorkelling Trip with Fish and Chips',
          short: 'Five hours from Hurghada from half past three: three hours on a yacht, forty minutes of snorkelling and a fish and chips meal.',
          description: 'An afternoon on the water that ends towards evening. The car collects you from your hotel in Hurghada at half past three, and the yacht sails along the coast for an hour and a half.\n\nA forty-minute snorkelling session at Giftun follows, with all the gear and a guide for non-swimmers, then calamari, fish and chips on board and unlimited tea, coffee, soft drinks and water as the yacht returns. The nature reserve fee, towels and underwater photos are not included. Children have their own price.',
          highlights: ['An afternoon departure', 'Forty minutes of snorkelling', 'Calamari, fish and chips', 'Unlimited drinks'],
          seo: {
            metaTitle: 'Hurghada Afternoon Yacht and Snorkelling Trip',
            metaDescription: 'Five hours from Hurghada from half past three: a yacht, forty minutes of snorkelling, fish and chips, unlimited drinks and hotel pickup.',
          },
          images: [PHOTO_A.sailboatSunset],
          imageAlts: [ALT_A.sailboatSunset],
        },
        {
          path: 'banana-boat-and-sofa-ride',
          price: PROGRAMMES_A.HBT_BANANA,
          title: 'Banana Boat and Sofa Ride in Hurghada',
          short: 'Fifteen minutes on a banana boat and fifteen on the sofa ride, with life jackets and hotel pickup in Hurghada.',
          description: 'A short burst of water sports. The car collects you from your hotel in Hurghada at the hour you choose, between eight and three, and drives to the boat.\n\nYou ride the banana boat for fifteen minutes, then the sofa ride for fifteen, in a life jacket, with a captain and a bottle of water. Snorkelling and lunch are not part of this option. Children have their own price.',
          highlights: ['Fifteen minutes on a banana boat', 'Fifteen minutes on the sofa ride', 'Eight departures a day', 'Life jackets included'],
          seo: {
            metaTitle: 'Hurghada Banana Boat and Sofa Ride with Hotel Pickup',
            metaDescription: 'Fifteen minutes on a banana boat and fifteen on the sofa ride in Hurghada, with life jackets, water and hotel pickup.',
          },
          images: [PHOTO_A.snorkellerByReef],
          imageAlts: [ALT_A.snorkellerByReef],
        },
      ],
    },
    {
      slug: 'dive2egypt',
      name: 'Dive2Egypt',
      listingPath: '/trips',
      domain: 'dive2egypt.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'd2e-',
      foreignPlaces: NOT_DIVE2EGYPT,
      tagline: 'Dive days on the Red Sea',
      description: 'Dive2Egypt sells dive days on the Red Sea from Hurghada, El Gouna, Makadi Bay, Sharm El Sheikh and Dahab: first dives with an instructor for beginners, boat days with two dives for certified divers, the underwater museum off Hurghada, and the reefs of Ras Mohamed and Tiran.\n\nEach trip says who it is for and what equipment comes with it. Every trip collects you from your hotel in the town it leaves from and brings you back. Hold a place online and pay later, or ask the team first.',
      seo: {
        metaTitle: 'Dive2Egypt: Red Sea Dive Days and First Dives',
        metaDescription: 'Red Sea dive days from Hurghada, El Gouna, Makadi Bay, Sharm El Sheikh and Dahab: first dives, boat dives for certified divers and hotel pickup.',
        keywords: ['red sea diving', 'hurghada diving trip', 'introductory dive hurghada', 'ras mohamed diving', 'dahab first dive'],
      },
      theme: { primaryColor: '#0E3A5B', secondaryColor: '#E8F1F7', accentColor: '#E4572E' },
      heroImages: [PHOTO_A.diverRedCoral, PHOTO_A.sunkenTank, PHOTO_A.snorkellerOverCoral],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/dive2egypt/monogram.png',
      trips: [
        {
          path: 'two-introductory-dives-from-hurghada',
          price: PROGRAMMES_A.D2E_HURGHADA_INTRO,
          title: 'Two Introductory Dives from Hurghada with Lunch',
          short: 'Eight hours from Hurghada for beginners: two dives with an instructor, the scuba equipment and lunch on board.',
          description: 'A first day underwater, with no experience needed. The coach collects you from your hotel in Hurghada at eight, and the instructor gives a briefing before the first twenty-minute dive.\n\nLunch is served on board with tea or coffee, and there is time to snorkel before the second dive at another site. The scuba equipment is in the price; the marine park fee and transfers from outside Hurghada are paid separately. Children have their own price.',
          highlights: ['Two dives for beginners', 'An instructor for each dive', 'The scuba equipment included', 'Lunch on board'],
          seo: {
            metaTitle: 'Hurghada Introductory Dives for Beginners with Lunch',
            metaDescription: 'Two beginner dives from Hurghada with an instructor, the scuba equipment, lunch on board and hotel pickup in Hurghada.',
          },
          images: [PHOTO_A.diverWithFish],
          imageAlts: [ALT_A.diverWithFish],
        },
        {
          path: 'underwater-museum-dive',
          price: PROGRAMMES_A.D2E_UNDERWATER_MUSEUM,
          title: 'Dive at the Red Sea Underwater Museum',
          short: 'Seven hours from Hurghada: dives at the underwater museum’s two sites, among sunken military pieces, with the equipment and lunch.',
          description: 'A dive day at the Red Sea underwater museum off Hurghada, where military pieces have been laid on the seabed. The vehicle collects you from your hotel at eight, and a guided briefing comes before the boat sails.\n\nThe day spends about two hours at each of the museum’s two sites, with lunch on board between them. The scuba equipment and lunch are in the price; the marine park fee, transfers from outside Hurghada and tips are not. Ask the team before you book whether the dives suit your level. Children have their own price.',
          highlights: ['The underwater museum’s two sites', 'Sunken military pieces on the seabed', 'The scuba equipment included', 'Lunch on board'],
          seo: {
            metaTitle: 'Red Sea Underwater Museum Dive from Hurghada',
            metaDescription: 'Seven hours from Hurghada: dives at the underwater museum’s two sites, the scuba equipment, lunch on board and hotel pickup.',
          },
          images: [PHOTO_A.sunkenTank],
          imageAlts: [ALT_A.sunkenTank],
        },
        {
          path: 'yacht-day-with-an-introductory-dive',
          price: PROGRAMMES_A.HBT_INTRO_DIVE_YACHT,
          title: 'Hurghada Yacht Day with a First Dive and Orange Bay',
          short: 'Eight hours from Hurghada: a ten-to-fifteen-minute introductory dive for each guest, snorkelling, Orange Bay and an open buffet lunch.',
          description: 'A gentle way to try diving. The car collects you from your hotel in Hurghada at half past seven, and the yacht sails to Orange Bay Island for time on the beach.\n\nEach guest has a short introductory dive with an instructor, the diving equipment, a suit and a life vest; no certificate is needed, and diving is not allowed under thirteen. A snorkelling stop, an open buffet lunch, drinks, snacks, a massage and the nature reserve and marine fees are in the price. Children have their own price.',
          highlights: ['A first dive with an instructor', 'No certificate needed', 'Orange Bay and a snorkelling stop', 'An open buffet lunch'],
          seo: {
            metaTitle: 'Hurghada First Dive Yacht Day with Orange Bay',
            metaDescription: 'Eight hours from Hurghada: a short introductory dive, snorkelling, Orange Bay, an open buffet lunch, the fees and hotel pickup.',
          },
          images: [PHOTO_A.diverOnReef],
          imageAlts: [ALT_A.diverOnReef],
        },
        {
          path: 'orange-bay-snorkelling-and-diving',
          price: PROGRAMMES_A.HBT_ORANGE_DIVE,
          title: 'Orange Bay Snorkelling and Scuba Day from Hurghada',
          short: 'Eight and a half hours from Hurghada: snorkelling, a scuba dive with the equipment, Orange Bay Island and an open buffet lunch.',
          description: 'A day at sea with snorkelling and a scuba dive. The car collects you from your hotel in Hurghada at half past seven, and the boat sails past Giftun to Orange Bay Island.\n\nThe diving and snorkelling equipment, a life vest, the marine fee, snacks, an open buffet lunch and soft and hot drinks are in the price. Bring a hat, a towel and reef-safe sunscreen. Children have their own price.',
          highlights: ['A scuba dive with the equipment', 'Snorkelling by boat', 'Orange Bay Island', 'An open buffet lunch'],
          seo: {
            metaTitle: 'Orange Bay Snorkelling and Scuba Day from Hurghada',
            metaDescription: 'Eight and a half hours from Hurghada: a scuba dive, snorkelling, Orange Bay Island, an open buffet lunch and hotel pickup.',
          },
          images: [PHOTO_A.diverDescending],
          imageAlts: [ALT_A.diverDescending],
        },
        {
          path: 'el-gouna-two-boat-dives',
          price: PROGRAMMES_A.D2E_GOUNA_TWO_TANK,
          title: 'El Gouna Two-Tank Boat Dives for Certified Divers',
          short: 'Eight hours from El Gouna: two guided boat dives for certified divers, with or without the rental equipment.',
          description: 'A dive day for certified divers. The car collects you from your hotel in El Gouna at eight and drives to the harbour, where you set up your gear on the way out.\n\nThere are two guided dives at two sites with a surface interval between them, and the boat has toilets and showers. Tanks, weights, Nitrox for certified divers, water and fruit are in the price; choose the option with the full rental set if you do not bring your own. Lunch is not included. Bring your certification card and your dive log. Children have their own price.',
          highlights: ['Two guided boat dives', 'With or without the rental set', 'Nitrox for certified divers', 'Hotel pickup in El Gouna'],
          seo: {
            metaTitle: 'El Gouna Two-Tank Boat Dives for Certified Divers',
            metaDescription: 'Two guided boat dives from El Gouna for certified divers, with or without the rental equipment, Nitrox and hotel pickup.',
          },
          images: [PHOTO_A.diveBoatFromAbove],
          imageAlts: [ALT_A.diveBoatFromAbove],
          where: { city: 'El Gouna', area: 'El Gouna', coordinates: EL_GOUNA },
        },
        {
          path: 'makadi-bay-two-guided-dives',
          price: PROGRAMMES_A.D2E_MAKADI_DIVES,
          title: 'Makadi Bay Diving Boat Day with Two Dives and Lunch',
          short: 'Seven hours from Makadi Bay: two guided dives with the full equipment, a buffet lunch and soft drinks.',
          description: 'A full day on a diving boat from Makadi Bay. The car collects you from your hotel at a quarter to eight, and the boat leaves after a safety briefing and the equipment set-up.\n\nTwo guided dives with an instructor, on two reefs, frame a buffet lunch on board, with soft drinks and water. The full diving equipment is in the price. Ask the team before you book whether the dives suit your level. Bring a towel and a copy of your passport. Children have their own price.',
          highlights: ['Two guided dives', 'The full equipment included', 'A buffet lunch on board', 'Hotel pickup in Makadi Bay'],
          seo: {
            metaTitle: 'Makadi Bay Diving Boat Day with Two Dives and Lunch',
            metaDescription: 'Seven hours from Makadi Bay: two guided dives with the full equipment, a buffet lunch, soft drinks and hotel pickup.',
          },
          images: [PHOTO_A.whiteDiveYacht],
          imageAlts: [ALT_A.whiteDiveYacht],
          where: { city: 'Makadi Bay', area: 'Makadi Bay', coordinates: MAKADI },
        },
        {
          path: 'ras-mohamed-dives-and-white-island',
          price: PROGRAMMES_A.D2E_RAS_MOHAMED_DIVES,
          title: 'Ras Mohamed and White Island Dive Day from Sharm El Sheikh',
          short: 'A boat day from Sharm El Sheikh: an introductory dive, or two dives for certified divers, at Ras Mohamed, with White Island and lunch.',
          description: 'A seven-hour boat day into Ras Mohamed National Park. The coach collects you from your hotel in Sharm El Sheikh at eight and drives to the marina.\n\nChoose an introductory dive with an instructor, for ages ten to fifty, or two dives for certified divers with the full gear except a computer. Both include the park entry, the equipment, a snorkelling stop at Ras Mohamed, a stop at White Island and a buffet lunch with drinks. Photos and videos are not included. Children have their own price on the introductory option.',
          highlights: ['Diving in Ras Mohamed National Park', 'An introductory dive or two dives', 'A stop at White Island', 'A buffet lunch on board'],
          seo: {
            metaTitle: 'Ras Mohamed Dive Day from Sharm El Sheikh',
            metaDescription: 'From Sharm El Sheikh: an introductory dive or two dives at Ras Mohamed, White Island, the park entry, the equipment and lunch.',
          },
          images: [PHOTO_A.snorkelMask],
          imageAlts: [ALT_A.snorkelMask],
          where: FROM_SHARM,
        },
        {
          path: 'ras-mohamed-snorkelling-with-introductory-dives',
          price: PROGRAMMES_A.D2E_RAS_MOHAMED_SNORKEL,
          title: 'Ras Mohamed Snorkelling Yacht with One or Two Introductory Dives',
          short: 'Eight hours from Sharm El Sheikh: snorkelling at Ras Mohamed, White Island, lunch on board, and one or two introductory dives.',
          description: 'A yacht day in Ras Mohamed National Park with a first taste of diving. The car collects you from your hotel in Sharm El Sheikh at a quarter to nine, and the yacht cruises into the park, its fee covered.\n\nThere are two snorkelling stops at Ras Mohamed and a stop at White Island with lunch on board, and one or two introductory dives with a certified instructor, by the option you choose. Snorkelling gear is not included, so bring your own. The yacht has bathrooms and freshwater showers. Children have their own price.',
          highlights: ['One or two introductory dives', 'Two snorkelling stops at Ras Mohamed', 'A stop at White Island', 'Lunch on the yacht'],
          seo: {
            metaTitle: 'Ras Mohamed Snorkelling Yacht with Introductory Dives',
            metaDescription: 'Eight hours from Sharm El Sheikh: snorkelling at Ras Mohamed, White Island, lunch and one or two introductory dives, with hotel pickup.',
          },
          images: [PHOTO_A.snorkellerOverCoral],
          imageAlts: [ALT_A.snorkellerOverCoral],
          where: FROM_SHARM,
        },
        {
          path: 'tiran-island-yacht-with-one-dive',
          price: PROGRAMMES_A.D2E_TIRAN,
          title: 'Tiran Island Yacht Day with Snorkelling and One Dive',
          short: 'Seven hours from Sharm El Sheikh: snorkelling near Tiran Island, one introductory dive, a buffet lunch and drinks.',
          description: 'A yacht day north to Tiran Island. The van collects you from your hotel in Sharm El Sheikh at eight, and the yacht sails up the coast for the first snorkelling stop near the island.\n\nThe second stop is for your introductory dive; beginners stay at five or six metres, and certified divers can join too. A buffet lunch, hot and cold drinks, life jackets, the Ras Nasrani entrance fees and the boat’s bathroom and shower are in the price. Children have their own price.',
          highlights: ['Snorkelling near Tiran Island', 'One introductory dive', 'A buffet lunch on board', 'The entrance fees included'],
          seo: {
            metaTitle: 'Tiran Island Yacht Day with Snorkelling and One Dive',
            metaDescription: 'Seven hours from Sharm El Sheikh: snorkelling near Tiran Island, one introductory dive, a buffet lunch, drinks and hotel pickup.',
          },
          images: [PHOTO_A.snorkellerAndParrotfish],
          imageAlts: [ALT_A.snorkellerAndParrotfish],
          where: FROM_SHARM,
        },
        {
          path: 'dahab-lighthouse-reef-first-dive',
          price: PROGRAMMES_A.D2E_DAHAB_FIRST_DIVE,
          title: 'First Scuba Dive at the Dahab Lighthouse Reef',
          short: 'Two hours in Dahab: a briefing, a shallow-water practice and a forty-to-fifty-minute guided dive, with photos and the transfer.',
          description: 'A first dive on Dahab’s Lighthouse Reef, at the hour you choose between seven in the morning and six in the evening. The transfer collects you from your hotel in Dahab, and the instructor starts with a briefing and a practice session in shallow water.\n\nThe dive itself lasts forty to fifty minutes with your instructor, the full equipment included, and you receive photos of it. Food and drinks are not included. Children have their own price.',
          highlights: ['A first dive with an instructor', 'Practice in shallow water first', 'Photos of your dive', 'Twelve start times a day'],
          seo: {
            metaTitle: 'Dahab Lighthouse Reef First Scuba Dive with Photos',
            metaDescription: 'A first scuba dive at the Dahab Lighthouse Reef: a briefing, a shallow practice, a guided dive, photos and hotel pickup in Dahab.',
          },
          images: [PHOTO_A.diverRedCoral],
          imageAlts: [ALT_A.diverRedCoral],
          where: { city: 'Dahab', area: 'Dahab', coordinates: DAHAB },
        },
      ],
    },
  ],
};

// ================================================================================================================
// B09B: Marsa Alam Red Sea Egypt, Wadi El Gemal Reserve and Shaab Samadai.
// ================================================================================================================

const PICKUP_MARSA = 'Pickup and drop-off at your hotel in Marsa Alam';
/** The camel and horse rides collect from the area each option names. */
const PICKUP_BY_AREA = 'Pickup and drop-off at your hotel in the area your option names';

const PROGRAMMES_B = {
  MA_CAMEL: {
    provider: 'eeo',
    tenant: EEO,
    source: 'marsa-alam-camel-riding-across-the-desert-red-sea-coast',
    category: ADVENTURE,
    // The three options with hotel pickup, one for each area; the record sells no option without it here.
    options: [
      'coraya-bay-airport-2-hour-desert-sea-camel-ri-cf0be967455b',
      'port-ghalib-2-hour-camel-ride-through-desert--3f47348776a6',
      'marsa-alam-city-2-hour-camel-ride-through-des-f5b50f2acba2',
    ],
    addons: [],
    departures: ['05:00', '07:00', '09:00', '14:00', '16:00'],
    rename: {
      'coraya-bay-airport-2-hour-desert-sea-camel-ri-cf0be967455b': {
        name: 'From Coraya Bay and the airport hotels',
        description: 'Two hours on a camel through the desert and along the coast, with pickup from Coraya Bay or a hotel near the airport.',
      },
      'port-ghalib-2-hour-camel-ride-through-desert--3f47348776a6': {
        name: 'From Port Ghalib',
        description: 'The same two-hour ride, with pickup from your hotel in Port Ghalib.',
      },
      'marsa-alam-city-2-hour-camel-ride-through-des-f5b50f2acba2': {
        name: 'From Marsa Alam town',
        description: 'The same two-hour ride, with pickup from your hotel in Marsa Alam town.',
      },
    },
    // The pickup lines hold "if selected" and each option sold includes it; the breakfast belongs to the 05:00 start
    // alone; "suitable for all levels" and "small group" are claims the network cannot back; the helmet is on request.
    omit: {
      inclusions: [
        'Hotel pick-up and drop-off (if selected)',
        'Transport in an air-conditioned vehicle (if selected)',
        'Friendly, well-trained camels suitable for all levels',
        'Oriental breakfast (for sunrise tour only)',
        'Helmet (available upon request)',
        'Small group experience',
      ],
      exclusions: ['Food and drinks (except sunrise breakfast)', 'Photo or video service (available upon request)'],
      // Two items run together.
      whatToBring: ['Comfortable shoesSunglasses'],
    },
    add: {
      inclusions: [PICKUP_BY_AREA, 'Transport in an air-conditioned vehicle'],
      exclusions: ['Food and drinks', 'Photos and videos'],
      needToKnow: [SAME_PRICE, BY_AREA, 'Wear comfortable shoes and sunglasses.'],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '30 minutes', description: 'The car collects you from your hotel in the area your option names.' },
      { title: 'Meeting the camels', description: 'Safety instructions and an introduction to your camel with the guide.' },
      { title: 'Desert and coast', duration: '2 hours', description: 'A guided ride along desert trails and the Red Sea shore.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The car returns you to your hotel.' },
    ],
  },
  MA_HORSE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'marsa-alam-horseback-adventure-desert-sea-horse-swim',
    category: ADVENTURE,
    // The four two-hour options with hotel pickup. The four-hour options add a swim with the horses and leave at
    // the same times, but the network does not sell a swim it cannot describe from the record.
    options: [
      'horse-riding-tour-for-2-hours-coraya-bay-airp-aa43f090c69b',
      'horse-riding-tour-for-2-hours-port-ghalib-hot-3b690337586f',
      'horse-riding-tour-for-2-hours-abu-dabbab-area-2d1e45c35a6f',
      'horse-riding-tour-for-2-hours-marsa-alam-city-ed97e860d402',
    ],
    addons: [],
    departures: ['05:00', '07:00', '09:00', '14:00', '16:00'],
    // Each option sold is three hours with the transfers; the record's "2 - 5 hours" covers the longer options.
    duration: '3 hours',
    rename: {
      'horse-riding-tour-for-2-hours-coraya-bay-airp-aa43f090c69b': {
        name: 'From Coraya Bay and the airport hotels',
        description: 'Two hours on horseback through the desert and along the coast, with pickup from Coraya Bay or a hotel near the airport.',
      },
      'horse-riding-tour-for-2-hours-port-ghalib-hot-3b690337586f': {
        name: 'From Port Ghalib',
        description: 'The same two-hour ride, with pickup from your hotel in Port Ghalib.',
      },
      'horse-riding-tour-for-2-hours-abu-dabbab-area-2d1e45c35a6f': {
        name: 'From Abu Dabbab',
        description: 'The same two-hour ride, with pickup from your hotel around Abu Dabbab.',
      },
      'horse-riding-tour-for-2-hours-marsa-alam-city-ed97e860d402': {
        name: 'From Marsa Alam town',
        description: 'The same two-hour ride, with pickup from your hotel in Marsa Alam town.',
      },
    },
    omit: {
      inclusions: [
        'Hotel pick-up and drop-off (if selected)',
        'Transport in an air-conditioned vehicle (if selected)',
        '2-hour or 4-hour horseback riding tour',
        'Swim stop in the sea (VIP 4-hour options only)',
        'Oriental breakfast (for sunrise tour only)',
        'Small group experience based on riding level',
      ],
      exclusions: ['Food and drinks (except sunrise breakfast)', 'Towel or swimsuit for swim stop', 'Photo or video service (available upon request)'],
    },
    add: {
      inclusions: [PICKUP_BY_AREA, 'Transport in an air-conditioned vehicle', 'A two-hour guided ride'],
      exclusions: ['Food and drinks', 'Photos and videos'],
      needToKnow: [SAME_PRICE, BY_AREA],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '30 minutes', description: 'The car collects you from your hotel in the area your option names.' },
      { title: 'Meeting the horses', description: 'Safety instructions, a helmet and an introduction to your horse with the guide.' },
      { title: 'Desert and coast', duration: '2 hours', description: 'A guided ride along desert trails and the Red Sea shore.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The car returns you to your hotel.' },
    ],
  },
  MA_LUXOR: {
    provider: 'eeo',
    tenant: EEO,
    source: 'marsa-alam-to-luxor-valley-of-the-kings-ancient-temples-tour',
    category: DAY_TRIPS,
    options: ['from-marsa-alam-luxor-guided-tour-with-valley-45acbfa6db7b'],
    addons: [],
    departures: ['03:00'],
    departureLabels: { '03:00': 'Night start' },
    rename: {
      'from-marsa-alam-luxor-guided-tour-with-valley-45acbfa6db7b': {
        name: 'Luxor in a day from Marsa Alam',
        description: 'The Valley of the Kings, the Temple of Hatshepsut, Karnak and the Colossi of Memnon with a guide, a buffet lunch and the transfers.',
      },
    },
    childNote: CHILD_NOTE,
    // Tutankhamun's tomb belongs to an option the trip does not sell.
    omit: {
      inclusions: ['Tutankhamun\'s tomb (if option selected)'],
      exclusions: ['Entrance to Tutankhamun\'s tomb unless option booked'],
    },
    add: { exclusions: ['Entrance to Tutankhamun’s tomb'] },
    // The record's schedule lists the Temple of Hatshepsut twice and Karnak not at all; its inclusions name Karnak.
    itinerary: [
      { time: '03:00', title: 'Hotel pickup', duration: '7 hours', description: 'The van collects you from your hotel in Marsa Alam in the night for the long drive to Luxor.' },
      { title: 'The Valley of the Kings', duration: '2 hours', description: 'The royal tombs with your guide.' },
      { title: 'The Temple of Hatshepsut', duration: '45 minutes', description: 'The terraced temple below the cliffs.' },
      { title: 'The Colossi of Memnon', duration: '20 minutes', description: 'A stop at the two great seated statues.' },
      { title: 'Lunch', description: 'A buffet lunch at a restaurant.' },
      { title: 'Karnak', description: 'The temples of Karnak on the east bank.' },
      { title: 'Back to Marsa Alam', duration: '7 hours', description: 'The drive back to your hotel.' },
    ],
  },
  WADI_EL_GEMAL: {
    provider: 'eeo',
    tenant: EEO,
    source: 'marsa-alam-wadi-el-gemal-jeep-safari-bedouin-dinner',
    category: ADVENTURE,
    options: ['marsa-alam-wadi-el-gemal-desert-jeep-safari-b-f93ac389582f'],
    addons: [],
    departures: ['12:00'],
    rename: {
      'marsa-alam-wadi-el-gemal-desert-jeep-safari-b-f93ac389582f': {
        name: 'Jeep safari with a Bedouin dinner',
        description: 'Wadi El Gemal National Park by jeep: a panorama, an acacia, a water spring, an arak tree, Cleopatra’s Temple and a Bedouin dinner.',
      },
    },
    childNote: CHILD_NOTE,
    add: { needToKnow: ['The team confirms the order of the stops when it confirms your booking.'] },
    // The record publishes no schedule; the day is written from the stops its inclusions name, in no promised order.
    itinerary: [
      { time: '12:00', title: 'Hotel pickup', description: 'The jeep collects you from your hotel in Marsa Alam.' },
      { title: 'Into Wadi El Gemal', description: 'The drive into the national park, with a stop at a panorama over the valley.' },
      { title: 'Acacia and arak trees', description: 'Stops at an acacia and an arak tree in the valley.' },
      { title: 'The water spring', description: 'A stop at a desert spring.' },
      { title: 'Cleopatra’s Temple', description: 'A visit to the temple ruins in the park.' },
      { title: 'Bedouin dinner', description: 'Dinner in the Bedouin way before the drive back to your hotel.' },
    ],
  },
  SHAAB_SAMADAI: {
    provider: 'eeo',
    tenant: EEO,
    source: 'shaab-samadai-dolphin-sanctuary-snorkel-cruise-from-marsa-alam',
    category: WATER,
    // The record's only option is the trip itself under a wrong name: it is titled "National Park Fee (Adult)" but
    // describes the cruise, at 100 adult and 53 child from 10:00. The owner's rule for a trip without a usable price
    // (22 Oct 2026: book it at the best price on record, never "ask us") puts the client's own bookable option first,
    // so the day sells at it under its own name, and the price stays on the client's list to confirm. The park fee
    // stays outside the price: the record lists it as not included and its 12 extra is bound to no option.
    options: ['national-park-fee-adult-d39334dec233'],
    rename: {
      'national-park-fee-adult-d39334dec233': {
        name: 'Shaab Samadai snorkelling boat day',
        description: 'Hotel pickup in Marsa Alam, two guided snorkelling sessions at Shaab Samadai and a buffet lunch on board.',
      },
    },
    childNote: CHILD_NOTE,
    addons: [],
    departures: ['10:00'],
    departureLabels: { '10:00': 'Morning' },
    omit: { exclusions: ['wetsuit available Additional fee (10€/Person)'] },
    add: { exclusions: ['A wetsuit, which can be hired on the day'] },
    // The record's description names Dolphin House, a reef off Hurghada, and promises a swim "alongside wild spinner
    // dolphins"; the site names Shaab Samadai and says where to look, never what you will see.
    itinerary: [
      { title: 'Hotel pickup', description: 'The car collects you from your hotel in Marsa Alam and drives to the boat.' },
      { title: 'Out to Shaab Samadai', description: 'The boat sails to the horseshoe reef of Shaab Samadai.' },
      { title: 'First snorkelling session', description: 'A guided session with the equipment, in the lagoon where spinner dolphins often rest.' },
      { title: 'Lunch on board', description: 'A buffet lunch with soft drinks.' },
      { title: 'Second snorkelling session', description: 'A second guided session over the coral gardens.' },
      { title: 'Back to your hotel', description: 'The boat returns and the car takes you back to your hotel in Marsa Alam.' },
    ],
  },
} satisfies Record<string, PriceSpec>;

const PHOTO_B = {
  camelAtDusk: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788892012/tours/tv05slg8nlgwexjtazww.jpg',
  ridersOnShore: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795602/tours/ghskisf9epcbmmlr00ql.jpg',
  tombCorridor: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795436/tours/ofxkew9zdcef0leaoqhp.jpg',
  camelInLagoon: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788796111/tours/qlu2ucaa2kzydntyyovj.jpg',
  dolphinsAndSwimmer: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795260/tours/fs65spccs0uncfww6z9k.jpg',
};

const ALT_B: Record<keyof typeof PHOTO_B, string> = {
  camelAtDusk: 'A rider in a hat on a camel crossing sand in low golden light, with the sea and low buildings behind',
  ridersOnShore: 'A line of riders on horseback along a sandy beach, with small waves breaking beside them',
  tombCorridor: 'A long painted corridor cut into rock, with a wooden walkway and handrails leading down',
  camelInLagoon: 'A camel standing in shallow water between green mangrove bushes, with a low ridge behind',
  dolphinsAndSwimmer: 'Three dolphins swimming above a coral reef, with a snorkeller in a yellow top swimming nearby',
};

/** The Marsa Alam sites' trips stay between Port Ghalib, Marsa Alam and Wadi El Gemal; the Luxor day goes inland. */
const NOT_MARSA_ALAM = /Gouna|Hurghada|Makadi|Sahl|Safaga|Soma Bay|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Catherine|Cairo|Giza|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Pyramid|Sphinx|Dolphin House/i;
const NOT_WADI_EL_GEMAL = /Gouna|Hurghada|Makadi|Sahl|Safaga|Soma Bay|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Catherine|Cairo|Giza|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Pyramid|Sphinx/i;
/** Shaab Samadai is not Dolphin House: the record names Hurghada's reef, and this site never does. */
const NOT_SAMADAI = /Gouna|Hurghada|Makadi|Sahl|Safaga|Soma Bay|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Catherine|Cairo|Giza|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Pyramid|Sphinx|Dolphin House/i;

const SAMADAI_TRIP = {
  path: 'shaab-samadai-snorkelling-boat-day',
  price: PROGRAMMES_B.SHAAB_SAMADAI,
  title: 'Shaab Samadai Snorkelling Boat Day from Marsa Alam',
  short: 'Seven hours from Marsa Alam: two guided snorkelling sessions at the reef of Shaab Samadai and a buffet lunch on the boat.',
  description: 'A boat day to Shaab Samadai, the horseshoe reef south of Marsa Alam whose lagoon spinner dolphins often use to rest. The car collects you from your hotel in Marsa Alam, and the boat sails out to the reef.\n\nThere are two guided snorkelling sessions with the equipment and life jackets, refreshments and soft drinks, and a buffet lunch on board. Dolphins are wild animals, so no boat can promise a sighting. The park fee, a wetsuit and pickup from North and South Marsa Alam are paid separately.',
  highlights: ['The reef of Shaab Samadai', 'Two guided snorkelling sessions', 'A buffet lunch on board', 'Hotel pickup in Marsa Alam'],
  seo: {
    metaTitle: 'Shaab Samadai Snorkelling Boat Day from Marsa Alam',
    metaDescription: 'Seven hours from Marsa Alam: two guided snorkelling sessions at Shaab Samadai, a buffet lunch on board and hotel pickup.',
  },
  images: [PHOTO_B.dolphinsAndSwimmer],
  imageAlts: [ALT_B.dolphinsAndSwimmer],
};

export const B09B: NetworkBatch = {
  id: 'b09b',
  sites: [
    {
      slug: 'marsa-alam-red-sea-egypt',
      name: 'Marsa Alam Red Sea Egypt',
      listingPath: '/trips',
      domain: 'marsaalamredseaegypt.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'mare-',
      foreignPlaces: NOT_MARSA_ALAM,
      tagline: 'Days out from Marsa Alam',
      description: 'Marsa Alam Red Sea Egypt sells days out from Marsa Alam: camel and horse rides along the desert and the shore, boat days to Marsa Mubarak and Shaab Samadai, a jeep safari in Wadi El Gemal National Park and a long day to the temples and tombs of Luxor.\n\nTurtles, dugongs and dolphins are wild animals, so no boat can promise a sighting. Every trip collects you from your hotel and brings you back. Hold a place online and pay later, or ask the team first.',
      seo: {
        metaTitle: 'Marsa Alam Trips: Boats, Desert Rides and Luxor',
        metaDescription: 'Days out from Marsa Alam: camel and horse rides, Marsa Mubarak and Shaab Samadai by boat, Wadi El Gemal by jeep and Luxor in a day. Hotel pickup.',
        keywords: ['marsa alam excursions', 'marsa alam trips', 'marsa alam camel ride', 'marsa alam to luxor', 'wadi el gemal safari'],
      },
      theme: { primaryColor: '#7A3E1D', secondaryColor: '#F7EFE6', accentColor: '#1F7A8C' },
      heroImages: [PHOTO_B.camelAtDusk, PHOTO_B.ridersOnShore, PHOTO_C.turtleOverReef],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/marsa-alam-red-sea-egypt/monogram.png',
      trips: [
        {
          path: 'marsa-mubarak-snorkelling-day-with-lunch',
          price: PROGRAMMES_C.MM_TURTLE,
          title: 'Marsa Mubarak Boat Day with Snorkelling Gear and Lunch',
          short: 'Eight hours from Marsa Alam: guided snorkelling in the bay of Marsa Mubarak, with the gear, lunch on board and the park fees.',
          description: 'A full day in the bay of Marsa Mubarak, north of Marsa Alam. The transfer collects you from your hotel at nine and takes you to the boat, and the instructors lead the first snorkelling session among the coral and the reef fish, where you can look for sea turtles and dugongs. They are wild animals, so no boat can promise a sighting.\n\nLunch and soft drinks on board come between the two sessions. The mask, fins and life jacket and the national park fees are in the price; tips are not. Pickup from North Marsa Alam costs extra. Children have their own price.',
          highlights: ['Two snorkelling sessions at Marsa Mubarak', 'The gear included', 'Lunch on board', 'The national park fees included'],
          seo: {
            metaTitle: 'Marsa Mubarak Snorkelling Day from Marsa Alam with Lunch',
            metaDescription: 'Eight hours from Marsa Alam: guided snorkelling at Marsa Mubarak with the gear, lunch on board, the park fees and hotel pickup.',
          },
          images: [PHOTO_C.turtleOverReef],
          imageAlts: ['A sea turtle swimming just under the surface above a shallow coral reef'],
        },
        {
          path: 'marsa-mubarak-sailing-boat',
          price: PROGRAMMES_C.MM_SAILING,
          title: 'Sailing Boat from Port Ghalib to Marsa Mubarak',
          short: 'Four and a half hours on a sailing boat from Port Ghalib: snorkelling at Marsa Mubarak and Marsa Shona and an open buffet on deck.',
          description: 'A half day under sail from Port Ghalib, morning or afternoon. A shared bus collects you from your hotel about ninety minutes before the boat leaves, and the sail to Marsa Mubarak takes about thirty-five minutes.\n\nThe guides lead two forty-five-minute snorkelling stops, at Marsa Mubarak and Marsa Shona, and an open buffet is served on deck with soft drinks and tea. Snorkelling gear is not included. Children have their own price.',
          highlights: ['Under sail from Port Ghalib', 'Two snorkelling stops', 'An open buffet on deck', 'Morning or afternoon'],
          seo: {
            metaTitle: 'Port Ghalib Sailing Boat to Marsa Mubarak and Marsa Shona',
            metaDescription: 'Four and a half hours under sail from Port Ghalib: snorkelling at Marsa Mubarak and Marsa Shona, an open buffet and hotel pickup.',
          },
          images: [PHOTO_C.snorkellerAndSails],
          imageAlts: ['A snorkeller in a mask at the surface of clear green water, with a tall sailing boat under sail behind'],
        },
        {
          path: 'marsa-mubarak-and-small-shenwa',
          price: PROGRAMMES_C.MM_DUGONG,
          title: 'Marsa Mubarak and Small Shenwa Snorkelling with a Meal',
          short: 'Four and a half hours from Marsa Alam: two guided snorkelling stops, a meal on board and a walk around Port Ghalib Marina.',
          description: 'A short boat day on two reefs north of Marsa Alam. The bus collects you from your hotel, and the boat reaches Marsa Mubarak in about half an hour.\n\nThe guides lead two snorkelling stops, at Marsa Mubarak and Small Shenwa, where turtles and dugongs live; they are wild, and no boat can promise a sighting. An open buffet lunch or dinner is served on board, and the day ends with a walk around Port Ghalib Marina. Snorkelling gear is not included. The team confirms the pickup time after booking. Children have their own price.',
          highlights: ['Marsa Mubarak and Small Shenwa', 'Two guided snorkelling stops', 'A meal on board', 'Port Ghalib Marina'],
          seo: {
            metaTitle: 'Marsa Mubarak and Small Shenwa Snorkelling with a Meal',
            metaDescription: 'Four and a half hours from Marsa Alam: two snorkelling stops, a meal on board, Port Ghalib Marina and hotel pickup.',
          },
          images: [PHOTO_C.turtleInBlue],
          imageAlts: ['A large sea turtle in deep blue water, with small fish and a reef behind it'],
        },
        SAMADAI_TRIP,
        {
          path: 'wadi-el-gemal-jeep-safari',
          price: PROGRAMMES_B.WADI_EL_GEMAL,
          title: 'Wadi El Gemal Jeep Safari with a Bedouin Dinner',
          short: 'Seven hours from Marsa Alam: Wadi El Gemal National Park by jeep, a desert spring, Cleopatra’s Temple and a Bedouin dinner.',
          description: 'An afternoon and evening in Wadi El Gemal National Park, south of Marsa Alam. The jeep collects you from your hotel at noon and drives into the park.\n\nThe stops are a panorama over the valley, an acacia and an arak tree, a water spring and the ruins of Cleopatra’s Temple, and the day ends with a Bedouin dinner before the drive back. The team confirms the order of the stops when it confirms your booking. Children have their own price.',
          highlights: ['Wadi El Gemal National Park by jeep', 'A desert spring', 'Cleopatra’s Temple', 'A Bedouin dinner'],
          seo: {
            metaTitle: 'Wadi El Gemal Jeep Safari from Marsa Alam',
            metaDescription: 'Seven hours from Marsa Alam: Wadi El Gemal by jeep, a water spring, Cleopatra’s Temple, a Bedouin dinner and hotel pickup.',
          },
          images: [PHOTO_B.camelInLagoon],
          imageAlts: [ALT_B.camelInLagoon],
        },
        {
          path: 'camel-ride-desert-and-coast',
          price: PROGRAMMES_B.MA_CAMEL,
          title: 'Two-Hour Camel Ride along the Marsa Alam Desert and Coast',
          short: 'Two hours on a camel through the desert and along the Red Sea shore, with pickup from Coraya Bay, Port Ghalib or Marsa Alam town.',
          description: 'A camel ride at the edge of the desert, at sunrise, in the morning or in the late afternoon. The car collects you from your hotel, and the guide gives safety instructions and introduces your camel.\n\nThe ride lasts two hours along desert trails and the shore. The price depends on where your hotel is: choose Coraya Bay and the airport hotels, Port Ghalib or Marsa Alam town. Food, drinks, photos and tips are not included. Children pay the same price as adults.',
          highlights: ['Two hours on a camel', 'Desert trails and the shore', 'Five start times a day', 'Pickup from three areas'],
          seo: {
            metaTitle: 'Marsa Alam Camel Ride through the Desert and Coast',
            metaDescription: 'Two hours on a camel along the Marsa Alam desert and shore, with hotel pickup from Coraya Bay, Port Ghalib or Marsa Alam town.',
          },
          images: [PHOTO_B.camelAtDusk],
          imageAlts: [ALT_B.camelAtDusk],
        },
        {
          path: 'horse-ride-desert-and-coast',
          price: PROGRAMMES_B.MA_HORSE,
          title: 'Two-Hour Horse Ride along the Marsa Alam Desert and Coast',
          short: 'Two hours on horseback through the desert and along the shore, with pickup from Coraya Bay, Port Ghalib, Abu Dabbab or Marsa Alam town.',
          description: 'A guided horse ride from Marsa Alam, at sunrise, in the morning or in the late afternoon. The car collects you from your hotel, and the guide fits a helmet, gives safety instructions and introduces your horse.\n\nThe ride lasts two hours along desert trails and the Red Sea shore. The price depends on where your hotel is: choose Coraya Bay and the airport hotels, Port Ghalib, Abu Dabbab or Marsa Alam town. Food, drinks, photos and tips are not included. Children pay the same price as adults.',
          highlights: ['Two hours on horseback', 'Desert trails and the shore', 'Helmet and safety equipment', 'Pickup from four areas'],
          seo: {
            metaTitle: 'Marsa Alam Horse Ride through the Desert and Coast',
            metaDescription: 'Two hours on horseback along the Marsa Alam desert and shore, with a helmet and hotel pickup from four areas around the town.',
          },
          images: [PHOTO_B.ridersOnShore],
          imageAlts: [ALT_B.ridersOnShore],
        },
        {
          path: 'luxor-in-a-day',
          price: PROGRAMMES_B.MA_LUXOR,
          title: 'Luxor in a Day from Marsa Alam: Valley of the Kings and Karnak',
          short: 'A long day from Marsa Alam to Luxor: the Valley of the Kings, the Temple of Hatshepsut, the Colossi of Memnon and Karnak, with lunch.',
          description: 'A very long day to Luxor. The van collects you from your hotel in Marsa Alam at three in the morning for the drive of about seven hours, and your guide starts with two hours in the Valley of the Kings.\n\nThe Temple of Hatshepsut and the Colossi of Memnon follow, then a buffet lunch and the temples of Karnak before the drive back. The guide, lunch and the transfers are in the price; Tutankhamun’s tomb and pickup north of Marsa Alam are not. Children have their own price.',
          highlights: ['The Valley of the Kings', 'The Temple of Hatshepsut', 'Karnak', 'A buffet lunch'],
          seo: {
            metaTitle: 'Luxor Day Trip from Marsa Alam: Valley of the Kings',
            metaDescription: 'From Marsa Alam to Luxor in a day: the Valley of the Kings, Hatshepsut, the Colossi of Memnon and Karnak with a guide, lunch and pickup.',
          },
          images: [PHOTO_B.tombCorridor],
          imageAlts: [ALT_B.tombCorridor],
        },
      ],
    },
    {
      slug: 'wadi-el-gemal-reserve',
      name: 'Wadi El Gemal Reserve',
      listingPath: '/trips',
      domain: 'wadielgemalreserve.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'wgr-',
      foreignPlaces: NOT_WADI_EL_GEMAL,
      tagline: 'A jeep day in Wadi El Gemal National Park',
      description: 'Wadi El Gemal Reserve sells one trip: a jeep safari from Marsa Alam into Wadi El Gemal National Park, with stops at a panorama over the valley, an acacia and an arak tree, a water spring and the ruins of Cleopatra’s Temple, and a Bedouin dinner before the drive back.\n\nThe jeep collects you from your hotel in Marsa Alam at noon and brings you back. Hold a place online and pay later, or ask the team first.',
      seo: {
        metaTitle: 'Wadi El Gemal National Park Jeep Safari',
        metaDescription: 'A jeep safari from Marsa Alam into Wadi El Gemal National Park: a water spring, Cleopatra’s Temple, a Bedouin dinner and hotel pickup.',
        keywords: ['wadi el gemal', 'wadi el gemal national park', 'wadi el gemal safari', 'marsa alam jeep safari', 'cleopatra temple wadi el gemal'],
      },
      theme: { primaryColor: '#5C4A1E', secondaryColor: '#F5F0E2', accentColor: '#2E7D5B' },
      heroImages: [PHOTO_B.camelInLagoon],
      photoShortfall: 'The one trip the site sells publishes one photo.',
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/wadi-el-gemal-reserve/monogram.png',
      trips: [
        {
          path: 'wadi-el-gemal-jeep-safari-with-bedouin-dinner',
          price: PROGRAMMES_B.WADI_EL_GEMAL,
          title: 'Wadi El Gemal National Park Jeep Safari and Bedouin Dinner',
          short: 'Seven hours from Marsa Alam: the national park by jeep, a panorama, a water spring, Cleopatra’s Temple and a Bedouin dinner.',
          description: 'Seven hours in Wadi El Gemal National Park. The jeep collects you from your hotel in Marsa Alam at noon and drives into the valley, stopping at a panorama, at an acacia and an arak tree and at a desert water spring.\n\nThe visit goes on to the ruins of Cleopatra’s Temple, and the day ends with a Bedouin dinner before the drive back to your hotel. The team confirms the order of the stops when it confirms your booking. Children have their own price.',
          highlights: ['Wadi El Gemal by jeep', 'A panorama over the valley', 'A desert spring and Cleopatra’s Temple', 'A Bedouin dinner'],
          seo: {
            metaTitle: 'Wadi El Gemal Jeep Safari and Bedouin Dinner',
            metaDescription: 'Seven hours in Wadi El Gemal National Park from Marsa Alam: a panorama, a water spring, Cleopatra’s Temple, a Bedouin dinner and pickup.',
          },
          images: [PHOTO_B.camelInLagoon],
          imageAlts: [ALT_B.camelInLagoon],
        },
      ],
    },
    {
      slug: 'shaab-samadai',
      name: 'Shaab Samadai',
      listingPath: '/trips',
      domain: 'shaabsamadai.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'ssd-',
      foreignPlaces: NOT_SAMADAI,
      tagline: 'Snorkelling at the reef of Shaab Samadai',
      description: 'Shaab Samadai sells one trip: a boat day from Marsa Alam to the horseshoe reef of Shaab Samadai, with two guided snorkelling sessions and a buffet lunch on board. Spinner dolphins often rest in its lagoon; they are wild animals, so no boat can promise a sighting.\n\nThe car collects you from your hotel in Marsa Alam and brings you back. Hold a place online and pay later, or ask the team first.',
      seo: {
        metaTitle: 'Shaab Samadai Snorkelling Trip from Marsa Alam',
        metaDescription: 'A boat day from Marsa Alam to the reef of Shaab Samadai: two guided snorkelling sessions, a buffet lunch and hotel pickup.',
        keywords: ['shaab samadai', 'samadai reef snorkelling', 'shaab samadai marsa alam', 'marsa alam snorkelling trip', 'samadai boat trip'],
      },
      theme: { primaryColor: '#0F4C5C', secondaryColor: '#EAF5F4', accentColor: '#E9A23B' },
      heroImages: [PHOTO_B.dolphinsAndSwimmer],
      photoShortfall: 'The one trip the site sells publishes one photo.',
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/shaab-samadai/monogram.png',
      trips: [{ ...SAMADAI_TRIP, path: 'shaab-samadai-snorkelling-boat-trip' }],
    },
  ],
};

// ================================================================================================================
// B09C: Bahria Oasis and Turtle Bay Hurghada, each built on a network partner's trip (queue section 4: the
// network default). The client still has to agree to sell either partner's trip (queue 4.6).
// ================================================================================================================

const PROGRAMMES_C9 = {
  // Rittal Travel Egypt, "White Desert Overnight Safari" (read 28 October 2026). The record's title and length say
  // two days, while its schedule runs from a 14:00 hotel pickup to a 17:30 return in "the Eastern Desert", and its
  // two departures are a generic "Morning" and "Afternoon": the site sells it by the day and writes only what the
  // title and description say, and the days themselves are a question for the partner.
  BAHRIA_WHITE_DESERT: {
    tenant: 'rittal-travel-egypt',
    source: 'desert-safari-white',
    options: ['opt_1'],
    addons: ['addon_lunch', 'addon_photo'],
    // A lunch is eaten by each guest who takes it; one photo package covers the booking.
    perPerson: ['addon_lunch'],
    extras: {
      // "Gourmet" is the record's own praise.
      addon_lunch: { name: 'Lunch', description: 'Lunch on the day, for each guest who takes it.' },
      addon_photo: { name: 'Photo package', description: 'Photos of the trip, one package for the booking.' },
    },
    departures: [],
    rename: {
      // The option is named "Standard" and described as a "Full guided experience".
      opt_1: { name: 'Overnight in the White Desert', description: 'The guide, transport, the entrance fees and water.' },
    },
    add: {
      // The record's schedule opens with "Afternoon pickup from your hotel"; its pickup field is empty.
      inclusions: ['Hotel pickup and drop-off'],
      needToKnow: [
        SAME_PRICE,
        DAY_PICKUP,
        'The team confirms where the pickup is and the plan for each day when it confirms your booking.',
      ],
    },
    // The record's highlights ("Expert Egyptologist guide", "Skip the line access", "Authentic local experience")
    // describe another trip or make claims, and its description calls the partner "Class A"; none is carried.
    itinerary: [
      { title: 'Hotel pickup', description: 'The team collects you from your hotel at the time it confirms with your booking.' },
      { title: 'The White Desert', description: 'The drive to the White Desert with your guide, the entrance fees covered.' },
      { title: 'A night at camp', description: 'A night camping in the desert, with a Bedouin dinner.' },
      { title: 'Back to your hotel', description: 'The drive back to your hotel.' },
    ],
  },
  // Makadi Bay Snorkeling, "Snorkel & Turtle Bay Trip" (read 28 October 2026). The record carries a 4.7 rating
  // from 306 reviews with no approved review behind it, which is never copied (every network trip starts at 0).
  TURTLE_BAY: {
    tenant: 'makadi-bay-snorkeling',
    source: 'makadi-snorkel-and-turtle-bay-trip',
    options: ['adult', 'family'],
    child: {
      adult: 'adult',
      child: 'child',
      name: 'Adult',
      description: 'The full day with the gear and lunch, for guests aged twelve and over.',
      note: 'Children aged 6 to 11 have their own price, and the booking applies it.',
    },
    vehicle: { family: { riders: 4, note: 'The family pack is one price for two adults and two children aged 6 to 11.' } },
    // Hotel pickup and the wetsuit are taken per guest; one photo gallery covers the booking.
    addons: ['pickup', 'photos', 'wetsuit'],
    perPerson: ['pickup', 'wetsuit'],
    extras: {
      pickup: { name: 'Hotel pickup and drop-off', description: 'An air-conditioned van from your hotel in Makadi Bay and back.' },
      // "Guide captures your turtle swim" promises a turtle.
      photos: { name: 'Photo package', description: 'Photos the guide takes in the water, delivered as a digital gallery.' },
      wetsuit: { name: 'Shorty wetsuit', description: 'A short wetsuit for the day, in all sizes.' },
    },
    // The record is booked by the day; its one window is a full-day span, not a pickup time.
    departures: [],
    rename: {
      family: { name: 'Family pack', description: 'Two adults and two children aged 6 to 11.' },
    },
    duration: '6 hours',
    // The record sells pickup as a paid extra while marking the trip "hotel pickup": the site says how it is sold.
    omit: { exclusions: ['Hotel pickup (add-on)', 'Photos (add-on)'] },
    add: {
      exclusions: ['Hotel pickup, which is an extra', 'Photos, which are an extra'],
      needToKnow: [
        'Hotel pickup and drop-off in Makadi Bay is an extra: add it when you book.',
        DAY_PICKUP,
        'Turtles are wild animals, so no boat can promise a sighting.',
      ],
    },
    // The record publishes no schedule; the day is written from its inclusions.
    itinerary: [
      { title: 'Hotel pickup', description: 'With the pickup extra, the van collects you from your hotel in Makadi Bay.' },
      { title: 'Boarding at the marina', description: 'The boat leaves the marina with the snorkelling gear and vests on board.' },
      { title: 'Three snorkelling stops', description: 'Guided stops over coral reef and the seagrass where green turtles feed, with a briefing on watching turtles with care.' },
      { title: 'Lunch on board', description: 'Lunch with soft drinks.' },
      { title: 'Back to your hotel', description: 'The boat returns to the marina, and the van takes you back if you added pickup.' },
    ],
  },
} satisfies Record<string, PriceSpec>;

const PHOTO_C9 = {
  campUnderStars: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1775553754/attractions-network/attractions-network/rittal/tours/bvwm2aqwzgkfoul0cywf.jpg',
  snorkellersOverReef: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1776001740/attractions-network/tours/makadi-bay-snorkeling/dqgky1xrtcddcepr82g4.jpg',
};

const ALT_C9: Record<keyof typeof PHOTO_C9, string> = {
  campUnderStars: 'Two lit tents and a campfire on pale desert ground at night, with white chalk rocks and the Milky Way above',
  snorkellersOverReef: 'Two snorkellers over a shallow coral reef in clear water, with a white boat and a palm-lined beach behind',
};

/** The White Desert site's trip starts in Cairo; it never names the Red Sea, whose desert the record's schedule describes. */
const NOT_WHITE_DESERT = /Hurghada|Sharm|Dahab|Marsa Alam|Red Sea|Eastern Desert|Luxor|Aswan|Makadi|Gouna|Sahl|Safaga|Siwa|Fayoum|Alexandria|Pyramid|Sphinx/i;
/** The Turtle Bay site's trip leaves from Makadi Bay. */
const NOT_TURTLE_BAY = /Cairo|Giza|Luxor|Aswan|Sharm|Dahab|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Gouna|Sahl|Alexandria|Siwa|Bahariya|Fayoum|Tiran|Ras Mohamed|Nabq|Orange Bay|Giftun/i;

export const B09C: NetworkBatch = {
  id: 'b09c',
  sites: [
    {
      slug: 'bahria-oasis',
      name: 'Bahria Oasis',
      listingPath: '/trips',
      domain: 'bahriaoasis.com',
      city: 'Cairo',
      area: 'Cairo',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'bho-',
      foreignPlaces: NOT_WHITE_DESERT,
      tagline: 'A night in the White Desert',
      description: 'Bahria Oasis sells one trip: a night camping in the White Desert with a guide, a Bedouin dinner, transport, the entrance fees and water, starting from your hotel.\n\nThe team confirms the pickup and the plan for each day when it confirms your booking. Hold a place online and pay later, or ask the team first.',
      seo: {
        metaTitle: 'White Desert Overnight Camping Trip',
        metaDescription: 'A night camping in the White Desert with a guide, a Bedouin dinner, transport, the entrance fees and hotel pickup.',
        keywords: ['white desert camping', 'white desert overnight', 'white desert trip', 'western desert camping egypt', 'white desert safari'],
      },
      theme: { primaryColor: '#5B4636', secondaryColor: '#F6F1EA', accentColor: '#C77D3A' },
      heroImages: [PHOTO_C9.campUnderStars],
      photoShortfall: 'The one trip the site sells publishes one photo.',
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/bahria-oasis/monogram.png',
      trips: [
        {
          path: 'white-desert-overnight-camping',
          price: PROGRAMMES_C9.BAHRIA_WHITE_DESERT,
          title: 'White Desert Overnight Camping with a Bedouin Dinner',
          short: 'A night camping in the White Desert with a guide, a Bedouin dinner, transport, the entrance fees and water.',
          description: 'A night under the desert sky. The team collects you from your hotel and drives out to the White Desert with your guide, the entrance fees covered.\n\nThe night is spent at camp with a Bedouin dinner, before the drive back to your hotel. Transport, the guide, the entrance fees and water are in the price; lunch and a photo package can be added when you book, and tips are not included. The trip is sold by the day: the team confirms the pickup time and the plan for each day after booking. Children pay the same price as adults.',
          highlights: ['A night camping in the White Desert', 'A Bedouin dinner', 'A guide with you', 'The entrance fees included'],
          seo: {
            metaTitle: 'White Desert Overnight Camping with a Bedouin Dinner',
            metaDescription: 'A night camping in the White Desert with a guide, a Bedouin dinner, transport, the entrance fees and hotel pickup.',
          },
          images: [PHOTO_C9.campUnderStars],
          imageAlts: [ALT_C9.campUnderStars],
        },
      ],
    },
    {
      slug: 'turtle-bay-hurghada',
      name: 'Turtle Bay Hurghada',
      listingPath: '/trips',
      domain: 'turtlebayhurghada.com',
      city: 'Makadi Bay',
      area: 'Makadi Bay',
      pickupDestination: 'makadi-bay',
      coordinates: MAKADI,
      currency: 'USD',
      slugPrefix: 'tbh-',
      foreignPlaces: NOT_TURTLE_BAY,
      tagline: 'Snorkelling at Turtle Bay',
      // The record's highlight "Best chance to snorkel with green turtles" ranks the trip and leans on a promised
      // animal; the site says where the turtles feed and that none is promised.
      description: 'Turtle Bay Hurghada sells one trip: a snorkelling day from Makadi Bay, south of Hurghada, with three guided stops over coral reef and the seagrass where green turtles feed, the gear and lunch on board. Turtles are wild animals, so no boat can promise a sighting.\n\nHotel pickup in Makadi Bay is an extra you add when you book, and the team confirms the time. Hold a place online and pay later, or ask the team first.',
      seo: {
        metaTitle: 'Turtle Bay Snorkelling Day from Makadi Bay',
        metaDescription: 'A snorkelling day from Makadi Bay: three guided stops over reef and turtle seagrass, the gear, lunch on board and hotel pickup as an extra.',
        keywords: ['turtle bay snorkelling', 'makadi bay snorkelling', 'turtle bay hurghada', 'snorkelling with turtles hurghada', 'makadi bay boat trip'],
      },
      theme: { primaryColor: '#145A52', secondaryColor: '#E9F6F3', accentColor: '#F0B429' },
      heroImages: [PHOTO_C9.snorkellersOverReef],
      photoShortfall: 'The one trip the site sells publishes one photo of its own; its other photos belong to other operators.',
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/turtle-bay-hurghada/monogram.png',
      trips: [
        {
          path: 'turtle-bay-snorkelling-day',
          price: PROGRAMMES_C9.TURTLE_BAY,
          title: 'Turtle Bay Snorkelling Day from Makadi Bay with Lunch',
          short: 'Six hours from Makadi Bay: three guided snorkelling stops over reef and turtle seagrass, the gear and lunch on board.',
          description: 'A day on the water from Makadi Bay. You board at the marina, where the mask, snorkel, fins and vest are handed out, and the guide gives a briefing on watching turtles with care.\n\nThe boat makes three guided snorkelling stops over coral reef and the seagrass where green turtles feed; they are wild, and no boat can promise a sighting. Lunch and soft drinks are served on board, and marine insurance is in the price. Hotel pickup, a photo package and a shorty wetsuit can be added when you book. The team confirms the time after booking. Children aged 6 to 11 have their own price, and there is a family pack for two adults and two children.',
          highlights: ['Three guided snorkelling stops', 'Coral reef and turtle seagrass', 'The gear included', 'Lunch on board'],
          seo: {
            metaTitle: 'Turtle Bay Snorkelling Day from Makadi Bay with Lunch',
            metaDescription: 'Six hours from Makadi Bay: three guided snorkelling stops over reef and seagrass, the gear, lunch on board and a family pack.',
          },
          images: [PHOTO_C9.snorkellersOverReef],
          imageAlts: [ALT_C9.snorkellersOverReef],
        },
      ],
    },
  ],
};
