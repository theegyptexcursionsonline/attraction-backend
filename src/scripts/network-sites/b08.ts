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
