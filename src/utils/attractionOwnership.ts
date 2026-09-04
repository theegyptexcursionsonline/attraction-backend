export type AttractionOwnership = 'all' | 'owned' | 'assigned';

type MongoFilter = Record<string, unknown>;

/**
 * Builds a database-level ownership filter for an administrator's current
 * brand scope. Older attractions predate ownerTenantId; for those records the
 * first assigned tenant remains the commercial owner.
 */
export const attractionOwnershipFilter = (
  ownership: AttractionOwnership,
  tenantIds: unknown[]
): MongoFilter | null => {
  if (ownership === 'all') return {};
  if (tenantIds.length === 0) return null;

  const legacyOwner = {
    $or: [
      { ownerTenantId: { $exists: false } },
      { ownerTenantId: null },
    ],
  };
  const legacyOwnerIsInScope = {
    $expr: {
      $in: [{ $arrayElemAt: ['$tenantIds', 0] }, tenantIds],
    },
  };

  if (ownership === 'owned') {
    return {
      $or: [
        { ownerTenantId: { $in: tenantIds } },
        { $and: [legacyOwner, legacyOwnerIsInScope] },
      ],
    };
  }

  return {
    $and: [
      { tenantIds: { $in: tenantIds } },
      {
        $or: [
          { ownerTenantId: { $exists: true, $nin: [...tenantIds, null] } },
          {
            $and: [
              legacyOwner,
              {
                $expr: {
                  $not: [{ $in: [{ $arrayElemAt: ['$tenantIds', 0] }, tenantIds] }],
                },
              },
            ],
          },
        ],
      },
    ],
  };
};

