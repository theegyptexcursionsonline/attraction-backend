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
