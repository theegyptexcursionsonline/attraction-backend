import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { createAdminPage, updateAdminPage, getAdminMenu, updateAdminMenu, getPageSection, listAdminPages } from '../controllers/page.controller';
import { toPublicTenantDto, updateTenantSettings } from '../controllers/tenants.controller';
import { pagePresentationSchema, navigationSchema, pageSectionsSchema, pageSlugSchema, isSafeNavigationHref } from '../utils/siteContent';
import { sanitizePageSections } from '../utils/sanitizeHtml';

jest.mock('../models/Tenant', () => ({ Tenant: { exists: jest.fn(), findById: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn(), aggregate: jest.fn() } }));
jest.mock('../models/Attraction', () => ({ Attraction: { exists: jest.fn(), find: jest.fn(), findOne: jest.fn(), aggregate: jest.fn() } }));
const tenantId = new Types.ObjectId();
const pageId = new Types.ObjectId().toString();
const res = () => { const r: any = {}; r.status = jest.fn().mockReturnValue(r); r.json = jest.fn().mockReturnValue(r); r.setHeader = jest.fn(); return r; };
const req = (more: any = {}): any => ({ tenant: { _id: tenantId }, user: { role: 'brand-admin', assignedTenants: [tenantId] }, body: {}, params: { id: pageId, pageId, sectionId: 'tours' }, query: {}, ...more });
const lean = (data: unknown) => ({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(data) }) });

beforeEach(() => jest.resetAllMocks());

describe('site content input boundaries', () => {
  test.each(['javascript:alert(1)', '//evil.example', '/\\evil.example', '/a\nb', 'https://user:pass@example.com', '/%0aevil', '/a/../admin', '/%2e%2e/admin', '/path?tenant=other', '/path?TenantId=other', 'data:text/html,bad'])('rejects unsafe navigation %s', href => expect(isSafeNavigationHref(href)).toBe(false));
  test.each(['/tours', '/tours?category=desert', 'https://example.com/tours'])('accepts navigation %s', href => expect(isSafeNavigationHref(href)).toBe(true));
  it('bounds menu depth and strips unexpected fields', () => {
    expect(navigationSchema.safeParse(Array.from({ length: 13 }, () => ({ label: 'Tour', href: '/tour' }))).success).toBe(false);
    expect(navigationSchema.parse([{ label: 'Tours', href: '/tours', columns: [{ label: 'Desert', links: [{ label: 'Quad', href: '/quad', secret: 'no' }] }] }])[0].columns![0].links[0]).toEqual({ label: 'Quad', href: '/quad' });
  });
  it('validates section identity, layouts and bounded references', () => {
    expect(pageSectionsSchema.safeParse([{ id: 'same', type: 'content', body: '' }, { id: 'same', type: 'content', body: '' }]).success).toBe(false);
    expect(pageSectionsSchema.safeParse([{ id: 'x', type: 'tours', layout: 'broken' }]).success).toBe(false);
    expect(pageSectionsSchema.safeParse([{ id: 'x', type: 'pages', layout: 'vertical', pageIds: ['wrong'] }]).success).toBe(false);
    expect(pageSlugSchema.safeParse('admin').success).toBe(false);
  });
  it('sanitizes section HTML at the public boundary and excludes drafts and archives', () => {
    const sections = [{ id: 'a', type: 'content', body: '<p>Safe</p><script>bad()</script><a href="javascript:bad()">Go</a>' }];
    const safe = sanitizePageSections(sections);
    expect(JSON.stringify(safe)).not.toMatch(/script|javascript/);
    const dto = toPublicTenantDto({ customPages: [{ slug: 'live', body: '', sections }, { slug: 'draft', body: 'private', isPublished: false }, { slug: 'old', status: 'archived' }], navigationRevision: 3, navigation: [{ label: 'Unsafe', href: 'javascript:bad()' }] });
    expect((dto.customPages as any[]).map(p => p.slug)).toEqual(['live']);
    expect(dto.navigation).toEqual([]);
    expect(dto.navigationRevision).toBe(3);
  });
});

