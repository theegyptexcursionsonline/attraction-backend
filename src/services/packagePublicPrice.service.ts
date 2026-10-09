import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { readPackageDetails } from '../utils/packageDetails';
import { resolveBookingTimeZone } from '../utils/bookingCutoff';
import { financePolicy } from '../utils/financeSettings';
import { packageFromPrice, todayInZone } from './packagePricing.service';
import { packageFinanceTotal } from './packageFinance.service';
import { openDepartureDates } from './packageCatalog.service';

/** Seller-specific fees are projected at read time, never persisted into a shared attraction. */
export async function packagePublicPrices(rows: readonly unknown[], tenantId: unknown): Promise<Map<string, number | null>> {
  const packages = rows.filter((row): row is Record<string, any> => !!row && typeof row === 'object' && (row as any).listingType === 'package');
  const prices = new Map<string, number | null>();
  if (!packages.length || !tenantId) return prices;
  const site = await Tenant.findOne({ _id: tenantId }).select('financeSettings financeRevision timezone').lean();
  if (!site) throw new Error('Package website pricing unavailable');
  const policy = financePolicy(site);
  if (!policy.configured) return prices;
  const today = todayInZone(resolveBookingTimeZone(site.timezone));
  await Promise.all(packages.map(async (row) => {
    const details = readPackageDetails(row.packageDetails);
    if (!details) { prices.set(String(row._id), null); return; }
    const departures = details.departureMode === 'fixed' ? await openDepartureDates(new Types.ObjectId(String(row._id)), today) : [];
    const price = packageFromPrice(details, today, departures, 0, packageFinanceTotal(row.currency, policy));
    prices.set(String(row._id), price?.perPerson ?? null);
  }));
  return prices;
}
