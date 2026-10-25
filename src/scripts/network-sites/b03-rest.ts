/**
 * Batch B03, groups 2 to 4 (25 October 2026): the seven remaining domains of the B03 set, released three at a
 * time. No network operator publishes a programme that starts in Luxor, in Cairo or Giza, or in Sharm el-Sheikh —
 * the live operators' Cairo and Luxor trips are day trips from Hurghada — and the network's Hurghada quad
 * operators already feed hurghadaquadbikesafaris.com, so every trip here is built on one the client publishes on
 * its own main site (`network-sites/eeo-source.ts`). Prices, child rates, departures and inclusions are copied
 * from that record at apply time and never typed here.
 *
 * - B03B: Temple of Karnak and Valley of the Nobles (days that start in Luxor) and Whale Valley Wadi Al Hitan
 *   (the one published day that reaches the whale fossils, leaving from Cairo or Giza).
 * - B03C: Pyramids Camel Tour (the Giza days whose price includes the camel ride), Sharm Tour Guide (a guide to
 *   the client's Sharm day trips across every kind it publishes) and Quad Safari Hurghada.
 * - B03D: Safari Sharm El Sheikh (the Sinai desert days).
 *
 * Two honesty rules run through the copy. Valley of the Nobles is named after tombs no published programme
 * visits, so every trip it sells says on its own page that the day does not include them and that guests who
 * want them should ask the team first (the Shark Reef precedent, batch B02). And where the client publishes a
 * line only conditionally ("if the option is selected"), the line is replaced by what the options this site
 * sells actually carry, so a guest never reads a promise that depends on an option the site does not sell.
 *
 * Photos are the client's own trip photos, copied into the network's Cloudinary
 * (`attractions-network/network-b03/<site>/`) so the client replacing its own never blanks a network site. Each
 * site's own photos are an open question for the client, as are its logo and its contact details.
 */
import type { NetworkBatch, PriceSpec } from '../seed-network-sites';

const EEO = 'egypt-excursions-online';
const DAY_TRIPS = 'day-trips';
const DESERT = 'adventure';
const WATER = 'water-activities';

/** Said once, where every option sold prices children separately. */
const CHILD_NOTE = 'Children have their own price, and the booking applies it. The team confirms which ages count as children when it confirms your booking.';
/** Said where some options sold price children separately and others do not. */
const MIXED_CHILD_NOTE = 'Children have their own price on the options that publish one; on the others they pay the adult price. The team confirms which ages count as children when it confirms your booking.';
/** Said where the published price is one price for everyone. */
const SAME_PRICE_NOTE = 'The published price is the same for adults and for children.';

const PICKUP_CAIRO = 'Hotel pickup and drop-off in Cairo or Giza';
const PICKUP_SHARM = 'Pickup and drop-off at your hotel in Sharm el-Sheikh';
const PICKUP_HURGHADA = 'Pickup and drop-off at your hotel in Hurghada';

/** The line every Valley of the Nobles trip carries, because no published day walks through those tombs. */
const NOT_THE_NOBLES = 'The published day does not include the Tombs of the Nobles. If you want to walk through those tombs, ask the team before you book.';

