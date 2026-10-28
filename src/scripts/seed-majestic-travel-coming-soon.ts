/**
 * Seed/upsert the Majestic Travel tenant as a premium coming-soon page.
 *
 * Majestic Travel is the land-transport / travel-agency sister brand inside
 * the Egypt Sunmarine family (50+ vehicle fleet). It ships as a single
 * premium reveal page (designMode=majestic, status=coming_soon, no tours)
 * until Fouad provides the full agency catalog.
 *
 * Idempotent. Run via:
 *   npx ts-node src/scripts/seed-majestic-travel-coming-soon.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { guardGatewaySeedDocument } from '../services/gatewayDomainScope';
import { Tenant } from '../models/Tenant';

const TENANT_SLUG = 'majestic-travel';

const LOGO =
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778909883/attractions-network/tenant-logos/majestic-travel/t3rmdpjkygroupqpxahs.jpg';

async function main(): Promise<void> {
  await connectDatabase();

  try {
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
    (tenant as any).name = 'Majestic Travel';
    (tenant as any).tagline = 'Egypt, on the move';
    (tenant as any).description =
      'Majestic Travel is the land-transport and travel-agency arm of the Egypt Sunmarine family — a 50+ vehicle fleet moving guests across the Red Sea coast and beyond. The full agency experience is launching soon.';
    (tenant as any).domain = 'majestic-travel.foxesnetwork.com';
    (tenant as any).customDomain = 'majestictravel.com';
    (tenant as any).logo = LOGO;
    (tenant as any).favicon = '/favicon.png';
    (tenant as any).theme = {
      primaryColor: '#1E73BE',
      secondaryColor: '#0C2A4D',
      accentColor: '#5BB4E5',
    };
    (tenant as any).fonts = {
      heading: 'Cormorant Garamond',
      body: 'Inter',
    };
    (tenant as any).designMode = 'majestic';
    (tenant as any).flatUrls = false;
    (tenant as any).defaultCurrency = 'USD';
    (tenant as any).defaultLanguage = 'en';
    (tenant as any).supportedLanguages = ['en', 'de', 'ru', 'ar', 'it', 'fr'];
    (tenant as any).timezone = 'Africa/Cairo';
    (tenant as any).contactInfo = {
      email: 'info@majestictravel.com',
      phone: '+20 65 346 0240',
      whatsapp: '+20 100 348 0240',
      address: 'Hurghada · Red Sea coast · Egypt',
      supportHours: 'Sun–Fri · 09:00–18:00',
    };
    (tenant as any).socialLinks = {
      facebook: 'https://facebook.com/majestictravelegypt',
      instagram: 'https://instagram.com/majestictravelegypt',
    };
    (tenant as any).seoSettings = {
      metaTitle: 'Majestic Travel · Coming Soon',
      metaDescription:
        'Majestic Travel — the land-transport and travel-agency arm of the Egypt Sunmarine family. A 50+ vehicle fleet across the Red Sea coast. Launching soon.',
      keywords: [
        'Majestic Travel',
        'Egypt transport',
        'Red Sea transfers',
        'Egypt travel agency',
        'Egypt Sunmarine family',
        'Hurghada transport',
      ],
    };
    // Coming-soon brand: never has tours, no custom pages.
    (tenant as any).customPages = [];
    if (!(tenant as any).status || (tenant as any).status !== 'active') {
      (tenant as any).status = 'coming_soon';
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    guardGatewaySeedDocument(tenant, tenant.customDomain);
    await tenant.save();

    console.log(
      `\n✅ Majestic Travel tenant ${isNew ? 'created' : 'updated'} — designMode=majestic, status=${(tenant as any).status}, customDomain=majestictravel.com`,
    );
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
