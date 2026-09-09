/**
 * Cave Divers tenant and enquiry-only catalogue package.
 *
 * The seven catalogue records are visible but explicitly ENQUIRY ONLY. They
 * carry no price, availability, booking promise, imported image, review,
 * cancellation term, or wildlife guarantee. The custom domain is recorded as
 * unconfigured and is never migrated by this script.
 *
 * Dry run (no database or Cloudinary connection):
 *   npm run seed:cave-divers
 * Apply after the matching backend release:
 *   npm run seed:cave-divers -- --apply --confirm-domain=cave-divers.com
 */

interface CaveItineraryStep {
  time: string;
  title: string;
  description: string;
}

interface CaveSourceNote {
  /** First-party Cave Divers page, or a reference supplier page used for structure only. */
  url: string;
  /** ISO date the page was actually opened and read. */
  checked: string;
  /** What this run took from that page. Reference rows never contribute customer copy. */
  used: string;
}

interface CaveDiversTour {
  slug: string;
  pathSlug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: 'Daily diving' | 'Dive training' | 'Sea trips';
  /** Only set where the first-party page states it unambiguously. */
  duration?: string;
  languages: string[];
  destination: { city: string; country: string; coordinates: { lat: number; lng: number } };
  highlights: string[];
  itinerary: CaveItineraryStep[];
  inclusions: string[];
  exclusions: string[];
  whatToBring: string[];
  /** Doubles as the customer FAQ: question-led notes rendered in Need to know. */
  needToKnow: string[];
  accessibility: string[];
  participantRequirements: string[];
  seo: { metaTitle: string; metaDescription: string; keywords: string[] };
  /** Dated provenance for every record. Not persisted to a customer-facing field. */
  firstPartySources: CaveSourceNote[];
  referenceNotes: CaveSourceNote[];
  /** Internal-only. Never rendered to a customer. */
  openDecisions: string[];
  status: 'active';
}

const TENANT_SLUG = 'cave-divers';
const CUSTOM_DOMAIN = 'cave-divers.com';
const SOURCE_ORIGIN = 'https://www.cave-divers.com';
const COURSES_SOURCE = `${SOURCE_ORIGIN}/courses.html`;
const TRIPS_SOURCE = `${SOURCE_ORIGIN}/trips.html`;

/** Inspiration-only references supplied in the delivery brief.
 * They are not Cave Divers suppliers and none of their copy, imagery, prices,
 * ratings, or reviews is imported by this package.
 */
export const CAVE_DIVERS_INSPIRATION_REFERENCES = [
  'https://www.getyourguide.com/white-dolphin-diving-center-s494956/',
  'https://www.getyourguide.com/diving-star-hurghada-s459435/',
  'https://www.getyourguide.com/the-pure-coastal-s175818/',
  'https://www.getyourguide.com/dive-red-sea-s758823/',
] as const;

