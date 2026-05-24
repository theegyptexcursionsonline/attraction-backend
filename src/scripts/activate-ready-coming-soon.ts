/**
 * Activate the coming-soon tenants that are actually built and ready
 * (bespoke design + real tour catalog). Per Fouad's "activate the coming-soon
 * tenants" directive — but scoped to the ones that won't expose a generic or
 * empty site. Cairo Night Cruise (nilenight) and Luxor Air Balloon
 * (luxorballoon) both have dedicated designs and full tour sets.
 *
 * Idempotent. Run via:
 *   npx ts-node src/scripts/activate-ready-coming-soon.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';

const READY_SLUGS = ['cairo-night-cruise', 'luxor-air-balloon'] as const;

async function main(): Promise<void> {
  await connectDatabase();
  try {
    console.log('\n— Activating ready coming-soon tenants —\n');
    for (const slug of READY_SLUGS) {
      const tenant = await Tenant.findOne({ slug });
      if (!tenant) {
        console.log(`  ✗ ${slug.padEnd(22)} NOT FOUND`);
        continue;
      }
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const before = (tenant as any).status;
      if (before === 'active') {
        console.log(`  • ${slug.padEnd(22)} already active`);
        continue;
      }
      (tenant as any).status = 'active';
      await tenant.save();
      console.log(`  ✓ ${slug.padEnd(22)} ${before} → active`);
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }
    console.log('');
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
