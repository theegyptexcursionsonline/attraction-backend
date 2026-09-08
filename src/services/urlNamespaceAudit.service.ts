import { Tenant } from '../models/Tenant';

/** Read-only, database-paginated audit. No claims, counters, pages or tours are changed. */
export async function auditTenantUrlNamespace(slug: string, page = 1, limit = 100) {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Use a positive page and a limit between 1 and 100');
  const tenant = await Tenant.findOne({ slug }).select('_id slug').lean();
  if (!tenant) throw new Error('Website not found');
  const result = await Tenant.aggregate([
    { $match: { _id: tenant._id } },
    { $unwind: '$customPages' },
    { $project: { path: '$customPages.slug', owner: { $concat: ['page:', { $toString: '$customPages._id' }] } } },
    { $unionWith: { coll: 'attractions', pipeline: [
      { $match: { tenantIds: tenant._id } },
      { $project: { paths: { $setUnion: [['$slug'], ['$pathSlug']] }, owner: { $concat: ['attraction:', { $toString: '$_id' }] } } },
      { $unwind: '$paths' },
      { $project: { path: '$paths', owner: 1 } },
    ] } },
    { $match: { path: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$path', owners: { $addToSet: '$owner' } } },
    { $match: { $expr: { $gt: [{ $size: '$owners' }, 1] } } },
    { $sort: { _id: 1 } },
    { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _id: 0, path: '$_id', owners: 1 } }], total: [{ $count: 'count' }] } },
  ]);
  const total = result[0]?.total?.[0]?.count || 0;
  return { tenant: tenant.slug, collisions: result[0]?.items || [], pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
