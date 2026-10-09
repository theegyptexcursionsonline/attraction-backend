/**
 * Admin section access (tours, attractions, packages, bundles) per brand and per team member.
 * A member may use a section only when their own list allows it and a brand they work for has it
 * switched on; super admins keep every section.
 */
import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { AuthRequest } from '../types';
import { effectiveSections, listingTypesForSections, sectionForListingType } from '../utils/sectionAccess';
import { requireListingSection, requireSection } from '../middleware/section.middleware';

jest.mock('../models/Tenant', () => ({ Tenant: { find: jest.fn() } }));
jest.mock('../models/Attraction', () => ({ Attraction: { findById: jest.fn() } }));

const brandA = new Types.ObjectId();
const brandB = new Types.ObjectId();

const installBrands = (brands: Array<{ _id: Types.ObjectId; slug?: string; enabledSections?: string[] }>) => {
  (Tenant.find as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(brands) }),
  });
};

const installListing = (listingType?: string) => {
  (Attraction.findById as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(listingType === undefined ? null : { listingType }) }),
  });
};

const request = (user: Record<string, unknown>, extra: Record<string, unknown> = {}): AuthRequest =>
  ({ body: {}, params: {}, query: {}, headers: {}, user, ...extra } as unknown as AuthRequest);

const run = async (middleware: ReturnType<typeof requireSection>, req: AuthRequest) => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  const next = jest.fn();
  await middleware(req, res, next);
  return { res, next };
};

describe('effectiveSections', () => {
  it('gives a super admin every section whatever is stored', () => {
    expect(effectiveSections({ role: 'super-admin', sectionAccess: [] }, [{ enabledSections: [] }]))
      .toEqual(['tours', 'attractions', 'packages', 'bundles']);
  });

  it('keeps every section for members and brands saved before section access', () => {
    expect(effectiveSections({ role: 'manager' }, [{}])).toEqual(['tours', 'attractions', 'packages', 'bundles']);
  });

  it('intersects the member list with the union of their brands', () => {
    expect(effectiveSections(
      { role: 'manager', sectionAccess: ['tours', 'packages', 'bundles'] },
      [{ enabledSections: ['tours'] }, { enabledSections: ['packages', 'attractions'] }],
    )).toEqual(['tours', 'packages']);
  });

  it('maps listing types to sections and back', () => {
    expect(sectionForListingType(undefined)).toBe('tours');
    expect(sectionForListingType('attraction')).toBe('attractions');
    expect(sectionForListingType('package')).toBe('packages');
    expect(listingTypesForSections(['packages', 'bundles'])).toEqual(['package']);
  });
});

describe('requireSection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lets a super admin through without reading brands', async () => {
    const { next } = await run(requireSection('bundles'), request({ role: 'super-admin', sectionAccess: [] }));
    expect(next).toHaveBeenCalledWith();
    expect(Tenant.find).not.toHaveBeenCalled();
  });

  it('refuses a member whose own access leaves the section out', async () => {
    installBrands([{ _id: brandA }]);
    const { res, next } = await run(requireSection('packages'), request({ role: 'manager', assignedTenants: [brandA], sectionAccess: ['tours'] }));
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('refuses when the brand being worked in has the section switched off', async () => {
    installBrands([{ _id: brandA, slug: 'a', enabledSections: ['tours'] }, { _id: brandB, slug: 'b' }]);
    const req = request({ role: 'brand-admin', assignedTenants: [brandA, brandB] }, { headers: { 'x-tenant-id': 'a' } });
    const { res } = await run(requireSection('bundles'), req);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows a section another assigned brand has on when no brand is selected', async () => {
    installBrands([{ _id: brandA, enabledSections: ['tours'] }, { _id: brandB }]);
    const { next } = await run(requireSection('bundles'), request({ role: 'brand-admin', assignedTenants: [brandA, brandB] }));
    expect(next).toHaveBeenCalledWith();
  });
});

