/**
 * Batch B08, "the next ten" (27 October 2026; owner: "set goal for 10 more to reach 54", "you need to create next 10
 * priority sites", "don't duplicate which we already built"). Every Fouad domain still unbuilt was screened against
 * the client's 217 published trips and the network's catalogue: the ten are the ones whose place real trips visit and
 * whose subject no built site already covers. Nabq goes first: it is the last of Fouad's HIGH domains, waiting since
 * B02 for a trip, and the client now publishes a horse ride whose price includes the Nabq National Park fee.
 *
 * - B08A: Nabq National Park, Khan el Khalili Market and Moez Street.
 *
 * As in B03, no network operator publishes these programmes, so every trip is built on one the client publishes on
 * its own main site (`network-sites/eeo-source.ts`); prices, child rates, departures and inclusions are copied from
 * that record at apply time and never typed here. No trip sells an extra: the client's pickup-area add-ons are not
 * bound to a booking option, so the published record does not offer them with the options sold, and the trip says so.
 *
 * Where the client publishes a line only conditionally, or in words the network never shows ("authentic", "expert"),
 * the line is replaced by what the options sold actually carry. Where the record's own schedule is a list of pickup
 * areas, a map code or transfer legs, the site writes the day from the stops the record names.
 *
 * Photos are the client's own trip photos, copied into the network's Cloudinary (`attractions-network/network-b08/`)
 * so the client replacing its own never blanks a network site; each site's own photos are an open question for the
 * client, as are its logo and its contact details.
 */
import type { NetworkBatch, PriceSpec } from '../seed-network-sites';

const EEO = 'egypt-excursions-online';
const DAY_TRIPS = 'day-trips';
const ADVENTURE = 'adventure';

/** Said once, where every option sold prices children separately. */
const CHILD_NOTE = 'Children have their own price, and the booking applies it. The team confirms which ages count as children when it confirms your booking.';
const PICKUP_CAIRO = 'Hotel pickup and drop-off in Cairo or Giza';
const PICKUP_SHARM = 'Pickup and drop-off at your hotel in Sharm El Sheikh';
/** The client sells pickup from further out as add-ons no booking option carries, so it cannot be booked here. */
const FAR_PICKUP = 'Pickup from outside the city centre costs extra and cannot be booked on this site. Ask the team before you book if your hotel is further out.';

const NABQ_RIDE = 'sharm-el-sheikh-sinai-desert-red-sea-horseback-riding';
const NABQ_ONE_HOUR = 'sharm-el-sheikh-1-hour-sinai-desert-red-sea-h-849f8887df2e';
const NABQ_TWO_HOURS = 'sharm-el-sheikh-2-hour-sinai-desert-red-sea-h-59c0f70f6827';

/** The ride itself, the same for both lengths. The record's own schedule is empty. */
const nabqRide = (length: string) => [
  { title: 'Hotel pickup', description: 'The car collects you from your hotel in Sharm El Sheikh and drives to the stables.' },
  { title: 'Helmet and safety briefing', description: 'The team matches you with a horse for your level, fits a helmet and gives a short safety briefing.' },
  { title: 'Desert and shore', duration: length, description: 'A guided ride across the open desert and along the shore, inside the Nabq protected area.' },
  { title: 'Back to your hotel', description: 'The car returns you to your hotel in Sharm El Sheikh.' },
];

const PROGRAMMES: Record<string, PriceSpec> = {
  // ---- Nabq National Park: one programme, sold as two trips because its two lengths leave at different times. ----
  NABQ_ONE_HOUR: {
    provider: 'eeo',
    tenant: EEO,
    source: NABQ_RIDE,
    category: ADVENTURE,
    options: [NABQ_ONE_HOUR],
    addons: [],
    departures: ['10:00', '12:00', '13:00', '14:00', '15:00', '16:00'],
    // The record types the option's length as "1H".
    duration: '1 hour',
    rename: {
      [NABQ_ONE_HOUR]: {
        name: 'One hour on horseback',
        description: 'A guided ride across the desert and along the shore, with transfers.',
      },
    },
    childNote: CHILD_NOTE,
    // "Transfers / pickup and drop-off": stated in the site's words, once.
    omit: { inclusions: ['Transfers / pickup and drop-off'] },
    add: {
      inclusions: [PICKUP_SHARM],
      needToKnow: ['No riding experience is needed.', 'Wear comfortable clothing.'],
    },
    itinerary: nabqRide('1 hour'),
  },
  NABQ_TWO_HOURS: {
    provider: 'eeo',
    tenant: EEO,
    source: NABQ_RIDE,
    category: ADVENTURE,
    options: [NABQ_TWO_HOURS],
    addons: [],
    departures: ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'],
    duration: '2 hours',
    rename: {
      [NABQ_TWO_HOURS]: {
        name: 'Two hours on horseback',
        description: 'A guided ride across the desert and along the shore, with transfers.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Transfers / pickup and drop-off'] },
    add: {
      inclusions: [PICKUP_SHARM],
      needToKnow: ['No riding experience is needed.', 'Wear comfortable clothing.'],
    },
    itinerary: nabqRide('2 hours'),
  },

  // ---- Khan el Khalili Market -------------------------------------------------------------------------------
  KHAN_MARKETS: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-private-souk-local-markets-shopping-tour-with-lunch',
    category: DAY_TRIPS,
    options: ['cairo-private-traditional-markets-khan-el-kha-f385341e26dd'],
    addons: [],
    departures: ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'],
    rename: {
      'cairo-private-traditional-markets-khan-el-kha-f385341e26dd': {
        name: 'Private markets tour with lunch',
        description: 'Your own guide through four of old Cairo’s markets, a kushari lunch and private transfers.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Hotel pick-up and drop-off'] },
    add: { inclusions: [PICKUP_CAIRO] },
    // The record's schedule is a list of pickup areas around one stop; its own description names the walk.
    itinerary: [
      { title: 'Hotel pickup', description: 'A private air-conditioned car collects you from your hotel in Cairo or Giza.' },
      { title: 'El Ghorya market', description: 'The walk begins in one of old Cairo’s traditional markets.' },
      { title: 'Gamaleya Street', description: 'Past Al-Azhar Mosque and Bab Zuweila, seen from the outside.' },
      { title: 'El Mosky market', description: 'Local shops, with bargaining tips from your guide.' },
      { title: 'Khan el Khalili', duration: '2 hours', description: 'Time to browse the historic bazaar: spices, perfumes, jewellery, handicrafts and souvenirs.' },
      { title: 'Kushari lunch', description: 'A traditional kushari lunch.' },
      { title: 'Back to your hotel', description: 'The car returns you to your hotel in Cairo or Giza.' },
    ],
  },
  KHAN_GATES: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-private-shopping-tour-local-markets-khan-el-khalili',
    category: DAY_TRIPS,
    // The programme's second option carries no price, so it is not sold.
    options: ['private-tour-with-transfers-tickets-multiling-2739ca33f0a4'],
    addons: [],
    departures: ['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '17:00', '17:30'],
    rename: {
      'private-tour-with-transfers-tickets-multiling-2739ca33f0a4': {
        name: 'Private shopping tour with transfers and tickets',
        description: 'Your own guide in Arabic, English, French, German or Spanish, the car, the entrance fees and bottled water. Meals are not included.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Hotel pick-up and drop-off'] },
    add: { inclusions: [PICKUP_CAIRO], needToKnow: [FAR_PICKUP] },
    itinerary: [
      { title: 'Hotel pickup', description: 'A private air-conditioned car collects you from your hotel in Cairo or Giza.' },
      { title: 'Bab al-Futuh', duration: '10 minutes', description: 'One of the medieval gates of the Fatimid city.' },
      { title: 'Bab El Nasr', duration: '10 minutes', description: 'The gate beside it.' },
      { title: 'Bab Zuweila', duration: '10 minutes', description: 'The southern gate.' },
      { title: 'Khan el Khalili', description: 'El Ghorya market, Gamalia Street and the bazaar, with help on bargaining.' },
      { title: 'Back to your hotel', description: 'The car returns you to your hotel in Cairo or Giza.' },
    ],
  },
  KHAN_TANOURA: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-islamic-cairo-khan-el-khalili-tanoura-show',
    category: DAY_TRIPS,
    options: ['cairo-al-muizz-street-khan-el-khalili-tanoura-59f49228c5d8', 'private-tour-2a90036c8398'],
    addons: [],
    departures: ['15:30'],
    rename: {
      'cairo-al-muizz-street-khan-el-khalili-tanoura-59f49228c5d8': {
        name: 'Small-group tour with the show',
        description: 'A shared vehicle and a tour leader; the Tanoura show ticket is included.',
      },
      'private-tour-2a90036c8398': {
        name: 'Private tour with the show',
        description: 'Your own vehicle and a licensed Egyptologist guide in your language; the Tanoura show ticket is included.',
      },
    },
    childNote: CHILD_NOTE,
    add: { needToKnow: [FAR_PICKUP] },
    // The record's schedule carries its transfer legs ("Van") as stops.
    itinerary: [
      { time: '15:30', title: 'Hotel pickup', description: 'Pickup from your hotel in Cairo or Giza.' },
      { title: 'Bab al-Futuh', duration: '15 minutes', description: 'One of medieval Cairo’s gates, where the walk begins.' },
      { title: 'Al-Hakim Mosque', duration: '20 minutes', description: 'The mosque beside the gate.' },
      { title: 'Al-Muizz Street', duration: '30 minutes', description: 'A guided walk through the heart of historic Islamic Cairo.' },
      { title: 'Khan el Khalili', duration: '30 minutes', description: 'Free time in the bazaar’s lanes and shops.' },
      { title: 'Al-Azhar Mosque', duration: '20 minutes', description: 'A stop at the mosque.' },
      { title: 'Wikalat Al Ghuri', duration: '2 hours', description: 'The Al Tanoura heritage show.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },

  // ---- Moez Street -------------------------------------------------------------------------------------------
  MOEZ_HERITAGE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-islamic-heritage-tour-al-azhar-al-muizz-street-historic-mosques',
    category: DAY_TRIPS,
    options: ['private-islamic-cairo-tour-with-lunch-drinks-0755dc24f437'],
    addons: [],
    departures: ['08:30'],
    // The option's own name promises drinks its exclusions list; the site promises neither, and asks the client.
    rename: {
      'private-islamic-cairo-tour-with-lunch-drinks-0755dc24f437': {
        name: 'Private day with lunch',
        description: 'Your own Egyptologist guide and transport, the entrance fees and lunch.',
      },
    },
    childNote: CHILD_NOTE,
    // The record lists the stops among its inclusions; they are the day's schedule instead.
    omit: {
      inclusions: ['Al-Azhar Mosque', 'Al Mouayyed Mosque', 'Bab Zuweila', 'Al Hussein Mosque', 'Beit El Seheimy', 'Al-Hakim Mosque', 'Bab al Fetouh', 'Bab Al Nas'],
    },
    // The record's own schedule opens with the hotel pickup and closes with the transfer back.
    add: { inclusions: [PICKUP_CAIRO] },
    itinerary: [
      { time: '08:30', title: 'Hotel pickup', description: 'Pickup from your hotel in Cairo or Giza.' },
      { title: 'Al-Azhar Mosque', description: 'The day starts at Al-Azhar.' },
      { title: 'Al Mouayyed Mosque', description: 'Beside Bab Zuweila.' },
      { title: 'Bab Zuweila', description: 'The southern gate of the old city.' },
      { title: 'Al Hussein Mosque', description: 'On the square beside Khan el Khalili.' },
      { title: 'Beit El Seheimy', description: 'An old Cairo house on Al-Muizz Street.' },
      { title: 'Al-Hakim Mosque', description: 'At the northern end of the street.' },
      { title: 'Bab al Fetouh and Bab Al Nasr', description: 'The two northern gates.' },
      { title: 'Back to your hotel', description: 'The transfer back to your hotel in Cairo or Giza.' },
    ],
  },
  MOEZ_AZHAR_PARK: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-islamic-cairo-el-moez-street-al-azhar-park-tour',
    category: DAY_TRIPS,
    options: ['cairo-explore-el-moez-street-al-azhar-park-6d04f57caf52'],
    addons: [],
    departures: ['11:00', '12:00', '13:00', '14:00'],
    rename: {
      'cairo-explore-el-moez-street-al-azhar-park-6d04f57caf52': {
        name: 'Private tour with a meal',
        description: 'Your own guide and car, the entrance fees and a meal at Studio Misr restaurant.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Pick-up services from your hotel & return.'] },
    add: { inclusions: [PICKUP_CAIRO] },
    itinerary: [
      { title: 'Hotel pickup', description: 'A private air-conditioned car collects you from your hotel in Cairo or Giza.' },
      { title: 'El Moez Street', duration: '2 hours', description: 'Mosques, gates, schools and old houses, Bayt Al-Suhaymi among them, and the street’s traditional shops.' },
      { title: 'Al-Azhar Park', description: 'The park and its view over Cairo, with a meal at Studio Misr restaurant.' },
      { title: 'Back to your hotel', description: 'The car returns you to your hotel in Cairo or Giza.' },
    ],
  },
  MOEZ_PRIVATE_WALK: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-el-moez-street-islamic-cairo-khan-el-khalili-walking-tour',
    category: DAY_TRIPS,
    // The English option only: the record's other two describe the same walk without saying how they differ.
    options: ['private-english-cairo-tour-with-tickets-trans-a6ae333926af'],
    addons: [],
    departures: ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'],
    rename: {
      'private-english-cairo-tour-with-tickets-trans-a6ae333926af': {
        name: 'Private walk in English',
        description: 'Your own English-speaking guide, the entrance fees, private transfers and bottled water.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Pick-up and return services from your accommodation.'] },
    add: { inclusions: [PICKUP_CAIRO] },
    itinerary: [
      { title: 'Hotel pickup', description: 'A private air-conditioned car collects you from your hotel in Cairo or Giza.' },
      { title: 'El Moez Street', duration: '1.5 hours', description: 'On foot: the gates of Bab El Fetouh and Bab El Nasr, El Darb El Asfar and the mosque and school of Sultan Barqouq.' },
      { title: 'Khan el Khalili', description: 'The walk ends in the lanes and shops of the bazaar.' },
      { title: 'Back to your hotel', description: 'The car returns you to your hotel in Cairo or Giza.' },
    ],
  },
  MOEZ_EVENING: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-islamic-tour-medieval-mosques-al-mu-izz-street-khan-elkhalili',
    category: DAY_TRIPS,
    options: ['cairo-islamic-heritage-tour-al-mu-izz-street--1d9ac4cec552'],
    addons: [],
    departures: ['16:00', '16:15', '16:30', '16:45', '17:00', '17:15', '17:30', '17:45'],
    rename: {
      'cairo-islamic-heritage-tour-al-mu-izz-street--1d9ac4cec552': {
        name: 'Evening tour with private transfers',
        description: 'A guide in your language, private transfers, the entrance fees and bottled water.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Round-trip transfer from/to your destination in a private air-conditioned vehicle.'] },
    add: { inclusions: ['Hotel pickup and drop-off in Cairo or Giza by private air-conditioned vehicle'], needToKnow: [FAR_PICKUP] },
    itinerary: [
      { title: 'Hotel pickup', description: 'A private air-conditioned car collects you from your hotel in Cairo or Giza.' },
      { title: 'Monument to the Unknown Soldier', duration: '45 minutes', description: 'In Nasr City.' },
      { title: 'Al-Fishawi café', duration: '45 minutes', description: 'The old café in Khan el Khalili, known for its link with Naguib Mahfouz.' },
      { title: 'Al-Mu’izz Street', duration: '45 minutes', description: 'A walk among the medieval mosques, schools and domes.' },
      { title: 'Back to your hotel', description: 'The car returns you to your hotel in Cairo or Giza.' },
    ],
  },
  MOEZ_STREET_FOOD: {
    provider: 'eeo',
    tenant: EEO,
    source: 'islamic-cairo-walking-tour-el-moez-street-mosques-khan-el-khaliliculture-street-bites',
    category: DAY_TRIPS,
    // The shared walk with hotel transfers. The meeting-point option has no pickup, and the "private" option's own
    // description calls it shared, so neither is sold.
    options: ['sharing-walking-tour-in-english-with-hotel-tr-b27fb31710a2'],
    addons: [],
    departures: ['09:30', '12:30', '13:30'],
    rename: {
      'sharing-walking-tour-in-english-with-hotel-tr-b27fb31710a2': {
        name: 'Shared walk in English with hotel transfers',
        description: 'An English-speaking group with an Egyptologist guide, pickup and drop-off at your hotel in Cairo or Giza, street food and the entrance fees.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        'Street Food (Authentic Koshary or Egyptian Pie)',
        'Pick-up and drop-off from your hotel in Cairo or Giza (if option booked)',
      ],
    },
    // The option sold is the one with the hotel transfers, so the programme's conditional line is stated plainly.
    add: { inclusions: ['Street food: koshary or an Egyptian pie', PICKUP_CAIRO] },
    itinerary: [
      { title: 'Hotel pickup', description: 'Pickup from your hotel in Cairo or Giza.' },
      { title: 'Bab al-Futuh', duration: '15 minutes', description: 'One of the city’s medieval gates, where the walk begins.' },
      { title: 'Al-Hakim Mosque', duration: '25 minutes', description: 'The Fatimid mosque beside the gate.' },
      { title: 'Bayt al-Suhaymi', duration: '25 minutes', description: 'A preserved old Cairo house.' },
      { title: 'Al-Muizz Street', duration: '15 minutes', description: 'The walk along the street.' },
      { title: 'Khan el Khalili', duration: '15 minutes', description: 'The bazaar’s lanes and shops.' },
      { title: 'Mosque and Khanqah of Al-Nasir Faraj Ibn Barquq', duration: '20 minutes', description: 'Mamluk architecture on the street.' },
      { title: 'Qalawun Complex', duration: '25 minutes', description: 'The complex and its details.' },
      { title: 'Al-Hussein Mosque', duration: '20 minutes', description: 'The walk ends here.' },
      { title: 'Back to your hotel', description: 'The transfer back to your hotel in Cairo or Giza.' },
    ],
  },
};

