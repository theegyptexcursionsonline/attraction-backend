/**
 * GET /tenants is the admin Sites list. The admin now takes its totals, pages and search from
 * this endpoint (client report, 9 Oct 2026: 55 sites but the page counted 50 and hid the rest),
 * so the endpoint itself must scope every page, total and search to the caller's brands, keep
 * the tail reachable, and find a site by the domain the admin shows for it.
 */
import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Tenant } from '../models/Tenant';
import { getTenants } from '../controllers/tenants.controller';
import { AuthRequest } from '../types';

jest.setTimeout(120_000);

let mongo: MongoMemoryServer;

type Row = { _id: Types.ObjectId; slug: string; name: string; domain: string; customDomain?: string; status: string };
const site = (index: number, overrides: Partial<Row> = {}): Row => {
  const slug = `alpha-tours-${String(index).padStart(2, '0')}`;
  return { _id: new Types.ObjectId(), slug, name: `Alpha Tours ${String(index).padStart(2, '0')}`, domain: `${slug}.foxesnetwork.com`, status: 'active', ...overrides };
};
// 55 brands like production: 53 active, one inactive, one coming soon; five sort after the 50th.
const sites: Row[] = [
  ...Array.from({ length: 50 }, (_, index) => site(index + 1, index === 6 ? { status: 'inactive' } : index === 22 ? { status: 'coming_soon' } : {})),
  site(51, { slug: 'safari-sahara-hurghada', name: 'Safari Sahara Hurghada', domain: 'safari-sahara-hurghada.foxesnetwork.com', customDomain: 'safari-sahara.com' }),
  site(52, { slug: 'sea-horse-sahl-hashesh', name: 'Sea Horse Sahl Hashesh', domain: 'sea-horse-sahl-hashesh.foxesnetwork.com' }),
  site(53, { slug: 'sharm-dinner-cruise', name: 'Sharm Dinner Cruise', domain: 'sharm-dinner-cruise.foxesnetwork.com', customDomain: 'sharmdinnercruise.com' }),
  site(54, { slug: 'splash-speedboat-hurghada', name: 'Splash Speedboat Hurghada', domain: 'splash-speedboat-hurghada.foxesnetwork.com', customDomain: 'splashspeedboathurghada.com' }),
  site(55, { slug: 'the-great-pyramids-of-giza', name: 'The Great Pyramids of Giza', domain: 'the-great-pyramids-of-giza.foxesnetwork.com', customDomain: 'pyramidsofgiza.com' }),
];
const byName = (name: string) => sites.find((row) => row.name === name)!;
const superAdmin = { _id: new Types.ObjectId(), role: 'super-admin', assignedTenants: [] };
// A brand admin on three brands, one of them inactive.
const brandAdmin = {
  _id: new Types.ObjectId(),
  role: 'brand-admin',
  assignedTenants: [byName('Alpha Tours 07')._id, byName('Safari Sahara Hurghada')._id, byName('The Great Pyramids of Giza')._id],
};

const list = async (caller: Record<string, unknown>, query: Record<string, unknown>) => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  const next = jest.fn();
  await getTenants({ query: { page: 1, limit: 20, ...query }, user: caller } as unknown as AuthRequest, res, next);
  expect(next).not.toHaveBeenCalled();
  const body = res.json.mock.calls[0][0];
  return { names: (body.data as Array<{ name: string }>).map((row) => row.name), pagination: body.pagination };
};

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  mongo = await MongoMemoryServer.create(systemBinary ? { binary: { systemBinary } } : {});
  await mongoose.connect(mongo.getUri('tenant_list_scope'));
  await Tenant.collection.insertMany(sites);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

describe('admin site list (GET /tenants)', () => {
  it('counts every site for a super admin and reaches the last page', async () => {
    const first = await list(superAdmin, { page: 1, limit: 24 });
    expect(first.pagination).toMatchObject({ page: 1, limit: 24, total: 55, totalPages: 3 });
    expect(first.names).toHaveLength(24);

    const seen = new Set(first.names);
    for (const page of [2, 3]) (await list(superAdmin, { page, limit: 24 })).names.forEach((name) => seen.add(name));
    expect(seen.size).toBe(55);
    const last = await list(superAdmin, { page: 3, limit: 24 });
    expect(last.names).toEqual([
      'Alpha Tours 49', 'Alpha Tours 50', 'Safari Sahara Hurghada', 'Sea Horse Sahl Hashesh',
      'Sharm Dinner Cruise', 'Splash Speedboat Hurghada', 'The Great Pyramids of Giza',
    ]);
  });

  it('counts one status in the database', async () => {
    expect((await list(superAdmin, { limit: 1, status: 'active' })).pagination.total).toBe(53);
    expect((await list(superAdmin, { limit: 1, status: 'inactive' })).pagination.total).toBe(1);
    expect((await list(superAdmin, { limit: 1, status: 'coming_soon' })).names).toEqual(['Alpha Tours 23']);
  });

  it('finds a site by the domain the admin shows for it', async () => {
    expect((await list(superAdmin, { search: 'pyramidsofgiza.com' })).names).toEqual(['The Great Pyramids of Giza']);
    expect((await list(superAdmin, { search: 'SAFARI-SAHARA.COM' })).names).toEqual(['Safari Sahara Hurghada']);
    // Name, slug and network address still match.
    expect((await list(superAdmin, { search: 'Splash' })).names).toEqual(['Splash Speedboat Hurghada']);
    expect((await list(superAdmin, { search: 'sea-horse-sahl' })).names).toEqual(['Sea Horse Sahl Hashesh']);
    expect((await list(superAdmin, { search: 'sharm-dinner-cruise.foxesnetwork' })).names).toEqual(['Sharm Dinner Cruise']);
  });

  it('treats the search as literal text, never a pattern', async () => {
    expect((await list(superAdmin, { search: '.*' })).pagination.total).toBe(0);
    expect((await list(superAdmin, { search: 'pyramidsofgiza\\.com' })).pagination.total).toBe(0);
  });

  it('scopes a brand admin\'s pages, totals and search to their own brands', async () => {
    const all = await list(brandAdmin, { limit: 24 });
    expect(all.pagination).toMatchObject({ total: 3, totalPages: 1 });
    expect(all.names).toEqual(['Alpha Tours 07', 'Safari Sahara Hurghada', 'The Great Pyramids of Giza']);
    expect((await list(brandAdmin, { limit: 1, status: 'active' })).pagination.total).toBe(2);

    // Another brand's name or domain finds nothing and reveals nothing.
    for (const search of ['Splash Speedboat', 'splashspeedboathurghada.com', 'Sharm']) {
      const found = await list(brandAdmin, { search });
      expect(found.pagination.total).toBe(0);
      expect(found.names).toEqual([]);
    }
    expect((await list(brandAdmin, { search: 'pyramidsofgiza.com' })).names).toEqual(['The Great Pyramids of Giza']);
  });

  it('scopes every other admin role the same way', async () => {
    for (const role of ['manager', 'editor', 'viewer']) {
      const caller = { _id: new Types.ObjectId(), role, assignedTenants: [byName('Sharm Dinner Cruise')._id] };
      const found = await list(caller, { limit: 24 });
      expect(found.names).toEqual(['Sharm Dinner Cruise']);
      expect(found.pagination.total).toBe(1);
    }
  });

  it('shows nothing to an admin with no brands', async () => {
    const caller = { _id: new Types.ObjectId(), role: 'brand-admin', assignedTenants: [] };
    const found = await list(caller, { limit: 24 });
    expect(found.pagination.total).toBe(0);
    expect(found.names).toEqual([]);
  });
});
