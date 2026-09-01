/**
 * Makadi Excursions tenant and catalog package.
 *
 * Safe by default: running without flags only validates and prints the plan.
 * Applying requires both `--apply` and the exact domain fence below. The tenant
 * remains `coming_soon`, domain migration remains false, and no admin identity,
 * notification, DNS record, deployment, or activation is created here.
 *
 * Dry run:
 *   npm run seed:makadi-excursions
 * Apply after an authorized deployment window:
 *   npm run seed:makadi-excursions -- --apply --confirm-domain=makadi-excursions.com
 */

type PricingModel = 'per-person' | 'per-booking';

interface SeedOption {
  id: string;
  name: string;
  description: string;
  price: number;
  pricingModel: PricingModel;
  minParticipants?: number;
  maxParticipants?: number;
  childPrice?: number;
  infantPrice?: number;
}

interface SeedTour {
  slug: string;
  pathSlug: string;
  title: string;
  shortDescription: string;
  description: string;
  sourceImage: string;
  city: 'Makadi Bay' | 'Marsa Alam';
  duration: string;
  category: string;
  priceFrom: number;
  pricingOptions: SeedOption[];
  entryWindows: Array<{ label: string; startTime: string; endTime: string }>;
  addons: Array<{ id: string; name: string; description: string; price: number; pricingModel: PricingModel }>;
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  itinerary: Array<{ time: string; duration: string; title: string; description: string }>;
  availabilityType?: 'time-slots' | 'date-only';
}

const SOURCE_ORIGIN = 'https://www.makadi-excursions.com';
const TENANT_SLUG = 'makadi-excursions';
const CUSTOM_DOMAIN = 'makadi-excursions.com';
const SOURCE_LOGO = `${SOURCE_ORIGIN}/wp-content/uploads/2025/12/logo_white_transparent.png`;
const LANGUAGES = ['English', 'German', 'Russian', 'Arabic'];
const CANCELLATION = 'Free cancellation up to 24 hours before departure';
export const MAKADI_HERO_TOUR_PATHS = [
  'marsa-alam-quad-tour',
  'makadi-quad-tour',
  'makadi-spider-buggy',
] as const;
const TRANSFER_ADDON = {
  id: 'el-gouna-transfer',
  name: 'El Gouna hotel transfer',
  description: 'Return transfer from an El Gouna hotel.',
  price: 10,
  pricingModel: 'per-person' as const,
};

const slots = (...values: Array<[string, string, string]>) => values.map(([label, startTime, endTime]) => ({ label, startTime, endTime }));

const personOption = (price: number, maxParticipants: number): SeedOption => ({
  id: 'standard',
  name: 'Standard experience',
  description: 'Price for each adult or child.',
  price,
  childPrice: price,
  infantPrice: 0,
  pricingModel: 'per-person',
  minParticipants: 1,
  maxParticipants,
});

const commonInclusions = ['Guided experience', 'Required activity equipment', 'Photo stops with your own camera'];
const commonExclusions = ['Personal expenses', 'Optional gratuities', 'Optional El Gouna transfer unless selected'];

