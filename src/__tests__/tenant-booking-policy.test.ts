import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import {
  assertTenantBookingCreationAllowed,
  assertTenantIdsBookingCreationAllowed,
  isTenantBookingCreationClosed,
  TenantBookingCreationClosedError,
  assertTenantPaymentMethodAllowed,
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

describe('tenant offline payment policy', () => {
  afterEach(() => jest.restoreAllMocks());

  it('defaults new tenant records to allowing pay at location', () => {
    expect(new Tenant({}).paymentSettings?.allowPayAtLocation).toBe(true);
    expect(new Tenant({ paymentSettings: { allowPayAtLocation: false } })
      .paymentSettings?.allowPayAtLocation).toBe(false);
  });

  it.each([undefined, 'pay-later', 'cash'])('rejects %s using the resolved tenant policy', async (method) => {
    const id = new Types.ObjectId();
    const findOne = jest.spyOn(Tenant, 'findOne').mockResolvedValue({
      _id: id, paymentSettings: { allowPayAtLocation: false },
    } as never);
    await expect(assertTenantPaymentMethodAllowed(id, method)).rejects.toMatchObject({ statusCode: 409 });
    expect(findOne).toHaveBeenCalledWith({ _id: id, 'paymentSettings.allowPayAtLocation': false });
  });

  it('allows card and leaves unconfigured tenants unchanged', async () => {
    const findOne = jest.spyOn(Tenant, 'findOne').mockResolvedValue(null);
    await expect(assertTenantPaymentMethodAllowed('tenant-1', 'card')).resolves.toBeUndefined();
    expect(findOne).not.toHaveBeenCalled();
    await expect(assertTenantPaymentMethodAllowed('tenant-2', 'cash')).resolves.toBeUndefined();
  });

  it('fails closed when the current policy cannot be read', async () => {
    jest.spyOn(Tenant, 'findOne').mockRejectedValue(new Error('database unavailable'));
    await expect(assertTenantPaymentMethodAllowed('tenant-1', undefined)).rejects.toThrow('database unavailable');
  });
});
