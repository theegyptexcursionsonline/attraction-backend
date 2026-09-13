import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Destination } from '../models/Destination';
import { Tenant } from '../models/Tenant';
import { getAttractions } from '../controllers/attractions.controller';
import {
  getDestinationBySlug,
  getDestinations,
  getFeaturedDestinations,
} from '../controllers/destinations.controller';
import { updateTenant, updateTenantSettings } from '../controllers/tenants.controller';
import {
  MAX_PICKUP_DESTINATIONS,
  isValidPickupDestinationList,
  tenantPickupDestinationSlugs,
} from '../utils/pickupDestinations';

jest.mock('../models/Attraction', () => ({
  Attraction: {
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
    distinct: jest.fn(),
  },
}));
jest.mock('../models/Destination', () => ({
  Destination: { find: jest.fn(), findOne: jest.fn(), countDocuments: jest.fn() },
}));
jest.mock('../models/Tenant', () => ({
  Tenant: { findById: jest.fn(), findByIdAndUpdate: jest.fn(), findOne: jest.fn() },
}));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

const body = (res: any) => res.json.mock.calls[0][0];

const chain = (result: unknown) => {
  const query: any = {};
  for (const step of ['select', 'sort', 'skip', 'limit']) query[step] = jest.fn().mockReturnValue(query);
  query.lean = jest.fn().mockResolvedValue(result);
  return query;
};

const royalCruise = (pickupDestinationSlugs?: string[]) => ({
  _id: new Types.ObjectId(),
  slug: 'royal-cruise-hurghada',
  pickupDestinationSlugs,
});

const hurghada = { _id: 'd1', name: 'Hurghada', slug: 'hurghada' };
const makadi = { _id: 'd2', name: 'Makadi Bay', slug: 'makadi-bay' };

describe('pickup destination slugs', () => {
  it('normalises, de-duplicates and drops malformed slugs', () => {
    expect(tenantPickupDestinationSlugs({
      pickupDestinationSlugs: [' Makadi-Bay ', 'makadi-bay', 'soma-bay', 'bad slug', '', 42, '../x'],
    })).toEqual(['makadi-bay', 'soma-bay']);
  });

  it('treats a missing or non-list value as no pickup areas', () => {
    expect(tenantPickupDestinationSlugs(undefined)).toEqual([]);
    expect(tenantPickupDestinationSlugs({})).toEqual([]);
    expect(tenantPickupDestinationSlugs({ pickupDestinationSlugs: 'makadi-bay' })).toEqual([]);
  });

  it('never returns more than the maximum', () => {
    const many = Array.from({ length: 20 }, (_, i) => `area-${i}`);
    expect(tenantPickupDestinationSlugs({ pickupDestinationSlugs: many })).toHaveLength(MAX_PICKUP_DESTINATIONS);
  });

  it('validates an update list', () => {
    expect(isValidPickupDestinationList([])).toBe(true);
    expect(isValidPickupDestinationList(['makadi-bay', 'El-Gouna'])).toBe(true);
    expect(isValidPickupDestinationList('makadi-bay')).toBe(false);
    expect(isValidPickupDestinationList(['makadi bay'])).toBe(false);
    expect(isValidPickupDestinationList([{ $ne: null }])).toBe(false);
    expect(isValidPickupDestinationList(Array.from({ length: 13 }, (_, i) => `a-${i}`))).toBe(false);
  });
});

