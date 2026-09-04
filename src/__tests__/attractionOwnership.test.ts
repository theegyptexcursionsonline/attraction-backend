import { Types } from 'mongoose';
import { attractionOwnershipFilter } from '../utils/attractionOwnership';

describe('attractionOwnershipFilter', () => {
  const tenantId = new Types.ObjectId();

  it('keeps the default list unfiltered', () => {
    expect(attractionOwnershipFilter('all', [tenantId])).toEqual({});
  });

  it('matches modern and legacy owners', () => {
    expect(attractionOwnershipFilter('owned', [tenantId])).toEqual(expect.objectContaining({
      $or: expect.arrayContaining([
        { ownerTenantId: { $in: [tenantId] } },
      ]),
    }));
  });

  it('requires a concrete tenant scope for ownership-specific views', () => {
    expect(attractionOwnershipFilter('assigned', [])).toBeNull();
  });

  it('requires assignment while excluding the owner from scope', () => {
    expect(attractionOwnershipFilter('assigned', [tenantId])).toEqual(expect.objectContaining({
      $and: expect.arrayContaining([
        { tenantIds: { $in: [tenantId] } },
      ]),
    }));
  });
});
