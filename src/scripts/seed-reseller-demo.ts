/**
 * Seed a DEMO of the reseller flow so we can screenshot "how this reseller part
 * is managed": pick a supplier tenant, open a few of its tours for resale with a
 * commission, create resale bookings (sold by another tenant), and ensure a
 * known demo brand-admin login for the supplier.
 *
 * Idempotent — demo bookings are tagged with promoCode RESELLER-DEMO and wiped
 * on rerun. Only creates a *new* demo admin; never touches real accounts.
 *
 * Run: npx ts-node src/scripts/seed-reseller-demo.ts [supplier-slug]
 */
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Booking } from '../models/Booking';
import { User } from '../models/User';
import { generateBookingReference } from '../utils/hash';

const PAYMENT_FEE_PERCENT = 2.9;
const DEMO_TAG = 'RESELLER-DEMO';
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function main(): Promise<void> {
  await connectDatabase();
  try {
    const forcedSlug = process.argv[2];

    // Supplier = a tenant that owns active tours. Prefer the requested slug,
    // else the tenant owning the most active tours (best demo surface).
    let supplier: any = null;
    if (forcedSlug) supplier = await Tenant.findOne({ slug: forcedSlug });
    if (!supplier) {
      const top = await Attraction.aggregate([
        { $match: { status: 'active', ownerTenantId: { $ne: null } } },
        { $group: { _id: '$ownerTenantId', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 1 },
      ]);
      if (top[0]) supplier = await Tenant.findById(top[0]._id);
    }
    if (!supplier) { console.log('✗ no supplier tenant with owned tours found'); return; }

    // Reseller = any other active tenant.
    const reseller: any = await Tenant.findOne({ _id: { $ne: supplier._id }, status: 'active' });
    if (!reseller) { console.log('✗ need a second active tenant to act as reseller'); return; }

    console.log(`supplier : ${supplier.name} (${supplier.slug})`);
    console.log(`reseller : ${reseller.name} (${reseller.slug})`);

    // Open the supplier's top tours for resale with varied commissions.
    const tours: any[] = await Attraction.find({ ownerTenantId: supplier._id, status: 'active' })
      .sort({ rating: -1, createdAt: -1 })
      .limit(4);
    if (tours.length === 0) { console.log('✗ supplier owns no active tours'); return; }

    const commissions = [20, 15, 25, 18];
    for (let i = 0; i < tours.length; i++) {
      const t = tours[i];
      if (!t.reseller) t.reseller = { enabled: false, value: 0, allowedTenants: [] };
      t.reseller.enabled = true;
      t.reseller.value = commissions[i % commissions.length];
      await t.save();
      console.log(`  ✓ ${t.title} → ${t.reseller.value}% commission`);
    }

    // Wipe prior demo bookings so rerun stays clean.
    await Booking.deleteMany({ promoCode: DEMO_TAG });

    // Create resale bookings. Concentrate volume on the first tour so a clear
    // best-seller emerges; spread a couple onto the second tour.
    const plan = [
      { tour: tours[0], adults: 2 },
      { tour: tours[0], adults: 3 },
      { tour: tours[0], adults: 2 },
      { tour: tours[1] || tours[0], adults: 2 },
    ];

    const refs: string[] = [];
    for (let i = 0; i < plan.length; i++) {
      const { tour, adults } = plan[i];
      const option = tour.pricingOptions?.[0];
      const unit = option?.price ?? tour.priceFrom ?? 50;
      const total = round2(unit * adults);
      const commissionPercent = tour.reseller.value;
      const sellerEarnings = round2((total * commissionPercent) / 100);
      const paymentFee = round2((total * PAYMENT_FEE_PERCENT) / 100);
      const supplierEarnings = round2(total - sellerEarnings - paymentFee);

      const ref = generateBookingReference();
      refs.push(ref);
      await Booking.create({
        reference: ref,
        tenantId: reseller._id, // sold on the reseller's site
        attractionId: tour._id,
        items: [{
          optionId: option?.id || 'standard',
          optionName: option?.name || 'Standard',
          date: '2026-07-15',
          time: '09:00',
          quantities: { adults, children: 0, infants: 0 },
          unitPrice: unit,
          totalPrice: total,
        }],
        guestDetails: {
          firstName: 'Demo',
          lastName: `Guest ${i + 1}`,
          email: `demo.guest${i + 1}@foxesdemo.test`,
          phone: '+201000000000',
          country: 'Germany',
        },
        subtotal: total,
        fees: 0,
        discount: 0,
        total,
        currency: tour.currency || 'USD',
        promoCode: DEMO_TAG,
        paymentMethod: 'pay-later',
        status: 'confirmed',
        paymentStatus: i % 2 === 0 ? 'succeeded' : 'pending',
        supplierTenantId: supplier._id,
        sellerTenantId: reseller._id,
        isResale: true,
        revenueBreakdown: { commissionPercent, sellerEarnings, paymentFee, supplierEarnings },
      });
      console.log(`  ✓ booking ${ref} — ${tour.title} ×${adults} = ${total} ${tour.currency} (supplier nets ${supplierEarnings})`);
    }

    // Demo brand-admin for the supplier so we can log into the admin UI.
    const EMAIL = `reseller.demo@foxesdemo.test`;
    const PASSWORD = 'DemoPass2026!';
    let admin: any = await User.findOne({ email: EMAIL }).select('+password');
    if (admin) {
      admin.password = PASSWORD;
      admin.status = 'active';
      admin.role = 'brand-admin';
      admin.assignedTenants = [supplier._id];
      await admin.save();
      console.log('✓ refreshed demo brand-admin');
    } else {
      admin = await User.create({
        email: EMAIL,
        password: PASSWORD,
        firstName: 'Reseller',
        lastName: 'Demo',
        role: 'brand-admin',
        status: 'active',
        assignedTenants: [supplier._id],
      });
      console.log('✓ created demo brand-admin');
    }

    // Marketplace demo: another operator opens a few tours for resale, and the
    // demo supplier (acting as a reseller here) has already added one to its
    // own site — so the "on my site only" filter has something to show.
    const otherOwner = await Attraction.aggregate([
      { $match: { status: 'active', ownerTenantId: { $ne: supplier._id } } },
      { $group: { _id: '$ownerTenantId', n: { $sum: 1 } } },
      { $match: { n: { $gte: 3 } } },
      { $sort: { n: -1 } },
      { $limit: 1 },
    ]);
    if (otherOwner[0]) {
      const mktTours: any[] = await Attraction.find({ ownerTenantId: otherOwner[0]._id, status: 'active' })
        .sort({ rating: -1 })
        .limit(3);
      const mktRates = [12, 18, 22];
      for (let i = 0; i < mktTours.length; i++) {
        const t = mktTours[i];
        if (!t.reseller) t.reseller = { enabled: false, value: 0, allowedTenants: [] };
        t.reseller.enabled = true;
        t.reseller.value = mktRates[i % mktRates.length];
        if (i === 0 && !t.tenantIds.some((x: any) => String(x) === String(supplier._id))) {
          t.tenantIds.push(supplier._id); // already reselling this one
        }
        await t.save();
      }
      const mktTenant: any = await Tenant.findById(otherOwner[0]._id);
      console.log(`marketplace : ${mktTenant?.name} opened ${mktTours.length} tours for resale; 1 added to ${supplier.slug}`);
    }

    console.log('\n=== DEMO READY ===');
    console.log(`supplier tenant : ${supplier.slug}`);
    console.log(`admin email     : ${EMAIL}`);
    console.log(`admin password  : ${PASSWORD}`);
    console.log(`booking refs    : ${refs.join(', ')}`);
  } finally {
    await disconnectDatabase();
  }
}
main().catch(async (e) => { console.error(e); await disconnectDatabase(); process.exit(1); });