export const CAVE_DIVERS_TENANT = {
  slug: TENANT_SLUG,
  name: 'Cave Divers',
  domain: 'cave-divers.foxesnetwork.com',
  customDomain: CUSTOM_DOMAIN,
  domainMigrated: false,
  customDomainStatus: 'unconfigured',
  heroImages: [] as string[],
  tagline: 'Red Sea diving, charted with care.',
  description:
    'A PADI dive centre offering daily diving, diver training and Red Sea boat trips, with bases at Palm Beach Resort, Long Beach Hotel and Soma Bay.',
  theme: {
    primaryColor: '#061C24',
    secondaryColor: '#087F8C',
    accentColor: '#C9FF4A',
  },
  fonts: { heading: 'Oswald', body: 'DM Sans' },
  designMode: 'depth',
  defaultCurrency: 'EUR',
  defaultLanguage: 'en',
  supportedLanguages: ['en'],
  timezone: 'Africa/Cairo',
  contactInfo: {
    // Current public contact points from cave-divers.com. Never emitted by the script.
    email: 'info@cave-divers.com',
    phone: '+20 10 176 39 198',
  },
  socialLinks: {},
  flatUrls: false,
  status: 'active',
  navigation: [
    { label: 'Home', href: '/' },
    { label: 'Dive programmes', href: '/dive-programs' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ],
  seoSettings: {
    metaTitle: 'Cave Divers | Red Sea Diving in Hurghada',
    metaDescription:
      'Explore Cave Divers daily diving, training and Red Sea boat programmes in Hurghada, then contact the centre for current details.',
    keywords: ['Cave Divers', 'Red Sea diving', 'Hurghada diving', 'diver training'],
  },
  paymentSettings: {
    enabledGateways: [] as string[],
    ownPaymentGateway: false,
    stripe: { enabled: false },
  },
  bundleSettings: {
    mode: 'off',
    reason: 'No Cave Divers bundle has been commercially approved.',
  },
  aiSettings: {
    bookingWidget: {
      enabled: false,
      position: 'bottom-right',
      languages: ['en'],
      autoOpen: false,
    },
    voiceAgent: {
      enabled: false,
      languages: ['en'],
      buttonPosition: 'bottom-right',
    },
    searchWidget: {
      enabled: true,
      placeholder: 'Search daily diving, courses or sea trips',
      showPopularSearches: false,
      maxSuggestions: 6,
    },
  },
} as const;

const CHECKED = '2026-09-10';
const CENTRE_LANGUAGES = ['English', 'German', 'French', 'Italian', 'Polish', 'Russian', 'Arabic'];
// Coordinates published by the Cave Divers website's embedded location map.
const HURGHADA = {
  city: 'Hurghada',
  country: 'Egypt',
  coordinates: { lat: 27.291187482966045, lng: 33.759873815053 },
};

/** Every boat programme on the first-party Trips page publishes the same 09:30-15:30 day. */
const BOAT_DAY_SOURCE: CaveSourceNote = {
  url: TRIPS_SOURCE,
  checked: CHECKED,
  used: 'Programme family, two dive sites per diving day, drinks and lunch on board, published 09:30-15:30 boat day, and the excluded items note.',
};
const COURSES_SOURCE_NOTE: CaveSourceNote = {
  url: COURSES_SOURCE,
  checked: CHECKED,
  used: 'PADI course line, course levels and durations, instructor languages, and the note that course prices include equipment and dives while park, permission, certification and manual charges are excluded.',
};

/** Shared safety and eligibility wording. Written for Cave Divers, not lifted from any listing. */
const DIVE_SUITABILITY = [
  'Tell the centre before booking about any medical condition, recent surgery, pregnancy or medication that could affect diving or snorkelling.',
  'Minimum age and medical eligibility follow the centre and its training agency, and are confirmed when you book.',
  'Comfort in open water matters more than experience; say so when you book if you are an uneasy swimmer.',
];
const SEA_SUITABILITY = [
  'Open-water boat days suit most guests, but tell the centre in advance about mobility needs, pregnancy or a medical condition affecting time at sea.',
  'Children join at the centre’s discretion; confirm the arrangement for your group when you book.',
];
const BOAT_BRING = ['Swimwear and a towel', 'Sun protection and a hat', 'Photo identification', 'A light layer for the return leg'];

const BOAT_DAY_ITINERARY: CaveItineraryStep[] = [
  { time: '09:30', title: 'Leave the harbour', description: 'The centre publishes 09:30 as the start of its boat day.' },
  { time: 'First stop', title: 'Dive site one', description: 'The first of the two sites the boat visits during the day.' },
  { time: 'On board', title: 'Lunch and surface interval', description: 'Lunch with hot and soft drinks is served on the boat between the two dives.' },
  { time: 'Second stop', title: 'Dive site two', description: 'The second of the two sites included in the day.' },
  { time: '15:30', title: 'Back to the harbour', description: 'The centre publishes 15:30 as the end of its boat day.' },
];

const TRIP_INCLUSIONS = ['Your place on the Cave Divers boat for the day', 'Hot and soft drinks on board', 'Lunch on board'];
const TRIP_EXCLUSIONS = [
  'Equipment rental',
  'Dive permission fees',
  'Transfer between your hotel and the boat',
  'Anything not listed above',
];

export const CAVE_DIVERS_TOURS: CaveDiversTour[] = [
  {
    slug: 'cave-divers-red-sea-daily-diving',
    pathSlug: 'red-sea-daily-diving',
    title: 'One-Day Red Sea Diving: Two Dive Sites by Boat',
    shortDescription:
      'A full day on the Cave Divers boat diving two Red Sea sites, with hot and soft drinks and lunch served on board.',
    description:
      'This is the centre’s standard diving day: one boat, two dive sites, and a day built around getting qualified divers in the water twice without rushing either dive.\n\nThe boat leaves the harbour at 09:30 and is back at 15:30. You dive the first site in the morning, come back on board for lunch and a proper surface interval, then dive the second site in the afternoon. Which two sites the boat visits is a decision the crew makes on the day, because conditions in the Red Sea change and the sensible choice in a light northerly is not the sensible choice in a stiff one.\n\nDives are led by the centre’s own guides, and the team teaches in English, German, French, Italian, Polish, Russian and Arabic, so you can usually be briefed in a language you are comfortable in.\n\nThe trip price the centre publishes covers the boat, the two dives, lunch and drinks. Equipment rental, dive permission fees and your transfer to the boat are quoted separately, so ask for the full figure for your group rather than assuming the headline number is the total.\n\nThis is a guided dive day for people who already dive. If you have never breathed underwater before, start with Discover Scuba Diving instead — it is a separate one-day programme built for exactly that.',
    category: 'Daily diving',
    duration: '1 day',
    languages: CENTRE_LANGUAGES,
    destination: HURGHADA,
    highlights: [
      'Two dive sites in a single day from the centre’s own boat',
      'A published day that runs 09:30 to 15:30',
      'Lunch and unlimited hot and soft drinks served on board',
      'Sites chosen on the day to suit conditions',
      'Guides who brief in seven languages',
    ],
    itinerary: BOAT_DAY_ITINERARY,
    inclusions: [...TRIP_INCLUSIONS, 'Two dives at two different sites', 'Guiding by the Cave Divers dive team'],
    exclusions: TRIP_EXCLUSIONS,
    whatToBring: [...BOAT_BRING, 'Your diving certification card'],
    needToKnow: [
      'Do I need to be certified? Yes — this is a guided dive day, not a course. Never dived before? Book Discover Scuba Diving instead.',
      'How many dives do I get? Two, at two different sites, with a surface interval and lunch between them.',
      'Who picks the dive sites? The crew does, on the day, based on conditions.',
      'Is food included? Yes — lunch plus hot and soft drinks are served on the boat.',
      'What is not in the trip price? Equipment rental, dive permission fees and transfer to the boat are all charged separately.',
      'How long before flying? Leave a full surface interval before you fly and confirm the exact figure with the centre — do not book a dive day for the day before you travel home.',
    ],
    accessibility: DIVE_SUITABILITY,
    participantRequirements: ['Certified divers — bring your card'],
    seo: {
      metaTitle: 'One-Day Red Sea Diving from Hurghada | Cave Divers',
      metaDescription:
        'Dive two Red Sea sites in one day from the Cave Divers boat in Hurghada, with lunch and drinks on board. Rates and departures confirmed with the centre.',
      keywords: ['Red Sea diving', 'Hurghada diving day', 'two dive sites', 'guided dives', 'Cave Divers'],
    },
    firstPartySources: [BOAT_DAY_SOURCE],
    referenceNotes: [
      {
        url: 'https://www.getyourguide.com/hurghada-l403/hurghada-certified-diving-trip-with-lunch-transfers-gear-t1196989/',
        checked: CHECKED,
        used: 'Structure only: confirmed that a Red Sea dive day is normally sold as two distinct audiences (supervised first dive versus certified diving). No copy, price, rating, review, image or cancellation term taken.',
      },
      {
        url: 'https://www.getyourguide.com/hurghada-l403/hurghada-full-day-boat-trip-2-scuba-dives-w-lunchtransfer-t792868/',
        checked: CHECKED,
        used: 'Structure only, on retry after the first attempt returned a generic page: corroborated the mid-morning departure and mid-afternoon return shape of a Hurghada two-dive boat day. No copy or commercial term taken.',
      },
      {
        url: 'https://www.getyourguide.com/makadi-bay-l4675/makadi-bay-red-sea-scuba-diving-boat-trip-with-lunch-t1328891/',
        checked: CHECKED,
        used: 'Structure only: confirmed that guests expect the departure marina and out-of-area transfer to be stated explicitly. No copy or commercial term taken.',
      },
    ],
    openDecisions: [
      'Trip price and currency: the Trips page shows a bare figure with no currency; the Courses page prices in euro. Confirm both.',
      'Whether the day accepts supervised first-time divers alongside certified divers, and if so on what terms.',
      'Equipment rental, dive permission fee and transfer figures.',
      'Departure marina and which pickup areas the centre serves.',
    ],
    status: 'active',
  },
  {
    slug: 'cave-divers-multi-day-daily-diving',
    pathSlug: 'multi-day-daily-diving',
    title: 'Multi-Day Red Sea Diving Package',
    shortDescription:
      'Three, five, eight or ten diving days on the Cave Divers boat — two dives every day, with lunch and drinks on board.',
    description:
      'If you are diving for more than a day, the centre sells diving days in blocks rather than one at a time. The published packages are three days (six dives), five days (ten dives), eight days (sixteen dives) and ten days (twenty dives).\n\nEvery diving day in a package is the same shape as the single day: the boat leaves at 09:30, visits two dive sites, serves lunch and drinks on board between them, and is back at 15:30. Over several days that adds up to a genuine spread of the Red Sea rather than the same reef twice, because the crew varies the sites across the block.\n\nBooking a block is also how you get consistency — the same guides, the same boat and a team that knows by day three how you dive and what you want to see.\n\nAs with the single day, equipment rental, dive permission fees and transfer sit outside the published package figure. Ask the centre for the complete cost of the block for your group, including the per-day extras, before you commit.\n\nThe package is one product with a choice of length. Tell the centre which block you want and over which dates, and they will confirm whether the days need to run consecutively.',
    category: 'Daily diving',
    duration: '3 to 10 diving days',
    languages: CENTRE_LANGUAGES,
    destination: HURGHADA,
    highlights: [
      'Choose three, five, eight or ten diving days',
      'Six, ten, sixteen or twenty dives depending on the block',
      'Two dives every diving day, at two different sites',
      'The same published 09:30 to 15:30 boat day throughout',
      'Lunch and hot and soft drinks on board each day',
    ],
    itinerary: BOAT_DAY_ITINERARY,
    inclusions: [...TRIP_INCLUSIONS, 'Two dives on each diving day of the block', 'Guiding by the Cave Divers dive team'],
    exclusions: TRIP_EXCLUSIONS,
    whatToBring: [...BOAT_BRING, 'Your diving certification card', 'A logbook if you keep one'],
    needToKnow: [
      'What lengths can I book? Three, five, eight or ten diving days — six, ten, sixteen or twenty dives.',
      'How many dives per day? Two, at two different sites, on every diving day in the block.',
      'Do the days have to be consecutive? Confirm this with the centre when you book; it is not stated on the published programme.',
      'Is equipment included? No. Equipment rental, dive permission fees and transfer are quoted separately, and on a multi-day block those add up.',
      'Can I add days later? Ask the centre — the published packages are fixed blocks.',
    ],
    accessibility: DIVE_SUITABILITY,
    participantRequirements: ['Certified divers — bring your card'],
    seo: {
      metaTitle: 'Multi-Day Red Sea Diving Packages in Hurghada | Cave Divers',
      metaDescription:
        'Book three, five, eight or ten diving days with Cave Divers in Hurghada — two dives a day with lunch and drinks on board. Rates confirmed with the centre.',
      keywords: ['multi-day diving', 'Hurghada dive package', 'Red Sea diving days', 'Cave Divers'],
    },
    firstPartySources: [BOAT_DAY_SOURCE],
    referenceNotes: [
      {
        url: 'https://www.getyourguide.com/hurghada-l403/hurghada-intro-1-2-3-4-or-5-day-diving-package-5-star-t330276/',
        checked: CHECKED,
        used: 'Structure only: confirmed that multi-day diving is sold as one product with a day-count choice and a duration range, rather than a separate listing per length. No copy, price, rating, review or image taken.',
      },
    ],
    openDecisions: [
      'Package prices and currency, and whether the per-day rate changes with block length.',
      'Whether diving days must run consecutively and how far apart they may be spread.',
      'Per-day equipment rental and dive permission fee figures.',
    ],
    status: 'active',
  },
  {
    slug: 'cave-divers-discover-scuba-diving',
    pathSlug: 'discover-scuba-diving',
    title: 'Discover Scuba Diving: Your First Dive',
    shortDescription:
      'A one-day PADI Discover Scuba Diving programme for guests with no previous experience, run under direct instructor supervision.',
    description:
      'Discover Scuba Diving is the programme for the person who has always wondered what it is like and has never actually done it. It takes one day, needs no previous experience, and you are under an instructor’s direct supervision from the first breath to the last.\n\nThe day is not a certification course. It is a properly supervised introduction: you learn what the equipment does, how to breathe on a regulator, how to clear your mask and equalise, and then you go and use those skills in the Red Sea with an instructor beside you.\n\nCave Divers is a PADI centre and runs the full PADI line from Bubblemaker for children through to Divemaster, so if the day goes well there is an obvious next step. Teaching materials are available in all the major languages and the instructors teach in English, German, French, Italian, Polish, Russian and Arabic.\n\nThe course price the centre publishes includes your equipment and your dives. National park fees, dive permission fees, and certification and manual charges sit outside it, so ask for the all-in figure when you book.\n\nIf you want to come away certified rather than introduced, look at the Scuba Diver course or the Open Water Diver course instead.',
    category: 'Dive training',
    duration: '1 day',
    languages: CENTRE_LANGUAGES,
    destination: HURGHADA,
    highlights: [
      'No previous diving experience needed',
      'One day, under direct instructor supervision throughout',
      'A PADI programme at a PADI dive centre',
      'Equipment and your dives included in the course',
      'Instruction available in seven languages',
    ],
    itinerary: [
      { time: 'Start', title: 'Meet your instructor', description: 'Introductions, a look at the equipment and what each part of it does.' },
      { time: 'Theory', title: 'The briefing that matters', description: 'Breathing on a regulator, equalising, clearing your mask and the hand signals you will actually use.' },
      { time: 'Water', title: 'Shallow-water skills', description: 'Practising those skills in shallow water until they feel unremarkable.' },
      { time: 'Dive', title: 'Your first dive', description: 'Your supervised dive in the Red Sea, with the instructor alongside you the whole time.' },
      { time: 'After', title: 'What comes next', description: 'A debrief and, if you want it, the route into a certification course.' },
    ],
    inclusions: ['Instruction throughout the programme', 'Diving equipment for the day', 'Your supervised dives', 'Direct instructor supervision'],
    exclusions: ['National park fee', 'Dive permission fee', 'Certification and manual charges', 'Transfer between your hotel and the centre'],
    whatToBring: ['Swimwear and a towel', 'Sun protection', 'Photo identification', 'Any medical paperwork relevant to diving'],
    needToKnow: [
      'Do I need experience? No — that is the point of this programme.',
      'Do I come away certified? No. This is a supervised introduction. The Scuba Diver and Open Water Diver courses are the certification routes.',
      'Am I alone underwater? No. An instructor supervises you directly for the whole dive.',
      'What is not in the course price? National park fee, dive permission fee, and certification and manual charges.',
      'Is there a version for children? The centre lists Bubblemaker for younger children from eight; ask which programme fits your child’s age.',
      'Can I fly the same day? No — leave a proper surface interval and confirm the exact figure with the centre.',
    ],
    accessibility: DIVE_SUITABILITY,
    participantRequirements: ['No experience needed — minimum age set by the centre'],
    seo: {
      metaTitle: 'Discover Scuba Diving in Hurghada | First Dive with Cave Divers',
      metaDescription:
        'Try diving for the first time with Cave Divers in Hurghada. A one-day PADI Discover Scuba Diving programme under direct instructor supervision.',
      keywords: ['Discover Scuba Diving', 'first dive Hurghada', 'try diving Red Sea', 'PADI intro dive', 'Cave Divers'],
    },
    firstPartySources: [COURSES_SOURCE_NOTE],
    referenceNotes: [
      {
        url: 'https://www.getyourguide.com/white-dolphin-diving-center-s494956/',
        checked: CHECKED,
        used: 'Structure only: confirmed that beginner diving is presented as a distinct product from certified diving and from certification courses. No copy, price, rating, review or image taken.',
      },
    ],
    openDecisions: [
      'Course price and currency, and the standard versus online price difference shown on the Courses page.',
      'Minimum age for this specific programme and the point at which Bubblemaker is the correct product instead.',
      'Maximum depth and instructor-to-guest ratio for the supervised dive.',
      'Whether the programme runs from the boat, from shore, or either.',
    ],
    status: 'active',
  },
  {
    slug: 'cave-divers-open-water-diver-course',
    pathSlug: 'open-water-diver-course',
    title: 'PADI Open Water Diver Course',
    shortDescription:
      'The entry-level PADI certification at Cave Divers, covering dive theory, in-water skills and open-water dives in the Red Sea.',
    description:
      'The Open Water Diver course is the certification most divers start with, and it is the qualification the rest of the diving world recognises when you turn up at a centre anywhere and ask to join a boat.\n\nThe course covers the fundamentals: how the equipment works, what the theory means in practice, the skills you need to be safe and unbothered underwater, and then real dives in the Red Sea where you use all of it. Cave Divers runs it as a beginner-level PADI course, and the centre teaches the complete PADI line from Bubblemaker through to Divemaster, so the next certification is available from the same team.\n\nTeaching materials are available in all the major languages, and the instructors teach in English, German, French, Italian, Polish, Russian and Arabic — worth knowing for a course where understanding the briefing properly is the whole point.\n\nThe published course price includes your equipment and your course dives. National park fees, dive permission fees, and certification and manual charges are separate, so ask the centre for the complete figure.\n\nOne detail we are deliberately not publishing yet: the centre’s own course page currently gives two different course lengths, and we will show the length once the centre confirms which is correct. If you are short on time, ask about the Scuba Diver course, which the centre describes as a subset of Open Water with a twelve-metre depth limit.',
    category: 'Dive training',
    languages: CENTRE_LANGUAGES,
    destination: HURGHADA,
    highlights: [
      'The entry-level PADI certification, recognised worldwide',
      'Dive theory, confined-water skills and open-water dives in the Red Sea',
      'Taught by the centre’s own PADI instructors',
      'Teaching materials in all major languages',
      'Equipment and course dives included in the course',
    ],
    itinerary: [
      { time: 'Theory', title: 'Knowledge development', description: 'The principles behind safe diving, and the equipment you will be using.' },
      { time: 'Confined water', title: 'Skills in shallow water', description: 'Practising each required skill somewhere calm until it is second nature.' },
      { time: 'Open water', title: 'Dives in the Red Sea', description: 'Applying the skills on real dives with your instructor.' },
      { time: 'Certification', title: 'Sign-off', description: 'Your instructor confirms the standards are met and processes the certification.' },
    ],
    inclusions: ['Instruction throughout the course', 'Diving equipment for the duration of the course', 'The course dives', 'Use of the centre’s training facilities'],
    exclusions: ['National park fee', 'Dive permission fee', 'Certification processing and manual', 'Transfer between your hotel and the centre'],
    whatToBring: ['Swimwear and a towel', 'Sun protection', 'Photo identification', 'A medical certificate if you have a condition that affects diving'],
    needToKnow: [
      'How long is the course? Not published here yet. The centre’s own course page currently states two different lengths and we are confirming which is correct rather than guessing.',
      'Do I need experience? No — this is the beginner certification.',
      'What is the shorter alternative? The centre lists a Scuba Diver course as a subset of Open Water, with a twelve-metre maximum depth, for guests short on time.',
      'What is not in the course price? National park fee, dive permission fee, and certification and manual charges.',
      'Can I continue afterwards? Yes — the centre teaches the full PADI line up to Divemaster, plus specialties.',
      'Do I need a medical? Declare any relevant condition before you book; the centre will tell you whether a certificate is required.',
    ],
    accessibility: DIVE_SUITABILITY,
    participantRequirements: ['Beginner level — no certification required to start'],
    seo: {
      metaTitle: 'PADI Open Water Diver Course in Hurghada | Cave Divers',
      metaDescription:
        'Get your entry-level PADI certification with Cave Divers in Hurghada — theory, confined-water skills and open-water dives in the Red Sea.',
      keywords: ['PADI Open Water', 'diving course Hurghada', 'learn to dive in Hurghada', 'diver certification', 'Cave Divers'],
    },
    firstPartySources: [COURSES_SOURCE_NOTE],
    referenceNotes: [
      {
        url: 'https://www.getyourguide.com/hurghada-l403/hurghada-padi-open-water-diver-course-with-elearning-access-t1300885/',
        checked: CHECKED,
        used: 'Structure only: confirmed that a course listing needs a stated learning journey, an eligibility line and a certification outcome. This supplier’s own course length was deliberately NOT used to settle the Cave Divers duration conflict.',
      },
    ],
    openDecisions: [
      'BLOCKING: the Courses page states the course is four days in its description and three days in its duration field. The centre must confirm which is correct; no competitor duration may be substituted.',
      'Course price and currency, and the standard versus online price difference.',
      'Certified maximum depth for this course as Cave Divers runs it.',
      'Whether eLearning or a printed manual is used, and the separate certification charge.',
      'Minimum age, and whether a junior version is offered.',
    ],
    status: 'active',
  },
  {
    slug: 'cave-divers-dolphin-house-sea-trip',
    pathSlug: 'dolphin-house-sea-trip',
    title: 'Dolphin House Sea Trip',
    shortDescription:
      'A Red Sea boat day out to the reef area known as Dolphin House, with hot and soft drinks and lunch served on board.',
    description:
      'Dolphin House is a reef system off Hurghada that wild dolphins are known to frequent, and this is the centre’s boat day out to it. The boat leaves the harbour at 09:30 and returns at 15:30, with hot and soft drinks and lunch served on board.\n\nRead this part carefully, because it is the most important thing on the page: the dolphins here are wild animals. Nobody can promise you will see them, and any operator who does is selling you something they do not control. Some days there are dolphins; some days there are none. Plan the trip as a day on the Red Sea at a beautiful reef, and treat a sighting as the thing that makes an already good day exceptional.\n\nIf dolphins do appear, the rule is to watch and let them decide. They are not there for us, and a boatload of people chasing them is the fastest way to make sure they leave.\n\nThe published trip price covers the boat, drinks and lunch. Equipment rental, permission fees and transfer to the boat are quoted separately — worth asking about in advance if you plan to snorkel and do not have your own kit.',
    category: 'Sea trips',
    duration: '1 day',
    languages: CENTRE_LANGUAGES,
    destination: HURGHADA,
    highlights: [
      'A full boat day out to the Dolphin House reef area',
      'A published day running 09:30 to 15:30',
      'Lunch and hot and soft drinks served on board',
      'Wild dolphins — never guaranteed, and never chased',
      'Reef time that is worth the trip on its own',
    ],
    itinerary: [
      { time: '09:30', title: 'Leave the harbour', description: 'The centre publishes 09:30 as the start of its boat day.' },
      { time: 'Out', title: 'Cross to the reef', description: 'The run out to the Dolphin House reef area.' },
      { time: 'On site', title: 'Time in the water', description: 'Time at the reef. If dolphins are around, they are watched rather than followed.' },
      { time: 'On board', title: 'Lunch', description: 'Lunch with hot and soft drinks is served on the boat.' },
      { time: '15:30', title: 'Back to the harbour', description: 'The centre publishes 15:30 as the end of its boat day.' },
    ],
    inclusions: TRIP_INCLUSIONS,
    exclusions: TRIP_EXCLUSIONS,
    whatToBring: BOAT_BRING,
    needToKnow: [
      'Will I definitely see dolphins? No. They are wild animals and sightings can never be promised. Book this as a Red Sea boat day, not as a dolphin guarantee.',
      'What happens if dolphins appear? The crew keeps a respectful distance and lets the animals set the terms. Nobody chases them.',
      'Is lunch included? Yes — lunch with hot and soft drinks is served on board.',
      'Is snorkelling equipment included? No. Equipment rental is quoted separately, so arrange it in advance if you need it.',
      'What are the hours? The centre publishes a 09:30 departure and a 15:30 return.',
      'What else is excluded? Dive permission fees and your transfer to and from the boat.',
    ],
    accessibility: SEA_SUITABILITY,
    participantRequirements: ['Wild dolphins — sightings are never guaranteed'],
    seo: {
      metaTitle: 'Dolphin House Sea Trip from Hurghada | Cave Divers',
      metaDescription:
        'Spend a Red Sea boat day at the Dolphin House reef with Cave Divers in Hurghada. Lunch and drinks on board. Wild dolphins are never guaranteed.',
      keywords: ['Dolphin House', 'Hurghada boat trip', 'Red Sea snorkelling', 'wild dolphins', 'Cave Divers'],
    },
    firstPartySources: [BOAT_DAY_SOURCE],
    referenceNotes: [
      {
        url: 'https://www.getyourguide.com/el-gouna-l1051/hurghada-day-snorkeling-with-dolphins-t439309/',
        checked: CHECKED,
        used: 'Structure only: confirmed that a dolphin trip must carry an explicit no-guarantee statement and respectful-interaction guidance, and that the reef itself should be sold on its own merits. No copy, price, rating, review or image taken.',
      },
    ],
    openDecisions: [
      'Trip price and currency.',
      'Whether snorkelling equipment can be rented on board and at what cost.',
      'Which reef stops the day includes besides the dolphin area.',
      'Marine park or permission fees payable on the day.',
    ],
    status: 'active',
  },
  {
    slug: 'cave-divers-orange-bay-giftun-island',
    pathSlug: 'orange-bay-giftun-island',
    title: 'Orange Bay, Giftun Island Sea Trip',
    shortDescription:
      'A boat day out to Orange Bay on Giftun Island, with hot and soft drinks and lunch served on board.',
    description:
      'Orange Bay sits on Giftun Island off Hurghada, and it is the kind of place that photographs almost unfairly well — pale sand, shallow turquoise water, and reef close enough to be worth getting in for.\n\nThis is the centre’s boat day out to it. The boat leaves the harbour at 09:30 and is back at 15:30, with hot and soft drinks and lunch served on board. The day is built around time at the island rather than a packed itinerary, which is rather the point of Orange Bay.\n\nGiftun Island sits inside a protected area, and island and park arrangements are handled locally. The centre’s published trip price excludes permission fees, so ask what is payable on the day for your group before you go — it is a much better conversation to have at the desk than at the jetty.\n\nEquipment rental and your transfer to the boat are also quoted separately. If you want to snorkel the reef rather than only swim off the beach, arrange the kit in advance.',
    category: 'Sea trips',
    duration: '1 day',
    languages: CENTRE_LANGUAGES,
    destination: HURGHADA,
    highlights: [
      'A full boat day to Orange Bay on Giftun Island',
      'A published day running 09:30 to 15:30',
      'Lunch and hot and soft drinks served on board',
      'Time at the island rather than a rushed itinerary',
      'Reef within reach of the beach for snorkelling',
    ],
    itinerary: [
      { time: '09:30', title: 'Leave the harbour', description: 'The centre publishes 09:30 as the start of its boat day.' },
      { time: 'Out', title: 'Cross to Giftun Island', description: 'The run out to Orange Bay.' },
      { time: 'On site', title: 'Beach and water time', description: 'Time at the bay to swim, snorkel or stay on the sand.' },
      { time: 'On board', title: 'Lunch', description: 'Lunch with hot and soft drinks is served on the boat.' },
      { time: '15:30', title: 'Back to the harbour', description: 'The centre publishes 15:30 as the end of its boat day.' },
    ],
    inclusions: TRIP_INCLUSIONS,
    exclusions: [...TRIP_EXCLUSIONS.slice(0, 3), 'Island and marine park charges payable locally', 'Anything not listed above'],
    whatToBring: BOAT_BRING,
    needToKnow: [
      'Are island or park fees included? No. The published trip price excludes permission fees — ask the centre what is payable on the day.',
      'Is lunch included? Yes — lunch with hot and soft drinks is served on board.',
      'Is snorkelling equipment included? No. Equipment rental is quoted separately, so arrange it in advance if you need it.',
      'What are the hours? The centre publishes a 09:30 departure and a 15:30 return.',
      'Can I just stay on the beach? Yes. The day is built around time at the bay rather than a fixed programme.',
      'Is transfer to the boat included? No — it is quoted separately.',
    ],
    accessibility: SEA_SUITABILITY,
    participantRequirements: ['Island and park charges payable locally'],
    seo: {
      metaTitle: 'Orange Bay and Giftun Island Boat Trip | Cave Divers Hurghada',
      metaDescription:
        'A Red Sea boat day to Orange Bay on Giftun Island with Cave Divers in Hurghada, with lunch and drinks on board. Island and park charges payable locally.',
      keywords: ['Orange Bay', 'Giftun Island', 'Hurghada island trip', 'Red Sea boat day', 'Cave Divers'],
    },
    firstPartySources: [BOAT_DAY_SOURCE],
    referenceNotes: [],
    openDecisions: [
      'Trip price and currency.',
      'The exact island and marine park charges payable locally, and how they are collected.',
      'Whether snorkelling equipment can be rented on board.',
      'How long the boat stays at the bay.',
    ],
    status: 'active',
  },
  {
    slug: 'cave-divers-glass-boat-half-day',
    pathSlug: 'glass-boat-half-day',
    title: 'Glass Boat Half-Day: Snorkelling and an Island Stop',
    shortDescription:
      'A half day on the glass boat with two snorkelling stops and an island landing, with hot and soft drinks on board.',
    description:
      'The glass boat is the trip for a group that does not all want the same thing. The glass floor means someone who has no intention of getting wet still sees the reef, while everyone else gets in — and the half day includes two snorkelling stops and a landing on an island.\n\nIt is also the shortest way to get out on the Red Sea with this centre, which makes it the sensible choice on an arrival day, a departure day, or any day where a full boat day is more than you want.\n\nHot and soft drinks are served on board. Unlike the centre’s full-day glass boat trip, food is not included on the half day, so eat before you go or plan lunch for afterwards. Equipment rental, permission fees and transfer are quoted separately.\n\nThe centre runs a morning departure at 09:30 and an afternoon departure as well. We are not publishing the afternoon start time here: the printed time on the centre’s own page is inconsistent, and we would rather leave it blank than have you at a jetty at the wrong hour. Ask the centre for the afternoon time when you book.',
    category: 'Sea trips',
    duration: 'Half day',
    languages: CENTRE_LANGUAGES,
    destination: HURGHADA,
    highlights: [
      'A glass floor, so non-swimmers see the reef too',
      'Two snorkelling stops in a half day',
      'An island landing included in the programme',
      'Hot and soft drinks served on board',
      'The centre also runs a full-day glass boat that includes lunch',
    ],
    itinerary: [
      { time: 'Departure', title: 'Leave the harbour', description: 'The centre publishes a 09:30 morning departure; the afternoon start time is being confirmed.' },
      { time: 'Stop one', title: 'First snorkelling stop', description: 'The first of the two snorkelling stops in the programme.' },
      { time: 'Island', title: 'Island landing', description: 'The landing included in the half-day programme.' },
      { time: 'Stop two', title: 'Second snorkelling stop', description: 'The second of the two snorkelling stops.' },
      { time: 'Return', title: 'Back to the harbour', description: 'The morning departure is published as returning at 13:00.' },
    ],
    inclusions: ['Your place on the glass boat', 'Two snorkelling stops', 'An island landing', 'Hot and soft drinks on board'],
    exclusions: ['Food — not included on the half-day trip', 'Equipment rental', 'Dive permission fees', 'Transfer between your hotel and the boat'],
    whatToBring: BOAT_BRING,
    needToKnow: [
      'Is lunch included? No. The half day includes hot and soft drinks only. The centre’s full-day glass boat includes lunch.',
      'What time does the afternoon trip leave? Not published here. The printed afternoon time on the centre’s page is inconsistent, so ask the centre directly rather than relying on it.',
      'What time is the morning trip? The centre publishes 09:30 to 13:00.',
      'Do I have to snorkel? No. The glass floor means you can see the reef without getting in the water.',
      'Is snorkelling equipment included? No — equipment rental is quoted separately.',
      'How many stops are there? Two snorkelling stops plus an island landing.',
    ],
    accessibility: [
      ...SEA_SUITABILITY,
      'The glass floor makes this the most accessible of the sea trips for guests who would rather not enter the water.',
    ],
    participantRequirements: ['Food not included on the half-day trip'],
    seo: {
      metaTitle: 'Glass Boat Half-Day Trip from Hurghada | Cave Divers',
      metaDescription:
        'A half day on the Cave Divers glass boat in Hurghada with two snorkelling stops and an island landing. Drinks on board; food is not included.',
      keywords: ['glass boat Hurghada', 'half day snorkelling', 'Red Sea glass bottom boat', 'island stop', 'Cave Divers'],
    },
    firstPartySources: [BOAT_DAY_SOURCE],
    referenceNotes: [],
    openDecisions: [
      'BLOCKING: the afternoon departure is printed as "01:30 AM - 04:30 PM" on the Trips page. The centre must confirm the intended afternoon start time.',
      'Trip price and currency.',
      'Whether snorkelling equipment can be rented on board.',
      'Which island the landing uses, and any charge payable there.',
    ],
    status: 'active',
  },
];

const forbiddenDraftKeys = [
  'priceFrom',
  'pricingOptions',
  'addons',
  'entryWindows',
  'availability',
  'cancellationPolicy',
  'instantConfirmation',
  'mobileTicket',
  'hasHotelPickup',
  'images',
  'rating',
  'reviewCount',
] as const;

/**
 * The exact editorial payload written to a catalogue record. Provenance and
 * open decisions are NOT in here: they stay in this file and in the dated
 * handover note, never on a customer-facing field.
 */
export function customerFacingContent(tour: CaveDiversTour): Record<string, unknown> {
  return {
    title: tour.title,
    shortDescription: tour.shortDescription,
    description: tour.description,
    category: tour.category,
    ...(tour.duration ? { duration: tour.duration } : {}),
    languages: tour.languages,
    destination: tour.destination,
    highlights: tour.highlights,
    itinerary: tour.itinerary,
    inclusions: tour.inclusions,
    exclusions: tour.exclusions,
    whatToBring: tour.whatToBring,
    needToKnow: tour.needToKnow,
    accessibility: tour.accessibility,
    participantRequirements: tour.participantRequirements,
    seo: tour.seo,
  };
}

/** Named traders from the intake brief. None of their material may reach a record. */
const TRADER_MARKERS = /getyourguide|white dolphin|diving star|pure coastal|dive red sea/i;
/** Internal process vocabulary that must never appear in customer copy. */
const PROCESS_MARKERS = /supplier approval|approval gate|review gate|editorial shell|provisional catalogue|awaiting supplier|rights-cleared|content rights/i;

export function validateCaveDiversPlan(): string[] {
  const errors: string[] = [];
  if (CAVE_DIVERS_TOURS.length < 5 || CAVE_DIVERS_TOURS.length > 7) {
    errors.push('Catalogue must hold between five and seven distinct records.');
  }
  if (CAVE_DIVERS_TENANT.domainMigrated !== false || CAVE_DIVERS_TENANT.customDomainStatus !== 'unconfigured') {
    errors.push('Custom domain must remain explicitly unconfigured and unmigrated.');
  }
  if (CAVE_DIVERS_TENANT.paymentSettings.enabledGateways.length !== 0) {
    errors.push('No payment gateway may be enabled for the provisional catalogue.');
  }

  const slugs = new Set<string>();
  const pathSlugs = new Set<string>();
  for (const tour of CAVE_DIVERS_TOURS) {
    const id = tour.slug;
    if (slugs.has(tour.slug)) errors.push(`Duplicate storage slug: ${id}`);
    if (pathSlugs.has(tour.pathSlug)) errors.push(`Duplicate public path slug: ${id}`);
    slugs.add(tour.slug);
    pathSlugs.add(tour.pathSlug);
    if (tour.status !== 'active') errors.push(`Inactive catalogue record: ${id}`);

    // Provenance: first-party evidence is required; references are optional but
    // must be one of the four traders supplied at intake, and always dated.
    if (!tour.firstPartySources.length) errors.push(`Missing first-party source: ${id}`);
    for (const note of tour.firstPartySources) {
      const url = new URL(note.url);
      if (url.protocol !== 'https:' || url.hostname !== 'www.cave-divers.com') {
        errors.push(`Non-first-party source on ${id}: ${note.url}`);
      }
    }
    for (const note of [...tour.firstPartySources, ...tour.referenceNotes]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(note.checked)) errors.push(`Undated source on ${id}: ${note.url}`);
      if (note.used.trim().length < 40) errors.push(`Source note too thin on ${id}: ${note.url}`);
    }
    for (const note of tour.referenceNotes) {
      const url = new URL(note.url);
      if (url.hostname !== 'www.getyourguide.com') errors.push(`Unexpected reference host on ${id}: ${note.url}`);
      if (!/structure only/i.test(note.used)) errors.push(`Reference note must state structure-only use on ${id}.`);
    }

    const record = tour as unknown as Record<string, unknown>;
    for (const key of forbiddenDraftKeys) {
      if (key in record) errors.push(`Operational field ${key} must not be seeded: ${id}`);
    }

    // Substance: these thresholds are what stop a record regressing to a shell.
    if (tour.description.length < 700) errors.push(`Description is still a shell: ${id}`);
    if (tour.shortDescription.length < 90) errors.push(`Summary is too thin: ${id}`);
    if (tour.highlights.length < 4) errors.push(`Fewer than four highlights: ${id}`);
    if (tour.itinerary.length < 4) errors.push(`Itinerary has fewer than four steps: ${id}`);
    if (tour.inclusions.length < 3) errors.push(`Fewer than three inclusions: ${id}`);
    if (tour.exclusions.length < 3) errors.push(`Fewer than three exclusions: ${id}`);
    if (tour.needToKnow.length < 5) errors.push(`Fewer than five need-to-know answers: ${id}`);
    if (!tour.needToKnow.some((item) => item.includes('?'))) errors.push(`Need-to-know carries no question: ${id}`);
    if (tour.whatToBring.length < 3) errors.push(`Fewer than three preparation notes: ${id}`);
    if (!tour.accessibility.length) errors.push(`Missing suitability notes: ${id}`);
    if (tour.seo.metaDescription.length < 80) errors.push(`Search description is too thin: ${id}`);
    if (!tour.seo.keywords.length) errors.push(`Missing search keywords: ${id}`);
    if (!tour.openDecisions.length) errors.push(`No open decision recorded: ${id}`);

    // Nothing a trader wrote, and no internal process vocabulary, may reach a
    // customer-facing field.
    const customerCopy = JSON.stringify(customerFacingContent(tour));
    if (TRADER_MARKERS.test(customerCopy)) errors.push(`Comparison-trader material reached customer copy: ${id}`);
    if (PROCESS_MARKERS.test(customerCopy)) errors.push(`Internal process vocabulary reached customer copy: ${id}`);
  }

  // The two known source contradictions must stay recorded as blocking
  // decisions rather than being quietly resolved with a plausible number.
  const blocking = CAVE_DIVERS_TOURS.flatMap((tour) => tour.openDecisions.filter((item) => item.startsWith('BLOCKING:')));
  if (blocking.length < 2) errors.push('Both published source contradictions must remain recorded as blocking decisions.');
  const openWater = CAVE_DIVERS_TOURS.find((tour) => tour.pathSlug === 'open-water-diver-course');
  if (openWater?.duration) errors.push('Open Water duration must stay unpublished while the source contradicts itself.');

  return errors;
}

