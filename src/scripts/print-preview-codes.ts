/**
 * Quick utility — print the current preview access codes for one or more
 * tenants. Useful when the seed has been re-run and codes may have rotated.
 *
 * Usage:
 *   npx ts-node src/scripts/print-preview-codes.ts                          # all tenants
 *   npx ts-node src/scripts/print-preview-codes.ts safari-sahara-hurghada
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';

(async () => {
  const slugs = process.argv.slice(2);
  await connectDatabase();
  const query = slugs.length ? { slug: { $in: slugs } } : {};
  const tenants = await Tenant.find(query)
    .select('+previewAccessCode +previewAccessCodeUpdatedAt slug name status')
    .sort({ slug: 1 });

  console.log(`\nslug                          name                          code         updated`);
  console.log(`────────────────────────────────────────────────────────────────────────────────────`);
  for (const t of tenants) {
    const code = t.previewAccessCode || '(none)';
    const updated = t.previewAccessCodeUpdatedAt
      ? t.previewAccessCodeUpdatedAt.toISOString().slice(0, 19).replace('T', ' ')
      : '—';
    console.log(`${t.slug.padEnd(30)}${t.name.padEnd(30)}${code.padEnd(13)}${updated}`);
  }
  console.log(`\n${tenants.length} tenant(s).\n`);
  await disconnectDatabase();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
