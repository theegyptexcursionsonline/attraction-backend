/**
 * Fox Marsa Alam catalogue: the ten trips the operator publishes on foxmarsaalam.com.
 *
 * Wording follows the operator's own trip pages, trimmed of superlatives; nothing the
 * operator has not published is added. The operator publishes no prices, departure times
 * or group sizes, so none is set here and each gap is an open decision; a duration appears
 * only on the trips whose page states one. The desert trips borrow their prices, departures
 * and extras from a Desert Fox Safari programme at apply time (`FOX_PROGRAMME_PRICES` in the
 * seed), never from this file. Photos are the operator's own, as embedded on its trip pages (hosted on
 * the operator's image host at 640 px); stock and marketplace images on those pages were
 * left out on review.
 */

interface ItineraryStep {
  time: string;
  title: string;
  description: string;
}

interface EntryWindow {
  label: string;
  startTime: string;
  endTime?: string;
}

export interface FoxTour {
  slug: string;
  /** Short public address on the brand's own site (flat URLs). */
  pathSlug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: 'desert-safari' | 'horse-riding' | 'cultural-tours' | 'day-trips' | 'transfers';
  city: 'Marsa Alam' | 'El Quseir' | 'Luxor';
  /** Only where the operator states one. */
  duration?: string;
  /** Departure times only where the operator publishes them. */
  entryWindows: EntryWindow[];
  hasHotelPickup: boolean;
  pickupNote: string;
  languages: string[];
  highlights: string[];
  itinerary: ItineraryStep[];
  inclusions: string[];
  exclusions: string[];
  whatToBring: string[];
  needToKnow: string[];
  accessibility: string[];
  participantRequirements: string[];
  /** Operator pages this record was built from. Provenance; never rendered. */
  sourceUrls: string[];
  /** The operator's own photos, in display order. */
  sourceImages: string[];
  imageAlts: string[];
  seo: { metaTitle: string; metaDescription: string; keywords: string[] };
  /** Internal-only questions for the operator. Never rendered. */
  openDecisions: string[];
}

const SITE = 'https://foxmarsaalam.com';

/** Image URLs exactly as embedded on the operator's pages (captured 21 October 2026). */
export const FOX_MARSA_ALAM_IMG = {
  logo: `${SITE}/wp-content/uploads/2025/04/cropped-033.png`,
  heroA: 'https://i.ibb.co/DDRtdp0f/1.jpg',
  heroB: 'https://i.ibb.co/jZrB1mTr/DSC-0015.jpg',
  heroC: 'https://i.ibb.co/TxJ9KXy2/c0.jpg',
} as const;

/** The operator states guides in these languages, requested at booking. */
const GUIDE_LANGUAGES = ['English', 'German', 'Russian', 'Italian', 'Czech', 'Polish'];

const PICKUP_AREAS_NOTE =
  'Pickup and drop-off at your hotel in Marsa Alam, Port Ghalib, El Quseir and along the coast between them. The exact pickup time depends on your hotel and is confirmed after you book.';
const DESERT_WEAR = ['Comfortable clothing and closed-toe shoes', 'Sunglasses, a hat and sunscreen', 'A scarf or face covering for the dust'];
const DESERT_SUITABILITY = [
  'Off-road driving can be bumpy: not recommended during pregnancy or for anyone with back problems.',
];
const TIP_AND_PERSONAL = ['Personal expenses and shopping', 'Tips for the guides and drivers'];
const PRICE_DECISION = 'Confirm the price list for this trip (adult, child and infant, and per vehicle where a quad or buggy is shared). No price is published, so the trip launches as enquiry-only.';
const TIME_DECISION = 'Confirm the departure times (morning and sunset slots). None is published, so no time is shown.';
const PROGRAMME_PRICE_DECISION = 'Confirm the price list for this trip (adult, child and infant, and per vehicle where a quad or buggy is shared). Until the operator sends it, the trip sells at the published prices of the Desert Fox Safari programme with the same activities.';
const PROGRAMME_TIME_DECISION = 'Confirm the departure times (morning and sunset slots). Until then the trip offers the departures of the matching Desert Fox Safari programme.';
const PHOTO_DECISION = 'Send the original photo files: the published copies are 640 px and too small for sharp pages.';