const PROGRAMMES: Record<string, PriceSpec> = {
  // ---- Temple of Karnak ------------------------------------------------------------------------------------
  TOK_BOTH_BANKS: {
    provider: 'eeo',
    tenant: EEO,
    source: 'luxor-east-west-bank-private-tour-with-traditional-felucca-nile-cruise',
    category: DAY_TRIPS,
    options: ['luxor-all-inclusive-east-and-west-banks-tour--4bfa1a490c53'],
    addons: [],
    departures: ['07:00', '08:00'],
    rename: {
      'luxor-all-inclusive-east-and-west-banks-tour--4bfa1a490c53': {
        name: 'Private day on both banks with a felucca sail',
        description: 'Your own guide and driver, the temple entry fees and lunch.',
      },
    },
    childNote: CHILD_NOTE,
    // The published pickup line names the East Bank, and the exclusions charge for a West Bank hotel, so the
    // site says which bank the included pickup covers rather than letting the line be read as any hotel.
    omit: {
      inclusions: ['Hotel pickup and drop-off From East Bank Hotels'],
      exclusions: [
        'Hotel pickup and drop-off in the West Bank (5$ per person)',
        'Spanish, German, or French-speaking guide (available as an add-on)',
      ],
    },
    add: {
      inclusions: ['Pickup and drop-off at your hotel on the East Bank of Luxor'],
      exclusions: ['Pickup from a hotel on the West Bank', 'A guide speaking Spanish, German or French'],
      needToKnow: [
        'Pickup is from hotels on the East Bank of Luxor. The published record offers West Bank pickup at an extra cost, which this site does not sell; ask the team before you book if your hotel is on the West Bank.',
        'The guide on this day speaks English. A Spanish, German or French-speaking guide is published at an extra cost, which this site does not sell.',
      ],
    },
  },
  TOK_SOUND_AND_LIGHT: {
    provider: 'eeo',
    tenant: EEO,
    source: 'luxor-sunset-felucca-ride-karnak-sound-and-light-show',
    category: DAY_TRIPS,
    options: ['sunset-felucca-ride-sound-light-show-at-karna-3151b87aa775'],
    addons: [],
    departures: [
      '03:00', '04:00', '05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
      '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00',
    ],
    rename: {
      'sunset-felucca-ride-sound-light-show-at-karna-3151b87aa775': {
        name: 'Felucca sail and the show at Karnak',
        description: 'A private car, the sail and the entry to the show.',
      },
    },
    childNote: CHILD_NOTE,
    add: {
      needToKnow: ['Start times are published through the day. The sail is timed for sunset and the show runs after dark, so the team confirms your pickup time when it confirms your booking.'],
    },
    // The programme's own schedule is four lines of transport ("Car: transport", "Luxor: Sightseeing").
    itinerary: [
      { title: 'Hotel pickup', description: 'A private air-conditioned car collects you from your hotel in Luxor.' },
      { title: 'The Nile corniche', duration: '1 hour', description: 'Aboard a wooden felucca for a sail on the river, past farmland and the Luxor waterfront as the sun goes down.' },
      { title: 'Karnak Temple', description: 'The sound and light show in the temple complex after dark, with the monuments lit and the story of ancient Thebes and of Amun, Mut and Khonsu told as you walk. The entry fee is included.' },
      { title: 'Back to your hotel', description: 'The car returns you to your hotel in Luxor.' },
    ],
  },

  // ---- Valley of the Nobles --------------------------------------------------------------------------------
  /**
   * The same published day the Karnak site sells, which is also the only published day that walks the West Bank
   * monuments beside the Tombs of the Nobles (owner, 25 October; the Tunis Village precedent, batch B02). The two
   * sites share the programme and nothing else: every word below is this site's own.
   */
  VON_BOTH_BANKS: {
    provider: 'eeo',
    tenant: EEO,
    source: 'luxor-east-west-bank-private-tour-with-traditional-felucca-nile-cruise',
    category: DAY_TRIPS,
    options: ['luxor-all-inclusive-east-and-west-banks-tour--4bfa1a490c53'],
    addons: [],
    departures: ['07:00', '08:00'],
    rename: {
      'luxor-all-inclusive-east-and-west-banks-tour--4bfa1a490c53': {
        name: 'West Bank morning, East Bank afternoon',
        description: 'A car and guide for your group, the temple entry fees and lunch.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: ['Hotel pickup and drop-off From East Bank Hotels'],
      exclusions: [
        'Hotel pickup and drop-off in the West Bank (5$ per person)',
        'Spanish, German, or French-speaking guide (available as an add-on)',
      ],
    },
    add: {
      inclusions: ['Pickup and drop-off at your hotel on the East Bank of Luxor'],
      exclusions: ['Pickup from a hotel on the West Bank', 'A guide speaking Spanish, German or French'],
      needToKnow: [
        NOT_THE_NOBLES,
        'The included pickup is from East Bank hotels. A West Bank hotel is published at an extra cost that this site does not sell, so tell the team where you are staying before you book.',
        'The day is guided in English. The published record offers Spanish, German and French guides at an extra cost, which this site does not sell.',
      ],
    },
    // Written West Bank first, which is the order the day runs and the reason this site sells it.
    itinerary: [
      { title: 'Hotel pickup', description: 'A car collects you from your hotel on the East Bank and crosses the river.' },
      { title: 'Valley of the Kings', description: 'The royal tombs cut into the rock of the West Bank, walked with your guide, the entry fees covered.' },
      { title: 'Temple of Hatshepsut', description: 'The terraces below the cliffs, a short way north of the hillside where the Tombs of the Nobles were cut.' },
      { title: 'Colossi of Memnon', description: 'The two seated statues that stand on the flat ground on the way back, and then lunch.' },
      { title: 'On the Nile', description: 'A felucca sail on the river with a drink, between the two banks of the day.' },
      { title: 'The East Bank temples', description: 'Karnak and Luxor Temple with your guide to close the afternoon.' },
      { title: 'Back to your hotel', description: 'The drive back across town to where the day began.' },
    ],
  },
  VON_BALLOON: {
    provider: 'eeo',
    tenant: EEO,
    source: 'luxor-hot-air-balloon-ride-with-hotel-transfers',
    category: DAY_TRIPS,
    options: ['luxor-hot-air-balloon-ride-with-transfers-ac9114735ad3'],
    addons: [],
    departures: ['06:00', '07:00'],
    rename: {
      'luxor-hot-air-balloon-ride-with-transfers-ac9114735ad3': {
        name: 'Balloon flight with hotel transfers',
        description: 'The drive to the launch site, the flight and the drive back.',
      },
    },
    childNote: CHILD_NOTE,
    // The published record keeps its terms outside the fields the seed copies, so the ones a guest needs
    // before booking are written here in the site's own words.
    add: {
      needToKnow: [
        NOT_THE_NOBLES,
        'Balloon flights run only in weather the operator judges safe.',
        'Children must be at least six years old and with a responsible adult.',
        'The published record puts the time in the air at about 45 minutes, and between 40 and 90 minutes depending on the weather.',
        'A scanned copy of your passport is needed to confirm the flight.',
      ],
    },
    // The programme publishes no schedule of its own.
    itinerary: [
      { title: 'Hotel pickup', description: 'A transfer from your hotel or Nile cruise in Luxor to the launch site before first light.' },
      { title: 'The launch site', description: 'You meet the crew and watch the balloon inflate before stepping into the basket.' },
      { title: 'The flight', duration: '45 minutes', description: 'The balloon rises as the morning light reaches the West Bank, and drifts over the burial valleys, the cliffside temples, the farmland, the villages and the river.' },
      { title: 'Back to your hotel', description: 'The transfer returns you to your hotel or cruise boat in Luxor.' },
    ],
  },
  VON_QUAD: {
    provider: 'eeo',
    tenant: EEO,
    source: 'luxor-west-bank-desert-quad-bike-safari',
    category: DESERT,
    options: ['luxor-luxor-west-bank-quad-bike-adventure-in--a3e92dc281ab'],
    addons: [],
    departures: ['08:00'],
    rename: {
      'luxor-luxor-west-bank-quad-bike-adventure-in--a3e92dc281ab': {
        name: 'Quad ride in the West Bank desert',
        description: 'The transfers, the crossing, the briefing and an hour of riding.',
      },
    },
    childNote: CHILD_NOTE,
    // The published line reads "Hotel/Nile Cruise pickup and drop-off", which the seed cannot tell from a
    // pickup it does not include; the same promise is written plainly instead.
    omit: { inclusions: ['Hotel/Nile Cruise pickup and drop-off'] },
    add: {
      inclusions: ['Pickup and drop-off at your hotel or Nile cruise in Luxor'],
      needToKnow: [
        NOT_THE_NOBLES,
        'Pickup and drop-off at your hotel or Nile cruise are included. The published record also offers paid transfers from Luxor Airport and from the East Bank, which this site does not sell; ask the team before you book if you are not sure which applies to you.',
        'A copy of your passport is needed at least two days before the ride.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'An air-conditioned minivan collects you from your hotel or Nile cruise in Luxor.' },
      { title: 'Across the river', duration: '30 minutes', description: 'The drive and the motorboat crossing to the West Bank, past villages and farmland.' },
      { title: 'Safety briefing', description: 'The briefing and the equipment check at the quad base station.' },
      { title: 'The desert', duration: '1 hour', description: 'An hour of riding across the open ground of Wadi Ziad and along the foot of the West Bank mountains.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The crossing and the drive back to your hotel or cruise boat.' },
    ],
  },

  // ---- Whale Valley Wadi Al Hitan --------------------------------------------------------------------------
  WWH_DAY: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-fayoum-oasis-waterfalls-valley-of-the-whales-adventure',
    category: DAY_TRIPS,
    options: ['from-cairo-full-day-tour-to-el-fayoum-4f4d4d6cbb1f'],
    addons: [],
    departures: ['07:00'],
    departureLabels: { '07:00': 'Morning' },
    rename: {
      'from-cairo-full-day-tour-to-el-fayoum-4f4d4d6cbb1f': {
        name: 'Full day to Wadi Al Hitan and the Fayoum',
        description: 'The whale fossils, the waterfalls, the lakes and the drive by 4x4.',
      },
    },
    childNote: CHILD_NOTE,
    // The published record promises the hotel pickup in its highlights, not in its list of what is included.
    add: { inclusions: [PICKUP_CAIRO] },
    // The programme's own schedule is a list of pickup towns and does not name Wadi Al Hitan, which its
    // description, its highlights and its own title all do.
    itinerary: [
      { title: 'Hotel pickup', description: 'Pickup at seven from your hotel in Cairo or Giza in a private air-conditioned vehicle.' },
      { title: 'On the road', duration: '2 hours', description: 'The drive out to the Fayoum.' },
      { title: 'Wadi Al Hitan', description: 'The Valley of the Whales, a UNESCO World Heritage Site, where fossil whale skeletons lie in the sand where they were found.' },
      { title: 'Wadi El Rayan', description: 'The waterfalls between the two lakes.' },
      { title: 'The desert by 4x4', description: 'The drive across the sand, with sandboarding on the dunes and a stop at the Magic Lake.' },
      { title: 'Lake Qarun and Tunis Village', description: 'The lake and the pottery village above it.' },
      { title: 'The drive back', duration: '2 hours', description: 'Back to your hotel in Cairo or Giza.' },
    ],
  },

  // ---- Pyramids Camel Tour ---------------------------------------------------------------------------------
  PCT_SHARED_SUNRISE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'giza-pyramids-sunrise-morning-guided-tour-with-camel-ride-breakfast',
    category: DAY_TRIPS,
    options: ['shared-tour-with-giza-pyramids-entry-ticket-4fb577804443'],
    addons: [],
    departures: ['04:30', '08:00'],
    departureLabels: { '04:30': 'Sunrise start', '08:00': 'Morning start' },
    rename: {
      'shared-tour-with-giza-pyramids-entry-ticket-4fb577804443': {
        name: 'Shared ride with the pyramids entry ticket',
        description: 'The hour on a camel or a horse, breakfast and the guided walk, in a shared group.',
      },
    },
    omit: { inclusions: ['Entrance fees for Pyramids of Giza complex (if option selected)'] },
    add: {
      inclusions: ['Entrance fees for the Giza pyramids complex'],
      needToKnow: ['The vehicle and the guide are shared with other guests.', SAME_PRICE_NOTE],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'An air-conditioned vehicle collects you from your hotel in Cairo or Giza.' },
      { title: 'Camel or horse ride', duration: '1 hour', description: 'An hour in the saddle on the sand beside the plateau, with the pyramids in view.' },
      { title: 'Breakfast', description: 'A traditional Egyptian breakfast.' },
      { title: 'Pyramids of Giza', duration: '2 hours', description: 'A guided walk through the pyramids complex and the Sphinx, the entry ticket included.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  PCT_PRIVATE_SUNRISE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'giza-pyramids-sunrise-morning-guided-tour-with-camel-ride-breakfast',
    category: DAY_TRIPS,
    options: ['private-tour-with-giza-pyramids-entry-ticket-be38defacb48'],
    addons: [],
    departures: ['04:30', '08:00', '13:00'],
    departureLabels: { '04:30': 'Sunrise start', '08:00': 'Morning start', '13:00': 'Afternoon start' },
    rename: {
      'private-tour-with-giza-pyramids-entry-ticket-be38defacb48': {
        name: 'Private ride with the pyramids entry ticket',
        description: 'The same hour in the saddle, breakfast and the guided walk, with the vehicle and the guide for your group alone.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Entrance fees for Pyramids of Giza complex (if option selected)'] },
    add: { inclusions: ['Entrance fees for the Giza pyramids complex'] },
    itinerary: [
      { title: 'Hotel pickup', description: 'A private air-conditioned vehicle collects you from your hotel in Cairo or Giza.' },
      { title: 'Camel or horse ride', duration: '1 hour', description: 'An hour on a camel or a horse on the sand beside the plateau.' },
      { title: 'Breakfast', description: 'A traditional Egyptian breakfast.' },
      { title: 'Pyramids of Giza', duration: '2 hours', description: 'A guided walk through the pyramids complex and the Sphinx with your own guide, the entry ticket included.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  PCT_CAMEL_LUNCH: {
    provider: 'eeo',
    tenant: EEO,
    source: 'vip-giza-pyramids-experience-private-tour-camel-ride-lunch',
    category: DAY_TRIPS,
    options: ['private-tour-entrance-fees-guide-camel-ride-l-21bb4aa76e2d'],
    addons: [],
    departures: [
      '08:00', '08:15', '08:30', '08:45', '09:00', '09:15', '09:30', '09:45', '10:00', '10:15',
      '10:30', '10:45', '11:00', '11:15', '11:30', '12:00', '12:15', '12:30', '12:45',
    ],
    rename: {
      'private-tour-entrance-fees-guide-camel-ride-l-21bb4aa76e2d': {
        name: 'Private day with a camel ride and lunch',
        description: 'Your own guide and vehicle, the entrance fees, the camel ride and lunch.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        'Entrance Fees (If the Option Is Selected)',
        'Pickup from outside the city center (if add-on selected)',
      ],
    },
    add: {
      inclusions: ['Entrance fees for the Giza pyramids complex'],
      needToKnow: ['Pickup from outside the city centre is published as a paid extra, which this site does not sell. Ask the team before you book if your hotel is further out.'],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'A private vehicle collects you from your hotel in Cairo or Giza.' },
      { title: 'Pyramids of Giza', description: 'A guided walk among the pyramids and the Sphinx with your own English-speaking guide, the entrance fees covered.' },
      { title: 'Camel ride', description: 'A camel ride around the Giza plateau.' },
      { title: 'Lunch', description: 'Lunch at a local restaurant.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },

  // ---- Sharm Tour Guide ------------------------------------------------------------------------------------
  STG_RAS_MOHAMED: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-ras-mohamed-white-island-snorkeling-adventure-with-lunch',
    category: WATER,
    options: ['ras-mohamed-white-island-snorkel-complete-pac-04f7239a5777'],
    // The extras the published record binds to this option, all charged per guest there.
    addons: ['6a8b34bf597ba7a8386f158d', '6a8b34bf597ba7a8386f158e', '6a8b34bf597ba7a8386f1590'],
    perPerson: ['6a8b34bf597ba7a8386f158d', '6a8b34bf597ba7a8386f158e', '6a8b34bf597ba7a8386f1590'],
    extras: {
      '6a8b34bf597ba7a8386f158d': { name: 'Introductory dive, short', description: 'With an instructor, on the day.' },
      '6a8b34bf597ba7a8386f158e': { name: 'Introductory dive, long', description: 'With an instructor, on the day.' },
      '6a8b34bf597ba7a8386f1590': { name: 'Diving suit', description: 'Hired for the day.' },
    },
    departures: ['08:30'],
    departureLabels: { '08:30': 'Morning' },
    rename: {
      'ras-mohamed-white-island-snorkel-complete-pac-04f7239a5777': {
        name: 'Complete day with the park fee and the gear',
        description: 'The boat, lunch, the snorkelling equipment and the national park entry.',
      },
    },
    childNote: CHILD_NOTE,
    // The three lines the record makes true only on some options; this is the option that carries them.
    omit: {
      inclusions: [
        'Pickup and drop-off from your hotel',
        '10-minute introductory dive (if the Intro Dive option is selected)',
        'Snorkeling equipment (available in all options except Explorer Package)',
        'National Park entry fees (10 USD; available in all options except Explorer Package)',
      ],
    },
    add: {
      inclusions: ['Hotel pickup and drop-off', 'Snorkelling equipment', 'The national park entry fee'],
    },
    // The programme's own schedule is a list of transport legs ("van", "Boat cruise").
    itinerary: [
      { title: 'Hotel pickup', duration: '30 minutes', description: 'A van collects you from your hotel in Sharm el-Sheikh and drives to the marina.' },
      { title: 'Out to Ras Mohamed', duration: '2 hours', description: 'The yacht sails south into Ras Mohamed National Park, the protected tip of Sinai.' },
      { title: 'First snorkelling stop', duration: '1.5 hours', description: 'In the water over the reefs inside the park, with the instructor and life jackets on board.' },
      { title: 'Lunch and the second stop', description: 'A buffet lunch served on board, and a second stop in the water.' },
      { title: 'White Island', duration: '1 hour', description: 'Time on the sandbar, with the water shallow around it.' },
      { title: 'Back to Sharm el-Sheikh', duration: '2 hours', description: 'The sail back to the marina, and the van back to your hotel.' },
    ],
  },
  STG_TIRAN: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-tiran-island-cruise-with-snorkeling-diving-lunch',
    category: WATER,
    options: ['snorkeling-trip-snorkeling-equipment-included-37946e08a57e'],
    addons: ['6a8c6f4359e3f8c1c2579769', '6a8c6f4359e3f8c1c2579767'],
    perPerson: ['6a8c6f4359e3f8c1c2579769', '6a8c6f4359e3f8c1c2579767'],
    extras: {
      '6a8c6f4359e3f8c1c2579769': { name: 'Introductory dive', description: 'One dive with an instructor, on the day.' },
      '6a8c6f4359e3f8c1c2579767': { name: 'Diving suit', description: 'Hired for the day.' },
    },
    departures: ['08:00'],
    departureLabels: { '08:00': 'Morning' },
    rename: {
      'snorkeling-trip-snorkeling-equipment-included-37946e08a57e': {
        name: 'Snorkelling day with the equipment',
        description: 'The yacht, two stops in the water, lunch on board and the gear.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: ['10 minutes introduction diving (if option selected)', '1 dive (if option selected)'],
    },
    add: {
      exclusions: ['A dive, unless you add one when you book'],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '30 minutes', description: 'A van collects you from your hotel in Sharm el-Sheikh for the drive to the marina.' },
      { title: 'Out along the coast', duration: '2 hours', description: 'The yacht runs north along the shore, with the coastline in view.' },
      { title: 'Tiran Island', duration: '1.5 hours', description: 'The first stop, in the water off the island with the instructor.' },
      { title: 'The reefs', duration: '1.5 hours', description: 'The second stop over the reefs, for snorkelling and for the divers on board.' },
      { title: 'Lunch on board', description: 'A buffet lunch, with hot and cold drinks, soft drinks and water through the day.' },
      { title: 'Back to Sharm el-Sheikh', duration: '2.5 hours', description: 'The sail back to the marina, and the van back to your hotel.' },
    ],
  },
  STG_ELITE_CRUISE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-elite-vip-ras-mohammed-cruise-bbq-lunch',
    category: WATER,
    options: ['sharm-el-sheikh-ras-mohammed-elite-vip-cruise-6c6cb39d2efa'],
    addons: [],
    departures: ['09:00'],
    departureLabels: { '09:00': 'Morning' },
    rename: {
      'sharm-el-sheikh-ras-mohammed-elite-vip-cruise-6c6cb39d2efa': {
        name: 'Day on the four-deck boat with a barbecue lunch',
        description: 'The sail into the park, the snorkelling stop and the buffet on board.',
      },
    },
    childNote: CHILD_NOTE,
    // Neither the gear nor the marina fee is sold here, so the two conditional lines are replaced.
    omit: {
      inclusions: ['Snorkeling gear (if selected as an add-on)', 'Mandatory Marina Entrance fees (if selected from add-ons)'],
    },
    add: {
      exclusions: ['Snorkelling gear', 'The marina entrance fee'],
      needToKnow: ['The published record charges a marina entrance fee of five euros a person on arrival. The team confirms how it is paid when it confirms your booking.'],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '25 minutes', description: 'A coach collects you from your hotel in Sharm el-Sheikh for the drive to the marina.' },
      { title: 'Out to Ras Mohamed', duration: '2.5 hours', description: 'The sail south into Ras Mohamed National Park, across four floors and two air-conditioned salons.' },
      { title: 'In the water', duration: '45 minutes', description: 'A stop inside the park for swimming and snorkelling over the reefs.' },
      { title: 'White Island', duration: '45 minutes', description: 'A call at the sandbar when the water allows it.' },
      { title: 'Lunch on board', duration: '1 hour', description: 'The barbecue buffet, served on the boat.' },
      { title: 'Back to Sharm el-Sheikh', duration: '2 hours', description: 'The sail back, with more time in the water on the way, and the coach back to your hotel.' },
    ],
  },
  STG_RAS_MOHAMED_BUS: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-half-day-bus-trip-to-ras-mohammed-allah-s-gate',
    category: DAY_TRIPS,
    options: ['ras-mohammed-tour-and-allah-s-gate-half-day-b-7c87dc45d34c'],
    addons: [],
    departures: ['09:30'],
    departureLabels: { '09:30': 'Morning' },
    rename: {
      'ras-mohammed-tour-and-allah-s-gate-half-day-b-7c87dc45d34c': {
        name: 'Half day into the park by bus',
        description: 'The shared bus, the guide and the stops in the park.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        'Mandatory National Park entry fees 10€ (if selected from add-ons) otherwise to be paid upon arrival',
        'Snorkeling gear (if selected from add-ons)',
        'Private hotel pickup and drop-off (if selected from add-ons)',
      ],
    },
    add: {
      exclusions: ['The national park entry fee', 'Snorkelling gear'],
      needToKnow: [
        'The national park entry fee is published at ten euros a person and is paid on arrival. The team confirms how it is paid when it confirms your booking.',
        'Pickup is by shared bus from your hotel reception.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '45 minutes', description: 'A shared bus collects you from your hotel reception and drives into Ras Mohamed National Park.' },
      { title: 'The equipment stop', duration: '20 minutes', description: 'A stop at a shop where masks and fins can be hired and beach things bought, if you need them.' },
      { title: 'The park on foot', duration: '30 minutes', description: 'The mangrove shore with its fiddler crabs, and the Earthquake Crack beside the Magic Lake, with the guide.' },
      { title: 'In the water', duration: '35 minutes', description: 'A snorkelling stop over the reefs, and a swim in the saltwater lagoon of the Magic Lake.' },
      { title: 'Allah’s Gate', duration: '20 minutes', description: 'The arch of standing stones, and time to take photographs.' },
      { title: 'Back to your hotel', duration: '1 hour', description: 'The bus returns you to Sharm el-Sheikh in the early afternoon.' },
    ],
  },
  STG_SINAI_QUAD: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-sinai-desert-quad-bike-ride-bedouin-tea',
    category: DESERT,
    options: ['sharm-el-sheikh-sinai-desert-quad-safari-with-48bea150b9d1'],
    addons: [],
    departures: ['04:00', '08:00', '09:45', '14:15'],
    rename: {
      'sharm-el-sheikh-sinai-desert-quad-safari-with-48bea150b9d1': {
        name: 'Two hours with a quad of your own',
        description: 'The transfers, the guide, the ride and the tea stop.',
      },
    },
    childNote: CHILD_NOTE,
    add: {
      inclusions: ['Bedouin tea in the desert'],
      needToKnow: ['A copy of your passport is needed at least two days before the ride.'],
    },
    // The programme publishes no schedule of its own.
    itinerary: [
      { title: 'Hotel pickup', description: 'A private air-conditioned bus collects you from your hotel in Sharm el-Sheikh.' },
      { title: 'The quad base', description: 'The briefing and the hand-over of the quad, with a guide who rides with the group.' },
      { title: 'The Sinai desert', duration: '1 hour', description: 'An hour of riding over open ground and rough tracks, with the mountains around you.' },
      { title: 'Bedouin tea', description: 'A stop at a Bedouin village for tea and for what the hosts tell you about living out here.' },
      { title: 'Back to your hotel', description: 'The bus returns you to your hotel in Sharm el-Sheikh.' },
    ],
  },
  STG_SUPER_SAFARI: {
    provider: 'eeo',
    tenant: EEO,
    source: 'super-safari-adventure-in-sharm-with-atv-camel-ride-stargazing-bbq',
    category: DESERT,
    // Only the two options that price one rider; the rest are priced for a shared vehicle.
    options: ['1-person-option-sgl-quad-d711bb06d29a', '1-person-option-sgl-buggy-f96f79907993'],
    addons: [],
    departures: ['15:30'],
    departureLabels: { '15:30': 'Afternoon' },
    rename: {
      '1-person-option-sgl-quad-d711bb06d29a': { name: 'One rider, one quad', description: 'A quad bike of your own for the desert leg.' },
      '1-person-option-sgl-buggy-f96f79907993': { name: 'One rider, one buggy', description: 'A buggy of your own for the desert leg.' },
    },
    omit: {
      inclusions: [
        'ATV quad (SGL / DBL) (if option selected)',
        'Buggy (SGL / DBL / triple / family) (if option selected)',
        'Private track drive (if add-ons selected)',
        'VIP dinner (if add-ons selected)',
        'Private transfer roundtrip (if add-ons selected)',
      ],
    },
    add: {
      inclusions: ['A quad bike or a buggy, whichever option you book'],
      needToKnow: [
        SAME_PRICE_NOTE,
        'The published record also sells this afternoon for two, three or four riders sharing one vehicle, which this site does not sell. Ask the team before you book if you want to share.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '30 minutes', description: 'An air-conditioned vehicle collects you from your hotel in Sharm el-Sheikh for the drive to the safari centre.' },
      { title: 'The briefing', description: 'A welcome drink, the safety briefing and the driving instructions before the quad or the buggy is handed over.' },
      { title: 'Into the Sinai desert', duration: '25 minutes', description: 'The ride out across the sand, with the guide leading.' },
      { title: 'The Bedouin tent', description: 'A break for Bedouin tea and traditional bread, then an open stretch of desert for the echo before the ride back.' },
      { title: 'The Bedouin camp', description: 'A camel ride, then the barbecue buffet with water and soft drinks, and the oriental entertainment.' },
      { title: 'Stargazing', description: 'The camp lights go off and a telescope comes out, with an astronomer alongside.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The vehicle returns you to your hotel in Sharm el-Sheikh.' },
    ],
  },
  STG_HORSE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-2-hour-desert-beach-red-sea-horse-ride',
    category: DESERT,
    options: ['2-hour-sharm-el-sheikh-horse-ride-with-hotel--2eebc26cb311'],
    addons: [],
    departures: ['05:00', '08:15', '15:15'],
    departureLabels: { '05:00': 'Sunrise', '08:15': 'Morning', '15:15': 'Afternoon' },
    rename: {
      '2-hour-sharm-el-sheikh-horse-ride-with-hotel--2eebc26cb311': {
        name: 'Two hours in the saddle, with transfers',
        description: 'The horse, the instructor, the helmet and the drive each way.',
      },
    },
    childNote: CHILD_NOTE,
    // The programme publishes no schedule of its own.
    itinerary: [
      { title: 'Hotel pickup', description: 'A transfer from your hotel in Sharm el-Sheikh to the stables.' },
      { title: 'The desert', description: 'Riding out across the open ground behind the town, with an instructor alongside.' },
      { title: 'The shore', duration: '2 hours', description: 'Down to the water and along the beach, with the chance to ride into the sea with your horse.' },
      { title: 'Back to your hotel', description: 'The transfer returns you to your hotel in Sharm el-Sheikh.' },
    ],
  },
  STG_DAHAB_BLUE_HOLE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-day-trip-dahab-blue-hole-snorkeling-lunch',
    category: DAY_TRIPS,
    options: ['relaxed-dahab-seaside-snorkeling-and-lunch-pa-1775713e0835', 'blue-hole-exploration-and-dahab-experience-wi-3fa178385ade'],
    addons: [],
    departures: ['08:00'],
    departureLabels: { '08:00': 'Morning' },
    rename: {
      'relaxed-dahab-seaside-snorkeling-and-lunch-pa-1775713e0835': {
        name: 'Dahab and the shore, without the Blue Hole',
        description: 'Snorkelling from the shore, the camel ride, the canyon stop and lunch.',
      },
      'blue-hole-exploration-and-dahab-experience-wi-3fa178385ade': {
        name: 'Dahab with the Blue Hole',
        description: 'The same day with the entry to the Blue Hole and a snorkelling stop there.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        'Entry to the Blue Hole area ( if Option Selected )',
        'Snorkeling equipment (mask & fins) ( if add ons Selected )',
      ],
    },
    add: {
      exclusions: ['Snorkelling equipment'],
      needToKnow: ['Entry to the Blue Hole is included on the Blue Hole option only; the other option snorkels along the shore instead.'],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '1 hour', description: 'An air-conditioned vehicle collects you from your hotel in Sharm el-Sheikh for the drive north.' },
      { title: 'The Blue Hole', duration: '3 hours', description: 'Time at the Blue Hole with a guide: snorkelling there on the option that includes the entry, and free time and the shops along the shore.' },
      { title: 'Dahab', duration: '3 hours', description: 'Snorkelling along the coast, a camel ride, a canyon stop and time in the town.' },
      { title: 'Lunch', description: 'Lunch at a local restaurant, with bottled water through the day.' },
      { title: 'Back to your hotel', duration: '1 hour', description: 'The drive back to Sharm el-Sheikh.' },
    ],
  },
  STG_SALAMA_CANYON: {
    provider: 'eeo',
    tenant: EEO,
    source: 'from-sharm-el-sheikh-dahab-canyon-snorkeling-camel-jeep-safari',
    category: DAY_TRIPS,
    options: ['salama-colored-canyon-snorkeling-camel-ride-w-28aa36d10889', 'salama-colored-canyon-blue-hole-snorkeling-wi-bed8134f9971'],
    addons: [],
    departures: ['07:30'],
    departureLabels: { '07:30': 'Morning' },
    rename: {
      'salama-colored-canyon-snorkeling-camel-ride-w-28aa36d10889': {
        name: 'Canyon, camel and the shore',
        description: 'The jeep safari, the walk through the canyon, the camel ride and lunch.',
      },
      'salama-colored-canyon-blue-hole-snorkeling-wi-bed8134f9971': {
        name: 'Canyon, camel and the Blue Hole',
        description: 'The same day, snorkelling at the Blue Hole instead of the shore.',
      },
    },
    childNote: CHILD_NOTE,
    // The published line reads "Pick up and drop off from hotel", which the seed cannot tell from a pickup
    // it does not include; the same promise is written plainly instead.
    omit: { inclusions: ['Pick up and drop off from hotel'] },
    add: {
      inclusions: [PICKUP_SHARM],
      needToKnow: ['The Blue Hole entry is included on the option that names it; the other option snorkels at the canyon site.'],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '1.75 hours', description: 'A minivan collects you from your hotel in Sharm el-Sheikh for the drive north to Dahab.' },
      { title: 'The camel ride', duration: '10 minutes', description: 'A short ride along the shore.' },
      { title: 'In the water', duration: '40 minutes', description: 'Snorkelling at the canyon site, or at the Blue Hole on the option that includes its entry.' },
      { title: 'Lunch', duration: '1.75 hours', description: 'Lunch and time by the sea.' },
      { title: 'Dahab', duration: '45 minutes', description: 'Time in the town for the shops.' },
      { title: 'Salama Coloured Canyon', duration: '45 minutes', description: 'A jeep takes the group in, and the walk through the canyon is guided, with the entry and the government fees covered.' },
      { title: 'Back to your hotel', description: 'The drive back to Sharm el-Sheikh.' },
    ],
  },
  STG_THREE_POOLS: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-dahab-3-pools-camel-ride-red-canyon-lunch-tour',
    category: DAY_TRIPS,
    options: ['dahab-3-pools-camel-ride-red-canyon-lunch-43fae27c4c65', 'dahab-quad-bike-3-pools-camel-ride-red-canyon-3983acfc665a'],
    addons: [],
    departures: ['08:00'],
    departureLabels: { '08:00': 'Morning' },
    rename: {
      'dahab-3-pools-camel-ride-red-canyon-lunch-43fae27c4c65': {
        name: 'Three Pools, the Red Canyon and a camel ride',
        description: 'The jeep, the canyon, the camel ride and lunch by the sea.',
      },
      'dahab-quad-bike-3-pools-camel-ride-red-canyon-3983acfc665a': {
        name: 'The same day with a quad ride',
        description: 'A quad bike along the shore and between the mountains, added to the day.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        'Quad bike ride on the beach & between mountains (if option selected)',
        'Snorkeling stop at the 3 Pools (Snorkeling Equipment not included) add on selection',
      ],
    },
    add: {
      inclusions: ['A snorkelling stop at the Three Pools'],
      exclusions: ['Snorkelling equipment'],
      needToKnow: ['The quad ride is part of the option that names it; the other option makes the same stops without it.'],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '1 hour', description: 'An air-conditioned vehicle collects you from your hotel in Sharm el-Sheikh for the drive north.' },
      { title: 'The Salama canyon', duration: '2.5 hours', description: 'The canyon by jeep, with a guide, and the walk through it.' },
      { title: 'The Three Pools', duration: '3 hours', description: 'The sheltered water on the Dahab coast: a camel ride, a snorkelling stop, and a quad ride between the mountains of the Red Canyon on the option that includes it.' },
      { title: 'Lunch', description: 'Lunch at a seaside restaurant, with bottled water through the day.' },
      { title: 'Back to your hotel', duration: '1 hour', description: 'The drive back to Sharm el-Sheikh.' },
    ],
  },
  STG_MOUNT_SINAI: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-mount-sinai-sunrise-hike-st-catherine-s-monastery',
    category: DAY_TRIPS,
    options: ['mount-sinai-sunrise-st-catherine-s-monastery-ea16e9458e90'],
    addons: [],
    departures: ['20:00'],
    departureLabels: { '20:00': 'Evening start' },
    rename: {
      'mount-sinai-sunrise-st-catherine-s-monastery-ea16e9458e90': {
        name: 'Overnight climb with the monastery after it',
        description: 'The coach each way, the Bedouin guide on the mountain and the park entry.',
      },
    },
    childNote: CHILD_NOTE,
    // The published line reads "Pick up services from/to your hotel in Sharm", which the seed cannot tell from
    // a pickup it does not include.
    omit: { inclusions: ['Pick up services from/to your hotel in Sharm'] },
    add: {
      inclusions: [PICKUP_SHARM],
      needToKnow: ['A copy of your passport is needed at least two days before the trip.'],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'An air-conditioned bus collects you from your hotel in Sharm el-Sheikh in the evening.' },
      { title: 'To Saint Catherine', duration: '2.5 hours', description: 'The drive across Sinai.' },
      { title: 'The climb', duration: '2 hours', description: 'The walk up the mountain through the night with a Bedouin guide, reaching the top for the sunrise.' },
      { title: 'The descent', description: 'Back down the mountain after the sun is up.' },
      { title: "Saint Catherine's Monastery", duration: '2 hours', description: 'The monastery, one of the oldest in the world, with time to look around it.' },
      { title: 'Back to your hotel', duration: '2 hours', description: 'The drive back to Sharm el-Sheikh.' },
    ],
  },
  STG_ST_CATHERINE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-private-st-catherine-s-monastery-tour',
    category: DAY_TRIPS,
    options: ['sharm-el-sheikh-private-st-catherine-s-monast-d92956505822'],
    addons: [],
    departures: ['06:00'],
    departureLabels: { '06:00': 'Early morning' },
    rename: {
      'sharm-el-sheikh-private-st-catherine-s-monast-d92956505822': {
        name: 'Private day with a guide',
        description: 'Your own vehicle and guide, the protectorate fee and lunch by the sea.',
      },
    },
    childNote: CHILD_NOTE,
    add: {
      needToKnow: [
        'The drive runs in convoy, as the published record says.',
        'Sleeveless shirts are not allowed inside the monastery, and photography inside it is not allowed.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'A private air-conditioned vehicle collects you from your hotel in Sharm el-Sheikh at six.' },
      { title: 'Across Sinai', duration: '3 hours', description: 'The drive inland, which runs in convoy.' },
      { title: "Saint Catherine's Monastery", duration: '2 hours', description: 'The monastery with your guide, among its shrines and holy places, with the protectorate entry fee covered.' },
      { title: 'Dahab', duration: '1 hour', description: 'Lunch on the beach on the way back.' },
      { title: 'Back to your hotel', duration: '2 hours', description: 'The drive back to Sharm el-Sheikh.' },
    ],
  },
  STG_CAIRO: {
    provider: 'eeo',
    tenant: EEO,
    source: 'discover-cairo-from-sharm-el-sheikh-pyramids-sphinx-and-museum-day-tour',
    category: DAY_TRIPS,
    options: ['giza-pyramids-sphinx-old-egyptian-museum-admi-f5085ffb4689', 'giza-pyramids-sphinx-grand-egyptian-museum-en-ddc5355863f0'],
    addons: [],
    departures: ['00:10'],
    departureLabels: { '00:10': 'Overnight start' },
    rename: {
      'giza-pyramids-sphinx-old-egyptian-museum-admi-f5085ffb4689': {
        name: 'With the Egyptian Museum of Antiquities',
        description: 'The pyramids, the Sphinx and the museum on Tahrir Square, with the entry tickets and lunch.',
      },
      'giza-pyramids-sphinx-grand-egyptian-museum-en-ddc5355863f0': {
        name: 'With the Grand Egyptian Museum',
        description: 'The same day, with the Grand Egyptian Museum instead and its entry ticket.',
      },
    },
    childNote: CHILD_NOTE,
    // The published record names both museums in one line; each option carries the ticket for its own.
    omit: { inclusions: ['Entrance fees for the Giza Pyramids, the Sphinx, and the GEM or the Old Egyptian Museum (depending on the option you choose)'] },
    add: {
      inclusions: [PICKUP_SHARM, 'Entrance fees for the Giza pyramids, the Sphinx and the museum the option names'],
      needToKnow: [
        'The published record puts the road to Cairo at between seven and nine hours each way, because the coaches travel in convoy with a police escort.',
        'A visa is needed to enter Cairo. The published record prices it at 38 US dollars a person, bought at Sharm el-Sheikh airport or arranged on the day.',
        'The published record sets a minimum of six guests for a guide in French, Italian, Spanish, Russian or German, and a minimum of six for the visit to the Egyptian Museum of Antiquities.',
      ],
    },
    // The programme's own schedule lists both museums; each option sold goes to one of them.
    itinerary: [
      { title: 'Hotel pickup', description: 'The coach collects you from your hotel in Sharm el-Sheikh in the middle of the night.' },
      { title: 'The road to Cairo', description: 'The drive in convoy with a police escort, which the published record puts at between seven and nine hours.' },
      { title: 'The Giza plateau', description: 'The pyramids and the Great Sphinx with an Egyptologist guide, the entrance fees covered.' },
      { title: 'Lunch', description: 'Lunch at a restaurant looking out at the pyramids.' },
      { title: 'The museum', description: 'The Grand Egyptian Museum, or the Egyptian Museum of Antiquities on Tahrir Square, whichever your option names, with its entry ticket.' },
      { title: 'Back to Sharm el-Sheikh', description: 'The drive back, again in convoy.' },
    ],
  },

  // ---- Quad Safari Hurghada --------------------------------------------------------------------------------
  QSH_BUGGY_DAY: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-vip-dune-buggy-camel-safari-with-bbq-stargazing',
    category: DESERT,
    options: [
      '2-hour-dune-buggy-camel-safari-b7914e6b4032',
      'buggy-desert-safari-with-blue-lagoon-swimming-36e5e2621934',
      'private-2-hour-dune-buggy-camel-safari-with-p-33a8f79170d7',
    ],
    addons: [],
    departures: ['06:00', '08:00', '11:00', '12:00'],
    rename: {
      '2-hour-dune-buggy-camel-safari-b7914e6b4032': {
        name: 'Two hours by buggy, with the camel ride',
        description: 'A guided ride over the dunes in a small group.',
      },
      'buggy-desert-safari-with-blue-lagoon-swimming-36e5e2621934': {
        name: 'With a swim at the Blue Lagoon',
        description: 'The same ride, with a stop at the lagoon to swim and time on the shore.',
      },
      'private-2-hour-dune-buggy-camel-safari-with-p-33a8f79170d7': {
        name: 'Private ride with private pickup',
        description: 'The two hours and the camel ride with the guide and the transfer for your group alone.',
      },
    },
    childNote: CHILD_NOTE,
    // "camel Round" is the record's own wording for the short ride its description explains.
    omit: { inclusions: ['camel Round'] },
    add: {
      inclusions: ['A short camel ride'],
      needToKnow: ['The swim at the Blue Lagoon is part of the option that names it.'],
    },
    // The programme publishes no schedule of its own.
    itinerary: [
      { title: 'Hotel pickup', description: 'A transfer from your hotel in Hurghada out to the desert.' },
      { title: 'The briefing', description: 'The hand-over of the buggy and the safety instructions, with a guide who rides with the group.' },
      { title: 'The dunes', duration: '2 hours', description: 'The guided ride over the sand.' },
      { title: 'The camel', description: 'A short ride on a camel, with time to take photographs.' },
      { title: 'Back to your hotel', description: 'The transfer returns you to your hotel in Hurghada.' },
    ],
  },
  QSH_BUGGY_SUNSET: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-vip-dune-buggy-camel-safari-with-bbq-stargazing',
    category: DESERT,
    options: ['2-hour-buggy-camel-safari-with-bbq-stargazing-9a0e31f3a730'],
    addons: [],
    departures: ['16:00'],
    departureLabels: { '16:00': 'Late afternoon' },
    rename: {
      '2-hour-buggy-camel-safari-with-bbq-stargazing-9a0e31f3a730': {
        name: 'Sunset ride with a barbecue and stargazing',
        description: 'The buggy, the camel ride, dinner in the desert and the sky after dark.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['camel Round'] },
    // The option's own name and description carry the barbecue and the stargazing that this evening adds.
    add: { inclusions: ['A short camel ride', 'A desert barbecue and stargazing after the ride'] },
    itinerary: [
      { title: 'Hotel pickup', description: 'A transfer from your hotel in Hurghada out to the desert in the late afternoon.' },
      { title: 'The dunes', duration: '2 hours', description: 'The guided buggy ride over the sand as the light drops.' },
      { title: 'The camel', description: 'A short ride on a camel.' },
      { title: 'Dinner in the desert', description: 'A barbecue out on the sand.' },
      { title: 'The night sky', description: 'Time under the stars once the light has gone.' },
      { title: 'Back to your hotel', description: 'The transfer returns you to your hotel in Hurghada.' },
    ],
  },
  QSH_TWO_HOUR_QUAD: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-desert-quad-biking-camel-ride-dinner-show-stargazing',
    category: DESERT,
    options: ['2-hour-quad-bike-with-pickup-from-hurghada-sa-f5f421616c20'],
    addons: [],
    departures: ['04:00', '07:00', '09:00', '11:00', '14:00'],
    rename: {
      '2-hour-quad-bike-with-pickup-from-hurghada-sa-f5f421616c20': {
        name: 'Two hours by quad, with the transfer',
        description: 'A shared ride over the dunes, with pickup from Hurghada, Sahl Hasheesh or Makadi Bay.',
      },
    },
    // Every line the record makes true only on some options is replaced by what this option carries.
    omit: {
      inclusions: [
        'Transportation in an air-conditioned vehicle (if selected)',
        'Hotel pickup and drop-off (if selected)',
        '2-hour quad bike ride (if selected)',
        'Breakfast (for sunrise tour only)',
        'Stargazing experience (if selected)',
        'Oriental dinner (if selected)',
      ],
    },
    add: {
      inclusions: ['Transport in an air-conditioned vehicle', PICKUP_HURGHADA, 'A two-hour quad bike ride'],
      needToKnow: [
        SAME_PRICE_NOTE,
        'The published record offers an Oriental breakfast only with its five o’clock sunrise ride, which is not one of the departures this trip sells.',
        'The published record offers pickup from Al Ahyaa, El Gouna, Safaga and Soma Bay on a separate option, which this site does not sell.',
        'Drivers must be at least sixteen and pass a short driving test before the ride.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'A transfer from your hotel in Hurghada, Sahl Hasheesh or Makadi Bay out to the quad base.' },
      { title: 'The briefing', description: 'The safety instructions, the helmet and a short driving test before the ride.' },
      { title: 'The desert', duration: '2 hours', description: 'Riding across open plains and dunes with a guide, with stops for photographs and views towards the Red Sea.' },
      { title: 'The camel', description: 'A short camel ride.' },
      { title: 'Back to your hotel', description: 'The transfer returns you to your hotel.' },
    ],
  },
  QSH_EVENING_QUAD: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-desert-quad-bike-camel-ride-dinner-stargazing',
    category: DESERT,
    options: ['1-5-hour-quad-bike-safari-with-dinner-stargaz-f20c8935fc00'],
    addons: [],
    departures: ['16:00'],
    departureLabels: { '16:00': 'Late afternoon' },
    rename: {
      '1-5-hour-quad-bike-safari-with-dinner-stargaz-f20c8935fc00': {
        name: 'Evening ride with dinner, a show and stargazing',
        description: 'Ninety minutes on the quad, a camel ride at sunset and the evening at the camp.',
      },
    },
    omit: {
      inclusions: [
        'Hotel pickup and drop-off (if option selected)',
        'Transportation in an air-conditioned vehicle (if option selected)',
        '2-hour quad bike ride (or 1H quad + 1H horse combo, depending on option selected)',
        'Oriental breakfast (sunrise option only at 5:00 AM)',
        'Stargazing, Oriental dinner, and live show (sunset option only)',
        'GoPro (if option selected)',
        // The programme's general line says five minutes for every ride; this option's own words say thirty.
        'Short 5-minute camel ride for photos (included in all tours)',
      ],
    },
    add: {
      inclusions: [
        PICKUP_HURGHADA,
        'Transport in an air-conditioned vehicle',
        'Ninety minutes on a quad bike',
        'A camel ride at sunset',
        'Stargazing, an Oriental dinner and a live show',
      ],
      exclusions: ['Camera footage of your ride'],
      needToKnow: [
        SAME_PRICE_NOTE,
        'The published record puts the camel ride at thirty minutes on this option, where its shorter rides carry five.',
        'Drivers must be at least sixteen and pass a short driving test before the ride.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'A transfer from your hotel in Hurghada out to the quad base in the late afternoon.' },
      { title: 'The briefing', description: 'The safety instructions, the helmet and a short driving test.' },
      { title: 'The desert', duration: '1.5 hours', description: 'Ninety minutes of riding across the sand with a guide and a desert escort.' },
      { title: 'The camel', duration: '30 minutes', description: 'Half an hour on a camel around sunset.' },
      { title: 'Dinner and the show', description: 'An Oriental dinner at the camp with live entertainment.' },
      { title: 'The night sky', description: 'Stargazing once the light has gone.' },
      { title: 'Back to your hotel', description: 'The transfer returns you to your hotel in Hurghada.' },
    ],
  },
  QSH_PRIVATE_QUAD: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-desert-atv-quad-bike-safari-with-camel-ride-bbq',
    category: DESERT,
    options: ['private-morning-or-sunset-quad-bike-tour-532d618030cb'],
    addons: [],
    departures: ['08:00', '09:00', '14:00', '15:00'],
    rename: {
      'private-morning-or-sunset-quad-bike-tour-532d618030cb': {
        name: 'Private ride, morning or late afternoon',
        description: 'Your own guide for the forty kilometres, the Bedouin village and the camel ride.',
      },
    },
    childNote: CHILD_NOTE,
    // The transfer line the seed cannot read as a hotel pickup, and the barbecue that belongs to another option.
    omit: {
      inclusions: [
        'Round-trip transfers from Hurghada hotels (air-conditioned vehicles)',
        'BBQ Dinner (if option selected)',
      ],
      exclusions: [
        '1€ per person mandatory government fee (select at checkout)',
        'Goggles and Scarf (select at checkout)',
        'Round-trip transportation is free for hotels located within Hurghada. For hotels in Makadi Bay, Sahl Hasheesh, El Gouna, Safaga, or Soma Bay, transportation is available at an additional cost.',
      ],
    },
    add: {
      inclusions: ['Pickup and drop-off at your hotel in Hurghada, in an air-conditioned vehicle'],
      exclusions: ['A government fee of one euro per person', 'Goggles and a scarf', 'Transfers from outside Hurghada'],
      needToKnow: [
        'The published record charges a government fee of one euro per person separately. The team confirms how it is paid when it confirms your booking.',
        'Transfers are included from hotels in Hurghada. The published record charges for transfers from Makadi Bay, Sahl Hasheesh, El Gouna, Safaga and Soma Bay, which this site does not sell.',
        'Children aged six to fifteen may ride as passengers but not drive.',
        'A barbecue dinner is part of another option the published record sells, not of this one.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '30 minutes', description: 'An air-conditioned vehicle collects you from your hotel in Hurghada.' },
      { title: 'The briefing', duration: '15 minutes', description: 'Professional instruction, a practice session and the helmet before the ride.' },
      { title: 'The desert', duration: '2 hours', description: 'About forty kilometres of riding at your own pace, with your own guide.' },
      { title: 'The Bedouin village', description: 'A camel ride, Bedouin tea and time with the people who live there.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The vehicle returns you to your hotel in Hurghada.' },
    ],
  },
  QSH_SUPER_SAFARI: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-7-hour-super-safari-with-atv-camel-ride-bbq',
    category: DESERT,
    options: ['7-hour-desert-super-safari-adventure-74bfff0a9b71'],
    addons: [],
    departures: ['11:30'],
    departureLabels: { '11:30': 'Late morning' },
    rename: {
      '7-hour-desert-super-safari-adventure-74bfff0a9b71': {
        name: 'Seven hours in the desert',
        description: 'Quad, spider car, jeep, the Bedouin village, dinner and the show.',
      },
    },
    childNote: CHILD_NOTE,
    // "Includes" is a stray heading in the record's own list, and the transfer line the seed cannot read as a
    // hotel pickup.
    omit: { inclusions: ['Includes', 'Round-trip hotel transfer'] },
    add: {
      inclusions: ['Pickup and drop-off at your hotel in Hurghada, there and back'],
      needToKnow: [
        'Transfers from El Gouna, Safaga, Sahl Hasheesh and Makadi Bay are published as a paid extra, which this site does not sell.',
        'The day is not suitable for guests who are pregnant or who have back, neck or serious medical conditions.',
        'Helmets are provided and must be worn for the quad and spider car rides.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '30 minutes', description: 'A jeep collects you from your hotel in Hurghada and heads out of town.' },
      { title: 'The desert', duration: '30 minutes', description: 'A first stop in the desert with the guide, and time for photographs.' },
      { title: 'The Bedouin village', duration: '1 hour', description: 'Reached by jeep, with Bedouin tea and a camel ride.' },
      { title: 'The quad and the spider car', description: 'The quad ride and the spider car, with helmets and the guide alongside.' },
      { title: 'Dinner', duration: '1 hour', description: 'An open-buffet barbecue dinner at the camp.' },
      { title: 'The show', duration: '1 hour', description: 'Tanoura, belly dance and a fire show under the sky.' },
      { title: 'Back to your hotel', duration: '40 minutes', description: 'The jeep returns you to your hotel in Hurghada.' },
    ],
  },

  // ---- Safari Sharm El Sheikh ------------------------------------------------------------------------------
  SSS_QUAD_TEA: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-sinai-desert-quad-bike-ride-bedouin-tea',
    category: DESERT,
    options: ['sharm-el-sheikh-sinai-desert-quad-safari-with-48bea150b9d1'],
    addons: [],
    departures: ['04:00', '08:00', '09:45', '14:15'],
    rename: {
      'sharm-el-sheikh-sinai-desert-quad-safari-with-48bea150b9d1': {
        name: 'Quad safari with a tea stop',
        description: 'The transfers, a quad of your own, the guide and the Bedouin village.',
      },
    },
    childNote: CHILD_NOTE,
    add: {
      inclusions: ['Bedouin tea in the desert'],
      needToKnow: ['A copy of your passport is needed at least two days before the ride.'],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'A private air-conditioned bus collects you from your hotel in Sharm el-Sheikh.' },
      { title: 'The quad base', description: 'The quad is handed over and the guide takes the group through the briefing.' },
      { title: 'Into the Sinai', duration: '1 hour', description: 'An hour of riding across open desert, with the Sinai mountains around you.' },
      { title: 'The village', description: 'A stop at a Bedouin village for tea and for what the hosts tell you about the desert.' },
      { title: 'Back to your hotel', description: 'The bus returns you to your hotel in Sharm el-Sheikh.' },
    ],
  },
  SSS_SUNRISE_SUNSET: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-sunrise-sunset-quad-bike-adventure',
    category: DESERT,
    // Only the two options that price one rider; the rest are priced for a shared vehicle.
    options: ['one-person-single-quad-1f23cc1185c3', 'one-person-single-buggy-fabe3b22d34d'],
    addons: [],
    departures: ['04:30', '16:00'],
    departureLabels: { '04:30': 'Sunrise', '16:00': 'Sunset' },
    rename: {
      'one-person-single-quad-1f23cc1185c3': { name: 'One rider, one quad', description: 'A quad bike of your own for the ride.' },
      'one-person-single-buggy-fabe3b22d34d': { name: 'One rider, one buggy', description: 'A buggy of your own for the ride.' },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Camel ride (if selected as an add-on option)'] },
    add: {
      exclusions: ['A camel ride, which the published record sells as a paid extra'],
      needToKnow: [
        'The published record also sells this ride for two, three or four riders sharing one vehicle, which this site does not sell. Ask the team before you book if you want to share.',
        'A camel ride is published as a paid extra, which this site does not sell.',
      ],
    },
    // The programme's own schedule names a camel ride, which belongs to a paid extra this site does not sell.
    itinerary: [
      { title: 'Hotel pickup', duration: '30 minutes', description: 'An air-conditioned vehicle collects you from your hotel in Sharm el-Sheikh.' },
      { title: 'The briefing', description: 'The safety briefing, the helmet and the goggles, and a training session for anyone who has not driven one before.' },
      { title: 'The Sinai desert', duration: '1.5 hours', description: 'Riding out across the desert around Sharm el-Sheikh, with the mountains in view and a stop at the echo point.' },
      { title: 'The desert tent', duration: '1 hour', description: 'Bedouin tea at a traditional tent, and free time for photographs.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The vehicle returns you to your hotel in Sharm el-Sheikh.' },
    ],
  },
  SSS_SUPER_SAFARI: {
    provider: 'eeo',
    tenant: EEO,
    source: 'super-safari-adventure-in-sharm-with-atv-camel-ride-stargazing-bbq',
    category: DESERT,
    options: ['1-person-option-sgl-quad-d711bb06d29a', '1-person-option-sgl-buggy-f96f79907993'],
    addons: [],
    departures: ['15:30'],
    departureLabels: { '15:30': 'Afternoon' },
    rename: {
      '1-person-option-sgl-quad-d711bb06d29a': { name: 'A quad of your own', description: 'One rider, one quad bike, for the desert leg.' },
      '1-person-option-sgl-buggy-f96f79907993': { name: 'A buggy of your own', description: 'One rider, one buggy, for the desert leg.' },
    },
    omit: {
      inclusions: [
        'ATV quad (SGL / DBL) (if option selected)',
        'Buggy (SGL / DBL / triple / family) (if option selected)',
        'Private track drive (if add-ons selected)',
        'VIP dinner (if add-ons selected)',
        'Private transfer roundtrip (if add-ons selected)',
      ],
    },
    add: {
      inclusions: ['A quad bike or a buggy, whichever option you book'],
      needToKnow: [
        SAME_PRICE_NOTE,
        'The published record also sells this afternoon for two, three or four riders sharing one vehicle, which this site does not sell.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '30 minutes', description: 'An air-conditioned vehicle takes you from your hotel to the safari centre.' },
      { title: 'Welcome and briefing', description: 'A welcome drink, the safety briefing and the driving instructions before the vehicle is handed over.' },
      { title: 'The ride out', duration: '25 minutes', description: 'Across the Sinai desert with the guide.' },
      { title: 'The Bedouin tent', description: 'Tea and traditional bread, then an open stretch of desert for the echo, and the ride back to the centre.' },
      { title: 'The Bedouin camp', duration: '2 hours', description: 'A camel ride, an open-buffet barbecue dinner with water and soft drinks, and oriental entertainment.' },
      { title: 'Stargazing', description: 'The camp lights go out and the telescope comes out, with an astronomer to show you the sky.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The vehicle returns you to Sharm el-Sheikh.' },
    ],
  },
  SSS_FIVE_IN_ONE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-quad-bike-camel-ride-bedouin-dinner-stargazing',
    category: DESERT,
    options: ['shared-double-quad-bike-experience-a52d71783324', '5-in-1-quad-camel-dinner-stargazing-tour-c24ec77fbaf5'],
    addons: [],
    departures: ['16:45', '22:00'],
    departureLabels: { '16:45': 'Late afternoon', '22:00': 'Late evening' },
    rename: {
      'shared-double-quad-bike-experience-a52d71783324': {
        name: 'Two sharing one quad',
        description: 'One drives and one rides behind, and you can swap during the ride.',
      },
      '5-in-1-quad-camel-dinner-stargazing-tour-c24ec77fbaf5': {
        name: 'A quad of your own',
        description: 'The same evening with a quad bike each.',
      },
    },
    childNote: MIXED_CHILD_NOTE,
    add: {
      needToKnow: [
        'The published record charges a desert conservation fee of one US dollar per person, paid in cash on the day.',
        'Children under sixteen may ride as passengers with an adult but may not drive.',
        'No driving licence is needed for the quad.',
        'Vegetarian meals are available.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '30 minutes', description: 'A van collects you from your hotel in Sharm el-Sheikh for the drive to the safari centre.' },
      { title: 'The briefing', duration: '30 minutes', description: 'The safety briefing before the quads are handed over.' },
      { title: 'The first ride', duration: '15 minutes', description: 'Out into the Sinai desert with the guide.' },
      { title: 'Tea and the camel', duration: '30 minutes', description: 'A break for Bedouin tea and bread, and a camel ride.' },
      { title: 'Dinner and the show', duration: '1 hour', description: 'A buffet dinner at the camp with an oriental entertainment programme.' },
      { title: 'The telescopes', duration: '30 minutes', description: 'A guided look at the night sky with an experienced astronomy guide.' },
      { title: 'Back to your hotel', duration: '50 minutes', description: 'A last short ride, then the van back to Sharm el-Sheikh.' },
    ],
  },
  SSS_RAS_MOHAMED_ATV: {
    provider: 'eeo',
    tenant: EEO,
    source: 'early-morning-atv-safari-to-ras-mohammed-allah-gate',
    category: DESERT,
    options: ['1-person-1-sgl-quad-and-allah-gates-entrance-e92db079e1fc', '1-person-1-sgl-buggy-and-allah-gates-entrance-d64290a67f41'],
    addons: [],
    departures: ['04:30'],
    departureLabels: { '04:30': 'Before dawn' },
    rename: {
      '1-person-1-sgl-quad-and-allah-gates-entrance-e92db079e1fc': {
        name: 'A quad of your own, with the park entry',
        description: 'One rider, one quad, and the entry to Allah Gate.',
      },
      '1-person-1-sgl-buggy-and-allah-gates-entrance-d64290a67f41': {
        name: 'A buggy of your own, with the park entry',
        description: 'One rider, one buggy, and the entry to Allah Gate.',
      },
    },
    childNote: CHILD_NOTE,
    // The published record promises the hotel pickup in its highlights and its schedule, not in its list of
    // what is included.
    add: {
      inclusions: [PICKUP_SHARM],
      needToKnow: [
        'The day starts before dawn.',
        'Snorkelling gear is not included, so bring your own if you want to snorkel.',
        'The published record also sells this day for two, three or four riders sharing one vehicle, which this site does not sell.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '30 minutes', description: 'A bus collects you from your hotel in Sharm el-Sheikh before dawn.' },
      { title: 'The sunrise ride', duration: '45 minutes', description: 'Out into the Sinai desert on a quad or a buggy as the sun comes up over the mountains.' },
      { title: 'The dunes', duration: '45 minutes', description: 'A stop for photographs, for sandboarding and for the view.' },
      { title: 'Breakfast', duration: '1 hour', description: 'Back at your hotel for breakfast and time to freshen up.' },
      { title: 'Ras Mohamed National Park', duration: '3 hours', description: 'On by bus to the park: Allah Gate, the mangroves, the Earthquake Crack and the Magic Lake, with panoramic stops, and a swim and a snorkel over the reefs.' },
      { title: 'Back to your hotel', duration: '45 minutes', description: 'The bus returns you to Sharm el-Sheikh.' },
    ],
  },
  SSS_COLOURED_CANYON: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-colored-canyon-blue-hole-dahab-jeep-adventure',
    category: DAY_TRIPS,
    options: [
      'colored-canyon-without-blue-hole-abu-galum-fdc52dfcca40',
      'colored-canyon-with-atv-quad-without-blue-hol-14d86f6dd20a',
      'colored-canyon-blue-hole-abu-galum-with-atv-q-c9913ca7db12',
    ],
    addons: [],
    departures: ['08:00'],
    departureLabels: { '08:00': 'Morning' },
    rename: {
      'colored-canyon-without-blue-hole-abu-galum-fdc52dfcca40': {
        name: 'Canyon, lunch and the camel ride',
        description: 'The jeep safari, the walk through the canyon and snorkelling from the shore.',
      },
      'colored-canyon-with-atv-quad-without-blue-hol-14d86f6dd20a': {
        name: 'The same day with a quad ride',
        description: 'A quad along the shore and into the hills added to the day.',
      },
      'colored-canyon-blue-hole-abu-galum-with-atv-q-c9913ca7db12': {
        name: 'With the Blue Hole, Abu Galum and the quad',
        description: 'The entry fees for the Blue Hole and Abu Galum included, with the quad ride.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        'Hotel pickup and drop-off of in air-conditioned transportation',
        'Blue Hole and Abu Galum (if option selected)',
        'ATV ride along the sea and mountains in Dahab (if option selected)',
      ],
    },
    add: {
      inclusions: ['Hotel pickup and drop-off in an air-conditioned vehicle'],
      needToKnow: [
        'The Blue Hole and Abu Galum are included on the option that names them. On the other two the published record prices the Blue Hole entry at twenty euros a person, paid on site.',
        'The quad ride along the shore is part of the two options that name it.',
        'Guests who are not going into the Blue Hole wait at the Bedouin camp after lunch until the group comes back.',
        'Original passports are needed for everyone on the day.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '1 hour', description: 'An air-conditioned vehicle collects you from your hotel in Sharm el-Sheikh for the drive north.' },
      { title: 'The Coloured Canyon', duration: '2 hours', description: 'The walk through the canyon with a guide, who explains how it was formed, with a safety briefing first.' },
      { title: 'The jeep safari', duration: '1 hour', description: 'By four-wheel drive out of the hills and down to the coast.' },
      { title: 'Dahab', duration: '1 hour', description: 'Free time in the town, and the shops.' },
      { title: 'In the water', duration: '1 hour', description: 'Snorkelling from the shore, or at the Blue Hole on the option that includes its entry.' },
      { title: 'The camel and the quad', duration: '30 minutes', description: 'A camel ride along the sea, with a quad ride as well on the two options that include one.' },
      { title: 'Lunch', duration: '45 minutes', description: 'Lunch in a Bedouin tent on the beach at Dahab.' },
      { title: 'Back to your hotel', duration: '1 hour', description: 'The drive back to Sharm el-Sheikh.' },
    ],
  },
  SSS_THREE_POOLS: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-dahab-3-pools-camel-ride-red-canyon-lunch-tour',
    category: DAY_TRIPS,
    options: ['dahab-3-pools-camel-ride-red-canyon-lunch-43fae27c4c65', 'dahab-quad-bike-3-pools-camel-ride-red-canyon-3983acfc665a'],
    addons: [],
    departures: ['08:00'],
    departureLabels: { '08:00': 'Morning' },
    rename: {
      'dahab-3-pools-camel-ride-red-canyon-lunch-43fae27c4c65': {
        name: 'Jeep, canyon, camel and lunch',
        description: 'The Salama canyon by jeep, the Three Pools and lunch by the sea.',
      },
      'dahab-quad-bike-3-pools-camel-ride-red-canyon-3983acfc665a': {
        name: 'The same day with a quad ride',
        description: 'A quad on the beach and between the mountains of the Red Canyon added to the day.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        'Quad bike ride on the beach & between mountains (if option selected)',
        'Snorkeling stop at the 3 Pools (Snorkeling Equipment not included) add on selection',
      ],
    },
    add: {
      inclusions: ['A snorkelling stop at the Three Pools'],
      exclusions: ['Snorkelling equipment'],
      needToKnow: [
        'The quad ride is part of the option that names it; the other option makes the same stops without it.',
        'Original passports are needed for everyone on the day.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '1 hour', description: 'An air-conditioned vehicle collects you from your hotel in Sharm el-Sheikh for the drive north.' },
      { title: 'The Salama canyon', duration: '2.5 hours', description: 'Reached by jeep, with a guide, and walked on foot over off-road ground.' },
      { title: 'The Three Pools', duration: '3 hours', description: 'The sheltered water on the Dahab coast: a camel ride, a snorkelling stop, free time and, on the option that includes it, a quad ride on the beach and between the mountains of the Red Canyon.' },
      { title: 'Lunch', description: 'Lunch at a seaside restaurant, with bottled water through the day.' },
      { title: 'Back to your hotel', duration: '1 hour', description: 'The drive back to Sharm el-Sheikh.' },
    ],
  },
};

/** The client's own trip photos, copied into the network's Cloudinary, one folder per site. */
const PHOTO = {
  luxorNileFelucca: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936145/attractions-network/network-b03/temple-of-karnak/bmqezftsbjtqygdtskec.jpg',
  tembleColonnadeAtNight: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936147/attractions-network/network-b03/temple-of-karnak/bsqcfguowy889djhoxqd.jpg',
  feluccaFromTheWestBankDay: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792938256/attractions-network/network-b03/valley-of-the-nobles/bmqezftsbjtqygdtskec.jpg',
  balloonOverTheWestBank: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936149/attractions-network/network-b03/valley-of-the-nobles/cfhd24sdurwnp7rxgfkw.jpg',
  quadByTheRiver: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936151/attractions-network/network-b03/valley-of-the-nobles/mtitccl14pu9pgvlnz7b.jpg',
  whaleFossil: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936152/attractions-network/network-b03/whale-valley-wadi-al-hitan/gjhaizw6ruucxxdirzdq.jpg',
  camelAtSunrise: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936154/attractions-network/network-b03/pyramids-camel-tour/yoge0wgzwbrw8zhfeels.jpg',
  threePyramids: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936156/attractions-network/network-b03/pyramids-camel-tour/cyqhwwakyack600gfghk.jpg',
  whiteIslandFromTheAir: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936158/attractions-network/network-b03/sharm-tour-guide/mn1pbadyiqwld8zrsne6.jpg',
  snorkellerOverCoral: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936160/attractions-network/network-b03/sharm-tour-guide/jarhqtfzkmkjlqh8mdiz.jpg',
  cruiseBoatOffTheCoast: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936162/attractions-network/network-b03/sharm-tour-guide/wp6cqxh8iqhqwbuoh01v.jpg',
  allahGate: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936164/attractions-network/network-b03/sharm-tour-guide/da2t24xuvbcuj3fe7bsy.jpg',
  bedouinTeaTray: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936166/attractions-network/network-b03/sharm-tour-guide/kxa3ofgozpd1uoe3g2aw.jpg',
  quadAndCamelsAtSunset: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936168/attractions-network/network-b03/sharm-tour-guide/suaaepyoerqr5fvns0kk.jpg',
  horsesInTheShallows: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936169/attractions-network/network-b03/sharm-tour-guide/bnpqklrzv3yc2bu5jzja.jpg',
  snorkellerAndClownfish: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936171/attractions-network/network-b03/sharm-tour-guide/qdboi8ytsk6g2byqtgbh.jpg',
  jeepBelowTheRocks: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936173/attractions-network/network-b03/sharm-tour-guide/xvskdnp6simwnlxvry6x.jpg',
  camelInTheCanyon: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936174/attractions-network/network-b03/sharm-tour-guide/wpygg5o9iwxlr8lxp9q4.jpg',
  walkersOnTheMountain: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936176/attractions-network/network-b03/sharm-tour-guide/ossqhkp1podnl66zfqu2.jpg',
  monasteryWalls: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936179/attractions-network/network-b03/sharm-tour-guide/itys88mzs9eemv1rlz7c.jpg',
  museumFacade: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936380/attractions-network/network-b03/sharm-tour-guide/ltcducpras9ji7yoyhip.jpg',
  twoBuggiesInDust: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936182/attractions-network/network-b03/quad-safari-hurghada/p3ozvi49kz39eaxrkudb.jpg',
  buggyOnTheShore: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936184/attractions-network/network-b03/quad-safari-hurghada/unpa2hggou46q91yae5q.jpg',
  camelLineOnTheRidge: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936185/attractions-network/network-b03/quad-safari-hurghada/o7g2hi0fm8k5uzw4esl4.jpg',
  quadOnTheDunes: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936187/attractions-network/network-b03/quad-safari-hurghada/p8fqna6unqcyjvvl9s86.jpg',
  jeepConvoyOnTheRoad: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936189/attractions-network/network-b03/quad-safari-hurghada/au4adp5awtzkpktlym2i.jpg',
  bedouinTeaTrayDesert: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936190/attractions-network/network-b03/safari-sharm-el-sheikh/kxa3ofgozpd1uoe3g2aw.jpg',
  riderAgainstTheSunset: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936192/attractions-network/network-b03/safari-sharm-el-sheikh/meyiestyfg5sur2lgwvo.jpg',
  quadAndCamelsAtSunsetDesert: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936193/attractions-network/network-b03/safari-sharm-el-sheikh/suaaepyoerqr5fvns0kk.jpg',
  riderOnACamel: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936195/attractions-network/network-b03/safari-sharm-el-sheikh/qqo25k0p0m1qtvfzz3hd.jpg',
  quadAboveTheSea: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936197/attractions-network/network-b03/safari-sharm-el-sheikh/ak9eg3ao5v9ixrzhovqa.jpg',
  jeepInTheOpenDesert: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936198/attractions-network/network-b03/safari-sharm-el-sheikh/ihzuvhkpdyzmh1dguahw.jpg',
  camelInTheCanyonDesert: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936200/attractions-network/network-b03/safari-sharm-el-sheikh/wpygg5o9iwxlr8lxp9q4.jpg',
};

/** Each photo described as it looks, so a guest who cannot see it is told what is there. */
const ALT = {
  luxorNileFelucca: 'A felucca under a tall white sail on the Nile at low sun, with small motorboats carrying passengers and a town along the far bank',
  tembleColonnadeAtNight: 'Lit stone columns and standing pharaoh statues of a temple colonnade at night, against a dark blue sky',
  feluccaFromTheWestBankDay: 'The Nile in late afternoon light, a felucca under sail on the near side and small passenger boats mid-river, with the East Bank waterfront and palms along the far side',
  balloonOverTheWestBank: 'A yellow and red hot-air balloon seen from above over the Luxor West Bank, with the two seated Colossi of Memnon on their open ground beside a road, houses and green fields',
  quadByTheRiver: 'A quad bike on sand throwing up a cloud of dust beside the river, with a long colonnaded temple on the far bank',
  whaleFossil: 'The ribs and backbone of a fossil whale lying in pale desert sand, with eroded sandstone rock behind it',
  camelAtSunrise: 'A saddled camel in a patterned blanket standing on the sand, with two pyramids and a low sun in a yellow sky behind it',
  threePyramids: 'The three pyramids of Giza under a blue sky with white cloud, the smaller queens’ pyramids and loose blocks in front of them and rippled sand in the foreground',
  whiteIslandFromTheAir: 'A pale sandbar island seen from the air in turquoise water, with dark patches of coral scattered across the shallows',
  snorkellerOverCoral: 'A snorkeller in a mask and snorkel swimming just under the surface above a coral reef, with a green and pink parrotfish below',
  cruiseBoatOffTheCoast: 'A white multi-deck cruise boat on turquoise water, with a low shoreline of resort buildings along the horizon behind it',
  allahGate: 'Tall sculpted sandstone slabs leaning together to form an open gateway in the desert, against a pale sunset sky',
  bedouinTeaTray: 'A man in a white robe carrying a metal tray of small glasses of dark tea, held out towards the camera in bright sun',
  quadAndCamelsAtSunset: 'A rider on a quad bike kicking up sand in the foreground, with a line of camels and their handlers walking along the shore behind in low sun',
  horsesInTheShallows: 'A long line of riders in helmets on horseback standing in shallow water along the shore, reflected in the wet sand',
  snorkellerAndClownfish: 'A snorkeller swimming over a shallow reef in sunlit water, with an orange and white clownfish among the coral below',
  jeepBelowTheRocks: 'A white four-wheel-drive parked on open desert gravel in front of a low red rock outcrop under a pale sky',
  camelInTheCanyon: 'A rider on a camel in the narrow floor of a sandstone canyon, with smooth red and orange walls rising on both sides',
  walkersOnTheMountain: 'A crowd of walkers in hooded jackets climbing a rocky mountain path at first light, with high granite walls above them',
  monasteryWalls: 'A walled monastery of stone and whitewashed buildings at the foot of a bare mountain, with cypress trees along its wall',
  museumFacade: 'The pink stone façade of a museum with arched windows and a columned entrance, a sphinx statue and palm trees in the garden in front of it',
  twoBuggiesInDust: 'Two red and black buggies driving side by side through their own dust, their riders in helmets, with mountains behind',
  buggyOnTheShore: 'A buggy standing on a flat shore at sunset with its riders aboard, a headland and a small tower on the point behind',
  camelLineOnTheRidge: 'A line of camels and riders crossing a sand ridge in silhouette against a hazy sky',
  quadOnTheDunes: 'A quad bike with a helmet strapped to it, parked on a dune with rolling red sand stretching away behind',
  jeepConvoyOnTheRoad: 'A line of white four-wheel-drives on a desert road, with a flat-topped mountain and bare hills ahead',
  bedouinTeaTrayDesert: 'A tray of small glasses of dark tea carried out on an open hand by a man in a white robe in the desert sun',
  riderAgainstTheSunset: 'A rider on a quad bike in silhouette on a ridge against an orange and gold sunset sky, dust trailing behind the wheels',
  quadAndCamelsAtSunsetDesert: 'A quad bike throwing up sand at the front of the picture, with camels and their handlers walking the shore beyond in evening light',
  riderOnACamel: 'A rider in a blue shirt and red headscarf sitting on a camel with a hand raised, red desert cliffs behind',
  quadAboveTheSea: 'A rider driving a quad bike hard up a sand slope above the sea, sand flying from the wheels, with the coast below',
  jeepInTheOpenDesert: 'A white four-wheel-drive standing on stony desert ground with bare brown hills behind it',
  camelInTheCanyonDesert: 'A saddled camel carrying a rider through a narrow red sandstone canyon, the walls catching the light above',
};

const LUXOR = { lat: 25.6871, lng: 32.6346 };
const CAIRO = { lat: 30.0444, lng: 31.2357 };
const SHARM = { lat: 27.7369, lng: 34.3394 };
const HURGHADA = { lat: 27.2574, lng: 33.8129 };

/** Places no Luxor site serves. Karnak, the West Bank and the Nile are the sites' own ground. */
const NOT_LUXOR = /Hurghada|Sharm|Dahab|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Cairo|Giza|pyramid|Aswan|Alexandria|Fayoum|Siwa|Bahariya|Dendera|Edfu|Kom Ombo|Abydos|Abu Simbel/i;

export const B03B: NetworkBatch = {
  id: 'b03b',
  sites: [
    {
      slug: 'temple-of-karnak',
      name: 'Temple of Karnak',
      listingPath: '/trips',
      domain: 'templeofkarnak.com',
      city: 'Luxor',
      area: 'Luxor',
      pickupDestination: 'luxor',
      coordinates: LUXOR,
      currency: 'USD',
      slugPrefix: 'tok-',
      foreignPlaces: NOT_LUXOR,
      tagline: 'Days and evenings that take in Karnak',
      description: 'Karnak is the temple complex on the East Bank of Luxor, the largest religious site of the ancient world, built and rebuilt over some two thousand years. Two trips are on offer here, and both of them go to it.\n\nOne is a private day across both banks of the river, from the royal tombs and the Temple of Hatshepsut in the morning to Karnak and Luxor Temple in the afternoon, with a felucca sail and lunch in between. The other is an evening: a sail on the Nile at sunset, then the sound and light show inside the temple complex after dark. Both are collected from your hotel in Luxor. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Temple of Karnak Tours from Luxor Hotels',
        metaDescription: 'Day and evening trips from Luxor that take in the Temple of Karnak: both banks of the river with a felucca sail, or a sunset sail and the sound and light show.',
        keywords: [
          'temple of karnak tour',
          'karnak sound and light show',
          'luxor east and west bank day tour',
          'karnak temple from luxor hotel',
          'luxor felucca and karnak',
        ],
      },
      theme: { primaryColor: '#7A4B12', secondaryColor: '#F4EADA', accentColor: '#1F6F63' },
      heroImages: [PHOTO.tembleColonnadeAtNight, PHOTO.luxorNileFelucca],
      photoShortfall: 'The two programmes the site sells publish one photo each.',
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936269/attractions-network/tenant-logos/temple-of-karnak/monogram.png',
      trips: [
        {
          path: 'both-banks-and-karnak-with-a-felucca-sail',
          price: PROGRAMMES.TOK_BOTH_BANKS,
          title: 'Private Day Across Both Banks, Ending at Karnak and Luxor Temple',
          short: 'Eight hours with your own guide and driver: the Valley of the Kings and the Temple of Hatshepsut, the Colossi of Memnon, a felucca sail, then Karnak and Luxor Temple.',
          description: 'The car collects you from your hotel on the East Bank at seven or at eight and crosses to the West Bank first, for the royal tombs of the Valley of the Kings and the terraced Temple of Hatshepsut below the cliffs. The Colossi of Memnon come next, and then lunch.\n\nThe afternoon is on the East Bank. A traditional felucca takes you out on the Nile with a drink, and from the river the day finishes in the two great temple complexes of the city: Karnak, with its halls, obelisks and statues, and Luxor Temple. The entrance fees to the temples, the guide, the private driver, the felucca and lunch are in the price. Children have their own price, and the booking applies it.',
          highlights: [
            'The Valley of the Kings and the Temple of Hatshepsut',
            'The Colossi of Memnon',
            'Karnak and Luxor Temple with your guide',
            'A felucca sail on the Nile, and lunch',
          ],
          seo: {
            metaTitle: 'Luxor Both Banks Private Tour with Karnak Temple',
            metaDescription: 'A private eight-hour day in Luxor: the Valley of the Kings, Hatshepsut, the Colossi of Memnon, a felucca sail, then Karnak and Luxor Temple, with lunch.',
          },
          images: [PHOTO.luxorNileFelucca],
          imageAlts: [ALT.luxorNileFelucca],
        },
        {
          path: 'sunset-sail-and-the-show-at-karnak',
          price: PROGRAMMES.TOK_SOUND_AND_LIGHT,
          title: 'Sunset Felucca Sail and the Sound and Light Show at Karnak',
          short: 'An evening of about five hours: an hour on the Nile aboard a wooden felucca as the sun goes down, then the lit temple complex and the show after dark.',
          description: 'A private car takes you from your hotel in Luxor down to the corniche, where a wooden felucca is waiting. The sail runs about an hour, past farmland and the waterfront, with the light going gold on the water.\n\nFrom the river the evening moves to Karnak for the sound and light show. The monuments are lit as you walk through the complex, and the story told is that of ancient Thebes and of Amun, Mut and Khonsu. The private transfers, the guide, the entry fees and bottled water are in the price; lunch is not. Start times are published through the day, and the team confirms your pickup when it confirms the booking. Children have their own price.',
          highlights: [
            'An hour aboard a felucca at sunset',
            'The sound and light show inside Karnak',
            'A private car each way from your hotel',
            'Entry fees and a guide included',
          ],
          seo: {
            metaTitle: 'Karnak Sound and Light Show with a Sunset Felucca Sail',
            metaDescription: 'An evening in Luxor: an hour on the Nile aboard a felucca at sunset, then the sound and light show at Karnak, with private transfers and entry fees.',
          },
          images: [PHOTO.tembleColonnadeAtNight],
          imageAlts: [ALT.tembleColonnadeAtNight],
        },
      ],
    },
    {
      slug: 'valley-of-the-nobles',
      name: 'Valley of the Nobles',
      listingPath: '/trips',
      domain: 'valleyofthenobles.com',
      city: 'Luxor',
      area: 'Luxor',
      pickupDestination: 'luxor',
      coordinates: LUXOR,
      currency: 'USD',
      // The day this site leads with ends at Karnak, on the far bank, so Karnak is not a foreign place here.
      foreignPlaces: /Hurghada|Sharm|Dahab|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Cairo|Giza|pyramid|Aswan|Alexandria|Fayoum|Siwa|Bahariya|Dendera|Edfu|Kom Ombo|Abydos|Abu Simbel/i,
      slugPrefix: 'von-',
      tagline: 'The Luxor West Bank, where the Tombs of the Nobles lie',
      description: 'The Tombs of the Nobles were cut into the hillside at Sheikh Abd el-Qurna, on the Luxor West Bank, among the valleys that hold the royal tombs and below the terraces of the mortuary temples.\n\nNo trip published for Luxor at the moment goes inside them, and this site does not pretend otherwise. What it sells is the ground they stand in: a private day that walks the royal tombs, the Temple of Hatshepsut and the Colossi of Memnon before crossing to the East Bank; a balloon flight at first light over the same valleys; and a quad ride through the desert behind them. Three trips in all, and each page says plainly that the day does not include the tombs. If the tombs themselves are what you want, write to the team before you book and they will tell you what can be arranged.',
      seo: {
        metaTitle: 'Luxor West Bank Trips Near the Valley of the Nobles',
        metaDescription: 'The Luxor West Bank where the Tombs of the Nobles lie: a private day at the royal tombs and Hatshepsut, a sunrise balloon flight, or a desert quad ride.',
        keywords: [
          'valley of the nobles luxor',
          'luxor west bank trips',
          'luxor sunrise balloon flight',
          'west bank quad safari luxor',
          'tombs of the nobles qurna',
          'valley of the kings and hatshepsut day',
        ],
      },
      theme: { primaryColor: '#2F5D50', secondaryColor: '#F2EDE1', accentColor: '#C2873B' },
      heroImages: [PHOTO.feluccaFromTheWestBankDay, PHOTO.balloonOverTheWestBank, PHOTO.quadByTheRiver],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936270/attractions-network/tenant-logos/valley-of-the-nobles/monogram.png',
      trips: [
        {
          path: 'royal-tombs-hatshepsut-and-the-east-bank',
          price: PROGRAMMES.VON_BOTH_BANKS,
          title: 'The Royal Tombs, Hatshepsut and the Colossi, with the East Bank After Lunch',
          short: 'The published day that walks the West Bank: the Valley of the Kings, the Temple of Hatshepsut and the Colossi of Memnon, then a sail and the East Bank temples.',
          description: 'This is the one published Luxor day that spends its morning among the monuments the Tombs of the Nobles were cut beside. A car collects you from your East Bank hotel at seven or at eight, crosses the river, and gives the first half of the day to the West Bank: the royal tombs in the Valley of the Kings, the terraces of the Temple of Hatshepsut below the cliffs, and the two seated Colossi of Memnon out on the flat. Lunch follows.\n\nThe afternoon crosses back. A felucca takes you out on the Nile with a drink, and the day closes in the East Bank temples, Karnak and Luxor Temple, with the guide. The entrance fees, the guide, the private driver, the felucca and lunch are in the price, and the published day runs eight hours. It does not include the Tombs of the Nobles themselves; ask the team before you book if that is what you are after. Children have their own price.',
          highlights: [
            'The Valley of the Kings with a guide',
            'The Temple of Hatshepsut below the cliffs',
            'The Colossi of Memnon, and lunch',
            'A sail on the Nile and the East Bank temples',
          ],
          seo: {
            metaTitle: 'Luxor West Bank Day: Royal Tombs, Hatshepsut, Memnon',
            metaDescription: 'A private Luxor day on the West Bank where the Tombs of the Nobles lie: the royal tombs, Hatshepsut and the Colossi of Memnon, then a felucca and the East Bank.',
          },
          images: [PHOTO.feluccaFromTheWestBankDay],
          imageAlts: [ALT.feluccaFromTheWestBankDay],
        },
        {
          path: 'sunrise-balloon-over-the-west-bank',
          price: PROGRAMMES.VON_BALLOON,
          title: 'Sunrise Balloon Flight Over the Luxor West Bank',
          short: 'A flight at first light over the burial valleys, the cliffside temples, the villages and the river, with transfers from your hotel or cruise boat.',
          description: 'The transfer leaves before dawn for the launch site, where you meet the crew and watch the balloon fill. The basket lifts as the first light reaches the West Bank, and the flight drifts over the burial valleys and the terraced temples below the cliffs, over farmland, villages and the Nile with its boats.\n\nThe published record puts the time in the air at about 45 minutes, and between 40 and 90 minutes depending on the weather. The flight and the transfers both ways are in the price; food and drinks are not. Flights run only in weather the operator judges safe, children must be at least six and with a responsible adult, and a scanned copy of your passport is needed to confirm the booking. The published day does not include the Tombs of the Nobles.',
          highlights: [
            'The burial valleys and temples seen from the air',
            'A start before dawn, for the first light',
            'About 45 minutes in the air',
            'Transfers from your hotel or cruise boat',
          ],
          seo: {
            metaTitle: 'Luxor Sunrise Hot Air Balloon Flight with Transfers',
            metaDescription: 'A sunrise balloon flight over the Luxor West Bank, its burial valleys, temples, villages and the Nile, with transfers from your hotel or cruise boat.',
          },
          images: [PHOTO.balloonOverTheWestBank],
          imageAlts: [ALT.balloonOverTheWestBank],
        },
        {
          path: 'west-bank-desert-quad-ride',
          price: PROGRAMMES.VON_QUAD,
          title: 'Quad Ride in the Desert Behind the Luxor West Bank',
          short: 'Two hours with an hour of riding: the crossing by motorboat, the drive past villages and fields, then Wadi Ziad and the foot of the West Bank mountains.',
          description: 'A minivan collects you from your hotel or Nile cruise and the river is crossed by motorboat, with the drive on the far side running past villages and farmland to the quad base. The briefing and the equipment check come first, and a local English-speaking guide stays with the group.\n\nThe riding is about an hour, across the open ground of Wadi Ziad and along the foot of the mountain range that stands behind the West Bank. Water, the shared transfers, the minivan and the crossing are in the price. The published day does not include the Tombs of the Nobles, which lie in the hillside on the other side of that range; ask the team before you book if you want to see them. A copy of your passport is needed two days ahead.',
          highlights: [
            'An hour of riding in the West Bank desert',
            'Wadi Ziad and the mountain range behind it',
            'The crossing of the Nile by motorboat',
            'A local English-speaking guide with the group',
          ],
          seo: {
            metaTitle: 'Luxor West Bank Desert Quad Bike Safari',
            metaDescription: 'An hour of quad riding in the desert behind the Luxor West Bank, through Wadi Ziad, with the river crossing, a guide and transfers from your hotel.',
          },
          images: [PHOTO.quadByTheRiver],
          imageAlts: [ALT.quadByTheRiver],
        },
      ],
    },
    {
      slug: 'whale-valley-wadi-al-hitan',
      name: 'Whale Valley Wadi Al Hitan',
      listingPath: '/trips',
      domain: 'whalevalleywadialhitan.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'wwh-',
      foreignPlaces: /Hurghada|Sharm|Dahab|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|pyramid|Saqqara|Sakkara|Memphis|Dahshur/i,
      tagline: 'The whale fossils of the Fayoum, from Cairo and Giza',
      description: 'Wadi Al Hitan, the Valley of the Whales, lies in the desert west of the Fayoum. Whale skeletons tens of millions of years old are left where they were found, out in the open sand, and the site is on the UNESCO World Heritage list.\n\nThis site sells one trip: the full day that reaches it from Cairo and Giza. The same day takes in the waterfalls of Wadi El Rayan, the Magic Lake, Lake Qarun and the pottery village of Tunis, with part of the driving done by 4x4 across the sand. Pickup and drop-off are at your hotel. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Wadi Al Hitan Whale Fossils Day Trip from Cairo',
        metaDescription: 'A full day from Cairo or Giza to Wadi Al Hitan, the Valley of the Whales, with the Wadi El Rayan waterfalls, the Magic Lake, Lake Qarun and a 4x4 drive.',
        keywords: [
          'wadi al hitan day trip',
          'valley of the whales from cairo',
          'whale fossils egypt tour',
          'wadi el rayan waterfalls trip',
          'fayoum desert safari from giza',
        ],
      },
      theme: { primaryColor: '#1C4A6E', secondaryColor: '#F0EFE8', accentColor: '#D9A441' },
      heroImages: [PHOTO.whaleFossil],
      photoShortfall: 'The one programme the site sells publishes a single photo.',
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936271/attractions-network/tenant-logos/whale-valley-wadi-al-hitan/monogram.png',
      trips: [
        {
          path: 'wadi-al-hitan-full-day',
          price: PROGRAMMES.WWH_DAY,
          title: 'Wadi Al Hitan, the Valley of the Whales, in a Day',
          short: 'A full day from Cairo or Giza to the whale fossils, with the Wadi El Rayan waterfalls, a 4x4 drive over the sand, the Magic Lake, Lake Qarun and Tunis Village.',
          description: 'Pickup is at seven from your hotel in Cairo or Giza, and the drive out takes about two hours in a private air-conditioned vehicle. Wadi Al Hitan is the reason for the day: fossil whale skeletons lying in the sand where they were found, at a site on the UNESCO World Heritage list.\n\nThe rest of the day is the desert and the lakes around it. The waterfalls at Wadi El Rayan fall between the two lakes; a 4x4 takes you across the sand, with sandboarding on the dunes and a stop at the Magic Lake; and Lake Qarun and the pottery village of Tunis sit above the water. Entry fees, the jeep safari, lunch, bottled water and all the transfers are in the price; tips are not. The published day is about eight hours, and children have their own price.',
          highlights: [
            'Fossil whale skeletons in the open desert',
            'The waterfalls of Wadi El Rayan',
            'A 4x4 drive with sandboarding and the Magic Lake',
            'Lake Qarun and the pottery village of Tunis',
          ],
          seo: {
            metaTitle: 'Wadi Al Hitan and Fayoum Full-Day Trip from Cairo',
            metaDescription: 'A full day from Cairo or Giza to the whale fossils of Wadi Al Hitan, the Wadi El Rayan waterfalls, the Magic Lake, Lake Qarun and Tunis Village, with lunch.',
          },
          images: [PHOTO.whaleFossil],
          imageAlts: [ALT.whaleFossil],
        },
      ],
    },
  ],
};

