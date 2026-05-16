/**
 * Seed/upsert the Rosetta II Classic Boat tenant.
 *
 * Fifth standalone boat-brand tenant under the Egypt Sunmarine portfolio
 * (designMode=classic). The 25-boat classic snorkeling workhorse fleet —
 * 30m boats, 50–70 guests — from Ain Sokhna, Dahab, Sharm El Sheikh and
 * Hurghada. Accessible, no-frills, the dependable Red Sea snorkel day.
 *
 * Slug is `rosetta-classic-boat` to match the existing dashboard-colors
 * + listing-alias mapping (designMode classic → /snorkeling).
 *
 * Idempotent. Run via:
 *   npx ts-node src/scripts/seed-classic-boat-tenant.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';

const TENANT_SLUG = 'rosetta-classic-boat';

// Logo generated separately (deck has no Classic logo card):
//   npx ts-node src/scripts/generate-classic-boat-logo.ts
const LOGO =
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778917798/attractions-network/tenant-logos/rosetta-classic-boat/xww0279wvviqsmbobtpw.png';

const HERO_IMAGES = [
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873265/attractions-network/tenant-heroes/classic-boat/qrfef8aujsvztpel4lsf.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873268/attractions-network/tenant-heroes/classic-boat/iigaht2f0e9u57j3rxev.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873270/attractions-network/tenant-heroes/classic-boat/g8oxpbzzus05hbmobfbq.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873275/attractions-network/tenant-heroes/classic-boat/nregvzctkamycxvnlfqd.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873277/attractions-network/tenant-heroes/classic-boat/uwgtognnlwjnutlqbm49.jpg',
];

const CUSTOM_PAGES = [
  {
    slug: 'story',
    title: 'Our Story',
    metaTitle: 'Our Story | Rosetta II Classic Boat',
    metaDescription:
      'The dependable Red Sea snorkel day — 25 classic boats across four cities, doing one thing well for decades.',
    body: `
<section>
  <p>Rosetta II Classic Boat is the workhorse of the Egypt Sunmarine family. No theme, no theatre — just the dependable Red Sea snorkel day that has run, rain or shine, for decades.</p>
  <p>The idea was never to be the fanciest boat in the marina. It was to be the one that always sails, always finds fish, always gets families back to the hotel happy. That reliability built a fleet of twenty-five classic 30-metre boats across Ain Sokhna, Dahab, Sharm El Sheikh and Hurghada.</p>
  <p>Today, Rosetta II runs the largest fleet in the family — 25 boats carrying 50–70 guests each. It is the easy, honest, well-priced Red Sea snorkel trip the coast has trusted for years. Part of the Egypt Sunmarine family.</p>
</section>`.trim(),
    sortOrder: 1,
  },
  {
    slug: 'how-it-works',
    title: 'How a Classic Day Works',
    metaTitle: 'How a Rosetta II Classic Boat Day Works',
    metaDescription:
      'Hotel pickup, board the boat, two reef snorkel stops, lunch on board, sun deck, afternoon return.',
    body: `
<section data-steps="true">
  <article data-step="01" data-name="Hotel pickup">
    <h3>Hotel pickup &amp; transfer</h3>
    <p>An air-conditioned Majestic Travel van collects you from the hotel and delivers you to the boat at the marina.</p>
  </article>
  <article data-step="02" data-name="Board the boat">
    <h3>Board &amp; safety briefing</h3>
    <p>Board the classic boat, short safety and snorkel briefing in five languages, gear fitted on deck. 50–70 guests aboard.</p>
  </article>
  <article data-step="03" data-name="First reef stop">
    <h3>First reef snorkel stop</h3>
    <p>Anchor over the first reef. Guided snorkel from the platform — calm shallow zone for beginners, a guide in the water throughout.</p>
  </article>
  <article data-step="04" data-name="Lunch & second stop">
    <h3>Lunch on board &amp; second stop</h3>
    <p>A hot lunch served on the boat between two reef stops, with sun-deck time in between. A second snorkel on a different reef.</p>
  </article>
  <article data-step="05" data-name="Return">
    <h3>Afternoon return</h3>
    <p>Soft drinks on the sail back. Van returns you to the hotel. Door-to-door ~7 hours.</p>
  </article>
</section>`.trim(),
    sortOrder: 2,
  },
  {
    slug: 'fleet',
    title: 'The Fleet — 25 Boats',
    metaTitle: 'The Fleet | Rosetta II Classic Boat',
    metaDescription:
      'Twenty-five classic 30-metre snorkel boats, 50–70 guests each, across Ain Sokhna, Dahab, Sharm El Sheikh and Hurghada.',
    body: `
<section data-fleet="true">
  <article data-code="RC-01" data-name="Hurghada Fleet" data-capacity="70" data-city="Hurghada">
    <h3>Hurghada · the biggest fleet</h3>
    <p>The largest single-city fleet — boats sailing the Giftun reefs daily, the family workhorse of the coast.</p>
  </article>
  <article data-code="RC-02" data-name="Sharm Fleet" data-capacity="70" data-city="Sharm El Sheikh">
    <h3>Sharm El Sheikh · Tiran reefs</h3>
    <p>Classic boats working the Tiran Strait — world-class snorkel water at the dependable classic price.</p>
  </article>
  <article data-code="RC-03" data-name="Dahab Fleet" data-capacity="60" data-city="Dahab">
    <h3>Dahab · quiet reefs</h3>
    <p>Smaller, quieter boats on Dahab's gentle reefs — a relaxed, uncrowded classic day.</p>
  </article>
  <article data-code="RC-04" data-name="Ain Sokhna Fleet" data-capacity="60" data-city="Ain Sokhna">
    <h3>Ain Sokhna · closest to Cairo</h3>
    <p>The northern boats — the shortest drive from the capital for a Red Sea snorkel day.</p>
  </article>
</section>`.trim(),
    sortOrder: 3,
  },
  {
    slug: 'cities',
    title: 'Where We Sail',
    metaTitle: 'Cities | Rosetta II Classic Boat',
    metaDescription:
      'Four Red Sea cities: Hurghada, Sharm El Sheikh, Dahab and Ain Sokhna. The dependable classic snorkel day.',
    body: `
<section>
  <p>Rosetta II Classic Boat sails from four Red Sea cities — the widest coverage in the family.</p>
  <h3>Hurghada</h3>
  <p>The biggest fleet and the busiest reefs. Giftun Island snorkel sites, daily departures, the family default.</p>
  <h3>Sharm El Sheikh</h3>
  <p>Tiran Strait classic boats — world-class snorkel water at the honest classic price.</p>
  <h3>Dahab</h3>
  <p>Smaller boats, gentle reefs, the quietest and most relaxed classic day.</p>
  <h3>Ain Sokhna</h3>
  <p>The northern boats — the shortest drive from Cairo for a Red Sea snorkel trip.</p>
</section>`.trim(),
    sortOrder: 4,
  },
  {
    slug: 'good-to-know',
    title: 'Good to Know',
    metaTitle: 'Good to Know | Rosetta II Classic Boat',
    metaDescription:
      'Two reef stops, lunch on board, all snorkel gear, multilingual guides, full marine insurance — the honest classic day.',
    body: `
<section>
  <h3>Two reef stops, every trip</h3>
  <p>Every classic day includes two snorkel stops on two different reefs, with a guide in the water and a calm shallow zone for non-swimmers and children.</p>
  <h3>Lunch &amp; gear included</h3>
  <p>A hot lunch on board and all snorkel gear (mask, fins, vest) are included in the base price — no surprise add-ons for the essentials.</p>
  <h3>Families &amp; pricing</h3>
  <p>All ages welcome. Children under 4 sail free with a paying adult. Kids 4–12 pay the reduced rate. The most affordable day in the family.</p>
  <h3>Safety record</h3>
  <p>Every boat carries full marine insurance and meets Egyptian Ministry of Tourism standards. Two safety crew per sailing with marine first-aid certification.</p>
</section>`.trim(),
    sortOrder: 5,
  },
];

const SEO_KEYWORDS = [
  'rosetta ii',
  'classic boat egypt',
  'red sea snorkeling trip',
  'hurghada snorkeling boat',
  'sharm snorkeling boat',
  'dahab snorkel trip',
  'affordable red sea boat',
  'classic snorkel cruise',
];

const NAVIGATION = [
  { label: 'Snorkeling', href: '/snorkeling' },
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

    /* eslint-disable @typescript-eslint/no-explicit-any */
    (tenant as any).slug = TENANT_SLUG;
    (tenant as any).name = 'Rosetta II Classic Boat';
    (tenant as any).tagline = 'The dependable Red Sea snorkel day';
    (tenant as any).description =
      'Rosetta II Classic Boat runs the largest fleet in the Egypt Sunmarine family — 25 classic 30-metre snorkel boats carrying 50–70 guests each, from Ain Sokhna, Dahab, Sharm El Sheikh and Hurghada. Two reef stops, lunch on board, gear included. Honest, accessible, dependable. Part of the Egypt Sunmarine family.';
    (tenant as any).domain = 'rosetta-classic-boat.foxesnetwork.com';
    (tenant as any).customDomain = 'rosettaclassic.com';
    (tenant as any).logo = LOGO;
    (tenant as any).favicon = '/favicon.png';
    (tenant as any).heroImages = HERO_IMAGES;
    (tenant as any).theme = {
      primaryColor: '#1B3F73',
      secondaryColor: '#16242D',
      accentColor: '#6BAED6',
    };
    (tenant as any).fonts = {
      heading: 'Source Serif 4',
      body: 'Source Sans 3',
    };
    (tenant as any).designMode = 'classic';
    (tenant as any).flatUrls = true;
    (tenant as any).defaultCurrency = 'USD';
    (tenant as any).defaultLanguage = 'en';
    (tenant as any).supportedLanguages = ['en', 'de', 'ru', 'ar', 'it', 'fr'];
    (tenant as any).timezone = 'Africa/Cairo';
    (tenant as any).contactInfo = {
      email: 'info@rosettaclassic.com',
      phone: '+20 65 346 0240',
      whatsapp: '+20 100 348 0240',
      address: 'Hurghada Marina · Red Sea coast · Egypt',
      supportHours: 'Daily sail 09:00–15:00',
    };
    (tenant as any).socialLinks = {
      facebook: 'https://facebook.com/rosettaclassic',
      instagram: 'https://instagram.com/rosettaclassic',
    };
    (tenant as any).navigation = NAVIGATION;
    (tenant as any).seoSettings = {
      metaTitle: 'Rosetta II Classic Boat · The Dependable Red Sea Snorkel Day',
      metaDescription:
        '25 classic snorkel boats across Hurghada, Sharm El Sheikh, Dahab and Ain Sokhna. Two reef stops, lunch on board, gear included. Part of the Egypt Sunmarine family.',
      keywords: SEO_KEYWORDS,
    };
    if (!(tenant as any).status || ((tenant as any).status !== 'active' && (tenant as any).status !== 'coming_soon')) {
      (tenant as any).status = 'coming_soon';
    }

    const existingPages = ((tenant as any).customPages || []) as { slug: string }[];
    const ourSlugs = new Set(CUSTOM_PAGES.map((p) => p.slug));
    const preserved = existingPages.filter((p) => !ourSlugs.has(p.slug));
    (tenant as any).customPages = [...preserved, ...CUSTOM_PAGES];
    /* eslint-enable @typescript-eslint/no-explicit-any */

    await tenant.save();

    console.log(
      `\n✅ Rosetta II Classic Boat tenant ${isNew ? 'created' : 'updated'} — designMode=classic, status=${(tenant as any).status}, customDomain=rosettaclassic.com, customPages=${((tenant as any).customPages || []).length}`,
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
