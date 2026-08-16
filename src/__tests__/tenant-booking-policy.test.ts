import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import {
  assertTenantBookingCreationAllowed,
  assertTenantIdsBookingCreationAllowed,
  isTenantBookingCreationClosed,
  TenantBookingCreationClosedError,
} from '../services/tenantBookingPolicy.service';

describe('tenant booking-creation closure policy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects Makadi by its stable tenant slug with an operational 503', () => {
    expect(isTenantBookingCreationClosed({ slug: 'makadi-horse-club' })).toBe(true);
    expect(() => assertTenantBookingCreationAllowed({ slug: 'makadi-horse-club' }))
      .toThrow(TenantBookingCreationClosedError);

    try {
      assertTenantBookingCreationAllowed({ slug: 'makadi-horse-club' });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'TENANT_BOOKING_CREATION_CLOSED',
        statusCode: 503,
        isOperational: true,
      });
    }
  });

  it('leaves every other tenant and a missing optional tenant unaffected', () => {
    expect(isTenantBookingCreationClosed({ slug: 'rittal-travel-egypt' })).toBe(false);
    expect(() => assertTenantBookingCreationAllowed({ slug: 'rittal-travel-egypt' })).not.toThrow();
    expect(() => assertTenantBookingCreationAllowed(undefined)).not.toThrow();
  });

  it('resolves ObjectId-only create paths against the closed slug without broad tenant blocking', async () => {
    const makadiId = new Types.ObjectId();
    const otherId = new Types.ObjectId();
    const findOne = jest.spyOn(Tenant, 'findOne')
      .mockResolvedValue({ slug: 'makadi-horse-club' } as never);

    await expect(assertTenantIdsBookingCreationAllowed([otherId, makadiId, otherId]))
      .rejects.toBeInstanceOf(TenantBookingCreationClosedError);
    expect(findOne).toHaveBeenCalledWith({
      _id: { $in: [otherId.toString(), makadiId.toString()] },
      slug: { $in: ['makadi-horse-club'] },
    });

    findOne.mockResolvedValueOnce(null);
    await expect(assertTenantIdsBookingCreationAllowed([otherId])).resolves.toBeUndefined();
  });
});
