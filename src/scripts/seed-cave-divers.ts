/**
 * Cave Divers tenant and provisional catalogue package.
 *
 * The seven catalogue records are intentionally DRAFTS. They carry no price,
 * availability, booking promise, imported image, review, cancellation term, or
 * wildlife guarantee. The tenant is active only so the code-gated shared
 * preview can render the new storefront; the existing custom domain is merely
 * recorded as unconfigured and is never migrated by this script.
 *
 * Dry run (no database or Cloudinary connection):
 *   npm run seed:cave-divers
 * Apply after the matching backend release:
 *   npm run seed:cave-divers -- --apply --confirm-domain=cave-divers.com
 */

interface CaveDraftTour {
  slug: string;
  pathSlug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: 'Daily diving' | 'Dive training' | 'Sea trips';
  sourceUrl: string;
  sourceEvidence: string;
  reviewGate: string[];
  status: 'draft';
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
    'A private Cave Divers preview for daily diving, diver training and Red Sea trips. Programme terms remain under supplier review.',
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
    metaTitle: 'Cave Divers | Red Sea Diving Preview',
    metaDescription:
      'Preview Cave Divers daily diving, training and Red Sea trip programme families while operational details are confirmed.',
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

const commonCommercialGate = [
  'Supplier approval of final title and copy',
  'Price, currency and tax confirmation',
  'Availability, capacity and booking-window confirmation',
  'Inclusions, exclusions, transfers and meeting-point confirmation',
  'Cancellation, payment and confirmation-policy approval',
  'Participant, medical, certification and insurance requirements',
  'Rights-cleared gallery and brand asset approval',
];

export const CAVE_DIVERS_DRAFT_TOURS: CaveDraftTour[] = [
  {
    slug: 'cave-divers-red-sea-daily-diving',
    pathSlug: 'red-sea-daily-diving',
    title: 'Red Sea Daily Diving: Two-Dive Boat Day',
    shortDescription:
      'A provisional daily-diving programme shell based on the operator’s current two-dive boat-day listing.',
    description:
      'Cave Divers currently presents a one-day boat programme built around two dive sites. This draft intentionally withholds the timetable, site selection, equipment, transfers, fees, food and booking terms until the supplier confirms the new catalogue record.',
    category: 'Daily diving',
    sourceUrl: TRIPS_SOURCE,
    sourceEvidence: 'Current first-party Trips page lists a one-day daily-diving package with two dives.',
    reviewGate: [...commonCommercialGate, 'Daily dive-site and boat-operating plan'],
    status: 'draft',
  },
  {
    slug: 'cave-divers-multi-day-daily-diving',
    pathSlug: 'multi-day-daily-diving',
    title: 'Multi-Day Daily Diving Package',
    shortDescription:
      'A provisional multi-day diving package family for customers planning more than one Red Sea dive day.',
    description:
      'The current Cave Divers programme lists several multi-day daily-diving options. This single draft acts as an editorial container only; day counts, dive counts, validity, equipment, meals, transfers, fees and rates must be confirmed before individual bookable options are created.',
    category: 'Daily diving',
    sourceUrl: TRIPS_SOURCE,
    sourceEvidence: 'Current first-party Trips page lists multiple multi-day daily-diving packages.',
    reviewGate: [...commonCommercialGate, 'Approved day-count and dive-count option matrix'],
    status: 'draft',
  },
  {
    slug: 'cave-divers-discover-scuba-diving',
    pathSlug: 'discover-scuba-diving',
    title: 'Discover Scuba Diving — First Dive Day',
    shortDescription:
      'A provisional introductory scuba programme for guests without previous diving experience.',
    description:
      'Cave Divers currently describes a supervised Discover Scuba Diving programme for beginners. This draft does not assert depth, minimum age, medical eligibility, certification outcome, group ratio, equipment, venue, duration or price; each item requires current supplier and training-standard approval.',
    category: 'Dive training',
    sourceUrl: COURSES_SOURCE,
    sourceEvidence: 'Current first-party Courses page lists Discover Scuba Diving as a beginner programme.',
    reviewGate: [...commonCommercialGate, 'Current training-agency wording and instructor-to-guest ratio'],
    status: 'draft',
  },
  {
    slug: 'cave-divers-open-water-diver-course',
    pathSlug: 'open-water-diver-course',
    title: 'Open Water Diver Course',
    shortDescription:
      'A provisional entry-level diver-course shell awaiting an approved syllabus, schedule and commercial terms.',
    description:
      'The current Cave Divers Courses page promotes an Open Water Diver course but presents conflicting three-day and four-day duration statements. No duration is carried into this draft. The syllabus, certification body, learning materials, dives, medical rules, fees and final schedule all remain approval gates.',
    category: 'Dive training',
    sourceUrl: COURSES_SOURCE,
    sourceEvidence: 'Current first-party Courses page lists Open Water Diver with a duration contradiction.',
    reviewGate: [...commonCommercialGate, 'Resolve the source page’s three-day versus four-day contradiction'],
    status: 'draft',
  },
  {
    slug: 'cave-divers-dolphin-house-sea-trip',
    pathSlug: 'dolphin-house-sea-trip',
    title: 'Dolphin House Sea Trip',
    shortDescription:
      'A provisional Red Sea boat-trip programme to the area commonly promoted as Dolphin House.',
    description:
      'Cave Divers currently lists a Dolphin House sea trip. This draft makes no promise of seeing or swimming with dolphins and does not publish a route, activity sequence, transfer, meal, equipment, timing, rate or availability claim until the operator approves those details.',
    category: 'Sea trips',
    sourceUrl: TRIPS_SOURCE,
    sourceEvidence: 'Current first-party Trips page lists a Dolphin House boat trip.',
    reviewGate: [...commonCommercialGate, 'Wildlife-safe wording with an explicit no-sighting guarantee'],
    status: 'draft',
  },
  {
    slug: 'cave-divers-orange-bay-giftun-island',
    pathSlug: 'orange-bay-giftun-island',
    title: 'Orange Bay & Giftun Island Sea Trip',
    shortDescription:
      'A provisional island-trip programme based on Cave Divers’ current Orange Bay listing.',
    description:
      'The current Cave Divers programme references an Orange Bay visit on Giftun Island. Island access, landing arrangements, snorkelling, itinerary, transfers, food and drinks, environmental or park fees, timing, pricing and availability must be confirmed before publication.',
    category: 'Sea trips',
    sourceUrl: TRIPS_SOURCE,
    sourceEvidence: 'Current first-party Trips page lists Orange Bay on Giftun Island.',
    reviewGate: [...commonCommercialGate, 'Current island-landing and park-fee arrangements'],
    status: 'draft',
  },
  {
    slug: 'cave-divers-glass-boat-half-day',
    pathSlug: 'glass-boat-half-day',
    title: 'Glass Boat Half-Day Snorkelling & Island Stop',
    shortDescription:
      'A provisional half-day glass-boat programme combining Red Sea viewing with possible snorkelling and an island stop.',
    description:
      'Cave Divers currently lists a half-day glass-boat programme, but one published afternoon time appears inconsistent. This draft therefore omits all times as well as route, snorkelling count, landing, food, equipment, fees, transfers, rates and availability until corrected source details are approved.',
    category: 'Sea trips',
    sourceUrl: TRIPS_SOURCE,
    sourceEvidence: 'Current first-party Trips page lists a half-day glass boat and contains an apparent time typo.',
    reviewGate: [...commonCommercialGate, 'Correct and approve both departure windows'],
    status: 'draft',
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

export function validateCaveDiversPlan(): string[] {
  const errors: string[] = [];
  if (CAVE_DIVERS_DRAFT_TOURS.length !== 7) {
    errors.push('Catalogue must contain exactly seven provisional records.');
  }
  if (CAVE_DIVERS_TENANT.domainMigrated !== false || CAVE_DIVERS_TENANT.customDomainStatus !== 'unconfigured') {
    errors.push('Custom domain must remain explicitly unconfigured and unmigrated.');
  }
  if (CAVE_DIVERS_TENANT.paymentSettings.enabledGateways.length !== 0) {
    errors.push('No payment gateway may be enabled for the provisional catalogue.');
  }

  const slugs = new Set<string>();
  const pathSlugs = new Set<string>();
  for (const tour of CAVE_DIVERS_DRAFT_TOURS) {
    if (slugs.has(tour.slug)) errors.push(`Duplicate storage slug: ${tour.slug}`);
    if (pathSlugs.has(tour.pathSlug)) errors.push(`Duplicate public path slug: ${tour.pathSlug}`);
    slugs.add(tour.slug);
    pathSlugs.add(tour.pathSlug);
    if (tour.status !== 'draft') errors.push(`Non-draft catalogue record: ${tour.slug}`);
    const source = new URL(tour.sourceUrl);
    if (source.protocol !== 'https:' || source.hostname !== 'www.cave-divers.com') {
      errors.push(`Non-first-party source: ${tour.slug}`);
    }
    const record = tour as unknown as Record<string, unknown>;
    for (const key of forbiddenDraftKeys) {
      if (key in record) errors.push(`Operational field ${key} must not be seeded: ${tour.slug}`);
    }
    if (!tour.reviewGate.length) errors.push(`Missing editorial gate: ${tour.slug}`);
  }

  const persistedPlan = JSON.stringify({ tenant: CAVE_DIVERS_TENANT, tours: CAVE_DIVERS_DRAFT_TOURS });
  if (/getyourguide\.com|white dolphin|diving star|pure coastal|dive red sea/i.test(persistedPlan)) {
    errors.push('Inspiration-only trader material leaked into the Cave Divers data plan.');
  }
  return errors;
}

export interface ExistingCatalogueRecord {
  slug: string;
  status: string;
  /** True only when the record is already owned by the Cave Divers tenant. */
  ownedByCaveTenant: boolean;
  /** True when any tenant owns the record. */
  hasOwner: boolean;
}

/**
 * Returns the reason this run must not write, or null when every matched
 * record is a Cave-owned (or unowned) draft.
 *
 * An owned record is foreign unless this exact tenant already owns it. On a
 * first run there is no Cave tenant yet, so ANY owner is foreign — checking
 * ownership only when the tenant already exists would let a first run adopt
 * another tenant's draft that happens to share a target slug.
 */
export function catalogueOverwriteBlocker(records: ExistingCatalogueRecord[]): string | null {
  for (const record of records) {
    if (record.status !== 'draft') {
      return `Refusing to overwrite non-draft record: ${record.slug}.`;
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

const operationalUnset = {
  priceFrom: 1,
  pricingOptions: 1,
  addons: 1,
  entryWindows: 1,
  itinerary: 1,
  participantRequirements: 1,
  whatToBring: 1,
  needToKnow: 1,
  accessibility: 1,
  gettingThere: 1,
  highlights: 1,
  inclusions: 1,
  exclusions: 1,
  meetingPoint: 1,
  cancellationPolicy: 1,
  instantConfirmation: 1,
  mobileTicket: 1,
  hasHotelPickup: 1,
  badges: 1,
  availability: 1,
  duration: 1,
  languages: 1,
  destination: 1,
  seo: 1,
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
      const activeCount = await Attraction.countDocuments({
        status: 'active',
        $or: [{ ownerTenantId: existingTenant._id }, { tenantIds: existingTenant._id }],
      });
      if (activeCount > 0) {
        throw new Error('Refusing to reseed while Cave Divers has active catalogue records.');
      }
    }

    const existingTargetTours = await Attraction.find({
      slug: { $in: CAVE_DIVERS_DRAFT_TOURS.map((tour) => tour.slug) },
    }).select('_id slug status ownerTenantId');
    const overwriteBlock = catalogueOverwriteBlocker(
      existingTargetTours.map((record) => ({
        slug: record.slug,
        status: record.status,
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
      catalogue: CAVE_DIVERS_DRAFT_TOURS.map((tour) => {
        const existing = existingTargetTours.find((record) => record.slug === tour.slug);
        return {
          slug: tour.slug,
          path: `/dive-programs/${tour.pathSlug}`,
          action: existing ? 'update-draft' : 'create-draft',
          existingStatus: existing?.status ?? null,
          resultStatus: 'draft',
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

    for (const [index, tour] of CAVE_DIVERS_DRAFT_TOURS.entries()) {
      await Attraction.findOneAndUpdate(
        { slug: tour.slug },
        {
          $set: {
            slug: tour.slug,
            pathSlug: tour.pathSlug,
            parentPage: { label: 'Dive programmes', path: '/dive-programs' },
            title: tour.title,
            shortDescription: tour.shortDescription,
            description: tour.description,
            images: [],
            category: tour.category,
            currency: 'EUR',
            rating: 0,
            reviewCount: 0,
            tenantIds: [tenant._id],
            ownerTenantId: tenant._id,
            reseller: { enabled: false, value: 0, allowedTenants: [] },
            status: 'draft',
            featured: false,
            sortOrder: index + 1,
          },
          $unset: operationalUnset,
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: false },
      );
      // Guard against schema defaults from older records or future model changes.
      await Attraction.updateOne({ slug: tour.slug }, { $unset: operationalUnset });
    }

    const targetCount = await Attraction.countDocuments({
      ownerTenantId: tenant._id,
      slug: { $in: CAVE_DIVERS_DRAFT_TOURS.map((tour) => tour.slug) },
      status: 'draft',
    });
    const activeCount = await Attraction.countDocuments({
      status: 'active',
      $or: [{ ownerTenantId: tenant._id }, { tenantIds: tenant._id }],
    });
    if (targetCount !== CAVE_DIVERS_DRAFT_TOURS.length || activeCount !== 0) {
      throw new Error(`Post-apply safety check failed (drafts=${targetCount}, active=${activeCount}).`);
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
      catalogue: { drafts: targetCount, active: activeCount },
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
      catalogue: CAVE_DIVERS_DRAFT_TOURS.map((tour) => ({
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
        'all seven catalogue records remain draft',
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