export const MAKADI_EXCURSIONS_TENANT = {
  slug: TENANT_SLUG,
  name: 'Makadi Excursions',
  domain: 'makadi-excursions.foxesnetwork.com',
  customDomain: CUSTOM_DOMAIN,
  domainMigrated: false,
  customDomainStatus: 'unconfigured',
  logo: SOURCE_LOGO,
  logoDark: SOURCE_LOGO,
  favicon: SOURCE_LOGO,
  heroImages: [] as string[],
  tagline: 'Go beyond the shoreline.',
  description: 'Desert rides and adventures across Makadi Bay and Marsa Alam.',
  theme: { primaryColor: '#0B1D2A', secondaryColor: '#295B77', accentColor: '#E29C45' },
  fonts: { heading: 'Newsreader', body: 'Inter' },
  designMode: 'meridian',
  defaultCurrency: 'EUR',
  defaultLanguage: 'en',
  supportedLanguages: ['en'],
  timezone: 'Africa/Cairo',
  contactInfo: {
    email: 'contact@makadi-excursions.com',
    phone: '+20 100 374 5505 / +31 6 16 93 75 22',
    address: 'Safaga Road, Makadi Bay, Red Sea Governorate 84515, Hurghada, Egypt',
    supportHours: 'Mon–Fri 09:00–18:00 · Sat 09:00–17:00 · Sun 10:00–17:00',
  },
  socialLinks: {},
  flatUrls: false,
  status: 'coming_soon',
  navigation: [
    { label: 'Home', href: '/' },
    { label: 'Adventures', href: '/makadi-adventures' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ],
  seoSettings: {
    metaTitle: 'Makadi Excursions | Makadi Bay & Marsa Alam Desert Adventures',
    metaDescription: 'Book camel rides, horse riding, quad tours, private buggy packages and desert dinner experiences across Makadi Bay and Marsa Alam.',
    keywords: ['Makadi Bay excursions', 'Marsa Alam desert tours', 'Makadi quad tour', 'Makadi camel ride'],
  },
  paymentSettings: { enabledGateways: ['pay-later'], ownPaymentGateway: false, stripe: { enabled: false } },
  bundleSettings: { mode: 'off', reason: 'Tenant launch package does not expose bundles.' },
  aiSettings: {
    bookingWidget: { enabled: false, position: 'bottom-right', languages: ['en'], autoOpen: false },
    voiceAgent: { enabled: false, languages: ['en'], buttonPosition: 'bottom-right' },
    searchWidget: { enabled: true, placeholder: 'Search camel, quad, buggy or dinner', showPopularSearches: true, maxSuggestions: 6 },
  },
} as const;

export const MAKADI_EXCURSIONS_TOURS: SeedTour[] = [
  {
    slug: 'makadi-excursions-makadi-camel-ride', pathSlug: 'makadi-camel-ride', title: 'Makadi Bay Camel Ride',
    shortDescription: 'A calm two-hour camel route across desert plains, rock formations and the Red Sea shoreline.',
    description: 'Travel at a camel’s natural pace through the open landscape of Makadi Bay. The route crosses sandy plains and rock formations before reaching the coast, with time to take in the surroundings and make guided photo stops. The atmosphere changes across the day, from soft morning light to the warmer tones of late afternoon.',
    sourceImage: `${SOURCE_ORIGIN}/wp-content/uploads/2025/12/IMG-20260424-WA0033-scaled.jpg`, city: 'Makadi Bay', duration: '2 hours', category: 'Desert Adventures', priceFrom: 15,
    pricingOptions: [personOption(15, 10)], entryWindows: slots(['Early route', '07:00', '09:00'], ['Morning route', '10:00', '12:00'], ['Midday route', '13:00', '15:00'], ['Afternoon route', '15:00', '17:00']), addons: [TRANSFER_ADDON],
    highlights: ['Traditional camel ride', 'Desert and coastal scenery', 'Guided photo stops'], inclusions: commonInclusions, exclusions: commonExclusions,
    itinerary: [{ time: 'Departure', duration: '2 hours', title: 'Desert and coast route', description: 'Camel ride with scenic and photo stops.' }],
  },
  {
    slug: 'makadi-excursions-makadi-desert-dinner', pathSlug: 'makadi-desert-dinner-show', title: 'Makadi Bay Desert Adventure, Dinner & Show',
    shortDescription: 'A six-hour afternoon combining quad, buggy, horse and camel activities with a desert dinner and show.',
    description: 'Begin with active desert sessions on a quad bike and spider buggy, then slow the pace with horse and camel riding. The experience continues into the evening with dinner and live entertainment in the desert setting.',
    sourceImage: `${SOURCE_ORIGIN}/wp-content/uploads/2026/04/224.jpg`, city: 'Makadi Bay', duration: '6 hours', category: 'Desert Adventures', priceFrom: 35,
    pricingOptions: [personOption(35, 50)], entryWindows: slots(['Afternoon departure', '14:00', '20:00']), addons: [TRANSFER_ADDON],
    highlights: ['Quad and spider buggy sessions', 'Horse and camel riding', 'Dinner and live show'], inclusions: [...commonInclusions, 'Dinner and show'], exclusions: commonExclusions,
    itinerary: [{ time: '14:00', duration: '30 min', title: 'Quad bike session', description: 'Guided desert ride.' }, { time: 'Afternoon', duration: '30 min', title: 'Spider buggy session', description: 'Buggy driving segment.' }, { time: 'Evening', duration: '—', title: 'Dinner and show', description: 'Desert dinner with entertainment.' }],
  },
  {
    slug: 'makadi-excursions-makadi-quad-tour', pathSlug: 'makadi-quad-tour', title: 'Makadi Bay Quad Tour',
    shortDescription: 'A two-hour guided quad route with five daily departure choices.',
    description: 'Ride a quad bike through the Makadi Bay desert on a guided two-hour route. Multiple departures let guests choose the light and temperature that suit their day, with stops along the route for the landscape and photos.',
    sourceImage: `${SOURCE_ORIGIN}/wp-content/uploads/2025/11/g65f1b4c370e2d951f7b673e91077038f7164f231caa0b8a93283be0b38b2f6045d90cbef02eb53fee940d3500e206d9545c88e77c146226357785723a735341e_1280-4378202.jpg`, city: 'Makadi Bay', duration: '2 hours', category: 'Quad Tours', priceFrom: 15,
    pricingOptions: [personOption(15, 30)], entryWindows: slots(['Sunrise route', '07:00', '09:00'], ['Morning route', '10:00', '12:00'], ['Midday route', '13:00', '15:00'], ['Afternoon route', '15:00', '17:00'], ['Sunset route', '17:00', '19:00']), addons: [TRANSFER_ADDON],
    highlights: ['Five daily departure choices', 'Two-hour guided quad route', 'Open desert scenery'], inclusions: commonInclusions, exclusions: commonExclusions,
    itinerary: [{ time: 'Selected time', duration: '2 hours', title: 'Guided quad route', description: 'Safety briefing, desert ride and photo stops.' }],
  },
  {
    slug: 'makadi-excursions-makadi-spider-buggy', pathSlug: 'makadi-spider-buggy', title: 'Makadi Bay Spider Buggy Tour',
    shortDescription: 'A private two-hour spider buggy package for groups of one to four people.',
    description: 'Choose the buggy size that fits your party, then take a guided two-hour route through the Makadi Bay desert. Each package is charged once for the buggy rather than once per passenger.',
    sourceImage: `${SOURCE_ORIGIN}/wp-content/uploads/2026/01/PHOTO-2026-02-01-22-37-11-3.jpg`, city: 'Makadi Bay', duration: '2 hours', category: 'Buggy Tours', priceFrom: 50,
    pricingOptions: [
      { id: 'buggy-1-2', name: 'Spider buggy for 1–2 people', description: 'One private buggy with capacity for up to two.', price: 50, pricingModel: 'per-booking', minParticipants: 1, maxParticipants: 2 },
      { id: 'buggy-3-4', name: 'Spider buggy for 3–4 people', description: 'One private buggy for a group of three or four.', price: 75, pricingModel: 'per-booking', minParticipants: 3, maxParticipants: 4 },
    ], entryWindows: slots(['Early route', '07:00', '09:00'], ['Morning route', '10:00', '12:00'], ['Midday route', '13:00', '15:00'], ['Afternoon route', '15:00', '17:00']), addons: [TRANSFER_ADDON],
    highlights: ['Private buggy package', 'Clear 1–2 and 3–4 person options', 'Four departure choices'], inclusions: commonInclusions, exclusions: commonExclusions,
    itinerary: [{ time: 'Selected time', duration: '2 hours', title: 'Private buggy route', description: 'Briefing followed by a guided spider buggy route.' }],
  },
  {
    slug: 'makadi-excursions-makadi-horse-ride', pathSlug: 'makadi-horse-ride', title: 'Makadi Bay Horse Riding Tour',
    shortDescription: 'A two-hour guided horse ride with dawn, morning, afternoon and sunset departures.',
    description: 'Experience the Makadi Bay landscape on horseback during a guided two-hour ride. Four departures range from early dawn to late afternoon so guests can choose the conditions and light they prefer.',
    sourceImage: `${SOURCE_ORIGIN}/wp-content/uploads/2025/12/04-37-scaled.jpg`, city: 'Makadi Bay', duration: '2 hours', category: 'Horse Riding', priceFrom: 15,
    pricingOptions: [personOption(15, 10)], entryWindows: slots(['Dawn ride', '05:00', '07:00'], ['Morning ride', '08:00', '10:00'], ['Afternoon ride', '15:00', '17:00'], ['Sunset ride', '17:00', '19:00']), addons: [TRANSFER_ADDON],
    highlights: ['Four daily ride times', 'Two-hour guided route', 'Dawn and sunset choices'], inclusions: commonInclusions, exclusions: commonExclusions,
    itinerary: [{ time: 'Selected time', duration: '2 hours', title: 'Guided horse ride', description: 'Horse introduction followed by the selected desert route.' }],
  },
  {
    slug: 'makadi-excursions-marsa-alam-spider-buggy', pathSlug: 'marsa-alam-spider-buggy', title: 'Marsa Alam Spider Buggy Tour',
    shortDescription: 'A private two-hour spider buggy package in Marsa Alam for one to four people.',
    description: 'Take a private spider buggy into the Marsa Alam desert on a guided two-hour route. Choose the package for one to two people or the larger three-to-four-person option; the displayed price covers the buggy.',
    sourceImage: `${SOURCE_ORIGIN}/wp-content/uploads/2026/04/DSC_1635.jpg`, city: 'Marsa Alam', duration: '2 hours', category: 'Buggy Tours', priceFrom: 250,
    pricingOptions: [
      { id: 'buggy-1-2', name: 'Spider buggy for 1–2 people', description: 'One private buggy with capacity for up to two.', price: 250, pricingModel: 'per-booking', minParticipants: 1, maxParticipants: 2 },
      { id: 'buggy-3-4', name: 'Spider buggy for 3–4 people', description: 'One private buggy for a group of three or four.', price: 400, pricingModel: 'per-booking', minParticipants: 3, maxParticipants: 4 },
    ], entryWindows: slots(['Early route', '07:00', '09:00'], ['Morning route', '10:00', '12:00'], ['Midday route', '13:00', '15:00'], ['Afternoon route', '15:00', '17:00']), addons: [],
    highlights: ['Private buggy package', 'Four departure choices', 'Marsa Alam desert route'], inclusions: commonInclusions, exclusions: ['Personal expenses', 'Optional gratuities'],
    itinerary: [{ time: 'Selected time', duration: '2 hours', title: 'Private buggy route', description: 'Briefing followed by a guided Marsa Alam route.' }],
  },
  {
    slug: 'makadi-excursions-marsa-alam-horse-ride', pathSlug: 'marsa-alam-horse-ride', title: 'Marsa Alam Horse Riding Tour',
    shortDescription: 'A two-hour guided horse ride with four departures from early morning to sunset.',
    description: 'Explore the Marsa Alam landscape on horseback during a guided two-hour ride. Departure choices at 07:00, 10:00, 15:00 and 17:00 let guests plan around the rest of their day.',
    sourceImage: `${SOURCE_ORIGIN}/wp-content/uploads/2026/06/04-31-scaled.jpg`, city: 'Marsa Alam', duration: '2 hours', category: 'Horse Riding', priceFrom: 50,
    pricingOptions: [personOption(50, 10)], entryWindows: slots(['Early ride', '07:00', '09:00'], ['Morning ride', '10:00', '12:00'], ['Afternoon ride', '15:00', '17:00'], ['Sunset ride', '17:00', '19:00']), addons: [],
    highlights: ['Four daily ride times', 'Two-hour guided route', 'Marsa Alam landscape'], inclusions: commonInclusions, exclusions: ['Personal expenses', 'Optional gratuities'],
    itinerary: [{ time: 'Selected time', duration: '2 hours', title: 'Guided horse ride', description: 'Horse introduction followed by the selected route.' }],
  },
  {
    slug: 'makadi-excursions-marsa-alam-desert-dinner', pathSlug: 'marsa-alam-desert-dinner-show', title: 'Marsa Alam Desert Adventure, Dinner & Show',
    shortDescription: 'A six-hour multi-activity desert afternoon with camel, buggy and quad segments, dinner and a show.',
    description: 'Start in the afternoon with short camel and spider buggy segments before heading deeper into the desert on a quad bike. The six-hour experience continues with dinner and live entertainment.',
    sourceImage: `${SOURCE_ORIGIN}/wp-content/uploads/2026/04/226.jpg`, city: 'Marsa Alam', duration: '6 hours', category: 'Desert Adventures', priceFrom: 50,
    pricingOptions: [personOption(50, 25)], entryWindows: [], addons: [], availabilityType: 'date-only',
    highlights: ['Camel, buggy and quad activities', 'Six-hour desert program', 'Dinner and live show'], inclusions: [...commonInclusions, 'Dinner and show'], exclusions: ['Personal expenses', 'Optional gratuities'],
    itinerary: [{ time: 'Afternoon', duration: '15 min', title: 'Camel ride', description: 'Short guided camel segment.' }, { time: 'Afternoon', duration: '15 min', title: 'Spider buggy drive', description: 'Introductory buggy segment.' }, { time: 'Evening', duration: '—', title: 'Dinner and show', description: 'Dinner with live entertainment.' }],
  },
  {
    slug: 'makadi-excursions-marsa-alam-quad-tour', pathSlug: 'marsa-alam-quad-tour', title: 'Marsa Alam Quad Tour',
    shortDescription: 'A two-hour guided quad tour with five departures through the day.',
    description: 'Ride a quad bike through the Marsa Alam desert on a guided two-hour route. Five departure choices run from early morning through sunset.',
    sourceImage: `${SOURCE_ORIGIN}/wp-content/uploads/2026/05/2026-5b-scaled.jpg`, city: 'Marsa Alam', duration: '2 hours', category: 'Quad Tours', priceFrom: 30,
    pricingOptions: [personOption(30, 15)], entryWindows: slots(['Early route', '07:00', '09:00'], ['Morning route', '10:00', '12:00'], ['Midday route', '13:00', '15:00'], ['Afternoon route', '15:00', '17:00'], ['Sunset route', '17:00', '19:00']), addons: [],
    highlights: ['Five daily departure choices', 'Two-hour guided quad route', 'Marsa Alam desert scenery'], inclusions: commonInclusions, exclusions: ['Personal expenses', 'Optional gratuities'],
    itinerary: [{ time: 'Selected time', duration: '2 hours', title: 'Guided quad route', description: 'Safety briefing, desert ride and photo stops.' }],
  },
];

export function validateMakadiExcursionsPlan(): string[] {
  const errors: string[] = [];
  if (MAKADI_EXCURSIONS_TOURS.length !== 9) errors.push('Catalog must contain exactly 9 source tours.');
  for (const pathSlug of MAKADI_HERO_TOUR_PATHS) {
    if (!MAKADI_EXCURSIONS_TOURS.some((tour) => tour.pathSlug === pathSlug)) errors.push(`Hero tour is missing: ${pathSlug}`);
  }
  const slugs = new Set<string>();
  const paths = new Set<string>();
  for (const tour of MAKADI_EXCURSIONS_TOURS) {
    if (slugs.has(tour.slug)) errors.push(`Duplicate storage slug: ${tour.slug}`);
    if (paths.has(tour.pathSlug)) errors.push(`Duplicate public path slug: ${tour.pathSlug}`);
    slugs.add(tour.slug);
    paths.add(tour.pathSlug);
    if (!tour.sourceImage.startsWith(`${SOURCE_ORIGIN}/wp-content/uploads/`)) errors.push(`Unapproved source image: ${tour.slug}`);
    if (!tour.pricingOptions.length) errors.push(`Missing pricing options: ${tour.slug}`);
    if (tour.priceFrom !== Math.min(...tour.pricingOptions.map((option) => option.price))) errors.push(`priceFrom mismatch: ${tour.slug}`);
    for (const option of tour.pricingOptions) {
      if (option.pricingModel === 'per-booking' && (!option.minParticipants || !option.maxParticipants || option.minParticipants > option.maxParticipants)) errors.push(`Invalid package bounds: ${tour.slug}/${option.id}`);
    }
    for (const addon of tour.addons) {
      if (addon.id === TRANSFER_ADDON.id && (tour.city !== 'Makadi Bay' || addon.pricingModel !== 'per-person' || addon.price !== 10)) errors.push(`Transfer contract mismatch: ${tour.slug}`);
    }
  }
  return errors;
}

function assertSourceAsset(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.makadi-excursions.com' || !parsed.pathname.startsWith('/wp-content/uploads/')) {
    throw new Error(`Refusing non-allowlisted asset: ${url}`);
  }
  return parsed;
}

