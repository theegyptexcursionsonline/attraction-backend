/**
 * Seed/refresh a DEMO CUSTOMER account for dashboard QA verification.
 * Test fixture only (role: customer) in the dev DB — lets us log in and
 * confirm the customer dashboard renders in the tenant's theme.
 *
 * Run: npx ts-node src/scripts/seed-demo-customer.ts <tenant-slug>
 */
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { requireScriptSecret } from './require-script-secret';

const SLUG = process.argv[2] || 'sharm-dinner-cruise';
const EMAIL = `demo.${SLUG}@foxesdemo.test`;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function main(): Promise<void> {
  const demoPassword = requireScriptSecret('DEMO_ACCOUNT_PASSWORD');
  await connectDatabase();
  try {
    const tenant: any = await Tenant.findOne({ slug: SLUG });
    if (!tenant) { console.log(`✗ tenant ${SLUG} not found`); return; }

    let user: any = await User.findOne({ email: EMAIL }).select('+password');
    if (user) {
      user.password = demoPassword; // pre-save hook re-hashes
      user.status = 'active';
      user.assignedTenants = [tenant._id];
      await user.save();
      console.log(`✓ refreshed demo customer`);
    } else {
      user = await User.create({
        email: EMAIL,
        password: demoPassword,
        firstName: 'Demo',
        lastName: 'Guest',
        role: 'customer',
        status: 'active',
        assignedTenants: [tenant._id],
      });
      console.log(`✓ created demo customer`);
    }
    console.log(`  tenant : ${SLUG}`);
    console.log(`  email  : ${EMAIL}`);
    console.log('  pass   : supplied securely and not printed');
  } finally {
    await disconnectDatabase();
  }
}
main().catch(async (e) => { console.error(e); await disconnectDatabase(); process.exit(1); });
