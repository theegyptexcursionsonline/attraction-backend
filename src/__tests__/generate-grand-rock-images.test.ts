import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GRAND_ROCK_TOURS } from '../scripts/seed-grand-rock-safari';
import { GRAND_ROCK_IMAGE_PLAN, assertOwnership, casFilter, nextGallery, main, assetDigest } from '../scripts/generate-grand-rock-images';
import { connectDatabase } from '../config/database';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { uploadBase64Image } from '../services/upload.service';

jest.mock('../config/database', () => ({ connectDatabase: jest.fn(), disconnectDatabase: jest.fn() }));
jest.mock('../services/upload.service', () => ({ uploadBase64Image: jest.fn() }));
const id = '123456789012345678901234';
const fence = ['--confirm-tenant=grand-rock-safari', '--confirm-assets=generated-only'];
const slugs = [...new Set(GRAND_ROCK_IMAGE_PLAN.filter(row => row.target !== 'hero').map(row => row.target))];
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const query = (value: unknown) => ({ select: () => ({ lean: async () => value }) });
let dir: string;
let tenant: Record<string, unknown>;
let tours: Record<string, any>[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grand-rock-images-'));
  tenant = { _id: id, heroImages: ['https://res.cloudinary.com/operator-hero.jpg'] };
  tours = slugs.map((slug, index) => ({ _id: `12345678901234567890${String(index).padStart(4, '0')}`, slug, status: 'active', ownerTenantId: id, tenantIds: [id], images: [`https://res.cloudinary.com/real-${slug}.jpg`] }));
  jest.spyOn(Tenant, 'findOne').mockImplementation(() => query(tenant) as any);
  jest.spyOn(Attraction, 'find').mockImplementation(() => query(tours) as any);
  jest.spyOn(Attraction, 'findOne').mockImplementation((filter: any) => query(tours.find(tour => tour._id === filter._id)) as any);
  jest.spyOn(Attraction, 'updateOne').mockImplementation((async (filter: any, update: any) => {
    const tour = tours.find(row => row._id === filter._id)!;
    if (JSON.stringify(tour.images) !== JSON.stringify(filter.images) || (filter.imageAltTexts?.$exists === false ? tour.imageAltTexts !== undefined : JSON.stringify(tour.imageAltTexts) !== JSON.stringify(filter.imageAltTexts))) return { modifiedCount: 0 } as any;
    Object.assign(tour, update.$set); if (update.$unset) delete tour.imageAltTexts;
    return { modifiedCount: 1 } as any;
  }) as any);
  jest.spyOn(Tenant, 'updateOne').mockImplementation((async (filter: any, update: any) => {
    if (JSON.stringify(tenant.heroImages) !== JSON.stringify(filter.heroImages)) return { modifiedCount: 0 } as any;
    Object.assign(tenant, update.$set); return { modifiedCount: 1 } as any;
  }) as any);
  jest.spyOn(Attraction, 'exists').mockImplementation((async (filter: any) => {
    const tour = tours.find(row => row._id === filter._id);
    return tour && JSON.stringify(tour.images) === JSON.stringify(filter.images) && (filter.imageAltTexts?.$exists === false ? tour.imageAltTexts === undefined : JSON.stringify(tour.imageAltTexts) === JSON.stringify(filter.imageAltTexts)) ? { _id: tour._id } : null;
  }) as any);
  jest.spyOn(Tenant, 'exists').mockImplementation((async (filter: any) => JSON.stringify(tenant.heroImages) === JSON.stringify(filter.heroImages) ? { _id: id } : null) as any);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.mocked(uploadBase64Image).mockImplementation(async (_data, _folder, options) => ({ url: `https://res.cloudinary.com/demo/image/upload/attractions-network/tours/grand-rock-safari/generated/${options!.publicId}.jpg` }) as any);
});
afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); rmSync(dir, { recursive: true, force: true }); });
const run = (mode: string, extra: string[] = []) => main([mode, ...fence, `--out=${dir}`, ...extra]);
async function stage() { await run('--check'); for (const item of GRAND_ROCK_IMAGE_PLAN) writeFileSync(join(dir, `${item.key}.jpg`), jpeg); await run('--stage'); return JSON.parse(readFileSync(join(dir, 'receipt.json'), 'utf8')); }

