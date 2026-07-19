/**
 * Seed "The Great Pyramids of Giza" — the network's flagship heritage tenant.
 *
 * Bespoke `pharaonic` designMode (light editorial / museum aesthetic, not the
 * dark adventure feel of safarisahara / quadtour). Flat URLs so each tour
 * gets a clean SEO slug like /great-pyramid-of-khufu-guided-tour.
 *
 * Idempotent — rerun upserts by slug. --skip-images keeps existing Cloudinary
 * URLs (saves time + cost). --tours-only skips logo/hero regeneration.
 *
 * Usage:
 *   npx ts-node src/scripts/seed-giza-pyramids.ts
 *   npx ts-node src/scripts/seed-giza-pyramids.ts --skip-images
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { User } from '../models/User';
import { generateImageFromPrompt } from '../services/image-generation.service';
import { uploadBase64Image } from '../services/upload.service';
import { hashPassword, generatePreviewAccessCode } from '../utils/hash';
import { env } from '../config/env';
import { requireScriptSecret } from './require-script-secret';

const args = new Set(process.argv.slice(2));
const SKIP_IMAGES = args.has('--skip-images');
const TOURS_ONLY = args.has('--tours-only');
const log = (...args: unknown[]) => console.log('[giza]', ...args);

async function uploadGeneratedImage(
  prompt: string,
  folder: string,
  size: '1024x1024' | '1536x1024' | '1024x1536' = '1536x1024'
): Promise<string> {
  if (SKIP_IMAGES) {
    log(`  ⏭  skip image (${folder}): ${prompt.slice(0, 60)}…`);
    return '';
  }
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      log(`  🎨 [${attempt}/${maxAttempts}] ${prompt.slice(0, 70)}…`);
      const { base64, mimeType } = await generateImageFromPrompt({
        prompt,
        size,
        quality: 'high',
        outputFormat: 'jpeg',
      });
      const dataUrl = `data:${mimeType};base64,${base64}`;
      const result = await uploadBase64Image(dataUrl, folder);
      log(`     → ${result.url.slice(0, 90)}…`);
      return result.url;
    } catch (err) {
      lastError = err;
      log(`  ⚠  attempt ${attempt} failed: ${err instanceof Error ? err.message : 'unknown'}`);
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  log(`  ❌ giving up after ${maxAttempts} attempts.`);
  console.error('  Last error:', lastError);
  return '';
}

async function callGPT(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!env.openaiApiKey) throw new Error('OPENAI_API_KEY required');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.openaiApiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  });
  const data = (await res.json()) as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> };
  if (!res.ok) throw new Error(`OpenAI: ${data?.error?.message || res.statusText}`);
  return data.choices?.[0]?.message?.content || '{}';
}

// ─────────────────────────────────────────────────────────────────────
// Tenant
// ─────────────────────────────────────────────────────────────────────
const GIZA_TENANT = {
  slug: 'the-great-pyramids-of-giza',
  name: 'The Great Pyramids of Giza',
  domain: 'the-great-pyramids-of-giza.foxesnetwork.com',
  customDomain: 'pyramidsofgiza.com',
  flatUrls: true,
  tagline: 'Walk Among Wonders.',
  description:
    "The Great Pyramids of Giza is the network's flagship heritage destination — guided experiences across the Giza Plateau, the Valley of the Kings, Karnak Temple, Abu Simbel, and Egypt's most significant archaeological sites. Curated by accredited Egyptologists; written for the traveller who wants depth, not just a photograph.",
  // Limestone + midnight indigo + burnished gold. Light editorial feel,
  // intentionally the inverse of the dark adventure tenants.
  theme: { primaryColor: '#B8924D', secondaryColor: '#1A2B47', accentColor: '#7A1F1F' },
  fonts: { heading: 'Cinzel', body: 'Lora' },
  designMode: 'pharaonic',
  defaultCurrency: 'USD',
  defaultLanguage: 'en',
  supportedLanguages: ['en', 'ar', 'fr', 'de', 'es', 'it', 'ru'],
  timezone: 'Africa/Cairo',
  contactInfo: {
    email: 'info@pyramidsofgiza.com',
    phone: '+201001234500',
    address: 'Al Haram, Giza Governorate, Egypt',
  },
  socialLinks: {
    facebook: 'https://facebook.com/pyramidsofgiza',
    instagram: 'https://instagram.com/pyramidsofgiza',
  },
  seoSettings: {
    metaTitle: 'The Great Pyramids of Giza — Official Heritage Tours of Ancient Egypt',
    metaDescription:
      "Book guided tours of the Great Pyramid of Khufu, the Sphinx, Valley of the Kings, Karnak, and Abu Simbel. Egyptologist-led experiences across Egypt's most iconic monuments.",
    keywords: [
      'great pyramids of giza',
      'pyramid of khufu',
      'valley of the kings',
      'karnak temple',
      'abu simbel',
      'egypt heritage tours',
      'sphinx of giza',
    ],
  },
  status: 'active' as const,
};

// 5 flagship tours — heritage / monumental sites. Slugs are SEO-anchored.
const GIZA_TOURS: Array<{
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  category: string;
  duration: string;
  priceFrom: number;
  city: string;
  coordinates: { lat: number; lng: number };
  imagePrompt: string;
  era: string;
}> = [
  {
    slug: 'great-pyramid-of-khufu-guided-tour',
    title: 'The Great Pyramid of Khufu — Egyptologist-Led Tour',
    metaTitle: 'Great Pyramid of Khufu Guided Tour | Pyramids of Giza',
    metaDescription:
      "Step inside the only surviving wonder of the ancient world. Egyptologist-led tour of the Great Pyramid of Khufu on the Giza Plateau — interior chambers, Solar Boat Museum, and the Sphinx.",
    category: 'ticket',
    duration: '4 hours',
    priceFrom: 89,
    city: 'Giza',
    coordinates: { lat: 29.9792, lng: 31.1342 },
    era: 'Old Kingdom · 4th Dynasty · c. 2580–2560 BCE',
    imagePrompt:
      'Cinematic editorial photograph of the Great Pyramid of Khufu at golden hour, soft warm side-light raking across the limestone blocks, deep cobalt sky above, fine particles of desert dust in the air, minimal foreground with single human figure for scale, photographed in the style of a museum exhibition print, painterly, monumental, no text, no logos',
  },
  {
    slug: 'sphinx-giza-plateau-sunset-tour',
    title: 'The Sphinx and Giza Plateau — Sunset Heritage Walk',
    metaTitle: 'Sphinx of Giza Sunset Tour | Pyramids of Giza',
    metaDescription:
      'A guided sunset walk across the Giza Plateau — the Great Sphinx, the three pyramids, the Valley Temple, and the dramatic light over the necropolis as the sun sets behind the dunes.',
    category: 'ticket',
    duration: '3 hours',
    priceFrom: 65,
    city: 'Giza',
    coordinates: { lat: 29.9753, lng: 31.1376 },
    era: 'Old Kingdom · 4th Dynasty · c. 2500 BCE',
    imagePrompt:
      'Editorial photograph of the Great Sphinx of Giza facing the camera at sunset, profile of the three pyramids visible behind, deep amber and rose sky, dramatic side-lighting on the limestone, photographed like a National Geographic cover, painterly atmosphere, monumental composition',
  },
  {
    slug: 'valley-of-the-kings-luxor-day-tour',
    title: 'Valley of the Kings — Royal Tombs Day Tour from Luxor',
    metaTitle: 'Valley of the Kings Day Tour | Pyramids of Giza',
    metaDescription:
      "Descend into the royal tombs of Egypt's New Kingdom pharaohs in the Valley of the Kings. Egyptologist-guided tour from Luxor with access to three tombs and the temple of Hatshepsut.",
    category: 'tour',
    duration: '8 hours',
    priceFrom: 145,
    city: 'Luxor',
    coordinates: { lat: 25.7402, lng: 32.6014 },
    era: 'New Kingdom · 18th–20th Dynasty · c. 1550–1070 BCE',
    imagePrompt:
      'Interior of an Egyptian royal tomb in the Valley of the Kings, vivid coloured hieroglyph wall paintings glowing under warm lamp-light, deep painted blue ceiling with golden stars, narrow stone corridor receding to vanishing point, photographed as a fine-art print, atmospheric and monumental',
  },
  {
    slug: 'karnak-temple-at-dawn-luxor',
    title: 'Karnak Temple at Dawn — Hypostyle Hall Private Tour',
    metaTitle: 'Karnak Temple Dawn Tour | Pyramids of Giza',
    metaDescription:
      "Walk the Hypostyle Hall of Karnak Temple as the morning light filters through its 134 colossal columns. A pre-opening private tour led by an accredited Egyptologist.",
    category: 'ticket',
    duration: '4 hours',
    priceFrom: 95,
    city: 'Luxor',
    coordinates: { lat: 25.7188, lng: 32.6573 },
    era: 'Middle to New Kingdom · c. 2000–1000 BCE',
    imagePrompt:
      'Hypostyle Hall of Karnak Temple at dawn, morning sun-rays filtering through forest of massive carved stone columns, warm golden light hitting hieroglyphic reliefs, atmospheric haze, single robed figure in distance for scale, editorial museum photography',
  },
  {
    slug: 'abu-simbel-day-trip-from-aswan',
    title: 'Abu Simbel — Day Trip from Aswan',
    metaTitle: 'Abu Simbel Day Trip from Aswan | Pyramids of Giza',
    metaDescription:
      "Visit the colossal rock-cut temples of Ramses II at Abu Simbel — engineered to align with the sun on two days each year. Comfortable day trip from Aswan with an Egyptologist guide.",
    category: 'tour',
    duration: '10 hours',
    priceFrom: 175,
    city: 'Aswan',
    coordinates: { lat: 22.3372, lng: 31.6258 },
    era: 'New Kingdom · 19th Dynasty · c. 1264 BCE',
    imagePrompt:
      'Frontal view of the Great Temple of Abu Simbel, four colossal seated statues of Ramses II carved into the sandstone cliff, brilliant morning sunlight illuminating the facade, deep blue Egyptian sky, no figures, monumental editorial photography, painterly',
  },
];

const GIZA_CUSTOM_PAGES = [
  {
    slug: 'about-us',
    title: 'About',
    metaTitle: 'About | The Great Pyramids of Giza',
    metaDescription:
      "Heritage experiences across Egypt's most significant monuments. Curated by accredited Egyptologists, designed for the traveller who wants context, not just a photograph.",
    body: `<p>The Great Pyramids of Giza is a heritage-experience brand within the Attractions Network. We operate guided tours at the most significant ancient sites in Egypt — the Giza Plateau, the Valley of the Kings, Karnak Temple, Abu Simbel, and the Egyptian Museum — led exclusively by accredited Egyptologist guides.</p><p>Our intent is simple: take the wonder you've imagined since childhood and put context around it. Not a checklist tour. Not a souvenir-stop loop. A real, narrated, deeply-prepared visit to monuments that have shaped civilisation for five thousand years.</p><h3>What sets the experience apart</h3><ul><li><strong>Egyptologist guides</strong> — accredited by the Egyptian Ministry of Antiquities, fluent in English, German, French, Spanish, Italian, Russian, and Arabic.</li><li><strong>Small groups</strong> — every tour caps at 12 guests so the guide can speak with each visitor.</li><li><strong>Off-peak access</strong> — pre-opening dawn tours at Karnak; sunset walks across the Giza Plateau after the day crowds have left.</li><li><strong>Full transparency</strong> — tickets, fees, transport, and gratuities are all included up front. No on-tour upsells.</li><li><strong>Heritage-first</strong> — we operate inside the access rules set by the Ministry of Antiquities and contribute to the conservation funds at every site we visit.</li></ul>`,
    sortOrder: 1,
  },
  {
    slug: 'contact-us',
    title: 'Contact',
    metaTitle: 'Contact | The Great Pyramids of Giza',
    metaDescription:
      'Get in touch with our reservations team — replies within an hour, 24/7. Tours of the Giza Plateau, Valley of the Kings, Karnak, Abu Simbel.',
    body: `<p>Our reservations team replies within an hour, day or night.</p><p><strong>Email:</strong> info@pyramidsofgiza.com<br/><strong>Phone:</strong> +20 100 123 4500<br/><strong>WhatsApp:</strong> +20 100 123 4500<br/><strong>Office:</strong> Al Haram, Giza Governorate, Egypt</p><p>For groups of more than 12, multi-day itineraries, or private Egyptologist requests, write to us directly and we'll build the trip with you.</p>`,
    sortOrder: 2,
  },
  {
    slug: 'terms-and-conditions',
    title: 'Terms & Conditions',
    metaTitle: 'Terms & Conditions | The Great Pyramids of Giza',
    metaDescription:
      'Booking, cancellation, conduct, and site-access terms for heritage tours operated by The Great Pyramids of Giza.',
    body: `<h3>Booking</h3><p>Bookings are confirmed once payment (or deposit) is received. You will receive a confirmation email and digital ticket within an hour.</p><h3>Cancellation</h3><p>Free cancellation up to 24 hours before the tour. Cancellations within 24 hours forfeit the deposit. No-shows are non-refundable.</p><h3>Site access</h3><p>All visitors must comply with the Ministry of Antiquities' access rules: no flash photography inside tombs; no climbing on monuments; modest dress at all sites; valid government-issued ID required for entry. Some interior chambers (e.g. the King's Chamber of the Great Pyramid) have separate ticketing and limited daily availability.</p><h3>Liability</h3><p>The Great Pyramids of Giza operates under full third-party and operator liability insurance. Guests visit at their own risk and acknowledge the inherent conditions of historic, uneven, and confined sites.</p>`,
    sortOrder: 3,
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    metaTitle: 'Privacy Policy | The Great Pyramids of Giza',
    metaDescription:
      "How we collect, use, and protect your personal information when you book a heritage tour with The Great Pyramids of Giza.",
    body: `<p>We collect only what is required to deliver your tour and follow up afterward. Your data is never sold to third parties.</p><h3>What we collect</h3><p>Name, email, phone, hotel name (for transfer arrangements), and booking details.</p><h3>How we use it</h3><p>To process your booking, send confirmation, coordinate pickup, send a post-tour feedback request, and — only if you opt in — share occasional curated updates about new heritage experiences.</p><h3>Cookies</h3><p>We use cookies for analytics and to remember your preferences across visits. You can disable cookies in your browser settings without losing booking functionality.</p><h3>Contact</h3><p>For privacy enquiries write to <a href="mailto:info@pyramidsofgiza.com">info@pyramidsofgiza.com</a>.</p>`,
    sortOrder: 4,
  },
];

async function enrichTour(slug: string, title: string, era: string, duration: string, priceFrom: number) {
  const system = `You are writing for a flagship Egyptian heritage tour operator. The tone is editorial, museum-publication quality — like a National Geographic feature or a Smithsonian catalogue. Specific, factual, no marketing fluff, no exclamation points, no generic adventure clichés. The reader is an educated traveller who wants depth.`;
  const user = `Tour: ${title}
Slug: ${slug}
Historical era: ${era}
Duration: ${duration}
Price from: USD ${priceFrom} per person

Return JSON with these exact fields (no markdown, no extra keys):
{
  "shortDescription": "<one strong 25-word elevator pitch — what the visitor will see and feel>",
  "description": "<2 paragraph rich tour description, ~140 words total, weaving in concrete historical detail (rulers, dynasties, architectural features) and specific moments from the visit>",
  "highlights": ["<5 short bullets, max 8 words each — what makes this visit distinctive>"],
  "inclusions": ["<5 items: entry tickets, transport, guide, water, etc.>"],
  "exclusions": ["<3 items: tips, optional add-ons, etc.>"],
  "whatToBring": ["<5 items appropriate for a heritage site visit>"],
  "itinerary": [
    {"time": "07:00", "duration": "1 hour", "title": "<step>", "description": "<one-liner with specific detail>"},
    {"time": "08:00", "duration": "2 hours", "title": "<step>", "description": "<one-liner>"}
  ]
}`;
  const raw = await callGPT(system, user);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function seedGiza() {
  log(`\n═════════ The Great Pyramids of Giza ═════════`);

  const existingTenantForImages = await Tenant.findOne({ slug: GIZA_TENANT.slug });
  let logo = existingTenantForImages?.logo || '';
  let heroImages: string[] = existingTenantForImages?.heroImages || [];
  const needsLogo = !logo || logo.startsWith('/logos/');
  const needsHeroes = heroImages.length < 3;

  if (!TOURS_ONLY && !SKIP_IMAGES && needsLogo) {
    log('Generating logo…');
    logo = await uploadGeneratedImage(
      'Monumental serif emblem logo for "The Great Pyramids of Giza" heritage brand. Single classical Trajan-style monogram "P G" intertwined with stylised pyramid silhouette and an ankh, burnished gold on transparent background, minimal hairline strokes, editorial museum identity, vector-precise, no extra text, no other ornamentation',
      `attractions-network/tenant-logos/${GIZA_TENANT.slug}`,
      '1024x1024'
    );
  } else if (logo) {
    log(`✓ Reusing existing logo: ${logo.slice(0, 80)}…`);
  }

  if (!TOURS_ONLY && !SKIP_IMAGES && needsHeroes) {
    log('Generating 3 hero images…');
    const heroPrompts = [
      'Cinematic editorial photograph of the Great Pyramid of Khufu and Khafre at golden hour, single figure walking in foreground for scale, soft mist clinging to the base of the monuments, deep cobalt sky transitioning to amber at the horizon, photographed in the style of a National Geographic cover, painterly, monumental, no text',
      'Wide editorial shot of the Hypostyle Hall of Karnak Temple at dawn, beams of warm morning sun cutting through the forest of 134 colossal carved columns, dust particles suspended in the rays, hieroglyphic reliefs glowing on the stone, atmospheric and reverential',
      'Wide editorial photograph of the Great Sphinx of Giza in profile at sunset, the three pyramids of the Giza Plateau silhouetted behind, dramatic amber and rose sky, deep shadows on the limestone monument, painterly fine-art composition, no text, no figures',
    ];
    const newHeroes: string[] = [];
    for (const [i, p] of heroPrompts.entries()) {
      const url = await uploadGeneratedImage(p, `attractions-network/tenant-heroes/${GIZA_TENANT.slug}`, '1536x1024');
      if (url) newHeroes.push(url);
      log(`  hero ${i + 1}/${heroPrompts.length} done`);
    }
    if (newHeroes.length > 0) heroImages = newHeroes;
  } else if (heroImages.length > 0) {
    log(`✓ Reusing existing ${heroImages.length} hero image(s)`);
  }

  const newPreviewCode = generatePreviewAccessCode();
  const existingTenant = await Tenant.findOne({ slug: GIZA_TENANT.slug }).select('+previewAccessCode +previewAccessCodeUpdatedAt');
  let tenant;
  if (existingTenant) {
    log('Updating existing tenant…');
    const preservedCode = existingTenant.previewAccessCode;
    Object.assign(existingTenant, GIZA_TENANT);
    if (logo) existingTenant.logo = logo;
    if (heroImages.length > 0) existingTenant.heroImages = heroImages;
    existingTenant.customPages = GIZA_CUSTOM_PAGES;
    if (preservedCode) {
      existingTenant.previewAccessCode = preservedCode;
    } else {
      existingTenant.previewAccessCode = newPreviewCode;
      existingTenant.previewAccessCodeUpdatedAt = new Date();
    }
    await existingTenant.save();
    tenant = existingTenant;
  } else {
    log('Creating new tenant…');
    tenant = await Tenant.create({
      ...GIZA_TENANT,
      logo: logo || '/logos/placeholder.png',
      heroImages,
      customPages: GIZA_CUSTOM_PAGES,
      previewAccessCode: newPreviewCode,
      previewAccessCodeUpdatedAt: new Date(),
    });
  }
  log(`✅ Tenant ID: ${tenant._id} · slug: ${tenant.slug}`);

  // Brand-admin user
  const brandAdminEmail = `${GIZA_TENANT.slug}@foxestechnology.com`;
  const existingUser = await User.findOne({ email: brandAdminEmail });
  if (!existingUser) {
    const initialPassword = requireScriptSecret('TENANT_ADMIN_INITIAL_PASSWORD');
    await User.create({
      email: brandAdminEmail,
      password: await hashPassword(initialPassword),
      firstName: 'Giza',
      lastName: 'Admin',
      role: 'brand-admin',
      status: 'active',
      assignedTenants: [tenant._id],
    });
    log(`✅ Brand-admin user: ${brandAdminEmail}`);
  } else {
    log(`ℹ Brand-admin already exists: ${brandAdminEmail}`);
  }

  // Cleanup: remove orphan tours no longer in the canonical seed list.
  const canonicalSlugs = new Set(GIZA_TOURS.map((t) => `${GIZA_TENANT.slug}-${t.slug}`));
  const canonicalPaths = new Set(GIZA_TOURS.map((t) => t.slug));
  const orphans = await Attraction.find({
    tenantIds: { $in: [tenant._id] },
    $nor: [
      { slug: { $in: Array.from(canonicalSlugs) } },
      { pathSlug: { $in: Array.from(canonicalPaths) } },
    ],
  }).select('_id slug tenantIds');
  for (const orph of orphans) {
    if (Array.isArray(orph.tenantIds) && orph.tenantIds.length === 1) {
      await Attraction.deleteOne({ _id: orph._id });
      log(`  🗑  Removed orphan tour: ${orph.slug}`);
    } else {
      await Attraction.updateOne({ _id: orph._id }, { $pull: { tenantIds: tenant._id } });
      log(`  🔗 Detached shared tour: ${orph.slug}`);
    }
  }

  log(`\nSeeding ${GIZA_TOURS.length} heritage tours…`);
  for (const tour of GIZA_TOURS) {
    log(`  · ${tour.slug}`);
    let enriched = await enrichTour(tour.slug, tour.title, tour.era, tour.duration, tour.priceFrom).catch(() => null);
    if (!enriched) {
      log('    ⚠ enrichment failed — using fallback');
      enriched = {
        shortDescription: `${tour.title} — an Egyptologist-led visit to one of Egypt's most significant ancient sites.`,
        description: `Visit ${tour.title} with an accredited Egyptologist guide. ${tour.era}. The tour includes full historical context, off-peak access where available, and small-group attention throughout.`,
        highlights: ['Egyptologist-led', 'Small group (max 12)', 'Off-peak access', 'All entry tickets included', 'Hotel pickup included'],
        inclusions: ['Hotel pickup & drop-off', 'All entry tickets', 'Egyptologist guide', 'Bottled water', 'Air-conditioned transport'],
        exclusions: ['Gratuities (recommended)', 'Personal expenses', 'Optional interior-chamber tickets'],
        whatToBring: ['Comfortable walking shoes', 'Sun hat', 'Sunscreen', 'Bottled water (additional)', 'Government-issued ID'],
        itinerary: [
          { time: '07:00', duration: '1 hour', title: 'Hotel pickup', description: 'Air-conditioned transfer from your accommodation.' },
          { time: '08:00', duration: '2 hours', title: 'Site visit', description: 'Egyptologist-led exploration of the main monument and surrounds.' },
          { time: '10:00', duration: '1 hour', title: 'Return', description: 'Transfer back to your hotel.' },
        ],
      };
    }

    const storageSlug = `${GIZA_TENANT.slug}-${tour.slug}`;
    const existingForImage = await Attraction.findOne({
      $or: [{ slug: storageSlug }, { pathSlug: tour.slug, tenantIds: { $in: [tenant._id] } }],
    });
    const tourImage = !SKIP_IMAGES && !existingForImage?.images?.length
      ? await uploadGeneratedImage(tour.imagePrompt, `attractions-network/tours/${GIZA_TENANT.slug}`, '1536x1024')
      : (existingForImage?.images?.[0] || '');
    if (existingForImage?.images?.length) log(`    ✓ Reusing existing tour image`);

    const attrPayload = {
      slug: storageSlug,
      pathSlug: tour.slug,
      title: tour.title,
      shortDescription: enriched.shortDescription,
      description: enriched.description,
      images: tourImage ? [tourImage] : [],
      category: tour.category,
      destination: { city: tour.city, country: 'Egypt', coordinates: tour.coordinates },
      duration: tour.duration,
      languages: ['en', 'ar', 'fr', 'de', 'es', 'it', 'ru'],
      rating: 4.9,
      reviewCount: Math.floor(Math.random() * 250) + 80,
      priceFrom: tour.priceFrom,
      currency: 'USD',
      pricingOptions: [
        { id: 'adult', name: 'Adult', description: 'Full Egyptologist-led tour', price: tour.priceFrom },
        { id: 'student', name: 'Student', description: 'Valid student ID required', price: Math.round(tour.priceFrom * 0.85) },
        { id: 'child', name: 'Child (5-12)', description: 'Reduced rate', price: Math.round(tour.priceFrom * 0.6) },
      ],
      addons: [
        { id: 'interior-chamber', name: 'Interior Chamber Ticket', description: 'Where applicable, access the inner chambers (subject to daily availability)', price: 25 },
        { id: 'private-egyptologist', name: 'Upgrade to Private Egyptologist', description: 'Switch from small-group to a private tour', price: 120 },
      ],
      entryWindows: [],
      itinerary: enriched.itinerary,
      whatToBring: enriched.whatToBring,
      accessibility: ['Uneven terrain', 'Some confined spaces', 'Walking required'],
      gettingThere: [{ mode: 'Hotel pickup', description: `Included from ${tour.city} hotels` }],
      highlights: enriched.highlights,
      inclusions: enriched.inclusions,
      exclusions: enriched.exclusions,
      meetingPoint: { address: `${tour.city} hotel lobby`, instructions: 'Be ready 10 minutes before pickup time', mapUrl: '' },
      cancellationPolicy: 'Free cancellation up to 24 hours before',
      instantConfirmation: true,
      mobileTicket: true,
      badges: ['instant-confirm', 'free-cancellation', 'skip-line'],
      availability: { type: 'flexible', advanceBooking: 1 },
      seo: {
        metaTitle: tour.metaTitle,
        metaDescription: tour.metaDescription,
        keywords: [tour.slug.replace(/-/g, ' '), 'egypt heritage', 'egyptologist tour'],
      },
      tenantIds: [tenant._id],
      status: 'active',
      featured: GIZA_TOURS.indexOf(tour) < 4,
      sortOrder: GIZA_TOURS.indexOf(tour),
    };

    if (existingForImage) {
      Object.assign(existingForImage, attrPayload);
      if (tourImage) existingForImage.images = [tourImage];
      await existingForImage.save();
    } else {
      await Attraction.create(attrPayload);
    }
  }

  const final = await Tenant.findById(tenant._id).select('+previewAccessCode');
  log(`\n🔑 Preview Code: ${final?.previewAccessCode || newPreviewCode}`);
  log(`🌐 Preview URL: https://foxes-network.netlify.app/?tenant=${tenant.slug}`);
  return tenant;
}

(async () => {
  await connectDatabase();
  try {
    await seedGiza();
  } finally {
    await disconnectDatabase();
  }
  log('\n✨ Giza seed complete.');
  process.exit(0);
})().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