describe('destinations served by hotel pickup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists a site pickup area beside its departure cities and flags it', async () => {
    const tenant = royalCruise(['makadi-bay']);
    (Attraction.distinct as jest.Mock).mockResolvedValue(['Hurghada']);
    const find = chain([hurghada, makadi]);
    (Destination.find as jest.Mock).mockReturnValue(find);
    (Destination.countDocuments as jest.Mock).mockResolvedValue(2);
    (Attraction.aggregate as jest.Mock).mockResolvedValue([{ _id: 'Hurghada', count: 9 }]);
    (Attraction.countDocuments as jest.Mock).mockResolvedValue(4);
    const res = response();

    await getDestinations({ tenant, query: {} } as never, res, jest.fn());

    expect(Destination.find).toHaveBeenCalledWith({
      isActive: true,
      $and: [{ $or: [{ name: { $in: ['Hurghada'] } }, { slug: { $in: ['makadi-bay'] } }] }],
    });
    expect(Attraction.countDocuments).toHaveBeenCalledWith({
      status: 'active',
      tenantIds: { $in: [tenant._id] },
      hasHotelPickup: true,
    });
    expect(body(res).data).toEqual([
      { ...hurghada, attractionCount: 9 },
      { ...makadi, attractionCount: 4, servedByPickup: true },
    ]);
  });

  it('keeps a text search and the pickup scope as separate conditions', async () => {
    const tenant = royalCruise(['makadi-bay']);
    (Attraction.distinct as jest.Mock).mockResolvedValue(['Hurghada']);
    (Destination.find as jest.Mock).mockReturnValue(chain([]));
    (Destination.countDocuments as jest.Mock).mockResolvedValue(0);
    (Attraction.aggregate as jest.Mock).mockResolvedValue([]);

    await getDestinations({ tenant, query: { search: 'bay' } } as never, response(), jest.fn());

    const query = (Destination.find as jest.Mock).mock.calls[0][0];
    expect(query.$or).toEqual([
      { name: { $regex: 'bay', $options: 'i' } },
      { country: { $regex: 'bay', $options: 'i' } },
    ]);
    expect(query.$and).toEqual([
      { $or: [{ name: { $in: ['Hurghada'] } }, { slug: { $in: ['makadi-bay'] } }] },
    ]);
  });

  it('leaves a site without pickup areas exactly as before', async () => {
    const tenant = royalCruise();
    (Attraction.distinct as jest.Mock).mockResolvedValue(['Hurghada']);
    (Destination.find as jest.Mock).mockReturnValue(chain([hurghada]));
    (Destination.countDocuments as jest.Mock).mockResolvedValue(1);
    (Attraction.aggregate as jest.Mock).mockResolvedValue([{ _id: 'Hurghada', count: 9 }]);
    const res = response();

    await getDestinations({ tenant, query: {} } as never, res, jest.fn());

    expect(Destination.find).toHaveBeenCalledWith({ isActive: true, name: { $in: ['Hurghada'] } });
    expect(Attraction.countDocuments).not.toHaveBeenCalled();
    expect(body(res).data).toEqual([{ ...hurghada, attractionCount: 9 }]);
  });

  it('does not flag a pickup area the site also departs from', async () => {
    const tenant = royalCruise(['hurghada']);
    (Attraction.distinct as jest.Mock).mockResolvedValue(['Hurghada']);
    (Destination.find as jest.Mock).mockReturnValue(chain([hurghada]));
    (Destination.countDocuments as jest.Mock).mockResolvedValue(1);
    (Attraction.aggregate as jest.Mock).mockResolvedValue([{ _id: 'Hurghada', count: 9 }]);
    const res = response();

    await getDestinations({ tenant, query: {} } as never, res, jest.fn());

    expect(Attraction.countDocuments).not.toHaveBeenCalled();
    expect(body(res).data).toEqual([{ ...hurghada, attractionCount: 9 }]);
  });

  it('includes pickup areas in the featured list', async () => {
    const tenant = royalCruise(['makadi-bay']);
    (Attraction.distinct as jest.Mock).mockResolvedValue(['Hurghada']);
    (Destination.find as jest.Mock).mockReturnValue(chain([hurghada, makadi]));
    (Attraction.aggregate as jest.Mock).mockResolvedValue([{ _id: 'Hurghada', count: 9 }]);
    (Attraction.countDocuments as jest.Mock).mockResolvedValue(4);
    const res = response();

    await getFeaturedDestinations({ tenant, query: { limit: '8' } } as never, res, jest.fn());

    expect(Destination.find).toHaveBeenCalledWith({
      isActive: true,
      $or: [{ name: { $in: ['Hurghada'] } }, { slug: { $in: ['makadi-bay'] } }],
    });
    expect(body(res).data[1]).toEqual({ ...makadi, attractionCount: 4, servedByPickup: true });
  });

  it('opens a pickup area with the site hotel-pickup tours', async () => {
    const tenant = royalCruise(['makadi-bay']);
    (Destination.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(makadi) });
    (Attraction.countDocuments as jest.Mock).mockResolvedValueOnce(0).mockResolvedValueOnce(4);
    (Attraction.aggregate as jest.Mock).mockResolvedValue([]);
    (Attraction.find as jest.Mock).mockReturnValue(chain([]));
    const res = response();

    await getDestinationBySlug({ tenant, params: { slug: 'makadi-bay' } } as never, res, jest.fn());

    const pickupScope = { status: 'active', tenantIds: { $in: [tenant._id] }, hasHotelPickup: true };
    expect(Attraction.countDocuments).toHaveBeenNthCalledWith(1, {
      'destination.city': 'Makadi Bay',
      status: 'active',
      tenantIds: { $in: [tenant._id] },
    });
    expect(Attraction.countDocuments).toHaveBeenLastCalledWith(pickupScope);
    expect(Attraction.find).toHaveBeenCalledWith(pickupScope);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body(res).data).toMatchObject({ slug: 'makadi-bay', servedByPickup: true, attractionCount: 4 });
  });

  it('keeps departures when the site actually sails from the pickup area', async () => {
    const tenant = royalCruise(['makadi-bay']);
    (Destination.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(makadi) });
    (Attraction.countDocuments as jest.Mock).mockResolvedValue(2);
    (Attraction.aggregate as jest.Mock).mockResolvedValue([]);
    (Attraction.find as jest.Mock).mockReturnValue(chain([]));
    const res = response();

    await getDestinationBySlug({ tenant, params: { slug: 'makadi-bay' } } as never, res, jest.fn());

    expect(Attraction.find).toHaveBeenCalledWith({
      'destination.city': 'Makadi Bay',
      status: 'active',
      tenantIds: { $in: [tenant._id] },
    });
    expect(body(res).data.servedByPickup).toBeUndefined();
  });

  it('does not open another site pickup area', async () => {
    const tenant = royalCruise(['soma-bay']);
    (Destination.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(makadi) });
    (Attraction.countDocuments as jest.Mock).mockResolvedValue(0);
    (Attraction.aggregate as jest.Mock).mockResolvedValue([]);
    const res = response();

    await getDestinationBySlug({ tenant, params: { slug: 'makadi-bay' } } as never, res, jest.fn());

    expect(Attraction.countDocuments).toHaveBeenCalledTimes(1);
    expect(Attraction.countDocuments).toHaveBeenCalledWith({
      'destination.city': 'Makadi Bay',
      status: 'active',
      tenantIds: { $in: [tenant._id] },
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('tour listing by pickup area', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists only the site hotel-pickup tours for a configured area', async () => {
    const tenant = royalCruise(['makadi-bay']);
    (Attraction.find as jest.Mock).mockReturnValue(chain([]));
    (Attraction.countDocuments as jest.Mock).mockResolvedValue(0);

    await getAttractions({ tenant, query: { pickupFrom: 'Makadi-Bay' } } as never, response(), jest.fn());

    expect(Attraction.find).toHaveBeenCalledWith(expect.objectContaining({
      status: 'active',
      tenantIds: { $in: [tenant._id] },
      hasHotelPickup: true,
    }));
  });

  it('returns an empty page for an area the site does not serve', async () => {
    const tenant = royalCruise(['makadi-bay']);
    const res = response();

    await getAttractions({ tenant, query: { pickupFrom: 'sharm-el-sheikh' } } as never, res, jest.fn());

    expect(Attraction.find).not.toHaveBeenCalled();
    expect(body(res)).toMatchObject({ success: true, data: [] });
  });

  it('returns an empty page when no site is in context', async () => {
    const res = response();

    await getAttractions({ query: { pickupFrom: 'makadi-bay' } } as never, res, jest.fn());

    expect(Attraction.find).not.toHaveBeenCalled();
    expect(body(res)).toMatchObject({ success: true, data: [] });
  });

  it('ignores a non-string pickup value', async () => {
    const tenant = royalCruise(['makadi-bay']);
    (Attraction.find as jest.Mock).mockReturnValue(chain([]));
    (Attraction.countDocuments as jest.Mock).mockResolvedValue(0);

    await getAttractions({ tenant, query: { pickupFrom: ['makadi-bay'] } } as never, response(), jest.fn());

    expect((Attraction.find as jest.Mock).mock.calls[0][0].hasHotelPickup).toBeUndefined();
  });
});

describe('saving pickup areas on a site', () => {
  beforeEach(() => jest.clearAllMocks());
  const id = new Types.ObjectId().toHexString();

  it.each([
    ['a single string', 'makadi-bay'],
    ['a malformed slug', ['makadi bay']],
    ['an operator object', [{ $gt: '' }]],
    ['too many areas', Array.from({ length: 13 }, (_, i) => `area-${i}`)],
  ])('rejects %s before touching the site', async (_label, pickupDestinationSlugs) => {
    for (const handler of [updateTenant, updateTenantSettings]) {
      const res = response();
      await handler({ params: { id }, body: { pickupDestinationSlugs } } as never, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(400);
      expect(body(res).error).toContain('Pickup destinations');
    }
    expect(Tenant.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('lets a site admin save a valid list', async () => {
    (Tenant.findByIdAndUpdate as jest.Mock).mockResolvedValue({ _id: id });
    const res = response();

    await updateTenantSettings(
      { params: { id }, body: { pickupDestinationSlugs: ['makadi-bay', 'sahl-hashesh'] } } as never,
      res,
      jest.fn()
    );

    expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(
      id,
      { $set: { pickupDestinationSlugs: ['makadi-bay', 'sahl-hashesh'] } },
      { new: true, runValidators: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
