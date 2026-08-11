import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { archiveAdminPage, createAdminPage, trashAdminPage } from '../controllers/page.controller';

jest.mock('../models/Attraction', () => ({ Attraction: { exists: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: { exists: jest.fn(), findByIdAndUpdate: jest.fn(), findOneAndUpdate: jest.fn() } }));

const response = () => { const res: any = {}; res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res); return res; };

describe('tenant page management', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a sanitized landing page only in the explicitly selected assigned site', async () => {
    const tenantId = new Types.ObjectId();
    (Tenant.exists as jest.Mock).mockResolvedValue(null);
    (Attraction.exists as jest.Mock).mockResolvedValue(null);
    (Tenant.findByIdAndUpdate as jest.Mock).mockResolvedValue({ customPages: [{ _id: 'page-1', title: 'Family Tours' }] });
    const res = response();
    await createAdminPage({
      tenant: { _id: tenantId }, user: { role: 'brand-admin', assignedTenants: [tenantId] },
      body: { slug: 'family-tours', title: 'Family Tours', body: '<p>Safe</p><script>bad()</script>', pageType: 'category', parentPath: '/', categoryIds: ['family'] },
    } as never, res, jest.fn());

    expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(tenantId, expect.objectContaining({
      $push: { customPages: expect.objectContaining({ slug: 'family-tours', body: '<p>Safe</p>' }) },
    }), expect.anything());
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('rejects a page URL that collides with an existing tour before writing', async () => {
    const tenantId = new Types.ObjectId();
    (Tenant.exists as jest.Mock).mockResolvedValue(null);
    (Attraction.exists as jest.Mock).mockResolvedValue({ _id: 'tour-1' });
    const res = response();
    await createAdminPage({ tenant: { _id: tenantId }, user: { role: 'super-admin' }, body: { slug: 'existing-tour', title: 'Existing', body: 'x' } } as never, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(Tenant.findByIdAndUpdate).not.toHaveBeenCalled();
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
});
