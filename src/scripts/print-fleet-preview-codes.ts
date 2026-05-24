/**
 * Print (and generate if missing) the preview-access codes for the Sunmarine
 * fleet boat tenants, so they can be shared for the gated preview.
 *
 * Run via: npx ts-node src/scripts/print-fleet-preview-codes.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { generatePreviewAccessCode } from '../utils/hash';

const SLUGS = [
  'royal-seascope',
  'pirates-premier-sailing',
  'nefertari-cruise',
  'elite-vip-cruise',
  'rosetta-classic-boat',
];

async function main(): Promise<void> {
  await connectDatabase();
  try {
    console.log('\n— Sunmarine fleet preview codes —\n');
    for (const slug of SLUGS) {
      const tenant = await Tenant.findOne({ slug }).select('+previewAccessCode slug name');
      if (!tenant) {
        console.log(`${slug.padEnd(26)} NOT FOUND`);
        continue;
      }
      /* eslint-disable @typescript-eslint/no-explicit-any */
      let code = (tenant as any).previewAccessCode as string | undefined;
      if (!code) {
        code = generatePreviewAccessCode();
        (tenant as any).previewAccessCode = code;
        (tenant as any).previewAccessCodeUpdatedAt = new Date();
        await tenant.save();
        console.log(`${slug.padEnd(26)} ${code}   (generated)`);
      } else {
        console.log(`${slug.padEnd(26)} ${code}`);
      }
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
