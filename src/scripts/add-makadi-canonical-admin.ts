/**
 * Add canonical Makadi Horse Club brand-admin user.
 *
 * Makadi was skipped by delegate-tenant-admins.ts because it already had
 * pre-existing brand-admins (makadi-client@, makadi@, makadi-admin@). This
 * script adds the standard-pattern admin (makadi-horse-club@foxestechnology.com)
 * so Makadi has a credential consistent with every other tenant's admin.
 *
 * Pre-existing Makadi admin users are NOT modified.
 *
 * Usage:
 *   railway run npx ts-node src/scripts/add-makadi-canonical-admin.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { requireScriptSecret } from './require-script-secret';

const SLUG = 'makadi-horse-club';
const EMAIL = 'makadi-horse-club@foxestechnology.com';

async function main(): Promise<void> {
  const initialPassword = requireScriptSecret('TENANT_ADMIN_INITIAL_PASSWORD');
  await connectDatabase();

  try {
    const tenant = await Tenant.findOne({ slug: SLUG }).select('_id slug name');
    if (!tenant) {
      console.error(`Tenant '${SLUG}' not found in production DB.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Found tenant: ${tenant.name} (_id=${tenant._id})`);

    // List existing brand-admins for context (no mutation).
    const existingAdmins = await User.find({
      role: 'brand-admin',
      assignedTenants: tenant._id,
    }).select('email');
    console.log(`\nExisting brand-admins for Makadi (${existingAdmins.length}):`);
    for (const a of existingAdmins) {
      console.log(`  - ${a.email}`);
    }

    // Idempotent: if user with this email already exists, re-sync role/tenant/password.
    const existing = await User.findOne({ email: EMAIL }).select('+password');

    if (existing) {
      console.log(`\nUser ${EMAIL} already exists — re-syncing.`);
      existing.role = 'brand-admin';
      existing.status = 'active';
      const ids = (existing.assignedTenants || []).map((id) => id.toString());
      if (!ids.includes(tenant._id.toString())) {
        existing.assignedTenants = [
          ...(existing.assignedTenants || []),
          tenant._id,
        ] as typeof existing.assignedTenants;
      }
      existing.password = initialPassword; // hashed by pre-save hook
      existing.passwordResetToken = undefined;
      existing.passwordResetExpires = undefined;
      await existing.save();
      console.log('Re-synced. Credential was supplied securely and is not printed.');
    } else {
      console.log(`\nCreating new brand-admin user: ${EMAIL}`);
      const user = new User({
        email: EMAIL,
        password: initialPassword,
        firstName: 'Makadi Horse Club',
        lastName: 'Admin',
        role: 'brand-admin',
        status: 'active',
        assignedTenants: [tenant._id],
        language: 'en',
        currency: 'USD',
      });
      await user.save();
      console.log(`Created.`);
    }

    console.log('\n===========================================');
    console.log(' MAKADI HORSE CLUB - canonical account');
    console.log('===========================================');
    console.log(` Email:    ${EMAIL}`);
    console.log(' Password: supplied through approved secret manager');
    console.log(` Role:     brand-admin`);
    console.log(` Scope:    ${tenant.name} only`);
    console.log('===========================================');
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (err) => {
  console.error('Failed:', err);
  await disconnectDatabase();
  process.exit(1);
});
