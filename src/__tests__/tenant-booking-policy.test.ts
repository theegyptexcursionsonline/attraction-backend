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

  it('keeps the King of Egypt Tours preview closed to real bookings, by slug', () => {
    expect(isTenantBookingCreationClosed({ slug: 'king-of-egypt-tours' })).toBe(true);
    for (const slug of ['grand-egyptian-museum', 'hurghada-boat-tour', 'dive2egypt', 'marsa-alam-red-sea-egypt', 'wadi-el-gemal-reserve', 'shaab-samadai', 'bahria-oasis', 'turtle-bay-hurghada']) {
      expect(isTenantBookingCreationClosed({ slug })).toBe(true);
    }
    // Batch B10's ten monument sites take no booking until each domain is connected and the owner opens it.
    for (const slug of ['great-sphinx-of-giza', 'pyramid-complex-giza', 'great-pyramid-of-cheops', 'mit-rahina-museum',
      'sakkara-pyramids', 'pyramid-of-khafre', 'pyramid-of-menkaure', 'pyramids-of-dahshur', 'statue-of-ramesses-ii',
      'three-pools-dahab']) {
      expect(isTenantBookingCreationClosed({ slug })).toBe(true);
    }
    expect(() => assertTenantBookingCreationAllowed({ slug: 'king-of-egypt-tours' }))
      .toThrow(TenantBookingCreationClosedError);
    // A look-alike slug is a different site and is not closed by this policy.
    expect(isTenantBookingCreationClosed({ slug: 'king-of-egypt-tours-2' })).toBe(false);
    expect(isTenantBookingCreationClosed({ slug: 'KING-OF-EGYPT-TOURS' })).toBe(false);
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
      slug: { $in: [
        'makadi-horse-club', 'king-of-egypt-tours',
        // The network queue's eight new sites stay closed until the owner opens each one.
        'grand-egyptian-museum', 'hurghada-boat-tour', 'dive2egypt', 'marsa-alam-red-sea-egypt',
        'wadi-el-gemal-reserve', 'shaab-samadai', 'bahria-oasis', 'turtle-bay-hurghada',
        // Batch B10's ten monument sites, closed until each domain is connected.
        'great-sphinx-of-giza', 'pyramid-complex-giza', 'great-pyramid-of-cheops', 'mit-rahina-museum',
        'sakkara-pyramids', 'pyramid-of-khafre', 'pyramid-of-menkaure', 'pyramids-of-dahshur',
        'statue-of-ramesses-ii', 'three-pools-dahab',
        // Batch B11's six new sites and the five existing sites moving onto their own brands, closed the same way.
        'saqqara-necropolis', 'pyramid-of-djoser', 'red-pyramid-egypt', 'sphinx-of-memphis', 'samadai-beach',
        'hurghada-speedboat', 'makadi-bay-safari', 'cairo-tour-from-hurghada', 'luxor-tour-from-hurghada',
        'hurghada-snorkeling', 'cairo-night-cruise',
      ] },
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
