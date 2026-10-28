/**
 * Seed/upsert the Nefertari Cruise tenant.
 *
 * Third standalone boat-brand tenant under the Egypt Sunmarine portfolio
 * (designMode=nefertari). Three 40m floating Pharaonic-temple cruise ships
 * — 123 guests each — sailing from Makadi Bay and Marsa Alam. Gold reliefs,
 * hieroglyph halls, a throne room, costume banquets, luxury dining.
 *
 * Distinct from the `pharaonic` mode (static heritage museum) — this is a
 * sailing floating-temple dining experience.
 *
 * Idempotent. Run via:
 *   npx ts-node src/scripts/seed-nefertari-tenant.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { guardGatewaySeedDocument } from '../services/gatewayDomainScope';
import { Tenant } from '../models/Tenant';

const TENANT_SLUG = 'nefertari-cruise';

const LOGO =
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873223/attractions-network/tenant-logos/nefertari-cruise/wtqiqurflujguzomodyc.jpg';

const HERO_IMAGES = [
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873227/attractions-network/tenant-heroes/nefertari-cruise/buwhsqhlmqpnsgwutmds.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873230/attractions-network/tenant-heroes/nefertari-cruise/dwzdbhr0xsykwz8ksloo.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873232/attractions-network/tenant-heroes/nefertari-cruise/s40q3hilegapz4ciib4m.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873236/attractions-network/tenant-heroes/nefertari-cruise/mlrjwffbvfjofcazuu3p.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873239/attractions-network/tenant-heroes/nefertari-cruise/gblzc9eprdarumdnagqn.jpg',
];

const CUSTOM_PAGES = [
  {
    slug: 'story',
    title: 'Our Story',
    metaTitle: 'Our Story | Nefertari Cruise',
    metaDescription:
      'How a floating Pharaonic temple became the Red Sea\'s most theatrical day cruise — three ships across Makadi Bay and Marsa Alam.',
    body: `
<section>
  <p>Nefertari Cruise was built to answer a single question: what if a Red Sea day cruise felt like sailing inside an ancient temple? The first ship was hand-carved over two years — gilded reliefs, hieroglyph walls, a throne room amidships, papyrus-pattern floors.</p>
  <p>It launched from Makadi Bay and sold out its first season on word of mouth alone. Guests did not just take a boat trip — they dressed as pharaohs, dined under a gilded ceiling, and were photographed on a golden throne flanked by Anubis. We built a second temple ship, then a third, and opened a southern route from Marsa Alam.</p>
  <p>Today, Nefertari Cruise runs three 40-metre floating temples carrying up to 123 guests each. The experience is unchanged: board a temple, become a royal for a day, dine like a dynasty, sail the Red Sea. Part of the Egypt Sunmarine family.</p>
</section>`.trim(),
    sortOrder: 1,
  },
  {
    slug: 'how-it-works',
    title: 'How a Royal Day Works',
    metaTitle: 'How a Nefertari Cruise Day Works',
    metaDescription:
      'Hotel pickup, board the temple, costume robing, throne-room photography, the gilded banquet, sailing, sunset return.',
    body: `
<section data-steps="true">
  <article data-step="01" data-name="Hotel pickup">
    <h3>Hotel pickup &amp; transfer</h3>
    <p>An air-conditioned Majestic Travel car collects you from the hotel lobby and delivers you to the temple ship at the marina.</p>
  </article>
  <article data-step="02" data-name="Board the temple">
    <h3>Board the floating temple</h3>
    <p>Step aboard through gilded gates. Welcome drink under the hieroglyph ceiling. A short orientation to the ship's three decks and the throne room.</p>
  </article>
  <article data-step="03" data-name="Royal robing">
    <h3>Royal robing &amp; throne photography</h3>
    <p>Robe in pharaonic dress — collars, headpieces, cloaks. Sit the golden throne flanked by Anubis for the keepsake portrait while the ship gets under way.</p>
  </article>
  <article data-step="04" data-name="The gilded banquet">
    <h3>The gilded banquet</h3>
    <p>A multi-course meal served in the carved dining hall under gold reliefs, with a sailing reef stop and open-deck sun time between courses.</p>
  </article>
  <article data-step="05" data-name="Sunset & home">
    <h3>Sunset sail &amp; return</h3>
    <p>Tea and sweets on the open star-deck as the temple sails home. Car returns you to the hotel. Door-to-door ~7 hours.</p>
  </article>
</section>`.trim(),
    sortOrder: 2,
  },
  {
    slug: 'fleet',
    title: 'The Fleet — 3 Floating Temples',
    metaTitle: 'The Fleet | Nefertari Cruise',
    metaDescription:
      'Three 40-metre floating Pharaonic-temple cruise ships, 123 guests each, across Makadi Bay and Marsa Alam.',
    body: `
<section data-fleet="true">
  <article data-code="NF-01" data-name="Makadi Flagship" data-capacity="123" data-city="Makadi Bay">
    <h3>Makadi Bay · the flagship temple</h3>
    <p>The original hand-carved ship. Daily morning and sunset sailings. The most ornate throne room in the fleet.</p>
  </article>
  <article data-code="NF-02" data-name="Makadi Second Temple" data-capacity="123" data-city="Makadi Bay">
    <h3>Makadi Bay · second temple</h3>
    <p>The sister ship running the second daily rotation. Larger banquet hall, same gilded theatre.</p>
  </article>
  <article data-code="NF-03" data-name="Marsa Alam Temple" data-capacity="123" data-city="Marsa Alam">
    <h3>Marsa Alam · the southern temple</h3>
    <p>The deep-south ship. Warmest water, quietest reefs, the longest sailing time of the fleet.</p>
  </article>
</section>`.trim(),
    sortOrder: 3,
  },
  {
    slug: 'cities',
    title: 'Where We Sail',
    metaTitle: 'Cities | Nefertari Cruise',
    metaDescription:
      'Two Red Sea cities: Makadi Bay and Marsa Alam. Two temple routes, one royal day.',
    body: `
<section>
  <p>Nefertari Cruise sails from two Red Sea cities, each with its own temple ship and its own character.</p>
  <h3>Makadi Bay</h3>
  <p>The home port. Two temple ships running morning and sunset sailings. Sheltered water, short transfers, the busiest royal theatre.</p>
  <h3>Marsa Alam</h3>
  <p>The deep south. One temple ship, the warmest water on the route, the longest sail, the quietest reefs for the between-courses stop.</p>
</section>`.trim(),
    sortOrder: 4,
  },
  {
    slug: 'the-experience',
    title: 'The Royal Experience',
    metaTitle: 'The Experience | Nefertari Cruise',
    metaDescription:
      'Costume robing, throne-room photography, the gilded banquet, multilingual crew, full marine insurance. A day as a dynasty.',
    body: `
<section>
  <h3>Become a royal for a day</h3>
  <p>Every guest is robed in pharaonic dress and photographed on the golden throne. The crew stages the experience — this is theatre as much as a cruise.</p>
  <h3>The gilded banquet</h3>
  <p>A multi-course meal served under hand-carved gold reliefs in the temple dining hall. Vegetarian and halal menus standard; allergies catered with notice.</p>
  <h3>Families &amp; pricing</h3>
  <p>All ages welcome. Children under 4 sail free with a paying adult. Kids 4–12 pay the reduced rate and get a child costume and the full throne portrait.</p>
  <h3>Safety record</h3>
  <p>Every temple ship carries full marine insurance and meets Egyptian Ministry of Tourism standards. Two safety crew per sailing with marine first-aid certification.</p>
</section>`.trim(),
    sortOrder: 5,
  },
];

const SEO_KEYWORDS = [
  'nefertari cruise',
  'pharaonic boat egypt',
  'floating temple cruise',
  'makadi bay cruise',
  'marsa alam dinner cruise',
  'pharaoh costume boat',
  'red sea luxury cruise',
  'egyptian themed cruise',
];

const NAVIGATION = [
  { label: 'Cruises', href: '/cruises' },
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
    (tenant as any).name = 'Nefertari Cruise';
    (tenant as any).tagline = 'Sail a temple · dine like a dynasty';
    (tenant as any).description =
      'Nefertari Cruise runs three 40-metre floating Pharaonic-temple ships across Makadi Bay and Marsa Alam. Robe as a pharaoh, sit the golden throne, dine beneath hand-carved gold reliefs, and sail the Red Sea. Part of the Egypt Sunmarine family.';
    (tenant as any).domain = 'nefertari-cruise.foxesnetwork.com';
    (tenant as any).customDomain = 'nefertaricruise.com';
    (tenant as any).logo = LOGO;
    (tenant as any).favicon = '/favicon.png';
    (tenant as any).heroImages = HERO_IMAGES;
    (tenant as any).theme = {
      primaryColor: '#D4A24C',
      secondaryColor: '#7A2638',
      accentColor: '#1F6F6B',
    };
    (tenant as any).fonts = {
      heading: 'Cormorant SC',
      body: 'Spectral',
    };
    (tenant as any).designMode = 'nefertari';
    (tenant as any).flatUrls = true;
    (tenant as any).defaultCurrency = 'USD';
    (tenant as any).defaultLanguage = 'en';
    (tenant as any).supportedLanguages = ['en', 'de', 'ru', 'ar', 'it', 'fr'];
    (tenant as any).timezone = 'Africa/Cairo';
    (tenant as any).contactInfo = {
      email: 'royal@nefertaricruise.com',
      phone: '+20 65 346 0240',
      whatsapp: '+20 100 348 0240',
      address: 'Makadi Bay Marina · Red Sea coast · Egypt',
      supportHours: 'Morning sail 09:00–13:30 · Sunset sail 14:00–19:00',
    };
    (tenant as any).socialLinks = {
      facebook: 'https://facebook.com/nefertaricruise',
      instagram: 'https://instagram.com/nefertaricruise',
      tiktok: 'https://tiktok.com/@nefertaricruise',
    };
    (tenant as any).navigation = NAVIGATION;
    (tenant as any).seoSettings = {
      metaTitle: 'Nefertari Cruise · A Floating Pharaonic Temple on the Red Sea',
      metaDescription:
        'Floating Pharaonic-temple cruise ships across Makadi Bay and Marsa Alam. Costume robing, throne-room photography, a gilded banquet. Part of the Egypt Sunmarine family.',
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

    guardGatewaySeedDocument(tenant, tenant.customDomain);
    await tenant.save();

    console.log(
      `\n✅ Nefertari Cruise tenant ${isNew ? 'created' : 'updated'} — designMode=nefertari, status=${(tenant as any).status}, customDomain=nefertaricruise.com, customPages=${((tenant as any).customPages || []).length}`,
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
