/**
 * Seed/upsert the Elite VIP Cruise tenant (Diamond Sea Breeze).
 *
 * Fourth standalone boat-brand tenant under the Egypt Sunmarine portfolio
 * (designMode=elitevip). Seven 37m white luxury yachts — 70–75 guests each,
 * deliberately limited capacity — from Marsa Alam (lead), Ain Sokhna,
 * Sharm El Sheikh and Hurghada. Five-star service, BBQ menu, snorkel + sun.
 *
 * Idempotent. Run via:
 *   npx ts-node src/scripts/seed-elite-vip-tenant.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';

const TENANT_SLUG = 'elite-vip-cruise';

const LOGO =
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873241/attractions-network/tenant-logos/elite-vip-cruise/edconggplkfe6ibosqo0.jpg';

const HERO_IMAGES = [
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873249/attractions-network/tenant-heroes/elite-vip-cruise/qdoi3tifd7sv3mwyqb8n.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873251/attractions-network/tenant-heroes/elite-vip-cruise/mviwed3xj2ayv5l8tjk0.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873255/attractions-network/tenant-heroes/elite-vip-cruise/nmera67xtw74b0h8f7cr.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873260/attractions-network/tenant-heroes/elite-vip-cruise/bchtrmlqreojk9esho6n.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1778873262/attractions-network/tenant-heroes/elite-vip-cruise/v9fgsw3dpzjdlivavp1g.jpg',
];

const CUSTOM_PAGES = [
  {
    slug: 'story',
    title: 'Our Story',
    metaTitle: 'Our Story | Elite VIP Cruise',
    metaDescription:
      'How a single white yacht with a deliberately small guest list became the Red Sea\'s quietest luxury day cruise.',
    body: `
<section>
  <p>Elite VIP Cruise — the Diamond Sea Breeze fleet — was built on one rule the rest of the Red Sea ignored: fewer guests. While other boats packed in over a hundred, our first white yacht capped the list at seventy-five and never moved it.</p>
  <p>That single decision became the whole brand. More deck per guest, a real five-star galley, a proper BBQ instead of a buffet line, and crew who learn your name. The fleet grew to seven yachts across Marsa Alam, Ain Sokhna, Sharm El Sheikh and Hurghada — every one of them still capped, still quiet, still white.</p>
  <p>Today, Elite VIP Cruise runs seven 37-metre yachts carrying 70–75 guests each. The rule has never changed: a small list, a long day, the Red Sea at its most unhurried. Part of the Egypt Sunmarine family.</p>
</section>`.trim(),
    sortOrder: 1,
  },
  {
    slug: 'how-it-works',
    title: 'How a VIP Day Works',
    metaTitle: 'How an Elite VIP Cruise Day Works',
    metaDescription:
      'Private transfer, board the yacht, sun deck, snorkel the reef, the BBQ service, sunset return.',
    body: `
<section data-steps="true">
  <article data-step="01" data-name="Private transfer">
    <h3>Private transfer</h3>
    <p>An air-conditioned Majestic Travel car collects you from the hotel and delivers you to the yacht — no shared shuttle, no waiting.</p>
  </article>
  <article data-step="02" data-name="Board the yacht">
    <h3>Board the white yacht</h3>
    <p>Welcome drink on the teak aft deck. A short orientation to the sun deck, the shaded salon and the dive platform. Maximum 75 guests aboard.</p>
  </article>
  <article data-step="03" data-name="Sun & sail">
    <h3>Sun deck &amp; sail</h3>
    <p>Loungers on the upper deck as the yacht sails to the reef. Space to actually lie down — the whole point of the small list.</p>
  </article>
  <article data-step="04" data-name="Snorkel & BBQ">
    <h3>Snorkel the reef &amp; the BBQ</h3>
    <p>Anchor over a living reef for a guided snorkel from the platform, then a proper grilled BBQ served at the table — not a queue.</p>
  </article>
  <article data-step="05" data-name="Sunset & home">
    <h3>Sunset sail &amp; return</h3>
    <p>Coffee and fruit on the aft deck as the yacht sails home. Private car back to the hotel. Door-to-door ~8 hours.</p>
  </article>
</section>`.trim(),
    sortOrder: 2,
  },
  {
    slug: 'fleet',
    title: 'The Fleet — 7 Yachts',
    metaTitle: 'The Fleet | Elite VIP Cruise',
    metaDescription:
      'Seven 37-metre white luxury yachts, 70–75 guests each, across Marsa Alam, Ain Sokhna, Sharm El Sheikh and Hurghada.',
    body: `
<section data-fleet="true">
  <article data-code="EV-01" data-name="Marsa Alam Flagship" data-capacity="75" data-city="Marsa Alam">
    <h3>Marsa Alam · the flagship</h3>
    <p>The lead yacht and the brand's home water. Warmest sea, longest sail, the quietest reefs on the route.</p>
  </article>
  <article data-code="EV-02" data-name="Marsa Alam Second" data-capacity="75" data-city="Marsa Alam">
    <h3>Marsa Alam · second yacht</h3>
    <p>Sister yacht running the second daily rotation. Same capped list, same BBQ galley.</p>
  </article>
  <article data-code="EV-03" data-name="Sharm Yacht" data-capacity="72" data-city="Sharm El Sheikh">
    <h3>Sharm El Sheikh · Tiran water</h3>
    <p>Working the Tiran Strait reefs — the clearest snorkel water on the fleet's map.</p>
  </article>
  <article data-code="EV-04" data-name="Hurghada Yacht" data-capacity="72" data-city="Hurghada">
    <h3>Hurghada · Giftun reefs</h3>
    <p>Sheltered Giftun Island water, short transfers, the easiest sailing of the fleet.</p>
  </article>
  <article data-code="EV-05" data-name="Ain Sokhna Yacht" data-capacity="70" data-city="Ain Sokhna">
    <h3>Ain Sokhna · the northern yacht</h3>
    <p>The closest cruise to Cairo. A quiet northern reef and the shortest drive for the capital's guests.</p>
  </article>
</section>`.trim(),
    sortOrder: 3,
  },
  {
    slug: 'cities',
    title: 'Where We Sail',
    metaTitle: 'Cities | Elite VIP Cruise',
    metaDescription:
      'Four Red Sea cities: Marsa Alam, Sharm El Sheikh, Hurghada and Ain Sokhna. One capped guest list.',
    body: `
<section>
  <p>Elite VIP Cruise sails from four Red Sea cities. Every yacht keeps the same capped list — the city changes, the quiet does not.</p>
  <h3>Marsa Alam</h3>
  <p>The flagship water. Warmest sea, longest sail, the most untouched reefs on the route.</p>
  <h3>Sharm El Sheikh</h3>
  <p>The Tiran Strait yacht. World-class snorkel clarity, dramatic open-sea sailing.</p>
  <h3>Hurghada</h3>
  <p>Sheltered Giftun reefs and short transfers — the easiest, calmest day of the fleet.</p>
  <h3>Ain Sokhna</h3>
  <p>The northern yacht, closest to Cairo. A quiet reef and a short drive for capital guests.</p>
</section>`.trim(),
    sortOrder: 4,
  },
  {
    slug: 'the-experience',
    title: 'The VIP Experience',
    metaTitle: 'The Experience | Elite VIP Cruise',
    metaDescription:
      'A capped guest list, a five-star BBQ galley, private transfers, guided snorkel, full marine insurance.',
    body: `
<section>
  <h3>A deliberately small list</h3>
  <p>Every yacht is capped at 70–75 guests — well below its legal capacity. That single rule is the entire experience: room on the deck, no buffet queue, crew who know your name.</p>
  <h3>The five-star BBQ</h3>
  <p>A proper grilled menu served at the table, not a steam-tray line. Vegetarian and halal standard; allergies catered with notice.</p>
  <h3>Families &amp; pricing</h3>
  <p>All ages welcome. Children under 4 sail free with a paying adult. Kids 4–12 pay the reduced rate.</p>
  <h3>Safety record</h3>
  <p>Every yacht carries full marine insurance and meets Egyptian Ministry of Tourism standards. Two safety crew per sailing with marine first-aid certification.</p>
</section>`.trim(),
    sortOrder: 5,
  },
];

const SEO_KEYWORDS = [
  'elite vip cruise',
  'diamond sea breeze',
  'luxury yacht egypt',
  'marsa alam yacht cruise',
  'red sea bbq cruise',
  'small group snorkel cruise',
  'vip boat hurghada',
  'private red sea cruise',
];

const NAVIGATION = [
  { label: 'Yachts', href: '/yachts' },
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
    (tenant as any).name = 'Elite VIP Cruise';
    (tenant as any).tagline = 'A small list · a long day';
    (tenant as any).description =
      'Elite VIP Cruise — the Diamond Sea Breeze fleet — runs seven 37-metre white luxury yachts capped at 70–75 guests each, from Marsa Alam, Ain Sokhna, Sharm El Sheikh and Hurghada. Five-star service, a real BBQ galley, guided snorkel. Part of the Egypt Sunmarine family.';
    (tenant as any).domain = 'elite-vip-cruise.foxesnetwork.com';
    (tenant as any).customDomain = 'elitevipcruise.com';
    (tenant as any).logo = LOGO;
    (tenant as any).favicon = '/favicon.png';
    (tenant as any).heroImages = HERO_IMAGES;
    (tenant as any).theme = {
      primaryColor: '#C9A24C',
      secondaryColor: '#142838',
      accentColor: '#5A8EB8',
    };
    (tenant as any).fonts = {
      heading: 'Italiana',
      body: 'Inter',
    };
    (tenant as any).designMode = 'elitevip';
    (tenant as any).flatUrls = true;
    (tenant as any).defaultCurrency = 'USD';
    (tenant as any).defaultLanguage = 'en';
    (tenant as any).supportedLanguages = ['en', 'de', 'ru', 'ar', 'it', 'fr'];
    (tenant as any).timezone = 'Africa/Cairo';
    (tenant as any).contactInfo = {
      email: 'concierge@elitevipcruise.com',
      phone: '+20 65 346 0240',
      whatsapp: '+20 100 348 0240',
      address: 'Marsa Alam Marina · Red Sea coast · Egypt',
      supportHours: 'Daily sail 09:00–15:00',
    };
    (tenant as any).socialLinks = {
      facebook: 'https://facebook.com/elitevipcruise',
      instagram: 'https://instagram.com/elitevipcruise',
      tiktok: 'https://tiktok.com/@elitevipcruise',
    };
    (tenant as any).navigation = NAVIGATION;
    (tenant as any).seoSettings = {
      metaTitle: 'Elite VIP Cruise · The Red Sea, With a Smaller Guest List',
      metaDescription:
        'White luxury yachts capped at 70–75 guests, across Marsa Alam, Ain Sokhna, Sharm El Sheikh and Hurghada. Five-star BBQ, guided snorkel. Part of the Egypt Sunmarine family.',
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
      `\n✅ Elite VIP Cruise tenant ${isNew ? 'created' : 'updated'} — designMode=elitevip, status=${(tenant as any).status}, customDomain=elitevipcruise.com, customPages=${((tenant as any).customPages || []).length}`,
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
