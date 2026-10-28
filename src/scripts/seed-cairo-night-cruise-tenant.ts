/**
 * Seed/upsert the Cairo Night Cruise tenant — wires designMode, theme, fonts,
 * customDomain, navigation, customPages, and seoSettings. Status stays
 * `coming_soon` until activation.
 *
 * Idempotent. Run via: npx ts-node src/scripts/seed-cairo-night-cruise-tenant.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { guardGatewaySeedDocument } from '../services/gatewayDomainScope';
import { Tenant } from '../models/Tenant';

const TENANT_SLUG = 'cairo-night-cruise';

const CUSTOM_PAGES = [
  {
    slug: 'story',
    title: 'Our Story',
    metaTitle: 'Our Story | Cairo Night Cruise',
    metaDescription:
      'A felucca dinner-cruise restaurant on the Nile in Garden City — slow service, live oud, three generations of Cairene boatmen.',
    body: `
<section>
  <p>Cairo Night Cruise was founded in 2009 by Captain Sherif Helmy aboard a single felucca tied at the Garden City Marina. Sherif's father had run sunset rides on the same stretch of river in the 1970s; his grandfather had taught Sadat to sail at Maadi Pier in the 1950s. The family knows the wind on this river the way Cairo cab drivers know the side streets.</p>
  <p>What started as private charters for friends turned into a dinner-cruise restaurant when Sherif's wife Salwa — a trained chef from Le Cordon Bleu Cairo — joined the boat in 2011. The first 5-course menu was served to twelve guests on the foredeck of <em>Nefertiti</em>, our flagship felucca. Word travelled. By 2015 we had five boats in rotation.</p>
  <p>Tonight the fleet still launches from the same two piers — Garden City and Maadi — between 18:30 and 21:30. The menu has grown, the oud players have learned new songs, but the felucca, the river, and the slow ceremony of dinner under Cairo's lit-up skyline are exactly as we found them.</p>
</section>`.trim(),
    sortOrder: 1,
  },
  {
    slug: 'menu',
    title: 'The Menu — Tonight On Board',
    metaTitle: 'Dinner Menu | Cairo Night Cruise',
    metaDescription:
      'Our 5-course Egyptian–Mediterranean dinner menu, served aboard the felucca between courses of oud and slow drift.',
    body: `
<section data-courses="true">
  <article data-course="I" data-name="Aperitif">
    <h3>Hibiscus Spritz · Karkadé Royale</h3>
    <p>Cold-brew karkadé hibiscus, fresh lime, mint from the marina rooftop garden, sparkling. Optional Egyptian sparkling Omar Khayyam upgrade.</p>
  </article>
  <article data-course="II" data-name="Antipasti">
    <h3>Mezze of the Marina</h3>
    <p>Smoked aubergine baba ghanouj, beetroot tahini, fava bean ful medames, dukkah-crusted labneh, charred green tomato pickle, fresh balady bread from a Garden City wood oven.</p>
  </article>
  <article data-course="III" data-name="Plat principal">
    <h3>Choose One</h3>
    <p><strong>Sea bass tagine</strong> — Red Sea sea bass, preserved lemon, green olives, saffron rice. Or <strong>Slow-roasted lamb shoulder</strong> — Sinai lamb, freekeh, pomegranate, charred onion. Or <strong>Aubergine moussaka</strong> (vegan) — smoked aubergine, lentils, cashew tahini.</p>
  </article>
  <article data-course="IV" data-name="Sommelier">
    <h3>Wine, Tea, or Coffee</h3>
    <p>Egyptian Beausoleil or Château des Rêves by the glass (sommelier pairing on request). Sage tea, Turkish coffee, or fresh mint tea — served at table.</p>
  </article>
  <article data-course="V" data-name="Digestif">
    <h3>Umm Ali · Nile-Walnut Crumble</h3>
    <p>Cardamom-infused umm ali with rosewater cream and Nile-walnut crumble. Closed with a small pour of arak or fresh lemon-mint sorbet.</p>
  </article>
</section>`.trim(),
    sortOrder: 2,
  },
  {
    slug: 'entertainment',
    title: 'Live On Board — Music & Show',
    metaTitle: 'Live Music & Show | Cairo Night Cruise',
    metaDescription:
      'Live oud, percussion, and seasonal tanoura whirling-dervish performances — what plays each night of the week.',
    body: `
<section>
  <h3>Live Oud — every night</h3>
  <p>Maestro Tamer Abdelmoneim plays a 7-string oud aboard the larger feluccas Wednesday through Sunday. He learned from Naseer Shamma at the Cairo Conservatory; his sets blend Mohamed Mounir-era classics with original compositions written for the river.</p>
  <h3>Tanoura — Friday &amp; Saturday</h3>
  <p>Our Friday and Saturday 20:00 seatings include a 12-minute tanoura whirling-dervish performance on the foredeck. A traditional Sufi devotional dance, now performed for guests as a spectacle of colour and rotation under the bistro lights.</p>
  <h3>Quiet seatings — Monday &amp; Tuesday</h3>
  <p>Monday and Tuesday 18:30 seatings are intentionally quiet — soft oud only, no show. Best for couples and small private parties.</p>
  <h3>Jazz Late-Night — Thursday</h3>
  <p>The 21:30 Thursday departure on the <em>Hathor</em> is our late-night jazz felucca. The Hagrass Quartet (piano, bass, sax, brushes) plays from launch until return.</p>
</section>`.trim(),
    sortOrder: 3,
  },
  {
    slug: 'fleet',
    title: 'Our Fleet — The Five Feluccas',
    metaTitle: 'Our Fleet | Cairo Night Cruise',
    metaDescription:
      'Nefertiti, Cleopatra, Isis, Hathor, Bastet — the five feluccas of Cairo Night Cruise.',
    body: `
<section data-fleet="true">
  <article data-code="CN-01" data-name="Nefertiti" data-capacity="32" data-pier="Garden City Marina">
    <h3>Nefertiti · CN-01</h3>
    <p>The flagship. Built in Rashid in 2008, refit in 2019. 32 guests, single-mast lateen rig, 12-metre deck. Hosts the Classic 5-Course Nile Dinner and the Tanoura Show seatings.</p>
  </article>
  <article data-code="CN-02" data-name="Cleopatra" data-capacity="24" data-pier="Maadi Pier">
    <h3>Cleopatra · CN-02</h3>
    <p>The romantic. 24 guests, four private 2-tops on the bow, intimate stern dining. Hosts the Couples Anniversary Cruise and the Sunset Felucca Dinner seatings.</p>
  </article>
  <article data-code="CN-03" data-name="Isis" data-capacity="40" data-pier="Zamalek Yacht Club">
    <h3>Isis · CN-03</h3>
    <p>The family boat. 40 guests, wide stable hull, kids' menu corner with crayons and small folkloric instruments. Hosts the Family Cruise and group bookings.</p>
  </article>
  <article data-code="CN-04" data-name="Hathor" data-capacity="20" data-pier="Garden City Marina">
    <h3>Hathor · CN-04</h3>
    <p>The jazz felucca. 20 guests, dark-wood deck with a tiny stage forward. Thursday late-night jazz, Saturday private charters. Smallest passenger count, most legroom.</p>
  </article>
  <article data-code="CN-05" data-name="Bastet" data-capacity="36" data-pier="Maadi Pier">
    <h3>Bastet · CN-05</h3>
    <p>The Ramadan boat. 36 guests, fully retractable awning, decorated with fanous lanterns during the season. Hosts the Ramadan Iftar Cruise and seasonal private events.</p>
  </article>
</section>`.trim(),
    sortOrder: 4,
  },
  {
    slug: 'tonight',
    title: "Tonight's Departures",
    metaTitle: "Tonight's Departures | Cairo Night Cruise",
    metaDescription:
      "Live schedule: which felucca leaves which pier when, and how many seats remain.",
    body: `
<section data-departures="true">
  <article data-code="CN-01" data-time="18:30" data-pier="Garden City Marina" data-return="20:00" data-status="boarding">
    <h3>Sunset Felucca Dinner · Nefertiti</h3>
    <p>1.5-hour sunset cruise with mezze, drinks, and a short oud set. Departs Garden City Marina 18:30, returns 20:00.</p>
  </article>
  <article data-code="CN-02" data-time="19:00" data-pier="Maadi Pier" data-return="22:00" data-status="few-seats">
    <h3>Couples Anniversary · Cleopatra</h3>
    <p>3-hour intimate cruise with private 2-top, champagne, and rose petals. Departs Maadi Pier 19:00, returns 22:00.</p>
  </article>
  <article data-code="CN-04" data-time="20:00" data-pier="Garden City Marina" data-return="23:00" data-status="open">
    <h3>Classic 5-Course Nile Dinner · Hathor</h3>
    <p>Full 3-hour dinner cruise with live oud and Tanoura show. Departs Garden City Marina 20:00, returns 23:00.</p>
  </article>
  <article data-code="CN-03" data-time="20:30" data-pier="Maadi Pier" data-return="22:30" data-status="open">
    <h3>Family Cruise · Isis</h3>
    <p>2-hour family-friendly cruise with kids' menu and folkloric music. Departs Maadi Pier 20:30, returns 22:30.</p>
  </article>
  <article data-code="CN-05" data-time="21:30" data-pier="Garden City Marina" data-return="23:00" data-status="few-seats">
    <h3>Late-Night Jazz · Bastet</h3>
    <p>1.5-hour post-dinner cocktail cruise with live jazz quartet. Departs Garden City Marina 21:30, returns 23:00.</p>
  </article>
</section>`.trim(),
    sortOrder: 5,
  },
];

const SEO_KEYWORDS = [
  'cairo night cruise',
  'nile dinner cruise',
  'cairo felucca dinner',
  'nile dinner boat cairo',
  'cairo dinner cruise',
  'felucca dinner cairo',
  'cairo evening cruise',
  'dinner cruise egypt',
];

const NAVIGATION = [
  { label: 'Cruises', href: '/cruises' },
  { label: 'Tonight', href: '/tonight' },
  { label: 'Menu', href: '/menu' },
  { label: 'Fleet', href: '/fleet' },
  { label: 'Story', href: '/story' },
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
    };
    console.log('Before:', JSON.stringify(before, null, 2));

    (tenant as any).name = 'Cairo Night Cruise';
    (tenant as any).tagline = "Cairo's Table on the Nile";
    (tenant as any).description =
      "A felucca dinner-cruise restaurant on the Nile in Cairo. Five traditional sail boats departing Garden City Marina and Maadi Pier from 18:30 each evening. Live oud, slow Egyptian-Mediterranean menu, the city's skyline lit up at your shoulder.";
    (tenant as any).customDomain = 'caironightcruise.com';
    (tenant as any).logo = '/logos/cairo-night-cruise.png';
    (tenant as any).favicon = '/favicon.png';
    (tenant as any).theme = {
      primaryColor: '#D2202E',
      secondaryColor: '#0B1A36',
      accentColor: '#E8B65A',
    };
    (tenant as any).fonts = {
      heading: 'Marcellus',
      body: 'Inter',
    };
    (tenant as any).designMode = 'nilenight';
    (tenant as any).flatUrls = true;
    (tenant as any).contactInfo = {
      email: 'reserve@caironightcruise.com',
      phone: '+20 2 2792 4500',
      whatsapp: '+20 100 200 8800',
      address: 'Garden City Marina, Corniche El-Nil, Cairo',
      supportHours: '17:00–23:30 daily (local time)',
    };
    (tenant as any).socialLinks = {
      facebook: 'https://facebook.com/caironightcruise',
      instagram: 'https://instagram.com/caironightcruise',
      tiktok: 'https://tiktok.com/@caironightcruise',
    };
    (tenant as any).navigation = NAVIGATION;
    (tenant as any).seoSettings = {
      metaTitle: "Cairo Night Cruise · Cairo's Table on the Nile",
      metaDescription:
        "Felucca dinner cruises departing Garden City Marina and Maadi Pier each evening. 5-course Egyptian-Mediterranean menu, live oud, Cairo skyline. Sunset, Tanoura, Couples, Family, Jazz cruises nightly.",
      keywords: SEO_KEYWORDS,
    };
    if ((tenant as any).status !== 'coming_soon' && (tenant as any).status !== 'active') {
      (tenant as any).status = 'coming_soon';
    }

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
    console.log('\n✅ Cairo Night Cruise tenant configured. Status stays coming_soon until activation.');
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