const PHOTO = {
  horsesInSurf: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793083232/attractions-network/network-b08/nabq-national-park/x1k4chx0llydoxb1evie.jpg',
  appliqueStall: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793082633/attractions-network/network-b08/khan-el-khalili-market/adqurkh3kczgrxvfcsjy.jpg',
  lampLane: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793082635/attractions-network/network-b08/khan-el-khalili-market/xcvmdk8yrjuv8sfmpfjk.jpg',
  tanouraDancer: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793082640/attractions-network/network-b08/khan-el-khalili-market/em0lll9tm7e3ex9eqvuj.jpg',
  azharAtDusk: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793082642/attractions-network/network-b08/moez-street/fzkdxlcei7vlyuntnps9.jpg',
  parkGardens: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793082644/attractions-network/network-b08/moez-street/cdpceoxfh5d2cyumpi1p.jpg',
  glassLampShop: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793082645/attractions-network/network-b08/moez-street/rwmae5bampjv4figzx6w.jpg',
  arcadedCourtyard: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793082647/attractions-network/network-b08/moez-street/jtkebybg4g19b3cvylch.jpg',
  oldStreetShops: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793082649/attractions-network/network-b08/moez-street/xjxo2b4fwrzvfc4nszod.jpg',
};

/** Each photo described as it is, not as the trip it illustrates. */
const ALT = {
  horsesInSurf: 'White horses running through shallow sea water past a low rocky shore, spray rising around their legs',
  appliqueStall: 'A craftsman sewing in a stall hung floor to ceiling with brightly patterned appliqué textile panels',
  lampLane: 'Brass and glass lanterns hanging over a shop-lined lane, with stone steps rising to a pointed archway',
  tanouraDancer: 'A Tanoura dancer spinning in a wide coloured skirt on an open-air stage under a lit frame at night',
  azharAtDusk: 'A mosque courtyard at dusk, with two lit minarets and a dome above a long arcaded wall',
  parkGardens: 'Formal gardens of clipped hedges and paths, with trees around them and a domed mosque with two slender minarets on the skyline',
  glassLampShop: 'A shop crowded with hanging lamps of coloured glass mosaic, framed pictures and brass lanterns',
  arcadedCourtyard: 'A wide mosque courtyard ringed by arcades of pointed arches, with a domed fountain pavilion at its centre',
  oldStreetShops: 'A stone-paved street of old buildings with shops of lamps and brassware, people walking and lanterns on the walls',
};

const CAIRO = { lat: 30.0444, lng: 31.2357 };
const SHARM = { lat: 27.7369, lng: 34.3394 };
/** Places the Cairo sites never name: their trips stay in the old city. */
const NOT_CAIRO = /Hurghada|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Pyramid|Sphinx|Citadel|Coptic|Hanging Church/i;

export const B08A: NetworkBatch = {
  id: 'b08a',
  sites: [
    {
      slug: 'nabq-national-park',
      name: 'Nabq National Park',
      listingPath: '/trips',
      domain: 'nabqnationalpark.com',
      city: 'Sharm El Sheikh',
      area: 'Sharm El Sheikh',
      pickupDestination: 'sharm-el-sheikh',
      coordinates: SHARM,
      currency: 'USD',
      slugPrefix: 'nnp-',
      foreignPlaces: /Hurghada|Dahab|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Cairo|Giza|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Catherine|Blue Hole/i,
      tagline: 'Horse rides in the Nabq protected area',
      description: 'Nabq National Park sells guided horse rides from Sharm El Sheikh into the Nabq protected area, across the desert and along the shore of the Red Sea. There are two lengths, one hour and two hours, with starts through the day.\n\nThe Nabq park fee, a helmet and safety briefing, the guide and a soft drink are in the price, and the car collects you from your hotel in Sharm El Sheikh and brings you back. No riding experience is needed. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Nabq Horse Riding Tours from Sharm El Sheikh',
        metaDescription: 'Guided horse rides into the Nabq protected area from Sharm El Sheikh: one or two hours across the desert and along the shore, park fee and hotel pickup included.',
        keywords: [
          'nabq national park',
          'nabq horse riding',
          'horse riding sharm el sheikh',
          'nabq protected area tour',
          'sharm el sheikh horse ride with hotel pickup',
        ],
      },
      theme: { primaryColor: '#1F5E4A', secondaryColor: '#F4EFE4', accentColor: '#0E5F86' },
      heroImages: [PHOTO.horsesInSurf],
      photoShortfall: 'The one programme the site sells publishes one photo.',
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793083473/attractions-network/tenant-logos/nabq-national-park/monogram.png',
      trips: [
        {
          path: 'one-hour-horse-ride-in-nabq',
          price: PROGRAMMES.NABQ_ONE_HOUR,
          title: 'One-Hour Horse Ride in the Nabq Protected Area',
          short: 'An hour on horseback with a guide, across the desert and along the shore inside the Nabq protected area, with the park fee and hotel pickup.',
          description: 'The car collects you from your hotel in Sharm El Sheikh and drives to the stables, where the team matches you with a horse for your level and gives you a helmet and a safety briefing. The ride then sets out with a guide across the open desert and down to the shore of the Red Sea, inside the Nabq protected area.\n\nThe ride is one hour, with starts at ten o’clock and every hour from noon to four. The Nabq park fee, time for photos and a soft drink are in the price, and the car brings you back to your hotel. Food is not included. Children have their own price, and no riding experience is needed.',
          highlights: [
            'One hour on horseback with a guide',
            'Desert and shore inside the Nabq protected area',
            'Park fee, helmet and safety briefing included',
            'Hotel pickup in Sharm El Sheikh',
          ],
          seo: {
            metaTitle: 'One-Hour Horse Ride in Nabq from Sharm El Sheikh',
            metaDescription: 'A guided one-hour horse ride across the desert and along the shore inside the Nabq protected area, with the park fee and hotel pickup in Sharm El Sheikh.',
          },
          images: [PHOTO.horsesInSurf],
          imageAlts: [ALT.horsesInSurf],
        },
        {
          path: 'two-hour-horse-ride-in-nabq',
          price: PROGRAMMES.NABQ_TWO_HOURS,
          title: 'Two-Hour Horse Ride in the Nabq Protected Area',
          short: 'Two hours on horseback with a guide, across the desert and along the shore inside the Nabq protected area, with the park fee and hotel pickup.',
          description: 'The longer ride. The car collects you from your hotel in Sharm El Sheikh and drives to the stables, where the team matches you with a horse for your level and gives you a helmet and a safety briefing. A guide then rides with you across the open desert and along the shore of the Red Sea, inside the Nabq protected area, for two hours.\n\nStarts run every hour from ten in the morning to four in the afternoon. The Nabq park fee, time for photos and a soft drink are in the price, and the car brings you back to your hotel. Food is not included. Children have their own price, and no riding experience is needed.',
          highlights: [
            'Two hours on horseback with a guide',
            'Desert and shore inside the Nabq protected area',
            'Park fee, helmet and safety briefing included',
            'Hotel pickup in Sharm El Sheikh',
          ],
          seo: {
            metaTitle: 'Two-Hour Horse Ride in Nabq from Sharm El Sheikh',
            metaDescription: 'A guided two-hour horse ride across the desert and along the shore inside the Nabq protected area, with the park fee and hotel pickup in Sharm El Sheikh.',
          },
          images: [PHOTO.horsesInSurf],
          imageAlts: [ALT.horsesInSurf],
        },
      ],
    },
    {
      slug: 'khan-el-khalili-market',
      name: 'Khan el Khalili Market',
      listingPath: '/trips',
      domain: 'khanelkhalilimarket.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'kek-',
      foreignPlaces: NOT_CAIRO,
      tagline: 'Guided trips through Cairo’s old bazaar',
      description: 'Khan el Khalili Market sells guided trips into Cairo’s historic bazaar and the market streets around it: El Ghorya, Gamaleya Street and El Mosky, the old gates of the Fatimid city, and an evening on Al-Muizz Street that ends with the Tanoura show at Wikalat Al Ghuri.\n\nEvery trip collects you from your hotel in Cairo or Giza and brings you back. The guides share bargaining tips on the market days, and the markets trip includes lunch. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Khan el Khalili Tours from Cairo and Giza',
        metaDescription: 'Guided trips into Khan el Khalili and Cairo’s old markets, the Fatimid gates and Al-Muizz Street, with an evening Tanoura show and hotel pickup in Cairo or Giza.',
        keywords: [
          'khan el khalili tour',
          'khan el khalili market',
          'cairo bazaar shopping tour',
          'cairo old markets tour',
          'tanoura show cairo',
        ],
      },
      theme: { primaryColor: '#1F2347', secondaryColor: '#F6EEDF', accentColor: '#B5832A' },
      heroImages: [PHOTO.lampLane, PHOTO.appliqueStall, PHOTO.tanouraDancer],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793083471/attractions-network/tenant-logos/khan-el-khalili-market/monogram.png',
      trips: [
        {
          path: 'old-cairo-markets-and-khan-el-khalili-with-lunch',
          price: PROGRAMMES.KHAN_MARKETS,
          title: 'Private Tour of Cairo’s Old Markets and Khan el Khalili with Lunch',
          short: 'Four hours with a private guide through El Ghorya, Gamaleya Street, El Mosky and Khan el Khalili, with bargaining tips and a kushari lunch.',
          description: 'A private half day through the traditional markets of old Cairo. The walk starts at El Ghorya market and follows Gamaleya Street past Al-Azhar Mosque and Bab Zuweila, seen from the outside, to El Mosky, where your guide introduces the local shops and shares bargaining tips.\n\nThe last stop is Khan el Khalili, the historic bazaar, with time to browse spices, perfumes, jewellery, handicrafts and souvenirs. A kushari lunch follows, and a private air-conditioned car takes you back to your hotel in Cairo or Giza. Starts run every hour from eleven in the morning to six in the evening, the guide and a bottle of water are in the price, and children have their own price.',
          highlights: [
            'El Ghorya, Gamaleya Street and El Mosky',
            'Time to browse Khan el Khalili',
            'Bargaining tips from your guide',
            'A kushari lunch and hotel pickup',
          ],
          seo: {
            metaTitle: 'Private Cairo Markets and Khan el Khalili Tour with Lunch',
            metaDescription: 'Four hours with a private guide through El Ghorya, Gamaleya Street, El Mosky and Khan el Khalili, with bargaining tips, a kushari lunch and hotel pickup.',
          },
          images: [PHOTO.appliqueStall],
          imageAlts: [ALT.appliqueStall],
        },
        {
          path: 'old-gates-and-khan-el-khalili-shopping-tour',
          price: PROGRAMMES.KHAN_GATES,
          title: 'Private Shopping Tour by the Old Gates to Khan el Khalili',
          short: 'Three hours with a private guide: Bab al-Futuh, Bab El Nasr and Bab Zuweila, then El Ghorya, Gamalia Street and the shops of Khan el Khalili.',
          description: 'Three hours in the old Fatimid city with your own guide, in Arabic, English, French, German or Spanish. The car collects you from your hotel in Cairo or Giza and drives to Bab al-Futuh and Bab El Nasr, two of the medieval gates, and on to Bab Zuweila, with a short walk at each.\n\nThe tour then goes through El Ghorya market and Gamalia Street into Khan el Khalili, where you can browse brassware, leather, perfumes, jewellery, handicrafts, antiques and souvenirs, with help on bargaining. Private air-conditioned transport, the entrance fees and bottled water are in the price; food and drink are not. Starts run every half hour from eleven to half past three, and again at five and half past five. Children have their own price.',
          highlights: [
            'Bab al-Futuh, Bab El Nasr and Bab Zuweila',
            'El Ghorya, Gamalia Street and Khan el Khalili',
            'Help with bargaining',
            'Private car and hotel pickup',
          ],
          seo: {
            metaTitle: 'Khan el Khalili Shopping Tour by Cairo’s Old Gates',
            metaDescription: 'A three-hour private shopping tour from Cairo or Giza: Bab al-Futuh, Bab El Nasr and Bab Zuweila, then El Ghorya, Gamalia Street and Khan el Khalili.',
          },
          images: [PHOTO.lampLane],
          imageAlts: [ALT.lampLane],
        },
        {
          path: 'al-muizz-street-khan-el-khalili-and-tanoura-show',
          price: PROGRAMMES.KHAN_TANOURA,
          title: 'Evening on Al-Muizz Street and in Khan el Khalili with the Tanoura Show',
          short: 'Six hours from half past three: Bab al-Futuh, Al-Hakim Mosque, Al-Muizz Street, Khan el Khalili and Al-Azhar Mosque, then the Tanoura show at Wikalat Al Ghuri.',
          description: 'An afternoon and evening in historic Islamic Cairo. Pickup from your hotel in Cairo or Giza is at half past three, and the walk starts at Bab al-Futuh, one of the medieval gates, then Al-Hakim Mosque and along Al-Muizz Street.\n\nFree time in Khan el Khalili follows, then Al-Azhar Mosque, and the evening ends at Wikalat Al Ghuri with the Al Tanoura heritage show, whose ticket is in the price. There are two ways to book it: in a small group with a tour leader, or privately with a licensed Egyptologist guide in your language. Air-conditioned transport and a bottle of water are included; food, drinks and purchases are not. Children have their own price.',
          highlights: [
            'Bab al-Futuh, Al-Hakim Mosque and Al-Muizz Street',
            'Free time in Khan el Khalili',
            'The Tanoura show at Wikalat Al Ghuri',
            'Small group or private, with hotel pickup',
          ],
          seo: {
            metaTitle: 'Khan el Khalili and Al-Muizz Evening with the Tanoura Show',
            metaDescription: 'Six hours from Cairo or Giza: Bab al-Futuh, Al-Hakim Mosque, Al-Muizz Street, Khan el Khalili and Al-Azhar Mosque, ending with the Tanoura show.',
          },
          images: [PHOTO.tanouraDancer],
          imageAlts: [ALT.tanouraDancer],
        },
      ],
    },
    {
      slug: 'moez-street',
      name: 'Moez Street',
      listingPath: '/trips',
      domain: 'moezstreet.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'mzs-',
      foreignPlaces: NOT_CAIRO,
      tagline: 'Guided walks on Cairo’s Al-Muizz Street',
      description: 'Moez Street sells guided days on Al-Muizz Street, the old main street of Fatimid Cairo, and the mosques, gates and houses along it: Bab al-Futuh, Al-Hakim Mosque, Bayt al-Suhaymi, the Qalawun Complex, Al-Azhar Mosque and Bab Zuweila. There are morning, afternoon and evening starts, private and shared, with lunch, street food or a meal in Al-Azhar Park on some of them.\n\nEvery trip collects you from your hotel in Cairo or Giza and brings you back. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Al-Muizz Street Tours in Islamic Cairo',
        metaDescription: 'Guided days on Al-Muizz Street from Cairo or Giza: Bab al-Futuh, Al-Hakim Mosque, Bayt al-Suhaymi, the Qalawun Complex and Al-Azhar, with hotel pickup.',
        keywords: [
          'moez street cairo',
          'al muizz street tour',
          'islamic cairo walking tour',
          'el moez street',
          'al azhar mosque tour',
        ],
      },
      theme: { primaryColor: '#8E2A20', secondaryColor: '#F1E8D8', accentColor: '#24453A' },
      heroImages: [PHOTO.oldStreetShops, PHOTO.azharAtDusk, PHOTO.glassLampShop],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793083472/attractions-network/tenant-logos/moez-street/monogram.png',
      trips: [
        {
          path: 'al-azhar-and-al-muizz-street-day-with-lunch',
          price: PROGRAMMES.MOEZ_HERITAGE,
          title: 'Islamic Cairo Day: Al-Azhar, Al-Muizz Street and Historic Mosques with Lunch',
          short: 'Six hours from half past eight with an Egyptologist guide: Al-Azhar, Al Mouayyed Mosque, Bab Zuweila, Beit El Seheimy, Al-Hakim Mosque and the northern gates, with lunch.',
          description: 'A morning and early afternoon in the heart of Islamic Cairo with an Egyptologist guide. After pickup from your hotel in Cairo or Giza at half past eight, the day visits Al-Azhar Mosque, Al Mouayyed Mosque and Bab Zuweila, then Al Hussein Mosque and the old house of Beit El Seheimy.\n\nThe walk continues along Al-Muizz Street to Al-Hakim Mosque and the northern gates, Bab al Fetouh and Bab Al Nasr, with the lanes of Khan el Khalili around it. Lunch, transport and the entrance fees are in the price; drinks and personal expenses are not. The day is six hours, and children have their own price.',
          highlights: [
            'Al-Azhar and Al Mouayyed mosques',
            'Bab Zuweila, Bab al Fetouh and Bab Al Nasr',
            'Beit El Seheimy and Al-Hakim Mosque',
            'An Egyptologist guide and lunch',
          ],
          seo: {
            metaTitle: 'Al-Azhar and Al-Muizz Street Tour with Lunch',
            metaDescription: 'Six hours from Cairo or Giza with an Egyptologist guide: Al-Azhar, Al Mouayyed, Bab Zuweila, Beit El Seheimy, Al-Hakim Mosque and the old gates, with lunch.',
          },
          images: [PHOTO.azharAtDusk],
          imageAlts: [ALT.azharAtDusk],
        },
        {
          path: 'el-moez-street-and-al-azhar-park',
          price: PROGRAMMES.MOEZ_AZHAR_PARK,
          title: 'El Moez Street and Al-Azhar Park with a Meal at Studio Misr',
          short: 'Five hours with a private guide: two hours along El Moez Street and its monuments, then Al-Azhar Park and a meal at Studio Misr restaurant.',
          description: 'The car collects you from your hotel in Cairo or Giza for a start between eleven and two. Two hours on El Moez Street follow with a private guide, among its mosques, gates, schools and old houses, Bayt Al-Suhaymi among them, and its traditional shops.\n\nThe day then moves to Al-Azhar Park, with its view over the city, for a meal at Studio Misr restaurant. The guide, private air-conditioned transfers, the entrance fees and bottled water are in the price; drinks with the meal are not. The day is five hours, and children have their own price.',
          highlights: [
            'Two hours on El Moez Street',
            'Bayt Al-Suhaymi and the street’s monuments',
            'Al-Azhar Park and its view over Cairo',
            'A meal at Studio Misr restaurant',
          ],
          seo: {
            metaTitle: 'El Moez Street and Al-Azhar Park Tour with a Meal',
            metaDescription: 'Five hours from Cairo or Giza with a private guide: El Moez Street, Bayt Al-Suhaymi and the old monuments, then Al-Azhar Park and a meal at Studio Misr.',
          },
          images: [PHOTO.parkGardens],
          imageAlts: [ALT.parkGardens],
        },
        {
          path: 'private-walk-el-moez-street-to-khan-el-khalili',
          price: PROGRAMMES.MOEZ_PRIVATE_WALK,
          title: 'Private Walk on El Moez Street to Khan el Khalili',
          short: 'Four hours with a private English-speaking guide: Bab El Fetouh and Bab El Nasr, El Darb El Asfar and the Sultan Barqouq mosque, ending in Khan el Khalili.',
          description: 'A private walking tour through the heart of Islamic Cairo, in English. The car collects you from your hotel in Cairo or Giza, and the walk on El Moez Street takes in the medieval gates of Bab El Fetouh and Bab El Nasr, El Darb El Asfar, one of the oldest quarters, and the mosque and school of Sultan Barqouq.\n\nIt ends in the lanes and shops of Khan el Khalili, among crafts, jewellery, perfumes, antiques and souvenirs. The guide, the entrance fees, private air-conditioned transfers and bottled water are in the price. Starts run every hour from eleven to six, the tour is four hours, and children have their own price.',
          highlights: [
            'A private walking tour in English',
            'Bab El Fetouh and Bab El Nasr',
            'El Darb El Asfar and the Sultan Barqouq mosque',
            'Ends in Khan el Khalili',
          ],
          seo: {
            metaTitle: 'Private El Moez Street Walking Tour to Khan el Khalili',
            metaDescription: 'A four-hour private walk in English from Cairo or Giza: El Moez Street, the old gates, El Darb El Asfar and the Sultan Barqouq mosque, ending in Khan el Khalili.',
          },
          images: [PHOTO.glassLampShop],
          imageAlts: [ALT.glassLampShop],
        },
        {
          path: 'evening-al-fishawi-cafe-and-al-muizz-street',
          price: PROGRAMMES.MOEZ_EVENING,
          title: 'Evening Walk on Al-Mu’izz Street with Al-Fishawi Café',
          short: 'Four hours from late afternoon: the Monument to the Unknown Soldier, Al-Fishawi café and a walk on Al-Mu’izz Street, with Khan el Khalili around it.',
          description: 'An evening tour of Islamic Cairo with a guide in your language. The car collects you from your hotel in Cairo or Giza at a start you choose between four o’clock and a quarter to six, and the first stop is the Monument to the Unknown Soldier in Nasr City.\n\nNext comes Al-Fishawi café, known for its link with Naguib Mahfouz, and a walk along Al-Mu’izz Street among its medieval mosques, schools and domes, with Khan el Khalili around it. Private air-conditioned transfers, the entrance fees and bottled water are in the price. The tour is four hours, and children have their own price.',
          highlights: [
            'The Monument to the Unknown Soldier',
            'Al-Fishawi café',
            'Al-Mu’izz Street in the evening',
            'A guide in your language and private transfers',
          ],
          seo: {
            metaTitle: 'Al-Muizz Street Evening Tour with Al-Fishawi Café',
            metaDescription: 'A four-hour evening tour from Cairo or Giza: the Unknown Soldier monument, Al-Fishawi café and a walk on Al-Mu’izz Street, with Khan el Khalili around it.',
          },
          images: [PHOTO.arcadedCourtyard],
          imageAlts: [ALT.arcadedCourtyard],
        },
        {
          path: 'shared-walk-with-street-food',
          price: PROGRAMMES.MOEZ_STREET_FOOD,
          title: 'Shared Walking Tour of Islamic Cairo with Street Food',
          short: 'Three to four hours in an English-speaking group: Bab al-Futuh, Al-Hakim Mosque, Bayt al-Suhaymi, the Qalawun Complex and Khan el Khalili, with street food.',
          description: 'A shared walking tour in English with an Egyptologist guide and pickup from your hotel in Cairo or Giza, at half past nine, half past twelve or half past one. It starts at Bab al-Futuh, one of the medieval gates, and goes on to Al-Hakim Mosque and the old house of Bayt al-Suhaymi.\n\nThe walk follows El Moez Street through Khan el Khalili, past the mosque and khanqah of Al-Nasir Faraj Ibn Barquq and the Qalawun Complex, to Al-Hussein Mosque. Street food is part of it: koshary or an Egyptian pie, and a local sweet such as zalabia. The entrance fees and bottled water are in the price, and children have their own price.',
          highlights: [
            'Bab al-Futuh and Al-Hakim Mosque',
            'Bayt al-Suhaymi and the Qalawun Complex',
            'Street food along the way',
            'An English-speaking group with hotel pickup',
          ],
          seo: {
            metaTitle: 'Islamic Cairo Walking Tour with Street Food',
            metaDescription: 'A shared English walking tour from Cairo or Giza: Bab al-Futuh, Al-Hakim Mosque, Bayt al-Suhaymi, El Moez Street and Qalawun, with street food and hotel pickup.',
          },
          images: [PHOTO.oldStreetShops],
          imageAlts: [ALT.oldStreetShops],
        },
      ],
    },
  ],
};

