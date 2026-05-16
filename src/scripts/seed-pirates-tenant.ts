/**
 * Seed/upsert the Pirates Premier Sailing tenant.
 *
 * Second standalone boat-brand tenant under the Egypt Sunmarine portfolio
 * (designMode=pirates). A 5-boat themed pirate-galleon fleet — 37m ships,
 * 89 guests — sailing from Sharm El Sheikh, Hurghada and Marsa Alam.
 * Family adventure: costumes, treasure hunts, snorkel stops, themed dining.
 *
 * Idempotent. Run via:
 *   npx ts-node src/scripts/seed-pirates-tenant.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';

const TENANT_SLUG = 'pirates-premier-sailing';

const LOGO =
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873201/attractions-network/tenant-logos/pirates-premier-sailing/qezc8udnaixrkahl44i1.jpg';

const HERO_IMAGES = [
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873205/attractions-network/tenant-heroes/pirates-premier-sailing/tvjrbjwhcss7ibmgy6bd.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873208/attractions-network/tenant-heroes/pirates-premier-sailing/te7dn5qo9bg1gwhobxr2.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873213/attractions-network/tenant-heroes/pirates-premier-sailing/nyynsp23tbtvjinhw3d4.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873216/attractions-network/tenant-heroes/pirates-premier-sailing/fmpgineuhcts9l6huyva.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873219/attractions-network/tenant-heroes/pirates-premier-sailing/p9sxnawhzrdwwzzjyc6a.jpg',
];

const CUSTOM_PAGES = [
  {
    slug: 'story',
    title: 'Our Story',
    metaTitle: 'Our Story | Pirates Premier Sailing',
    metaDescription:
      'How a single themed galleon became the Red Sea\'s favourite family pirate adventure — five ships across Sharm, Hurghada and Marsa Alam.',
    body: `
<section>
  <p>Pirates Premier Sailing began with one wooden galleon and one idea: a Red Sea day trip that kids would talk about for the rest of the year. No engines droning in the background — real sails, a real captain, and a deck full of pirates-for-a-day.</p>
  <p>The first ship launched from Hurghada. By the end of that season every weekend was sold out and parents were re-booking before they got off the gangway. We added a second galleon, then a third, then crossed the gulf to Sharm El Sheikh and sailed south to Marsa Alam.</p>
  <p>Today, Pirates Premier Sailing runs five 37-metre galleons carrying up to 89 guests each. The formula has not changed since day one: costumes for the crew of kids, a treasure hunt across the deck, a snorkel stop over a living reef, and a themed feast served below in a carved pirate cabin. Part of the Egypt Sunmarine family.</p>
</section>`.trim(),
    sortOrder: 1,
  },
  {
    slug: 'how-it-works',
    title: 'How a Pirate Day Works',
    metaTitle: 'How a Pirates Premier Sailing Day Works',
    metaDescription:
      'Hotel pickup, marina boarding, raise the colours, treasure hunt, snorkel stop, themed feast, sunset return.',
    body: `
<section data-steps="true">
  <article data-step="01" data-name="Hotel pickup">
    <h3>Hotel pickup &amp; transfer</h3>
    <p>An air-conditioned Majestic Travel van collects your crew from the hotel lobby. 30–60 minute drive to the marina depending on your city.</p>
  </article>
  <article data-step="02" data-name="Board the galleon">
    <h3>Raise the colours</h3>
    <p>Walk the jetty, meet the captain, and watch the pirate flag go up the mast. Costumes, hats and bandanas issued to the young crew. Safety briefing in five languages.</p>
  </article>
  <article data-step="03" data-name="Treasure hunt">
    <h3>Treasure hunt under sail</h3>
    <p>Sails up, engine off. While the galleon glides to the reef, the kids work the clues across the deck for the buried-treasure finale.</p>
  </article>
  <article data-step="04" data-name="Snorkel stop">
    <h3>Snorkel the reef</h3>
    <p>Anchor over a living coral garden. Mask, fins and vests for all ages. Crew in the water with the children, calm shallow zone for first-timers.</p>
  </article>
  <article data-step="05" data-name="Feast & home">
    <h3>Themed feast &amp; sunset return</h3>
    <p>A hot buffet served in the carved pirate cabin below deck, then a relaxed sail back. Van returns you to the hotel. Door-to-door ~7 hours.</p>
  </article>
</section>`.trim(),
    sortOrder: 2,
  },
  {
    slug: 'fleet',
    title: 'The Fleet — 5 Galleons',
    metaTitle: 'The Fleet | Pirates Premier Sailing',
    metaDescription:
      'Five 37-metre themed pirate galleons, 89 guests each, across Sharm El Sheikh, Hurghada and Marsa Alam.',
    body: `
<section data-fleet="true">
  <article data-code="PR-01" data-name="Hurghada Flagship" data-capacity="89" data-city="Hurghada">
    <h3>Hurghada · the flagship galleon</h3>
    <p>The original ship plus a sister galleon. Daily departures (except Sat &amp; Wed sunset-only). Reef sites: Giftun Island, Mahmya.</p>
  </article>
  <article data-code="PR-02" data-name="Sharm Galleon" data-capacity="89" data-city="Sharm El Sheikh">
    <h3>Sharm El Sheikh · Tiran adventure</h3>
    <p>Themed galleon working the Tiran Strait reefs. Bigger swell, dramatic sailing, world-class snorkel water.</p>
  </article>
  <article data-code="PR-03" data-name="Marsa Alam South" data-capacity="89" data-city="Marsa Alam">
    <h3>Marsa Alam · deep south</h3>
    <p>The warmest water on the route and the quietest reefs. Best for dolphin encounters on the sail out.</p>
  </article>
  <article data-code="PR-04" data-name="Sunset Galleon" data-capacity="89" data-city="Hurghada">
    <h3>The sunset ship</h3>
    <p>Reserved for the 13:30 → 18:30 golden-hour cruise. Fewer kids, more romance, the same pirate theatre.</p>
  </article>
  <article data-code="PR-05" data-name="Charter Galleon" data-capacity="89" data-city="All cities">
    <h3>Private charter galleon</h3>
    <p>Whole-ship charter for birthdays, weddings and corporate days. Customisable route and theming.</p>
  </article>
</section>`.trim(),
    sortOrder: 3,
  },
  {
    slug: 'cities',
    title: 'Where We Sail',
    metaTitle: 'Cities | Pirates Premier Sailing',
    metaDescription:
      'Three Red Sea cities: Sharm El Sheikh, Hurghada and Marsa Alam. Three different reefs, one pirate adventure.',
    body: `
<section>
  <p>Pirates Premier Sailing departs from three Red Sea cities. Each galleon works its own reef and its own sailing character.</p>
  <h3>Hurghada</h3>
  <p>The home port and biggest operation. Giftun Island reefs, sheltered water, the most family-friendly sailing on the route.</p>
  <h3>Sharm El Sheikh</h3>
  <p>The Tiran Strait galleon. World-class snorkel water, dramatic open-sea sailing, the strongest wind for proper sail work.</p>
  <h3>Marsa Alam</h3>
  <p>The deep south. Warmest water, quietest reefs, frequent dolphin sightings on the sail out and back.</p>
</section>`.trim(),
    sortOrder: 4,
  },
  {
    slug: 'family-safe',
    title: 'Built for Families',
    metaTitle: 'Family Safety | Pirates Premier Sailing',
    metaDescription:
      'Costumes, supervised snorkel zones, child life-jackets, multilingual crew, full marine insurance. A pirate day designed around kids.',
    body: `
<section>
  <h3>Designed around children</h3>
  <p>The whole day is built for families. Costumes and props for every child, a treasure hunt paced for ages 4–12, and crew whose actual job is keeping kids entertained and safe.</p>
  <h3>Supervised snorkel zone</h3>
  <p>The snorkel stop uses a roped calm zone in shallow reef water. Crew in the water at all times. Child life-jackets and full-face junior masks provided. Non-swimmers stay on the platform with a guide.</p>
  <h3>Children &amp; pricing</h3>
  <p>All ages welcome. Children under 4 sail free with a paying adult. Kids 4–12 pay the reduced rate and get the full costume + treasure-hunt experience.</p>
  <h3>Safety record</h3>
  <p>Every galleon carries full marine insurance and meets Egyptian Ministry of Tourism standards. Two safety crew on every sailing with marine first-aid certification.</p>
</section>`.trim(),
    sortOrder: 5,
  },
];

const SEO_KEYWORDS = [
  'pirates premier sailing',
  'pirate boat hurghada',
  'pirate ship sharm el sheikh',
  'pirate cruise marsa alam',
  'family pirate trip egypt',
  'red sea sailing adventure',
  'kids pirate boat egypt',
  'themed snorkel cruise',
];

const NAVIGATION = [
  { label: 'Voyages', href: '/sailing' },
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
    (tenant as any).name = 'Pirates Premier Sailing';
    (tenant as any).tagline = 'Raise the colours · since the first galleon';
    (tenant as any).description =
      'Pirates Premier Sailing runs five 37-metre themed pirate galleons across Sharm El Sheikh, Hurghada and Marsa Alam. Costumes, a deck-wide treasure hunt, a reef snorkel stop, and a themed feast below deck — a full Red Sea sailing adventure built for families. Part of the Egypt Sunmarine family.';
    (tenant as any).domain = 'pirates-premier-sailing.foxesnetwork.com';
    (tenant as any).customDomain = 'piratespremiersailing.com';
    (tenant as any).logo = LOGO;
    (tenant as any).favicon = '/favicon.png';
    (tenant as any).heroImages = HERO_IMAGES;
    (tenant as any).theme = {
      primaryColor: '#E8B33A',
      secondaryColor: '#16407A',
      accentColor: '#B22A2A',
    };
    (tenant as any).fonts = {
      heading: 'IM Fell DW Pica',
      body: 'Lora',
    };
    (tenant as any).designMode = 'pirates';
    (tenant as any).flatUrls = true;
    (tenant as any).defaultCurrency = 'USD';
    (tenant as any).defaultLanguage = 'en';
    (tenant as any).supportedLanguages = ['en', 'de', 'ru', 'ar', 'it', 'fr'];
    (tenant as any).timezone = 'Africa/Cairo';
    (tenant as any).contactInfo = {
      email: 'ahoy@piratespremiersailing.com',
      phone: '+20 65 346 0240',
      whatsapp: '+20 100 348 0240',
      address: 'Hurghada Marina · Red Sea coast · Egypt',
      supportHours: 'Sailings 09:00–18:30 daily (sunset-only Sat & Wed)',
    };
    (tenant as any).socialLinks = {
      facebook: 'https://facebook.com/piratespremiersailing',
      instagram: 'https://instagram.com/piratespremiersailing',
      tiktok: 'https://tiktok.com/@piratespremiersailing',
    };
    (tenant as any).navigation = NAVIGATION;
    (tenant as any).seoSettings = {
      metaTitle: 'Pirates Premier Sailing · Red Sea Family Pirate Adventure',
      metaDescription:
        'Themed pirate galleons across Sharm El Sheikh, Hurghada and Marsa Alam. Costumes, treasure hunt, reef snorkel, themed feast. Built for families. Part of the Egypt Sunmarine family.',
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
      `\n✅ Pirates Premier Sailing tenant ${isNew ? 'created' : 'updated'} — designMode=pirates, status=${(tenant as any).status}, customDomain=piratespremiersailing.com, customPages=${((tenant as any).customPages || []).length}`,
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