describe('requireListingSection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('checks the requested type on create', async () => {
    installBrands([{ _id: brandA }]);
    const req = request({ role: 'editor', assignedTenants: [brandA], sectionAccess: ['tours'] }, { body: { productType: 'attraction-ticket' } });
    const { res } = await run(requireListingSection, req);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('checks the stored type on a change', async () => {
    installBrands([{ _id: brandA }]);
    installListing('package');
    const req = request({ role: 'editor', assignedTenants: [brandA], sectionAccess: ['tours'] }, { params: { id: String(new Types.ObjectId()) } });
    const { res } = await run(requireListingSection, req);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('lets an unknown listing through so the handler answers 404', async () => {
    installBrands([{ _id: brandA }]);
    installListing(undefined);
    const req = request({ role: 'editor', assignedTenants: [brandA], sectionAccess: ['tours'] }, { params: { id: String(new Types.ObjectId()) } });
    const { next } = await run(requireListingSection, req);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('requireListingSection on the brands a listing is put on', () => {
  beforeEach(() => jest.clearAllMocks());

  // A member of two brands, working in All Assigned Sites (no brand named on the request), where
  // the request check passes on the union of their brands.
  const member = { role: 'manager', assignedTenants: [brandA, brandB] };
  const toursOnlyAndFull = () => installBrands([
    { _id: brandA, slug: 'a', name: 'Tours Only', enabledSections: ['tours'] } as never,
    { _id: brandB, slug: 'b', name: 'Every Section' } as never,
  ]);
  const installStored = (listingType: string, tenantIds: Types.ObjectId[]) => {
    (Attraction.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ listingType, tenantIds }) }),
    });
  };

  it('refuses creating a package on a brand that has packages switched off', async () => {
    toursOnlyAndFull();
    const req = request(member, { body: { listingType: 'package', tenantIds: [String(brandA)] } });
    const { res, next } = await run(requireListingSection, req);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].error).toBe('Tours Only has Packages switched off. Ask a super admin to switch it on.');
  });

  it('refuses when only one of the chosen brands has the section on', async () => {
    toursOnlyAndFull();
    const req = request(member, { body: { listingType: 'package', tenantIds: [String(brandB), String(brandA)] } });
    const { res } = await run(requireListingSection, req);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows creating a package on a brand that has packages on', async () => {
    toursOnlyAndFull();
    const req = request(member, { body: { listingType: 'package', tenantIds: [String(brandB)] } });
    const { next } = await run(requireListingSection, req);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows a tour on the tours-only brand', async () => {
    toursOnlyAndFull();
    const req = request(member, { body: { tenantIds: [String(brandA)] } });
    const { next } = await run(requireListingSection, req);
    expect(next).toHaveBeenCalledWith();
  });

  it('refuses adding a brand with the section switched off to an existing listing', async () => {
    toursOnlyAndFull();
    installStored('package', [brandB]);
    const req = request(member, { params: { id: String(new Types.ObjectId()) }, body: { tenantIds: [String(brandB), String(brandA)] } });
    const { res } = await run(requireListingSection, req);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('lets a change keep the brands a listing is already on', async () => {
    toursOnlyAndFull();
    installStored('package', [brandA, brandB]);
    const req = request(member, { params: { id: String(new Types.ObjectId()) }, body: { title: 'Renamed', tenantIds: [String(brandA), String(brandB)] } });
    const { next } = await run(requireListingSection, req);
    expect(next).toHaveBeenCalledWith();
  });

  it('ignores brands the member does not work for (the handler refuses those)', async () => {
    toursOnlyAndFull();
    const stranger = String(new Types.ObjectId());
    const req = request(member, { body: { listingType: 'package', tenantIds: [String(brandB), stranger] } });
    const { next } = await run(requireListingSection, req);
    expect(next).toHaveBeenCalledWith();
  });

  it('lets a super admin put any listing on any brand', async () => {
    toursOnlyAndFull();
    const req = request({ role: 'super-admin' }, { body: { listingType: 'package', tenantIds: [String(brandA)] } });
    const { next } = await run(requireListingSection, req);
    expect(next).toHaveBeenCalledWith();
    expect(Tenant.find).not.toHaveBeenCalled();
  });
});