// ================================================================================================================
// B08B: Coptic Museum Cairo, Mount Sinai and Dahab Blue Hole.
// ================================================================================================================

/**
 * The client publishes the Coptic Museum only as one option of a "choose your museum" programme whose hotel transfer
 * is an extra bound to no booking option, so a network site cannot sell it. The Coptic Museum site therefore sells
 * days in Coptic Cairo, around the museum, and every one of them says so on its own page (the Valley of the Nobles
 * precedent, batch B03).
 */
const NOT_THE_MUSEUM = 'This trip visits the churches of Coptic Cairo around the Coptic Museum but not the museum itself. Ask the team first if you want to see the museum.';
/** St Catherine's Monastery keeps its own days; the records say so, and the team confirms the date with the booking. */
const MONASTERY_DAYS = 'St Catherine’s Monastery is closed on Sundays and on some Christian holidays; the team confirms your date when it confirms your booking.';

const PROGRAMMES_B = {
  // ---- Coptic Museum Cairo -----------------------------------------------------------------------------------
  COPTIC_CAVE_CHURCH: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-coptic-cairo-cave-church-of-st-simon-private-tour',
    category: DAY_TRIPS,
    options: ['private-coptic-cairo-tour-with-tickets-transf-122eb71a6355'],
    addons: [],
    departures: ['09:00'],
    rename: {
      'private-coptic-cairo-tour-with-tickets-transf-122eb71a6355': {
        name: 'Private tour with tickets and transfers',
        description: 'Your own English- or Arabic-speaking guide, private transfers and the entrance fees.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Pick up services from your hotel & return'] },
    add: { inclusions: [PICKUP_CAIRO], needToKnow: [NOT_THE_MUSEUM] },
    itinerary: [
      { time: '09:00', title: 'Hotel pickup', description: 'A private air-conditioned car collects you from your hotel in Cairo or Giza.' },
      { title: 'Abu Serga', duration: '15 minutes', description: 'One of the old churches around the Fort of Babylon.' },
      { title: 'St Barbara’s Church', duration: '15 minutes', description: 'Beside Abu Serga in Coptic Cairo.' },
      { title: 'The Hanging Church', duration: '15 minutes', description: 'Built above a gate of the Fort of Babylon.' },
      { title: 'Cave Church of St Simon the Tanner', duration: '30 minutes', description: 'The churches carved into the Mokattam hills.' },
      { title: 'Back to your hotel', description: 'The car returns you to your hotel in Cairo or Giza.' },
    ],
  },
  COPTIC_DAY_WITH_LUNCH: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-islamic-coptic-heritage-tour-with-lunch',
    category: DAY_TRIPS,
    // The two options that include the entry tickets; the cheaper one leaves them to be bought at each site.
    options: ['small-group-tour-in-english-with-lunch-and-en-760adacc46dc', 'private-english-tour-with-lunch-entry-tickets-b09ce2f98266'],
    addons: [],
    departures: ['08:00'],
    rename: {
      'small-group-tour-in-english-with-lunch-and-en-760adacc46dc': {
        name: 'Small group in English, with entry tickets',
        description: 'A shared English-speaking group with an Egyptologist guide, lunch and the entry tickets.',
      },
      'private-english-tour-with-lunch-entry-tickets-b09ce2f98266': {
        name: 'Private tour in English, with entry tickets',
        description: 'Your own English-speaking Egyptologist guide, lunch and the entry tickets.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Pickup and drop-off from your accommodation in Cairo or Giza'] },
    add: { inclusions: [PICKUP_CAIRO], needToKnow: [NOT_THE_MUSEUM, FAR_PICKUP] },
    // The record's own description also names El Moez Street and Khan el Khalili; its schedule does not, so neither is promised.
    itinerary: [
      { time: '08:00', title: 'Hotel pickup', description: 'Pickup from your hotel in Cairo or Giza.' },
      { title: 'Abu Serga', duration: '30 minutes', description: 'The church in the old quarter around the Fort of Babylon.' },
      { title: 'Fort of Babylon', duration: '15 minutes', description: 'The Roman fortress at the heart of Coptic Cairo.' },
      { title: 'St George’s Church', duration: '1 hour', description: 'In the same quarter.' },
      { title: 'The Hanging Church', duration: '30 minutes', description: 'Built above a gate of the fortress.' },
      { title: 'Lunch in Old Cairo', duration: '1 hour', description: 'Lunch at a local restaurant.' },
      { title: 'Cairo Citadel', duration: '45 minutes', description: 'The day ends at the Citadel.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  COPTIC_CITADEL_PRIVATE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-coptic-islamic-heritage-tour',
    category: DAY_TRIPS,
    options: ['private-tour-in-eng-with-tickets-transfer-and-749602157f5e'],
    addons: [],
    departures: ['08:00', '08:15', '08:30', '08:45', '09:00', '09:15', '09:30', '09:45'],
    rename: {
      'private-tour-in-eng-with-tickets-transfer-and-749602157f5e': {
        name: 'Private tour in English with tickets',
        description: 'Your own English-speaking guide, private transfers and the entrance tickets.',
      },
    },
    childNote: CHILD_NOTE,
    // The option sold is the one with the tickets, so the programme's conditional line is stated plainly; the record's
    // own description promises the pickup from your hotel.
    omit: { inclusions: ['Entrance tickets to all mentioned sites (Only if you choose the option that includes the tickets).'] },
    add: { inclusions: ['Entrance tickets to the sites visited', PICKUP_CAIRO], needToKnow: [NOT_THE_MUSEUM] },
    itinerary: [
      { title: 'Hotel pickup', description: 'A private air-conditioned car collects you from your hotel in Cairo or Giza.' },
      { title: 'Cairo Citadel', duration: '1 hour', description: 'The Citadel of Salah El Din and its view over the city.' },
      { title: 'Mosque of Muhammad Ali', duration: '30 minutes', description: 'The Alabaster Mosque inside the Citadel.' },
      { title: 'The Hanging Church', duration: '15 minutes', description: 'In Coptic Cairo.' },
      { title: 'Ben Ezra Synagogue', duration: '15 minutes', description: 'Beside the churches of the old quarter.' },
      { title: 'St Barbara’s Church', duration: '15 minutes', description: 'The last stop.' },
      { title: 'Back to your hotel', description: 'The car returns you to your hotel in Cairo or Giza.' },
    ],
  },

  // ---- Mount Sinai --------------------------------------------------------------------------------------------
  SINAI_SUNRISE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-mount-sinai-sunrise-hike-st-catherine-s-monastery',
    category: ADVENTURE,
    options: ['mount-sinai-sunrise-st-catherine-s-monastery-ea16e9458e90'],
    addons: [],
    departures: ['20:00'],
    rename: {
      'mount-sinai-sunrise-st-catherine-s-monastery-ea16e9458e90': {
        name: 'Sunrise climb with the monastery',
        description: 'Transfers by air-conditioned bus, the St Catherine park fees and a Bedouin guide for the climb.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Pick up services from/to your hotel in Sharm'] },
    add: {
      inclusions: [PICKUP_SHARM],
      needToKnow: ['A copy of your passport must reach the team two days before the trip at the latest.', MONASTERY_DAYS],
    },
    // The record's own schedule is transfer legs; its description gives the night's times.
    itinerary: [
      { time: '20:00', title: 'Hotel pickup', description: 'Pickup from your hotel in Sharm El Sheikh between about eight and a quarter to nine in the evening, then about three hours by air-conditioned bus to St Catherine.' },
      { time: '02:00', title: 'The climb', description: 'The ascent of Mount Sinai through the night with a Bedouin guide.' },
      { title: 'Sunrise at the summit', description: 'Sunrise from the top of the mountain.' },
      { time: '07:00', title: 'The descent', description: 'The walk back down after sunrise.' },
      { title: 'St Catherine’s Monastery', duration: '2 hours', description: 'A visit to the monastery at the foot of the mountain.' },
      { title: 'Back to your hotel', description: 'The bus returns you to your hotel in Sharm El Sheikh.' },
    ],
  },
  SINAI_SHARED: {
    provider: 'eeo',
    tenant: EEO,
    source: 'from-sharm-el-sheikh-mount-sinai-sunrise-hike-st-catherine-monastery',
    category: ADVENTURE,
    options: ['shared-multilingual-tour-66104905913e'],
    addons: [],
    departures: ['21:00'],
    // The record lists its length among its inclusions.
    duration: '16 to 17 hours',
    rename: {
      'shared-multilingual-tour-66104905913e': {
        name: 'Shared tour with a multilingual guide',
        description: 'A shared group with a guide in your language to the base camp and a Bedouin guide on the mountain.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['16-17 hour tour', 'Pickup and drop-off from the hotel in Sharm el-Sheikh'] },
    add: {
      inclusions: [PICKUP_SHARM],
      needToKnow: [
        'The climb is not suitable for older guests or anyone with breathing or joint problems.',
        'The trip lasts 16 to 17 hours with the transfers, and can run longer at the security checkpoints on the road.',
        'The guide comes as far as the base camp; on the mountain a Bedouin guide leads the climb.',
        'Breakfast boxes are ordered from your hotel in advance and collected before you leave.',
        MONASTERY_DAYS,
      ],
    },
    itinerary: [
      { time: '21:00', title: 'Hotel pickup', description: 'Pickup from your hotel in Sharm El Sheikh.' },
      { title: 'The climb', description: 'The ascent through the night with a Bedouin guide, for sunrise at the summit.' },
      { title: 'Sunrise at the summit', description: 'The sun comes up over the mountains.' },
      { title: 'St Catherine’s Monastery', description: 'Time at the monastery after the descent.' },
      { title: 'Back to your hotel', description: 'The drive back to Sharm El Sheikh.' },
    ],
  },
  SINAI_PRIVATE_MONASTERY: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-private-st-catherine-s-monastery-tour',
    category: DAY_TRIPS,
    options: ['sharm-el-sheikh-private-st-catherine-s-monast-d92956505822'],
    addons: [],
    departures: ['06:00'],
    rename: {
      'sharm-el-sheikh-private-st-catherine-s-monast-d92956505822': {
        name: 'Private day with lunch',
        description: 'Your own guide and car, the St Katherine Protectorate fee and lunch on the beach in Dahab.',
      },
    },
    childNote: CHILD_NOTE,
    add: {
      needToKnow: [
        'The road to St Catherine runs in a convoy.',
        'Sleeveless tops are not allowed in the monastery, and photos are not allowed inside.',
        MONASTERY_DAYS,
      ],
    },
    itinerary: [
      { time: '06:00', title: 'Hotel pickup', description: 'Pickup from your hotel in Sharm El Sheikh, then about three hours by private car.' },
      { title: 'St Catherine’s Monastery', duration: '2 hours', description: 'A guided visit; the library’s own fee is not included.' },
      { title: 'Dahab', duration: '1 hour', description: 'Lunch on the beach.' },
      { title: 'Back to your hotel', description: 'The drive back to Sharm El Sheikh.' },
    ],
  },
  SINAI_MONASTERY_AND_DAHAB: {
    provider: 'eeo',
    tenant: EEO,
    source: 'st-catherine-monastery-dahab-day-trip-from-sharm-el-sheikh',
    category: DAY_TRIPS,
    options: ['from-sharm-el-sheikh-day-trip-to-st-catherine-a28d1dbec478'],
    addons: [],
    departures: ['05:00', '06:00'],
    rename: {
      'from-sharm-el-sheikh-day-trip-to-st-catherine-a28d1dbec478': {
        name: 'Day trip to St Catherine and Dahab',
        description: 'Transfers, the entry fees, a Mount Sinai guide and snacks.',
      },
    },
    childNote: CHILD_NOTE,
    add: { needToKnow: ['The trip runs in all weather.', MONASTERY_DAYS] },
    itinerary: [
      { title: 'Hotel pickup', description: 'Pickup from your hotel in Sharm El Sheikh at five or six in the morning, then about three hours by car.' },
      { title: 'St Catherine’s Monastery', description: 'A guided visit at the foot of Mount Sinai.' },
      { title: 'Dahab', description: 'Time in the town on the coast, with the guide.' },
      { title: 'Back to your hotel', description: 'About three hours back to Sharm El Sheikh.' },
    ],
  },

  // ---- Dahab Blue Hole ----------------------------------------------------------------------------------------
  // The option with entry to the Blue Hole area. Its twin programme (`sharm-day-trip-dahab-blue-hole-snorkeling-lunch`,
  // the same day listed twice by the client) is left out, and the other option, without the Blue Hole, is sold on
  // no Blue Hole page.
  BLUE_HOLE_DAY: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-dahab-blue-hole-canyon-adventure-with-snorkeling-lunch',
    category: DAY_TRIPS,
    options: ['blue-hole-magic-dahab-vibes-w-snorkeling-lunc-ff4d26fe82c3'],
    addons: [],
    departures: ['08:00'],
    rename: {
      'blue-hole-magic-dahab-vibes-w-snorkeling-lunc-ff4d26fe82c3': {
        name: 'With entry to the Blue Hole area',
        description: 'Snorkelling at the Blue Hole, a camel ride, a canyon visit and lunch in Dahab.',
      },
    },
    childNote: CHILD_NOTE,
    // The option sold carries the Blue Hole entry; no booking option carries the mask-and-fins add-on.
    omit: { inclusions: ['Entry to the Blue Hole area (if option selected)', 'Snorkeling equipment (mask and fins) (if add-ons are selected)'] },
    add: {
      inclusions: ['Entry to the Blue Hole area'],
      exclusions: ['Snorkelling mask and fins'],
      needToKnow: [
        'Bring an ID card or a copy of your passport.',
        'The trip is not suitable during pregnancy.',
        'Life jackets are available on request.',
        'Bring swimwear and a towel.',
        'The pickup time is confirmed the day before.',
      ],
    },
    itinerary: [
      { time: '08:00', title: 'Hotel pickup', description: 'Pickup from your hotel in Sharm El Sheikh, then about an hour by air-conditioned vehicle.' },
      { title: 'The Blue Hole', duration: '3 hours', description: 'Entry to the Blue Hole area, a snorkelling stop with the snorkelling guide, and free time.' },
      { title: 'Dahab', duration: '3 hours', description: 'Snorkelling and time in the town, with lunch at a local restaurant.' },
      { title: 'Back to your hotel', description: 'About an hour back to Sharm El Sheikh.' },
    ],
  },
  BLUE_HOLE_JEEP: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-colored-canyon-blue-hole-dahab-jeep-adventure',
    category: ADVENTURE,
    options: ['colored-canyon-blue-hole-abu-galum-with-atv-q-c9913ca7db12'],
    // The mask and fins only; the option's other add-ons are a branded scarf and an unexplained "Double ATV".
    addons: ['6a8e49075a22af803ba3e852'],
    perPerson: ['6a8e49075a22af803ba3e852'],
    extras: {
      '6a8e49075a22af803ba3e852': { name: 'Snorkel mask and fins', description: 'Per guest, for the snorkelling at the Blue Hole.' },
    },
    departures: ['08:00'],
    rename: {
      'colored-canyon-blue-hole-abu-galum-with-atv-q-c9913ca7db12': {
        name: 'With the Blue Hole and a quad ride',
        description: 'The Coloured Canyon by jeep, entry to the Blue Hole and Abu Galum protected area, a quad ride and lunch in a Bedouin tent.',
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
      inclusions: [PICKUP_SHARM, 'Entry to the Blue Hole and Abu Galum protected area', 'An ATV quad ride along the sea and the mountains in Dahab'],
      needToKnow: [
        'Bring your original passport.',
        'The day includes off-road driving and some walking in the canyon; wear comfortable clothes and walking shoes.',
        'Snorkelling depends on the sea; a life jacket is required for the Blue Hole visit.',
        'Bring cash for personal spending.',
      ],
    },
    itinerary: [
      { time: '08:00', title: 'Hotel pickup', description: 'Pickup from the main gate of your hotel in Sharm El Sheikh.' },
      { title: 'Coloured Canyon', duration: '2 hours', description: 'A guided walk through the canyon after a safety briefing.' },
      { title: 'By jeep to Dahab', duration: '1 hour', description: 'The jeep safari across the desert.' },
      { title: 'Dahab', duration: '1 hour', description: 'Free time and a shopping stop.' },
      { title: 'The Blue Hole', duration: '1 hour', description: 'Snorkelling at the Blue Hole.' },
      { title: 'Quad ride', duration: '30 minutes', description: 'An ATV ride along the sea and the mountains.' },
      { title: 'Lunch', duration: '45 minutes', description: 'Lunch in a Bedouin tent on the beach in Dahab, and a camel ride along the sea.' },
      { title: 'Back to your hotel', description: 'About an hour back to Sharm El Sheikh.' },
    ],
  },
} satisfies Record<string, PriceSpec>;

