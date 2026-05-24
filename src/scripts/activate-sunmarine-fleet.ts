/**
 * Activate the Egypt Sunmarine fleet boat tenants.
 *
 * The five boat brands (Royal SeaScope, Pirates Premier Sailing, Nefertari
 * Cruise, Elite VIP Cruise, Rosetta Classic Boat) were built and seeded with
 * tours but left as status=coming_soon, so they were not publicly visible.
 * Per Fouad's brief ("activate all coming-soon brands") this flips ONLY those
 * five boat tenants to status=active.
 *
 * Deliberately scoped: it touches only the slugs in FLEET_SLUGS. It does NOT
 * touch majestic-travel (stays coming_soon until its catalog arrives) or any
 * other tenant.
 *
 * Idempotent. Run via:
 *   npx ts-node src/scripts/activate-sunmarine-fleet.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';

const FLEET_SLUGS = [
  'royal-seascope',
  'pirates-premier-sailing',
  'nefertari-cruise',
  'elite-vip-cruise',
  'rosetta-classic-boat',
] as const;

async function main(): Promise<void> {
  await connectDatabase();

  try {
    console.log('\n— Egypt Sunmarine fleet activation —\n');
    let activated = 0;
    let alreadyActive = 0;
    let missing = 0;

    for (const slug of FLEET_SLUGS) {
      const tenant = await Tenant.findOne({ slug });
      if (!tenant) {
        console.log(`  ✗ ${slug.padEnd(24)} NOT FOUND — skipped`);
        missing += 1;
        continue;
      }

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const before = (tenant as any).status;
      if (before === 'active') {
        console.log(`  • ${slug.padEnd(24)} already active — no change`);
        alreadyActive += 1;
        continue;
      }

      (tenant as any).status = 'active';
      await tenant.save();
      console.log(`  ✓ ${slug.padEnd(24)} ${before} → active`);
      activated += 1;
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }

    console.log(
      `\n✅ Done — ${activated} activated, ${alreadyActive} already active, ${missing} missing (of ${FLEET_SLUGS.length}).\n`,
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
