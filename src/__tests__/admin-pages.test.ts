import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { archiveAdminPage, createAdminPage, resolvePage, restoreAdminPage, trashAdminPage, unarchiveAdminPage, updateAdminPage } from '../controllers/page.controller';

jest.mock('../models/Attraction', () => ({ Attraction: { exists: jest.fn(), findOne: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: { exists: jest.fn(), findOne: jest.fn(), findById: jest.fn(), findByIdAndUpdate: jest.fn(), findOneAndUpdate: jest.fn() } }));

const response = () => { const res: any = {}; res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res); return res; };
/** Supports both `findOne(...).lean()` and `findOne(...).select(...).lean()`. */
const chain = (value: unknown) => ({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }), lean: jest.fn().mockResolvedValue(value) });
const message = (res: any) => res.json.mock.calls.at(-1)?.[0]?.error as string;
const freeUrl = () => {
  (Tenant.findOne as jest.Mock).mockReturnValue(chain(null));
  (Attraction.findOne as jest.Mock).mockReturnValue(chain(null));
};

describe('tenant page management', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a sanitized landing page only in the explicitly selected assigned site', async () => {
    const tenantId = new Types.ObjectId();
    freeUrl();
    (Tenant.findOneAndUpdate as jest.Mock).mockResolvedValue({ customPages: [{ _id: 'page-1', title: 'Family Tours' }] });
    const res = response();
    await createAdminPage({
      tenant: { _id: tenantId }, user: { role: 'brand-admin', assignedTenants: [tenantId] },
      body: { slug: 'family-tours', title: 'Family Tours', body: '<p>Safe</p><script>bad()</script>', pageType: 'category', parentPath: '/', categoryIds: ['family'] },
    } as never, res, jest.fn());

    expect(Tenant.findOneAndUpdate).toHaveBeenCalledWith({ _id: tenantId, $nor: [{ customPages: { $elemMatch: { slug: 'family-tours', status: { $ne: 'archived' } } } }] }, expect.objectContaining({
      $push: { customPages: expect.objectContaining({ slug: 'family-tours', body: '<p>Safe</p>', isPublished: true }) },
    }), expect.anything());
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('preserves an explicit draft and excludes it from the public resolver', async () => {
    const tenantId = new Types.ObjectId();
    freeUrl();
    (Tenant.findOneAndUpdate as jest.Mock).mockResolvedValue({ customPages: [{ _id: 'page-draft', title: 'Draft' }] });
    await createAdminPage({
      tenant: { _id: tenantId }, user: { role: 'brand-admin', assignedTenants: [tenantId] },
      body: { slug: 'draft-page', title: 'Draft', body: '<p>Not live</p>', pageType: 'attraction', parentPath: '/', isPublished: false },
    } as never, response(), jest.fn());

    expect(Tenant.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ _id: tenantId }), expect.objectContaining({
      $push: { customPages: expect.objectContaining({ isPublished: false }) },
    }), expect.anything());

    (Attraction.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    (Tenant.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ customPages: [{ slug: 'draft-page', title: 'Draft', body: '<p>Not live</p>', status: 'active', isPublished: false }] }),
      }),
    });
    const res = response();
    await resolvePage({ tenant: { _id: tenantId }, query: { slug: 'draft-page' } } as never, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { type: 'none' } }));
  });

  it('names the tour holding a page URL instead of writing over it', async () => {
    const tenantId = new Types.ObjectId();
    (Tenant.findOne as jest.Mock).mockReturnValue(chain(null));
    (Attraction.findOne as jest.Mock).mockReturnValue(chain({ _id: 'tour-1', title: 'Hurghada Jeep Safari' }));
    const res = response();
    await createAdminPage({ tenant: { _id: tenantId }, user: { role: 'super-admin' }, body: { slug: 'existing-tour', title: 'Existing', body: 'x' } } as never, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(message(res)).toContain('Hurghada Jeep Safari');
    expect(Tenant.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Attraction.findOne).toHaveBeenCalledWith(expect.objectContaining({ status: { $ne: 'archived' } }));
  });

  it('lets a retired page or tour release its URL for a new page', async () => {
    const tenantId = new Types.ObjectId();
    freeUrl();
    (Tenant.findOneAndUpdate as jest.Mock).mockResolvedValue({ customPages: [{ _id: 'page-new', title: 'Jeep Safari' }] });
    const res = response();
    await createAdminPage({
      tenant: { _id: tenantId }, user: { role: 'super-admin' },
      body: { slug: 'hurghada-jeep-safari', title: 'Jeep Safari', body: '<p>New page</p>' },
    } as never, res, jest.fn());

    // Both ownership lookups skip retired records, so a deleted page or tour cannot block the URL.
    expect(Tenant.findOne).toHaveBeenCalledWith({ _id: tenantId, customPages: { $elemMatch: { slug: 'hurghada-jeep-safari', status: { $ne: 'archived' } } } });
    expect(Attraction.findOne).toHaveBeenCalledWith({ tenantIds: tenantId, status: { $ne: 'archived' }, $or: [{ pathSlug: 'hurghada-jeep-safari' }, { slug: 'hurghada-jeep-safari' }] });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects a conflicting URL when an existing page is edited', async () => {
    const tenantId = new Types.ObjectId();
    const pageId = new Types.ObjectId().toString();
    (Tenant.findOne as jest.Mock).mockReturnValue(chain({ customPages: [{ _id: 'other-page', slug: 'already-used', title: 'Contact us' }] }));
    (Attraction.findOne as jest.Mock).mockReturnValue(chain(null));
    const res = response();
    await updateAdminPage({
      tenant: { _id: tenantId },
      user: { role: 'brand-admin', assignedTenants: [tenantId] },
      params: { id: pageId },
      body: { slug: 'already-used', expectedRevision: 0 },
    } as never, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(message(res)).toContain('Contact us');
    expect(Tenant.findOne).toHaveBeenCalledWith({ _id: tenantId, customPages: { $elemMatch: { slug: 'already-used', status: { $ne: 'archived' }, _id: { $ne: pageId } } } });
    expect(Tenant.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('keeps Archive and Trash as distinct recoverable lifecycle states', async () => {
    const tenantId = new Types.ObjectId();
    (Tenant.findOneAndUpdate as jest.Mock).mockResolvedValue({ customPages: [] });
    const base = { tenant: { _id: tenantId }, user: { role: 'brand-admin', assignedTenants: [tenantId] }, params: { id: new Types.ObjectId().toString() } };
    await archiveAdminPage(base as never, response(), jest.fn());
    await trashAdminPage(base as never, response(), jest.fn());

    const archiveUpdate = (Tenant.findOneAndUpdate as jest.Mock).mock.calls[0][1];
    const trashUpdate = (Tenant.findOneAndUpdate as jest.Mock).mock.calls[1][1];
    expect(archiveUpdate.$set['customPages.$.archivedAt']).toBeInstanceOf(Date);
    expect(archiveUpdate.$unset['customPages.$.trashedAt']).toBe(1);
    expect(trashUpdate.$set['customPages.$.trashedAt']).toBeInstanceOf(Date);
    expect(trashUpdate.$unset['customPages.$.archivedAt']).toBe(1);
  });

  it('refuses to restore a retired page onto a URL another page now serves', async () => {
    const tenantId = new Types.ObjectId();
    const pageId = new Types.ObjectId().toString();
    (Tenant.findOne as jest.Mock)
      .mockReturnValueOnce(chain({ customPages: [{ _id: pageId, slug: 'jeep-safari', title: 'Old jeep page', status: 'archived' }] }))
      .mockReturnValueOnce(chain({ customPages: [{ _id: 'live-page', slug: 'jeep-safari', title: 'Jeep Safari', status: 'active' }] }));
    (Attraction.findOne as jest.Mock).mockReturnValue(chain(null));
    const res = response();
    await restoreAdminPage({ tenant: { _id: tenantId }, user: { role: 'super-admin' }, params: { id: pageId } } as never, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(message(res)).toContain('Jeep Safari');
    expect(message(res)).toContain('Old jeep page');
    expect(Tenant.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('restores a retired page when its URL is still free', async () => {
    const tenantId = new Types.ObjectId();
    const pageId = new Types.ObjectId().toString();
    (Tenant.findOne as jest.Mock)
      .mockReturnValueOnce(chain({ customPages: [{ _id: pageId, slug: 'jeep-safari', title: 'Old jeep page', status: 'archived' }] }))
      .mockReturnValueOnce(chain(null));
    (Attraction.findOne as jest.Mock).mockReturnValue(chain(null));
    (Tenant.findOneAndUpdate as jest.Mock).mockResolvedValue({ customPages: [] });
    const res = response();
    await unarchiveAdminPage({ tenant: { _id: tenantId }, user: { role: 'super-admin' }, params: { id: pageId } } as never, res, jest.fn());

    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(Tenant.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: tenantId }),
      expect.objectContaining({ $set: { 'customPages.$.status': 'active' } }),
      expect.anything(),
    );
  });
});


it('exposes authored presentation independently from metadata in the public resolver', async () => {
  const tenantId = new Types.ObjectId();
  (Attraction.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
  const page = { slug: 'landing', title: 'Landing', body: '<p>Body</p>', metaDescription: 'SEO only', heroDescription: 'Authored intro', heroImage: 'https://images.example/hero.jpg', layoutMode: 'standalone' };
  (Tenant.findById as jest.Mock).mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ customPages: [page] }) }) });
  const res = response(); await resolvePage({ tenant: { _id: tenantId }, query: { slug: 'landing' } } as never, res, jest.fn());
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { type: 'page', page } }));
});