export const B03C: NetworkBatch = {
  id: 'b03c',
  sites: [
    {
      slug: 'pyramids-camel-tour',
      name: 'Pyramids Camel Tour',
      listingPath: '/trips',
      domain: 'pyramidscameltour.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'pct-',
      foreignPlaces: /Hurghada|Sharm|Dahab|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Citadel|Khan el-Khalili/i,
      tagline: 'Giza days with the camel ride in the price',
      description: 'Plenty of trips to the Giza plateau offer a camel ride at the gate for extra money. This site sells only the days where the ride is part of the published price, so nothing has to be paid for at the sand.\n\nThree are on offer. Two are the same sunrise or morning programme, one shared and one private, with an hour on a camel or a horse, breakfast and two guided hours among the pyramids. The third is a private day with its own camel ride around the plateau, the entrance fees and lunch at a local restaurant. Every one is collected from your hotel in Cairo or Giza and carries the entry ticket for the pyramids complex. Hold a place online and pay later.',
      seo: {
        metaTitle: 'Giza Pyramids Tours with the Camel Ride Included',
        metaDescription: 'Giza day trips where the camel ride is in the published price: a sunrise or morning ride with breakfast, shared or private, and a private day with lunch.',
        keywords: [
          'pyramids camel tour',
          'giza camel ride included',
          'sunrise camel ride pyramids',
          'private giza tour with camel ride',
          'camel ride and breakfast giza',
        ],
      },
      theme: { primaryColor: '#B5651D', secondaryColor: '#FBF3E6', accentColor: '#2B3A55' },
      heroImages: [PHOTO.camelAtSunrise, PHOTO.threePyramids],
      photoShortfall: 'The two programmes the site sells publish one photo each.',
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936265/attractions-network/tenant-logos/pyramids-camel-tour/monogram.png',
      trips: [
        {
          path: 'shared-sunrise-camel-ride-and-breakfast',
          price: PROGRAMMES.PCT_SHARED_SUNRISE,
          title: 'Shared Camel Ride at the Pyramids with Breakfast',
          short: 'Five hours in a shared group: an hour on a camel or a horse beside the plateau, an Egyptian breakfast and two guided hours among the pyramids.',
          description: 'Two starts are published, half past four in the morning for the hour when the sun comes up behind the plateau, and eight o’clock for a later morning. Either way the published day runs five hours.\n\nThe hour in the saddle opens it, on a camel or a horse on the sand beside the plateau, and a traditional Egyptian breakfast follows. A guide then takes the group through the pyramids complex and the Sphinx for two hours, with the entry ticket in the price. The air-conditioned transport and the pickup from your hotel in Cairo or Giza are included. The vehicle and the guide are shared with other guests, and the published price is the same for adults and children.',
          highlights: [
            'An hour on a camel or a horse',
            'A start at sunrise or later in the morning',
            'A traditional Egyptian breakfast',
            'Two guided hours among the pyramids',
          ],
          seo: {
            metaTitle: 'Shared Giza Camel Ride Tour with Breakfast',
            metaDescription: 'A shared Giza day with the camel ride in the price: an hour on a camel or horse beside the plateau, breakfast, two guided hours and hotel pickup.',
          },
          images: [PHOTO.camelAtSunrise],
          imageAlts: [ALT.camelAtSunrise],
        },
        {
          path: 'private-sunrise-camel-ride-and-breakfast',
          price: PROGRAMMES.PCT_PRIVATE_SUNRISE,
          title: 'Private Camel Ride at the Pyramids with Breakfast',
          short: 'The same five hours with the vehicle and the guide for your group alone, and an afternoon start as well as the sunrise and morning ones.',
          description: 'This is the private way to take the same programme: an hour on a camel or a horse on the sand beside the plateau, a traditional Egyptian breakfast, and two guided hours in the pyramids complex and at the Sphinx. The entry ticket for the complex is in the price.\n\nThree starts are published, half past four, eight o’clock and one in the afternoon. The vehicle is air-conditioned and yours alone, the guide is an English-speaking Egyptologist, and pickup and drop-off are at your hotel in Cairo or Giza. Children have their own price, and the booking applies it.',
          highlights: [
            'The vehicle and the guide for your group alone',
            'An hour on a camel or a horse',
            'Sunrise, morning or afternoon starts',
            'Breakfast and the entry ticket included',
          ],
          seo: {
            metaTitle: 'Private Giza Camel Ride Tour with Breakfast',
            metaDescription: 'A private five-hour trip at the Giza pyramids: an hour on a camel or horse, breakfast, two guided hours at the pyramids and the Sphinx, with hotel pickup.',
          },
          images: [PHOTO.camelAtSunrise],
          imageAlts: [ALT.camelAtSunrise],
        },
        {
          path: 'private-day-with-a-camel-ride-and-lunch',
          price: PROGRAMMES.PCT_CAMEL_LUNCH,
          title: 'Private Pyramids Day with a Camel Ride Around the Plateau and Lunch',
          short: 'Four hours with your own guide and car: the pyramids and the Sphinx, a camel ride around the plateau, lunch at a local restaurant and the entrance fees.',
          description: 'The camel ride on this day is around the plateau itself, and it is in the price. The rest of it is private: your own English-speaking guide, your own vehicle, and a start you pick from a quarter-hourly list running from eight in the morning to a quarter to one. The published day is four hours.\n\nThe guided walk takes in the pyramids and the Sphinx with the entrance fees covered, the camel ride goes round the plateau, and lunch is at a local restaurant. Pickup and drop-off are at your hotel in Cairo or Giza. Pickup from further out is published as a paid extra, which this site does not sell, so ask the team before you book if your hotel is outside the city centre. Children have their own price.',
          highlights: [
            'A camel ride around the Giza plateau',
            'Your own guide and vehicle',
            'Lunch at a local restaurant',
            'Entrance fees and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Private Giza Pyramids Camel Ride Tour with Lunch',
            metaDescription: 'A four-hour private day at the Giza pyramids with your own guide and car, a camel ride around the plateau, lunch and the entrance fees, from Cairo or Giza.',
          },
          images: [PHOTO.threePyramids],
          imageAlts: [ALT.threePyramids],
        },
      ],
    },
    {
      slug: 'sharm-tour-guide',
      name: 'Sharm Tour Guide',
      listingPath: '/trips',
      domain: 'sharmtourguide.com',
      city: 'Sharm El Sheikh',
      area: 'Sharm el-Sheikh',
      pickupDestination: 'sharm-el-sheikh',
      coordinates: SHARM,
      currency: 'USD',
      slugPrefix: 'stg-',
      // The site carries day trips out of Sharm el-Sheikh, which reach Ras Mohamed, Tiran, Dahab, Saint
      // Catherine and, on one long day, Cairo and Giza. The Red Sea mainland is not its ground.
      foreignPlaces: /Hurghada|Giftun|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Fayoum|Alexandria|Siwa|Bahariya|Taba|Nuweiba/i,
      tagline: 'A guide to the day trips that leave Sharm el-Sheikh',
      description: 'Sharm Tour Guide is a plain index of the days you can book out of Sharm el-Sheikh, one page for each kind so you can see what is on offer before you pick.\n\nThere are boats into Ras Mohamed National Park and out to Tiran Island, and a half day into the park by bus. There is the Sinai desert by quad, by buggy and on horseback. There are the long Dahab days, with the Blue Hole, the coloured canyons and the Three Pools. There is Mount Sinai overnight and Saint Catherine’s Monastery by day. And there is Cairo, reached by road and back inside a day. Every page says what its price covers, what it does not and when it leaves. All of them are collected from your hotel in Sharm el-Sheikh.',
      seo: {
        metaTitle: 'Sharm El Sheikh Day Trips: a Guide to What Is on Offer',
        metaDescription: 'Day trips from Sharm el-Sheikh in one place: Ras Mohamed and Tiran by boat, desert quad and horse rides, Dahab and the Blue Hole, Mount Sinai and Cairo.',
        keywords: [
          'sharm el sheikh day trips',
          'sharm tour guide',
          'what to do in sharm el sheikh',
          'dahab blue hole from sharm',
          'mount sinai sunrise trip',
        ],
      },
      theme: { primaryColor: '#0E6E8C', secondaryColor: '#F2F7F8', accentColor: '#E8A33D' },
      heroImages: [PHOTO.whiteIslandFromTheAir, PHOTO.allahGate, PHOTO.camelInTheCanyon],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936268/attractions-network/tenant-logos/sharm-tour-guide/monogram.png',
      trips: [
        {
          path: 'ras-mohamed-and-white-island-by-boat',
          price: PROGRAMMES.STG_RAS_MOHAMED,
          title: 'Ras Mohamed and White Island by Boat, with Lunch',
          short: 'A nine-hour day on the water: two snorkelling stops inside the national park, an hour on the White Island sandbar and a buffet lunch on board.',
          description: 'A van takes you from your hotel to the marina and the boat sails about two hours into Ras Mohamed National Park, the protected tip of Sinai. Two snorkelling stops follow, with an instructor on board, and an hour is spent on the sandbar of White Island.\n\nThis is the complete option: the national park entry fee and the snorkelling equipment are both included, along with life jackets, a buffet lunch, hot and cold drinks, soft drinks and water, and the boat’s two bathrooms and showers. One departure leaves at half past eight. An introductory dive, short or long, and a diving suit can be added when you book. Children have their own price. Bring swimwear, a towel, sunscreen and a copy of your passport.',
          highlights: [
            'Two snorkelling stops inside the national park',
            'An hour on the White Island sandbar',
            'The park fee and the snorkelling gear included',
            'A buffet lunch and drinks on board',
          ],
          seo: {
            metaTitle: 'Ras Mohamed and White Island Snorkelling Day from Sharm',
            metaDescription: 'A nine-hour boat day from Sharm el-Sheikh into Ras Mohamed National Park and to White Island, with the park fee, snorkelling gear and a buffet lunch.',
          },
          images: [PHOTO.whiteIslandFromTheAir],
          imageAlts: [ALT.whiteIslandFromTheAir],
        },
        {
          path: 'tiran-island-snorkelling-cruise',
          price: PROGRAMMES.STG_TIRAN,
          title: 'Tiran Island Snorkelling Cruise with Lunch',
          short: 'A yacht day out to Tiran Island with two stops in the water, the snorkelling gear included and a buffet lunch on board.',
          description: 'The van collects you from your hotel for the half-hour drive to the marina, and the yacht is out for most of the day. Two stops are made for snorkelling and diving, one off Tiran Island and one over the reefs, with an instructor and life jackets on board.\n\nThe snorkelling equipment is part of this option, as are the Ras Nasrani entrance fees, the buffet lunch, hot and cold drinks, unlimited soft drinks and water, and the boat’s bathroom and shower. One departure leaves at eight. An introductory dive and a diving suit can be added when you book. Children have their own price. Bring your passport or ID for the marina check.',
          highlights: [
            'Two snorkelling and diving stops',
            'Tiran Island and the reefs around it',
            'Snorkelling equipment in the price',
            'A buffet lunch and drinks on board',
          ],
          seo: {
            metaTitle: 'Tiran Island Snorkelling Cruise from Sharm El Sheikh',
            metaDescription: 'A yacht day from Sharm el-Sheikh to Tiran Island with two snorkelling stops, the equipment included, a buffet lunch and hotel pickup.',
          },
          images: [PHOTO.snorkellerOverCoral],
          imageAlts: [ALT.snorkellerOverCoral],
        },
        {
          path: 'ras-mohamed-cruise-with-a-barbecue-lunch',
          price: PROGRAMMES.STG_ELITE_CRUISE,
          title: 'Ras Mohamed Cruise on a Four-Deck Boat with a Barbecue Lunch',
          short: 'Seven hours aboard a boat with four floors and two air-conditioned salons: the sail into the park, a snorkelling stop and a barbecue buffet.',
          description: 'A coach takes you from your hotel to the marina, about twenty-five minutes, and the boat sails around two and a half hours into Ras Mohamed National Park. It has four floors, two air-conditioned salons and plenty of deck.\n\nThe day makes a stop for swimming and snorkelling in the park, calls at White Island when the water allows, and serves a barbecue buffet on board. One departure leaves at nine. Snorkelling gear and the marina entrance fee are not included: the published record puts the marina fee at five euros a person, paid on arrival, and the team confirms how it is paid when it confirms your booking. Children have their own price. Bring swimwear, a towel and sunscreen.',
          highlights: [
            'A boat with four floors and two salons',
            'The sail into Ras Mohamed National Park',
            'A swimming and snorkelling stop',
            'A barbecue buffet served on board',
          ],
          seo: {
            metaTitle: 'Ras Mohamed Boat Cruise from Sharm with Barbecue Lunch',
            metaDescription: 'A seven-hour cruise from Sharm el-Sheikh into Ras Mohamed National Park on a four-deck boat, with a snorkelling stop and a barbecue buffet on board.',
          },
          images: [PHOTO.cruiseBoatOffTheCoast],
          imageAlts: [ALT.cruiseBoatOffTheCoast],
        },
        {
          path: 'ras-mohamed-half-day-by-bus',
          price: PROGRAMMES.STG_RAS_MOHAMED_BUS,
          title: 'Ras Mohamed and Allah’s Gate, Half a Day by Bus',
          short: 'Four hours by road into the national park: the mangroves, the Earthquake Crack, a swim in the Magic Lake and the stone arch of Allah’s Gate.',
          description: 'A shared bus collects you from your hotel reception at half past nine and drives into Ras Mohamed National Park. A certified snorkelling guide is with the group, and there is a stop where masks and fins can be hired if you want them.\n\nThe park itself is the day: a snorkelling stop over the reefs, the mangrove shore with its fiddler crabs, the Earthquake Crack, the saltwater lagoon of the Magic Lake, and Allah’s Gate, the arch of standing stones. You are back at your hotel by the early afternoon. The park entry fee of ten euros a person is not in the price and is paid on arrival, and snorkelling gear is not included. Children have their own price.',
          highlights: [
            'The mangroves and the Earthquake Crack',
            'A swim in the Magic Lake',
            'The stone arch of Allah’s Gate',
            'A snorkelling stop over the reefs',
          ],
          seo: {
            metaTitle: 'Ras Mohamed Half-Day Bus Trip and Allah’s Gate',
            metaDescription: 'A four-hour bus trip from Sharm el-Sheikh into Ras Mohamed National Park: the mangroves, the Earthquake Crack, the Magic Lake and Allah’s Gate.',
          },
          images: [PHOTO.allahGate],
          imageAlts: [ALT.allahGate],
        },
        {
          path: 'sinai-desert-quad-ride-with-bedouin-tea',
          price: PROGRAMMES.STG_SINAI_QUAD,
          title: 'Sinai Desert Quad Ride with Bedouin Tea',
          short: 'Two hours with an hour on a quad of your own, a guide riding with the group and a stop in a Bedouin village for tea.',
          description: 'A private air-conditioned bus takes you out of Sharm el-Sheikh to the quad base, where the bikes are handed over and the briefing is given. A professional guide rides with the group the whole way.\n\nThe riding is about an hour across open desert, with the Sinai mountains on every side, and it breaks for tea at a Bedouin village, where the hosts talk about living out here. Four start times are published, from four in the morning to a quarter past two. The transfers, the quad ticket, the guide and the tea are in the price; tips are not. A copy of your passport is needed two days ahead. Children have their own price.',
          highlights: [
            'An hour on a quad of your own',
            'A guide riding with the group',
            'Tea at a Bedouin village',
            'Four start times through the day',
          ],
          seo: {
            metaTitle: 'Sinai Desert Quad Bike Safari from Sharm El Sheikh',
            metaDescription: 'A two-hour quad safari in the Sinai desert from Sharm el-Sheikh, with a guide, a stop for Bedouin tea and hotel transfers both ways.',
          },
          images: [PHOTO.bedouinTeaTray],
          imageAlts: [ALT.bedouinTeaTray],
        },
        {
          path: 'desert-afternoon-with-a-camel-ride-and-a-barbecue',
          price: PROGRAMMES.STG_SUPER_SAFARI,
          title: 'Desert Afternoon with a Camel Ride, a Barbecue and Stargazing',
          short: 'An afternoon and evening in the Sinai: a quad or buggy of your own, a camel ride at the Bedouin camp, a barbecue buffet and a telescope after dark.',
          description: 'The pickup is in the afternoon, in an air-conditioned vehicle, and the day begins at the safari centre with a welcome drink, a safety briefing and the driving instructions. The desert ride runs about twenty-five minutes out, with a stop at a Bedouin tent for tea and bread and a stop in the open desert, then back to the centre.\n\nFrom there the evening moves to the Bedouin camp for a camel ride, a barbecue buffet with water and soft drinks, and the entertainment the camp puts on. It finishes with the camp lights off and a telescope out, with an astronomer to point things out. You choose a quad or a buggy of your own; the published record also sells the afternoon for two, three or four riders sharing a vehicle, which this site does not sell. The published price is the same for adults and children.',
          highlights: [
            'A quad or a buggy of your own',
            'A camel ride at the Bedouin camp',
            'A barbecue buffet and the evening show',
            'A telescope and an astronomer after dark',
          ],
          seo: {
            metaTitle: 'Sharm Desert Safari with Camel Ride, Barbecue and Stars',
            metaDescription: 'An afternoon and evening in the Sinai desert from Sharm el-Sheikh: a quad or buggy of your own, a camel ride, a barbecue buffet and stargazing.',
          },
          images: [PHOTO.quadAndCamelsAtSunset],
          imageAlts: [ALT.quadAndCamelsAtSunset],
        },
        {
          path: 'horse-ride-on-the-desert-and-the-shore',
          price: PROGRAMMES.STG_HORSE,
          title: 'Horse Ride on the Desert and into the Red Sea',
          short: 'Two hours in the saddle with an instructor: out across the desert behind the town, then along the beach, with the chance to ride into the water.',
          description: 'A transfer takes you from your hotel to the stables, and an experienced instructor stays with you for the whole ride. The route goes out across the open ground behind Sharm el-Sheikh and then down to the shore.\n\nThe last part is along the beach, and you can take the horse into the Red Sea itself. The horse, the instructor, the helmet and the transfers both ways are in the price; food and drinks are not. Three starts are published: five in the morning, a quarter past eight and a quarter past three. Children have their own price. Bring shoes or boots you do not mind getting wet.',
          highlights: [
            'Two hours in the saddle with an instructor',
            'The desert behind the town, then the beach',
            'Riding into the sea with your horse',
            'A helmet and transfers both ways',
          ],
          seo: {
            metaTitle: 'Sharm El Sheikh Horse Ride on the Desert and Beach',
            metaDescription: 'A two-hour horse ride from Sharm el-Sheikh across the desert and along the Red Sea shore, with an instructor, a helmet and hotel transfers.',
          },
          images: [PHOTO.horsesInTheShallows],
          imageAlts: [ALT.horsesInTheShallows],
        },
        {
          path: 'dahab-and-the-blue-hole',
          price: PROGRAMMES.STG_DAHAB_BLUE_HOLE,
          title: 'Dahab and the Blue Hole, with Snorkelling and Lunch',
          short: 'A nine-hour day up the coast: snorkelling at the Blue Hole or along the shore, a camel ride, a canyon stop, time in Dahab and lunch at a local restaurant.',
          description: 'An air-conditioned vehicle collects you from your hotel at eight for the drive north, about an hour each way, with a guide and a snorkelling guide for the day.\n\nTwo ways to take it are published. One includes the entry to the Blue Hole and a snorkelling stop there; the other stays on the shore and snorkels from the beach. Both take in a camel ride, a canyon stop, time in the town of Dahab and lunch at a local restaurant, with bottled water through the day. Snorkelling equipment is not included. Life jackets are available on request, and the trip is not suitable for pregnant women. Children have their own price, and the booking applies it.',
          highlights: [
            'Snorkelling at the Blue Hole or along the shore',
            'A camel ride and a canyon stop',
            'Time in the town of Dahab',
            'Lunch at a local restaurant',
          ],
          seo: {
            metaTitle: 'Dahab and Blue Hole Day Trip from Sharm El Sheikh',
            metaDescription: 'A nine-hour day from Sharm el-Sheikh to Dahab and the Blue Hole, with snorkelling, a camel ride, a canyon stop and lunch at a local restaurant.',
          },
          images: [PHOTO.snorkellerAndClownfish],
          imageAlts: [ALT.snorkellerAndClownfish],
        },
        {
          path: 'coloured-canyon-by-jeep-with-a-camel-ride',
          price: PROGRAMMES.STG_SALAMA_CANYON,
          title: 'Salama Coloured Canyon by Jeep, with a Camel Ride and Snorkelling',
          short: 'A long day inland and back to the coast: a jeep safari, a guided walk through the canyon, a camel ride, snorkelling, lunch and time to shop in Dahab.',
          description: 'The van leaves at half past seven for the drive north, and the day works its way between the shore and the mountains. A camel ride comes early, then snorkelling, then lunch, then time in Dahab for the shops.\n\nThe canyon is the last of it: a jeep takes the group in and the walk through the Salama Coloured Canyon is guided, with the government fees and the canyon entry in the price. One option snorkels at the canyon site; the other includes the Blue Hole instead. Lunch, the air-conditioned minivan, the guide and the camel ride are in both. Snorkel gear, drinks in the restaurant and photographs are not. Children have their own price.',
          highlights: [
            'A guided walk through the Salama Coloured Canyon',
            'A jeep safari in the mountains',
            'A camel ride and a snorkelling stop',
            'Lunch and time to shop in Dahab',
          ],
          seo: {
            metaTitle: 'Coloured Canyon Jeep Safari from Sharm with Camel Ride',
            metaDescription: 'A full day from Sharm el-Sheikh with a jeep safari, a guided walk through the Salama Coloured Canyon, a camel ride, snorkelling, lunch and time in Dahab.',
          },
          images: [PHOTO.jeepBelowTheRocks],
          imageAlts: [ALT.jeepBelowTheRocks],
        },
        {
          path: 'three-pools-and-the-red-canyon',
          price: PROGRAMMES.STG_THREE_POOLS,
          title: 'The Three Pools and the Red Canyon, with a Camel Ride and Lunch',
          short: 'Eight to nine hours: the Salama canyon by jeep, the Three Pools on the Dahab coast, a camel ride and lunch at a seaside restaurant.',
          description: 'An air-conditioned vehicle collects you at eight, and the drive north takes about an hour. A guide stays with the group all day. The Salama canyon is visited by jeep, and the Three Pools, the sheltered water on the Dahab coast, is where the afternoon is spent.\n\nA camel ride, the entry to the Three Pools area, a snorkelling stop there and lunch at a seaside restaurant are part of both ways of taking the day; one of them adds a quad ride along the beach and between the mountains of the Red Canyon. Snorkelling equipment and drinks at the restaurant are not included. Original passports are needed on the day, and children have their own price.',
          highlights: [
            'The Three Pools on the Dahab coast',
            'The Red Canyon and the Salama canyon by jeep',
            'A camel ride, and a quad ride on one option',
            'Lunch at a seaside restaurant',
          ],
          seo: {
            metaTitle: 'Dahab Three Pools and Red Canyon Day Trip from Sharm',
            metaDescription: 'A day from Sharm el-Sheikh to the Three Pools and the Red Canyon with a jeep safari, a camel ride, a snorkelling stop and lunch by the sea.',
          },
          images: [PHOTO.camelInTheCanyon],
          imageAlts: [ALT.camelInTheCanyon],
        },
        {
          path: 'mount-sinai-at-sunrise',
          price: PROGRAMMES.STG_MOUNT_SINAI,
          title: 'Mount Sinai at Sunrise, with Saint Catherine’s Monastery',
          short: 'An overnight climb with a Bedouin guide to be on the summit for the sunrise, then the monastery below it before the drive back.',
          description: 'The bus leaves Sharm el-Sheikh in the evening and the drive across Sinai takes about two and a half hours. The climb starts in the small hours, on foot and in the dark, with a Bedouin guide; the walk up is around two hours and the summit is reached in time for the sun.\n\nThe descent begins once it is up, and the morning finishes at Saint Catherine’s Monastery, one of the oldest Christian monasteries in the world, with time to look around it. The transfers, the Bedouin guide and the entry to the Saint Catherine protected area are in the price; tips, extras and personal spending are not. A copy of your passport is needed two days ahead. The published day is about fifteen hours, and children have their own price.',
          highlights: [
            'The summit in time for the sunrise',
            'A Bedouin guide on the mountain',
            'Saint Catherine’s Monastery afterwards',
            'Transfers by air-conditioned bus',
          ],
          seo: {
            metaTitle: 'Mount Sinai Sunrise Climb and Saint Catherine’s Monastery',
            metaDescription: 'An overnight trip from Sharm el-Sheikh: the climb up Mount Sinai with a Bedouin guide for the sunrise, then Saint Catherine’s Monastery before the drive back.',
          },
          images: [PHOTO.walkersOnTheMountain],
          imageAlts: [ALT.walkersOnTheMountain],
        },
        {
          path: 'private-day-at-saint-catherines-monastery',
          price: PROGRAMMES.STG_ST_CATHERINE,
          title: 'Private Day at Saint Catherine’s Monastery',
          short: 'Ten hours with your own vehicle and guide: the drive across Sinai, two hours at the monastery and lunch on the beach at Dahab on the way back.',
          description: 'A private air-conditioned vehicle collects you at six and the road across Sinai takes about three hours. The drive runs in convoy, as the published record says.\n\nTwo hours are spent at the monastery with a guide, among its shrines and holy places, and the protectorate entry fee is in the price. Lunch is taken on the beach at Dahab on the way back. The monastery library fee and drinks with lunch are not included. Sleeveless shirts are not allowed inside, and photography inside is not permitted. Children have their own price, and the booking applies it.',
          highlights: [
            'Your own vehicle and guide for the day',
            'Two hours at the monastery',
            'The protectorate entry fee included',
            'Lunch on the beach at Dahab',
          ],
          seo: {
            metaTitle: 'Private Saint Catherine’s Monastery Tour from Sharm',
            metaDescription: 'A private ten-hour day from Sharm el-Sheikh to Saint Catherine’s Monastery with a guide, the protectorate entry fee and lunch on the beach at Dahab.',
          },
          images: [PHOTO.monasteryWalls],
          imageAlts: [ALT.monasteryWalls],
        },
        {
          path: 'cairo-and-the-pyramids-in-a-day',
          price: PROGRAMMES.STG_CAIRO,
          title: 'Cairo and the Pyramids in a Day, by Road',
          short: 'A day trip by coach with an Egyptologist guide: the Giza pyramids and the Sphinx, a museum of your choosing and lunch with the pyramids in view.',
          description: 'The coach leaves Sharm el-Sheikh in the middle of the night and travels in convoy with a police escort, which is why the published record puts the road at between seven and nine hours each way. An Egyptologist guide is with the group for the day in Cairo.\n\nThe day itself is the Giza plateau, the Great Sphinx, and a museum: one option takes the Egyptian Museum of Antiquities on Tahrir Square, the other the Grand Egyptian Museum, and the entry tickets for whichever you choose are in the price along with the pyramids and the Sphinx. Lunch is at a restaurant looking out at the pyramids. A visa is needed to enter Cairo, published at 38 US dollars a person. Camel riding at the pyramids, drinks at the restaurant and the burial chambers inside the pyramids are not included. Children have their own price. Bring your passport.',
          highlights: [
            'The Giza pyramids and the Great Sphinx',
            'The Grand Egyptian Museum, or the one on Tahrir Square',
            'Lunch at a restaurant facing the pyramids',
            'An Egyptologist guide for the day',
          ],
          seo: {
            metaTitle: 'Cairo and Giza Pyramids Day Trip from Sharm El Sheikh',
            metaDescription: 'A day trip by road from Sharm el-Sheikh to the Giza pyramids and the Sphinx with an Egyptologist guide, a museum of your choosing and lunch.',
          },
          images: [PHOTO.museumFacade],
          imageAlts: [ALT.museumFacade],
        },
      ],
    },
    {
      slug: 'quad-safari-hurghada',
      name: 'Quad Safari Hurghada',
      listingPath: '/trips',
      domain: 'quadsafarihurghada.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'qsh-',
      // The programmes name the nearby resorts their transfers reach, so those names stay allowed; the places
      // this site never sells are the other coasts and the Nile valley.
      foreignPlaces: /Sharm|Dahab|Tiran|Ras Mohamed|Marsa Alam|Quseir|Cairo|Giza|pyramid|Luxor|Aswan|Fayoum|Alexandria|Siwa|Bahariya/i,
      tagline: 'Quad and buggy rides in the desert behind Hurghada',
      description: 'Quad Safari Hurghada sells the desert rides that leave from Hurghada hotels: quad bikes, dune buggies and the long safari day that puts you in all of them.\n\nSix trips are on offer. Two are buggy rides: one by day, with a camel ride and the choice of a swim at the Blue Lagoon, and one at sunset with a barbecue and stargazing. Two are quad rides, a two-hour ride by day and a ninety-minute evening with dinner, a show and the stars. One is a private ride of forty kilometres with its own guide and a stop at a Bedouin village. The last is seven hours with a quad, a spider car, a jeep, a camel and dinner. Every one is collected from your hotel, and every page says what its price covers and what it does not.',
      seo: {
        metaTitle: 'Quad and Buggy Desert Safaris from Hurghada Hotels',
        metaDescription: 'Quad bike and dune buggy rides in the desert behind Hurghada: two-hour rides, sunset rides with a barbecue and stars, private rides and a seven-hour safari.',
        keywords: [
          'quad and buggy safari hurghada',
          'hurghada dune buggy ride',
          'hurghada desert quad bike',
          'sunset quad safari hurghada',
          'hurghada super safari with camel ride',
        ],
      },
      theme: { primaryColor: '#C2410C', secondaryColor: '#FDF4EC', accentColor: '#1F2937' },
      heroImages: [PHOTO.twoBuggiesInDust, PHOTO.quadOnTheDunes, PHOTO.camelLineOnTheRidge],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936266/attractions-network/tenant-logos/quad-safari-hurghada/monogram.png',
      trips: [
        {
          path: 'two-hours-by-buggy-with-a-camel-ride',
          price: PROGRAMMES.QSH_BUGGY_DAY,
          title: 'Two Hours by Dune Buggy, with a Camel Ride',
          short: 'A guided ride over the dunes in a small group, with a short camel ride after it, and a swim at the Blue Lagoon or a private vehicle if you want them.',
          description: 'A transfer takes you from your hotel out to the desert, where the buggy is handed over and the guide takes the group through the safety instructions. The ride is about two hours across the golden sand, with the guide leading.\n\nAfterwards there is a short camel ride, long enough for photographs. Three ways to take the day are published: the ride as it stands, the same ride with a stop to swim at the Blue Lagoon and time on the shore, or a private version with the guide and the pickup for your group alone. Four starts are published, from six in the morning to midday. Hotel pickup and drop-off are in every one. Children have their own price.',
          highlights: [
            'Two hours over the dunes by buggy',
            'A short camel ride afterwards',
            'A swim at the Blue Lagoon on one option',
            'A private vehicle and guide on another',
          ],
          seo: {
            metaTitle: 'Hurghada Dune Buggy Safari with a Camel Ride',
            metaDescription: 'A two-hour guided dune buggy ride in the Hurghada desert with a short camel ride, with options for a Blue Lagoon swim or a private vehicle.',
          },
          images: [PHOTO.twoBuggiesInDust],
          imageAlts: [ALT.twoBuggiesInDust],
        },
        {
          path: 'sunset-buggy-ride-with-a-barbecue',
          price: PROGRAMMES.QSH_BUGGY_SUNSET,
          title: 'Sunset Buggy Ride with a Desert Barbecue and Stargazing',
          short: 'The same dunes in the late afternoon, with a short camel ride, dinner cooked out on the sand and time under the stars afterwards.',
          description: 'The transfer leaves your hotel in the late afternoon and the ride runs about two hours, with the light dropping over the sand as you go. A guide rides with the group throughout.\n\nA short camel ride follows, and then the evening settles: a barbecue out in the desert, and time under the sky once the light has gone. Hotel pickup and drop-off are included. One departure is published, at four in the afternoon. Children have their own price, and the booking applies it.',
          highlights: [
            'Two hours over the dunes as the light drops',
            'A short camel ride',
            'A barbecue out on the sand',
            'Time under the stars afterwards',
          ],
          seo: {
            metaTitle: 'Hurghada Sunset Buggy Safari with Barbecue and Stars',
            metaDescription: 'A late-afternoon dune buggy ride in the Hurghada desert with a short camel ride, a barbecue dinner out on the sand and stargazing afterwards.',
          },
          images: [PHOTO.twoBuggiesInDust],
          imageAlts: [ALT.twoBuggiesInDust],
        },
        {
          path: 'two-hour-quad-ride-with-the-transfer',
          price: PROGRAMMES.QSH_TWO_HOUR_QUAD,
          title: 'Two-Hour Quad Ride Across the Dunes',
          short: 'A shared ride over open plains and sandy dunes with a guide, stops for photographs, a short camel ride, and pickup from Hurghada, Sahl Hasheesh or Makadi Bay.',
          description: 'The transfer collects you in an air-conditioned vehicle and runs out to the quad base, where the helmet is handed over, the safety instructions are given and a short driving test is taken before the ride.\n\nThe ride itself is two hours, crossing open plains and sandy dunes with a guide, with stops for photographs and for the views towards the Red Sea. A five-minute camel ride is part of it. Five starts are published, from four in the morning to two in the afternoon. The published price is the same for adults and children. Drivers must be at least sixteen. A scarf and goggles are not included.',
          highlights: [
            'Two hours across plains and dunes',
            'An Egyptologist guide with the group',
            'A short camel ride',
            'Pickup from Hurghada, Sahl Hasheesh or Makadi Bay',
          ],
          seo: {
            metaTitle: 'Two-Hour Quad Bike Safari from Hurghada Hotels',
            metaDescription: 'A two-hour shared quad bike ride across the dunes behind Hurghada with a guide, a short camel ride and hotel pickup in an air-conditioned vehicle.',
          },
          images: [PHOTO.buggyOnTheShore],
          imageAlts: [ALT.buggyOnTheShore],
        },
        {
          path: 'evening-quad-ride-with-dinner-and-stars',
          price: PROGRAMMES.QSH_EVENING_QUAD,
          title: 'Evening Quad Ride with Dinner, a Show and Stargazing',
          short: 'Ninety minutes on the quad with a desert escort, half an hour on a camel around sunset, then an Oriental dinner, live entertainment and the night sky.',
          description: 'The transfer leaves in the late afternoon in an air-conditioned vehicle. At the base there is a safety briefing, a short driving test and the helmet, and a professional guide and a desert escort ride with the group.\n\nThe quad leg is ninety minutes across the sand, with stops for photographs. Half an hour on a camel follows, timed for the sun going down, and the evening ends at the camp with an Oriental dinner, a live show and stargazing. One departure is published, at four in the afternoon. The published price is the same for adults and children, drivers must be at least sixteen, and camera footage of your ride is not included.',
          highlights: [
            'Ninety minutes on a quad with an escort',
            'Half an hour on a camel at sunset',
            'An Oriental dinner and a live show',
            'Stargazing once the light has gone',
          ],
          seo: {
            metaTitle: 'Hurghada Evening Quad Safari with Dinner and Stargazing',
            metaDescription: 'A ninety-minute evening quad ride in the Hurghada desert with a camel ride at sunset, an Oriental dinner, a live show and stargazing afterwards.',
          },
          images: [PHOTO.camelLineOnTheRidge],
          imageAlts: [ALT.camelLineOnTheRidge],
        },
        {
          path: 'private-quad-ride-morning-or-afternoon',
          price: PROGRAMMES.QSH_PRIVATE_QUAD,
          title: 'Private Quad Ride, Morning or Late Afternoon',
          short: 'Forty kilometres of desert at your own pace with your own guide, a Bedouin village, a camel ride and Bedouin tea, from Hurghada hotels.',
          description: 'A private ride with a guide of your own, so the pace and the stops are yours. Four starts are published: eight or nine in the morning, or one or two in the afternoon for the light at the end of the day.\n\nThe ride covers about forty kilometres of desert, with the instruction and the practice session first and a helmet provided. It calls at a Bedouin village, where there is a camel ride, Bedouin tea and time with the people who live there, and bottled water is carried for the group. Round-trip transfers are included from hotels inside Hurghada; the published record charges for transfers from the resorts further along the coast, which this site does not sell. A government fee of one euro a person is charged separately, and goggles and a scarf are not included. Children have their own price, and children aged six to fifteen may ride as passengers but not drive.',
          highlights: [
            'Forty kilometres of desert with your own guide',
            'A Bedouin village, with tea and a camel ride',
            'Instruction and a practice session first',
            'Morning or late-afternoon starts',
          ],
          seo: {
            metaTitle: 'Private Quad Bike Safari from Hurghada with a Guide',
            metaDescription: 'A private forty-kilometre quad ride in the Hurghada desert with your own guide, a Bedouin village, a camel ride and Bedouin tea, morning or afternoon.',
          },
          images: [PHOTO.quadOnTheDunes],
          imageAlts: [ALT.quadOnTheDunes],
        },
        {
          path: 'seven-hour-desert-safari',
          price: PROGRAMMES.QSH_SUPER_SAFARI,
          title: 'Seven Hours in the Desert: Quad, Spider Car, Jeep and Camel',
          short: 'A long afternoon and evening with a quad ride, a spider car, a jeep out to a Bedouin village, a camel ride, a barbecue buffet and a show under the stars.',
          description: 'The transfer leaves at half past eleven and the day runs about seven hours. It opens with a half-hour drive out and a break in the desert with the guide, then the jeep carries on for about forty minutes to a Bedouin village.\n\nAn hour is spent there, with Bedouin tea and a camel ride, before the drive back towards the camp. The quad and the spider car are both part of the day, and it finishes with an open-buffet barbecue dinner and an oriental show with Tanoura, belly dance and fire. Round-trip transfers from your hotel in Hurghada are included. A scarf and goggles, photo and video sessions and transfers from the resorts further along the coast are not. The day is not suitable for guests who are pregnant or who have back, neck or serious medical conditions. Children have their own price.',
          highlights: [
            'A quad ride and a spider car',
            'A jeep out to a Bedouin village',
            'A camel ride and Bedouin tea',
            'An open-buffet barbecue and an oriental show',
          ],
          seo: {
            metaTitle: 'Seven-Hour Hurghada Desert Safari with Dinner and Show',
            metaDescription: 'A seven-hour desert safari from Hurghada with a quad ride, a spider car, a jeep to a Bedouin village, a camel ride, a barbecue buffet and an oriental show.',
          },
          images: [PHOTO.jeepConvoyOnTheRoad],
          imageAlts: [ALT.jeepConvoyOnTheRoad],
        },
      ],
    },
  ],
};