describe('site content authorization and atomic persistence', () => {
  test.each([getAdminMenu, updateAdminMenu, createAdminPage, updateAdminPage, listAdminPages])('rejects cross-tenant handler access', async handler => {
    const response = res();
    await handler(req({ user: { role: 'brand-admin', assignedTenants: [new Types.ObjectId()] } }), response, jest.fn());
    expect(response.status).toHaveBeenCalledWith(403);
    expect(Tenant.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('rejects missing tenant', async () => {
    const response = res(); await getAdminMenu(req({ tenant: undefined }), response, jest.fn());
    expect(response.status).toHaveBeenCalledWith(400);
  });
  it('returns legacy menu revision zero and preserves flat links', async () => {
    (Tenant.findById as jest.Mock).mockReturnValue(lean({ navigation: [{ label: 'Tours', href: '/tours' }] }));
    const response = res(); await getAdminMenu(req(), response, jest.fn());
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ data: { navigation: [{ label: 'Tours', href: '/tours' }], revision: 0 } }));
  });
  it('rejects stale concurrent menu save using an atomic revision filter', async () => {
    (Tenant.findOneAndUpdate as jest.Mock).mockResolvedValueOnce({ navigation: [], navigationRevision: 3 }).mockResolvedValueOnce(null);
    const responses = [res(), res()];
    await Promise.all(responses.map(response => updateAdminMenu(req({ body: { navigation: [], expectedRevision: 2 } }), response, jest.fn())));
    expect(Tenant.findOneAndUpdate).toHaveBeenCalledWith({ _id: tenantId, navigationRevision: 2 }, { $set: { navigation: [] }, $inc: { navigationRevision: 1 } }, expect.anything());
    expect(responses[1].status).toHaveBeenCalledWith(409);
  });
  it('blocks the legacy menu settings bypass', async () => {
    const response = res(); await updateTenantSettings(req({ body: { navigation: [] } }), response, jest.fn());
    expect(response.status).toHaveBeenCalledWith(400);
    expect(Tenant.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('guards concurrent duplicate create at the actual mutation', async () => {
    (Tenant.findOne as jest.Mock).mockReturnValue(lean(null)); (Attraction.findOne as jest.Mock).mockReturnValue(lean(null));
    (Tenant.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
    const response = res(); await createAdminPage(req({ body: { slug: 'desert', body: '<p>Content</p>', title: 'Desert' } }), response, jest.fn());
    expect(Tenant.findOneAndUpdate).toHaveBeenCalledWith({ _id: tenantId, $nor: [{ customPages: { $elemMatch: { slug: 'desert', status: { $ne: 'archived' } } } }] }, expect.anything(), expect.anything());
    expect(response.status).toHaveBeenCalledWith(409);
  });
  it('uses a same-element revision match and distinguishes stale from missing', async () => {
    (Tenant.findOneAndUpdate as jest.Mock).mockResolvedValue(null); (Tenant.exists as jest.Mock).mockResolvedValue({ _id: tenantId });
    const response = res(); await updateAdminPage(req({ body: { expectedRevision: 4, title: 'Changed' } }), response, jest.fn());
    expect(Tenant.findOneAndUpdate).toHaveBeenCalledWith({ _id: tenantId, customPages: { $elemMatch: { _id: pageId, revision: 4 } } }, { $set: { 'customPages.$.title': 'Changed' }, $inc: { 'customPages.$.revision': 1 } }, expect.anything());
    expect(response.status).toHaveBeenCalledWith(409);
  });
});

describe('public section resolution', () => {
  it('requires an active published parent in the tenant database query', async () => {
    (Tenant.findOne as jest.Mock).mockReturnValue(lean(null)); const response = res();
    await getPageSection(req(), response, jest.fn());
    expect(Tenant.findOne).toHaveBeenCalledWith({ _id: tenantId, customPages: { $elemMatch: { _id: pageId, status: { $ne: 'archived' }, isPublished: { $ne: false } } } });
    expect(response.status).toHaveBeenCalledWith(404); expect(Attraction.find).not.toHaveBeenCalled();
  });
  it('keeps explicit tour order, paginates in MongoDB and omits internal fields', async () => {
    const ids = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
    (Tenant.findOne as jest.Mock).mockReturnValue(lean({ customPages: [{ _id: pageId, sections: [{ id: 'tours', type: 'tours', layout: 'vertical', attractionIds: ids.map(String), categoryIds: ['desert'] }] }] }));
    (Attraction.aggregate as jest.Mock).mockResolvedValue(ids.slice(1).map(_id => ({ _id, title: 'Tour' })));
    const response = res(); await getPageSection(req({ query: { limit: 1, cursor: ids[0].toString() } }), response, jest.fn());
    const pipeline = (Attraction.aggregate as jest.Mock).mock.calls[0][0];
    expect(pipeline[0]).toEqual({ $match: { tenantIds: tenantId, status: 'active', category: { $in: ['desert'] }, _id: { $in: ids.slice(1) } } });
    expect(pipeline[1]).toEqual({ $addFields: { __selectionOrder: { $indexOfArray: [ids, '$_id'] } } });
    expect(pipeline[2]).toEqual({ $sort: { __selectionOrder: 1 } });
    expect(pipeline[3]).toEqual({ $limit: 2 });
    expect(pipeline[4].$project).not.toHaveProperty('ownerTenantId');
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ data: { type: 'tours', items: [{ _id: ids[1], title: 'Tour' }], nextCursor: ids[1].toString() } }));
  });
  it('rejects a valid ObjectId cursor from outside an explicit selection', async () => {
    const ids = [new Types.ObjectId(), new Types.ObjectId()];
    (Tenant.findOne as jest.Mock).mockReturnValue(lean({ customPages: [{ _id: pageId, sections: [{ id: 'tours', type: 'tours', layout: 'vertical', attractionIds: ids.map(String) }] }] }));
    const response = res();
    await getPageSection(req({ query: { cursor: new Types.ObjectId().toString() } }), response, jest.fn());
    expect(response.status).toHaveBeenCalledWith(400);
    expect(Attraction.aggregate).not.toHaveBeenCalled();
  });
  it('uses ObjectId cursor pagination for a category-only tour section', async () => {
    const id = new Types.ObjectId();
    (Tenant.findOne as jest.Mock).mockReturnValue(lean({ customPages: [{ _id: pageId, sections: [{ id: 'tours', type: 'tours', layout: 'vertical', categoryIds: ['desert'] }] }] }));
    const chain: any = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ _id: id, title: 'Tour' }]) };
    (Attraction.find as jest.Mock).mockReturnValue(chain);
    const response = res(); await getPageSection(req({ query: { cursor: id.toString() } }), response, jest.fn());
    expect(Attraction.find).toHaveBeenCalledWith({ tenantIds: tenantId, status: 'active', category: { $in: ['desert'] }, _id: { $gt: id.toString() } });
    expect(chain.select.mock.calls[0][0]).not.toMatch(/ownerTenant|reseller|createdBy/);
  });
  it('preserves selected page order and hides cross-tenant, draft and archived references', async () => {
    const second = new Types.ObjectId().toString(), draft = new Types.ObjectId().toString();
    (Tenant.findOne as jest.Mock).mockReturnValue(lean({ customPages: [{ _id: pageId, title: 'A', slug: 'a', sections: [{ id: 'tours', type: 'pages', pageIds: [second, draft, new Types.ObjectId().toString(), pageId] }] }, { _id: second, title: 'B', slug: 'b' }, { _id: draft, title: 'Private', isPublished: false }] }));
    const response = res(); await getPageSection(req(), response, jest.fn());
    expect(response.json.mock.calls[0][0].data.items.map((p: any) => p.title)).toEqual(['B', 'A']);
  });
  it('passes provider failures to error handling instead of pretending no results', async () => {
    (Tenant.findOne as jest.Mock).mockImplementation(() => { throw new Error('DB unavailable'); });
    const next = jest.fn(); await getPageSection(req(), res(), next); expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
  it('paginates page-picker tail and literal search in the database', async () => {
    (Tenant.aggregate as jest.Mock).mockResolvedValue([{ items: [{ slug: 'tail' }], total: [{ count: 101 }] }]);
    const response = res(); await listAdminPages(req({ query: { page: 6, limit: 20, search: 'a.b' } }), response, jest.fn());
    const pipeline = (Tenant.aggregate as jest.Mock).mock.calls[0][0];
    expect(pipeline[0]).toEqual({ $match: { _id: tenantId } });
    expect(pipeline[2].$match.$or[0]['customPages.title'].$regex).toBe('a\\.b');
    expect(pipeline[4].$facet.items[0]).toEqual({ $skip: 100 });
    expect(response.json.mock.calls[0][0].pagination).toEqual({ page: 6, limit: 20, total: 101, totalPages: 6 });
  });
});


