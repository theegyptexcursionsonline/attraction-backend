import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { publicAttractionOperators } from '../services/publicAttractionOperator.service';
import { getAttractions, getAttractionBySlug, getFeaturedAttractions } from '../controllers/attractions.controller';
import { resolvePage } from '../controllers/page.controller';

jest.mock('../models/Tenant', () => ({ Tenant: { find: jest.fn(), findOne: jest.fn() } }));
jest.mock('../models/Attraction', () => ({ Attraction: { find: jest.fn(), findOne: jest.fn(), countDocuments: jest.fn(), aggregate: jest.fn() } }));
jest.mock('../services/attractionLocalization.service', () => ({
  ...jest.requireActual('../services/attractionLocalization.service'),
  translatedSlugFilter: jest.fn().mockResolvedValue(null),
}));

const seller = new Types.ObjectId('000000000000000000000001');
const supplier = new Types.ObjectId('000000000000000000000002');
const foreign = new Types.ObjectId('000000000000000000000003');
const ownerRows = [{ _id: seller, name: 'Own guide' }, { _id: supplier, name: 'Partner operator' }];
const tour = (ownerTenantId: unknown = seller, tenantIds: unknown[] = [seller]) => ({
  _id: new Types.ObjectId(), slug: 'sample-tour', title: 'Sample tour', status: 'active',
  tenantIds, ownerTenantId, createdAt: new Date('2026-10-01T00:00:00Z'),
});
let select: jest.Mock;
let limit: jest.Mock;
let lean: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  lean = jest.fn().mockResolvedValue(ownerRows);
  limit = jest.fn().mockReturnValue({ lean });
  select = jest.fn().mockReturnValue({ limit });
  (Tenant.find as jest.Mock).mockReturnValue({ select });
});

