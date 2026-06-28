/**
 * Seed Royal Cruise Hurghada's "Fleet" custom page describing the five
 * vessels operated by the brand (sourced from royalcruisehurghada.com).
 *
 * Idempotent — re-running replaces the 'fleet' customPage entry only.
 *
 * Usage:
 *   railway run npx ts-node src/scripts/seed-royal-cruise-fleet.ts
 *   (or local) npx ts-node src/scripts/seed-royal-cruise-fleet.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';

const TENANT_SLUG = 'royal-cruise-hurghada';

const BOATS = [
  {
    name: 'Royal Boat',
    summary: 'The original Royal Cruise flagship — built for Orange Bay yachting and full-day VIP voyages.',
    specs: { length: '28 m', beam: '7.7 m', engines: '2× MAN V8, 650 HP each' },
  },
  {
    name: 'Royal 1 Boat',
    summary: 'Second-generation Royal — the most-booked vessel in the fleet for snorkeling 6×1 and dolphin trips.',
    specs: { length: '29 m', beam: '7.6 m', engines: '2× MAN V8, 750 HP each' },
  },
  {
    name: 'Ferrari Boat',
    summary: 'Our fastest crew transport — premium Elite VIP charters with twin V10s for shorter crossings.',
    specs: { length: '29 m', beam: '7.6 m', engines: '2× MAN V10, 850 HP each' },
  },
  {
    name: 'Private The Boat',
    summary: 'The exclusive charter vessel — reserved for private groups, celebrations, and corporate days at sea.',
    specs: { length: '26 m', beam: '7.0 m', engines: '1× MAN V10, 850 HP' },
  },
  {
    name: 'Riva Speed Boat',
    summary: 'Italian-style runabout for swift Orange Bay transfers and intimate sunset cruises.',
    specs: { length: '7 m', beam: '2.6 m', engines: '200 HP, 4-stroke' },
  },
];

function buildBoatHtml(boat: typeof BOATS[number]): string {
  return `
  <article class="fleet-vessel">
    <h3>${boat.name}</h3>
    <p>${boat.summary}</p>
    <dl class="fleet-specs">
      <dt>Length</dt><dd>${boat.specs.length}</dd>
      <dt>Beam</dt><dd>${boat.specs.beam}</dd>
      <dt>Engines</dt><dd>${boat.specs.engines}</dd>
    </dl>
  </article>`;
}

function buildBody(): string {
  return `
  <section class="fleet-intro">
    <p>Five vessels. One marina. Operating from Hurghada New Marina since 1996, the Royal Cruise fleet has been engineered for the Red Sea — luxury yachts for Orange Bay yachting, premium hulls for Elite VIP dolphin trips, and an Italian runabout for sunset transfers.</p>
  </section>
  <section class="fleet-list">
    ${BOATS.map(buildBoatHtml).join('\n')}
  </section>
  `.trim();
}

const FLEET_PAGE = {
  slug: 'fleet',
  title: 'Our Fleet',
  metaTitle: 'The Royal Cruise Fleet | Royal Cruise Hurghada',
  metaDescription:
    'Five luxury vessels operating from Hurghada Marina since 1996 — Royal Boat, Royal 1, Ferrari Boat, Private The Boat, and the Riva Speed Boat.',
  body: buildBody(),
  sortOrder: 1,
};

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG });
    if (!tenant) {
      console.error(`Tenant '${TENANT_SLUG}' not found.`);
      process.exitCode = 1;
      return;
    }

    const existing = (tenant as any).customPages || [];
    const filtered = existing.filter((p: { slug: string }) => p.slug !== 'fleet');
    (tenant as any).customPages = [...filtered, FLEET_PAGE];
    await tenant.save();

    console.log(`✅ Royal Cruise fleet page upserted (${BOATS.length} boats).`);
    console.log(`Tenant customPages now contains: ${(tenant as any).customPages.map((p: { slug: string }) => p.slug).join(', ')}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
