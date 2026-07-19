/**
 * Seed Safari Sahara Hurghada + Quad Tour Safari tenants with logos, hero
 * images, custom pages, and 8 attractions each.
 *
 * Safari Sahara content is SEO-anchored: titles + meta scraped verbatim from
 * the live safari-sahara.com so we don't break years of ranking, with body
 * copy enriched via GPT-4. Quad Tour Safari is greenfield — fully generated.
 *
 * Idempotent: rerunning creates/updates by slug. --skip-images keeps existing
 * Cloudinary URLs (saves time + cost on subsequent runs).
 *
 * Usage:
 *   npx ts-node src/scripts/seed-safari-tenants.ts
 *   npx ts-node src/scripts/seed-safari-tenants.ts --skip-images
 *   npx ts-node src/scripts/seed-safari-tenants.ts --tenant=safari-sahara
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { User } from '../models/User';
import { generateImageFromPrompt } from '../services/image-generation.service';
import { uploadBase64Image } from '../services/upload.service';
import { hashPassword, generatePreviewAccessCode } from '../utils/hash';
import { requireScriptSecret } from './require-script-secret';
import { env } from '../config/env';

// ─────────────────────────────────────────────────────────────────────
// CLI flags
// ─────────────────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2));
const SKIP_IMAGES = args.has('--skip-images');
const ONLY_TENANT = process.argv.find((a) => a.startsWith('--tenant='))?.split('=')[1] || null;
// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
const log = (...args: unknown[]) => console.log('[seed]', ...args);

async function uploadGeneratedImage(prompt: string, folder: string, size: '1024x1024' | '1536x1024' = '1536x1024'): Promise<string> {
  if (SKIP_IMAGES) {
    log(`  ⏭  skip image (${folder}): ${prompt.slice(0, 60)}…`);
    return '';
  }
  // Up to 3 attempts on timeout/transient errors. OpenAI gpt-image-1.5 and
  // Cloudinary uploads occasionally 499/503 — a simple retry handles it.
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      log(`  🎨 [${attempt}/${maxAttempts}] generating image: ${prompt.slice(0, 70)}…`);
      const { base64, mimeType } = await generateImageFromPrompt({ prompt, size, quality: 'high', outputFormat: 'jpeg' });
      const dataUrl = `data:${mimeType};base64,${base64}`;
      const result = await uploadBase64Image(dataUrl, folder);
      log(`     → ${result.url.slice(0, 90)}…`);
      return result.url;
    } catch (err) {
      lastError = err;
      log(`  ⚠  attempt ${attempt} failed: ${err instanceof Error ? err.message : 'unknown'}`);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  log(`  ❌ giving up on this image after ${maxAttempts} attempts. Continuing.`);
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
// SAFARI SAHARA HURGHADA — SEO-anchored, scraped + enriched
// ─────────────────────────────────────────────────────────────────────
const SAFARI_SAHARA_TENANT = {
  slug: 'safari-sahara-hurghada',
  name: 'Safari Sahara Hurghada',
  domain: 'safari-sahara-hurghada.foxesnetwork.com',
  customDomain: 'safari-sahara.com',
  flatUrls: true,
  tagline: 'Egypt’s Sand · Sun · Adventure',
  description:
    'Safari Sahara is Hurghada’s leading desert adventure operator — quad biking, jeep safaris, dune-buggy rides, and Polaris RZR expeditions across the Eastern Desert and the Red Sea coast. Trusted by thousands of travellers for over a decade.',
  theme: { primaryColor: '#D4A843', secondaryColor: '#8B5A2B', accentColor: '#E5C875' },
  fonts: { heading: 'Bebas Neue', body: 'Lora' },
  designMode: 'safarisahara',
  defaultCurrency: 'USD',
  defaultLanguage: 'en',
  supportedLanguages: ['en', 'de', 'fr', 'ru', 'ar'],
  timezone: 'Africa/Cairo',
  contactInfo: {
    email: 'info@safari-sahara.com',
    phone: '+201001234567',
    address: 'Sahl Hasheesh Road, Hurghada, Red Sea Governorate, Egypt',
  },
  socialLinks: {
    facebook: 'https://facebook.com/safarisahara',
    instagram: 'https://instagram.com/safarisahara',
  },
  seoSettings: {
    metaTitle: 'Hurghada Safari Tours | Safari Sahara — Quad, Jeep, Buggy',
    metaDescription:
      'Book the best Hurghada safari tours with Safari Sahara: quad biking, jeep safaris, dune buggies, Polaris RZR. Daily departures, expert Bedouin guides, all-inclusive packages.',
    keywords: ['hurghada safari', 'quad biking hurghada', 'jeep safari', 'dune buggy', 'polaris rzr safari', 'desert tour egypt'],
  },
  status: 'active' as const,
};

// Top 8 SEO-priority URLs from the source sitemap. Titles + meta scraped from
// safari-sahara.com so we keep the existing keyword + content structure that's
// been ranking. Body, itinerary, inclusions, and image prompts generated by
// GPT to flesh each tour out with accurate destination context.
const SAFARI_SAHARA_TOURS: Array<{
  slug: string;
  scrapedTitle: string;
  scrapedMetaDescription: string;
  category: string;
  duration: string;
  priceFrom: number;
  vehicleType: 'quad' | 'jeep' | 'buggy' | 'rzr';
  imagePrompt: string;
}> = [
  {
    slug: 'hurghada-quad-biking',
    scrapedTitle: 'Discover Hurghada Quad Biking Adventures with Safari Sahara',
    scrapedMetaDescription: 'Experience thrilling Hurghada Quad Biking and explore stunning Red Sea desert landscapes with Safari Sahara.',
    category: 'adventure',
    duration: '3 hours',
    priceFrom: 25,
    vehicleType: 'quad',
    imagePrompt: 'Group of riders on red ATV quad bikes racing across golden sand dunes near Hurghada, Egypt at golden hour, Red Sea desert in background, dust trails, action photography, dramatic warm lighting',
  },
  {
    slug: 'hurghada-jeep-safari',
    scrapedTitle: 'Hurghada Jeep Safari — Eastern Desert Adventure with Safari Sahara',
    scrapedMetaDescription: 'Join the ultimate Hurghada Jeep Safari adventure with Safari Sahara. Explore Eastern Desert highlights with expert local guides.',
    category: 'adventure',
    duration: '6 hours',
    priceFrom: 39,
    vehicleType: 'jeep',
    imagePrompt: 'Convoy of vintage open-top 4x4 Jeep Wrangler safari vehicles climbing rugged desert mountain pass near Hurghada, Bedouin guides, sweeping Eastern Desert panorama, dramatic sky',
  },
  {
    slug: 'morning-quad-biking-tour-hurghada',
    scrapedTitle: 'Morning Quad Biking Tour Hurghada | Sahara Park Safari',
    scrapedMetaDescription: 'Start your day with the Morning Quad Biking Tour Hurghada — guided desert ride through Sahara Park with refreshments included.',
    category: 'adventure',
    duration: '3 hours',
    priceFrom: 22,
    vehicleType: 'quad',
    imagePrompt: 'Lone quad bike rider in morning desert light near Hurghada, soft golden sunrise haze, Bedouin tent in middle distance, vast sand plain, calm and inviting',
  },
  {
    slug: 'sunset-dune-buggy-adventure-with-barbecue-dinner',
    scrapedTitle: 'Sunset Dune Buggy Adventure with Barbecue Dinner | Safari Sahara',
    scrapedMetaDescription: 'Enjoy a thrilling Sunset Dune Buggy Adventure with Barbecue Dinner under the desert sky — Bedouin show, camel ride, and authentic Egyptian feast included.',
    category: 'adventure',
    duration: '5 hours',
    priceFrom: 49,
    vehicleType: 'buggy',
    imagePrompt: 'Two-seater dune buggy launching over crest of orange dune at golden sunset near Hurghada, dust plume, dramatic Red Sea desert backdrop, action shot',
  },
  {
    slug: 'polaris-rzr-safari-hurghada',
    scrapedTitle: 'Polaris RZR Safari Hurghada — Premium Desert Adventure | Safari Sahara',
    scrapedMetaDescription: 'Drive a top-of-the-line Polaris RZR through Hurghada’s Eastern Desert. Premium dune-bashing experience with Safari Sahara’s expert guides.',
    category: 'adventure',
    duration: '4 hours',
    priceFrom: 89,
    vehicleType: 'rzr',
    imagePrompt: 'Polaris RZR side-by-side off-road vehicle drifting on red Egyptian desert track, helmeted couple driving, sand spraying, dramatic action photo, late afternoon sun',
  },
  {
    slug: 'hurghada-quad-bike-power-tour',
    scrapedTitle: 'Hurghada Quad Bike Power Tour — High-Speed Desert Ride | Safari Sahara',
    scrapedMetaDescription: 'Take on the Hurghada Quad Bike Power Tour — top-speed quad ride for experienced adventurers across vast desert flats with Safari Sahara.',
    category: 'adventure',
    duration: '2.5 hours',
    priceFrom: 35,
    vehicleType: 'quad',
    imagePrompt: 'High-speed quad bike at full throttle kicking up trail of desert sand near Hurghada, motion blur background, rider in goggles and helmet, late afternoon golden light',
  },
  {
    slug: 'private-quad-bike-safari-trip-sahara-park',
    scrapedTitle: 'Private Quad Bike Safari Trip — Sahara Park Hurghada | Safari Sahara',
    scrapedMetaDescription: 'Book a Private Quad Bike Safari Trip to Sahara Park Hurghada. Personalised desert ride for couples, families, and small groups.',
    category: 'adventure',
    duration: '3 hours',
    priceFrom: 65,
    vehicleType: 'quad',
    imagePrompt: 'Private quad-bike couple resting at scenic desert viewpoint overlooking the Red Sea coast at Sahara Park Hurghada, warm late afternoon, peaceful intimate framing',
  },
  {
    slug: 'hurghada-sunset-desert-safari-trip-by-quad-bike',
    scrapedTitle: 'Hurghada Sunset Desert Safari by Quad Bike | Safari Sahara',
    scrapedMetaDescription: 'Ride into the sunset on a quad bike through the Hurghada desert. Dinner, Bedouin show, and stargazing included with Safari Sahara.',
    category: 'adventure',
    duration: '5 hours',
    priceFrom: 45,
    vehicleType: 'quad',
    imagePrompt: 'Line of quad bikes silhouetted against fiery orange Egyptian desert sunset, riders cruising along ridge, cinematic widescreen composition, Red Sea desert horizon',
  },
];

const SAFARI_SAHARA_CUSTOM_PAGES = [
  {
    slug: 'about-us',
    title: 'About Safari Sahara',
    metaTitle: 'About Safari Sahara — Hurghada Desert Adventure Operator',
    metaDescription: 'Learn about Safari Sahara, Hurghada’s trusted desert safari operator since 2010 — quad biking, jeep tours, dune buggy and Polaris RZR adventures.',
    body: `<p>Safari Sahara has been Hurghada’s trusted desert safari operator since 2010. We run thousands of trips every year for travellers from Europe, the Middle East, and beyond — quad biking, jeep safaris, dune-buggy rides, Polaris RZR expeditions, and bespoke private adventures across the Eastern Desert.</p><p>Our guides are local Bedouins born and raised in this landscape. They know every dune, every wadi, and every hidden viewpoint over the Red Sea. With Safari Sahara, you’re not following a tourist script — you’re riding alongside people who call this desert home.</p><h3>What we’re known for</h3><ul><li><strong>Modern fleet</strong> — quads, buggies, and Polaris RZRs serviced after every tour.</li><li><strong>Multi-language guides</strong> — English, German, Russian, Arabic.</li><li><strong>Hotel pickup across Hurghada, Sahl Hasheesh, Makadi Bay, El Gouna, and Soma Bay.</li><li><strong>Family-friendly</strong> — kid-safe quads, age-appropriate routes, dedicated child rides.</li><li><strong>Sunset, sunrise, and stargazing</strong> departures in addition to the daily classic.</li></ul>`,
    sortOrder: 1,
  },
  {
    slug: 'contact-us',
    title: 'Contact Safari Sahara',
    metaTitle: 'Contact Safari Sahara — Book Your Hurghada Desert Safari',
    metaDescription: 'Contact Safari Sahara for your next Hurghada desert adventure. Email, phone, and WhatsApp — daily 24/7 booking support.',
    body: `<p>Reach out anytime — our reservations team replies within an hour, 24/7.</p><p><strong>Email:</strong> info@safari-sahara.com<br/><strong>Phone:</strong> +20 100 123 4567<br/><strong>WhatsApp:</strong> +20 100 123 4567<br/><strong>Office:</strong> Sahl Hasheesh Road, Hurghada, Red Sea Governorate, Egypt</p><p>Hotel pickup is available across Hurghada, Sahl Hasheesh, Makadi Bay, El Gouna, and Soma Bay.</p>`,
    sortOrder: 2,
  },
  {
    slug: 'terms-and-conditions',
    title: 'Terms and Conditions',
    metaTitle: 'Terms and Conditions | Safari Sahara',
    metaDescription: 'Safari Sahara terms and conditions: booking, cancellation, payment, safety, and liability for our Hurghada desert tours.',
    body: `<h3>Booking</h3><p>Bookings are confirmed once payment (or deposit) is received. A confirmation email with pickup details will be sent within an hour.</p><h3>Cancellation</h3><p>Free cancellation up to 24 hours before departure. Cancellations within 24 hours forfeit the deposit. No-shows are non-refundable.</p><h3>Safety</h3><p>All participants must complete a brief safety briefing before riding. Helmets and goggles are mandatory and provided. Pregnant women, those with serious back/neck conditions, and children under 8 are not permitted on quads.</p><h3>Liability</h3><p>Safari Sahara carries comprehensive operator insurance. Participants ride at their own risk and acknowledge that desert environments carry inherent hazards.</p>`,
    sortOrder: 3,
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    metaTitle: 'Privacy Policy | Safari Sahara',
    metaDescription: 'Read Safari Sahara’s privacy policy: how we collect, use, and protect your personal information when you book a Hurghada safari with us.',
    body: `<p>Safari Sahara takes your privacy seriously. This policy explains what we collect and how we use it.</p><h3>What we collect</h3><p>Name, email, phone, hotel name, and booking details — only what’s required to deliver your tour.</p><h3>How we use it</h3><p>To process your booking, contact you about pickup arrangements, send reminders, and request feedback after your tour. We never sell your data to third parties.</p><h3>Cookies</h3><p>Our website uses cookies for analytics and to remember your preferences. You can disable cookies in your browser settings.</p><h3>Contact</h3><p>For privacy inquiries, email <a href="mailto:info@safari-sahara.com">info@safari-sahara.com</a>.</p>`,
    sortOrder: 4,
  },
];

// ─────────────────────────────────────────────────────────────────────
// QUAD TOUR SAFARI — greenfield, fully generated
// ─────────────────────────────────────────────────────────────────────
const QUAD_TOUR_TENANT = {
  slug: 'quad-tour-safari',
  name: 'Quad Tour Safari',
  domain: 'quad-tour-safari.foxesnetwork.com',
  customDomain: 'quadtoursafari.com',
  flatUrls: false,
  tagline: 'Wild Desert. Real Adventure. Pure Egypt.',
  description:
    'Quad Tour Safari runs the Red Sea coast’s most adrenaline-rich desert experiences. From action-packed quad rides to overnight Bedouin camp expeditions — every tour is hand-built for travellers who want the desert raw, not packaged.',
  theme: { primaryColor: '#F97316', secondaryColor: '#7C2D12', accentColor: '#FCD34D' },
  fonts: { heading: 'Oswald', body: 'Inter' },
  designMode: 'quadtour',
  defaultCurrency: 'USD',
  defaultLanguage: 'en',
  supportedLanguages: ['en', 'de', 'ru', 'ar'],
  timezone: 'Africa/Cairo',
  contactInfo: {
    email: 'info@quadtoursafari.com',
    phone: '+201007654321',
    address: 'Hurghada, Red Sea Governorate, Egypt',
  },
  socialLinks: {
    facebook: 'https://facebook.com/quadtoursafari',
    instagram: 'https://instagram.com/quadtoursafari',
  },
  seoSettings: {
    metaTitle: 'Quad Tour Safari — Hurghada Desert Adventures',
    metaDescription:
      'Book wild desert adventures in Hurghada with Quad Tour Safari: quad biking, dune-buggy rides, jeep tours, Bedouin camps, and overnight desert expeditions.',
    keywords: ['quad tour safari', 'hurghada quad', 'desert adventure', 'wild desert egypt'],
  },
  status: 'active' as const,
};

// Reference tours mirror the live operator listing on
// https://www.getyourguide.com/wild-desert-safari-s665879/ — same structure,
// same activities, same hour/price tiers as the published GetYourGuide catalog.
const QUAD_TOUR_TOURS = [
  { slug: 'hurghada-desert-quad-atv-camel-bbq', title: 'Hurghada: Desert Quad Bike, ATV, Camel Ride & Optional BBQ', duration: '3 - 5 hours', priceFrom: 35, imagePrompt: 'Quad bike rider racing across orange Egyptian desert dunes, ATV nearby, camel guide silhouetted at horizon, golden afternoon light, action photography' },
  { slug: 'hurghada-stargazing-camel-bbq-candlelight', title: 'HRG: Desert Stargazing with Camel & BBQ Dinner on Candlelight', duration: '6.5 - 7 hours', priceFrom: 46, imagePrompt: 'Bedouin camp under stars in Egyptian desert, glowing candles arranged on sand, camels at rest, BBQ fire glow, Milky Way overhead, atmospheric night photography' },
  { slug: 'hurghada-desert-safari-dune-buggy-bbq', title: 'Hurghada: Desert Safari by Dune Buggy with Optional BBQ', duration: '2 - 5 hours', priceFrom: 63, imagePrompt: 'Bright orange dune buggy launching off Egyptian sand crest, dust spray, dramatic action shot, warm desert light, Red Sea coast horizon' },
  { slug: 'hurghada-jeep-safari-atv-buggy-camel-dinner-show', title: 'HRG: Jeep Safari with ATV, Buggy, Camel, Optional Dinner & Show', duration: '5 - 7 hours', priceFrom: 25, imagePrompt: 'Open-top desert safari jeep leading convoy of ATVs and buggies through Egyptian dunes, camel caravan in distance, sunset golden hour, adventure photography' },
  { slug: 'hurghada-quad-atv-camel-experience-3-or-5-hour', title: 'HRG: 3 or 5-Hour Quad Bike and ATV Experience with Camel Ride', duration: '5 hours', priceFrom: 31, imagePrompt: 'Group of riders on quad bikes pausing beside Bedouin guide and camels in Egyptian desert, friendly atmospheric scene, warm afternoon light' },
];

// ─────────────────────────────────────────────────────────────────────
// Per-tour content enrichment via GPT-4
// ─────────────────────────────────────────────────────────────────────
async function enrichTour(tenantName: string, slug: string, title: string, duration: string, priceFrom: number) {
  const system = `You are a travel-writer for a Hurghada desert adventure operator. Generate JSON for a tour page. Be specific, vivid, and accurate — no generic filler. All copy in clean conversational English.`;
  const user = `Tour: ${title}
Slug: ${slug}
Operator: ${tenantName}
Duration: ${duration}
Price from: USD ${priceFrom} per person

Return JSON with these exact fields (no markdown, no extra keys):
{
  "shortDescription": "<one strong 25-word elevator pitch>",
  "description": "<2 paragraph rich tour description, ~120 words total, weaving in concrete details about the Hurghada / Eastern Desert / Red Sea region>",
  "highlights": ["<5 short benefit bullets, max 8 words each>"],
  "inclusions": ["<5 items, e.g. hotel pickup, equipment, water, etc.>"],
  "exclusions": ["<3 items, e.g. tips, optional add-ons>"],
  "whatToBring": ["<5 items>"],
  "itinerary": [
    {"time": "08:00", "duration": "30 min", "title": "<step>", "description": "<one-liner>"},
    {"time": "09:00", "duration": "1 hour", "title": "<step>", "description": "<one-liner>"}
  ]
}`;
  const raw = await callGPT(system, user);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Main seed
// ─────────────────────────────────────────────────────────────────────
async function seedTenant(
  tenantData: Record<string, unknown>,
  tours: Array<{
    slug: string;
    scrapedTitle?: string;
    scrapedMetaDescription?: string;
    title?: string;
    category?: string;
    duration: string;
    priceFrom: number;
    vehicleType?: string;
    imagePrompt: string;
  }>,
  customPages: typeof SAFARI_SAHARA_CUSTOM_PAGES = []
) {
  const tenantName = tenantData.name as string;
  log(`\n═════════ ${tenantName} ═════════`);

  // Logo + hero images — skip regeneration if tenant already has them
  const existingTenantForImages = await Tenant.findOne({ slug: tenantData.slug as string });
  let logo = existingTenantForImages?.logo || '';
  let heroImages: string[] = existingTenantForImages?.heroImages || [];
  const needsLogo = !logo || logo.startsWith('/logos/');
  const needsHeroes = heroImages.length < 3;
  if (!SKIP_IMAGES && needsLogo) {
    log('Generating logo…');
    const logoPrompt =
      tenantData.slug === 'safari-sahara-hurghada'
        ? 'Premium emblem badge logo for "Safari Sahara Hurghada" desert adventure operator: stylised camel silhouette + sun + dunes + palm tree + waves, gold and warm-brown colour palette, clean vector style, transparent background, no extra text'
        : 'Bold action logo emblem for "Quad Tour Safari": stylised orange quad bike + camel + palm tree + desert dunes + sun, energetic action vibe, orange and amber colours on dark background, clean vector style, no extra text';
    logo = await uploadGeneratedImage(logoPrompt, `attractions-network/tenant-logos/${tenantData.slug}`, '1024x1024');
  } else if (logo) {
    log(`✓ Reusing existing logo: ${logo.slice(0, 80)}…`);
  }

  if (!SKIP_IMAGES && needsHeroes) {
    log('Generating 3 hero images…');
    const heroPrompts = [
      tenantData.slug === 'safari-sahara-hurghada'
        ? 'Cinematic widescreen Egyptian desert vista at golden hour: line of quad bikes cresting orange dune, Red Sea visible in distance, dramatic sky, photorealistic'
        : 'Dramatic action shot: orange quad bike launching off Egyptian desert dune, dust cloud, vibrant sunset, helmeted rider, motion blur, cinematic',
      tenantData.slug === 'safari-sahara-hurghada'
        ? 'Convoy of vintage Jeep safari vehicles climbing through Egyptian Eastern Desert mountain pass, Bedouin guides, sweeping panorama, late afternoon golden light'
        : 'Jeep safari roaring through narrow red rock canyon in Egyptian desert, dramatic shadows, off-road action, adventure photography',
      tenantData.slug === 'safari-sahara-hurghada'
        ? 'Bedouin camp at night under Milky Way: traditional tents, glowing fire, camels resting, Egyptian Red Sea desert, atmospheric nightscape'
        : 'Group of riders cruising on quad bikes along ridge silhouetted against fiery Egyptian sunset, cinematic widescreen, Red Sea desert',
    ];
    const newHeroes: string[] = [];
    for (const [i, p] of heroPrompts.entries()) {
      const url = await uploadGeneratedImage(p, `attractions-network/tenant-heroes/${tenantData.slug}`, '1536x1024');
      if (url) newHeroes.push(url);
      log(`  hero ${i + 1}/${heroPrompts.length} done`);
    }
    if (newHeroes.length > 0) heroImages = newHeroes;
  } else if (heroImages.length > 0) {
    log(`✓ Reusing existing ${heroImages.length} hero image(s)`);
  }

  // Upsert tenant. CRITICAL: select '+previewAccessCode' explicitly because
  // it's `select: false` by default — without this we'd think the code was
  // missing and rotate it on every rerun.
  const newPreviewCode = generatePreviewAccessCode();
  const existingTenant = await Tenant.findOne({ slug: tenantData.slug }).select('+previewAccessCode +previewAccessCodeUpdatedAt');
  let tenant;
  if (existingTenant) {
    log('Updating existing tenant…');
    const preservedCode = existingTenant.previewAccessCode;
    Object.assign(existingTenant, tenantData);
    if (logo) existingTenant.logo = logo;
    if (heroImages.length > 0) existingTenant.heroImages = heroImages;
    if (customPages.length > 0) existingTenant.customPages = customPages;
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
      ...tenantData,
      logo: logo || '/logos/placeholder.png',
      heroImages,
      customPages,
      previewAccessCode: newPreviewCode,
      previewAccessCodeUpdatedAt: new Date(),
    });
  }
  log(`✅ Tenant ID: ${tenant._id} · slug: ${tenant.slug}`);

  // Brand-admin user
  const brandAdminEmail = `${tenantData.slug}@foxestechnology.com`;
  const existingUser = await User.findOne({ email: brandAdminEmail });
  if (!existingUser) {
    const initialPassword = requireScriptSecret('TENANT_ADMIN_INITIAL_PASSWORD');
    await User.create({
      email: brandAdminEmail,
      password: await hashPassword(initialPassword),
      firstName: tenantName.split(' ')[0],
      lastName: 'Admin',
      role: 'brand-admin',
      status: 'active',
      assignedTenants: [tenant._id],
    });
    log(`✅ Brand-admin user: ${brandAdminEmail}`);
  } else {
    log(`ℹ Brand-admin already exists: ${brandAdminEmail}`);
  }

  // Cleanup: remove tours that are no longer in the canonical seed list.
  // We only purge attractions exclusively owned by THIS tenant — shared
  // attractions stay put. This keeps reruns idempotent when the tour list
  // changes (e.g. the QuadTour catalog was rewritten to mirror the live
  // GetYourGuide listing).
  const isFlatTenant = !!(tenantData as { flatUrls?: boolean }).flatUrls;
  const canonicalSlugs = new Set(
    tours.map((t) => (isFlatTenant ? `${tenantData.slug}-${t.slug}` : t.slug))
  );
  const canonicalPaths = new Set(tours.map((t) => t.slug));
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
      await Attraction.updateOne(
        { _id: orph._id },
        { $pull: { tenantIds: tenant._id } }
      );
      log(`  🔗 Detached shared tour from tenant: ${orph.slug}`);
    }
  }

  // Tours
  log(`\nSeeding ${tours.length} tours…`);
  for (const tour of tours) {
    const title = tour.scrapedTitle || tour.title || tour.slug;
    const metaTitle = tour.scrapedTitle;
    const metaDescription = tour.scrapedMetaDescription;
    log(`  · ${tour.slug}`);

    let enriched = await enrichTour(tenantName, tour.slug, title, tour.duration, tour.priceFrom).catch(() => null);
    if (!enriched) {
      log('    ⚠ enrichment failed — using fallback');
      enriched = {
        shortDescription: `${title} — book online with ${tenantName}.`,
        description: `Experience ${title} with ${tenantName}, the trusted desert adventure operator.`,
        highlights: ['Hotel pickup', 'Expert local guide', 'All equipment included', 'Photo opportunities', 'Small group'],
        inclusions: ['Hotel pickup & drop-off', 'Equipment', 'Bottled water', 'English-speaking guide', 'Insurance'],
        exclusions: ['Tips (recommended)', 'Personal expenses', 'Optional add-ons'],
        whatToBring: ['Comfortable clothes', 'Closed-toe shoes', 'Sunscreen', 'Sunglasses', 'Camera'],
        itinerary: [
          { time: '08:00', duration: '30 min', title: 'Hotel pickup', description: 'Air-conditioned transfer from your hotel.' },
          { time: '09:00', duration: '2 hours', title: 'Main activity', description: 'The core experience.' },
          { time: '11:00', duration: '30 min', title: 'Return', description: 'Transfer back to your hotel.' },
        ],
      };
    }

    // Skip image generation if attraction already has one (idempotent rerun)
    const isFlat = !!(tenantData as { flatUrls?: boolean }).flatUrls;
    const storageSlug = isFlat ? `${tenantData.slug}-${tour.slug}` : tour.slug;
    const existingForImage = await Attraction.findOne({
      $or: [{ slug: storageSlug }, { pathSlug: tour.slug, tenantIds: { $in: [tenant._id] } }],
    });
    const tourImage = !SKIP_IMAGES && (!existingForImage?.images?.length)
      ? await uploadGeneratedImage(tour.imagePrompt, `attractions-network/tours/${tenantData.slug}`, '1536x1024')
      : (existingForImage?.images?.[0] || '');
    if (existingForImage?.images?.length) {
      log(`    ✓ Reusing existing tour image`);
    }

    // For flatUrls tenants we prefix the storage slug to avoid colliding on
    // the global unique `slug` index, while pathSlug holds the user-facing URL.
    const attrPayload = {
      slug: storageSlug,
      pathSlug: isFlat ? tour.slug : undefined,
      title,
      shortDescription: enriched.shortDescription,
      description: enriched.description,
      images: tourImage ? [tourImage] : [],
      category: tour.category || 'adventure',
      destination: { city: 'Hurghada', country: 'Egypt', coordinates: { lat: 27.2579, lng: 33.8116 } },
      duration: tour.duration,
      languages: ['en', 'de', 'ru'],
      rating: 4.7,
      reviewCount: Math.floor(Math.random() * 200) + 50,
      priceFrom: tour.priceFrom,
      currency: 'USD',
      pricingOptions: [
        { id: 'adult', name: 'Adult', description: 'Full tour', price: tour.priceFrom },
        { id: 'child', name: 'Child (8-12)', description: 'Reduced rate', price: Math.round(tour.priceFrom * 0.7) },
      ],
      addons: [
        { id: 'photos', name: 'Professional Photos', description: 'Take-home photo pack', price: 15 },
      ],
      entryWindows: [],
      itinerary: enriched.itinerary,
      whatToBring: enriched.whatToBring,
      accessibility: ['Min age 8', 'Helmet & goggles required'],
      gettingThere: [{ mode: 'Hotel pickup', description: 'Included from Hurghada, Sahl Hasheesh, Makadi Bay, El Gouna, Soma Bay' }],
      highlights: enriched.highlights,
      inclusions: enriched.inclusions,
      exclusions: enriched.exclusions,
      meetingPoint: { address: 'Your hotel lobby', instructions: 'Be ready 10 minutes before pickup time', mapUrl: '' },
      cancellationPolicy: 'Free cancellation up to 24 hours before',
      instantConfirmation: true,
      mobileTicket: true,
      badges: ['instant-confirm', 'free-cancellation'],
      availability: { type: 'flexible', advanceBooking: 1 },
      seo: {
        metaTitle: metaTitle || `${title} | ${tenantName}`,
        metaDescription: metaDescription || enriched.shortDescription,
        keywords: [tour.slug.replace(/-/g, ' '), tenantName.toLowerCase()],
      },
      tenantIds: [tenant._id],
      status: 'active',
      featured: tours.indexOf(tour) < 4,
      sortOrder: tours.indexOf(tour),
    };

    if (existingForImage) {
      Object.assign(existingForImage, attrPayload);
      if (tourImage) existingForImage.images = [tourImage];
      await existingForImage.save();
    } else {
      await Attraction.create(attrPayload);
    }
  }

  // Re-fetch with the field so we always log the ACTUAL code in DB, not a
  // stale local variable that may not have been saved.
  const final = await Tenant.findById(tenant._id).select('+previewAccessCode');
  log(`\n🔑 Preview Code: ${final?.previewAccessCode || newPreviewCode}`);
  log(`🌐 Preview URL: https://foxes-network.netlify.app/?tenant=${tenant.slug}`);
  return tenant;
}

(async () => {
  if (!ONLY_TENANT || ONLY_TENANT === 'safari-sahara') {
    await connectDatabase();
    try {
      await seedTenant(SAFARI_SAHARA_TENANT, SAFARI_SAHARA_TOURS, SAFARI_SAHARA_CUSTOM_PAGES);
    } finally {
      await disconnectDatabase();
    }
  }

  if (!ONLY_TENANT || ONLY_TENANT === 'quad-tour') {
    await connectDatabase();
    try {
      await seedTenant(QUAD_TOUR_TENANT, QUAD_TOUR_TOURS);
    } finally {
      await disconnectDatabase();
    }
  }

  log('\n✨ All done.');
  process.exit(0);
})().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