async function mirrorSourceImage(url: string, folder: string): Promise<string> {
  assertSourceAsset(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error(`Source image returned ${response.status}: ${url}`);
    const mimeType = response.headers.get('content-type')?.split(';')[0] || '';
    if (!mimeType.startsWith('image/')) throw new Error(`Source asset is not an image: ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error(`Source image size is invalid: ${url}`);
    const { uploadBase64Image } = await import('../services/upload.service');
    const upload = await uploadBase64Image(`data:${mimeType};base64,${bytes.toString('base64')}`, folder);
    return upload.url;
  } finally {
    clearTimeout(timeout);
  }
}

async function applyPlan(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (!args.has(`--confirm-domain=${CUSTOM_DOMAIN}`)) {
    throw new Error(`Apply fence missing. Pass --confirm-domain=${CUSTOM_DOMAIN}.`);
  }

  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  await connectDatabase();

  try {
    const existingTenant = await Tenant.findOne({ slug: TENANT_SLUG });
    if (existingTenant?.status === 'active' && !args.has('--allow-active-update')) {
      throw new Error('Tenant is active. Refusing catalog mutation without --allow-active-update.');
    }

    const existingTours = await Attraction.find({ slug: { $in: MAKADI_EXCURSIONS_TOURS.map((tour) => tour.slug) } }).select('slug images').lean();
    const existingImages = new Map(existingTours.map((tour) => [tour.slug, tour.images?.[0]]));
    const logo = existingTenant?.logo?.includes('res.cloudinary.com')
      ? existingTenant.logo
      : await mirrorSourceImage(SOURCE_LOGO, `tenant-logos/${TENANT_SLUG}`);
    const tourImages = new Map<string, string>();

    for (const tour of MAKADI_EXCURSIONS_TOURS) {
      const existingImage = existingImages.get(tour.slug);
      tourImages.set(tour.slug, existingImage?.includes('res.cloudinary.com')
        ? existingImage
        : await mirrorSourceImage(tour.sourceImage, `tours/${TENANT_SLUG}/${tour.pathSlug}`));
    }

    const heroImages = MAKADI_HERO_TOUR_PATHS.map((pathSlug) => {
      const tour = MAKADI_EXCURSIONS_TOURS.find((candidate) => candidate.pathSlug === pathSlug);
      if (!tour) throw new Error(`Hero tour is missing: ${pathSlug}`);
      return tourImages.get(tour.slug) as string;
    });
    const tenant = await Tenant.findOneAndUpdate(
      { slug: TENANT_SLUG },
      { $set: { ...MAKADI_EXCURSIONS_TENANT, logo, logoDark: logo, favicon: logo, heroImages, status: existingTenant?.status === 'active' ? 'active' : 'coming_soon', domainMigrated: false } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    const coordinatesByCity = {
      'Makadi Bay': { lat: 26.959788860058374, lng: 33.87428453424781 },
      'Marsa Alam': { lat: 25.0676256, lng: 34.8789697 },
    } as const;

    for (const [index, tour] of MAKADI_EXCURSIONS_TOURS.entries()) {
      await Attraction.findOneAndUpdate(
        { slug: tour.slug },
        {
          $set: {
            slug: tour.slug,
            pathSlug: tour.pathSlug,
            parentPage: { label: 'Makadi adventures', path: '/makadi-adventures' },
            title: tour.title,
            shortDescription: tour.shortDescription,
            description: tour.description,
            images: [tourImages.get(tour.slug)],
            category: tour.category,
            destination: { city: tour.city, country: 'Egypt', coordinates: coordinatesByCity[tour.city] },
            duration: tour.duration,
            languages: LANGUAGES,
            rating: 0,
            reviewCount: 0,
            priceFrom: tour.priceFrom,
            currency: 'EUR',
            pricingOptions: tour.pricingOptions,
            addons: tour.addons,
            entryWindows: tour.entryWindows,
            itinerary: tour.itinerary,
            highlights: tour.highlights,
            inclusions: tour.inclusions,
            exclusions: tour.exclusions,
            whatToBring: ['Comfortable shoes', 'Sunglasses', 'Scarf', 'Weather-appropriate clothing'],
            accessibility: ['Not suitable for pregnant guests', 'Not suitable for guests with walking difficulties', 'Not wheelchair accessible'],
            gettingThere: [{ mode: 'Hotel pickup', description: 'Enter your hotel during booking so the operator can arrange the pickup point.' }],
            meetingPoint: { address: tour.city, instructions: 'The confirmed pickup or meeting details appear on the booking confirmation.', mapUrl: '' },
            cancellationPolicy: CANCELLATION,
            instantConfirmation: false,
            mobileTicket: true,
            hasHotelPickup: true,
            badges: ['free-cancellation'],
            availability: { type: tour.availabilityType || 'time-slots', advanceBooking: 365 },
            seo: { metaTitle: `${tour.title} | Makadi Excursions`, metaDescription: tour.shortDescription, keywords: [tour.city, tour.category, tour.title] },
            tenantIds: [tenant._id],
            ownerTenantId: tenant._id,
            reseller: { enabled: false, value: 0, allowedTenants: [] },
            status: 'active',
            featured: index < 6,
            sortOrder: index + 1,
          },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
    }

    console.log(`[makadi-excursions] Applied ${MAKADI_EXCURSIONS_TOURS.length} tours. Tenant remains ${tenant.status}; domainMigrated=${tenant.domainMigrated}.`);
  } finally {
    await disconnectDatabase();
  }
}

export async function main(): Promise<void> {
  const errors = validateMakadiExcursionsPlan();
  if (errors.length) throw new Error(`Seed plan is invalid:\n- ${errors.join('\n- ')}`);

  const args = new Set(process.argv.slice(2));
  if (!args.has('--apply')) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      tenant: { slug: TENANT_SLUG, designMode: 'meridian', status: 'coming_soon', customDomain: CUSTOM_DOMAIN, domainMigrated: false },
      catalog: MAKADI_EXCURSIONS_TOURS.map((tour) => ({ path: `/makadi-adventures/${tour.pathSlug}`, title: tour.title, city: tour.city, priceFrom: tour.priceFrom, pricingModels: tour.pricingOptions.map((option) => option.pricingModel), departures: tour.entryWindows.map((slot) => slot.startTime) })),
      safeguards: ['no database connection', 'no asset upload', 'no DNS or deployment', 'no activation', 'no notification'],
    }, null, 2));
    return;
  }

  await applyPlan();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[makadi-excursions] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