const PHOTO_B = {
  caveChurch: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793082651/attractions-network/network-b08/coptic-museum-cairo/zjj5awqsdmobpqgnz4kh.jpg',
  courtyardKiosk: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793082653/attractions-network/network-b08/coptic-museum-cairo/pfeqolph8rchrbuwkt7h.jpg',
  domedMosqueInterior: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793082656/attractions-network/network-b08/coptic-museum-cairo/ppeofevhpgpb00kckcz1.jpg',
  hikersOnTrail: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793084904/attractions-network/network-b08/mount-sinai/ossqhkp1podnl66zfqu2.jpg',
  monasteryWalls: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793084906/attractions-network/network-b08/mount-sinai/sztunprbohzzuqyjgbc5.jpg',
  monasteryCypress: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793084908/attractions-network/network-b08/mount-sinai/itys88mzs9eemv1rlz7c.jpg',
  bellTower: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793084910/attractions-network/network-b08/mount-sinai/a5ihbtdm9vqanbrs0qwj.jpg',
  blueHoleAerial: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793084912/attractions-network/network-b08/dahab-blue-hole/z8dxsxb3ab1gf7tun8xp.jpg',
  desertJeep: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793084914/attractions-network/network-b08/dahab-blue-hole/ihzuvhkpdyzmh1dguahw.jpg',
};

const ALT_B = {
  caveChurch: 'A vast church carved into a cliff, with rows of benches curving around a stage under the overhanging rock',
  courtyardKiosk: 'A stone courtyard of tall pointed arches, with a domed wooden fountain kiosk at its centre and a hanging lamp',
  domedMosqueInterior: 'The lit interior of a large domed mosque, with rings of hanging lamps around a tall central chandelier',
  hikersOnTrail: 'Walkers in warm jackets and hats climbing a rocky mountain path between steep granite slopes',
  monasteryWalls: 'A walled stone monastery in a desert valley, with arched buildings rising inside its high walls',
  monasteryCypress: 'The high walls of a stone monastery below a granite mountain, with cypress trees and roofs behind them',
  bellTower: 'A stone bell tower topped with a cross, standing against a red granite mountain under a blue sky',
  blueHoleAerial: 'An aerial view of a deep blue circle in a pale turquoise reef beside a sandy shore lined with low buildings and parked cars',
  desertJeep: 'A white four-by-four parked on a gravel plain below bare desert mountains under a clear sky',
};

/** Places the Sinai sites never name: their trips stay between Sharm El Sheikh, St Catherine and Dahab. */
const NOT_SINAI = /Hurghada|Cairo|Giza|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Saqqara|Sakkara|Memphis|Dahshur|Tiran|Ras Mohamed|Nabq/i;

export const B08B: NetworkBatch = {
  id: 'b08b',
  sites: [
    {
      slug: 'coptic-museum-cairo',
      name: 'Coptic Museum Cairo',
      listingPath: '/trips',
      domain: 'copticmuseumcairo.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'cmc-',
      foreignPlaces: /Hurghada|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Pyramid|Sphinx/i,
      tagline: 'Guided days in Coptic Cairo',
      description: 'Coptic Museum Cairo sells guided days in Coptic Cairo, the old quarter around the Fort of Babylon: the Hanging Church, Abu Serga, St Barbara’s Church, St George’s and the Ben Ezra Synagogue, with the Cave Church of St Simon on the Mokattam hills or the Citadel on some of them. None of these days goes inside the Coptic Museum itself; ask the team first if you want to see it.\n\nEvery trip collects you from your hotel in Cairo or Giza and brings you back. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Coptic Cairo Tours: Hanging Church, Abu Serga and Ben Ezra',
        metaDescription: 'Guided days in Coptic Cairo from Cairo or Giza: the Hanging Church, Abu Serga, St Barbara’s, Ben Ezra and the Cave Church of St Simon, with hotel pickup.',
        keywords: [
          'coptic museum cairo',
          'coptic cairo tour',
          'hanging church cairo',
          'cave church cairo tour',
          'old cairo churches tour',
        ],
      },
      theme: { primaryColor: '#24427A', secondaryColor: '#F4ECDC', accentColor: '#8E2426' },
      heroImages: [PHOTO_B.caveChurch, PHOTO_B.courtyardKiosk, PHOTO_B.domedMosqueInterior],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793084941/attractions-network/tenant-logos/coptic-museum-cairo/monogram.png',
      trips: [
        {
          path: 'coptic-cairo-and-cave-church-private-tour',
          price: PROGRAMMES_B.COPTIC_CAVE_CHURCH,
          title: 'Private Tour of Coptic Cairo and the Cave Church of St Simon',
          short: 'Five hours with a private guide: Abu Serga, St Barbara’s and the Hanging Church in Coptic Cairo, then the Cave Church of St Simon on the Mokattam hills.',
          description: 'A private day with Cairo’s Christian heritage. After pickup from your hotel in Cairo or Giza at nine, the guide takes you through the old churches around the Fort of Babylon: the Church of Abu Serga, St Barbara’s Church and the Hanging Church, with the Ben Ezra Synagogue nearby.\n\nThe car then climbs to the Mokattam hills for the Cave Church of St Simon the Tanner, a complex of churches carved into the rock, the largest set out like an open-air amphitheatre. The guide speaks English or Arabic; private transfers, the entrance fees and bottled water are in the price. The day is five hours, and children have their own price. It does not go inside the Coptic Museum.',
          highlights: [
            'Abu Serga and St Barbara’s Church',
            'The Hanging Church',
            'The Cave Church of St Simon on the Mokattam hills',
            'A private guide and car',
          ],
          seo: {
            metaTitle: 'Coptic Cairo and Cave Church of St Simon Private Tour',
            metaDescription: 'Five hours from Cairo or Giza with a private guide: Abu Serga, St Barbara’s, the Hanging Church and the Cave Church of St Simon on the Mokattam hills.',
          },
          images: [PHOTO_B.caveChurch],
          imageAlts: [ALT_B.caveChurch],
        },
        {
          path: 'coptic-cairo-and-citadel-day-with-lunch',
          price: PROGRAMMES_B.COPTIC_DAY_WITH_LUNCH,
          title: 'Coptic Cairo and Citadel Day with Lunch',
          short: 'Six hours from eight in the morning: Abu Serga, the Fort of Babylon, St George’s and the Hanging Church, lunch in Old Cairo, then the Citadel.',
          description: 'A morning in Coptic Cairo and a visit to the Citadel, with an Egyptologist guide. Pickup from your hotel in Cairo or Giza is at eight. The day starts at the Church of Abu Serga and the Fort of Babylon, then St George’s Church and the Hanging Church.\n\nLunch is at a local restaurant in Old Cairo, and the day ends at the Citadel before the drive back. Book it in a small English-speaking group or as a private tour; both include lunch and the entry tickets. Drinks with lunch are not included. The day is six hours, and children have their own price. It does not go inside the Coptic Museum.',
          highlights: [
            'Abu Serga and the Fort of Babylon',
            'St George’s and the Hanging Church',
            'Lunch in Old Cairo',
            'The Citadel to finish',
          ],
          seo: {
            metaTitle: 'Coptic Cairo and Citadel Day Tour with Lunch',
            metaDescription: 'Six hours from Cairo or Giza with an Egyptologist guide: Abu Serga, the Fort of Babylon, St George’s, the Hanging Church, lunch and the Citadel.',
          },
          images: [PHOTO_B.courtyardKiosk],
          imageAlts: [ALT_B.courtyardKiosk],
        },
        {
          path: 'citadel-and-coptic-cairo-private-tour',
          price: PROGRAMMES_B.COPTIC_CITADEL_PRIVATE,
          title: 'Private Tour of the Citadel and Coptic Cairo',
          short: 'Four hours with a private guide: the Citadel and the Mosque of Muhammad Ali, then the Hanging Church, the Ben Ezra Synagogue and St Barbara’s Church.',
          description: 'A private morning with Cairo’s religious heritage. The car collects you from your hotel in Cairo or Giza at a start between eight and a quarter to ten, and the first stop is the Citadel of Salah El Din, with the Mosque of Muhammad Ali, known as the Alabaster Mosque, and its view over the city.\n\nIn Coptic Cairo the guide shows you the Hanging Church, the Ben Ezra Synagogue and St Barbara’s Church. Private transfers, the entrance tickets and bottled water are in the price. The tour is four hours, and children have their own price. It does not go inside the Coptic Museum.',
          highlights: [
            'The Citadel and the Alabaster Mosque',
            'The Hanging Church',
            'The Ben Ezra Synagogue and St Barbara’s',
            'A private guide and car',
          ],
          seo: {
            metaTitle: 'Private Citadel and Coptic Cairo Tour',
            metaDescription: 'Four hours from Cairo or Giza with a private guide: the Citadel and the Alabaster Mosque, the Hanging Church, Ben Ezra Synagogue and St Barbara’s Church.',
          },
          images: [PHOTO_B.domedMosqueInterior],
          imageAlts: [ALT_B.domedMosqueInterior],
        },
      ],
    },
    {
      slug: 'mount-sinai',
      name: 'Mount Sinai',
      listingPath: '/trips',
      domain: 'mountsinaieg.com',
      city: 'Sharm El Sheikh',
      area: 'Sharm El Sheikh',
      pickupDestination: 'sharm-el-sheikh',
      coordinates: SHARM,
      currency: 'USD',
      slugPrefix: 'msg-',
      foreignPlaces: NOT_SINAI,
      tagline: 'Mount Sinai and St Catherine’s Monastery from Sharm El Sheikh',
      description: 'Mount Sinai sells trips from Sharm El Sheikh to Mount Sinai and St Catherine’s Monastery at its foot: the overnight climb to watch the sun rise from the summit, with the monastery on the way back, and days at the monastery that continue to Dahab.\n\nEvery trip collects you from your hotel in Sharm El Sheikh and brings you back. The climbs leave in the evening and return the next day. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Mount Sinai Sunrise Climb and St Catherine’s from Sharm',
        metaDescription: 'The overnight Mount Sinai sunrise climb and day trips to St Catherine’s Monastery from Sharm El Sheikh, with hotel pickup and a Bedouin guide for the climb.',
        keywords: [
          'mount sinai sunrise tour',
          'mount sinai from sharm el sheikh',
          'st catherine monastery tour',
          'mount sinai climb',
          'st catherine and dahab day trip',
        ],
      },
      theme: { primaryColor: '#2E2A5A', secondaryColor: '#F7F1EA', accentColor: '#9A3B2E' },
      heroImages: [PHOTO_B.hikersOnTrail, PHOTO_B.monasteryWalls, PHOTO_B.bellTower],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793084944/attractions-network/tenant-logos/mount-sinai/monogram.png',
      trips: [
        {
          path: 'mount-sinai-sunrise-climb-and-st-catherine',
          price: PROGRAMMES_B.SINAI_SUNRISE,
          title: 'Mount Sinai Sunrise Climb and St Catherine’s Monastery',
          short: 'An overnight trip from Sharm El Sheikh: the night climb with a Bedouin guide, sunrise at the summit, then St Catherine’s Monastery on the way back.',
          description: 'The bus collects you from your hotel in Sharm El Sheikh between about eight and a quarter to nine in the evening for the three-hour drive to St Catherine. The climb starts at two in the morning, with a Bedouin guide, through the night to the summit of Mount Sinai in time for sunrise.\n\nThe walk down begins at seven, and the morning ends with a visit to St Catherine’s Monastery before the drive back to your hotel. Air-conditioned transfers, the St Catherine park fees and the Bedouin guide are in the price. The trip is about fifteen hours, and children have their own price. A copy of your passport is needed two days before the trip.',
          highlights: [
            'The night climb with a Bedouin guide',
            'Sunrise from the summit',
            'St Catherine’s Monastery on the way back',
            'Hotel pickup in Sharm El Sheikh',
          ],
          seo: {
            metaTitle: 'Mount Sinai Sunrise Climb from Sharm El Sheikh',
            metaDescription: 'The overnight climb of Mount Sinai from Sharm El Sheikh with a Bedouin guide, sunrise from the summit and St Catherine’s Monastery, with hotel pickup.',
          },
          images: [PHOTO_B.hikersOnTrail],
          imageAlts: [ALT_B.hikersOnTrail],
        },
        {
          path: 'mount-sinai-sunrise-shared-tour',
          price: PROGRAMMES_B.SINAI_SHARED,
          title: 'Mount Sinai Sunrise Climb, Shared Tour with a Multilingual Guide',
          short: 'From nine in the evening: a shared climb to the summit for sunrise, then St Catherine’s Monastery, with a guide in your language and a Bedouin guide on the mountain.',
          description: 'The shared tour leaves your hotel in Sharm El Sheikh at nine in the evening. A guide who speaks your language travels with the group to the base camp, and a Bedouin guide leads the climb through the night to the summit for sunrise.\n\nAfter the descent the group visits St Catherine’s Monastery, then drives back to your hotel. Transport, both guides and water are in the price. Allow sixteen to seventeen hours in all, longer if the road checkpoints are slow. The climb is not suitable for older guests or anyone with breathing or joint problems. Children have their own price.',
          highlights: [
            'A guide in your language to the base camp',
            'A Bedouin guide for the climb',
            'Sunrise from the summit',
            'St Catherine’s Monastery after the descent',
          ],
          seo: {
            metaTitle: 'Shared Mount Sinai Sunrise Tour with a Multilingual Guide',
            metaDescription: 'A shared overnight trip from Sharm El Sheikh: the climb to the summit of Mount Sinai for sunrise with a Bedouin guide, then St Catherine’s Monastery.',
          },
          images: [PHOTO_B.monasteryWalls],
          imageAlts: [ALT_B.monasteryWalls],
        },
        {
          path: 'private-st-catherine-with-lunch-in-dahab',
          price: PROGRAMMES_B.SINAI_PRIVATE_MONASTERY,
          title: 'Private Day at St Catherine’s Monastery with Lunch in Dahab',
          short: 'About ten hours with a private guide and car: St Catherine’s Monastery at the foot of Mount Sinai, then lunch on the beach in Dahab.',
          description: 'A private day from Sharm El Sheikh. The car collects you from your hotel at six in the morning for the three-hour drive to St Catherine’s Monastery, where your guide spends two hours with you at the monastery.\n\nThe drive then goes on to Dahab for lunch on the beach before the return to your hotel. The private car, the guide, the St Katherine Protectorate fee and lunch are in the price; the monastery library’s own fee and drinks with lunch are not. The road runs in a convoy, and the day is about ten hours. Children have their own price.',
          highlights: [
            'St Catherine’s Monastery with a private guide',
            'Lunch on the beach in Dahab',
            'A private car from Sharm El Sheikh',
            'The protectorate fee included',
          ],
          seo: {
            metaTitle: 'Private St Catherine’s Monastery Tour with Lunch in Dahab',
            metaDescription: 'A private day from Sharm El Sheikh: St Catherine’s Monastery with your own guide, then lunch on the beach in Dahab, with hotel pickup and the protectorate fee.',
          },
          images: [PHOTO_B.monasteryCypress],
          imageAlts: [ALT_B.monasteryCypress],
        },
        {
          path: 'st-catherine-and-dahab-day-trip',
          price: PROGRAMMES_B.SINAI_MONASTERY_AND_DAHAB,
          title: 'St Catherine’s Monastery and Dahab Day Trip',
          short: 'A day from Sharm El Sheikh with a Mount Sinai guide: St Catherine’s Monastery at the foot of the mountain, then time in Dahab on the coast.',
          description: 'The car collects you from your hotel in Sharm El Sheikh at five or six in the morning for the drive of about three hours to St Catherine’s Monastery, at the foot of Mount Sinai, where a Mount Sinai guide shows you around.\n\nThe day continues to Dahab, the town on the Red Sea coast, before the drive back to your hotel. Transfers, the entry fees, the guide and snacks are in the price; tips are not. The trip runs in all weather, and the day is about twelve hours. Children have their own price.',
          highlights: [
            'St Catherine’s Monastery with a Mount Sinai guide',
            'Time in Dahab on the coast',
            'Entry fees and snacks included',
            'Hotel pickup in Sharm El Sheikh',
          ],
          seo: {
            metaTitle: 'St Catherine’s Monastery and Dahab Day Trip from Sharm',
            metaDescription: 'A day from Sharm El Sheikh: St Catherine’s Monastery at the foot of Mount Sinai with a guide, then time in Dahab, with hotel pickup, entry fees and snacks.',
          },
          images: [PHOTO_B.bellTower],
          imageAlts: [ALT_B.bellTower],
        },
      ],
    },
    {
      slug: 'dahab-blue-hole',
      name: 'Dahab Blue Hole',
      listingPath: '/trips',
      domain: 'dahabbluehole.com',
      city: 'Sharm El Sheikh',
      area: 'Sharm El Sheikh',
      pickupDestination: 'sharm-el-sheikh',
      coordinates: SHARM,
      currency: 'USD',
      slugPrefix: 'dbh-',
      foreignPlaces: /Hurghada|Cairo|Giza|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Saqqara|Sakkara|Memphis|Dahshur|Tiran|Ras Mohamed|Nabq|Catherine/i,
      tagline: 'Blue Hole snorkelling days from Sharm El Sheikh',
      description: 'Dahab Blue Hole sells day trips from Sharm El Sheikh to the Blue Hole north of Dahab, each with entry to the Blue Hole area and snorkelling there: a day with lunch, a camel ride and a canyon visit, and a jeep day through the Coloured Canyon with a quad ride and lunch in a Bedouin tent.\n\nEvery trip collects you from your hotel in Sharm El Sheikh and brings you back. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Blue Hole Dahab Snorkelling Trips from Sharm El Sheikh',
        metaDescription: 'Day trips from Sharm El Sheikh to the Blue Hole in Dahab: snorkelling with lunch and a camel ride, or the Coloured Canyon by jeep with a quad ride, with hotel pickup.',
        keywords: [
          'blue hole dahab',
          'blue hole snorkeling trip',
          'dahab day trip from sharm',
          'coloured canyon and blue hole',
          'blue hole abu galum',
        ],
      },
      theme: { primaryColor: '#0B3E7A', secondaryColor: '#EEF6F7', accentColor: '#A2402A' },
      heroImages: [PHOTO_B.blueHoleAerial, PHOTO_B.desertJeep],
      photoShortfall: 'The two programmes the site sells publish one photo each.',
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793084942/attractions-network/tenant-logos/dahab-blue-hole/monogram.png',
      trips: [
        {
          path: 'blue-hole-snorkelling-day-with-lunch',
          price: PROGRAMMES_B.BLUE_HOLE_DAY,
          title: 'Blue Hole Snorkelling Day in Dahab with Lunch',
          short: 'Nine hours from Sharm El Sheikh: entry to the Blue Hole area and a snorkelling stop there, time in Dahab, a camel ride, a canyon visit and lunch.',
          description: 'A day on the coast north of Sharm El Sheikh. Pickup from your hotel is at eight, and after about an hour on the road the day starts at the Blue Hole, with entry to the Blue Hole area, a snorkelling stop with the snorkelling guide and free time by the water.\n\nThe afternoon is in Dahab, with more snorkelling and lunch at a local restaurant, and the day also includes a camel ride and a canyon visit. A guide travels with you all day, and bottled water is included. Snorkelling masks and fins are not included. Children have their own price.',
          highlights: [
            'Entry to the Blue Hole area',
            'A snorkelling stop at the Blue Hole',
            'Lunch, a camel ride and a canyon visit',
            'Hotel pickup in Sharm El Sheikh',
          ],
          seo: {
            metaTitle: 'Blue Hole Snorkelling Day Trip from Sharm El Sheikh',
            metaDescription: 'Nine hours from Sharm El Sheikh: entry to the Blue Hole area and snorkelling there, then Dahab with lunch, a camel ride and a canyon visit, with hotel pickup.',
          },
          images: [PHOTO_B.blueHoleAerial],
          imageAlts: [ALT_B.blueHoleAerial],
        },
        {
          path: 'coloured-canyon-and-blue-hole-by-jeep',
          price: PROGRAMMES_B.BLUE_HOLE_JEEP,
          title: 'Coloured Canyon and the Blue Hole by Jeep, with a Quad Ride',
          short: 'Ten hours from Sharm El Sheikh: the Coloured Canyon on foot, a jeep safari to Dahab, snorkelling at the Blue Hole, a quad ride and lunch in a Bedouin tent.',
          description: 'Pickup is at eight from the main gate of your hotel in Sharm El Sheikh. After a safety briefing the day opens with a guided walk through the Coloured Canyon, then a jeep safari across the desert to Dahab and a stop for free time and shopping in the town.\n\nAt the Blue Hole there is an hour of snorkelling, with entry to the Blue Hole and Abu Galum protected area in the price, then a quad ride along the sea and the mountains, a camel ride by the water and lunch in a Bedouin tent on the beach. Snorkelling masks and fins are an extra you can add for each guest. The day is about ten hours, with off-road driving and some walking, and children have their own price.',
          highlights: [
            'A guided walk through the Coloured Canyon',
            'Snorkelling at the Blue Hole',
            'A quad ride and a camel ride',
            'Lunch in a Bedouin tent on the beach',
          ],
          seo: {
            metaTitle: 'Coloured Canyon and Blue Hole Jeep Trip with a Quad Ride',
            metaDescription: 'Ten hours from Sharm El Sheikh: the Coloured Canyon, a jeep safari, snorkelling at the Blue Hole, a quad ride and lunch in a Bedouin tent in Dahab.',
          },
          images: [PHOTO_B.desertJeep],
          imageAlts: [ALT_B.desertJeep],
        },
      ],
    },
  ],
};

