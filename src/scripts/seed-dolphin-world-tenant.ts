/**
 * Add Dolphin World Egypt as a new tenant.
 * - Creates tenant record with 'reef' design mode (marine/coral theme)
 * - Creates brand-admin user
 * - Seeds 7 tours from the client website (dolphinworldegypt.com)
 * - Generates images via gpt-image-1.5 medium quality
 *
 * Usage: railway run npx ts-node src/scripts/seed-dolphin-world-tenant.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { User } from '../models/User';
import { requireScriptSecret } from './require-script-secret';
import { generateImageFromPrompt } from '../services/image-generation.service';
import { uploadBase64Image } from '../services/upload.service';

const TENANT_SLUG = 'dolphin-world-egypt';

const TENANT_DATA = {
  slug: TENANT_SLUG,
  name: 'Dolphin World Egypt',
  domain: 'dolphin-world-egypt.foxesnetwork.com',
  customDomain: 'dolphinworldegypt.com',
  logo: '/logos/dolphins-1-1.png',
  tagline: 'The Most Unique Outdoor Family Attraction in the Red Sea',
  description: 'Dolphin World Egypt presents shows for a variety of marine animals trained by the most skilled trainers in Africa and the Middle East. Our lovely family of dolphins, walrus, and sea cats perform daily. Swim with dolphins, enjoy family photo sessions, and experience unforgettable moments at Makadi Bay.',
  theme: {
    primaryColor: '#0EA5E9',   // sky blue (dolphin)
    secondaryColor: '#06B6D4', // cyan
    accentColor: '#F59E0B',    // warm yellow/gold
  },
  fonts: {
    heading: 'Poppins',
    body: 'Inter',
  },
  designMode: 'reef', // marine/coral/aquarium theme
  defaultCurrency: 'USD',
  defaultLanguage: 'en',
  supportedLanguages: ['en', 'ar', 'de', 'fr', 'ru'],
  timezone: 'Africa/Cairo',
  contactInfo: {
    email: 'online@dolphinworldegypt.com',
    phone: '+201140663325',
    address: 'Dolphin World Egypt, Makadi Bay, Hurghada, Egypt',
  },
  socialLinks: {
    facebook: 'https://facebook.com/dolphinworldegypt',
    instagram: 'https://instagram.com/dolphinworldegypt',
    tiktok: 'https://tiktok.com/@dolphinworldegypt',
  },
  seoSettings: {
    metaTitle: 'Dolphin World Egypt | Swim with Dolphins in Makadi Bay',
    metaDescription: 'Swim with dolphins in Hurghada. Daily dolphin & walrus shows, family swimming packages, photo sessions. Located in Makadi Bay, Egypt.',
    keywords: ['dolphin', 'swim with dolphins', 'hurghada', 'makadi bay', 'dolphin show', 'walrus', 'red sea', 'family activities'],
  },
  status: 'active',
};

const BRAND_ADMIN_EMAIL = 'dolphin-world-egypt@foxestechnology.com';

const TOURS = [
  {
    slug: 'dolphin-world-show-walrus',
    title: 'Dolphin Show & Walrus Performance',
    shortDescription: 'Daily 60-minute outdoor show featuring dolphins and walruses performing amazing skills — dancing, singing, and jumping through hoops.',
    description: 'Watch in wonder as our amazing marine family — dolphins, walruses, and sea cats — perform astounding skills. See them dance, sing, play ball, jump through hoops, and even create their own tableau. Our unique outdoor delphinarium features the most skilled trainers in Africa and the Middle East. Show starts daily at 10:30 AM and lasts 60 minutes. Perfect for families, couples, and animal lovers.',
    category: 'entertainment',
    duration: '60 minutes',
    priceFrom: 25,
    pricingOptions: [
      { id: 'adult', name: 'Adult', description: 'Full show access', price: 25 },
      { id: 'child', name: 'Child (3-12)', description: 'Full show access', price: 15 },
      { id: 'family', name: 'Family (2 adults + 2 kids)', description: 'Package price', price: 70 },
    ],
    addons: [
      { id: 'transfer', name: 'Hotel Transfer', description: 'Round-trip transfer from your hotel', price: 8 },
      { id: 'photos', name: 'Professional Photos', description: 'Take-home photo package from the show', price: 15 },
    ],
    itinerary: [
      { time: '10:00', duration: '30 min', title: 'Arrival & Welcome', description: 'Arrive at Dolphin World, welcome drink, find your seat.' },
      { time: '10:30', duration: '60 min', title: 'Dolphin & Walrus Show', description: 'Dolphins dance, sing, play ball, jump through hoops. Walruses perform their own act.' },
      { time: '11:30', duration: '30 min', title: 'Photos & Meet the Trainers', description: 'Photo opportunities and Q&A with trainers.' },
    ],
    whatToBring: ['Sun hat', 'Sunglasses', 'Sunscreen', 'Camera', 'Light snacks for kids'],
    highlights: ['60-minute outdoor delphinarium show', 'Dolphins, walruses & sea cats', 'Most skilled trainers in Africa/Middle East', 'Daily at 10:30 AM', 'Perfect for families', 'Unique attraction in Red Sea'],
    inclusions: ['Show admission', 'Welcome drink', 'Seating area'],
    exclusions: ['Transfer (available as add-on)', 'Photos (available as add-on)', 'Food & snacks'],
    imagePrompt: 'Dolphin performing jumping through hoop at outdoor delphinarium show in Hurghada Egypt, trainer in uniform, crowd watching, tropical setting, water splash.',
  },
  {
    slug: 'dolphin-world-family-swimming-package',
    title: 'Family Swimming Package with Dolphins',
    shortDescription: 'Private 15-minute family swim session — play, swim, and dance with a dolphin. Free swimsuit, towel, and life vest included.',
    description: 'Created especially for parents with kids — an exclusive family moment swimming with a trained dolphin. Play together, swim side by side, hug, kiss the dolphin, and dance in the pool. Our experienced trainers guide you through a safe and magical 15-minute session. Free swimsuit, towel, and life vest provided for everyone. Ask about the digital photos package to take home unforgettable memories.',
    category: 'adventure',
    duration: '15 minutes (exclusive)',
    priceFrom: 95,
    pricingOptions: [
      { id: 'family4', name: 'Family of 4 (2 adults + 2 kids)', description: '15-min private session', price: 95 },
      { id: 'family5', name: 'Family of 5', description: '15-min private session', price: 115 },
      { id: 'family6', name: 'Family of 6', description: '15-min private session', price: 135 },
    ],
    addons: [
      { id: 'photos', name: 'Digital Photos Package', description: '~20 high-resolution photos of your session', price: 30 },
      { id: 'video', name: 'HD Video Package', description: 'Full HD video of your session', price: 40 },
      { id: 'transfer', name: 'Private Transfer', description: 'Round-trip hotel transfer', price: 15 },
    ],
    itinerary: [
      { time: 'Flexible', duration: '15 min', title: 'Arrival & Changing', description: 'Arrive at Dolphin World, change into provided swimsuits.' },
      { time: '', duration: '10 min', title: 'Safety Briefing', description: 'Our trainer explains dolphin behavior and safety.' },
      { time: '', duration: '15 min', title: 'Swimming Session', description: 'Exclusive family time with the dolphin — swim, play, hug, dance.' },
      { time: '', duration: '15 min', title: 'Photos & Departure', description: 'Review photos (if booked) and head home.' },
    ],
    whatToBring: ['Just yourselves — we provide everything (swimsuit, towel, life vest)'],
    highlights: ['Private family session', 'Play, swim, hug, kiss the dolphin', 'FREE swimsuit, towel, life vest', '15 minutes exclusive time', 'Optional photo/video package', 'Magical family memory'],
    inclusions: ['Private dolphin swimming session', 'Professional trainer', 'Swimsuit, towel, life vest', 'Safety briefing'],
    exclusions: ['Photos (add-on)', 'Video (add-on)', 'Transfer (add-on)'],
    imagePrompt: 'Happy family swimming with dolphin in blue pool, children and parents smiling, dolphin surfacing near them, trainer nearby, sunny Egyptian resort setting.',
  },
  {
    slug: 'dolphin-world-family-all-in-one',
    title: 'Family Package All-in-One: Swim + Photos + Transfer + Video',
    shortDescription: 'The complete family experience — private 15-min dolphin swim, photo session, HD video, and private hotel transfer all included.',
    description: 'Our most popular and complete family package. Everything included: a private 15-minute swim with the dolphin, a professional family photo session, full HD video of your experience, and private round-trip hotel transfer. Your family will play, hug, kiss, and dance with the dolphin. Free swimsuit, towel, and life vest for each member. Nothing extra to pay — take home unforgettable memories in every format.',
    category: 'adventure',
    duration: '2 hours (inc. transfer)',
    priceFrom: 160,
    pricingOptions: [
      { id: 'family4', name: 'Family of 4 (2 adults + 2 kids)', description: 'All-in-one package', price: 160 },
      { id: 'family5', name: 'Family of 5', description: 'All-in-one package', price: 185 },
      { id: 'family6', name: 'Family of 6', description: 'All-in-one package', price: 210 },
    ],
    addons: [
      { id: 'gift-frame', name: 'Premium Photo Frame', description: 'Beautiful printed frame with your best photo', price: 20 },
      { id: 'usb-drive', name: 'Branded USB with All Content', description: 'Keepsake USB drive with photos + video', price: 15 },
    ],
    itinerary: [
      { time: 'Flexible', duration: '30 min', title: 'Private Hotel Pickup', description: 'Private transfer from your hotel directly to Dolphin World.' },
      { time: '', duration: '15 min', title: 'Welcome & Changing', description: 'Welcome drinks, change into provided swimsuits.' },
      { time: '', duration: '10 min', title: 'Safety Briefing', description: 'Professional safety and dolphin behavior briefing.' },
      { time: '', duration: '15 min', title: 'Dolphin Swimming Session', description: 'Your exclusive time with the dolphin — swim, play, dance, kiss.' },
      { time: '', duration: '15 min', title: 'Photo Session', description: 'Professional photographer captures family moments.' },
      { time: '', duration: '15 min', title: 'Photo & Video Review', description: 'Review your photos and video on the spot.' },
      { time: '', duration: '30 min', title: 'Private Return', description: 'Private transfer back to your hotel.' },
    ],
    whatToBring: ['Just yourselves — everything else is included'],
    highlights: ['Everything included — no hidden fees', 'Private 15-min dolphin swim', 'Professional photo session', 'Full HD video', 'Private round-trip transfer', 'FREE swimsuit, towel, life vest', 'Our #1 family package'],
    inclusions: ['Private dolphin swim', 'Photo session (digital delivery)', 'HD video', 'Private hotel transfer', 'Swimsuit, towel, life vest', 'Welcome drinks'],
    exclusions: ['Gratuities', 'Premium add-ons (frame, USB)'],
    imagePrompt: 'Complete family dolphin experience package, happy family posing with dolphin for professional photo in swimming pool, photographer visible, professional setup, sunny day.',
  },
  {
    slug: 'dolphin-world-duo-swimming',
    title: 'Duo Swimming with Dolphin (Couples)',
    shortDescription: 'A romantic 10-minute swim with a dolphin for couples — share this magical moment together.',
    description: 'Share an exclusive 10-minute swim and dance session with a trained dolphin with someone special. Perfect for couples, parent-child duos, or two best friends. Together, you will swim, play, hug, kiss, and dance with the dolphin in the pool. FREE swimsuit and towel provided. Ask about the digital photos package to preserve this unforgettable moment.',
    category: 'adventure',
    duration: '10 minutes (exclusive)',
    priceFrom: 70,
    pricingOptions: [
      { id: 'couple', name: 'Duo (2 people)', description: '10-min exclusive session', price: 70 },
    ],
    addons: [
      { id: 'photos', name: 'Digital Photos Package', description: '~15 high-resolution photos', price: 25 },
      { id: 'video', name: 'HD Video', description: 'HD video of your session', price: 35 },
      { id: 'transfer', name: 'Hotel Transfer', description: 'Round-trip transfer', price: 10 },
    ],
    itinerary: [
      { time: 'Flexible', duration: '15 min', title: 'Arrival & Changing', description: 'Arrive, change into provided swimsuits.' },
      { time: '', duration: '10 min', title: 'Safety Briefing', description: 'Professional trainer explains safety and dolphin behavior.' },
      { time: '', duration: '10 min', title: 'Duo Swimming Session', description: 'Exclusive time with the dolphin — swim, play, hug, dance together.' },
      { time: '', duration: '15 min', title: 'Photos & Departure', description: 'Review photos and head home.' },
    ],
    whatToBring: ['Nothing — swimsuit and towel provided FREE'],
    highlights: ['Exclusive couple session', 'Perfect romantic experience', '10 minutes together with dolphin', 'FREE swimsuit and towel', 'Optional photo/video', 'Professional trainer supervision'],
    inclusions: ['Private duo dolphin session', 'Trainer supervision', 'Swimsuit & towel'],
    exclusions: ['Photos (add-on)', 'Video (add-on)', 'Transfer (add-on)'],
    imagePrompt: 'Romantic couple swimming with dolphin in crystal blue pool at Egyptian resort, tender moment kissing dolphin, sunset warm light, intimate atmosphere.',
  },
  {
    slug: 'dolphin-world-individual-swimming',
    title: 'Individual Swimming with Dolphin',
    shortDescription: 'A 5-minute solo session swimming, dancing, and interacting with a trained dolphin.',
    description: 'Swimming with a dolphin is one of those magical moments you will remember forever. In this solo experience, enjoy 5 minutes of one-on-one time with a trained dolphin — swim, dance, hug, kiss, and pose for beautiful photos. Our experienced trainer ensures a safe and incredible interaction. FREE swimsuit and towel provided. Perfect for solo travelers or those wanting personal dolphin time.',
    category: 'adventure',
    duration: '5 minutes (exclusive)',
    priceFrom: 45,
    pricingOptions: [
      { id: 'solo', name: 'Individual (1 person)', description: '5-min exclusive session', price: 45 },
    ],
    addons: [
      { id: 'photos', name: 'Digital Photos Package', description: '~10 high-resolution photos', price: 20 },
      { id: 'video', name: 'HD Video', description: 'HD video of your session', price: 30 },
      { id: 'transfer', name: 'Hotel Transfer', description: 'Round-trip transfer', price: 10 },
    ],
    itinerary: [
      { time: 'Flexible', duration: '15 min', title: 'Arrival & Changing', description: 'Check in, change into provided swimsuit.' },
      { time: '', duration: '10 min', title: 'Safety Briefing', description: 'Trainer explains safety protocols.' },
      { time: '', duration: '5 min', title: 'Your Solo Session', description: 'Exclusive time with the dolphin — swim, dance, hug, kiss.' },
      { time: '', duration: '15 min', title: 'Photos & Departure', description: 'Review photos and head home.' },
    ],
    whatToBring: ['Nothing — swimsuit and towel provided FREE'],
    highlights: ['One-on-one dolphin time', 'Perfect for social media photos', '5 minutes exclusive interaction', 'FREE swimsuit and towel', 'Optional photo album', 'Experienced trainer'],
    inclusions: ['Individual dolphin session', 'Trainer supervision', 'Swimsuit & towel'],
    exclusions: ['Photos (add-on)', 'Video (add-on)', 'Transfer (add-on)'],
    imagePrompt: 'Single person swimming with dolphin in blue pool, joyful smile, dolphin nose touching person, sunny Egyptian pool, professional setting.',
  },
  {
    slug: 'dolphin-world-individual-photos-session',
    title: 'Individual Photo Session Inside the Pool',
    shortDescription: 'A full photo session inside the pool — hug, kiss, and dance with a dolphin for beautiful solo album shots.',
    description: 'Create a beautiful photo album that will stand out on your social feeds. This dedicated photo session inside the pool captures you with a dolphin in multiple poses — hugging, kissing, dancing, swimming side-by-side. Our professional photographer ensures every shot is perfect. You will receive ~15 high-resolution digital photos. FREE diving suit and towel provided.',
    category: 'photography',
    duration: '20 minutes',
    priceFrom: 55,
    pricingOptions: [
      { id: 'solo', name: 'Individual Photo Session', description: '20-min photo session + digital photos', price: 55 },
    ],
    addons: [
      { id: 'premium', name: 'Premium Photo Pack (25 photos)', description: 'Upgrade to 25 curated photos', price: 15 },
      { id: 'print', name: 'Printed Photo Album', description: 'Physical printed album to take home', price: 25 },
      { id: 'transfer', name: 'Hotel Transfer', description: 'Round-trip transfer', price: 10 },
    ],
    itinerary: [
      { time: 'Flexible', duration: '15 min', title: 'Arrival & Changing', description: 'Arrive, change into provided diving suit.' },
      { time: '', duration: '10 min', title: 'Briefing & Poses Discussion', description: 'Photographer discusses poses and shots.' },
      { time: '', duration: '20 min', title: 'Photo Session', description: 'Professional session inside the pool with dolphin.' },
      { time: '', duration: '15 min', title: 'Photo Review & Selection', description: 'Review photos and select your favorites.' },
    ],
    whatToBring: ['Just yourself — diving suit and towel provided'],
    highlights: ['Dedicated photo session', '~15 high-resolution digital photos', 'Multiple poses — hug, kiss, dance', 'Professional photographer', 'FREE diving suit and towel', 'Perfect social media content'],
    inclusions: ['Private photo session', 'Professional photographer', '~15 digital photos', 'Diving suit & towel'],
    exclusions: ['Premium photo pack (add-on)', 'Printed album (add-on)', 'Transfer (add-on)'],
    imagePrompt: 'Professional photo session of person with dolphin in pool, photographer in background, person posing with dolphin leaning on shoulder, crystal clear water, professional studio setup.',
  },
  {
    slug: 'dolphin-world-family-photos-session',
    title: 'Family Photo Session Inside the Pool',
    shortDescription: 'Capture your entire family together with a dolphin — individual portraits plus group shots for the ultimate family album.',
    description: 'A brand new concept — capture beautiful photos of all family members together with a trained dolphin. We start with a few individual photos of each family member with the dolphin, then move to group photos of the entire family together. About 15 digital photos in total. Your own exclusive dolphin and instructor for this program. FREE swimsuit, towel, and life vest for each member. The perfect family heirloom.',
    category: 'photography',
    duration: '30 minutes',
    priceFrom: 125,
    pricingOptions: [
      { id: 'family4', name: 'Family of 4', description: 'Individual + group photos', price: 125 },
      { id: 'family5', name: 'Family of 5', description: 'Individual + group photos', price: 145 },
      { id: 'family6', name: 'Family of 6', description: 'Individual + group photos', price: 165 },
    ],
    addons: [
      { id: 'extra-photos', name: 'Extra 10 Photos', description: '10 additional curated photos', price: 20 },
      { id: 'print-album', name: 'Printed Family Album', description: 'Hardcover printed album to take home', price: 40 },
      { id: 'video', name: 'Add HD Video', description: 'Full HD video of the session', price: 35 },
      { id: 'transfer', name: 'Private Transfer', description: 'Private round-trip transfer', price: 15 },
    ],
    itinerary: [
      { time: 'Flexible', duration: '20 min', title: 'Arrival & Changing', description: 'Family arrives, change into provided swimwear.' },
      { time: '', duration: '15 min', title: 'Briefing & Planning', description: 'Photographer plans individual + group shots.' },
      { time: '', duration: '20 min', title: 'Individual Portraits', description: 'Each family member gets individual photos with the dolphin.' },
      { time: '', duration: '10 min', title: 'Group Family Photos', description: 'Entire family together with the dolphin.' },
      { time: '', duration: '15 min', title: 'Photo Review', description: 'Review all photos and select favorites.' },
    ],
    whatToBring: ['Just your family — everything else provided'],
    highlights: ['Individual + group photos', '~15 professional digital photos', 'Exclusive dolphin & instructor', 'FREE swimsuit, towel, life vest for all', 'Perfect family heirloom', 'Unique concept — not available elsewhere'],
    inclusions: ['Private family photo session', 'Professional photographer', 'Exclusive dolphin', 'Swimsuit, towel, life vest for each family member', '~15 digital photos'],
    exclusions: ['Premium add-ons', 'Transfer (add-on)'],
    imagePrompt: 'Family of four posing with dolphin in crystal blue pool, professional photography setup, photographer visible, happy family group shot, kids and parents smiling.',
  },
];

async function main(): Promise<void> {
  await connectDatabase();

  try {
    // Step 1: Create or update tenant
    console.log('=== Step 1: Creating tenant ===');
    let tenant = await Tenant.findOne({ slug: TENANT_SLUG });
    if (tenant) {
      console.log(`Tenant already exists: ${tenant.name} (_id=${tenant._id})`);
    } else {
      tenant = await Tenant.create(TENANT_DATA);
      console.log(`Created tenant: ${tenant.name} (_id=${tenant._id})`);
    }

    // Step 2: Create brand-admin user
    console.log('\n=== Step 2: Creating brand-admin ===');
    const existingUser = await User.findOne({ email: BRAND_ADMIN_EMAIL });
    if (existingUser) {
      console.log(`Brand-admin already exists: ${BRAND_ADMIN_EMAIL}`);
    } else {
      const initialPassword = requireScriptSecret('TENANT_ADMIN_INITIAL_PASSWORD');
      await User.create({
        email: BRAND_ADMIN_EMAIL,
        password: initialPassword,
        firstName: 'Dolphin World Egypt',
        lastName: 'Admin',
        role: 'brand-admin',
        status: 'active',
        assignedTenants: [tenant._id],
        language: 'en',
        currency: 'USD',
      });
      console.log(`Created brand-admin: ${BRAND_ADMIN_EMAIL} (credential supplied securely)`);
    }

    // Step 3: Seed tours
    console.log('\n=== Step 3: Seeding tours ===\n');
    let created = 0;
    let skipped = 0;

    for (const tour of TOURS) {
      const exists = await Attraction.findOne({ slug: tour.slug });
      if (exists) {
        console.log(`SKIP  ${tour.slug}`);
        skipped++;
        continue;
      }

      console.log(`[${created + skipped + 1}/${TOURS.length}] ${tour.title}`);

      let imageUrl = 'https://res.cloudinary.com/dm3sxllch/image/upload/v1/attractions-network/tours/placeholder.jpg';
      try {
        console.log(`  Generating image...`);
        const { base64, mimeType } = await generateImageFromPrompt({
          prompt: tour.imagePrompt,
          size: '1536x1024',
          quality: 'medium',
          outputFormat: 'jpeg',
        });
        const dataUri = `data:${mimeType};base64,${base64}`;
        const uploaded = await uploadBase64Image(dataUri, `tours/${tour.slug}`);
        imageUrl = uploaded.url;
        console.log(`  ✅ ${imageUrl}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ⚠️ Image failed: ${msg}`);
      }

      await Attraction.create({
        slug: tour.slug,
        title: tour.title,
        shortDescription: tour.shortDescription,
        description: tour.description,
        images: [imageUrl],
        category: tour.category,
        subcategory: 'dolphin-experience',
        destination: {
          city: 'Makadi Bay',
          country: 'Egypt',
          coordinates: { lat: 27.1167, lng: 33.9000 },
        },
        duration: tour.duration,
        languages: ['English', 'Arabic', 'German', 'French', 'Russian'],
        rating: 4.6 + Math.round(Math.random() * 4) / 10,
        reviewCount: 30 + Math.floor(Math.random() * 200),
        priceFrom: tour.priceFrom,
        currency: 'USD',
        pricingOptions: tour.pricingOptions,
        addons: tour.addons,
        entryWindows: [
          { label: 'Morning Show (10:30 AM)', startTime: '10:30', endTime: '11:30' },
          { label: 'Afternoon Session', startTime: '14:00', endTime: '15:00' },
        ],
        itinerary: tour.itinerary,
        whatToBring: tour.whatToBring,
        accessibility: ['Wheelchair accessible venue', 'Not recommended for people afraid of water', 'Children must be supervised', 'Pregnant travelers should consult us first'],
        gettingThere: [
          { mode: 'Hotel Pickup', description: 'Low-cost transfer available from hotels in Makadi Bay, Sahl Hasheesh, and Hurghada.' },
          { mode: 'Self Drive', description: 'Dolphin World Egypt, Makadi Bay, Hurghada. Free parking.' },
        ],
        highlights: tour.highlights,
        inclusions: tour.inclusions,
        exclusions: tour.exclusions,
        meetingPoint: {
          address: 'Dolphin World Egypt, Makadi Bay, Hurghada, Egypt',
          instructions: 'Arrive 30 minutes before your session. Hotel pickup available at low cost.',
          mapUrl: 'https://maps.google.com/?q=27.1167,33.9000',
        },
        cancellationPolicy: 'Free cancellation up to 24 hours before the start time for a full refund.',
        instantConfirmation: true,
        mobileTicket: true,
        badges: ['bestseller', 'free-cancellation', 'instant-confirm'],
        availability: { type: 'time-slots', advanceBooking: 30 },
        seo: {
          metaTitle: `${tour.title} | Dolphin World Egypt`,
          metaDescription: tour.shortDescription,
          keywords: ['dolphin', 'swim', 'hurghada', 'makadi bay', ...tour.title.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)],
        },
        tenantIds: [tenant._id],
        status: 'active',
        featured: tour.priceFrom >= 50,
      });
      console.log(`  CREATED ✅\n`);
      created++;
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
    console.log(`\nTenant URL: http://localhost:3001/?tenant=${TENANT_SLUG}`);
    console.log(`Brand admin: ${BRAND_ADMIN_EMAIL}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
