import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';

export interface PublicAttractionOperator {
  name: string;
  relationship: 'own' | 'partner';
}

const objectId = (value: unknown): string | undefined => {
  if (value instanceof Types.ObjectId) return value.toHexString();
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? value.toLowerCase() : undefined;
};

/** Only already-scoped page rows may contribute owner IDs to this public join.
 * Legacy multi-site assignment order is not proof of commercial ownership. */
export const publicAttractionOperators = async (
  rows: readonly unknown[],
  sellingTenantId: unknown,
): Promise<Array<PublicAttractionOperator | null>> => {
  const seller = objectId(sellingTenantId);
  const owners = rows.map(source => {
    if (!seller || !source || typeof source !== 'object') return undefined;
    const row = source as Record<string, unknown>;
    const assigned = Array.isArray(row.tenantIds) ? row.tenantIds.map(objectId) : [];
    if (!assigned.includes(seller)) return undefined;
    if (row.ownerTenantId !== undefined && row.ownerTenantId !== null) return objectId(row.ownerTenantId);
    // A single valid assignment is the only unambiguous legacy owner.
    return assigned.length === 1 ? assigned[0] : undefined;
  });
  const ids = [...new Set(owners.filter((id): id is string => !!id))];
  if (!ids.length) return rows.map(() => null);

  const tenants = await Tenant.find({
    _id: { $in: ids.map(id => new Types.ObjectId(id)) },
    status: 'active',
  }).select('_id name').limit(ids.length).lean();
  const names = new Map(tenants.flatMap(tenant => {
    const id = objectId(tenant._id);
    const name = typeof tenant.name === 'string' ? tenant.name.trim() : '';
    return id && ids.includes(id) && name ? [[id, name] as const] : [];
  }));

  return owners.map(owner => {
    const name = owner && names.get(owner);
    return name ? { name, relationship: owner === seller ? 'own' : 'partner' } : null;
  });
};
