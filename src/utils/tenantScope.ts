import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';

/**
 * Shared multi-tenant access helpers for admin controllers.
 *
 * Roles rank from super-admin (5) down to viewer (1). A super-admin is unscoped
 * (sees/acts on every tenant); everyone else is confined to their `assignedTenants`.
 * These helpers keep that rule in one place so admin list/detail/mutation handlers
 * can't accidentally leak or mutate another tenant's data.
 */

const ROLE_RANK: Record<string, number> = {
  'super-admin': 5,
  'brand-admin': 4,
  manager: 3,
  editor: 2,
  viewer: 1,
  customer: 0,
  guest: 0,
};

export interface ScopedUser {
  role?: string;
  assignedTenants?: Types.ObjectId[];
  _id?: Types.ObjectId | string;
}

export const isSuperAdmin = (u?: { role?: string } | null): boolean =>
  u?.role === 'super-admin';

/** Caller's assigned tenant ids as strings. */
export const callerTenantIds = (u?: ScopedUser | null): string[] =>
  (u?.assignedTenants || []).map((t) => t.toString());

/** True when the two id lists share at least one tenant. */
export const sharesAnyTenant = (a: string[], b: string[]): boolean => {
  const set = new Set(a.map(String));
  return b.some((id) => set.has(String(id)));
};

/**
 * Whether `callerRole` is allowed to grant `targetRole`. A super-admin may grant
 * anything; anyone else may only grant roles at or below `manager` — so a
 * brand-admin can never mint a super-admin or another brand-admin (the escalation
 * path this closes).
 */
export const canAssignRole = (callerRole: string | undefined, targetRole?: string): boolean => {
  if (!targetRole) return true;
  if (callerRole === 'super-admin') return true;
  return (ROLE_RANK[targetRole] ?? 99) <= ROLE_RANK.manager;
};

/**
 * Whether `callerRole` may manage a user who currently holds `targetRole`. A
 * super-admin may manage anyone; a non-super caller may only manage users strictly
 * below their own rank (so a brand-admin can't edit/promote a peer or a super-admin).
 */
export const canManageRole = (callerRole: string | undefined, targetRole?: string): boolean => {
  if (callerRole === 'super-admin') return true;
  const caller = ROLE_RANK[callerRole ?? ''] ?? 0;
  const target = ROLE_RANK[targetRole ?? ''] ?? 99;
  return target < caller;
};

/**
 * The set of attraction _ids owned by the given tenants. Used to scope models that
 * reference an attraction but carry no tenant field of their own (Review,
 * SpecialOffer, Availability).
 */
export const attractionIdsForTenants = async (
  tenantIds: string[]
): Promise<Types.ObjectId[]> => {
  if (!tenantIds.length) return [];
  return Attraction.find({ tenantIds: { $in: tenantIds } }).distinct('_id') as Promise<
    Types.ObjectId[]
  >;
};

/** True if the given attraction id belongs to at least one of the caller's tenants. */
export const attractionInCallerTenants = async (
  attractionId: string | Types.ObjectId,
  tenantIds: string[]
): Promise<boolean> => {
  if (!tenantIds.length) return false;
  const found = await Attraction.exists({
    _id: attractionId,
    tenantIds: { $in: tenantIds },
  });
  return !!found;
};