// ================================================================================================================
// B08C: Coral Reefs Dahab, Marsa Mubarak and Citadel of Saladin.
// ================================================================================================================

const WATER = 'water-activities';

/** Marsa Alam's own pickup line; the Marsa Alam sites collect from hotels in the town. */
const PICKUP_MARSA = 'Pickup and drop-off at your hotel in Marsa Alam';
/** Where the trip names no departure, the time is settled with the booking. */
const DAY_PICKUP = 'The trip is sold by the day; the team confirms your pickup time when it confirms your booking.';
/** Options whose child price equals the adult one publish no child price at all, so none is claimed. */
const SAME_PRICE = 'Children pay the same price as adults.';
/** Marsa Mubarak's turtles and dugongs are wild: the trips say where to look, never that you will see one. */
const WILD = 'Turtles and dugongs are wild animals, so no boat can promise a sighting.';

export const PROGRAMMES_C = {
  // ---- Coral Reefs Dahab --------------------------------------------------------------------------------------
  CRD_THREE_POOLS: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-dahab-3-pools-camel-ride-red-canyon-lunch-tour',
    category: DAY_TRIPS,
    options: ['dahab-3-pools-camel-ride-red-canyon-lunch-43fae27c4c65', 'dahab-quad-bike-3-pools-camel-ride-red-canyon-3983acfc665a'],
    // Each snorkel-gear extra is bound to one booking option only, so neither applies to both options sold.
    addons: [],
    departures: ['08:00'],
    // The record types the programme's length as "8 - 9 hours".
    duration: '8 to 9 hours',
    rename: {
      'dahab-3-pools-camel-ride-red-canyon-lunch-43fae27c4c65': {
        name: 'Three Pools, the Red Canyon and a camel ride',
        description: 'The canyon by jeep, the Three Pools, a camel ride and lunch by the sea. No quad ride.',
      },
      'dahab-quad-bike-3-pools-camel-ride-red-canyon-3983acfc665a': {
        name: 'The same day with a quad ride',
        description: 'The same stops, with an ATV quad ride between the mountains of the Red Canyon added.',
      },
    },
    childNote: CHILD_NOTE,
    // The quad line holds only for the option that names it, and the snorkelling line is written as a choice of add-on.
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
        'The quad ride belongs to the option that names it; the other option makes the same stops without it.',
        'Bring your original passport.',
        'The day includes off-road driving and some walking in the canyon; wear comfortable clothes and walking shoes.',
        'Snorkelling depends on the sea, and visibility and access can change with the conditions.',
        'Bring cash for personal spending and for renting equipment in Dahab.',
        'Pickup is from the main gate of your hotel, and the time is confirmed after booking.',
      ],
    },
    // The record's schedule is its transfer legs; the day is written from the stops the record names.
    itinerary: [
      { time: '08:00', title: 'Hotel pickup', duration: '1 hour', description: 'An air-conditioned vehicle collects you from the main gate of your hotel in Sharm El Sheikh for the drive north.' },
      { title: 'Salama Canyon by jeep', description: 'A jeep takes the group into the canyon, with a guide for the walk through it.' },
      { title: 'The Three Pools', duration: '3 hours', description: 'The sheltered water on the Dahab coast: a camel ride, a snorkelling stop and free time, with a quad ride between the mountains of the Red Canyon on the option that includes it.' },
      { title: 'Dahab', duration: '2.5 hours', description: 'Time in the town, with the guide, and lunch at a seaside restaurant.' },
      { title: 'Back to your hotel', duration: '1 hour', description: 'The drive back to Sharm El Sheikh.' },
    ],
  },
  CRD_CANYON_DAY: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-to-dahab-day-trip-colored-canyon-camel-ride-snorkeling',
    category: DAY_TRIPS,
    // The option without the Blue Hole entry. The programme's other option buys that entry and leaves five
    // minutes later, so the two cannot be sold together.
    options: ['dahab-safari-camel-ride-canyon-snorkeling-hik-0de648094c0e'],
    addons: [],
    departures: ['07:30'],
    rename: {
      'dahab-safari-camel-ride-canyon-snorkeling-hik-0de648094c0e': {
        name: 'Dahab day with the canyon and a camel ride',
        description: 'A camel ride, a snorkelling stop at the canyon site, lunch, shopping, a jeep safari and the walk through Salama Coloured Canyon.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: ['Pick up and drop off from hotel.', 'Air - conditioned mini van', 'Guide.', 'Governmental fees and entry for Canyon'],
      exclusions: ['photos & videos ( available to purchase)'],
    },
    add: {
      inclusions: [PICKUP_SHARM, 'An air-conditioned minivan', 'A guide for the day', 'Government fees and the canyon entry'],
      exclusions: ['Photos and videos, which can be bought on the day'],
      needToKnow: [
        'This day does not go to the Blue Hole, and its price does not include the entry there.',
        'Touching marine life is not allowed.',
      ],
    },
    itinerary: [
      { time: '07:30', title: 'Hotel pickup', duration: '105 minutes', description: 'A minivan collects you from your hotel in Sharm El Sheikh for the drive up the coast.' },
      { title: 'Camel ride', duration: '10 minutes', description: 'A camel ride on the Dahab shore.' },
      { title: 'Snorkelling at the canyon site', duration: '40 minutes', description: 'A snorkelling stop with the guide. Snorkel gear is not included.' },
      { title: 'Lunch', duration: '105 minutes', description: 'Lunch at a restaurant by the sea.' },
      { title: 'Dahab', duration: '45 minutes', description: 'Time in the town for the shops.' },
      { title: 'Salama Coloured Canyon', duration: '45 minutes', description: 'A jeep takes the group in, and the walk through the canyon is guided; the government fees and the entry are in the price.' },
      { title: 'Back to your hotel', description: 'The drive back to Sharm El Sheikh.' },
    ],
  },
  CRD_JEEP_SAFARI: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sharm-el-sheikh-day-tour-jeep-safari-colored-canyon-red-sea-snorkeling-camel-ride-atv-dahab',
    category: DAY_TRIPS,
    // The option without the ATV; the programme's other option adds one and leaves five minutes later.
    options: ['salama-canyon-jeep-safari-snorkeling-camel-ri-c6e17d852edf'],
    addons: [],
    departures: ['07:25'],
    rename: {
      'salama-canyon-jeep-safari-snorkeling-camel-ri-c6e17d852edf': {
        name: 'Jeep safari and canyon day, without the quad ride',
        description: 'A jeep drive, Salama Canyon, snorkelling in the Red Sea, a camel ride along the coast and time in Dahab.',
      },
    },
    childNote: CHILD_NOTE,
    // The snorkelling line ranks its own site, and the quad line holds only for the option the trip does not sell.
    omit: {
      inclusions: [
        'Snorkeling from the coast in the best snorkeling place between Dahab and Abu galum',
        'Quad biking along the beach and the desert (double quad) (if option selected)',
      ],
      exclusions: ['Snorkeling Equipment.'],
    },
    add: {
      inclusions: ['Snorkelling from the shore between Dahab and Abu Galum'],
      exclusions: ['Snorkelling equipment'],
      needToKnow: [
        'Snorkelling equipment is required for safety: bring your own or rent it on the spot during the trip.',
        'The day involves a lot of walking, so wear comfortable shoes.',
        'Bring your passport or ID card.',
        'Touching marine life is not allowed.',
      ],
    },
    itinerary: [
      { time: '07:25', title: 'Hotel pickup', duration: '45 minutes', description: 'A coach collects you from your hotel in Sharm El Sheikh.' },
      { title: 'The Red Sea', duration: '30 minutes', description: 'A first stop on the coast.' },
      { title: 'Salama Coloured Canyon', description: 'A guided visit and a walk through the canyon.' },
      { title: 'By jeep to Dahab', duration: '30 minutes', description: 'The jeep drive across the desert.' },
      { title: 'Dahab', description: 'A guided visit to the town, a camel ride along the beach and the desert, lunch in a Bedouin tent on the coast, snorkelling from the shore, and time to walk and shop.' },
      { title: 'Back to your hotel', duration: '45 minutes', description: 'The drive back to Sharm El Sheikh.' },
    ],
  },

  // ---- Marsa Mubarak ------------------------------------------------------------------------------------------
  MM_SAILING: {
    provider: 'eeo',
    tenant: EEO,
    source: 'marsa-alam-luxury-pirates-boat-snorkeling-cruise-with-lunch',
    category: WATER,
    options: ['marsa-alam-pirates-premium-boat-to-turtle-bay-d101de788b0b'],
    // The extras the record publishes are bound to no booking option, so none can be sold with this one.
    addons: [],
    departures: ['09:00', '14:00'],
    // The published times are when the boat sails from Port Ghalib, not when the bus reaches your hotel.
    departureLabels: { '09:00': 'Boat leaves at 09:00', '14:00': 'Boat leaves at 14:00' },
    rename: {
      'marsa-alam-pirates-premium-boat-to-turtle-bay-d101de788b0b': {
        name: 'Sailing boat to Marsa Mubarak and Marsa Shona',
        description: 'The sailing boat from Port Ghalib, two guided snorkelling stops and an open buffet meal on board.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Two daily programs', 'Delicious open buffet lunch/dinner'] },
    add: {
      inclusions: ['An open buffet meal on board'],
      needToKnow: [
        'The time you choose is when the boat leaves Port Ghalib. The shared bus collects you from your hotel roughly ninety minutes earlier, and the exact time depends on where your hotel is.',
        'Be at Port Ghalib Marina thirty minutes before the boat leaves.',
        'Bring a valid ID card or passport.',
        'Touching marine life and plants is not allowed.',
        'Use biodegradable sunscreen to protect the reef.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '50 minutes', description: 'A shared bus collects you from your hotel in Marsa Alam and drives to Port Ghalib Marina.' },
      { title: 'Sailing to Marsa Mubarak', duration: '35 minutes', description: 'The boat leaves the marina and sails up the coast.' },
      { title: 'Marsa Mubarak', duration: '45 minutes', description: 'The first guided snorkelling stop, among the reefs and the fish of the bay.' },
      { title: 'Marsa Shona', duration: '45 minutes', description: 'The second guided snorkelling stop.' },
      { title: 'A meal on board', description: 'An open buffet meal on deck, with fizzy drinks and tea through the day.' },
      { title: 'Back to your hotel', description: 'The boat returns to Port Ghalib Marina and the bus takes you back to your hotel.' },
    ],
  },
  MM_TURTLE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'marsa-alam-marsa-mubarak-turtle-snorkelling-boat-trip',
    category: WATER,
    // The snorkelling option only; the programme's other option adds an intro dive.
    options: ['marsa-mubarak-sea-turtle-trip-with-lunch-and--b9350a52e3cd'],
    addons: [],
    departures: ['09:00'],
    // The record types the option's length as "8. hours".
    duration: '8 hours',
    rename: {
      'marsa-mubarak-sea-turtle-trip-with-lunch-and--b9350a52e3cd': {
        name: 'Boat day at Marsa Mubarak with lunch',
        description: 'The boat from Marsa Alam to Marsa Mubarak, guided snorkelling, the gear and lunch on board.',
      },
    },
    childNote: CHILD_NOTE,
    // The dive line holds only for the option the trip does not sell; the pickup line and the bare
    // "Snorkelling adventure" are stated in the site's words instead.
    omit: { inclusions: ['Pickup and transfer to Marsa Mubarak', 'Snorkelling adventure', 'Optional diving session (if selected)'] },
    add: {
      inclusions: [PICKUP_MARSA, 'Guided snorkelling at Marsa Mubarak'],
      needToKnow: ['Pickup from a hotel in North Marsa Alam costs extra and cannot be booked on this site. Ask the team before you book if your hotel is north of the town.', WILD],
    },
    // The record publishes no schedule; the day is written from its own description and inclusions.
    itinerary: [
      { time: '09:00', title: 'Hotel pickup', description: 'The transfer collects you from your hotel in Marsa Alam and takes you to the boat.' },
      { title: 'Marsa Mubarak', description: 'The boat sails into the bay for the first guided snorkelling session, among the coral reefs and the fish, where you can look for sea turtles and dugongs.' },
      { title: 'Lunch on board', description: 'Lunch and soft drinks on the boat between the snorkelling sessions.' },
      { title: 'More snorkelling', description: 'A second session with the instructors; the mask, fins and life jacket are in the price.' },
      { title: 'Back to your hotel', description: 'The boat returns and the transfer takes you back to your hotel in Marsa Alam.' },
    ],
  },
  MM_DUGONG: {
    provider: 'eeo',
    tenant: EEO,
    source: 'marsa-mubarak-boat-trip-snorkel-with-dugongs-giant-turtles',
    category: WATER,
    options: ['marsa-alam-marsa-mubarak-sea-cow-turtles-snor-79343d11386c'],
    addons: [],
    // The option's one published start is 21:00, which does not fit a snorkelling day, so the trip is sold
    // by the day and the team settles the pickup time with the booking.
    departures: [],
    rename: {
      'marsa-alam-marsa-mubarak-sea-cow-turtles-snor-79343d11386c': {
        name: 'Snorkelling day at Marsa Mubarak and Small Shenwa',
        description: 'Two guided snorkelling stops where you can look for turtles and dugongs, an open buffet meal and time at the marina.',
      },
    },
    childNote: CHILD_NOTE,
    // The guide line carries a word the network never shows, the gear lines point at an extra bound to no
    // booking option, and the meal line reads as a toggle.
    omit: {
      inclusions: [
        'Expert snorkeling guide',
        'Snorkeling gear available - select from add-ons',
        'Open buffet lunch OR dinner (chicken, kofta, fish, salads, soups)',
      ],
      exclusions: ['Snorkeling gear ( purchase as add-on)'],
    },
    add: {
      inclusions: ['A snorkelling guide on board', 'An open buffet lunch or dinner on board: chicken, kofta, fish, salads and soups'],
      exclusions: ['Snorkelling gear'],
      needToKnow: [
        DAY_PICKUP,
        'Snorkelling gear is not included and cannot be added on this site. Bring your own, or ask the team before you book.',
        'Some snorkelling experience helps.',
        WILD,
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '1 hour', description: 'The bus collects you from your hotel in Marsa Alam and drives to the boat.' },
      { title: 'Sailing to Marsa Mubarak', duration: '30 minutes', description: 'The boat leaves for the bay.' },
      { title: 'Marsa Mubarak and Small Shenwa', duration: '2.5 hours', description: 'Two guided snorkelling stops with free time between them, where you can look for turtles and dugongs among the reef fish.' },
      { title: 'A meal on board', description: 'An open buffet lunch or dinner on the boat.' },
      { title: 'Port Ghalib Marina', duration: '45 minutes', description: 'A guided walk around the marina and time for the shops.' },
      { title: 'Back to your hotel', description: 'The bus returns you to your hotel in Marsa Alam.' },
    ],
  },

  // ---- Citadel of Saladin -------------------------------------------------------------------------------------
  COS_CITADEL_SHARED: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-citadel-museum-old-cairo-heritage-tour',
    category: DAY_TRIPS,
    // The shared Citadel tour only; the programme's other options add the museum, Old Cairo and a felucca.
    options: ['cairo-salah-el-din-citadel-guided-tour-1572db6d76c8'],
    addons: [],
    departures: ['08:00'],
    rename: {
      'cairo-salah-el-din-citadel-guided-tour-1572db6d76c8': {
        name: 'Shared guided tour of the Citadel',
        description: 'A shared English-speaking group, the entry ticket to the Citadel and hotel transfers.',
      },
    },
    // The option's child price equals its adult price, so the record publishes no child price at all.
    omit: {
      inclusions: [
        'Professional licensed guide',
        'Shared Tour: Professional English-speaking guide only',
        'Private Tour: Professional guide available in all languages',
        'Entry tickets to selected landmarks',
        'Hotel pickup and drop-off from Cairo or Giza',
        'Visits: Papyrus Gallery, Oils Factory, Bazaar, Cotton Store, Carpet School (upon request)',
      ],
      exclusions: [
        'Lunch – included in VIP Private Tour only, or available as an add-on for Private Tours',
        'Felucca ride on the Nile (VIP option only)',
      ],
    },
    add: {
      inclusions: ['A licensed English-speaking guide', 'The entry ticket to the Citadel', PICKUP_CAIRO],
      exclusions: ['Lunch'],
      needToKnow: [SAME_PRICE],
    },
    // The record publishes no schedule; the morning is written from this option's own description.
    itinerary: [
      { time: '08:00', title: 'Hotel pickup', description: 'An air-conditioned vehicle collects you from your hotel in Cairo or Giza.' },
      { title: 'The Citadel of Salah El Din', description: 'A guided walk through the old fortress with the group, with the entry ticket in the price.' },
      { title: 'The Mosque of Muhammad Ali', description: 'The mosque inside the Citadel walls.' },
      { title: 'The view over Cairo', description: 'The terrace and its view across the city.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  COS_PRIVATE_KHAN: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-saladin-citadel-old-cairo-khan-el-khalili-private-tour',
    category: DAY_TRIPS,
    options: ['cairo-citadel-old-cairo-and-khan-el-khalili-p-5bdaa460be66'],
    addons: [],
    departures: ['09:00'],
    // The option's own name and words carry a claim the network never shows.
    rename: {
      'cairo-citadel-old-cairo-and-khan-el-khalili-p-5bdaa460be66': {
        name: 'Private tour with an Egyptologist guide',
        description: 'Your own Egyptologist guide and vehicle, the entrance fees, a traditional Egyptian lunch and hotel transfers.',
      },
    },
    childNote: CHILD_NOTE,
    // The record lists no pickup line among its inclusions, but its own description promises hotel transfers.
    add: { inclusions: [PICKUP_CAIRO] },
    itinerary: [
      { time: '09:00', title: 'Hotel pickup', duration: '30 minutes', description: 'A private vehicle collects you from your hotel in Cairo or Giza.' },
      { title: 'Salah El Din Citadel', duration: '2 hours', description: 'The fortress and the Alabaster Mosque inside it, with your guide.' },
      { title: 'Lunch', duration: '1 hour', description: 'A traditional Egyptian lunch at a local restaurant.' },
      { title: 'The Hanging Church', duration: '15 minutes', description: 'The first of the old churches in Old Cairo.' },
      { title: 'Abu Serga', duration: '15 minutes', description: 'The church beside it.' },
      { title: 'St Barbara’s Church', duration: '10 minutes', description: 'The last of the churches.' },
      { title: 'Khan El Khalili', duration: '1 hour', description: 'Time in the bazaar and its lanes of shops.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  COS_ISLAMIC_HERITAGE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-islamic-heritage-tour-with-citadel-historic-mosques-khan-el-khalili',
    category: DAY_TRIPS,
    options: ['private-islamic-cairo-tour-with-tickets-lunch-e5b857318c81'],
    addons: [],
    departures: ['08:00', '09:00', '10:00', '11:00', '11:05', '12:00'],
    // The record types the option's length as "6 hour".
    duration: '6 hours',
    rename: {
      'private-islamic-cairo-tour-with-tickets-lunch-e5b857318c81': {
        name: 'Private tour with tickets and lunch',
        description: 'Your own English-speaking guide, private transfers both ways, lunch and all the entrance tickets.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Pick-up services from your hotel & return.'] },
    add: { inclusions: [PICKUP_CAIRO] },
    // The record's schedule carries its transfer legs as stops; the day is written from the places it names.
    itinerary: [
      { title: 'Hotel pickup', duration: '45 minutes', description: 'A private air-conditioned vehicle collects you from your hotel in Cairo or Giza.' },
      { title: 'The Citadel of Salah El Din', description: 'The fortress above the city, where the day begins.' },
      { title: 'Mosque of Muhammad Ali Pasha', duration: '30 minutes', description: 'The mosque inside the Citadel walls.' },
      { title: 'Mosque-Madrassa of Sultan Hassan', description: 'The Mamluk mosque and school below the Citadel.' },
      { title: 'Lunch', description: 'Lunch at a local restaurant.' },
      { title: 'Al-Azhar Mosque', duration: '30 minutes', description: 'The mosque on the edge of the old city, with time of your own.' },
      { title: 'Khan el-Khalili', duration: '30 minutes', description: 'A guided walk through the bazaar, with a shopping stop.' },
      { title: 'Back to your hotel', duration: '45 minutes', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  COS_CIVILISATION_MUSEUM: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-national-museum-citadel-khan-el-khalili-private-tour',
    category: DAY_TRIPS,
    options: ['private-english-tour-with-tickets-transfers-e-030167623c05'],
    addons: [],
    departures: ['07:30', '08:00', '08:30', '09:00', '09:30'],
    rename: {
      'private-english-tour-with-tickets-transfers-e-030167623c05': {
        name: 'Private tour in English with an Egyptologist guide',
        description: 'Your own English-speaking Egyptologist guide, hotel transfers both ways, the entrance tickets and a local lunch.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: ['Hotel pick up and drop-off service'] },
    add: { inclusions: [PICKUP_CAIRO] },
    itinerary: [
      { title: 'Hotel pickup', duration: '45 minutes', description: 'A private air-conditioned vehicle collects you from your hotel in Cairo or Giza.' },
      { title: 'National Museum of Egyptian Civilisation', duration: '2 hours', description: 'The museum in Fustat, with your guide and the entrance ticket in the price.' },
      { title: 'Cairo Citadel', duration: '1 hour', description: 'The fortress of Salah El Din above the city.' },
      { title: 'Lunch', duration: '30 minutes', description: 'Lunch at a local restaurant.' },
      { title: 'Khan el-Khalili', duration: '1 hour', description: 'Time in the bazaar, with a shopping stop.' },
      { title: 'Back to your hotel', duration: '45 minutes', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
} satisfies Record<string, PriceSpec>;

export const PHOTO_C = {
  canyonCamel: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085617/attractions-network/network-b08/coral-reefs-dahab/wpygg5o9iwxlr8lxp9q4.jpg',
  canyonWalls: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085619/attractions-network/network-b08/coral-reefs-dahab/lfsrxdbnyahmgcgfn9zl.jpg',
  layeredRock: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085620/attractions-network/network-b08/coral-reefs-dahab/ipasekbgj3xdatb6lnvs.jpg',
  snorkellerAndSails: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085622/attractions-network/network-b08/marsa-mubarak/vqybfirbk4vtbiqdtv70.jpg',
  turtleOverReef: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085624/attractions-network/network-b08/marsa-mubarak/hua97b4rgydbu8xtuked.jpg',
  turtleInBlue: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085626/attractions-network/network-b08/marsa-mubarak/xaeglheldpkpkqkrjtg7.jpg',
  fortressWalls: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085628/attractions-network/network-b08/citadel-of-saladin/icidwwlnm8ijcmuw8jgh.jpg',
  domesOverRampart: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085630/attractions-network/network-b08/citadel-of-saladin/zv4tt7k7p2vhemvqs1eh.jpg',
  greenDomeCourtyard: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085631/attractions-network/network-b08/citadel-of-saladin/bu5tgoh0qaj2kkb6aygt.jpg',
  seatedStatue: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085633/attractions-network/network-b08/citadel-of-saladin/yvh6dqw7hwddzvnsinmm.jpg',
};

/** Each photo described as it is, not as the trip it illustrates. */
const ALT_C = {
  canyonCamel: 'A rider on a camel in a narrow canyon of smooth red sandstone, with sunlight falling through the gap above',
  canyonWalls: 'Weathered red rock walls above a sandy canyon floor, with a green shrub in the shade and blue sky over the ridge',
  layeredRock: 'A close view of layered red sandstone, worn by the wind into shelves and hollows',
  snorkellerAndSails: 'A snorkeller in a mask at the surface of clear green water, with a tall sailing boat under sail behind',
  turtleOverReef: 'A sea turtle swimming just under the surface above a shallow coral reef',
  turtleInBlue: 'A large sea turtle in deep blue water, with small fish and a reef behind it',
  fortressWalls: 'Round towers and high stone walls of a hilltop fortress, with trees and small red kiosks along the road below',
  domesOverRampart: 'A mosque of pale domes and two slender minarets seen above the battlements of a stone fortress wall',
  greenDomeCourtyard: 'A mosque courtyard ringed by arcades of pointed arches, with a green dome and a minaret above the roofline',
  seatedStatue: 'A large seated pharaoh statue in a museum gallery, with wooden cases and tall windows down the hall',
};

const MARSA_ALAM = { lat: 25.0676, lng: 34.879 };
/** Places the Dahab day-trip site never names: its trips stay between Sharm El Sheikh and Dahab. */
const NOT_DAHAB_COAST = /Hurghada|Cairo|Giza|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Saqqara|Sakkara|Memphis|Dahshur|Tiran|Ras Mohamed|Nabq|Catherine/i;
/** Places the Marsa Mubarak site never names: its trips sail from Port Ghalib, which it does name. */
const NOT_MARSA = /Gouna|Hurghada|Makadi|Sahl|Safaga|Soma Bay|Quseir|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Catherine|Cairo|Giza|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Pyramid|Sphinx/i;
/** Places the Citadel site never names: its trips stay in Cairo's old city and Coptic quarter. */
const NOT_CITADEL = /Hurghada|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Pyramid|Sphinx/i;

export const B08C: NetworkBatch = {
  id: 'b08c',
  sites: [
    {
      slug: 'coral-reefs-dahab',
      name: 'Coral Reefs Dahab',
      listingPath: '/trips',
      domain: 'coralreefsdahab.com',
      city: 'Sharm El Sheikh',
      area: 'Sharm El Sheikh',
      pickupDestination: 'sharm-el-sheikh',
      coordinates: SHARM,
      currency: 'USD',
      slugPrefix: 'crd-',
      foreignPlaces: NOT_DAHAB_COAST,
      tagline: 'Days on the Dahab coast from Sharm El Sheikh',
      description: 'Coral Reefs Dahab sells day trips up the coast from Sharm El Sheikh to Dahab and the desert behind it: the Three Pools, the Red Canyon, Salama Coloured Canyon by jeep, snorkelling from the shore, a camel ride along the sea and lunch in the town or in a Bedouin tent on the beach.\n\nNone of these days goes to the Blue Hole. Every trip collects you from your hotel in Sharm El Sheikh and brings you back. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Dahab Day Trips from Sharm El Sheikh: Canyons and Snorkelling',
        metaDescription: 'Day trips from Sharm El Sheikh to Dahab: the Three Pools, the Red Canyon, Salama Coloured Canyon by jeep, snorkelling and a camel ride, with hotel pickup.',
        keywords: [
          'dahab day trip from sharm el sheikh',
          'three pools dahab',
          'coloured canyon dahab tour',
          'dahab snorkelling day trip',
          'salama canyon jeep safari',
        ],
      },
      theme: { primaryColor: '#0F5C5A', secondaryColor: '#F6F0E6', accentColor: '#C2502F' },
      heroImages: [PHOTO_C.canyonCamel, PHOTO_C.canyonWalls, PHOTO_C.layeredRock],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085677/attractions-network/tenant-logos/coral-reefs-dahab/monogram.png',
      trips: [
        {
          path: 'three-pools-camel-ride-and-red-canyon-day',
          price: PROGRAMMES_C.CRD_THREE_POOLS,
          title: 'Dahab Three Pools, Camel Ride and Red Canyon Day',
          short: 'Eight to nine hours from Sharm El Sheikh: Salama Canyon by jeep, the Three Pools with a camel ride and a snorkelling stop, and lunch by the sea in Dahab.',
          description: 'A day on the coast and in the desert north of Sharm El Sheikh. An air-conditioned vehicle collects you from the main gate of your hotel at eight, and the first stop is Salama Canyon, which a jeep takes you into for a guided walk.\n\nThe day then moves to the Three Pools on the Dahab coast, where there is a camel ride, a snorkelling stop and time by the water, and on into the town for lunch at a seaside restaurant. There are two ways to book it: the day as it stands, or the same day with an ATV quad ride between the mountains of the Red Canyon. The guide, the entry to the Three Pools area and bottled water are in the price; snorkelling equipment is not. Children have their own price.',
          highlights: [
            'Salama Canyon by jeep, with a guided walk',
            'A camel ride and a snorkelling stop at the Three Pools',
            'Lunch at a seaside restaurant in Dahab',
            'A quad ride between the mountains of the Red Canyon on the option that includes it',
          ],
          seo: {
            metaTitle: 'Dahab Three Pools and Red Canyon Day from Sharm El Sheikh',
            metaDescription: 'Eight to nine hours from Sharm El Sheikh: Salama Canyon by jeep, a camel ride and snorkelling at the Three Pools, and lunch by the sea in Dahab.',
          },
          images: [PHOTO_C.canyonCamel],
          imageAlts: [ALT_C.canyonCamel],
        },
        {
          path: 'coloured-canyon-and-snorkelling-day-in-dahab',
          price: PROGRAMMES_C.CRD_CANYON_DAY,
          title: 'Dahab Day Trip: Coloured Canyon, Camel Ride and Snorkelling',
          short: 'Ten and a half hours from Sharm El Sheikh: a camel ride on the Dahab shore, a snorkelling stop, lunch, shopping and the guided walk through Salama Coloured Canyon.',
          description: 'A full day up the coast from Sharm El Sheikh. A minivan collects you from your hotel at half past seven for the drive to Dahab, where the day opens with a camel ride on the shore and a snorkelling stop at the canyon site.\n\nLunch follows at a restaurant by the sea, then time in the town for the shops, and the afternoon ends with a jeep ride into Salama Coloured Canyon and a guided walk through it. The guide, the minivan, lunch, the camel ride, the government fees and the canyon entry are in the price; snorkel gear and drinks at the restaurant are not. This day does not go to the Blue Hole. Children have their own price.',
          highlights: [
            'A camel ride on the Dahab shore',
            'A snorkelling stop at the canyon site',
            'The guided walk through Salama Coloured Canyon',
            'Lunch by the sea and time in the town',
          ],
          seo: {
            metaTitle: 'Dahab Coloured Canyon and Snorkelling Day Trip',
            metaDescription: 'Ten and a half hours from Sharm El Sheikh: a camel ride, a snorkelling stop, lunch and shopping in Dahab, and the guided walk through Salama Coloured Canyon.',
          },
          images: [PHOTO_C.canyonWalls],
          imageAlts: [ALT_C.canyonWalls],
        },
        {
          path: 'jeep-safari-coloured-canyon-and-dahab-day',
          price: PROGRAMMES_C.CRD_JEEP_SAFARI,
          title: 'Jeep Safari, Salama Canyon and Dahab Day from Sharm El Sheikh',
          short: 'Eleven hours from Sharm El Sheikh: Salama Coloured Canyon, a jeep drive to Dahab, snorkelling from the shore, a camel ride and lunch in a Bedouin tent.',
          description: 'A long day in the Sinai desert and on the Dahab coast. A coach collects you from your hotel in Sharm El Sheikh at twenty-five past seven, with a first stop on the Red Sea, and the morning is spent walking through Salama Coloured Canyon with a guide.\n\nA jeep then drives across the desert to Dahab for a guided visit to the town, a camel ride along the beach and the desert, lunch in a Bedouin tent on the coast, snorkelling from the shore between Dahab and Abu Galum, and time to walk and shop. The jeep drive, the minivan transport, the camel ride, lunch and the canyon visit are in the price; snorkelling equipment is not, and it is required, so bring your own or rent it on the spot. This option does not include the quad ride. Children have their own price.',
          highlights: [
            'Salama Coloured Canyon on foot',
            'A jeep drive across the desert to Dahab',
            'Snorkelling from the shore and a camel ride',
            'Lunch in a Bedouin tent on the coast',
          ],
          seo: {
            metaTitle: 'Jeep Safari, Salama Canyon and Dahab Day Trip',
            metaDescription: 'Eleven hours from Sharm El Sheikh: Salama Coloured Canyon, a jeep drive to Dahab, snorkelling from the shore, a camel ride and lunch in a Bedouin tent.',
          },
          images: [PHOTO_C.layeredRock],
          imageAlts: [ALT_C.layeredRock],
        },
      ],
    },
    {
      slug: 'marsa-mubarak',
      name: 'Marsa Mubarak',
      listingPath: '/trips',
      domain: 'marsamubarak.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'mmb-',
      foreignPlaces: NOT_MARSA,
      tagline: 'Snorkelling boat trips to Marsa Mubarak',
      description: 'Marsa Mubarak sells boat days from Marsa Alam to the bay of Marsa Mubarak, north of the town: guided snorkelling among its reefs, where you can look for turtles and dugongs, with Marsa Shona or Small Shenwa as the second stop and a meal on board. Turtles and dugongs are wild animals, so no boat can promise a sighting.\n\nThere is a sailing boat from Port Ghalib with a morning and an afternoon departure, a full day with the gear and lunch included, and a shorter day that ends with a walk around the marina. Every trip collects you from your hotel in Marsa Alam and brings you back. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Marsa Mubarak Snorkelling Boat Trips from Marsa Alam',
        metaDescription: 'Boat days from Marsa Alam to Marsa Mubarak: guided snorkelling among the reefs, a second stop at Marsa Shona or Small Shenwa, a meal on board and hotel pickup.',
        keywords: [
          'marsa mubarak snorkelling',
          'marsa mubarak boat trip',
          'marsa alam snorkelling trip',
          'marsa shona snorkelling',
          'turtle snorkelling marsa alam',
        ],
      },
      theme: { primaryColor: '#1D5B4F', secondaryColor: '#EEF5F0', accentColor: '#B7791F' },
      heroImages: [PHOTO_C.snorkellerAndSails, PHOTO_C.turtleOverReef, PHOTO_C.turtleInBlue],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085680/attractions-network/tenant-logos/marsa-mubarak/monogram.png',
      trips: [
        {
          path: 'sailing-boat-to-marsa-mubarak-and-marsa-shona',
          price: PROGRAMMES_C.MM_SAILING,
          title: 'Sailing Boat to Marsa Mubarak and Marsa Shona with a Meal',
          short: 'Four and a half hours on a sailing boat from Port Ghalib: two guided snorkelling stops of forty-five minutes each, and an open buffet meal on deck.',
          description: 'A sailing boat day from Port Ghalib, with a morning and an afternoon departure. A shared bus collects you from your hotel in Marsa Alam about ninety minutes before the boat leaves, and the sail up the coast to Marsa Mubarak takes about thirty-five minutes.\n\nThere are two guided snorkelling stops of forty-five minutes, at Marsa Mubarak and at Marsa Shona, among the reefs and the fish of the bays. Between and after them there is an open buffet meal on deck, with a fresh juice on arrival and fizzy drinks and tea through the day. Snorkelling gear is not included and can be rented from the marina shops. Children have their own price.',
          highlights: [
            'A sailing boat from Port Ghalib',
            'Two guided snorkelling stops of forty-five minutes',
            'Marsa Mubarak and Marsa Shona',
            'An open buffet meal on deck',
          ],
          seo: {
            metaTitle: 'Marsa Mubarak and Marsa Shona Sailing Boat Snorkelling Trip',
            metaDescription: 'Four and a half hours from Port Ghalib: two guided snorkelling stops at Marsa Mubarak and Marsa Shona, an open buffet meal on deck and hotel pickup in Marsa Alam.',
          },
          images: [PHOTO_C.snorkellerAndSails],
          imageAlts: [ALT_C.snorkellerAndSails],
        },
        {
          path: 'marsa-mubarak-turtle-snorkelling-boat-day',
          price: PROGRAMMES_C.MM_TURTLE,
          title: 'Marsa Mubarak Snorkelling Boat Day with Lunch',
          short: 'Eight hours from Marsa Alam: guided snorkelling at Marsa Mubarak with the mask, fins and life jacket included, and lunch with soft drinks on board.',
          description: 'A full day on the water from Marsa Alam. The transfer collects you from your hotel at nine and takes you to the boat, which sails into the bay of Marsa Mubarak for the first guided snorkelling session among the coral reefs and the fish, where you can look for sea turtles and dugongs.\n\nLunch and soft drinks on board follow, then a second session with the instructors before the boat returns. The transfer, the instructors, the snorkelling equipment, lunch and the national park fees are in the price; tips and personal spending are not. Pickup from a hotel in North Marsa Alam costs extra and cannot be booked here. Children have their own price.',
          highlights: [
            'Guided snorkelling at Marsa Mubarak',
            'Mask, fins and life jacket included',
            'Lunch and soft drinks on board',
            'The national park fees included',
          ],
          seo: {
            metaTitle: 'Marsa Mubarak Snorkelling Boat Day with Lunch',
            metaDescription: 'Eight hours from Marsa Alam: guided snorkelling at Marsa Mubarak with the gear included, lunch and soft drinks on board, and hotel pickup in the town.',
          },
          images: [PHOTO_C.turtleOverReef],
          imageAlts: [ALT_C.turtleOverReef],
        },
        {
          path: 'marsa-mubarak-and-small-shenwa-snorkelling-day',
          price: PROGRAMMES_C.MM_DUGONG,
          title: 'Marsa Mubarak and Small Shenwa Snorkelling Day',
          short: 'Four and a half hours from Marsa Alam: two guided snorkelling stops, an open buffet meal on board and a walk around Port Ghalib Marina.',
          description: 'A boat day on the reefs north of Marsa Alam. The bus collects you from your hotel and drives to the boat, which sails into the bay of Marsa Mubarak in about half an hour.\n\nThere are two guided snorkelling stops, at Marsa Mubarak and Small Shenwa, with free time between them, where you can look for turtles and dugongs among the reef fish, and an open buffet lunch or dinner on board. The day ends with a guided walk of about forty-five minutes around Port Ghalib Marina and time for the shops. The boat fees and permits are in the price; snorkelling gear is not included and cannot be added here, so bring your own or ask the team. The trip is sold by the day and the team confirms your pickup time after booking. Children have their own price.',
          highlights: [
            'Two guided snorkelling stops',
            'Marsa Mubarak and Small Shenwa',
            'An open buffet meal on board',
            'A walk around Port Ghalib Marina',
          ],
          seo: {
            metaTitle: 'Marsa Mubarak and Small Shenwa Snorkelling Day Trip',
            metaDescription: 'Four and a half hours from Marsa Alam: two guided snorkelling stops at Marsa Mubarak and Small Shenwa, a meal on board and a walk around Port Ghalib Marina.',
          },
          images: [PHOTO_C.turtleInBlue],
          imageAlts: [ALT_C.turtleInBlue],
        },
      ],
    },
    {
      slug: 'citadel-of-saladin',
      name: 'Citadel of Saladin',
      listingPath: '/trips',
      domain: 'citadelofsaladin.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'cos-',
      foreignPlaces: NOT_CITADEL,
      tagline: 'Guided trips to the Citadel of Salah El Din',
      description: 'Citadel of Saladin sells guided trips that take in the Citadel of Salah El Din, the medieval fortress above Cairo, and the Mosque of Muhammad Ali inside its walls. A short shared morning visits the Citadel on its own; the longer days go on to the old churches of Coptic Cairo, the mosques of the old city, Khan El Khalili or the National Museum of Egyptian Civilisation.\n\nEvery trip collects you from your hotel in Cairo or Giza and brings you back. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Saladin Citadel Tours from Cairo and Giza Hotels',
        metaDescription: 'Guided trips to the Citadel of Salah El Din and the Mosque of Muhammad Ali, with Coptic Cairo, the old mosques, Khan El Khalili and hotel pickup in Cairo or Giza.',
        keywords: [
          'citadel of saladin tour',
          'salah el din citadel cairo',
          'muhammad ali mosque tour',
          'cairo citadel guided tour',
          'citadel and old cairo day tour',
        ],
      },
      theme: { primaryColor: '#3A4A5C', secondaryColor: '#F3EEE6', accentColor: '#B06A2C' },
      heroImages: [PHOTO_C.fortressWalls, PHOTO_C.domesOverRampart, PHOTO_C.greenDomeCourtyard],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085676/attractions-network/tenant-logos/citadel-of-saladin/monogram.png',
      trips: [
        {
          path: 'shared-guided-tour-of-the-citadel',
          price: PROGRAMMES_C.COS_CITADEL_SHARED,
          title: 'Shared Guided Tour of the Citadel of Salah El Din',
          short: 'Three hours from eight in the morning: the Citadel of Salah El Din and the Mosque of Muhammad Ali with an English-speaking guide, the ticket and hotel transfers.',
          description: 'A short morning at the Citadel. An air-conditioned vehicle collects you from your hotel in Cairo or Giza at eight, and an English-speaking guide takes the group through the medieval fortress of Salah El Din, into the Mosque of Muhammad Ali inside its walls, and out to the terrace with its view across the city.\n\nThe guide, the transport, the entry ticket to the Citadel and bottled water are in the price; lunch, drinks and personal spending are not. The tour is three hours, and children pay the same price as adults.',
          highlights: [
            'The medieval fortress of Salah El Din',
            'The Mosque of Muhammad Ali inside the walls',
            'The view across Cairo',
            'An English-speaking guide and hotel transfers',
          ],
          seo: {
            metaTitle: 'Shared Citadel of Salah El Din Tour from Cairo or Giza',
            metaDescription: 'Three hours with an English-speaking guide: the Citadel of Salah El Din, the Mosque of Muhammad Ali and the view over Cairo, with the ticket and hotel transfers.',
          },
          images: [PHOTO_C.fortressWalls],
          imageAlts: [ALT_C.fortressWalls],
        },
        {
          path: 'citadel-old-cairo-and-khan-el-khalili-private-day',
          price: PROGRAMMES_C.COS_PRIVATE_KHAN,
          title: 'Private Day: Saladin Citadel, Old Cairo and Khan El Khalili',
          short: 'Six hours with a private Egyptologist guide: the Citadel and the Alabaster Mosque, lunch, the churches of Old Cairo and an hour in Khan El Khalili.',
          description: 'A private day across Cairo’s heritage. The vehicle collects you from your hotel in Cairo or Giza at nine, and the first two hours are at the Citadel of Salah El Din, with the Alabaster Mosque inside its walls and your own Egyptologist guide.\n\nA traditional Egyptian lunch follows at a local restaurant, then the old churches of Old Cairo: the Hanging Church, Abu Serga and St Barbara’s. The day ends with an hour in Khan El Khalili among its lanes and shops. The guide, the transport, the entrance fees, the parking fees, lunch and the taxes are in the price; drinks with lunch, tips and personal spending are not. Children have their own price.',
          highlights: [
            'The Citadel and the Alabaster Mosque',
            'The Hanging Church, Abu Serga and St Barbara’s',
            'An hour in Khan El Khalili',
            'A private Egyptologist guide and a traditional lunch',
          ],
          seo: {
            metaTitle: 'Private Citadel, Old Cairo and Khan El Khalili Day Tour',
            metaDescription: 'Six hours with a private Egyptologist guide: the Citadel and the Alabaster Mosque, a traditional lunch, the churches of Old Cairo and an hour in Khan El Khalili.',
          },
          images: [PHOTO_C.domesOverRampart],
          imageAlts: [ALT_C.domesOverRampart],
        },
        {
          path: 'islamic-cairo-mosques-and-citadel-private-day',
          price: PROGRAMMES_C.COS_ISLAMIC_HERITAGE,
          title: 'Private Islamic Cairo Day: Citadel, Historic Mosques and the Bazaar',
          short: 'Six hours with a private guide: the Citadel, the Mosque of Muhammad Ali Pasha, the Sultan Hassan mosque and school, Al-Azhar Mosque and Khan el-Khalili, with lunch.',
          description: 'A private day through the heart of Islamic Cairo, with starts through the morning from eight to noon. A private air-conditioned vehicle collects you from your hotel in Cairo or Giza, and the day begins at the Citadel of Salah El Din and the Mosque of Muhammad Ali Pasha inside it.\n\nIt continues to the Mosque-Madrassa of Sultan Hassan below the fortress, then lunch at a local restaurant, Al-Azhar Mosque with time of your own, and a guided walk through Khan el-Khalili with a shopping stop. The guide, the private transfers, all the entrance fees, lunch, bottled water and the taxes are in the price; drinks with lunch and tips are not. The day is six hours, and children have their own price.',
          highlights: [
            'The Citadel and the Mosque of Muhammad Ali Pasha',
            'The Mosque-Madrassa of Sultan Hassan',
            'Al-Azhar Mosque',
            'A guided walk through Khan el-Khalili, with lunch',
          ],
          seo: {
            metaTitle: 'Private Islamic Cairo Tour: Citadel, Mosques and the Bazaar',
            metaDescription: 'Six hours with a private guide: the Citadel, the Mosque of Muhammad Ali Pasha, Sultan Hassan, Al-Azhar and Khan el-Khalili, with lunch and hotel transfers.',
          },
          images: [PHOTO_C.greenDomeCourtyard],
          imageAlts: [ALT_C.greenDomeCourtyard],
        },
        {
          path: 'civilization-museum-citadel-and-khan-el-khalili',
          price: PROGRAMMES_C.COS_CIVILISATION_MUSEUM,
          title: 'Private Day: Civilisation Museum, the Citadel and Khan el-Khalili',
          short: 'Six hours with a private Egyptologist guide: two hours in the National Museum of Egyptian Civilisation, an hour at the Citadel, lunch and an hour in Khan el-Khalili.',
          description: 'A private day with a guide who speaks English, leaving your hotel in Cairo or Giza at a start you choose between half past seven and half past nine. The morning is two hours in the National Museum of Egyptian Civilisation in Fustat, with the entrance ticket in the price.\n\nThe day goes on to the Cairo Citadel, the fortress of Salah El Din above the city, then lunch at a local restaurant and an hour in Khan el-Khalili with a shopping stop. The private vehicle, the guide, the entrance fees, lunch, bottled water and the taxes are in the price; drinks with lunch and tips are not. The day is six hours, and children have their own price.',
          highlights: [
            'Two hours in the National Museum of Egyptian Civilisation',
            'The Cairo Citadel',
            'An hour in Khan el-Khalili',
            'A private Egyptologist guide and lunch',
          ],
          seo: {
            metaTitle: 'Civilisation Museum, Citadel and Khan el-Khalili Private Tour',
            metaDescription: 'Six hours with a private Egyptologist guide: the National Museum of Egyptian Civilisation, the Cairo Citadel, lunch and an hour in Khan el-Khalili.',
          },
          images: [PHOTO_C.seatedStatue],
          imageAlts: [ALT_C.seatedStatue],
        },
      ],
    },
  ],
};

// ================================================================================================================
// B08D: Egyptian Museum.
// ================================================================================================================

/**
 * Every trip here goes into the Egyptian Museum in Tahrir Square. The client's own words for these options name
 * single exhibits that the museum moves between its halls and the newer museums, so the site describes the museum
 * and what a guided visit covers instead of promising one object.
 */
/** Guests confuse the two museums; every trip says which one it visits. */
const NOT_GEM = 'This trip visits the Egyptian Museum on Tahrir Square in central Cairo, not the Grand Egyptian Museum near the Giza Pyramids.';

const PROGRAMMES_D = {
  EGM_MUSEUM_ONLY: {
    provider: 'eeo',
    tenant: EEO,
    source: 'egyptian-museum-saladin-citadel-coptic-cairo-day-tour',
    category: DAY_TRIPS,
    // The museum on its own; the programme's other options add the Citadel, Old Cairo and the bazaar.
    options: ['egyptian-museum-only-shared-with-ticket-0e6469944ddd'],
    addons: [],
    departures: ['11:00'],
    // The record types the option's length as "3 - 6 hours".
    duration: '3 to 6 hours',
    rename: {
      'egyptian-museum-only-shared-with-ticket-0e6469944ddd': {
        name: 'Shared tour of the Egyptian Museum',
        description: 'A shared English-speaking group, the entry ticket to the museum and hotel transfers. Lunch is not included.',
      },
    },
    // The conditional guide, lunch and felucca lines hold for options the trip does not sell; the ticket and
    // pickup lines are stated in the site's words, with the area the copied line loses.
    omit: {
      inclusions: [
        'Licensed guide',
        'Shared Tour: Professional English-speaking guide only',
        'Private Tour: Professional guide available in all languages',
        'Entry tickets to selected landmarks',
        'Hotel pick-up and drop-off from Cairo or Giza',
        'Visits: Papyrus Gallery, Oils Factory, Bazaar, Cotton Store, Carpet School (upon request)',
        'Lunch (VIP Private Tour only; available as an add-on for private tours)',
        'Felucca ride on the Nile (VIP option only)',
      ],
    },
    add: {
      inclusions: ['A licensed English-speaking guide', 'The entry ticket to the Egyptian Museum', PICKUP_CAIRO],
      exclusions: ['Lunch'],
      needToKnow: [NOT_GEM, SAME_PRICE],
    },
    // The record publishes no schedule; the visit is written from this option's own description.
    itinerary: [
      { time: '11:00', title: 'Hotel pickup', description: 'An air-conditioned vehicle collects you from your hotel in Cairo or Giza.' },
      { title: 'The Egyptian Museum', description: 'A guided visit with the group through the halls of the museum on Tahrir Square, among its statues, its coffins and the finds of ancient Egypt, with the entry ticket in the price.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  EGM_OLD_CAIRO_SHARED: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-private-heritage-tour-museum-citadel-old-cairo',
    category: DAY_TRIPS,
    // The shared museum, Old Cairo and bazaar option; the programme's others are the Citadel alone, a private
    // day and a VIP day.
    options: ['egyptian-museum-old-cairo-khan-el-khalili-sha-acaa5772fa27'],
    // The option carries a long list of extra sites, guides and meals; none is sold here.
    addons: [],
    departures: ['11:00'],
    // The record types the option's length as "3-5 hours".
    duration: '3 to 5 hours',
    rename: {
      'egyptian-museum-old-cairo-khan-el-khalili-sha-acaa5772fa27': {
        name: 'Shared tour of the museum, Old Cairo and the bazaar',
        description: 'A shared English-speaking group, the entry tickets and hotel transfers. Lunch is not included.',
      },
    },
    omit: {
      inclusions: [
        'Professional licensed guide',
        'Shared Tour: Professional English-speaking guide only',
        'Private Tour: Professional guide available in all languages',
        'Entry tickets to selected landmarks',
        'Hotel pickup and drop-off from Cairo or Giza',
        'Visits: Papyrus Gallery, Oils Factory, Bazaar, Cotton Store, Carpet School (upon request)',
      ],
      exclusions: [
        'Lunch – included in VIP Private Tour only, or available as an add-on for Private Tours',
        'Felucca ride on the Nile (VIP option only)',
      ],
    },
    add: {
      inclusions: ['A licensed English-speaking guide', 'The entry tickets to the Egyptian Museum and the churches of Old Cairo', PICKUP_CAIRO],
      exclusions: ['Lunch'],
      // This option alone prices infants at the adult rate as well.
      needToKnow: [NOT_GEM, 'Children and infants pay the same price as adults.'],
    },
    itinerary: [
      { time: '11:00', title: 'Hotel pickup', description: 'An air-conditioned vehicle collects you from your hotel in Cairo or Giza.' },
      { title: 'The Egyptian Museum', description: 'A guided visit through the halls of the museum on Tahrir Square, with the entry ticket in the price.' },
      { title: 'Old Cairo', description: 'The historic churches of the old Christian quarter, around the Fort of Babylon.' },
      { title: 'Khan el-Khalili', description: 'The lanes and shops of the bazaar.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  EGM_PRIVATE_HIGHLIGHTS: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-highlights-egyptian-museum-citadel-old-cairo-guided-tour',
    category: DAY_TRIPS,
    // The private option; of the programme's shared options, two cover less and one carries no price.
    options: ['cairo-private-tour-egyptian-museum-citadel-ol-b9e8cca2c667'],
    addons: [],
    departures: ['08:00'],
    duration: '3 to 6 hours',
    rename: {
      'cairo-private-tour-egyptian-museum-citadel-ol-b9e8cca2c667': {
        name: 'Private tour of the museum, the Citadel and Old Cairo',
        description: 'Your own English-speaking guide, the entry tickets and hotel transfers. Lunch is not included.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        'Licensed guide',
        'Shared Tour: Professional English-speaking guide only',
        'Private Tour: Professional guide available in all languages',
        'Hotel pick-up and drop-off from Cairo or Giza',
        'Visits: Papyrus Gallery, Oils Factory, Bazaar, Cotton Store, Carpet School (upon request)',
        'Lunch (VIP Private Tour only; available as an add-on for private tours)',
        'Entry tickets to selected landmarks',
        'Felucca ride on the Nile (VIP option only)',
      ],
    },
    add: {
      inclusions: ['A private licensed English-speaking guide', 'The entry tickets to the Egyptian Museum, the Citadel and the churches of Old Cairo', PICKUP_CAIRO],
      exclusions: ['Lunch'],
      needToKnow: [NOT_GEM],
    },
    itinerary: [
      { time: '08:00', title: 'Hotel pickup', description: 'A private air-conditioned vehicle collects you from your hotel in Cairo or Giza.' },
      { title: 'The Egyptian Museum', description: 'A guided visit through the halls of the museum on Tahrir Square, with the entry ticket in the price.' },
      { title: 'The Citadel', description: 'The fortress of Salah El Din above the city, and the Mosque of Muhammad Ali inside its walls.' },
      { title: 'Old Cairo', description: 'The historic churches of the old Christian quarter.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  EGM_DINNER_CRUISE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'cairo-egyptian-museum-citadel-coptic-cairo-nile-dinner-cruise',
    category: DAY_TRIPS,
    options: ['private-english-tour-with-tickets-lunch-trans-f3df4badf3fe'],
    addons: [],
    departures: ['09:00', '10:00', '11:00'],
    rename: {
      'private-english-tour-with-tickets-lunch-trans-f3df4badf3fe': {
        name: 'Private tour in English with tickets and lunch',
        description: 'Your own guide in English or Arabic, private transfers both ways, the entrance tickets and lunch.',
      },
    },
    childNote: CHILD_NOTE,
    // The option sold is the one with the tickets, so the programme's conditional line is stated plainly; the
    // record lists its shopping stop twice.
    omit: {
      inclusions: [
        'Pick-up services from your hotel & return.',
        'Entrance fees to all the mentioned sites (Only if you choose the option that includes the tickets).',
        'Shopping tours in Cairo.',
      ],
    },
    add: { inclusions: [PICKUP_CAIRO, 'Entrance fees to the sites visited'], needToKnow: [NOT_GEM] },
    // The record's schedule names the cruise boat; the evening is written as the stop it is.
    itinerary: [
      { title: 'Hotel pickup', description: 'A private air-conditioned vehicle collects you from your hotel in Cairo or Giza.' },
      { title: 'The Egyptian Museum', duration: '2 hours', description: 'A guided visit through the halls of the museum on Tahrir Square.' },
      { title: 'Mosque of Muhammad Ali Pasha', duration: '1 hour', description: 'The mosque inside the walls of the Citadel.' },
      { title: 'Lunch', duration: '30 minutes', description: 'Lunch at a local restaurant.' },
      { title: 'The Hanging Church', duration: '15 minutes', description: 'The first of the old churches of Coptic Cairo.' },
      { title: 'Ben Ezra Synagogue', duration: '15 minutes', description: 'In the same quarter.' },
      { title: 'St Barbara’s Church', duration: '15 minutes', description: 'Beside the other churches of the quarter.' },
      { title: 'St Sergius and St Bacchus Church', description: 'The last of the churches.' },
      { title: 'Dinner cruise on the Nile', duration: '2 hours', description: 'A dinner cruise with live entertainment on board.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  EGM_PYRAMIDS: {
    provider: 'eeo',
    tenant: EEO,
    source: 'giza-pyramids-sphinx-egyptian-museum-khan-el-khalili-bazaar-tour',
    category: DAY_TRIPS,
    options: ['day-tour-great-pyramids-and-sphinx-egyptian-m-36b98a6b8806'],
    addons: [],
    departures: ['08:00', '09:00'],
    // The option's own name is a list of typed stops, and its words carry a claim the network never shows.
    rename: {
      'day-tour-great-pyramids-and-sphinx-egyptian-m-36b98a6b8806': {
        name: 'Private day at the Pyramids, the museum and the bazaar',
        description: 'A private day with an Egyptologist guide: the Giza Pyramids and the Sphinx, the Egyptian Museum and Khan El-Khalili, with the entry tickets and lunch.',
      },
    },
    omit: { inclusions: ['Expert Egyptologist Guide', 'mineral Water during the tour', 'Private tour'] },
    add: {
      inclusions: ['A private tour with an Egyptologist guide', 'Bottled water during the tour'],
      needToKnow: [NOT_GEM, SAME_PRICE],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'A private vehicle collects you from your hotel in Cairo or Giza.' },
      { title: 'The Giza Pyramids and the Sphinx', description: 'The pyramids on the plateau and the Sphinx below them, with your guide and the entry tickets in the price.' },
      { title: 'The Egyptian Museum', description: 'A guided visit through the halls of the museum on Tahrir Square, among the finds of ancient Egypt.' },
      { title: 'Lunch', description: 'Lunch at a local restaurant.' },
      { title: 'Khan El-Khalili', description: 'The lanes and shops of the historic bazaar.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
} satisfies Record<string, PriceSpec>;

const PHOTO_D = {
  museumHall: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085635/attractions-network/network-b08/egyptian-museum/ufbwojbi4f7zovbd6za6.jpg',
  lampMarket: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085636/attractions-network/network-b08/egyptian-museum/upf8g1fhghiy9jihxqne.jpg',
  mosqueSkyline: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085638/attractions-network/network-b08/egyptian-museum/xqrhaaoye6bbkayz8vl8.jpg',
  towersAndMinaret: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085640/attractions-network/network-b08/egyptian-museum/s4ielytxcmvdzmcucjqn.jpg',
  domedMosqueAndFlags: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085642/attractions-network/network-b08/egyptian-museum/ujbyb8aj5cxiaqgtiboj.jpg',
};

/** Each photo described as it is, not as the trip it illustrates. */
const ALT_D = {
  museumHall: 'The great hall of a museum seen from a balcony, with rows of stone statues and cases under a high arched roof',
  lampMarket: 'A busy market street of stalls hung with brass lamps and metalware, with shoppers walking between the shops',
  mosqueSkyline: 'Domes and minarets of old stone mosques rising above low rooftops, with the modern city on the skyline behind',
  towersAndMinaret: 'A stone fortress of round towers and crenellated walls, with a tall minaret and an arched gateway',
  domedMosqueAndFlags: 'A large mosque with a central dome, half-domes and two tall minarets against a clear sky, with flags flying beside it',
};

/** Places the Egyptian Museum site never names: its trips stay in Cairo and on the Giza plateau. */
const NOT_EGYPTIAN_MUSEUM = /Hurghada|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur/i;

export const B08D: NetworkBatch = {
  id: 'b08d',
  sites: [
    {
      slug: 'egyptian-museum',
      name: 'Egyptian Museum',
      listingPath: '/trips',
      domain: 'egyptianmuseum.net',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'egm-',
      foreignPlaces: NOT_EGYPTIAN_MUSEUM,
      tagline: 'Guided visits to the Egyptian Museum in Tahrir Square',
      description: 'Egyptian Museum sells guided days that all go into the Egyptian Museum on Tahrir Square, with the entry ticket in the price. It is the museum in central Cairo, not the Grand Egyptian Museum near the Giza Pyramids. The shortest is a shared morning in the museum alone; the longer days add the churches of Old Cairo, the Citadel of Salah El Din, Khan el-Khalili, the Giza Pyramids and the Sphinx, or an evening dinner cruise on the Nile.\n\nEvery trip collects you from your hotel in Cairo or Giza and brings you back. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Egyptian Museum Tours in Cairo with Hotel Pickup',
        metaDescription: 'Guided days at the Egyptian Museum on Tahrir Square, with Old Cairo, the Citadel, Khan el-Khalili, the Giza Pyramids or a Nile dinner cruise, and hotel pickup.',
        keywords: [
          'egyptian museum tour',
          'egyptian museum cairo tickets',
          'egyptian museum guided tour',
          'cairo museum and citadel day tour',
          'egyptian museum and pyramids tour',
        ],
      },
      theme: { primaryColor: '#8C3A2B', secondaryColor: '#F5EFE6', accentColor: '#C9A227' },
      heroImages: [PHOTO_D.museumHall, PHOTO_D.towersAndMinaret, PHOTO_D.lampMarket],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085678/attractions-network/tenant-logos/egyptian-museum/monogram.png',
      trips: [
        {
          path: 'shared-guided-tour-of-the-egyptian-museum',
          price: PROGRAMMES_D.EGM_MUSEUM_ONLY,
          title: 'Shared Guided Tour of the Egyptian Museum',
          short: 'A shared English-guided visit to the Egyptian Museum on Tahrir Square, with the entry ticket, an air-conditioned vehicle and hotel transfers from Cairo or Giza.',
          description: 'The museum on its own. An air-conditioned vehicle collects you from your hotel in Cairo or Giza at eleven, and an English-speaking guide takes the group through the halls of the Egyptian Museum on Tahrir Square, among its statues, its coffins and the finds of ancient Egypt.\n\nThe guide, the transport, the entry ticket to the museum and bottled water are in the price. Lunch is not included. Allow three to six hours, and children pay the same price as adults.',
          highlights: [
            'The Egyptian Museum on Tahrir Square',
            'An English-speaking guide',
            'The entry ticket included',
            'Hotel transfers from Cairo or Giza',
          ],
          seo: {
            metaTitle: 'Shared Egyptian Museum Guided Tour with Ticket',
            metaDescription: 'An English-guided visit to the Egyptian Museum on Tahrir Square, with the entry ticket, an air-conditioned vehicle and hotel transfers from Cairo or Giza.',
          },
          images: [PHOTO_D.museumHall],
          imageAlts: [ALT_D.museumHall],
        },
        {
          path: 'museum-old-cairo-and-khan-el-khalili-shared-day',
          price: PROGRAMMES_D.EGM_OLD_CAIRO_SHARED,
          title: 'Egyptian Museum, Old Cairo and Khan el-Khalili Shared Day',
          short: 'Three to five hours in an English-speaking group: the Egyptian Museum, the historic churches of Old Cairo and the lanes of Khan el-Khalili, with the tickets included.',
          description: 'A shared day across three sides of Cairo. The vehicle collects you from your hotel in Cairo or Giza at eleven, and the day starts with a guided visit to the Egyptian Museum on Tahrir Square.\n\nIt goes on to the historic churches of Old Cairo, around the Fort of Babylon, and ends in the lanes and shops of Khan el-Khalili. The English-speaking guide, the air-conditioned transport, the entry tickets and bottled water are in the price; lunch, drinks, airport transfers and personal spending are not. Allow three to five hours, and children pay the same price as adults.',
          highlights: [
            'A guided visit to the Egyptian Museum',
            'The historic churches of Old Cairo',
            'The lanes and shops of Khan el-Khalili',
            'Entry tickets and hotel transfers included',
          ],
          seo: {
            metaTitle: 'Egyptian Museum, Old Cairo and Khan el-Khalili Shared Tour',
            metaDescription: 'Three to five hours in an English-speaking group: the Egyptian Museum, the churches of Old Cairo and Khan el-Khalili, with the tickets and hotel transfers.',
          },
          images: [PHOTO_D.mosqueSkyline],
          imageAlts: [ALT_D.mosqueSkyline],
        },
        {
          path: 'museum-citadel-and-old-cairo-private-day',
          price: PROGRAMMES_D.EGM_PRIVATE_HIGHLIGHTS,
          title: 'Private Day: Egyptian Museum, the Citadel and Old Cairo',
          short: 'From eight in the morning with your own English-speaking guide: the Egyptian Museum, the Citadel and the Mosque of Muhammad Ali, and the churches of Old Cairo.',
          description: 'A private day through three of Cairo’s landmarks. A private air-conditioned vehicle collects you from your hotel in Cairo or Giza at eight, and your own English-speaking guide takes you through the halls of the Egyptian Museum on Tahrir Square.\n\nThe day goes on to the Citadel of Salah El Din, with the Mosque of Muhammad Ali inside its walls, and ends among the historic churches of Old Cairo. The guide, the transport, the entry tickets and bottled water are in the price; lunch, drinks, airport transfers and personal spending are not. Allow three to six hours, and children have their own price.',
          highlights: [
            'A private English-speaking guide',
            'The Egyptian Museum on Tahrir Square',
            'The Citadel and the Mosque of Muhammad Ali',
            'The historic churches of Old Cairo',
          ],
          seo: {
            metaTitle: 'Private Egyptian Museum, Citadel and Old Cairo Day Tour',
            metaDescription: 'A private day from Cairo or Giza with your own English-speaking guide: the Egyptian Museum, the Citadel and the Mosque of Muhammad Ali, and Old Cairo.',
          },
          images: [PHOTO_D.towersAndMinaret],
          imageAlts: [ALT_D.towersAndMinaret],
        },
        {
          path: 'museum-citadel-coptic-cairo-and-nile-dinner-cruise',
          price: PROGRAMMES_D.EGM_DINNER_CRUISE,
          title: 'Egyptian Museum, the Citadel, Coptic Cairo and a Nile Dinner Cruise',
          short: 'Twelve hours with a private guide: two hours in the Egyptian Museum, the Mosque of Muhammad Ali, the churches of Coptic Cairo, lunch and a dinner cruise on the Nile.',
          description: 'A long private day that ends on the water. A private air-conditioned vehicle collects you from your hotel in Cairo or Giza at nine, ten or eleven, and the first two hours are in the Egyptian Museum on Tahrir Square with your guide, who speaks English or Arabic.\n\nAn hour at the Mosque of Muhammad Ali inside the Citadel walls follows, then lunch at a local restaurant and the old churches of Coptic Cairo: the Hanging Church, the Ben Ezra Synagogue, St Barbara’s Church and the church of St Sergius and St Bacchus. The evening ends with a two-hour dinner cruise on the Nile with live entertainment. The private transfers, the guide, the entrance fees, lunch, the dinner on board, a shopping stop and bottled water are in the price; drinks with the meals and tips are not. The day is twelve hours, and children have their own price.',
          highlights: [
            'Two hours in the Egyptian Museum',
            'The Mosque of Muhammad Ali at the Citadel',
            'The churches and synagogue of Coptic Cairo',
            'A dinner cruise on the Nile with live entertainment',
          ],
          seo: {
            metaTitle: 'Egyptian Museum, Citadel, Coptic Cairo and Nile Dinner Cruise',
            metaDescription: 'Twelve hours with a private guide: the Egyptian Museum, the Mosque of Muhammad Ali, the churches of Coptic Cairo, lunch and a Nile dinner cruise.',
          },
          images: [PHOTO_D.domedMosqueAndFlags],
          imageAlts: [ALT_D.domedMosqueAndFlags],
        },
        {
          path: 'pyramids-sphinx-museum-and-khan-el-khalili-day',
          price: PROGRAMMES_D.EGM_PYRAMIDS,
          title: 'Giza Pyramids, the Sphinx, the Egyptian Museum and the Bazaar',
          short: 'Five hours on a private day: the Giza Pyramids and the Sphinx, a guided visit to the Egyptian Museum, lunch and time in Khan El-Khalili.',
          description: 'A private day across the two sides of ancient Cairo. A private vehicle collects you from your hotel in Cairo or Giza at eight or nine, and the morning is on the Giza plateau: the pyramids and the Sphinx below them, with your Egyptologist guide and the entry tickets in the price.\n\nThe day then crosses the river for a guided visit to the Egyptian Museum on Tahrir Square, among the finds of ancient Egypt, with lunch at a local restaurant and time in the lanes of Khan El-Khalili to finish. The private tour, the guide, the entry tickets, lunch, bottled water and hotel transfers are all included. The day is five hours, and children pay the same price as adults.',
          highlights: [
            'The Giza Pyramids and the Sphinx',
            'A guided visit to the Egyptian Museum',
            'Lunch at a local restaurant',
            'Time in Khan El-Khalili',
          ],
          seo: {
            metaTitle: 'Giza Pyramids, Sphinx, Egyptian Museum and Bazaar Day Tour',
            metaDescription: 'Five hours on a private day from Cairo or Giza: the Giza Pyramids and the Sphinx, a guided visit to the Egyptian Museum, lunch and Khan El-Khalili.',
          },
          images: [PHOTO_D.lampMarket],
          imageAlts: [ALT_D.lampMarket],
        },
      ],
    },
  ],
};
