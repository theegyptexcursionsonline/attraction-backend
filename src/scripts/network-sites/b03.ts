/**
 * Batch B03, group 1 "Giza" (25 October 2026): the three Giza-and-Saqqara domains from Fouad's list. No network
 * operator publishes a Giza programme, so all eleven trips are built on the ones the client publishes on its own
 * main site (`network-sites/eeo-source.ts`); prices, child rates, departures and inclusions are copied from that
 * record at apply time and never typed here.
 *
 * The three sites are kept apart by what they sell, not by their words: Giza Plateau Pyramids sells days that stay
 * on the plateau, Pyramids of Giza Egypt sells full days that carry on into Cairo's museums and the bazaar, and
 * Memphis and Sakkara sells the day south of Giza. No programme is sold on two of them.
 *
 * None of the eleven trips sells an extra: the client publishes add-ons on several of these trips, but not one of
 * them is bound to a booking option, so the published record does not offer them with the options sold.
 *
 * Photos are the client's own trip photos, copied into the network's Cloudinary (`attractions-network/network-b03/`)
 * so the client replacing its own never blanks a network site; each site's own photos are an open question for the
 * client, as are its logo and its contact details.
 */
import type { NetworkBatch, PriceSpec } from '../seed-network-sites';

const EEO = 'egypt-excursions-online';
const CATEGORY = 'day-trips';

/** Said once, where a programme prices children separately. */
const CHILD_NOTE = 'Children have their own price, and the booking applies it. The team confirms which ages count as children when it confirms your booking.';
/** Said where some options sold price children separately and others do not. */
const MIXED_CHILD_NOTE = 'Children have their own price on the options that publish one; on the others they pay the adult price. The team confirms which ages count as children when it confirms your booking.';
const HOTEL_PICKUP = 'Hotel pickup and drop-off in Cairo or Giza';

/** The eight lines the two Saqqara programmes and the Civilization Museum programme publish together. */
const SHARED_GUIDE_LINE = 'Shared Tour: Professional English-speaking guide only';
const PRIVATE_GUIDE_LINE = 'Private Tour: Professional guide available in all languages';
const HOTEL_LINE = 'Hotel pick-up and drop-off from Cairo or Giza';

