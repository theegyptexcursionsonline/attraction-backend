/**
 * Seed/upsert the Royal SeaScope tenant.
 *
 * Royal SeaScope is the first standalone boat-brand tenant under the Egypt
 * Sunmarine portfolio (designMode=seascope). Yellow semi-submarine fleet —
 * 16 boats across Ain Sokhna, Dahab, Sharm El Sheikh, Hurghada, Makadi Bay,
 * Safaga and Marsa Alam. Family-friendly underwater experience that does
 * not require getting wet.
 *
 * Idempotent. Creates the tenant if it doesn't exist; updates it in place
 * if it does. Run via:
 *   npx ts-node src/scripts/seed-royal-seascope-tenant.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';

const TENANT_SLUG = 'royal-seascope';

const CUSTOM_PAGES = [
  {
    slug: 'story',
    title: 'Our Story',
    metaTitle: 'Our Story | Royal SeaScope',
    metaDescription:
      'How a single yellow semi-submarine launched in Sharm El Sheikh in 2004 grew into the Red Sea\'s largest underwater family fleet.',
    body: `
<section>
  <p>Royal SeaScope launched in 2004 in Sharm El Sheikh as part of the Egypt Sunmarine family. The brief was simple: give every family a way to see the Red Sea reef without getting wet — without diving certifications, without wetsuits, without leaving anyone behind.</p>
  <p>The first Yellow SeaScope was a 35-metre semi-submarine with sixteen panoramic windows below the waterline. Children pressed their faces to the glass. Grandparents stood beside them. A parrotfish drifted past at eye level. By the end of that first summer, every boat was fully booked.</p>
  <p>In 2006 we expanded to Hurghada and Marsa Alam. By 2013 we operated twelve submarines across the Red Sea's most iconic resorts. By 2022, ten new high-end boats joined the fleet and we opened in Dahab, Safaga and Ain Sokhna. In 2025 we conquered Makadi Bay.</p>
  <p>Today, Royal SeaScope runs sixteen submarines across seven cities. The pattern is exactly the same as on day one. Step inside the air-conditioned cabin. Descend two metres below the surface. Sail through the reef for ninety minutes. The Red Sea, without the wetsuit.</p>
</section>`.trim(),
    sortOrder: 1,
  },
  {
    slug: 'how-it-works',
    title: 'How It Works',
    metaTitle: 'How a Yellow SeaScope Trip Works | Royal SeaScope',
    metaDescription:
      'Step-by-step: hotel pickup, marina boarding, sun deck, the cabin descends two metres below the surface, ninety minutes of reef, drinks, hotel drop-off.',
    body: `
<section data-steps="true">
  <article data-step="01" data-name="Hotel pickup">
    <h3>Hotel pickup &amp; transfer</h3>
    <p>Air-conditioned Majestic Travel van collects you from your hotel lobby. 30-50 minute drive to the marina depending on your city. Our crew greets you on arrival.</p>
  </article>
  <article data-step="02" data-name="Marina boarding">
    <h3>Welcome &amp; safety briefing</h3>
    <p>Short walk down the marina jetty. Safety briefing in English, German, Italian, Russian or Arabic. Board the yellow semi-submarine — 35 metres long, room for 40 to 77 guests.</p>
  </article>
  <article data-step="03" data-name="Sun deck">
    <h3>Sun deck before the dive</h3>
    <p>15 minutes on the open upper deck as we sail to the reef. Spot pelicans, feel the Red Sea breeze. Optional snorkel stop on Premium packages.</p>
  </article>
  <article data-step="04" data-name="Below the surface">
    <h3>90 minutes below the surface</h3>
    <p>The cabin descends two metres. Sixteen panoramic windows on each side, families spread across them. Turtles, parrotfish, butterflyfish, lionfish, coral gardens lit by the surface sun. Air-conditioned the entire time.</p>
  </article>
  <article data-step="05" data-name="Surface & home">
    <h3>Surface, drinks, drop-off</h3>
    <p>Back to the marina. Complimentary cold drink on the way out. Van drops you at your hotel. Total trip time door-to-door: ~3 hours.</p>
  </article>
</section>`.trim(),
    sortOrder: 2,
  },
  {
    slug: 'fleet',
    title: 'Our Fleet — 16 Submarines',
    metaTitle: 'The Fleet | Royal SeaScope',
    metaDescription:
      'Sixteen yellow semi-submarines spread across seven Red Sea cities. Specs, capacity, departure windows, and what makes each boat distinct.',
    body: `
<section data-fleet="true">
  <article data-code="SS-01" data-name="Sharm Flagship" data-capacity="77" data-city="Sharm El Sheikh">
    <h3>Sharm El Sheikh · the flagship base</h3>
    <p>The original 2004 boat plus three sister submarines. Daily 09:00 → 18:30, every 1.5 hours. Reef sites: Tiran Strait, Ras Mohammed.</p>
  </article>
  <article data-code="SS-02" data-name="Hurghada Fleet" data-capacity="77" data-city="Hurghada">
    <h3>Hurghada · four-boat rotation</h3>
    <p>Largest single-city fleet. Daily 09:00 → 18:30. Reef sites: Giftun Island, Mahmya, Aldjir.</p>
  </article>
  <article data-code="SS-03" data-name="Makadi Bay" data-capacity="60" data-city="Makadi Bay">
    <h3>Makadi Bay · since 2025</h3>
    <p>Two boats running the southern Hurghada reefs. House reef and outer reef trips daily.</p>
  </article>
  <article data-code="SS-04" data-name="Marsa Alam South" data-capacity="77" data-city="Marsa Alam">
    <h3>Marsa Alam · deep south</h3>
    <p>Three submarines · the warmest water in the Red Sea · biggest schools of fish · best whale-shark sightings (April-June).</p>
  </article>
  <article data-code="SS-05" data-name="Safaga · Dahab · Ain Sokhna" data-capacity="60" data-city="Multiple">
    <h3>Safaga · Dahab · Ain Sokhna · 2022 expansion</h3>
    <p>Boats added in 2022. One submarine per city. Smaller, more intimate trips · fewer crowds · same panoramic windows.</p>
  </article>
</section>`.trim(),
    sortOrder: 3,
  },
  {
    slug: 'cities',
    title: 'Cities We Sail',
    metaTitle: 'Cities | Royal SeaScope',
    metaDescription:
      'Seven Red Sea cities, seven different reef stories. From Ain Sokhna in the north to Marsa Alam in the deep south.',
    body: `
<section>
  <p>Royal SeaScope launches from seven cities along the Egyptian Red Sea coast. Each has its own reef character, its own family of marine life, its own arrival drink.</p>
  <h3>Sharm El Sheikh (since 2004)</h3>
  <p>Where it all started. Tiran Strait reef, Ras Mohammed National Park. Crystal visibility, big pelagic species.</p>
  <h3>Hurghada (since 2006)</h3>
  <p>The biggest fleet. Giftun Island reefs, Mahmya, and the Aldjir wreck. Family favourite.</p>
  <h3>Marsa Alam (since 2006)</h3>
  <p>The deep south. Warmest water, biggest schools, occasional dolphin and whale-shark sightings April through June.</p>
  <h3>Makadi Bay (since 2025)</h3>
  <p>Recent expansion. House reef trips, ideal for resort-bound families with kids who don't want a long transfer.</p>
  <h3>Safaga · Dahab · Ain Sokhna (2022 expansion)</h3>
  <p>Smaller, quieter operations. Newer reefs, fewer crowds, the same sixteen-window cabin.</p>
</section>`.trim(),
    sortOrder: 4,
  },
  {
    slug: 'family-safe',
    title: 'Family Safe · All Ages',
    metaTitle: 'Family Safety | Royal SeaScope',
    metaDescription:
      'Sixteen boats. Twenty-two years. Zero serious incidents. What makes a Royal SeaScope trip suitable for everyone from toddlers to grandparents.',
    body: `
<section>
  <h3>No swimming required</h3>
  <p>You do not get in the water. The cabin stays sealed, air-conditioned, and two metres below the surface. Children who can't swim and grandparents with mobility limitations can both come aboard.</p>
  <h3>Wheelchair-accessible</h3>
  <p>All boats have ramp boarding from the marina. Reserved window seats for guests with reduced mobility. Crew assistance available on request — please note at booking.</p>
  <h3>Children</h3>
  <p>All ages welcome. Children under 4 are free with a paying adult. Kids 4-12 pay our reduced child rate. Booster seats and child life-jackets provided on the sun deck.</p>
  <h3>Safety record</h3>
  <p>22 years operating. 16 submarines. Zero serious incidents. Every boat carries full marine insurance and meets all Egyptian Ministry of Tourism safety standards. Two crew members on every trip with marine first-aid certification.</p>
</section>`.trim(),
    sortOrder: 5,
  },
];

const SEO_KEYWORDS = [
  'royal seascope',
  'yellow submarine egypt',
  'hurghada submarine',
  'sharm submarine',
  'marsa alam submarine',
  'semi-submarine red sea',
  'underwater tour egypt',
  'family snorkeling alternative',
];

const NAVIGATION = [
  { label: 'Submarines', href: '/submarines' },
  { label: 'Fleet', href: '/fleet' },
  { label: 'Cities', href: '/cities' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Story', href: '/story' },
  { label: 'Contact', href: '/contact' },
];

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

    const before = isNew ? { status: 'new' } : {
      designMode: (tenant as any).designMode,
      customDomain: (tenant as any).customDomain,
      flatUrls: (tenant as any).flatUrls,
      status: (tenant as any).status,
      customPagesCount: ((tenant as any).customPages || []).length,
    };
    console.log('Before:', JSON.stringify(before, null, 2));

    (tenant as any).slug = TENANT_SLUG;
    (tenant as any).name = 'Royal SeaScope';
    (tenant as any).tagline = 'Yellow semi-submarines · since 2004';
    (tenant as any).description =
      'Royal SeaScope runs sixteen yellow semi-submarines across seven Red Sea cities. See the reef from a sealed air-conditioned cabin two metres below the surface — sixteen panoramic windows, no swimming required, family-safe for all ages. Part of the Egypt Sunmarine family.';
    (tenant as any).domain = 'royal-seascope.foxesnetwork.com';
    (tenant as any).customDomain = 'royalseascope.com';
    (tenant as any).logo = '/logos/royal-seascope.png';
    (tenant as any).favicon = '/favicon.png';
    (tenant as any).theme = {
      primaryColor: '#FFD200',
      secondaryColor: '#0A1F4E',
      accentColor: '#F5A623',
    };
    (tenant as any).fonts = {
      heading: 'Anton',
      body: 'Inter',
    };
    (tenant as any).designMode = 'seascope';
    (tenant as any).flatUrls = true;
    (tenant as any).defaultCurrency = 'USD';
    (tenant as any).defaultLanguage = 'en';
    (tenant as any).supportedLanguages = ['en', 'de', 'ru', 'ar', 'it', 'fr'];
    (tenant as any).timezone = 'Africa/Cairo';
    (tenant as any).contactInfo = {
      email: 'dive@royalseascope.com',
      phone: '+20 65 346 0240',
      whatsapp: '+20 100 348 0240',
      address: 'Hurghada Marina · Red Sea coast · Egypt',
      supportHours: 'Departures 09:00–18:30 daily',
    };
    (tenant as any).socialLinks = {
      facebook: 'https://facebook.com/royalseascope',
      instagram: 'https://instagram.com/royalseascope',
      tiktok: 'https://tiktok.com/@royalseascope',
    };
    (tenant as any).navigation = NAVIGATION;
    (tenant as any).seoSettings = {
      metaTitle: 'Royal SeaScope · See the Red Sea Reef, Stay Dry',
      metaDescription:
        'Yellow semi-submarines across seven Red Sea cities — Sharm, Hurghada, Marsa Alam, Makadi Bay, Safaga, Dahab, Ain Sokhna. Sixteen underwater windows. No diving required. Family-friendly. Since 2004.',
      keywords: SEO_KEYWORDS,
    };
    if (!(tenant as any).status || ((tenant as any).status !== 'active' && (tenant as any).status !== 'coming_soon')) {
      (tenant as any).status = 'coming_soon';
    }

    const existingPages = ((tenant as any).customPages || []) as { slug: string }[];
    const ourSlugs = new Set(CUSTOM_PAGES.map((p) => p.slug));
    const preserved = existingPages.filter((p) => !ourSlugs.has(p.slug));
    (tenant as any).customPages = [...preserved, ...CUSTOM_PAGES];

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
    console.log(`\n✅ Royal SeaScope tenant ${isNew ? 'created' : 'updated'}. Status stays coming_soon until activation.`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
