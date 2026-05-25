/**
 * Inventory the 15 coming-soon tenants from Fouad's 2026-05-13 review:
 * status, designMode, and tour count — so we can see what's activated,
 * what has a bespoke design, and what's still missing or a phantom slug.
 *
 * Run: npx ts-node src/scripts/inventory-coming-soon.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';

const COMING_SOON = [
  'cairo-night-cruise',
  'camel-riding-hurghada',
  'egypt-tour-booking',
  'giftun-island-hurghada',
  'hurghada-dolphins',
  'hurghada-fishing',
  'hurghada-jeep-safari',
  'hurghada-luxury-cruise',
  'hurghada-private-tours',
  'hurghada-safari',
  'hurghada-submarine',
  'luxor-air-balloon',
  'makadi-bay-snorkeling',
  'orange-bay-tours',
  'sharm-dinner-cruise',
];

async function main(): Promise<void> {
  await connectDatabase();
  try {
    console.log('\n— Coming-soon tenant inventory —\n');
    console.log('slug'.padEnd(26), 'status'.padEnd(12), 'designMode'.padEnd(14), 'tours');
    console.log('-'.repeat(64));
    for (const slug of COMING_SOON) {
      const t = await Tenant.findOne({ slug });
      if (!t) {
        console.log(slug.padEnd(26), 'MISSING (no such tenant)');
        continue;
      }
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const status = (t as any).status || '?';
      const mode = (t as any).designMode || '?';
      const tours = await Attraction.countDocuments({ tenantIds: t._id });
      /* eslint-enable @typescript-eslint/no-explicit-any */
      console.log(slug.padEnd(26), String(status).padEnd(12), String(mode).padEnd(14), tours);
    }
    console.log('');
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => { console.error(e); await disconnectDatabase(); process.exit(1); });