const PROGRAMMES: Record<string, PriceSpec> = {
  // ---- Giza Plateau Pyramids -------------------------------------------------------------------------------
  GPP_HALF_DAY: {
    provider: 'eeo',
    tenant: EEO,
    source: 'giza-pyramids-great-sphinx-half-day-private-tour',
    category: CATEGORY,
    options: ['a-half-day-expedition-to-giza-pyramids-and-sp-ab664a328c4d'],
    addons: [],
    departures: ['08:00', '09:00'],
    rename: {
      'a-half-day-expedition-to-giza-pyramids-and-sp-ab664a328c4d': {
        name: 'Private half day at the pyramids and the Sphinx',
        description: 'Your own guide and car, with the entry fees.',
      },
    },
    childNote: CHILD_NOTE,
    // The published record promises the hotel pickup in its description ("a smooth, private pickup from your
    // hotel in Cairo or Giza"), not in its list of what is included.
    add: { inclusions: [HOTEL_PICKUP] },
    // The programme's own schedule is a list of pickup areas ("5 pickup location options") rather than a day.
    itinerary: [
      { title: 'Hotel pickup', description: 'The car collects you from your hotel in Cairo or Giza and drives to the plateau.' },
      { title: 'Pyramids of Giza', duration: '4 hours', description: 'A guided walk among the pyramids of Khufu, Khafre and Menkaure, then the Valley Temple of Khafre and the Great Sphinx beside it.' },
      { title: 'Back to your hotel', description: 'The car returns you to your hotel in Cairo or Giza.' },
    ],
  },
  GPP_SUNRISE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'giza-pyramids-sunrise-morning-guided-tour-with-camel-ride-breakfast',
    category: CATEGORY,
    // The private option leaves at other times than the shared one, so the two cannot be sold as one trip.
    options: ['shared-tour-with-giza-pyramids-entry-ticket-4fb577804443'],
    addons: [],
    departures: ['04:30', '08:00'],
    departureLabels: { '04:30': 'Sunrise start', '08:00': 'Morning start' },
    rename: {
      'shared-tour-with-giza-pyramids-entry-ticket-4fb577804443': {
        name: 'Shared tour with the pyramids entry ticket',
        description: 'A shared group, with the camel or horse ride, breakfast and the guided walk.',
      },
    },
    // The option sold is the one with the entry ticket, so the programme's conditional line is replaced.
    omit: { inclusions: ['Entrance fees for Pyramids of Giza complex (if option selected)'] },
    add: {
      inclusions: ['Entrance fees for the Giza pyramids complex'],
      needToKnow: [
        'The vehicle and the guide are shared with other guests.',
        'The published price is the same for adults and for children.',
      ],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'Pickup from your hotel in Cairo or Giza in an air-conditioned vehicle.' },
      { title: 'Camel or horse ride', duration: '1 hour', description: 'An hour on a camel or a horse beside the plateau, with the pyramids in view.' },
      { title: 'Breakfast', description: 'A traditional Egyptian breakfast.' },
      { title: 'Pyramids of Giza', duration: '2 hours', description: 'A guided walk through the pyramids complex and the Sphinx.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  GPP_CAMEL_LUNCH: {
    provider: 'eeo',
    tenant: EEO,
    source: 'vip-giza-pyramids-experience-private-tour-camel-ride-lunch',
    category: CATEGORY,
    options: ['private-tour-entrance-fees-guide-camel-ride-l-21bb4aa76e2d'],
    addons: [],
    departures: [
      '08:00', '08:15', '08:30', '08:45', '09:00', '09:15', '09:30', '09:45', '10:00', '10:15',
      '10:30', '10:45', '11:00', '11:15', '11:30', '12:00', '12:15', '12:30', '12:45',
    ],
    rename: {
      'private-tour-entrance-fees-guide-camel-ride-l-21bb4aa76e2d': {
        name: 'Private tour with the entrance fees, a camel ride and lunch',
        description: 'Your own guide and vehicle for the four hours.',
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
    // The programme publishes no schedule of its own.
    itinerary: [
      { title: 'Hotel pickup', description: 'Pickup from your hotel in Cairo or Giza in a private vehicle.' },
      { title: 'Pyramids of Giza', description: 'A guided walk among the pyramids and the Sphinx with your own English-speaking guide, the entrance fees covered.' },
      { title: 'Camel ride', description: 'A camel ride around the Giza plateau.' },
      { title: 'Lunch', description: 'Lunch at a local restaurant.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  GPP_FELUCCA: {
    provider: 'eeo',
    tenant: EEO,
    source: 'giza-pyramids-tour-with-1-hour-nile-felucca-sail',
    category: CATEGORY,
    options: ['half-day-tour-to-giza-pyramids-1-hour-felucca-5dfa4b0fe4a1'],
    addons: [],
    departures: ['08:00', '09:00', '10:00', '11:00'],
    rename: {
      'half-day-tour-to-giza-pyramids-1-hour-felucca-5dfa4b0fe4a1': {
        name: 'Half day at the pyramids with an hour on the Nile',
        description: 'A private vehicle, the entry fees and a felucca sail.',
      },
    },
    childNote: CHILD_NOTE,
    // The published record promises the hotel pickup in its highlights, not in its list of what is included.
    add: { inclusions: [HOTEL_PICKUP] },
    itinerary: [
      { title: 'Hotel pickup', description: 'Pickup from your hotel in Cairo or Giza in a private air-conditioned vehicle.' },
      { title: 'Pyramids of Giza', duration: '3 hours', description: 'Half an hour each at the Great Pyramid, the pyramid of Khafre, the pyramid of Menkaure and the Sphinx, with the guide on site.' },
      { title: 'The Nile', duration: '1 hour', description: 'An hour on the river aboard a felucca, a wooden sailing boat.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },

  // ---- Pyramids of Giza Egypt ------------------------------------------------------------------------------
  PGE_GEM: {
    provider: 'eeo',
    tenant: EEO,
    source: 'giza-pyramids-sphinx-grand-egyptian-museum-private',
    category: CATEGORY,
    // Only the private option carries the entry tickets; the sharing option publishes "Enter Tickets not included"
    // against a programme whose list of what is included names them, and it leaves at another time.
    options: ['private-pyramids-of-giza-sphinx-gem-included--5a45eefa5360'],
    addons: [],
    departures: ['09:00'],
    departureLabels: { '09:00': 'Morning' },
    rename: {
      'private-pyramids-of-giza-sphinx-gem-included--5a45eefa5360': {
        name: 'Private day with the tickets included',
        description: 'The pyramids, the Sphinx and the Grand Egyptian Museum. Lunch is not included.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        'Pickup and drop-off in Cairo or Giza (long-range pickup also available as an add-on)',
        // The option sold says "Lunch not included", so the programme's line does not describe it.
        'Lunch at a restaurant',
      ],
    },
    add: {
      inclusions: [HOTEL_PICKUP],
      exclusions: ['Lunch'],
      needToKnow: ['Long-range pickup from outside Cairo or Giza is published as a paid extra, which this site does not sell.'],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'Pickup from your hotel in Cairo or Giza in an air-conditioned vehicle.' },
      { title: 'Pyramids of Giza', duration: '3 hours', description: 'A guided walk on the plateau with your own guide.' },
      { title: 'Sphinx', duration: '1 hour', description: 'The Great Sphinx and the ground around it.' },
      { title: 'Break', duration: '1 hour', description: 'A break in Giza. Lunch is not included, so this is the hour to buy your own.' },
      { title: 'Grand Egyptian Museum', duration: '3 hours', description: 'The museum with the guide, and time of your own among the galleries. The entry ticket is included.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  PGE_BAZAAR: {
    provider: 'eeo',
    tenant: EEO,
    source: 'private-pyramids-egyptian-museum-khan-el-khalili-tour',
    category: CATEGORY,
    options: ['cairo-private-pyramids-museum-bazaar-tour-wit-c7719f571208'],
    addons: [],
    departures: ['08:00'],
    departureLabels: { '08:00': 'Morning' },
    rename: {
      'cairo-private-pyramids-museum-bazaar-tour-wit-c7719f571208': {
        name: 'Private day with lunch',
        description: 'The pyramids, the Egyptian Museum of Antiquities and the Khan el-Khalili bazaar.',
      },
    },
    childNote: CHILD_NOTE,
    // The published record promises the hotel transfers in its highlights, not in its list of what is included.
    add: { inclusions: [HOTEL_PICKUP] },
    itinerary: [
      { title: 'Hotel pickup', description: 'Pickup from your hotel in Cairo or Giza in a private air-conditioned vehicle.' },
      { title: 'On the road', duration: '1 hour', description: 'The drive to the plateau.' },
      { title: 'Pyramids of Giza', description: 'A guided walk among the pyramids and the Sphinx.' },
      { title: 'Egyptian Museum of Antiquities', description: 'The museum with the guide.' },
      { title: 'Khan el-Khalili', description: 'The lanes of the bazaar with the guide.' },
      { title: 'Back to your hotel', duration: '1 hour', description: 'The drive back to your hotel in Cairo or Giza.' },
    ],
  },
  PGE_NMEC: {
    provider: 'eeo',
    tenant: EEO,
    source: 'giza-pyramids-sphinx-nmec-museum-historic-citadel',
    category: CATEGORY,
    // The two private days that leave together. The programme publishes a third option with the same stops and
    // the same wording at a higher price, and nothing published says what it adds, so it is not sold here.
    options: [
      'pyramids-civilization-museum-old-cairo-privat-45b02ab180ef',
      'vip-private-pyramid-museum-citadel-old-cairo--12513719cfc9',
    ],
    addons: [],
    departures: ['08:00'],
    departureLabels: { '08:00': 'Morning' },
    rename: {
      'pyramids-civilization-museum-old-cairo-privat-45b02ab180ef': {
        name: 'Private day: the pyramids, the Civilization Museum and Old Cairo',
        description: 'Entry tickets included. Lunch is not included.',
      },
      'vip-private-pyramid-museum-citadel-old-cairo--12513719cfc9': {
        name: 'Private day with the Citadel, lunch and a Nile sail',
        description: 'The pyramids, the Museum of Egyptian Civilization, the Citadel and Old Cairo, ending with a felucca sail.',
      },
    },
    childNote: MIXED_CHILD_NOTE,
    omit: { inclusions: [SHARED_GUIDE_LINE, PRIVATE_GUIDE_LINE, HOTEL_LINE] },
    add: {
      inclusions: ['A private English-speaking guide', HOTEL_PICKUP],
      needToKnow: ['Lunch is included on the longer day, the one with the Citadel and the sail on the Nile. It is not included on the shorter day.'],
    },
    itinerary: [
      { title: 'Hotel pickup', description: 'Pickup from your hotel in Cairo or Giza in an air-conditioned vehicle.' },
      { title: 'National Museum of Egyptian Civilization', duration: '2 hours', description: 'The museum with the guide, and time of your own among the galleries.' },
      { title: 'Pyramids of Giza', description: 'A guided walk on the plateau.' },
      { title: 'Old Cairo', description: 'The churches of Old Cairo with the guide. The longer day adds the Citadel and ends with a felucca sail on the Nile.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },

  // ---- Memphis and Sakkara ---------------------------------------------------------------------------------
  MAS_SHARED: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sakkara-memphis-dahshur-giza-pyramids-day-tour',
    category: CATEGORY,
    options: ['memphis-sakkara-dahshur-shared-with-ticket-d1e880becd96'],
    addons: [],
    departures: ['11:00'],
    departureLabels: { '11:00': 'Late morning' },
    rename: {
      'memphis-sakkara-dahshur-shared-with-ticket-d1e880becd96': {
        name: 'Shared tour with the entry tickets',
        description: 'Dahshur, Sakkara and Memphis. Lunch is not included.',
      },
    },
    omit: { inclusions: [SHARED_GUIDE_LINE, PRIVATE_GUIDE_LINE, HOTEL_LINE] },
    add: {
      inclusions: ['A shared tour with an English-speaking guide', HOTEL_PICKUP],
      exclusions: ['Lunch'],
      needToKnow: ['The published price is the same for adults and for children.'],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '1 hour', description: 'Pickup from your hotel in Cairo or Giza in an air-conditioned vehicle.' },
      { title: 'Dahshur', duration: '1 hour', description: 'The Bent Pyramid and the Red Pyramid, with the guide.' },
      { title: 'Sakkara', duration: '1.5 hours', description: 'The Step Pyramid of Djoser and the tombs around it.' },
      { title: 'Memphis', duration: '1 hour', description: 'The ruins of the old capital and the colossal statue of Ramses II.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  MAS_PRIVATE: {
    provider: 'eeo',
    tenant: EEO,
    source: 'sakkara-memphis-dahshur-giza-pyramids-day-tour',
    category: CATEGORY,
    options: ['sakkara-memphis-dahshur-private-with-ticket-5c570d8fdea6'],
    addons: [],
    departures: ['08:00'],
    departureLabels: { '08:00': 'Morning' },
    rename: {
      'sakkara-memphis-dahshur-private-with-ticket-5c570d8fdea6': {
        name: 'Private tour with the entry tickets',
        description: 'Dahshur, Sakkara and Memphis with your own guide and vehicle. Lunch is not included.',
      },
    },
    childNote: CHILD_NOTE,
    omit: { inclusions: [SHARED_GUIDE_LINE, PRIVATE_GUIDE_LINE, HOTEL_LINE] },
    add: {
      inclusions: ['A private English-speaking guide', HOTEL_PICKUP],
      exclusions: ['Lunch'],
      needToKnow: ['The published record offers lunch on this option only as an extra at checkout, which this site does not sell.'],
    },
    itinerary: [
      { title: 'Hotel pickup', duration: '1 hour', description: 'Pickup from your hotel in Cairo or Giza in a private vehicle.' },
      { title: 'Dahshur', duration: '1 hour', description: 'The Bent Pyramid and the Red Pyramid, with your own guide.' },
      { title: 'Sakkara', duration: '1.5 hours', description: 'The Step Pyramid of Djoser and the tombs around it.' },
      { title: 'Memphis', duration: '1 hour', description: 'The ruins of the old capital and the colossal statue of Ramses II.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
  MAS_WITH_GIZA: {
    provider: 'eeo',
    tenant: EEO,
    source: 'giza-pyramids-sakkara-memphis-day-tour-with-nile-sail',
    category: CATEGORY,
    options: [
      'pyramids-memphis-sakkara-shared-with-ticket-a081911f225b',
      'pyramids-memphis-sakkara-private-with-ticket-7b522c2f779f',
      'pyramids-memphis-sakkara-private-with-ticket-04b1eb4c0c71',
    ],
    addons: [],
    departures: ['08:00'],
    departureLabels: { '08:00': 'Morning' },
    rename: {
      'pyramids-memphis-sakkara-shared-with-ticket-a081911f225b': {
        name: 'Shared tour in English',
        description: 'The Giza pyramids, Memphis and Sakkara with the entry tickets. Lunch is not included.',
      },
      'pyramids-memphis-sakkara-private-with-ticket-7b522c2f779f': {
        name: 'Private tour in English',
        description: 'The same day with your own guide and vehicle. Lunch is not included.',
      },
      'pyramids-memphis-sakkara-private-with-ticket-04b1eb4c0c71': {
        name: 'Private tour in Italian or Spanish',
        description: 'The same day with your own guide, in Italian or in Spanish. Lunch is not included.',
      },
    },
    childNote: MIXED_CHILD_NOTE,
    omit: {
      inclusions: [
        SHARED_GUIDE_LINE,
        PRIVATE_GUIDE_LINE,
        HOTEL_LINE,
        'Lunch — included in VIP Private Tour only, or available as an add-on for Private Tours',
      ],
    },
    add: { inclusions: [HOTEL_PICKUP], exclusions: ['Lunch'] },
    itinerary: [
      { title: 'Hotel pickup', description: 'Pickup from your hotel in Cairo or Giza in an air-conditioned vehicle.' },
      { title: 'On the road', duration: '30 minutes', description: 'The drive to the plateau.' },
      { title: 'Giza plateau', duration: '2 hours', description: 'A guided walk among the pyramids and the Sphinx.' },
      { title: 'Sakkara', duration: '1 hour', description: 'The Step Pyramid of Djoser.' },
      { title: 'Memphis', duration: '1 hour', description: 'The ruins of the old capital and the colossal statue of Ramses II.' },
      { title: 'Back to your hotel', duration: '30 minutes', description: 'The drive back to your hotel in Cairo or Giza.' },
    ],
  },
  MAS_NILE_SAIL: {
    provider: 'eeo',
    tenant: EEO,
    source: 'giza-pyramids-sakkara-memphis-day-tour-with-nile-sail',
    category: CATEGORY,
    options: ['vip-private-pyramids-memphis-sakkara-dahshur--d1af83cd8115'],
    addons: [],
    departures: ['08:00'],
    departureLabels: { '08:00': 'Morning' },
    rename: {
      'vip-private-pyramids-memphis-sakkara-dahshur--d1af83cd8115': {
        name: 'Private day with lunch and a Nile sail',
        description: 'The Giza pyramids, Memphis, Sakkara and Dahshur, ending with a felucca sail.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      inclusions: [
        SHARED_GUIDE_LINE,
        PRIVATE_GUIDE_LINE,
        HOTEL_LINE,
        'Lunch — included in VIP Private Tour only, or available as an add-on for Private Tours',
      ],
    },
    // This option is the one the programme's lunch line names, so lunch is stated plainly instead.
    add: { inclusions: ['A private English-speaking guide', 'Lunch', HOTEL_PICKUP] },
    // The programme's own schedule describes the shorter options, which make no stop at Dahshur and no sail.
    itinerary: [
      { title: 'Hotel pickup', description: 'Pickup from your hotel in Cairo or Giza in a private vehicle.' },
      { title: 'Giza plateau', description: 'A guided walk among the pyramids and the Sphinx.' },
      { title: 'Memphis', description: 'The ruins of the old capital and the colossal statue of Ramses II.' },
      { title: 'Sakkara', description: 'The Step Pyramid of Djoser and the tombs around it.' },
      { title: 'Dahshur', description: 'The Bent Pyramid and the Red Pyramid.' },
      { title: 'Lunch', description: 'Lunch is included on this option.' },
      { title: 'The Nile', description: 'A felucca sail on the river to finish the day.' },
      { title: 'Back to your hotel', description: 'The vehicle returns you to your hotel in Cairo or Giza.' },
    ],
  },
};

const PHOTO = {
  plateauAtLowSun: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792927951/attractions-network/network-b03/giza-plateau-pyramids/ira2tyqp7tp0acwe6ztd.jpg',
  camelAtSunrise: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792927953/attractions-network/network-b03/giza-plateau-pyramids/yoge0wgzwbrw8zhfeels.jpg',
  threePyramids: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792927954/attractions-network/network-b03/giza-plateau-pyramids/cyqhwwakyack600gfghk.jpg',
  felucca: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792927956/attractions-network/network-b03/giza-plateau-pyramids/ppovupzztby04d2o9wqq.jpg',
  pharaohStatue: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792927957/attractions-network/network-b03/pyramids-of-giza-egypt/pb4ohpdfkiik9alomm7s.jpg',
  pyramidsOverDunes: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792927958/attractions-network/network-b03/pyramids-of-giza-egypt/idsqp9obgnragpxbmjpp.jpg',
  sphinxHead: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792927959/attractions-network/network-b03/pyramids-of-giza-egypt/k77qvyvbryzwhgkcmgzu.jpg',
  stepPyramid: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792927961/attractions-network/network-b03/memphis-and-sakkara/m87zl1cmmc4kcv2nrv4o.jpg',
  feluccasAtCairo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792927962/attractions-network/network-b03/memphis-and-sakkara/i7hlesmpg9oel1enka8o.jpg',
};

const ALT = {
  plateauAtLowSun: 'The Giza plateau at low sun, with the pyramids of Khafre and Menkaure above the temple ruins and the Sphinx between them',
  camelAtSunrise: 'A saddled camel standing between two pyramids, with the sun low in a yellow sky behind it',
  threePyramids: 'The three Giza pyramids under a blue sky with white cloud, the smaller queens’ pyramids and loose blocks in front and rippled sand in the foreground',
  felucca: 'A felucca under a tall white sail carrying passengers on the river, with more feluccas and a moored river boat along the far bank',
  pharaohStatue: 'A dark granite statue of a pharaoh in a striped headcloth with a cobra at the brow, standing beside a pale stone wall with a modern building and palms behind',
  pyramidsOverDunes: 'Three pyramids on the horizon at sunset, seen across rippled sand dunes under a pink and orange sky',
  sphinxHead: 'The head and shoulders of the Great Sphinx in close-up against a blue sky with thin cloud',
  stepPyramid: 'The stepped pyramid at Sakkara rising behind the restored stone walls and doorways of its funerary enclosure, across open sand',
  feluccasAtCairo: 'Two feluccas under white sails on the river, with the Cairo waterfront, a tall latticed tower and palms behind',
};

/** Cairo is the network destination these trips are filed under and collected from; there is no Giza destination. */
const CAIRO = { lat: 30.0444, lng: 31.2357 };

export const B03A: NetworkBatch = {
  id: 'b03a',
  sites: [
    {
      slug: 'giza-plateau-pyramids',
      name: 'Giza Plateau Pyramids',
      listingPath: '/trips',
      domain: 'gizaplateaupyramids.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'gpp-',
      foreignPlaces: /Hurghada|Sharm|Dahab|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Citadel|Khan el-Khalili/i,
      tagline: 'Guided days on the Giza plateau',
      description: 'Giza Plateau Pyramids sells days on the plateau itself: the pyramids of Khufu, Khafre and Menkaure, the Valley Temple and the Great Sphinx, walked with a guide. Four trips are on offer, a private half day, a sunrise or morning start with a camel ride and breakfast, a private day with a camel ride and lunch, and a half day that ends with an hour under sail on the Nile.\n\nEvery one is collected from your hotel in Cairo or Giza and brought back at the end, and every one carries the entry fees for the plateau. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Giza Plateau Pyramid Tours from Cairo and Giza',
        metaDescription: 'Guided days on the Giza plateau: the three pyramids, the Valley Temple and the Sphinx, with camel rides, breakfast, lunch or a Nile sail, and hotel pickup.',
        keywords: [
          'giza plateau pyramids',
          'giza pyramids guided tour',
          'pyramids and sphinx half day',
          'giza camel ride tour',
          'pyramids tour with hotel pickup',
        ],
      },
      theme: { primaryColor: '#16181D', secondaryColor: '#F3EDE2', accentColor: '#A6802A' },
      heroImages: [PHOTO.plateauAtLowSun, PHOTO.threePyramids, PHOTO.camelAtSunrise],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792928008/attractions-network/tenant-logos/giza-plateau-pyramids/monogram.png',
      trips: [
        {
          path: 'half-day-pyramids-and-sphinx',
          price: PROGRAMMES.GPP_HALF_DAY,
          title: 'Private Half Day at the Pyramids and the Great Sphinx',
          short: 'Four hours on the plateau with a private guide and car: the three pyramids, the Valley Temple and the Sphinx, with the entry fees.',
          description: 'The car collects you from your hotel in Cairo or Giza and drives straight to the plateau, where a private guide walks you through the pyramids of Khufu, Khafre and Menkaure. The published day is four hours, with a choice of an eight or a nine o’clock start.\n\nFrom the pyramids the walk goes on to the Valley Temple of Khafre and to the Great Sphinx beside it. The guide, the private vehicle, the entry fees and a bottle of water are in the price, and the car is yours alone. Children have their own price.',
          highlights: [
            'Khufu, Khafre and Menkaure with a guide',
            'The Valley Temple and the Great Sphinx',
            'A private car and guide for your group',
            'Entry fees and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Private Half-Day Giza Pyramids and Sphinx Tour',
            metaDescription: 'Four hours on the Giza plateau with a private guide and car: Khufu, Khafre and Menkaure, the Valley Temple and the Sphinx, entry fees and hotel pickup.',
          },
          images: [PHOTO.plateauAtLowSun],
          imageAlts: [ALT.plateauAtLowSun],
        },
        {
          path: 'sunrise-or-morning-camel-ride',
          price: PROGRAMMES.GPP_SUNRISE,
          title: 'Sunrise or Morning at the Pyramids with a Camel Ride and Breakfast',
          short: 'A shared five-hour trip: an hour on a camel or a horse beside the plateau, an Egyptian breakfast and two guided hours among the pyramids.',
          description: 'Two starts are published for this trip: half past four in the morning, for the hour when the sun comes up behind the plateau, and eight o’clock for a later morning. Either way the published day runs five hours.\n\nAn hour on a camel or a horse opens it, with the pyramids in view, and a traditional Egyptian breakfast follows. A guide then takes you through the pyramids complex and the Sphinx for two hours. The entry ticket for the Giza pyramids complex is in the price, along with the air-conditioned transport and the pickup from your hotel. The vehicle and the guide are shared with other guests, and the published price is the same for adults and children.',
          highlights: [
            'A half past four or an eight o’clock start',
            'An hour on a camel or a horse',
            'A traditional Egyptian breakfast',
            'Two guided hours among the pyramids',
          ],
          seo: {
            metaTitle: 'Giza Pyramids Sunrise Tour with Camel Ride and Breakfast',
            metaDescription: 'A five-hour shared trip at the Giza pyramids with a sunrise or morning start, an hour on a camel or horse, breakfast, a guided walk and hotel pickup.',
          },
          images: [PHOTO.camelAtSunrise],
          imageAlts: [ALT.camelAtSunrise],
        },
        {
          path: 'private-day-camel-ride-and-lunch',
          price: PROGRAMMES.GPP_CAMEL_LUNCH,
          title: 'Private Pyramids Day with a Camel Ride and Lunch',
          short: 'Four hours with a private guide and car: the Giza plateau, a camel ride around it, lunch at a local restaurant and the entrance fees.',
          description: 'A private day on the plateau with your own English-speaking guide and vehicle, and a start you pick from a quarter-hourly list that runs from eight in the morning to a quarter to one. The published day is four hours.\n\nA camel ride around the Giza plateau is part of it, and lunch is taken at a local restaurant. The entrance fees are in the price, as is the pickup from your hotel in Cairo or Giza. Children have their own price. Pickup from further out is published as a paid extra, which this site does not sell; ask the team before you book if your hotel is outside the city centre.',
          highlights: [
            'Your own guide and vehicle',
            'A camel ride around the plateau',
            'Lunch at a local restaurant',
            'Entrance fees and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Private Giza Pyramids Tour with Camel Ride and Lunch',
            metaDescription: 'A four-hour private day at the Giza pyramids with your own guide and car, a camel ride around the plateau, lunch and entrance fees, from Cairo or Giza.',
          },
          images: [PHOTO.threePyramids],
          imageAlts: [ALT.threePyramids],
        },
        {
          path: 'pyramids-and-an-hour-on-the-nile',
          price: PROGRAMMES.GPP_FELUCCA,
          title: 'Giza Pyramids and an Hour Under Sail on the Nile',
          short: 'Five hours with a private vehicle: three hours on the plateau with the Great Pyramid, Khafre, Menkaure and the Sphinx, then an hour on a felucca.',
          description: 'The car collects you from your hotel in Cairo or Giza for a start at eight, nine, ten or eleven o’clock. Three hours on the plateau follow, with half an hour each at the Great Pyramid, the pyramid of Khafre, the pyramid of Menkaure and the Sphinx.\n\nThe day finishes with an hour on the Nile aboard a felucca, a wooden sailing boat. Private air-conditioned transfers, the guide on site, the entry fees and bottled water are in the price. The published day is five hours, and children have their own price.',
          highlights: [
            'Three hours on the Giza plateau',
            'The Great Pyramid, Khafre, Menkaure and the Sphinx',
            'An hour on the Nile under sail',
            'Entry fees and private transfers included',
          ],
          seo: {
            metaTitle: 'Giza Pyramids Tour with a One-Hour Nile Felucca Sail',
            metaDescription: 'Five hours from Cairo or Giza: the Great Pyramid, Khafre, Menkaure and the Sphinx with a guide, then an hour on the Nile on a felucca, entry fees included.',
          },
          images: [PHOTO.felucca],
          imageAlts: [ALT.felucca],
        },
      ],
    },
    {
      slug: 'pyramids-of-giza-egypt',
      name: 'Pyramids of Giza Egypt',
      listingPath: '/trips',
      domain: 'pyramidsofgizaegypt.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'pge-',
      foreignPlaces: /Hurghada|Sharm|Dahab|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur/i,
      tagline: 'Full days from the pyramids into Cairo',
      description: 'Pyramids of Giza Egypt sells full days that begin on the plateau and carry on into the city. Three trips are on offer: the pyramids and the Sphinx with the Grand Egyptian Museum, the pyramids with the Egyptian Museum of Antiquities and the Khan el-Khalili bazaar, and the pyramids with the National Museum of Egyptian Civilization and Old Cairo, which also comes as a longer day with the Citadel and a sail on the Nile.\n\nEvery trip is private, is collected from your hotel in Cairo or Giza, and says on its own page what its price covers and what it does not. Hold a place online and pay later.',
      seo: {
        metaTitle: 'Pyramids of Giza and Cairo Museum Day Tours',
        metaDescription: 'Private days from the Giza pyramids into Cairo: the Grand Egyptian Museum, the Egyptian Museum and Khan el-Khalili, or the Civilization Museum and Old Cairo.',
        keywords: [
          'pyramids of giza egypt',
          'giza pyramids and grand egyptian museum',
          'pyramids and egyptian museum tour',
          'khan el-khalili bazaar tour',
          'cairo day tour from giza',
        ],
      },
      theme: { primaryColor: '#1559C7', secondaryColor: '#F7F3EA', accentColor: '#E07A2E' },
      heroImages: [PHOTO.pharaohStatue, PHOTO.pyramidsOverDunes, PHOTO.sphinxHead],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792928010/attractions-network/tenant-logos/pyramids-of-giza-egypt/monogram.png',
      trips: [
        {
          path: 'pyramids-sphinx-and-the-grand-egyptian-museum',
          price: PROGRAMMES.PGE_GEM,
          title: 'The Pyramids, the Sphinx and the Grand Egyptian Museum',
          short: 'A private day from your hotel: three hours on the plateau, an hour at the Sphinx and three hours in the Grand Egyptian Museum, tickets included.',
          description: 'Your own guide and car take the day at your pace, starting at nine. Three hours go to the pyramids of Giza and an hour to the Great Sphinx, with a break in between.\n\nThe rest of the day is given to the Grand Egyptian Museum: three hours with the guide and time of your own among the galleries. The entry tickets for the pyramids, the Sphinx and the museum are in the price, as published. Lunch is not, so the break in the middle of the day is the hour to buy your own. Children have their own price.',
          highlights: [
            'Three hours at the pyramids, an hour at the Sphinx',
            'Three hours in the Grand Egyptian Museum',
            'Entry tickets for all three included',
            'A private guide and car, from your hotel',
          ],
          seo: {
            metaTitle: 'Giza Pyramids and Grand Egyptian Museum Private Tour',
            metaDescription: 'A private day at the Giza pyramids and the Sphinx with three hours in the Grand Egyptian Museum, entry tickets and hotel pickup in Cairo or Giza.',
          },
          images: [PHOTO.pharaohStatue],
          imageAlts: [ALT.pharaohStatue],
        },
        {
          path: 'pyramids-egyptian-museum-and-khan-el-khalili',
          price: PROGRAMMES.PGE_BAZAAR,
          title: 'The Pyramids, the Egyptian Museum and Khan el-Khalili',
          short: 'Eight hours with a private guide and car: the Giza plateau, the Egyptian Museum of Antiquities, the Khan el-Khalili bazaar and lunch.',
          description: 'The published day runs eight hours from an eight o’clock pickup at your hotel in Cairo or Giza, with about an hour in the car at each end.\n\nIt takes in the pyramids of Giza with a guide, the Egyptian Museum of Antiquities and the lanes of the Khan el-Khalili bazaar. The entry fees, the guide on site, lunch, a private air-conditioned vehicle and a bottle of water are in the price. Children have their own price.',
          highlights: [
            'The Giza pyramids with a guide',
            'The Egyptian Museum of Antiquities',
            'The lanes of Khan el-Khalili',
            'Entry fees, lunch and private transfers',
          ],
          seo: {
            metaTitle: 'Private Giza Pyramids, Egyptian Museum and Bazaar Tour',
            metaDescription: 'An eight-hour private day from Cairo or Giza taking in the pyramids, the Egyptian Museum of Antiquities and the Khan el-Khalili bazaar, with lunch.',
          },
          images: [PHOTO.pyramidsOverDunes],
          imageAlts: [ALT.pyramidsOverDunes],
        },
        {
          path: 'pyramids-civilization-museum-and-old-cairo',
          price: PROGRAMMES.PGE_NMEC,
          title: 'The Pyramids, the Civilization Museum and Old Cairo',
          short: 'A private day with the National Museum of Egyptian Civilization, the Giza plateau and Old Cairo, or a longer one with the Citadel and a Nile sail.',
          description: 'Two private days are published under this trip, both leaving at eight. The shorter gives two hours to the National Museum of Egyptian Civilization, then the Giza plateau and the churches of Old Cairo, with the entry tickets included and lunch left out.\n\nThe longer one adds the Citadel and finishes with a sail on the Nile, and its price includes lunch. Both are private, with an English-speaking guide and an air-conditioned vehicle, collected from your hotel in Cairo or Giza. The published record also offers a stop at a papyrus gallery, an oils factory, a bazaar, a cotton store or a carpet school on request.',
          highlights: [
            'The Museum of Egyptian Civilization and the plateau',
            'The churches of Old Cairo',
            'A longer day with the Citadel and a Nile sail',
            'Entry tickets and a private guide',
          ],
          seo: {
            metaTitle: 'Giza Pyramids, Civilization Museum and Old Cairo Tour',
            metaDescription: 'A private day at the Giza pyramids, the National Museum of Egyptian Civilization and Old Cairo, or a longer one with the Citadel and a sail on the Nile.',
          },
          images: [PHOTO.sphinxHead],
          imageAlts: [ALT.sphinxHead],
        },
      ],
    },
    {
      slug: 'memphis-and-sakkara',
      name: 'Memphis and Sakkara',
      listingPath: '/trips',
      domain: 'memphisandsakkara.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'mas-',
      foreignPlaces: /Hurghada|Sharm|Dahab|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum/i,
      tagline: 'Days at Sakkara, Memphis and Dahshur',
      description: 'Memphis and Sakkara sells the day south of Giza: the Step Pyramid of Djoser at Sakkara, the ruins of Memphis with its colossal statue of Ramses II, and the Bent and Red Pyramids at Dahshur. Four trips are on offer, from a shared late-morning run to a private day that takes in the Giza pyramids as well and ends under sail on the Nile.\n\nEvery one carries the entry tickets for the sites it visits and is collected from your hotel in Cairo or Giza. Each page says which stops its own option makes and whether lunch is included. Hold a place online and pay later.',
      seo: {
        metaTitle: 'Sakkara, Memphis and Dahshur Day Tours from Cairo',
        metaDescription: 'Day trips to the Step Pyramid at Sakkara, the ruins of Memphis and the Bent and Red Pyramids at Dahshur, with entry tickets and hotel pickup in Cairo or Giza.',
        keywords: [
          'memphis and sakkara',
          'sakkara step pyramid tour',
          'dahshur bent and red pyramids',
          'memphis egypt day trip',
          'sakkara tour from cairo',
        ],
      },
      theme: { primaryColor: '#A8322A', secondaryColor: '#EFE5D0', accentColor: '#2E4A7D' },
      heroImages: [PHOTO.stepPyramid, PHOTO.feluccasAtCairo],
      photoShortfall: 'The two programmes the site sells publish one photo each.',
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792928009/attractions-network/tenant-logos/memphis-and-sakkara/monogram.png',
      trips: [
        {
          path: 'memphis-sakkara-and-dahshur',
          price: PROGRAMMES.MAS_SHARED,
          title: 'Memphis, Sakkara and Dahshur in One Day',
          short: 'A shared late-morning day to the Bent and Red Pyramids at Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, tickets included.',
          description: 'A shared group leaves at eleven for the three sites south of Giza. Dahshur comes first, an hour among the Bent and the Red Pyramids, then an hour and a half at Sakkara for the Step Pyramid of Djoser and the tombs around it, and an hour at Memphis.\n\nThe guide is English-speaking, the vehicle is air-conditioned, and the entry tickets for the sites are in the price. Lunch is not included. Pickup and drop-off are at your hotel in Cairo or Giza, and the published price is the same for adults and children.',
          highlights: [
            'The Bent and Red Pyramids at Dahshur',
            'The Step Pyramid of Djoser at Sakkara',
            'The ruins of Memphis and its colossal statue',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Memphis, Sakkara and Dahshur Shared Day Tour',
            metaDescription: 'A shared day from Cairo or Giza to the Bent and Red Pyramids at Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, with entry tickets.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: PROGRAMMES.MAS_PRIVATE,
          title: 'Private Day at Sakkara, Memphis and Dahshur',
          short: 'The same three sites with your own guide and vehicle, leaving at eight: Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis.',
          description: 'An eight o’clock start, with a vehicle and a guide for your group alone. The route runs to Dahshur for the Bent and the Red Pyramids, to Sakkara for the Step Pyramid of Djoser and its tombs, and to Memphis for the ruins of the old capital and the colossal statue of Ramses II.\n\nThe entry tickets are in the price; lunch is not, and the published record offers it on this option only as an extra at checkout, which this site does not sell. Pickup and drop-off are at your hotel in Cairo or Giza, and children have their own price.',
          highlights: [
            'A private guide and vehicle for your group',
            'The Bent and Red Pyramids at Dahshur',
            'The Step Pyramid of Djoser at Sakkara',
            'The ruins of Memphis and its colossal statue',
          ],
          seo: {
            metaTitle: 'Private Sakkara, Memphis and Dahshur Day Tour',
            metaDescription: 'A private day from Cairo or Giza to Dahshur, the Step Pyramid at Sakkara and the ruins of Memphis, with entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: PROGRAMMES.MAS_WITH_GIZA,
          title: 'The Giza Pyramids, Sakkara and Memphis in One Day',
          short: 'Two hours on the Giza plateau, an hour at Sakkara and an hour at Memphis, shared or private, with the entry tickets included.',
          description: 'An eight o’clock start, half an hour in the car, then two hours on the Giza plateau with a guide. Sakkara follows for an hour, with the Step Pyramid of Djoser, and Memphis for an hour among the ruins of the old capital.\n\nThree ways to take the day are published: a shared group in English, a private tour in English, and a private tour in Italian or Spanish. All three carry the entry tickets for the sites. Lunch is not included. Pickup and drop-off are at your hotel in Cairo or Giza, and the two private ways have their own child price.',
          highlights: [
            'Two hours on the Giza plateau',
            'The Step Pyramid of Djoser at Sakkara',
            'An hour among the ruins of Memphis',
            'Shared, or private in English, Italian or Spanish',
          ],
          seo: {
            metaTitle: 'Giza Pyramids, Sakkara and Memphis Day Tour',
            metaDescription: 'A day from Cairo or Giza with two hours on the Giza plateau, the Step Pyramid at Sakkara and the ruins of Memphis, shared or private, tickets included.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: PROGRAMMES.MAS_NILE_SAIL,
          title: 'Private Day: the Pyramids, Memphis, Sakkara and Dahshur with a Nile Sail',
          short: 'A private day with lunch that takes in the Giza pyramids, Memphis, Sakkara and Dahshur and finishes with a felucca sail on the Nile.',
          description: 'The longest day this site sells, private from start to finish and leaving at eight. It takes in the Giza pyramids and the Sphinx, the ruins of Memphis with its colossal statue of Ramses II, the Step Pyramid of Djoser at Sakkara and the Bent and Red Pyramids at Dahshur, with an English-speaking guide throughout.\n\nLunch is included on this option, and the day ends with a sail on the Nile aboard a felucca. The entry tickets for the sites are in the price, as is the pickup and drop-off at your hotel in Cairo or Giza. Children have their own price.',
          highlights: [
            'The Giza pyramids, Memphis, Sakkara and Dahshur',
            'Lunch included',
            'A felucca sail on the Nile to finish',
            'A private English-speaking guide',
          ],
          seo: {
            metaTitle: 'Private Pyramids, Memphis, Sakkara and Dahshur Day Tour',
            metaDescription: 'A private day from Cairo or Giza taking in the Giza pyramids, Memphis, Sakkara and Dahshur, with lunch and a felucca sail on the Nile to finish.',
          },
          images: [PHOTO.feluccasAtCairo, PHOTO.stepPyramid],
          imageAlts: [ALT.feluccasAtCairo, ALT.stepPyramid],
        },
      ],
    },
  ],
};
