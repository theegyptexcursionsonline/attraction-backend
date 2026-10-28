/**
 * Seed/upsert the Luxor Air Balloon tenant — wires designMode, theme, fonts,
 * customDomain, navigation, customPages, and seoSettings. Status stays
 * `coming_soon` until Phase 6 activation.
 *
 * Idempotent. Run via: npx ts-node src/scripts/seed-luxor-air-balloon-tenant.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { guardGatewaySeedDocument } from '../services/gatewayDomainScope';
import { Tenant } from '../models/Tenant';

const TENANT_SLUG = 'luxor-air-balloon';

const CUSTOM_PAGES = [
  {
    slug: 'story',
    title: 'Our Story',
    metaTitle: 'Our Story | Luxor Air Balloon',
    metaDescription:
      'Twelve years of sunrise balloon flights over the West Bank — the pilots, the craft, and the obsession that lifts us before dawn.',
    body: `
<section>
  <p>Luxor Air Balloon began with a single white-and-orange envelope inflating on the West Bank at 4:30 AM in 2013. Twelve years later we operate a fleet of five baskets and fly more sunrise hours than any other operator over the Valley of the Kings.</p>
  <p>Our pilots are EAA-accredited (Egyptian Aviation Authority) with combined 32,000+ flight hours. Our chief pilot, Captain Hany Mossad, trained at the Albuquerque International Balloon Fiesta and has flown professionally since 2007.</p>
  <p>We exist because the first light on Hatshepsut's columns deserves witnesses.</p>
</section>`.trim(),
    sortOrder: 1,
  },
  {
    slug: 'flight-experience',
    title: 'What to Expect — Your Sunrise Flight',
    metaTitle: 'Your Sunrise Flight — Step by Step | Luxor Air Balloon',
    metaDescription:
      'From the 04:30 pickup through the 08:00 champagne breakfast — every minute of a Luxor sunrise balloon flight.',
    body: `
<section data-timeline="true">
  <article data-time="04:30" data-label="Hotel Pickup">
    <h3>Pre-Dawn Pickup</h3>
    <p>A driver collects you from your hotel lobby in air-conditioned comfort, hot coffee in hand. The Nile is still mirror-flat.</p>
  </article>
  <article data-time="05:15" data-label="Launch Site Briefing">
    <h3>Briefing &amp; Inflation</h3>
    <p>You meet your pilot at the West Bank launch site. Safety briefing under the still-lavender sky as the envelope rises beside you on roaring burners.</p>
  </article>
  <article data-time="05:45" data-label="Liftoff">
    <h3>Liftoff Over the West Bank</h3>
    <p>The basket lifts almost imperceptibly. You are 30 meters up before you realise the earth has gone quiet. Other balloons drift around you in formation.</p>
  </article>
  <article data-time="06:10" data-label="Hatshepsut + Valley of the Kings">
    <h3>The First Light Hits Hatshepsut</h3>
    <p>Sunrise breaks behind the eastern hills. Hatshepsut's terraced temple lights up beneath you in pink and gold. The Valley of the Kings rolls past on your right.</p>
  </article>
  <article data-time="07:00" data-label="Touchdown">
    <h3>Soft Landing in the Farmland</h3>
    <p>Your pilot picks a spot in the cane fields or banana groves. The basket settles in slow motion. A retrieval truck is already waiting.</p>
  </article>
  <article data-time="08:00" data-label="Champagne Breakfast">
    <h3>Champagne &amp; Certificates</h3>
    <p>Back at our staging tent, a fresh Egyptian breakfast and chilled champagne. Each passenger receives a signed flight certificate.</p>
  </article>
</section>`.trim(),
    sortOrder: 2,
  },
  {
    slug: 'safety',
    title: 'Safety & Our Pilots',
    metaTitle: 'Safety & Pilots | Luxor Air Balloon',
    metaDescription:
      'EAA accreditation, dual-fuel redundancy, twelve-year safety record. The discipline behind every Luxor Air Balloon flight.',
    body: `
<section>
  <h3>Egyptian Aviation Authority Accredited</h3>
  <p>Every pilot in our fleet holds a current EAA commercial balloon licence. Annual recertification, dual medical reviews, and quarterly proficiency checks are mandatory.</p>
  <h3>Equipment</h3>
  <p>We fly Cameron Z-series envelopes (UK-manufactured) with dual-burner Ultra-Magnum tanks. Each basket carries fully redundant fuel systems. Envelopes are retired and replaced after 400 flight hours regardless of condition.</p>
  <h3>Weather Discipline</h3>
  <p>We cancel flights for surface wind above 12 km/h, gust spread above 6 km/h, or visibility below 5 km. Cancellations are full refund or free reschedule. Our weather window is the most conservative in Luxor.</p>
  <h3>Twelve-Year Record</h3>
  <p>Zero serious incidents since launch in 2013. We are independently audited annually.</p>
</section>`.trim(),
    sortOrder: 3,
  },
  {
    slug: 'pricing',
    title: 'Pricing & Inclusions',
    metaTitle: 'Pricing & Inclusions | Luxor Air Balloon',
    metaDescription:
      'Full price list for sunrise balloon flights, private charters, photographer flights, and family flights — what is and is not included.',
    body: `
<section>
  <h3>What every flight includes</h3>
  <ul>
    <li>Air-conditioned hotel transfer (round trip)</li>
    <li>Light morning coffee + biscuit before launch</li>
    <li>Full safety briefing and basket assignment</li>
    <li>~45 minutes flight time over the West Bank</li>
    <li>Champagne breakfast after landing</li>
    <li>Signed flight certificate</li>
    <li>EAA-licensed commercial pilot</li>
  </ul>
  <h3>What is extra</h3>
  <ul>
    <li>Private basket charters (up to 4 passengers)</li>
    <li>Pre-dawn photographer's flight (tripod-friendly basket)</li>
    <li>Couples champagne upgrade</li>
    <li>Full digital photo package (in-basket + landing shots)</li>
    <li>Extended 90-minute Grand Vista route</li>
  </ul>
</section>`.trim(),
    sortOrder: 4,
  },
  {
    slug: 'photographers-flight',
    title: "For Photographers",
    metaTitle: "Photographer's Flight | Luxor Air Balloon",
    metaDescription:
      'Pre-dawn launch, fewer passengers, tripod-friendly basket. The flight designed for professional landscape photographers.',
    body: `
<section>
  <h3>Built for the lens</h3>
  <p>Our Photographer's Pre-Dawn Flight launches 30 minutes earlier than standard departures — you're airborne while the sky is still that 4:50 AM cobalt that no other operator can offer.</p>
  <h3>Why it's different</h3>
  <ul>
    <li>Maximum 8 passengers per basket (vs 16 standard)</li>
    <li>Tripod-stable shooting platform with locked-down corner mounts</li>
    <li>Pilot routes for golden-hour light angles on Hatshepsut + the Colossi of Memnon</li>
    <li>15-minute hover holds over the Valley of the Kings entrance</li>
    <li>Hot coffee in basket — no caffeine withdrawal at 4,500 feet</li>
  </ul>
  <h3>Best months</h3>
  <p>October through March. Pre-book at least 14 days in advance — these slots sell out faster than any other tour we run.</p>
</section>`.trim(),
    sortOrder: 5,
  },
];

const SEO_KEYWORDS = [
  'luxor balloon',
  'luxor air balloon',
  'hot air balloon luxor',
  'sunrise balloon egypt',
  'valley of the kings balloon',
  'hatshepsut balloon',
  'luxor balloon ride',
  'egypt balloon flight',
];

const NAVIGATION = [
  { label: 'Flights', href: '/flights' },
  { label: 'The Experience', href: '/flight-experience' },
  { label: 'Safety', href: '/safety' },
  { label: 'Our Story', href: '/story' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Contact', href: '/contact' },
];

async function main(): Promise<void> {
  await connectDatabase();

  try {
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG });
    if (!tenant) {
      console.error(`Tenant '${TENANT_SLUG}' not found. Aborting.`);
      process.exitCode = 1;
      return;
    }

    const before = {
      designMode: (tenant as any).designMode,
      customDomain: (tenant as any).customDomain,
      flatUrls: (tenant as any).flatUrls,
      status: (tenant as any).status,
      customPagesCount: ((tenant as any).customPages || []).length,
      heroImages: ((tenant as any).heroImages || []).length,
    };
    console.log('Before:', JSON.stringify(before, null, 2));

    // --- Apply all updates ---
    (tenant as any).name = 'Luxor Air Balloon';
    (tenant as any).tagline = 'Sunrise Flights Over the Valley of the Kings';
    (tenant as any).description =
      'Premium sunrise hot-air balloon flights over Luxor’s West Bank. Hatshepsut Temple, Valley of the Kings, and the Nile — all from 4,500 feet at first light. Twelve-year safety record, EAA-licensed pilots, champagne breakfast on landing.';
    (tenant as any).customDomain = 'luxorairballoon.com';
    (tenant as any).logo = '/logos/luxor-air-balloon.png';
    (tenant as any).favicon = '/favicon.png';
    (tenant as any).theme = {
      primaryColor: '#F2643A',
      secondaryColor: '#1A1538',
      accentColor: '#F4A14A',
    };
    (tenant as any).fonts = {
      heading: 'Fraunces',
      body: 'DM Sans',
    };
    (tenant as any).designMode = 'luxorballoon';
    (tenant as any).flatUrls = true;
    (tenant as any).contactInfo = {
      email: 'fly@luxorairballoon.com',
      phone: '+20 95 234 5678',
      whatsapp: '+20 100 200 3040',
      address: 'West Bank Launch Site, Luxor, Egypt',
      supportHours: '03:00–10:00 daily (local time)',
    };
    (tenant as any).socialLinks = {
      facebook: 'https://facebook.com/luxorairballoon',
      instagram: 'https://instagram.com/luxorairballoon',
      tiktok: 'https://tiktok.com/@luxorairballoon',
    };
    (tenant as any).navigation = NAVIGATION;
    (tenant as any).seoSettings = {
      metaTitle: 'Luxor Air Balloon · Sunrise Flights Over the Valley of the Kings',
      metaDescription:
        'Premium sunrise hot-air balloon flights over Luxor’s West Bank. Hatshepsut, the Valley of the Kings, the Nile — from 4,500 feet. EAA-licensed, champagne breakfast included.',
      keywords: SEO_KEYWORDS,
    };
    // Status remains coming_soon until Phase 6
    if ((tenant as any).status !== 'coming_soon' && (tenant as any).status !== 'active') {
      (tenant as any).status = 'coming_soon';
    }

    // Upsert customPages — replace only the 5 page slugs we manage, leave others intact
    const existingPages = ((tenant as any).customPages || []) as { slug: string }[];
    const ourSlugs = new Set(CUSTOM_PAGES.map((p) => p.slug));
    const preserved = existingPages.filter((p) => !ourSlugs.has(p.slug));
    (tenant as any).customPages = [...preserved, ...CUSTOM_PAGES];

    guardGatewaySeedDocument(tenant, tenant.customDomain);
    await tenant.save();

    const after = {
      designMode: (tenant as any).designMode,
      customDomain: (tenant as any).customDomain,
      flatUrls: (tenant as any).flatUrls,
      status: (tenant as any).status,
      customPagesCount: ((tenant as any).customPages || []).length,
    };
    console.log('\nAfter:', JSON.stringify(after, null, 2));
    console.log(`\nCustom pages: ${((tenant as any).customPages || []).map((p: any) => p.slug).join(', ')}`);
    console.log('\n✅ Luxor Air Balloon tenant configured. Status stays coming_soon until activation.');
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