export interface ExistingCatalogueRecord {
  slug: string;
  status: string;
  enquiryOnly: boolean;
  /** True only when the record is already owned by the Cave Divers tenant. */
  ownedByCaveTenant: boolean;
  /** True when any tenant owns the record. */
  hasOwner: boolean;
}

/**
 * Returns the reason this run must not write, or null when every matched
 * record is Cave-owned (or unowned) and either a draft or already in the exact
 * enquiry-only public state managed by this seed.
 *
 * An owned record is foreign unless this exact tenant already owns it. On a
 * first run there is no Cave tenant yet, so ANY owner is foreign — checking
 * ownership only when the tenant already exists would let a first run adopt
 * another tenant's record that happens to share a target slug.
 */
export function catalogueOverwriteBlocker(records: ExistingCatalogueRecord[]): string | null {
  for (const record of records) {
    if (record.status !== 'draft' && !(record.status === 'active' && record.enquiryOnly)) {
      return `Refusing to overwrite a record outside the enquiry-only lifecycle: ${record.slug}.`;
    }
    if (record.hasOwner && !record.ownedByCaveTenant) {
      return `Refusing cross-tenant catalogue overwrite: ${record.slug}.`;
    }
  }
  return null;
}

const ORIGINAL_PREVIEW_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420" role="img" aria-label="Cave Divers provisional wordmark">
  <title>Cave Divers</title>
  <g transform="translate(66 66)">
    <circle cx="144" cy="144" r="128" fill="none" stroke="#62E6FF" stroke-width="18"/>
    <path d="M72 142a72 72 0 0 1 118-55" fill="none" stroke="#C9FF4A" stroke-width="20" stroke-linecap="round"/>
    <path d="M72 146a72 72 0 0 0 119 55" fill="none" stroke="#C9FF4A" stroke-width="20" stroke-linecap="round"/>
    <path d="M130 75v138h38c58 0 89-27 89-69s-31-69-89-69z" fill="none" stroke="#F4FBFC" stroke-width="17" stroke-linejoin="round"/>
    <circle cx="251" cy="33" r="8" fill="#62E6FF"/><circle cx="277" cy="3" r="5" fill="#62E6FF"/>
  </g>
  <text x="370" y="196" fill="#F4FBFC" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="112" letter-spacing="6">CAVE DIVERS</text>
  <text x="376" y="266" fill="#62E6FF" font-family="Arial, Helvetica, sans-serif" font-size="30" letter-spacing="12">RED SEA · PREVIEW</text>
