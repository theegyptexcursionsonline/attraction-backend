/**
 * Retire duplicate tenants (dedupe). Per Fouad's review + Ranjit's call:
 * keep makadi-bay-safari-center (approved), retire makadi-bay-safari.
 *
 * "Retire" = set status to 'inactive' (reversible — not a hard delete), so the
 * tenant drops out of public/active listings but its data is preserved.
 *
 * Idempotent. Run via:
 *   npx ts-node src/scripts/retire-duplicate-tenants.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';

const RETIRE_SLUGS = ['makadi-bay-safari'] as const;

async function main(): Promise<void> {
  await connectDatabase();
  try {
    console.log('\n— Retiring duplicate tenants —\n');
    for (const slug of RETIRE_SLUGS) {
      const tenant = await Tenant.findOne({ slug });
      if (!tenant) {
        console.log(`  ✗ ${slug} NOT FOUND`);
        continue;
      }
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const before = (tenant as any).status;
      if (before === 'inactive') {
        console.log(`  • ${slug} already inactive`);
        continue;
      }
      (tenant as any).status = 'inactive';
      await tenant.save();
      console.log(`  ✓ ${slug}: ${before} → inactive (retired; data preserved, reversible)`);
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }
    console.log('\nKept: makadi-bay-safari-center (approved).\n');
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