describe('public operator identity', () => {
  it('batches only the page owners and returns name/relationship without private fields', async () => {
    lean.mockResolvedValue(ownerRows.map(row => ({ ...row, contactInfo: { email: 'private' }, paymentSettings: { internal: true } })));
    expect(await publicAttractionOperators([tour(), tour(supplier), tour(supplier)], seller)).toEqual([
      { name: 'Own guide', relationship: 'own' },
      { name: 'Partner operator', relationship: 'partner' },
      { name: 'Partner operator', relationship: 'partner' },
    ]);
    expect(Tenant.find).toHaveBeenCalledTimes(1);
    expect(Tenant.find).toHaveBeenCalledWith({ _id: { $in: [seller, supplier] }, status: 'active' });
    expect(select).toHaveBeenCalledWith('_id name');
    expect(limit).toHaveBeenCalledWith(2);
  });

  it('does not join another site’s tours or invent a relationship without site context', async () => {
    expect(await publicAttractionOperators([tour(foreign, [foreign])], seller)).toEqual([null]);
    expect(await publicAttractionOperators([tour()], undefined)).toEqual([null]);
    expect(await publicAttractionOperators([tour()], 'not-an-id')).toEqual([null]);
    expect(Tenant.find).not.toHaveBeenCalled();
  });

  it('accepts only an unambiguous valid legacy owner and never falls back from an explicit bad owner', async () => {
    expect(await publicAttractionOperators([
      { ...tour(), ownerTenantId: undefined }, { ...tour(), ownerTenantId: null },
      { ...tour(), ownerTenantId: undefined, tenantIds: [seller, supplier] },
      { ...tour(), ownerTenantId: undefined, tenantIds: [seller, 'invalid'] },
      tour('invalid'), tour(foreign),
    ], seller)).toEqual([
      { name: 'Own guide', relationship: 'own' }, { name: 'Own guide', relationship: 'own' },
      null, null, null, null,
    ]);
  });

  it('withholds missing/inactive owners and empty names without using the seller name', async () => {
    lean.mockResolvedValue([{ _id: seller, name: '  ' }]);
    expect(await publicAttractionOperators([tour(), tour(supplier)], seller)).toEqual([null, null]);
    expect(Tenant.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });

  it('uses persisted owner identity, ignores any supplied public label, and preserves input', async () => {
    const source = { ...tour(supplier), operator: { name: 'Unverified claim', relationship: 'own' } };
    expect(await publicAttractionOperators([source], seller)).toEqual([{ name: 'Partner operator', relationship: 'partner' }]);
    expect(source.operator.name).toBe('Unverified claim');
  });

  it('propagates owner lookup failures instead of claiming that the seller operates the tour', async () => {
    lean.mockRejectedValue(new Error('Lookup unavailable'));
    await expect(publicAttractionOperators([tour()], seller)).rejects.toThrow('Lookup unavailable');
  });
});

const response = () => {
  const res: any = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
};
const request = (query: Record<string, unknown> = {}) => ({
  query, params: { slug: 'sample-tour' }, tenant: { _id: seller, slug: 'sample-site' },
});

describe('public catalogue/detail operator contract', () => {
  it.each([
    ['page', {}], ['cursor', { pagination: 'cursor' }],
    ['localized page', { locale: 'en' }], ['localized cursor', { locale: 'en', pagination: 'cursor' }],
  ])('adds operator identity to %s while retaining source scope and hiding owner IDs', async (_label, query) => {
    const row = { ...tour(supplier), enquiryOnly: true, priceFrom: 100, pricingOptions: [{ price: 100 }] };
    const chain: any = { select: jest.fn(), sort: jest.fn(), skip: jest.fn(), limit: jest.fn(), lean: jest.fn().mockResolvedValue([row]) };
    for (const key of ['select', 'sort', 'skip', 'limit']) chain[key].mockReturnValue(chain);
    (Attraction.find as jest.Mock).mockReturnValue(chain);
    (Attraction.countDocuments as jest.Mock).mockResolvedValue(1);
    (Attraction.aggregate as jest.Mock).mockImplementation((pipeline: any[]) => Promise.resolve(pipeline.some(stage => stage.$count) ? [{ total: 1 }] : [row]));
    const res = response();
    const next = jest.fn();
    await getAttractions(request(query) as never, res, next);
    expect(next).not.toHaveBeenCalled();
    const [shown] = res.json.mock.calls[0][0].data;
    expect(shown.operator).toEqual({ name: 'Partner operator', relationship: 'partner' });
    for (const field of ['ownerTenantId', 'tenantIds', 'priceFrom', 'pricingOptions']) expect(shown).not.toHaveProperty(field);
    const listQuery = (Attraction.find as jest.Mock).mock.calls[0]?.[0] || (Attraction.aggregate as jest.Mock).mock.calls[0][0][0].$match;
    expect(listQuery.tenantIds).toEqual({ $in: [seller] });
  });

  it.each([{}, { locale: 'en' }])('adds operator to scoped detail in locale %j', async query => {
    const row = tour(supplier);
    (Attraction.findOne as jest.Mock).mockReturnValue({ select: () => ({ lean: async () => row }) });
    (Attraction.aggregate as jest.Mock).mockResolvedValue([row]);
    const res = response();
    const next = jest.fn();
    await getAttractionBySlug(request(query) as never, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].data).toMatchObject({ operator: { name: 'Partner operator', relationship: 'partner' }, bookingTenantSlug: 'sample-site' });
    expect(res.json.mock.calls[0][0].data).not.toHaveProperty('ownerTenantId');
    expect(res.json.mock.calls[0][0].data).not.toHaveProperty('tenantIds');
  });

  it('does not look up any operator when the scoped detail lookup is missing', async () => {
    (Attraction.findOne as jest.Mock).mockReturnValue({ select: () => ({ lean: async () => null }) });
    const res = response();
    await getAttractionBySlug(request() as never, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(Tenant.find).not.toHaveBeenCalled();
    expect(Attraction.findOne).toHaveBeenCalledWith(expect.objectContaining({ tenantIds: { $in: [seller] } }));
  });

  it('does not look up the owner of a cursor lookahead row outside the returned page', async () => {
    (Attraction.aggregate as jest.Mock).mockResolvedValue([tour(), tour(foreign)]);
    (Attraction.countDocuments as jest.Mock).mockResolvedValue(2);
    const res = response();
    const next = jest.fn();
    await getAttractions(request({ pagination: 'cursor', limit: '1' }) as never, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(Tenant.find).toHaveBeenCalledWith({ _id: { $in: [seller] }, status: 'active' });
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
    expect(res.json.mock.calls[0][0].pagination.nextCursor).toEqual(expect.any(String));
  });

  it.each([{}, { locale: 'en' }])('keeps operator disclosure on the featured rail in locale %j', async query => {
    const row = tour(supplier);
    const chain: any = { select: jest.fn(), sort: jest.fn(), limit: jest.fn(), lean: jest.fn().mockResolvedValue([row]) };
    for (const key of ['select', 'sort', 'limit']) chain[key].mockReturnValue(chain);
    (Attraction.find as jest.Mock).mockReturnValue(chain);
    (Attraction.aggregate as jest.Mock).mockResolvedValue([row]);
    const res = response();
    const next = jest.fn();
    await getFeaturedAttractions(request(query) as never, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].data[0].operator).toEqual({ name: 'Partner operator', relationship: 'partner' });
  });

  it.each(['0', '-1', '51', 'unbounded'])('rejects unbounded featured limit %s before reading tours or owners', async limit => {
    const next = jest.fn();
    await getFeaturedAttractions(request({ limit }) as never, response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(Attraction.find).not.toHaveBeenCalled();
    expect(Tenant.find).not.toHaveBeenCalled();
  });

  it.each([{}, { locale: 'en' }])('keeps operator disclosure through the flat-page resolver in locale %j', async query => {
    const row = tour(supplier);
    (Attraction.findOne as jest.Mock).mockReturnValue({ lean: async () => row });
    (Attraction.aggregate as jest.Mock).mockResolvedValue([row]);
    const res = response();
    const next = jest.fn();
    await resolvePage(request({ ...query, slug: row.slug }) as never, res, next);
    expect(next).not.toHaveBeenCalled();
    const result = res.json.mock.calls[0][0].data;
    expect(result.type).toBe('attraction');
    expect(result.attraction.operator).toEqual({ name: 'Partner operator', relationship: 'partner' });
    expect(result.attraction).not.toHaveProperty('tenantIds');
    expect(result.attraction).not.toHaveProperty('ownerTenantId');
  });
});