</svg>`.trim();

async function uploadOriginalPreviewLogo(): Promise<string> {
  const { uploadBase64Image } = await import('../services/upload.service');
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(ORIGINAL_PREVIEW_LOGO_SVG).toString('base64')}`;
  const uploaded = await uploadBase64Image(dataUri, `tenant-logos/${TENANT_SLUG}`, {
    publicId: 'cave-divers-provisional-wordmark',
    overwrite: true,
  });
  return uploaded.url;
}

/**
 * Fields that stay cleared until the centre confirms a commercial term. These
 * are exactly the ones that could produce a price, a bookable slot or a promise
 * we cannot stand behind. Editorial fields are now written, not cleared.
 */
const operationalUnset = {
  priceFrom: 1,
  pricingOptions: 1,
  addons: 1,
  entryWindows: 1,
  availability: 1,
  cancellationPolicy: 1,
  instantConfirmation: 1,
  mobileTicket: 1,
  hasHotelPickup: 1,
  badges: 1,
  meetingPoint: 1,
  gettingThere: 1,
} as const;

async function applyPlan(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (!args.has(`--confirm-domain=${CUSTOM_DOMAIN}`)) {
    throw new Error(`Apply fence missing. Pass --confirm-domain=${CUSTOM_DOMAIN}.`);
  }

  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const { generatePreviewAccessCode } = await import('../utils/hash');
  const { urlNamespaceReadiness } = await import('../plugins/urlNamespace');

  // Fail closed BEFORE the first write. The catalogue records claim public URLs
  // (`slug` / `pathSlug`), which the namespace guard refuses while writes are
  // paused. Discovering that after the tenant upsert leaves an active tenant
  // with no catalogue — the seed must either do all of its work or none.
  if (!urlNamespaceReadiness().writesReady) {
    throw new Error(
      'URL namespace writes are paused in this environment, so the catalogue cannot be created. '
      + 'Set URL_NAMESPACE_WRITES_READY=true for the target service and re-run. Nothing was written.',
    );
  }

  await connectDatabase();

  try {
    const existingTenant = await Tenant.findOne({ slug: TENANT_SLUG }).select(
      '+previewAccessCode +previewAccessCodeUpdatedAt'
    );
    if (existingTenant && !['active', 'coming_soon', 'pending'].includes(existingTenant.status)) {
      throw new Error(`Refusing to reactivate tenant from protected status: ${existingTenant.status}.`);
    }

    const namespaceConflict = await Tenant.findOne({
      _id: { $ne: existingTenant?._id },
      $or: [
        { domain: CAVE_DIVERS_TENANT.domain },
        { customDomain: CUSTOM_DOMAIN },
      ],
    }).select('_id slug');
    if (namespaceConflict) {
      throw new Error('Cave Divers domain namespace is already owned by another tenant.');
    }

    if (existingTenant) {
      const bookableActiveCount = await Attraction.countDocuments({
        status: 'active',
        enquiryOnly: { $ne: true },
        $or: [{ ownerTenantId: existingTenant._id }, { tenantIds: existingTenant._id }],
      });
      if (bookableActiveCount > 0) {
        throw new Error('Refusing to reseed while Cave Divers has bookable active catalogue records.');
      }
    }

    const existingTargetTours = await Attraction.find({
      slug: { $in: CAVE_DIVERS_TOURS.map((tour) => tour.slug) },
    }).select('_id slug status enquiryOnly ownerTenantId images');
    const overwriteBlock = catalogueOverwriteBlocker(
      existingTargetTours.map((record) => ({
        slug: record.slug,
        status: record.status,
        enquiryOnly: record.enquiryOnly === true,
        ownedByCaveTenant: Boolean(
          existingTenant && record.ownerTenantId && record.ownerTenantId.equals(existingTenant._id),
        ),
        hasOwner: Boolean(record.ownerTenantId),
      })),
    );
    if (overwriteBlock) throw new Error(overwriteBlock);

    // Rule B5: print every record this run will touch BEFORE anything is
    // written, so the operator can compare the plan against the target
    // database before the first mutation.
    console.log(JSON.stringify({
      mode: 'pre-apply-report',
      target: {
        tenant: existingTenant
          ? { action: 'update', slug: existingTenant.slug, status: existingTenant.status, designMode: existingTenant.designMode }
          : { action: 'create', slug: TENANT_SLUG },
        customDomain: { value: CUSTOM_DOMAIN, status: 'unconfigured', migrated: false, dnsChanged: false },
      },
      catalogue: CAVE_DIVERS_TOURS.map((tour) => {
        const existing = existingTargetTours.find((record) => record.slug === tour.slug);
        return {
          slug: tour.slug,
          path: `/dive-programs/${tour.pathSlug}`,
          action: existing ? 'update-enquiry-only' : 'create-enquiry-only',
          existingStatus: existing?.status ?? null,
          resultStatus: 'active',
        };
      }),
    }, null, 2));

    const logo = existingTenant?.logo?.includes('res.cloudinary.com')
      ? existingTenant.logo
      : await uploadOriginalPreviewLogo();
    const previewAccessCode = existingTenant?.previewAccessCode || generatePreviewAccessCode();
    const previewAccessCodeUpdatedAt = existingTenant?.previewAccessCodeUpdatedAt || new Date();

    const tenant = await Tenant.findOneAndUpdate(
      { slug: TENANT_SLUG },
      {
        $set: {
          ...CAVE_DIVERS_TENANT,
          heroImages: existingTenant?.heroImages?.length
            ? existingTenant.heroImages
            : CAVE_DIVERS_TENANT.heroImages,
          logo,
          logoDark: logo,
          favicon: logo,
          previewAccessCode,
          previewAccessCodeUpdatedAt,
        },
        $unset: {
          customDomainAliasesAddedAt: 1,
          customDomainLastCheckedAt: 1,
          customDomainLastError: 1,
          customDomainLastChangedBy: 1,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    for (const [index, tour] of CAVE_DIVERS_TOURS.entries()) {
      const existingTour = existingTargetTours.find((record) => record.slug === tour.slug);
      await Attraction.findOneAndUpdate(
        { slug: tour.slug },
        {
          $set: {
            slug: tour.slug,
            pathSlug: tour.pathSlug,
            parentPage: { label: 'Dive programmes', path: '/dive-programs' },
            ...customerFacingContent(tour),
            images: existingTour?.images || [],
            currency: 'EUR',
            rating: 0,
            reviewCount: 0,
            tenantIds: [tenant._id],
            ownerTenantId: tenant._id,
            reseller: { enabled: false, value: 0, allowedTenants: [] },
            enquiryOnly: true,
            status: 'active',
            featured: false,
            sortOrder: index + 1,
          },
          $unset: operationalUnset,
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: false },
      );
      // Guard against schema defaults from older records or future model changes,
      // and clear any duration a previous run may have written to a record whose
      // published length is still contradicted by the source.
      await Attraction.updateOne(
        { slug: tour.slug },
        { $unset: { ...operationalUnset, ...(tour.duration ? {} : { duration: 1 }) } },
      );
    }

    const targetCount = await Attraction.countDocuments({
      ownerTenantId: tenant._id,
      slug: { $in: CAVE_DIVERS_TOURS.map((tour) => tour.slug) },
      status: 'active',
      enquiryOnly: true,
    });
    const bookableActiveCount = await Attraction.countDocuments({
      status: 'active',
      enquiryOnly: { $ne: true },
      $or: [{ ownerTenantId: tenant._id }, { tenantIds: tenant._id }],
    });
    if (targetCount !== CAVE_DIVERS_TOURS.length || bookableActiveCount !== 0) {
      throw new Error(
        `Post-apply safety check failed (enquiryOnly=${targetCount}, bookableActive=${bookableActiveCount}).`,
      );
    }

    console.log(JSON.stringify({
      mode: 'applied',
      tenant: {
        slug: tenant.slug,
        status: tenant.status,
        designMode: tenant.designMode,
        domainMigrated: tenant.domainMigrated,
        customDomainStatus: tenant.customDomainStatus,
      },
      catalogue: { enquiryOnly: targetCount, bookableActive: bookableActiveCount },
      safeguards: [
        'preview access code retained or generated but never printed',
        'original provisional logo uploaded; no source imagery imported',
        'no price, availability, payment, review or booking terms published',
        'no DNS, domain alias, deployment, notification or admin mutation',
      ],
    }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

export async function main(): Promise<void> {
  const errors = validateCaveDiversPlan();
  if (errors.length) throw new Error(`Seed plan is invalid:\n- ${errors.join('\n- ')}`);

  const args = new Set(process.argv.slice(2));
  if (!args.has('--apply')) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      tenant: {
        slug: TENANT_SLUG,
        status: CAVE_DIVERS_TENANT.status,
        designMode: CAVE_DIVERS_TENANT.designMode,
        customDomain: CUSTOM_DOMAIN,
        customDomainStatus: CAVE_DIVERS_TENANT.customDomainStatus,
        domainMigrated: CAVE_DIVERS_TENANT.domainMigrated,
      },
      catalogue: CAVE_DIVERS_TOURS.map((tour) => ({
        path: `/dive-programs/${tour.pathSlug}`,
        title: tour.title,
        category: tour.category,
        status: tour.status,
        operationalFields: 'withheld',
      })),
      safeguards: [
        'no database connection',
        'no asset upload',
        'no competitor copy, imagery, prices, ratings or reviews',
        'no DNS, domain alias, deployment, notification or admin mutation',
        'all seven catalogue records are visible but remain enquiry-only',
      ],
    }, null, 2));
    return;
  }

  await applyPlan();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[cave-divers] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
