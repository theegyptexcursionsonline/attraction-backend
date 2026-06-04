/**
 * Seed/upsert the Hurghada Premium Excursions tenant + a cloned Hurghada-only catalog.
 *
 * Fast client request (hurghadapremiumexcursions.com): active tenant, simple logo,
 * trips only from Hurghada — cloned from the existing canonical Hurghada catalog.
 * Reuses the polished `atlas` (travel-desk) design for an immediate live site.
 *
 * Idempotent. Run via:
 *   npx ts-node src/scripts/seed-hurghada-premium-excursions.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';

const TENANT_SLUG = 'hurghada-premium-excursions';

// Canonical Hurghada departures to clone (active, well-populated, real imagery).
const CLONE_TITLES = [
  'Giftun Island Snorkeling Trip',
  'Hurghada Snorkeling Adventure',
  'Orange Bay Island Excursion',
  'Hurghada Luxury Yacht Cruise',
  'Parasailing in Hurghada',
  'Camel Riding in Hurghada Desert',
  'Horse Riding on Hurghada Beach',
  'Hurghada Deep Sea Fishing',
  'Hurghada Jeep Desert Safari',
  'Hurghada Private City Tour',
  'Hurghada Private Desert Safari',
  'Cairo Day Tour from Hurghada',
  'Luxor Day Tour from Hurghada',
  'Cairo Tour Package',
];

async function main(): Promise<void> {
  await connectDatabase();
  try {
    /* ---------- 1. Tenant ---------- */
    let tenant = await Tenant.findOne({ slug: TENANT_SLUG });
    const isNew = !tenant;
    if (!tenant) {
      console.log(`Tenant '${TENANT_SLUG}' not found — creating new.`);
      tenant = new Tenant({ slug: TENANT_SLUG });
    } else {
      console.log(`Tenant '${TENANT_SLUG}' exists — updating.`);
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    (tenant as any).slug = TENANT_SLUG;
    (tenant as any).name = 'Hurghada Premium Excursions';
    (tenant as any).tagline = 'The best of Hurghada — one trusted desk';
    (tenant as any).description =
      'Hurghada Premium Excursions is your single desk for the best day trips from Hurghada — Red Sea snorkeling and island cruises, desert safaris, sea fishing and parasailing, plus Cairo and Luxor day tours. Hand-picked operators, instant confirmation, hotel pickup included.';
    (tenant as any).domain = 'hurghada-premium-excursions.foxesnetwork.com';
    (tenant as any).customDomain = 'hurghadapremiumexcursions.com';
    (tenant as any).logo = '/logos/hurghada-premium-excursions.png';
    (tenant as any).favicon = '/favicon.png';
    (tenant as any).theme = {
      primaryColor: '#072A33', // deep Red Sea teal ink
      secondaryColor: '#159A8E', // Red Sea turquoise
      accentColor: '#E0B45C', // champagne gold
    };
    (tenant as any).fonts = { heading: 'Cormorant Garamond', body: 'Outfit' };
    (tenant as any).designMode = 'premium';
    (tenant as any).flatUrls = false;
    (tenant as any).defaultCurrency = 'USD';
    (tenant as any).defaultLanguage = 'en';
    (tenant as any).supportedLanguages = ['en', 'de', 'ru', 'ar', 'it', 'fr'];
    (tenant as any).timezone = 'Africa/Cairo';
    (tenant as any).contactInfo = {
      email: 'info@hurghadapremiumexcursions.com',
      phone: '+20 65 355 1200',
      whatsapp: '+20 100 355 1200',
      address: 'Sheraton Road · Hurghada · Red Sea · Egypt',
      supportHours: 'Daily 08:00–22:00',
    };
    (tenant as any).socialLinks = {
      facebook: 'https://facebook.com/hurghadapremiumexcursions',
      instagram: 'https://instagram.com/hurghadapremiumexcursions',
    };
    (tenant as any).navigation = [
      { label: 'Excursions', href: '/attractions' },
      { label: 'Destinations', href: '/destinations' },
      { label: 'Offers', href: '/deals' },
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ];
    (tenant as any).seoSettings = {
      metaTitle: 'Hurghada Premium Excursions · Best Day Trips from Hurghada',
      metaDescription:
        'Book the best excursions from Hurghada — snorkeling, island cruises, desert safaris, fishing, parasailing, and Cairo & Luxor day tours. Instant confirmation, hotel pickup.',
      keywords: [
        'hurghada excursions', 'hurghada day trips', 'giftun island snorkeling',
        'orange bay hurghada', 'hurghada desert safari', 'cairo tour from hurghada',
        'luxor tour from hurghada', 'hurghada premium excursions',
      ],
    };
    (tenant as any).status = 'active';
    /* eslint-enable @typescript-eslint/no-explicit-any */

    await tenant.save();
    const tenantId = (tenant as any)._id;
    console.log(`✅ Tenant ${isNew ? 'created' : 'updated'} — designMode=premium, status=active, _id=${tenantId}`);

    /* ---------- 2. Clone the Hurghada catalog ---------- */
    // Wipe previously-cloned tours for this tenant (idempotent rerun).
    const delRes = await Attraction.deleteMany({ tenantIds: tenantId, slug: { $regex: '-hpe$' } });
    if (delRes.deletedCount) console.log(`Removed ${delRes.deletedCount} previously-cloned tours.`);

    const heroImages: string[] = [];
    let cloned = 0;
    for (const title of CLONE_TITLES) {
      // Best source: active, has images, most reviewed/featured first.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // CLONE_TITLES are all curated Hurghada departures (some have a Cairo/Luxor
      // destination city even though they leave from Hurghada), so match on title only.
      const src: any = await Attraction.findOne({
        title, status: 'active', 'images.0': { $exists: true },
      }).sort({ reviewCount: -1, featured: -1 }).lean();
      if (!src) { console.warn(`  ⚠ no source found for "${title}"`); continue; }

      const base = src.pathSlug || src.slug;
      const copy = { ...src };
      delete copy._id; delete copy.__v; delete copy.createdAt; delete copy.updatedAt;
      copy.slug = `${base}-hpe`;
      copy.pathSlug = base;
      copy.tenantIds = [tenantId];
      copy.status = 'active';
      copy.featured = cloned < 4; // first few featured for the homepage rail
      copy.sortOrder = cloned;

      // #14 reads as a generic Cairo package — make its Hurghada departure explicit
      // so the catalog stays strictly "trips from Hurghada" (client requirement).
      if (title === 'Cairo Tour Package') {
        copy.title = 'Cairo Tour Package from Hurghada';
        copy.slug = 'cairo-tour-package-from-hurghada-hpe';
        copy.pathSlug = 'cairo-tour-package-from-hurghada';
      }

      await Attraction.create(copy);
      cloned += 1;
      if (Array.isArray(src.images) && src.images[0] && heroImages.length < 5) heroImages.push(src.images[0]);
      console.log(`  + cloned "${title}" -> ${copy.slug}`);
    }

    // Set tenant heroImages from cloned tour imagery if not already rich.
    if (heroImages.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (tenant as any).heroImages = heroImages;
      await tenant.save();
      console.log(`Set ${heroImages.length} heroImages on tenant.`);
    }

    console.log(`\n✅ Done — ${cloned}/${CLONE_TITLES.length} Hurghada tours cloned for Hurghada Premium Excursions.`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => { console.error(e); await disconnectDatabase(); process.exit(1); });
