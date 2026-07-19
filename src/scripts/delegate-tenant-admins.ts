/**
 * Delegate Tenant Admins
 *
 * Creates a brand-admin user for every active or coming-soon tenant
 * that does not already have one assigned. Idempotent: re-running will
 * skip tenants that already have a brand-admin and will not create
 * duplicate users.
 *
 * Usage:
 *   DELEGATE_DEFAULT_PASSWORD=<secret-manager-value> npx ts-node src/scripts/delegate-tenant-admins.ts
 *
 * Email pattern: <slug>@foxestechnology.com
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import { requireScriptSecret } from './require-script-secret';

const EMAIL_DOMAIN = 'foxestechnology.com';

type ResultRow = {
  tenantSlug: string;
  tenantName: string;
  status: string;
  email: string;
  action: 'created' | 'already-delegated' | 'updated-existing';
  notes?: string;
};

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((s) => (s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s))
    .join(' ');
}

async function main(): Promise<void> {
  const initialPassword = requireScriptSecret('DELEGATE_DEFAULT_PASSWORD');
  await connectDatabase();

  const results: ResultRow[] = [];

  try {
    // 1. Fetch all tenants that we want to delegate (active + coming-soon + pending)
    const tenants = await Tenant.find({
      status: { $in: ['active', 'coming_soon', 'pending'] },
    })
      .select('_id slug name status')
      .lean();

    console.log(`\nFound ${tenants.length} tenants to consider for delegation.\n`);

    for (const tenant of tenants) {
      const slug = tenant.slug;
      const tenantId = tenant._id;

      // 2. Skip tenants that already have at least one brand-admin assigned.
      const existingBrandAdmin = await User.findOne({
        role: 'brand-admin',
        assignedTenants: tenantId,
      }).select('_id email');

      if (existingBrandAdmin) {
        results.push({
          tenantSlug: slug,
          tenantName: tenant.name,
          status: tenant.status,
          email: existingBrandAdmin.email,
          action: 'already-delegated',
        });
        continue;
      }

      // 3. No brand-admin yet. Upsert the canonical brand-admin user for this tenant.
      const email = `${slug}@${EMAIL_DOMAIN}`.toLowerCase();

      const existingUser = await User.findOne({ email }).select('+password');

      if (existingUser) {
        // User row already exists (e.g. partially provisioned before). Ensure
        // it has the correct role/tenant assignment and reset the password
        // to the default so we can hand credentials back to the client.
        existingUser.role = 'brand-admin';
        existingUser.status = 'active';

        const assigned = (existingUser.assignedTenants || []).map((id) => id.toString());
        if (!assigned.includes(tenantId.toString())) {
          existingUser.assignedTenants = [
            ...(existingUser.assignedTenants || []),
            tenantId,
          ] as typeof existingUser.assignedTenants;
        }

        existingUser.password = initialPassword; // pre-save hook will hash
        existingUser.passwordResetToken = undefined;
        existingUser.passwordResetExpires = undefined;
        await existingUser.save();

        results.push({
          tenantSlug: slug,
          tenantName: tenant.name,
          status: tenant.status,
          email,
          action: 'updated-existing',
          notes: 'Row existed with this email; role/tenant/password re-synced.',
        });
        continue;
      }

      // 4. Create a fresh brand-admin user for this tenant.
      const firstName = titleCase(slug);
      const user = new User({
        email,
        password: initialPassword, // hashed by pre-save hook
        firstName,
        lastName: 'Admin',
        role: 'brand-admin',
        status: 'active',
        assignedTenants: [tenantId],
        language: 'en',
        currency: 'USD',
      });
      await user.save();

      results.push({
        tenantSlug: slug,
        tenantName: tenant.name,
        status: tenant.status,
        email,
        action: 'created',
      });
    }
  } finally {
    await disconnectDatabase();
  }

  // 5. Print results as a readable table.
  console.log('\n=====================================================');
  console.log(' DELEGATION RESULTS');
  console.log('=====================================================\n');

  const created = results.filter((r) => r.action === 'created');
  const updated = results.filter((r) => r.action === 'updated-existing');
  const existing = results.filter((r) => r.action === 'already-delegated');

  console.log(`Created new brand-admins: ${created.length}`);
  console.log(`Updated existing users:   ${updated.length}`);
  console.log(`Already delegated:        ${existing.length}`);
  console.log('');

  const allWithNewCreds = [...created, ...updated];
  if (allWithNewCreds.length > 0) {
    console.log('--- PROVISIONED ACCOUNTS ---');
    console.log('Tenant | Status | Email');
    console.log('-'.repeat(100));
    for (const r of allWithNewCreds) {
      console.log(`${r.tenantName} | ${r.status} | ${r.email}`);
    }
    console.log('Credentials were supplied through the approved secret manager and are not printed.');
    console.log('');
  }

  if (existing.length > 0) {
    console.log('--- ALREADY DELEGATED (skipped) ---');
    for (const r of existing) {
      console.log(`  - ${r.tenantName} (${r.tenantSlug}) -> ${r.email}`);
    }
    console.log('');
  }

  // Also emit machine-readable JSON so the caller can grep it.
  console.log('--- JSON ---');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(async (error) => {
  console.error('Delegation script failed:', error);
  await disconnectDatabase();
  process.exit(1);
});