describe('Grand Rock original image pipeline', () => {
  it('plans twenty assets only for real sold experiences and preserves the fishing gallery', () => {
    expect(GRAND_ROCK_IMAGE_PLAN).toHaveLength(20);
    expect(new Set(GRAND_ROCK_IMAGE_PLAN.map(row => row.key)).size).toBe(20);
    expect(slugs.every(slug => GRAND_ROCK_TOURS.some(tour => tour.slug === slug))).toBe(true);
    expect(slugs).not.toContain('private-speed-boat-fishing-sahl-hasheesh');
    expect(GRAND_ROCK_IMAGE_PLAN.every(row => row.alt.startsWith('Illustrative image: '))).toBe(true);
  });
  it('default dry run connects to no provider or database', async () => {
    await main([]); expect(connectDatabase).not.toHaveBeenCalled(); expect(uploadBase64Image).not.toHaveBeenCalled();
  });
  it('rejects missing fences and multiple phases before connecting', async () => {
    await expect(main(['--apply'])).rejects.toThrow('fences');
    await expect(main(['--check', '--stage'])).rejects.toThrow('one phase');
    expect(connectDatabase).not.toHaveBeenCalled();
  });
  it('rejects foreign, shared and inactive records', () => {
    for (const record of [{ ownerTenantId: 'other', tenantIds: [id], status: 'active' }, { ownerTenantId: id, tenantIds: [id, 'other'], status: 'active' }, { ownerTenantId: id, tenantIds: [id], status: 'draft' }]) expect(() => assertOwnership(record, id)).toThrow();
  });
  it('CAS includes absent alt texts, exact ownership and original arrays', () => {
    expect(casFilter({ id, images: ['real'] }, id)).toEqual({ _id: id, ownerTenantId: id, tenantIds: [id], status: 'active', images: ['real'], imageAltTexts: { $exists: false } });
    expect(casFilter({ id, images: ['real'], alts: [] }, id).imageAltTexts).toEqual([]);
  });
  it('preserves real lead and alt texts, refuses overflow and duplicate assets', () => {
    const original = { id, images: ['https://real.test/a'], alts: [{ url: 'https://real.test/a', alt: 'Original' }] };
    expect(nextGallery(original, [{ url: 'https://generated.test/b', alt: 'Illustrative' }]).images[0]).toBe(original.images[0]);
    expect(() => nextGallery(original, [{ url: original.images[0], alt: 'Duplicate' }])).toThrow('Duplicate');
    expect(() => nextGallery(original, Array.from({ length: 10 }, (_, index) => ({ url: `https://generated.test/${index}`, alt: 'image' })))).toThrow();
  });
  it('stages inspected local images without provider calls and resumes identical hashes', async () => {
    const receipt = await stage(); await run('--stage');
    expect(uploadBase64Image).not.toHaveBeenCalled(); expect(Attraction.updateOne).not.toHaveBeenCalled();
    expect(Object.values(receipt.assets).every((value: any) => value.origin === 'codex-built-in')).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'receipt.json'), 'utf8'))).toEqual(receipt);
  });
  it('requires all twenty valid JPEG files and keeps the original receipt intact on failure', async () => {
    await run('--check'); const original = readFileSync(join(dir, 'receipt.json'), 'utf8');
    for (const item of GRAND_ROCK_IMAGE_PLAN.slice(0, -1)) writeFileSync(join(dir, `${item.key}.jpg`), jpeg);
    await expect(run('--stage')).rejects.toThrow(); expect(readFileSync(join(dir, 'receipt.json'), 'utf8')).toBe(original);
    writeFileSync(join(dir, `${GRAND_ROCK_IMAGE_PLAN[19].key}.jpg`), 'corrupt');
    await expect(run('--stage')).rejects.toThrow('Invalid JPEG'); expect(readFileSync(join(dir, 'receipt.json'), 'utf8')).toBe(original);
    await expect(run('--apply')).rejects.toThrow('Inspect all images'); expect(uploadBase64Image).not.toHaveBeenCalled();
  });
  it('refuses edited local asset and traversal paths', async () => {
    const receipt = await stage(); writeFileSync(join(dir, 'hero-quads.jpg'), 'edited');
    await expect(run('--apply', [`--approved-sha256=${assetDigest(receipt)}`])).rejects.toThrow('differs');
    receipt.assets['hero-quads'].file = '../secret'; writeFileSync(join(dir, 'receipt.json'), JSON.stringify(receipt));
    await expect(run('--stage')).rejects.toThrow('Invalid staged'); expect(uploadBase64Image).not.toHaveBeenCalled();
  });
  it('stops before uploads on a concurrent gallery or hero edit', async () => {
    const receipt = await stage(); tours[0].images.push('https://real.test/new');
    await expect(run('--apply', [`--approved-sha256=${assetDigest(receipt)}`])).rejects.toThrow('Concurrent gallery');
    tours[0].images.pop(); tenant.heroImages = ['https://real.test/new'];
    await expect(run('--apply', [`--approved-sha256=${assetDigest(receipt)}`])).rejects.toThrow('Concurrent hero'); expect(uploadBase64Image).not.toHaveBeenCalled();
  });
  it('applies twenty real uploaded URLs with unchanged real leads and can restore exact originals', async () => {
    const receipt = await stage(); const approval = [`--approved-sha256=${assetDigest(receipt)}`];
    await run('--apply', approval);
    await run('--apply', approval);
    expect(uploadBase64Image).toHaveBeenCalledTimes(20);
    expect(tours.every(tour => tour.images[0] === receipt.tours[tour.slug].images[0])).toBe(true);
    expect((tenant.heroImages as string[])[0]).toBe(receipt.hero.images[0]);
    expect(tours.every(tour => tour.imageAltTexts.every((row: any) => row.alt.startsWith('Illustrative image: ')))).toBe(true);
    await run('--restore', approval);
    expect(tours.every(tour => JSON.stringify(tour.images) === JSON.stringify(receipt.tours[tour.slug].images) && tour.imageAltTexts === undefined)).toBe(true);
    expect(tenant.heroImages).toEqual(receipt.hero.images);
  });
  it('stops on a concurrent alt-text edit after preflight without replacing it', async () => {
    const receipt = await stage();
    const normal = jest.mocked(uploadBase64Image).getMockImplementation()!;
    jest.mocked(uploadBase64Image).mockImplementation(async (...args) => { tours[0].imageAltTexts = [{ url: tours[0].images[0], alt: 'Operator edit' }]; return normal(...args); });
    await expect(run('--apply', [`--approved-sha256=${assetDigest(receipt)}`])).rejects.toThrow('Concurrent gallery');
    expect(tours[0].imageAltTexts[0].alt).toBe('Operator edit'); expect(tours[0].images).toHaveLength(1);
  });
  it('refuses upload receipt outside the tenant namespace', async () => {
    const receipt = await stage(); jest.mocked(uploadBase64Image).mockResolvedValue({ url: 'https://res.cloudinary.com/foreign.jpg' } as any);
    await expect(run('--apply', [`--approved-sha256=${assetDigest(receipt)}`])).rejects.toThrow('ownership'); expect(Attraction.updateOne).not.toHaveBeenCalled();
  });
});