export const FOX_MARSA_ALAM_TOURS: FoxTour[] = [
  {
    slug: 'fox-marsa-alam-super-safari',
    pathSlug: 'super-safari',
    title: 'Super Safari: Jeep, Quad, Spider Car, Camel and Bedouin Dinner',
    shortDescription:
      'The full desert evening from Marsa Alam: a 4x4 jeep ride, quad biking and a spider car drive, a Bedouin village and camel ride, then sunset, a BBQ dinner and a Tanura or fire show.',
    description: [
      'This is the most complete desert trip we run. A 4x4 jeep collects you from your hotel and takes you deep into the Eastern Desert behind Marsa Alam.',
      'After a safety briefing you ride a quad bike, then drive a spider car. You visit a traditional Bedouin village, ride a camel and drink Bedouin tea, then watch the sun go down from a viewpoint over the desert.',
      'The evening ends with an open-buffet BBQ dinner under the stars and a Tanura dance or fire show, before the jeep brings you back to your hotel.',
    ].join('\n\n'),
    category: 'desert-safari',
    city: 'Marsa Alam',
    entryWindows: [],
    hasHotelPickup: true,
    pickupNote: PICKUP_AREAS_NOTE,
    languages: GUIDE_LANGUAGES,
    highlights: [
      'A 4x4 jeep ride through the Eastern Desert',
      'Quad biking on desert trails, then a spider car drive',
      'A Bedouin village visit with a camel ride and Bedouin tea',
      'Sunset from a desert viewpoint',
      'Open-buffet BBQ dinner and a Tanura dance or fire show',
    ],
    itinerary: [
      { time: 'Pickup', title: 'Hotel pickup', description: 'A 4x4 jeep collects you from your hotel and heads into the desert.' },
      { time: 'Ride', title: 'Quad and spider car', description: 'A safety briefing, then a quad bike ride followed by a spider car drive.' },
      { time: 'Village', title: 'Bedouin village', description: 'Learn how the Bedouin live, ride a camel and taste Bedouin tea.' },
      { time: 'Sunset', title: 'Sunset and dinner show', description: 'Watch the desert sunset, then sit down to a BBQ dinner and a Tanura or fire show.' },
      { time: 'Return', title: 'Back to your hotel', description: 'The jeep takes you back to your hotel after the show.' },
    ],
    inclusions: [
      'Pickup and drop-off at your hotel',
      'All transfers by 4x4 jeep',
      'Professional tour guide',
      'Quad bike and spider car ride',
      'Bedouin village visit with Bedouin tea',
      'Camel ride',
      'Open-buffet BBQ dinner',
      'Tanura dance or fire show',
      'Soft drinks and bottled water',
      'Service charges and taxes',
    ],
    exclusions: TIP_AND_PERSONAL,
    whatToBring: DESERT_WEAR,
    needToKnow: [
      'Can two people share a quad? Yes. Say so when you book and the team gives you a double quad to share.',
      'Which show will we see? A Tanura dance or a fire show, depending on the evening.',
      'Is there a safety briefing? Yes. You get a briefing and all the equipment you need before the ride.',
      'Which language is the guide? Ask for your language when you book.',
    ],
    accessibility: DESERT_SUITABILITY,
    participantRequirements: ['Quad drivers must be 16 or older. Younger guests can ride as passengers on a double quad.'],
    sourceUrls: [`${SITE}/super-safari/`],
    sourceImages: [
      'https://i.ibb.co/cnxfCT1/1-2.jpg',
      'https://i.ibb.co/FkyyzQB0/2-1.jpg',
      'https://i.ibb.co/knM2SKc/3.jpg',
      'https://i.ibb.co/zVG0RGDQ/3-3.jpg',
      'https://i.ibb.co/9m7rfnkp/3-9.jpg',
      'https://i.ibb.co/84bvx6tg/5-1.jpg',
      'https://i.ibb.co/xt0sBJ7z/5-2.jpg',
      'https://i.ibb.co/B5qQdx2N/5-3.jpg',
    ],
    imageAlts: [
      'Guests riding red quad bikes across the desert near the sea in Marsa Alam',
      'Spider cars driving across the desert behind Marsa Alam',
      'A white 4x4 jeep crossing the desert below the mountains',
      'Guests with Bedouin camels on a Super Safari',
      'A group of guests under an acacia tree in the Eastern Desert',
      'Fire show in the desert camp at night',
      'Open-buffet BBQ dinner at the desert camp',
      'Guests at the BBQ dinner in the desert camp',
    ],
    seo: {
      metaTitle: 'Super Safari Marsa Alam: Jeep, Quad, Camel & BBQ | Fox Marsa Alam',
      metaDescription:
        'Jeep, quad and spider car ride, Bedouin village and camel ride, sunset, BBQ dinner and a Tanura or fire show, with hotel pickup in Marsa Alam.',
      keywords: ['Marsa Alam super safari', 'Marsa Alam quad and jeep', 'Bedouin dinner Marsa Alam', 'Marsa Alam desert safari'],
    },
    openDecisions: [PROGRAMME_PRICE_DECISION, PROGRAMME_TIME_DECISION, 'Confirm the trip length.', PHOTO_DECISION],
  },
  {
    slug: 'fox-marsa-alam-jeep-safari',
    pathSlug: 'jeep-safari',
    title: 'Jeep Safari with Bedouin Village, Camel Ride and BBQ Dinner',
    shortDescription:
      'A classic 4x4 jeep safari from Marsa Alam: a Bedouin village and camel ride, the acacia tree, sunset from a viewpoint, then a BBQ dinner and a Tanura or fire show.',
    description: [
      'A 4x4 jeep collects you from your hotel lobby and takes you into the Eastern Desert, with a photo stop at the acacia tree on the way.',
      'At the Bedouin village you learn about their way of life, taste fresh bread and tea or karkadeh, and ride a camel. From there you climb to a viewpoint to watch the desert sunset.',
      'Under the stars you sit down to an open-buffet BBQ dinner with a Tanura dance or fire show, before the jeep takes you back to your hotel. It is a comfortable, easy-going trip that suits families.',
    ].join('\n\n'),
    category: 'desert-safari',
    city: 'Marsa Alam',
    entryWindows: [],
    hasHotelPickup: true,
    pickupNote: PICKUP_AREAS_NOTE,
    languages: GUIDE_LANGUAGES,
    highlights: [
      'Into the Eastern Desert in a 4x4 jeep',
      'A Bedouin village with fresh bread and tea or karkadeh',
      'A camel ride across the sand',
      'Photo stop at the acacia tree',
      'Sunset from a desert viewpoint',
      'Open-buffet BBQ dinner and a Tanura dance or fire show',
    ],
    itinerary: [
      { time: 'Pickup', title: 'Hotel pickup', description: 'A 4x4 jeep collects you from your hotel lobby in Marsa Alam.' },
      { time: 'Drive', title: 'Into the desert', description: 'Through the Eastern Desert, with a photo stop at the acacia tree.' },
      { time: 'Village', title: 'Bedouin village and camel ride', description: 'Fresh bread and tea, the Bedouin way of life, and a camel ride.' },
      { time: 'Sunset', title: 'Desert sunset', description: 'Climb to a viewpoint for the sunset over the desert.' },
      { time: 'Evening', title: 'BBQ dinner and show', description: 'An open-buffet BBQ dinner under the stars with a Tanura or fire show.' },
      { time: 'Return', title: 'Back to your hotel', description: 'The jeep takes you back to your hotel.' },
    ],
    inclusions: [
      'Pickup and drop-off at your hotel',
      'Jeep transport in the desert',
      'Professional tour guide',
      'Camel ride',
      'Bedouin tea',
      'Two bottles of mineral water per person',
      'BBQ dinner',
      'Tanura dance or fire show',
      'Service charges and taxes',
    ],
    exclusions: TIP_AND_PERSONAL,
    whatToBring: DESERT_WEAR,
    needToKnow: [
      'Is this trip good for families? Yes. It is a jeep trip with no driving of your own.',
      'Which show will we see? A Tanura dance or a fire show, depending on the evening.',
      'Which language is the guide? Ask for your language when you book.',
    ],
    accessibility: DESERT_SUITABILITY,
    participantRequirements: [],
    sourceUrls: [`${SITE}/%d9%8djeep-safari/`, `${SITE}/abou-us/`],
    sourceImages: [
      'https://i.ibb.co/0jYCK6pQ/DSC-0333.jpg',
      'https://i.ibb.co/KcXzhnHr/DSC-9439.jpg',
      'https://i.ibb.co/p6bLG39C/DSC-0193.jpg',
      'https://i.ibb.co/7JGBbBkh/DSC-9548.jpg',
      'https://i.ibb.co/dH3yfns/DSC-7828.jpg',
    ],
    imageAlts: [
      'A white 4x4 safari jeep on a desert track',
      'A 4x4 jeep parked in the desert behind Marsa Alam',
      'Jeep safari guests under the acacia tree',
      'A camel by the sea at the edge of the desert',
      'A guest standing on the roof of a safari jeep at dusk',
    ],
    seo: {
      metaTitle: 'Jeep Safari Marsa Alam with Camel Ride & BBQ | Fox Marsa Alam',
      metaDescription:
        '4x4 jeep safari from Marsa Alam: Bedouin village, camel ride, acacia tree, desert sunset, BBQ dinner and a Tanura or fire show, with hotel pickup.',
      keywords: ['Marsa Alam jeep safari', 'Bedouin village Marsa Alam', 'Marsa Alam camel ride', 'Marsa Alam desert dinner'],
    },
    openDecisions: [PRICE_DECISION, TIME_DECISION, 'Confirm the trip length.', PHOTO_DECISION],
  },
  {
    slug: 'fox-marsa-alam-buggy-spider',
    pathSlug: 'buggy-spider',
    title: 'Buggy (Spider Car) Desert Ride with Bedouin Village and Camel Ride',
    shortDescription:
      'Drive a spider car across the Marsa Alam desert to the acacia tree and a Bedouin village, with a short camel ride. Morning or sunset, in a double buggy or a family buggy for up to four.',
    description: [
      'After hotel pickup you reach the buggy station for tea, water and a safety briefing. Then you drive a spider car across the sand to an acacia tree, where you rest in a Bedouin tent and take photos.',
      'The ride continues to a Bedouin village. You see how the Bedouin live, taste their bread and tea, and take a short camel ride, then drive back to the station by a different desert route for a last cup of tea before your transfer home.',
      'Choose a morning ride or a sunset ride. The longer sunset ride adds a BBQ dinner and a Tanura or fire show.',
    ].join('\n\n'),
    category: 'desert-safari',
    city: 'Marsa Alam',
    entryWindows: [],
    hasHotelPickup: true,
    pickupNote: PICKUP_AREAS_NOTE,
    languages: GUIDE_LANGUAGES,
    highlights: [
      'Drive your own spider car through the desert',
      'Rest and photos at the acacia tree and a Bedouin tent',
      'A Bedouin village with bread, hibiscus and tea',
      'A short camel ride',
      'Morning or sunset rides, with dinner and a show on the longer ride',
      'Double buggies for two or family buggies for up to four',
    ],
    itinerary: [
      { time: 'Pickup', title: 'Hotel pickup', description: 'A transfer from your hotel to the buggy station.' },
      { time: 'Station', title: 'Briefing and tea', description: 'Tea, mineral water and a safety briefing for the ride.' },
      { time: 'Ride', title: 'To the acacia tree', description: 'Drive to the acacia tree for a rest and photos in a traditional tent.' },
      { time: 'Village', title: 'Bedouin village', description: 'Bread and tea with the Bedouin, and a short camel ride.' },
      { time: 'Return', title: 'Back by another route', description: 'Drive back to the station by a different desert route.' },
      { time: 'Drop-off', title: 'Tea and hotel transfer', description: 'A last cup of tea at the station, then the transfer to your hotel.' },
    ],
    inclusions: [
      'Pickup and drop-off at your hotel',
      'Spider car (buggy)',
      'Professional tour guide',
      'Bedouin tea, hibiscus and mineral water',
      'Short camel ride',
      'Service charges and taxes',
    ],
    exclusions: [...TIP_AND_PERSONAL, 'BBQ dinner and show, unless you choose the ride with dinner'],
    whatToBring: ['Comfortable clothing and closed-toe shoes', 'A hat and sunglasses', 'A scarf or face covering for the dust'],
    needToKnow: [
      'How many people fit in a buggy? The double buggy takes 2 people and the family buggy up to 4.',
      'Morning or sunset? Both run. Choose the ride with the BBQ dinner and show to stay for the evening.',
      'Is the trip insured? The operator states that all its excursions are fully insured.',
    ],
    accessibility: DESERT_SUITABILITY,
    participantRequirements: [],
    sourceUrls: [`${SITE}/buggy-spider/`],
    sourceImages: [
      'https://i.ibb.co/YFqwMzFW/DSC-0294.jpg',
      'https://i.ibb.co/FqCsnWgc/DSC-0244.jpg',
      'https://i.ibb.co/c9PpFYy/DSC-0056-1.jpg',
      'https://i.ibb.co/jZrB1mTr/DSC-0015.jpg',
      'https://i.ibb.co/B5QkngH3/DSC-0035.jpg',
      'https://i.ibb.co/chX5hd48/DSC-1484.jpg',
      'https://i.ibb.co/cKXJJ7mC/DSC-9200.jpg',
    ],
    imageAlts: [
      'A family in a spider car buggy in the desert',
      'Two guests driving a buggy between desert hills',
      'A four-seat family buggy on the sand',
      'A buggy raising dust on a desert track',
      'Two buggies driving towards the camera in the desert',
      'Guests on camels with Bedouin guides',
      'Buggies on a desert track lined with palms',
    ],
    seo: {
      metaTitle: 'Buggy Spider Car Safari Marsa Alam | Fox Marsa Alam',
      metaDescription:
        'Drive a spider car buggy in the Marsa Alam desert to the acacia tree and a Bedouin village with a camel ride. Morning or sunset, double or family buggy.',
      keywords: ['Marsa Alam buggy', 'spider car Marsa Alam', 'Marsa Alam dune buggy', 'family buggy safari'],
    },
    openDecisions: [
      PROGRAMME_PRICE_DECISION,
      PROGRAMME_TIME_DECISION,
      'Confirm the minimum driver age for the buggy. None is published.',
      'Confirm the price of the sunset ride with the BBQ dinner and show.',
      PHOTO_DECISION,
    ],
  },
  {
    slug: 'fox-marsa-alam-quad-sunset-bbq',
    pathSlug: 'quad-sunset-bbq',
    title: 'Sunset Quad Bike Safari with Bedouin Village and BBQ Dinner',
    shortDescription:
      'An afternoon quad ride from Marsa Alam to the acacia tree and a Bedouin village, the desert sunset, then a BBQ dinner with a Tanura dance or fire show.',
    description: [
      'An air-conditioned vehicle collects you from your hotel in the afternoon. At the quad station you get a safety briefing, tea and water, then ride a single or double quad behind your guide to the acacia tree.',
      'Deeper in the desert you visit a Bedouin village, taste freshly baked bread and tea and try a camel ride. Then you find a good spot to watch the sun set over the desert mountains.',
      'Back at the station there is a BBQ dinner and a Tanura dance or fire show before the transfer back to your hotel in the evening.',
    ].join('\n\n'),
    category: 'desert-safari',
    city: 'Marsa Alam',
    duration: 'About 4–5 hours',
    entryWindows: [],
    hasHotelPickup: true,
    pickupNote: PICKUP_AREAS_NOTE,
    languages: GUIDE_LANGUAGES,
    highlights: [
      'A quad ride through desert valleys and dunes',
      'A Bedouin village with bread, tea and a short camel ride',
      'Sunset over the desert mountains',
      'Open-buffet BBQ dinner under the stars',
      'A Tanura dance or a fire show',
    ],
    itinerary: [
      { time: 'Afternoon', title: 'Hotel pickup', description: 'An air-conditioned vehicle collects you from your hotel.' },
      { time: 'Station', title: 'Briefing', description: 'A safety briefing with tea and mineral water at the quad station.' },
      { time: 'Ride', title: 'Quad ride', description: 'Ride to the acacia tree for a rest and photos.' },
      { time: 'Village', title: 'Bedouin village', description: 'Fresh bread, Bedouin tea and a camel ride.' },
      { time: 'Sunset', title: 'Sunset in the desert', description: 'Watch the sun go down over the desert.' },
      { time: 'Evening', title: 'BBQ dinner and show', description: 'Dinner at the station with a Tanura dance or fire show.' },
      { time: 'Return', title: 'Back to your hotel', description: 'The transfer takes you back to your hotel in the evening.' },
    ],
    inclusions: [
      'Pickup and drop-off at your hotel',
      'Transfers by private air-conditioned vehicle',
      'Quad bike ride',
      'Camel ride',
      'BBQ dinner',
      'Tanura dance or fire show',
      'Bedouin tea and mineral water',
      'Service charges and taxes',
    ],
    exclusions: [...TIP_AND_PERSONAL, 'Anything not listed as included'],
    whatToBring: DESERT_WEAR,
    needToKnow: [
      'Can two people share a quad? Yes. Say so when you book and the team gives you a double quad to share.',
      'Which show will we see? A Tanura dance or a fire show, depending on the evening.',
      'Is there a safety briefing? Yes. You get a briefing and all the equipment you need before the ride.',
    ],
    accessibility: DESERT_SUITABILITY,
    participantRequirements: ['Quad drivers must be 16 or older. Younger guests can ride as passengers on a double quad.'],
    sourceUrls: [`${SITE}/quad-sunset-bbq/`],
    sourceImages: [
      'https://i.ibb.co/CrnhZsr/DSC-0206.jpg',
      'https://i.ibb.co/nqL2PhsH/DSC-5409.jpg',
      'https://i.ibb.co/mMKF8y3/DSC-9257.jpg',
      'https://i.ibb.co/vCL3K8B7/DSC-0113.jpg',
      'https://i.ibb.co/zVJ7p3wq/DSC-0392.jpg',
      'https://i.ibb.co/hFdxMCVp/5-1.jpg',
      'https://i.ibb.co/b5rQVhd0/5-5.jpg',
    ],
    imageAlts: [
      'A group of guests cheering on red quad bikes',
      'A quad rider in the desert with the Red Sea behind',
      'Quad riders following the guide across the desert',
      'A quad rider on a desert track',
      'Guests on a camel ride with a Bedouin guide',
      'Fire show at the desert camp after dark',
      'Guests at the open-buffet dinner in the desert camp',
    ],
    seo: {
      metaTitle: 'Sunset Quad Safari Marsa Alam with BBQ Dinner | Fox Marsa Alam',
      metaDescription:
        'Afternoon quad bike ride from Marsa Alam to a Bedouin village, desert sunset, BBQ dinner and a Tanura or fire show, with hotel pickup and transfers.',
      keywords: ['Marsa Alam sunset quad', 'quad safari Marsa Alam', 'quad and BBQ dinner', 'Marsa Alam desert sunset'],
    },
    openDecisions: [PROGRAMME_PRICE_DECISION, "Confirm the afternoon pickup time. Until then the matching programme's afternoon departure is shown.", PHOTO_DECISION],
  },
  {
    slug: 'fox-marsa-alam-desert-atv-adventure',
    pathSlug: 'desert-atv-adventure',
    title: 'Desert Quad Bike Adventure with Bedouin Village and Camel Ride',
    shortDescription:
      'Ride your own quad bike from the station to the acacia tree and on to a real Bedouin village, with bread-making, Bedouin tea and a camel ride.',
    description: [
      'A transfer takes you from your hotel to the quad station for a welcome tea and a safety briefing. Then you ride out across the desert to the acacia tree for photos and a short rest.',
      'The ride continues to a Bedouin village deep in the desert. You watch traditional bread being made, drink Bedouin tea and try a camel ride.',
      'You ride back to the station by a different route, stop for another tea, and transfer back to your hotel.',
    ].join('\n\n'),
    category: 'desert-safari',
    city: 'Marsa Alam',
    duration: 'About 3 hours',
    entryWindows: [],
    hasHotelPickup: true,
    pickupNote: PICKUP_AREAS_NOTE,
    languages: GUIDE_LANGUAGES,
    highlights: [
      'Ride your own quad bike into the desert',
      'Photos at the acacia tree',
      'A real Bedouin village and traditional bread-making',
      'Bedouin tea and a camel ride',
    ],
    itinerary: [
      { time: 'Pickup', title: 'Hotel pickup', description: 'A transfer from your hotel to the quad station.' },
      { time: 'Station', title: 'Welcome and briefing', description: 'Tea, mineral water and a safety briefing.' },
      { time: 'Ride', title: 'To the acacia tree', description: 'Ride to the acacia tree for photos and a short rest.' },
      { time: 'Village', title: 'Bedouin village', description: 'Bread-making, Bedouin tea and a camel ride.' },
      { time: 'Return', title: 'Ride back', description: 'Back to the station by another desert route.' },
      { time: 'Drop-off', title: 'Tea and hotel transfer', description: 'A last tea at the station, then the transfer to your hotel.' },
    ],
    inclusions: [
      'Pickup and drop-off at your hotel',
      'Quad bike ride',
      'Desert guide',
      'Bedouin tea',
      'Mineral water',
      'Short camel ride',
      'Bedouin village visit',
      'Safety helmet',
    ],
    exclusions: [
      ...TIP_AND_PERSONAL,
      'Headscarf and safety goggles, which you can rent or buy',
      'Anything not listed as included',
    ],
    whatToBring: ['Comfortable clothing, ideally long trousers, and closed-toe shoes rather than flip-flops', 'A hat, sunglasses and sunscreen', 'A headscarf against sand and sun'],
    needToKnow: [
      'How old do I have to be to drive? 16. Younger guests can ride as passengers.',
      'Are goggles provided? A helmet is included; a headscarf and goggles can be rented or bought.',
    ],
    accessibility: DESERT_SUITABILITY,
    participantRequirements: ['Quad drivers must be 16 or older. Younger guests can ride as passengers.'],
    sourceUrls: [`${SITE}/desert-atv-adventure/`, `${SITE}/abou-us/`],
    sourceImages: [
      'https://i.ibb.co/TxZFmzxs/DSC-0057.jpg',
      'https://i.ibb.co/Vptm08pJ/DSC-0148.jpg',
      'https://i.ibb.co/xtr6cjCn/DSC-0149-1.jpg',
      'https://i.ibb.co/39Y2ftJd/DSC-5409.jpg',
      'https://i.ibb.co/V0RbSZWm/DSC-0034.jpg',
      'https://i.ibb.co/pjHkxgG9/DSC-0396.jpg',
      'https://i.ibb.co/BH5hFWGd/DSC-9374.jpg',
    ],
    imageAlts: [
      'A rider on a red quad bike in the desert',
      'A quad rider wearing a helmet on the sand',
      'A line of quad bikes on a desert track',
      'A quad rider near the coast in Marsa Alam',
      'Guests cheering on their quad bikes',
      'Guests with Bedouin women baking bread in the village',
      'Quad bikes riding past desert shrubs',
    ],
    seo: {
      metaTitle: 'Desert Quad Bike Adventure Marsa Alam | Fox Marsa Alam',
      metaDescription:
        'Ride your own quad bike in the Marsa Alam desert to the acacia tree and a Bedouin village, with bread-making, Bedouin tea, a camel ride and hotel pickup.',
      keywords: ['Marsa Alam quad bike', 'ATV Marsa Alam', 'quad safari Bedouin village', 'Marsa Alam desert tour'],
    },
    openDecisions: [PROGRAMME_PRICE_DECISION, PROGRAMME_TIME_DECISION, 'Confirm the rental price of goggles and headscarves.', PHOTO_DECISION],
  },
  {
    slug: 'fox-marsa-alam-camel-ride',
    pathSlug: 'camel-ride',
    title: 'Sunset Camel Ride in the Marsa Alam Desert',
    shortDescription:
      'About an hour on a camel along Bedouin trails at sunset, with a Bedouin guide, a photo stop and the ride back as the first stars come out.',
    description: [
      'We collect you from your hotel and take you to the starting point, where you meet your Bedouin guide and a calm, well-trained camel.',
      'You ride out as the sun drops, stop for photos and a short rest, and ride back under the first stars. It is a gentle trip that suits families and first-timers.',
      'Morning rides are also available on request.',
    ].join('\n\n'),
    category: 'desert-safari',
    city: 'Marsa Alam',
    duration: 'About 1 hour of riding',
    entryWindows: [],
    hasHotelPickup: true,
    pickupNote: PICKUP_AREAS_NOTE,
    languages: GUIDE_LANGUAGES,
    highlights: [
      'A camel ride of about an hour at sunset',
      'Photo stop at a scenic desert spot',
      'A Bedouin camel guide',
      'Gentle enough for families and first-timers',
    ],
    itinerary: [
      { time: 'Pickup', title: 'Hotel pickup', description: 'An air-conditioned vehicle collects you from your hotel in Marsa Alam.' },
      { time: 'Start', title: 'Meet your camel', description: 'Meet your Bedouin guide and your camel at the desert starting point.' },
      { time: 'Sunset', title: 'The sunset ride', description: 'Ride into the desert as the sun goes down, with a stop for photos.' },
      { time: 'Dusk', title: 'The ride back', description: 'Ride back to the starting point as the stars come out.' },
      { time: 'Return', title: 'Back to your hotel', description: 'The transfer takes you back to your hotel.' },
    ],
    inclusions: [
      'Pickup and drop-off at your hotel in Marsa Alam',
      'Transfers by private air-conditioned vehicle',
      'Camel ride of about one hour',
      'Bedouin camel guide',
      'Bottled mineral water',
      'Service charges and taxes',
    ],
    exclusions: [...TIP_AND_PERSONAL, 'Anything not listed as included'],
    whatToBring: ['Long trousers for a more comfortable ride', 'Sunglasses, a hat and sunscreen', 'A camera for the sunset'],
    needToKnow: [
      'Can we ride in the morning instead? Yes, morning rides are available on request.',
      'Is it suitable for children? It is a gentle ride that suits most ages and fitness levels.',
    ],
    accessibility: ['Suitable for most ages and fitness levels.'],
    participantRequirements: [],
    sourceUrls: [`${SITE}/camel-ride/`],
    sourceImages: [
      'https://i.ibb.co/XfQVY8LP/DSC-6854.jpg',
      'https://i.ibb.co/B5sXckkv/DSC-0323.jpg',
      'https://i.ibb.co/5hxNcNcs/DSC-0349.jpg',
      'https://i.ibb.co/yFfG39j7/DSC-0111.jpg',
      'https://i.ibb.co/n8Ndz9gw/DSC-9550.jpg',
    ],
    imageAlts: [
      'Guests on camels led by Bedouin guides below a desert hill',
      'Two young riders on camels in the desert',
      'Guests waving from their camels with a Bedouin guide',
      'Two riders on camels by the sea with their guides',
      'A camel with a colourful Bedouin saddle',
    ],
    seo: {
      metaTitle: 'Sunset Camel Ride Marsa Alam | Fox Marsa Alam',
      metaDescription:
        'A sunset camel ride of about an hour in the Marsa Alam desert with a Bedouin guide, photo stops and hotel pickup. Morning rides on request.',
      keywords: ['Marsa Alam camel ride', 'sunset camel ride', 'camel trekking Marsa Alam', 'Bedouin camel guide'],
    },
    openDecisions: [PROGRAMME_PRICE_DECISION, "Confirm the pickup time for sunset and morning rides. Until then the matching programme's afternoon departure is shown.", PHOTO_DECISION],
  },
  {
    slug: 'fox-marsa-alam-horse-ride',
    pathSlug: 'horse-ride',
    title: 'Horse Riding on the Beach and in the Desert',
    shortDescription:
      'Ride a well-trained Arabian horse along the Red Sea shore and into the desert with a guide, for one or two hours, including a sunset ride.',
    description: [
      'A driver collects you from your hotel and takes you to the stables, where you meet your guide and your horse.',
      'Ride along the sandy shore of the Red Sea and out into the quiet of the desert. The ride is led by experienced guides and suits every level, from first-timers to experienced riders, and the sunset ride is the favourite.',
      'Rides last one or two hours, and you are taken back to your hotel afterwards.',
    ].join('\n\n'),
    category: 'horse-riding',
    city: 'Marsa Alam',
    duration: '1 or 2 hours',
    entryWindows: [],
    hasHotelPickup: true,
    pickupNote: PICKUP_AREAS_NOTE,
    languages: GUIDE_LANGUAGES,
    highlights: [
      'Gentle Arabian horses for every level',
      'Riding along the Red Sea shore',
      'Desert trails on golden sand',
      'A professional guide with you throughout',
      'One or two hours, including a sunset ride',
    ],
    itinerary: [
      { time: 'Pickup', title: 'Hotel pickup', description: 'A driver collects you from your hotel in an air-conditioned vehicle.' },
      { time: 'Stables', title: 'Briefing', description: 'Meet your guide and your horse at the stables.' },
      { time: 'Ride', title: 'Beach and desert ride', description: 'A guided ride along the beach and into the desert.' },
      { time: 'Return', title: 'Back to your hotel', description: 'The transfer takes you back to your hotel.' },
    ],
    inclusions: [
      'Pickup and drop-off at your hotel',
      'Transfers by air-conditioned vehicle',
      'Professional riding guide',
      'Horse ride of one or two hours',
      'Riding helmet and safety equipment',
      'Service charges and taxes',
    ],
    exclusions: ['Tips', 'Anything not listed as included'],
    whatToBring: ['Long trousers and closed-toe shoes'],
    needToKnow: [
      'How long is the ride? One or two hours.',
      'Is there a weight limit? A maximum rider weight of 95 kg may apply, for the horses’ welfare.',
      'Is the ride insured? The operator states that all its excursions are fully insured.',
    ],
    accessibility: ['Suitable for beginners and experienced riders.'],
    participantRequirements: ['A maximum rider weight of 95 kg may apply.'],
    sourceUrls: [`${SITE}/horse-ride/`],
    sourceImages: [
      'https://i.ibb.co/TxJ9KXy2/c0.jpg',
      'https://i.ibb.co/5W6G6tzf/8b.jpg',
      'https://i.ibb.co/HLwxKwwP/4e.jpg',
      'https://i.ibb.co/yBcHNW4M/bb.jpg',
      'https://i.ibb.co/5Xh8C31P/c8.jpg',
      'https://i.ibb.co/CpWzswzX/f6.jpg',
    ],
    imageAlts: [
      'Riders on horseback along the beach at sunset',
      'A rider on a horse walking through shallow water',
      'Two riders on horses at the water’s edge',
      'Riders on white and grey horses on the beach',
      'Riders on horses in the desert below the mountains',
      'A group of riders on horses by the Red Sea',
    ],
    seo: {
      metaTitle: 'Horse Riding Marsa Alam: Beach & Desert | Fox Marsa Alam',
      metaDescription:
        'Guided horse riding on the beach and in the desert in Marsa Alam, one or two hours, for beginners and experienced riders, with hotel pickup.',
      keywords: ['Marsa Alam horse riding', 'horse ride on the beach', 'sunset horse ride Marsa Alam', 'Arabian horses Red Sea'],
    },
    openDecisions: [PRICE_DECISION, 'Confirm the ride times, including the sunset slot.', 'Confirm the minimum age for riders.', PHOTO_DECISION],
  },
  {
    slug: 'fox-marsa-alam-el-quseir-city-tour',
    pathSlug: 'el-quseir-city-tour',
    title: 'El Quseir City Tour: Ottoman Fort, Old Town and Souk',
    shortDescription:
      'A guided visit to El Quseir, one of the oldest towns on the Red Sea: the Fort of Sultan Selim, the old town, a historic mosque and Coptic church, the harbour and the souk.',
    description: [
      'We drive you from your hotel in Marsa Alam up the coast to El Quseir, an old Red Sea trading port with an Ottoman past.',
      'Your guide starts at the Fort of Sultan Selim, then walks you through the old town to the Sheikh Al-Farran mosque and the town’s Coptic church. You finish along the old harbour with free time in the souk for spices, textiles and handmade goods.',
      'It is a calm cultural day that makes a good change from the beach.',
    ].join('\n\n'),
    category: 'cultural-tours',
    city: 'El Quseir',
    duration: 'About 4 hours',
    entryWindows: [],
    hasHotelPickup: true,
    pickupNote: 'Pickup and drop-off at your hotel in Marsa Alam; the drive up the coast to El Quseir is included.',
    languages: GUIDE_LANGUAGES,
    highlights: [
      'The 16th-century Ottoman Fort of Sultan Selim',
      'The narrow streets of the old town',
      'The Sheikh Al-Farran mosque and the Coptic church',
      'The old harbour',
      'Free time in the souk',
    ],
    itinerary: [
      { time: 'Pickup', title: 'Hotel pickup', description: 'An air-conditioned vehicle collects you from your hotel for the drive to El Quseir.' },
      { time: 'Fort', title: 'Ottoman fort', description: 'The Fort of Sultan Selim and its role in the town’s history.' },
      { time: 'Old town', title: 'Old town and mosque', description: 'The old town’s streets and the historic Sheikh Al-Farran mosque.' },
      { time: 'Church', title: 'Coptic church', description: 'A visit to the town’s Coptic church.' },
      { time: 'Harbour', title: 'Harbour and souk', description: 'A walk along the old harbour, then free time in the souk.' },
      { time: 'Return', title: 'Back to your hotel', description: 'The drive back to your hotel in Marsa Alam.' },
    ],
    inclusions: [
      'Pickup and drop-off at your hotel in Marsa Alam',
      'Transfers by private air-conditioned vehicle',
      'Tour guide',
      'Entrance fee to the Ottoman fort',
      'Bottled mineral water',
      'Service charges and taxes',
    ],
    exclusions: [...TIP_AND_PERSONAL, 'Lunch and drinks at local cafés', 'Anything not listed as included'],
    whatToBring: ['Comfortable walking shoes', 'A hat, sunglasses and sunscreen', 'Some Egyptian pounds for the souk', 'Clothing that covers shoulders and knees for the religious sites'],
    needToKnow: [
      'Which language is the guide? Guides speak English, German, Russian, Italian, Czech and Polish. Ask for yours when you book.',
      'Can I pay by card in the souk? Not everywhere. Bring some Egyptian pounds.',
    ],
    accessibility: ['The tour is on foot through the old town.'],
    participantRequirements: [],
    sourceUrls: [`${SITE}/el-quseir-city-tour/`],
    sourceImages: [
      'https://i.ibb.co/dJHFJ2H3/7f.jpg',
      'https://i.ibb.co/h17snygV/3b.jpg',
      'https://i.ibb.co/sv3FfSc3/6a.jpg',
      'https://i.ibb.co/fVYGh3HJ/6b.jpg',
      'https://i.ibb.co/dsCjr7dR/40.jpg',
      'https://i.ibb.co/WNPrKZDz/caption.jpg',
      'https://i.ibb.co/Qv4QztSR/37.jpg',
    ],
    imageAlts: [
      'Old cannons inside the Ottoman fort in El Quseir',
      'A historic house with a wooden balcony in El Quseir old town',
      'Old houses with wooden balconies in El Quseir',
      'The El Quseir waterfront with a mosque',
      'Fishing boats in the El Quseir harbour',
      'The Coptic church in El Quseir',
      'Old stone buildings in El Quseir',
    ],
    seo: {
      metaTitle: 'El Quseir City Tour from Marsa Alam | Fox Marsa Alam',
      metaDescription:
        'Guided El Quseir tour from Marsa Alam: the Ottoman Fort of Sultan Selim, old town, Sheikh Al-Farran mosque, Coptic church, harbour and souk.',
      keywords: ['El Quseir city tour', 'El Quseir fort', 'Marsa Alam culture trip', 'El Quseir old town'],
    },
    openDecisions: [PRICE_DECISION, 'Confirm the departure time.', PHOTO_DECISION],
  },
  {
    slug: 'fox-marsa-alam-luxor-day-trip',
    pathSlug: 'luxor-day-trip',
    title: 'Luxor Day Trip from Marsa Alam',
    shortDescription:
      'A full day from the Red Sea to Luxor with an Egyptologist: Karnak Temple, the Valley of the Kings, the Temple of Hatshepsut and the Colossi of Memnon, with lunch and a Nile crossing.',
    description: [
      'An early start takes you across the Eastern Desert from Marsa Alam to Luxor, ancient Thebes, with a professional Egyptologist as your guide.',
      'On the East Bank you walk through the Karnak Temple complex. A motorboat takes you across the Nile for lunch at a local restaurant, then the Valley of the Kings, where you go down into several royal tombs, and the terraced Temple of Hatshepsut.',
      'A last stop at the Colossi of Memnon, then the drive back to Marsa Alam, arriving late in the evening.',
    ].join('\n\n'),
    category: 'day-trips',
    city: 'Luxor',
    duration: 'Full day (about 16 hours)',
    entryWindows: [],
    hasHotelPickup: true,
    pickupNote: 'Pickup from your hotel in Marsa Alam very early in the morning (around 4–5 am); the drive to Luxor takes about 4–5 hours each way.',
    languages: GUIDE_LANGUAGES,
    highlights: [
      'Karnak Temple on the East Bank',
      'Royal tombs in the Valley of the Kings',
      'The Temple of Queen Hatshepsut',
      'The Colossi of Memnon',
      'A motorboat crossing of the Nile',
      'Lunch at a local restaurant on the West Bank',
    ],
    itinerary: [
      { time: 'Early', title: 'Hotel pickup', description: 'A very early pickup from your hotel in Marsa Alam in an air-conditioned vehicle.' },
      { time: 'Morning', title: 'Karnak Temple', description: 'The temples, pylons and obelisks of Karnak on the East Bank.' },
      { time: 'Midday', title: 'Nile crossing and lunch', description: 'Cross the Nile by motorboat and have lunch on the West Bank.' },
      { time: 'Afternoon', title: 'Valley of the Kings', description: 'Go down into several of the royal tombs.' },
      { time: 'Afternoon', title: 'Temple of Hatshepsut', description: 'The terraced temple built into the cliffs of Deir el-Bahari.' },
      { time: 'Late afternoon', title: 'Colossi of Memnon', description: 'A photo stop at the two giant statues of Amenhotep III.' },
      { time: 'Evening', title: 'Back to Marsa Alam', description: 'The drive back, arriving at your hotel late in the evening.' },
    ],
    inclusions: [
      'Pickup and drop-off at your hotel in Marsa Alam',
      'Transfers by private air-conditioned vehicle',
      'Professional Egyptologist guide',
      'Entrance fees to Karnak, the Valley of the Kings and the Temple of Hatshepsut',
      'Lunch at a local restaurant in Luxor',
      'Nile crossing by motorboat',
      'Bottled mineral water',
      'Service charges and taxes',
    ],
    exclusions: [
      ...TIP_AND_PERSONAL,
      'Drinks at the restaurant',
      'Entrance to the tomb of Tutankhamun, which needs a separate ticket',
      'Anything not listed as included',
    ],
    whatToBring: ['Comfortable walking shoes', 'A hat, sunglasses and sunscreen', 'Clothing that covers shoulders and knees', 'Some Egyptian pounds for souvenirs and tips'],
    needToKnow: [
      'How long is the day? Very long: pickup around 4–5 am and back late in the evening, with about 4–5 hours of driving each way.',
      'Can I take photos in the tombs? Photography inside the tombs may be restricted or need an extra ticket.',
    ],
    accessibility: ['A long day with a lot of walking.'],
    participantRequirements: [],
    sourceUrls: [`${SITE}/luxor-day-trip/`],
    sourceImages: [
      'https://i.ibb.co/hJpQMc8K/caption-1.jpg',
      'https://i.ibb.co/DHFydcZF/caption-5.jpg',
      'https://i.ibb.co/RT6bkdR5/caption-6.jpg',
      'https://i.ibb.co/XfJFVY0k/caption-2.jpg',
      'https://i.ibb.co/ZzXr4hwr/caption-3.jpg',
      'https://i.ibb.co/q3ZYp1z2/caption-4.jpg',
    ],
    imageAlts: [
      'The Colossi of Memnon in Luxor',
      'Guests with their guide at a temple in Luxor',
      'The avenue of sphinxes in Luxor',
      'Crossing the Nile by motorboat in Luxor',
      'The columns of the temple at Karnak',
      'A decorated royal tomb in the Valley of the Kings',
    ],
    seo: {
      metaTitle: 'Luxor Day Trip from Marsa Alam | Fox Marsa Alam',
      metaDescription:
        'Full-day trip from Marsa Alam to Luxor with an Egyptologist: Karnak, Valley of the Kings, Hatshepsut Temple, Colossi of Memnon, lunch and a Nile crossing.',
      keywords: ['Luxor day trip from Marsa Alam', 'Marsa Alam to Luxor', 'Valley of the Kings tour', 'Karnak Temple day trip'],
    },
    openDecisions: [
      PRICE_DECISION,
      'Confirm the exact pickup time by hotel area.',
      'Confirm that the Luxor photos are the operator’s own: several published images on this page were stock and were left out.',
      PHOTO_DECISION,
    ],
  },
  {
    slug: 'fox-marsa-alam-airport-transfers',
    pathSlug: 'airport-transfers',
    title: 'Private Airport Transfers to Marsa Alam, Port Ghalib and El Quseir',
    shortDescription:
      'Private door-to-door transfers between Marsa Alam (RMF) or Hurghada (HRG) airport and your hotel in Marsa Alam, Port Ghalib or El Quseir, with a driver who meets you at arrivals.',
    description: [
      'Your driver tracks your flight and waits in the arrivals hall with a name sign, then drives you straight to your hotel in Marsa Alam, Port Ghalib or El Quseir in a private air-conditioned vehicle with water on board.',
      'Return transfers are arranged in advance: we collect you from your hotel with time to spare for your flight.',
      'Send your flight number, arrival time, hotel and number of travellers, and we confirm by email or WhatsApp with the meeting point and your driver’s contact.',
    ].join('\n\n'),
    category: 'transfers',
    city: 'Marsa Alam',
    entryWindows: [],
    hasHotelPickup: true,
    pickupNote: 'Door to door between Marsa Alam (RMF) or Hurghada (HRG) airport and your hotel. Approximate driving times from RMF: Port Ghalib 10–20 min, Marsa Alam north and centre 25–60 min, El Quseir 1–1.5 h, Marsa Alam south 1.5–3 h. From HRG: El Quseir 1.5–2.5 h, Port Ghalib 2.5–3.5 h, Marsa Alam north and centre 3–4 h, Marsa Alam south 4–5 h.',
    languages: [],
    highlights: [
      'Meet and greet at arrivals with a name sign',
      'Flight tracking, so a delay does not cost you your ride',
      'Private air-conditioned vehicle with water on board',
      'Door to door, from either airport to any hotel in the area',
    ],
    itinerary: [
      { time: 'Before', title: 'Send your details', description: 'Flight number, arrival time, hotel, number of travellers and transfer type.' },
      { time: 'Before', title: 'Confirmation', description: 'We confirm by email or WhatsApp with the meeting point and your driver’s contact.' },
      { time: 'Arrival', title: 'Meet and greet', description: 'Your driver waits in the arrivals hall with your name sign.' },
      { time: 'Ride', title: 'Private ride', description: 'A private air-conditioned vehicle with water on board.' },
      { time: 'Drop-off', title: 'At your hotel', description: 'Dropped at your hotel lobby; your return ride is arranged in advance.' },
    ],
    inclusions: [
      'Pickup at the airport or your hotel',
      'Private air-conditioned vehicle',
      'Private driver',
      'Mineral water in the vehicle',
      'Service charges and taxes',
    ],
    exclusions: ['Egypt entry visa', 'Anything not listed as included'],
    whatToBring: [],
    needToKnow: [
      'What if my flight is delayed? We track flights and the driver adjusts; your booking stays valid.',
      'Can you drop at a guest house or holiday flat? Yes. Pick the nearest hotel and give the exact address in your message.',
      'How do I pay? Cash on arrival in EGP, EUR or USD; card on request, and an invoice is available.',
    ],
    accessibility: [],
    participantRequirements: [],
    sourceUrls: [`${SITE}/transfer-service/`],
    sourceImages: [
      'https://i.ibb.co/TD4Sndht/caption-8.jpg',
      'https://i.ibb.co/9mnz2s1K/caption.jpg',
      'https://i.ibb.co/Y4hJRz8K/caption-5.jpg',
      'https://i.ibb.co/27sDDDFv/caption-6.jpg',
      'https://i.ibb.co/nNzmjHqn/caption-1.jpg',
    ],
    imageAlts: [
      'A white minivan used for airport transfers',
      'A transfer minivan parked under palm trees at sunset',
      'A grey saloon car used for private transfers',
      'Two black cars used for airport transfers',
      'The terminal building at Hurghada International Airport',
    ],
    seo: {
      metaTitle: 'Marsa Alam Airport Transfers: RMF & HRG | Fox Marsa Alam',
      metaDescription:
        'Private transfers between Marsa Alam or Hurghada airport and hotels in Marsa Alam, Port Ghalib and El Quseir, with meet and greet and flight tracking.',
      keywords: ['Marsa Alam airport transfer', 'RMF airport transfer', 'Hurghada to Marsa Alam transfer', 'Port Ghalib transfer'],
    },
    openDecisions: [
      'Confirm the transfer prices by zone and vehicle size. None is published, so transfers launch as enquiry-only.',
      'Confirm the vehicles shown: the published page mixed fleet photos with stock images, which were left out.',
      PHOTO_DECISION,
    ],
  },
];