describe('page presentation authoring', () => {
  test.each(['http://images.example/a.jpg', '//images.example/a.jpg', 'javascript:alert(1)', 'https://user:password@images.example/a.jpg', 'https://images.example/\\bad'])('rejects unsafe image URL %s', heroImage => {
    expect(pagePresentationSchema.safeParse({ heroImage }).success).toBe(false);
  });
  it('accepts clearable authored fields and rejects invalid mode or oversized description', () => {
    expect(pagePresentationSchema.parse({ heroImage: '', heroDescription: '' })).toEqual({ heroImage: '', heroDescription: '' });
    expect(pagePresentationSchema.parse({ heroImage: 'https://images.example/a.jpg', layoutMode: 'standalone', heroDescription: ' Authored ' }).heroDescription).toBe('Authored');
    expect(pagePresentationSchema.safeParse({ layoutMode: 'other' }).success).toBe(false);
    expect(pagePresentationSchema.safeParse({ heroDescription: 'a'.repeat(1001) }).success).toBe(false);
    expect(pagePresentationSchema.parse({})).toEqual({});
  });
  it('preserves omitted presentation values and clears explicitly within revision guard', async () => {
    (Tenant.findOneAndUpdate as jest.Mock).mockResolvedValue({ customPages: [{ _id: pageId, revision: 4 }] });
    await updateAdminPage(req({ body: { title: 'Changed', expectedRevision: 3 } }), res(), jest.fn());
    const [filter, write] = (Tenant.findOneAndUpdate as jest.Mock).mock.calls[0];
    expect(filter.customPages.$elemMatch).toEqual({ _id: pageId, revision: 3 });
    expect(write.$set).toEqual({ 'customPages.$.title': 'Changed' });
    await updateAdminPage(req({ body: { heroImage: '', heroDescription: '', layoutMode: 'website', expectedRevision: 4 } }), res(), jest.fn());
    expect((Tenant.findOneAndUpdate as jest.Mock).mock.calls[1][1].$set).toEqual({ 'customPages.$.heroImage': '', 'customPages.$.heroDescription': '', 'customPages.$.layoutMode': 'website' });
  });
  it('never substitutes SEO metadata for visible page-card content', async () => {
    const linked = new Types.ObjectId().toString();
    (Tenant.findOne as jest.Mock).mockReturnValue(lean({ customPages: [{ _id: pageId, sections: [{ id: 'tours', type: 'pages', pageIds: [linked, pageId] }] }, { _id: linked, slug: 'linked', title: 'Linked', metaDescription: 'SEO only', heroDescription: 'Authored', heroImage: 'https://images.example/a.jpg' }] }));
    const response = res(); await getPageSection(req(), response, jest.fn());
    const items = response.json.mock.calls[0][0].data.items;
    expect(items[0]).toEqual({ _id: linked, slug: 'linked', title: 'Linked', shortDescription: 'Authored', images: ['https://images.example/a.jpg'] });
    expect(items[1].shortDescription).toBe('');
    expect(items[1].images).toEqual([]);
    expect(JSON.stringify(items)).not.toContain('SEO only');
  });
});