export const B03D: NetworkBatch = {
  id: 'b03d',
  sites: [
    {
      slug: 'safari-sharm-el-sheikh',
      name: 'Safari Sharm El Sheikh',
      listingPath: '/trips',
      domain: 'safarisharmelsheikh.com',
      city: 'Sharm El Sheikh',
      area: 'Sharm el-Sheikh',
      pickupDestination: 'sharm-el-sheikh',
      coordinates: SHARM,
      currency: 'USD',
      slugPrefix: 'ssh-',
      foreignPlaces: /Hurghada|Giftun|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Cairo|Giza|pyramid|Luxor|Aswan|Fayoum|Alexandria|Siwa|Taba|Nuweiba/i,
      tagline: 'Desert days out of Sharm el-Sheikh',
      description: 'Safari Sharm El Sheikh sells the desert. Everything here starts at a hotel in Sharm el-Sheikh and ends up out in the Sinai, on a quad, in a buggy or in a jeep.\n\nThe short ones are two hours with a tea stop at a Bedouin village, or a ride timed for the sunrise or the sunset. The long evenings add a camel ride, a dinner cooked in the desert, a show and a telescope. One day starts before dawn on a quad and carries on into Ras Mohamed National Park. Two go inland by jeep, to the Salama Coloured Canyon and the Red Canyon, with the Three Pools and the shore at the other end. Every page says what its price covers, what it does not and when it leaves.',
      seo: {
        metaTitle: 'Sinai Desert Safaris from Sharm El Sheikh Hotels',
        metaDescription: 'Desert days from Sharm el-Sheikh: quad and buggy rides, sunrise and sunset safaris, Bedouin dinners with stargazing, and jeep days to the coloured canyons.',
        keywords: [
          'safari sharm el sheikh',
          'sinai desert quad safari',
          'sharm buggy safari',
          'coloured canyon jeep safari',
          'bedouin dinner and stargazing sharm',
        ],
      },
      theme: { primaryColor: '#4B5D2A', secondaryColor: '#F3F1E3', accentColor: '#D98C2B' },
      heroImages: [PHOTO.riderAgainstTheSunset, PHOTO.quadAboveTheSea, PHOTO.jeepInTheOpenDesert],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936267/attractions-network/tenant-logos/safari-sharm-el-sheikh/monogram.png',
      trips: [
        {
          path: 'two-hour-quad-safari-with-a-tea-stop',
          price: PROGRAMMES.SSS_QUAD_TEA,
          title: 'Two-Hour Quad Safari with a Bedouin Tea Stop',
          short: 'A quad of your own for an hour of riding in the open Sinai, a guide with the group and tea at a Bedouin village in the middle of it.',
          description: 'A private air-conditioned bus takes you out of Sharm el-Sheikh to the quad base, where the bike is handed over and the briefing given. The riding is about an hour across open ground, with the Sinai mountains on every side.\n\nHalf way through, the ride stops at a Bedouin village for tea and for what the hosts tell you about living in the desert. Four start times are published, from four in the morning to a quarter past two, so the ride can be taken in the cool of the morning or late in the day. The transfers, the quad ticket and the guide are in the price; tips are not. A copy of your passport is needed two days ahead, and children have their own price.',
          highlights: [
            'An hour riding a quad of your own',
            'A professional guide with the group',
            'Tea at a Bedouin village',
            'Starts from early morning to mid-afternoon',
          ],
          seo: {
            metaTitle: 'Two-Hour Sinai Quad Safari with Bedouin Tea',
            metaDescription: 'A two-hour quad safari in the Sinai desert from Sharm el-Sheikh with a guide, an hour of riding and a tea stop at a Bedouin village.',
          },
          images: [PHOTO.bedouinTeaTrayDesert],
          imageAlts: [ALT.bedouinTeaTrayDesert],
        },
        {
          path: 'sunrise-or-sunset-ride',
          price: PROGRAMMES.SSS_SUNRISE_SUNSET,
          title: 'Sunrise or Sunset Ride, by Quad or by Buggy',
          short: 'Three hours timed for the low light at either end of the day, with a driving lesson first, an echo point stop and Bedouin tea at a desert tent.',
          description: 'Two departures are published: half past four in the morning for the sunrise, and four in the afternoon for the sunset. Either way the published trip runs about three hours, including the transfers both ways in an air-conditioned vehicle.\n\nProfessional desert guides run the safety briefing and a training session for anyone who has not driven one before, and helmets and goggles are provided. The ride takes in the desert around Sharm el-Sheikh, with a stop at the echo point and free time for photographs, and tea at a traditional desert tent. You choose a quad or a buggy of your own; the published record also sells the ride for two, three or four riders sharing a vehicle, and a camel ride as a paid extra, neither of which this site sells. Children have their own price.',
          highlights: [
            'A start timed for the sunrise or the sunset',
            'A quad or a buggy of your own',
            'A training session for beginners',
            'Bedouin tea at a desert tent',
          ],
          seo: {
            metaTitle: 'Sunrise or Sunset Quad and Buggy Safari in Sharm',
            metaDescription: 'A three-hour sunrise or sunset ride in the desert at Sharm el-Sheikh, by quad or buggy, with a training session, an echo point stop and Bedouin tea.',
          },
          images: [PHOTO.riderAgainstTheSunset],
          imageAlts: [ALT.riderAgainstTheSunset],
        },
        {
          path: 'afternoon-safari-with-a-barbecue-and-a-telescope',
          price: PROGRAMMES.SSS_SUPER_SAFARI,
          title: 'Afternoon Safari with a Barbecue, a Show and a Telescope',
          short: 'A quad or buggy of your own, a Bedouin tent for tea and bread, a camel ride at the camp, a barbecue buffet and an astronomer with a telescope.',
          description: 'The pickup is in the afternoon. The safari centre comes first, with a welcome drink, the safety briefing and the driving instructions, and then the desert ride: about twenty-five minutes out, a stop at a Bedouin tent for tea and traditional bread, an open stretch for the echo, and the ride back.\n\nThe evening moves to the Bedouin camp. There is a camel ride, an open-buffet barbecue dinner with water and soft drinks, and oriental entertainment. At the end the camp lights go off and a telescope comes out, with an astronomer to show you what is up there. One departure is published, at half past three. The published price is the same for adults and children, and the record also sells the afternoon for riders sharing a vehicle, which this site does not sell.',
          highlights: [
            'A quad or a buggy of your own',
            'Bedouin tea and bread at a desert tent',
            'A camel ride and a barbecue buffet',
            'A telescope and an astronomer at the end',
          ],
          seo: {
            metaTitle: 'Sharm Afternoon Desert Safari with Barbecue and Telescope',
            metaDescription: 'An afternoon desert safari from Sharm el-Sheikh with a quad or buggy of your own, Bedouin tea, a camel ride, a barbecue buffet and a telescope after dark.',
          },
          images: [PHOTO.quadAndCamelsAtSunsetDesert],
          imageAlts: [ALT.quadAndCamelsAtSunsetDesert],
        },
        {
          path: 'quad-camel-and-a-bedouin-dinner',
          price: PROGRAMMES.SSS_FIVE_IN_ONE,
          title: 'Quad, Camel and a Bedouin Dinner Under the Stars',
          short: 'Five hours that ride in stages: quad, a camel and tea, dinner and a show at the camp, then the sky through a telescope with an astronomy guide.',
          description: 'The van leaves your hotel for the safari centre, where the briefing takes about half an hour. The riding is broken into legs with stops between them: a first stretch on the quad, then tea and a camel ride, another stretch, then the camp.\n\nDinner is a buffet with an oriental entertainment programme, and after it the telescopes come out with an experienced astronomy guide. A last short ride takes you back. Two starts are published, a quarter to five in the afternoon and ten at night. You can take a quad of your own or share one with another rider, one driving and one behind, swapping during the ride. A desert conservation fee of one US dollar a person is paid in cash on the day. Children under sixteen may ride as passengers but not drive, and vegetarian meals are available.',
          highlights: [
            'Quad riding in stages through the evening',
            'A camel ride and Bedouin tea',
            'A buffet dinner and an oriental show',
            'Telescopes and an astronomy guide',
          ],
          seo: {
            metaTitle: 'Sharm Quad Safari with Camel Ride, Dinner and Stargazing',
            metaDescription: 'A five-hour Sinai desert evening from Sharm el-Sheikh: quad riding in stages, a camel ride, a buffet dinner with a show and stargazing by telescope.',
          },
          images: [PHOTO.riderOnACamel],
          imageAlts: [ALT.riderOnACamel],
        },
        {
          path: 'dawn-quad-ride-and-ras-mohamed',
          price: PROGRAMMES.SSS_RAS_MOHAMED_ATV,
          title: 'Dawn Quad Ride and a Day in Ras Mohamed National Park',
          short: 'An eight-hour day that starts in the dark: the desert as the sun comes up, breakfast at your hotel, then the park, Allah Gate and a snorkelling stop.',
          description: 'The first part is the desert. The pickup is at half past four and the ride goes out as the light comes over the mountains, with the quiet of the early morning and a sandboarding stop along the way. You are brought back to your hotel for breakfast and time to freshen up.\n\nAround half past eight a bus takes the group on to Ras Mohamed National Park. The day there takes in Allah Gate, the mangroves, the Earthquake Crack and the Magic Lake, with panoramic stops along the way, and finishes with a swim and a snorkel over the reefs. You can take a quad or a buggy of your own, and the entry to Allah Gate is in both. Lunch and snorkelling gear are not included, so bring your own gear if you want to snorkel. Children have their own price.',
          highlights: [
            'A quad or buggy ride as the sun comes up',
            'Breakfast at your hotel in between',
            'Allah Gate, the mangroves and the Magic Lake',
            'A snorkelling stop over the reefs',
          ],
          seo: {
            metaTitle: 'Dawn ATV Safari and Ras Mohamed Day from Sharm',
            metaDescription: 'An eight-hour day from Sharm el-Sheikh: a quad or buggy ride at dawn, breakfast at your hotel, then Ras Mohamed National Park, Allah Gate and snorkelling.',
          },
          images: [PHOTO.quadAboveTheSea],
          imageAlts: [ALT.quadAboveTheSea],
        },
        {
          path: 'coloured-canyon-by-jeep',
          price: PROGRAMMES.SSS_COLOURED_CANYON,
          title: 'The Coloured Canyon by Jeep, with Lunch in a Bedouin Tent',
          short: 'A ten-hour day inland: a 4x4 safari, two hours walking the Coloured Canyon with a guide, a camel ride by the sea and lunch on the beach at Dahab.',
          description: 'An air-conditioned vehicle collects you at eight for the hour north, and from there a jeep takes the group into the hills. Two hours are spent in the Coloured Canyon itself, walking it with a guide who explains how it was formed.\n\nThe rest of the day is the coast: a camel ride along the sea, lunch in a Bedouin tent on the beach at Dahab and a stop in the town. Three ways to take it are published. One walks the canyon and snorkels from the shore; one adds a quad ride along the sea and into the mountains; one adds the entry fees for the Blue Hole and Abu Galum as well. Snorkelling equipment, gratuities and drinks at the restaurant are not included. Original passports are needed on the day. Children have their own price.',
          highlights: [
            'Two hours walking the Coloured Canyon',
            'A jeep safari into the hills',
            'A camel ride along the sea',
            'Lunch in a Bedouin tent on the beach',
          ],
          seo: {
            metaTitle: 'Coloured Canyon Jeep Safari from Sharm El Sheikh',
            metaDescription: 'A ten-hour jeep safari from Sharm el-Sheikh to the Coloured Canyon, with a guided walk, a camel ride by the sea and lunch in a Bedouin tent at Dahab.',
          },
          images: [PHOTO.jeepInTheOpenDesert],
          imageAlts: [ALT.jeepInTheOpenDesert],
        },
        {
          path: 'red-canyon-and-the-three-pools',
          price: PROGRAMMES.SSS_THREE_POOLS,
          title: 'The Red Canyon and the Three Pools, with a Camel Ride',
          short: 'The Salama canyon by jeep and a long afternoon at the Three Pools on the Dahab coast, with a camel ride, a snorkelling stop and lunch by the sea.',
          description: 'The vehicle collects you at eight and the drive north takes about an hour, with a guide for the whole day. The Salama canyon is reached by jeep, and the walking there is off-road and moderate, so closed shoes are worth having.\n\nThe Three Pools, the sheltered water along the Dahab coast, is where the afternoon goes: a camel ride, a snorkelling stop and lunch at a seaside restaurant. One of the two ways of taking the day adds a quad ride on the beach and between the mountains of the Red Canyon. Snorkelling equipment, drinks at the restaurant and personal spending are not included. Original passports are needed on the day, and children have their own price.',
          highlights: [
            'The Red Canyon and the Salama canyon by jeep',
            'An afternoon at the Three Pools',
            'A camel ride and a snorkelling stop',
            'Lunch at a seaside restaurant',
          ],
          seo: {
            metaTitle: 'Red Canyon and Three Pools Jeep Day from Sharm',
            metaDescription: 'A day from Sharm el-Sheikh to the Red Canyon and the Three Pools by jeep, with a camel ride, a snorkelling stop and lunch at a seaside restaurant.',
          },
          images: [PHOTO.camelInTheCanyonDesert],
          imageAlts: [ALT.camelInTheCanyonDesert],
        },
      ],
    },
  ],
};
