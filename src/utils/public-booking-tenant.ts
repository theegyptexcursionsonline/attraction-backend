import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';

/** A public slug routes marketplace discovery to a real seller, without exposing assignment IDs. */
export async function publicBookingTenantSlug(attraction: {tenantIds?: unknown[];ownerTenantId?: unknown}): Promise<string | undefined> {
  const ids = (attraction.tenantIds || []).map(String).filter(id => Types.ObjectId.isValid(id));
  if (!ids.length) return undefined;
  const owner = attraction.ownerTenantId ? String(attraction.ownerTenantId) : undefined;
  if (owner) {
    if (!ids.includes(owner)) return undefined;
    const tenant = await Tenant.findOne({_id:owner,status:'active'}).select('slug').lean();
    return tenant?.slug;
  }
  const tenants = await Tenant.find({_id:{$in:ids},status:'active'}).select('slug').limit(2).lean();
  return tenants.length === 1 ? tenants[0].slug : undefined;
}
