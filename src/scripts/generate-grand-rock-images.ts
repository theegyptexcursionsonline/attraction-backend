/** Grand Rock original image pipeline. Default: offline plan. --check snapshots
 * the owned live records; --stage hashes inspected Codex-generated JPEGs locally only; --apply requires
 * an inspected-asset digest and uploads before tenant-scoped CAS attachment.
 * Use --restore for CAS recovery of the exact recorded original arrays.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { uploadBase64Image } from '../services/upload.service';
import { imageAltTextsSchema } from '../utils/imagePresentation';

export const TENANT = 'grand-rock-safari';
const FOLDER = `tours/${TENANT}/generated`;
const MARKER = `/attractions-network/${FOLDER}/`;
const STYLE = 'Original photorealistic editorial travel photograph near Makadi Bay or Sahl Hasheesh, Egypt. Believable equipment and generic adult people, natural light, wide landscape composition. Do not imitate any source photograph or depict a real person, operator, identifiable vessel or brand. No text, no logos, no watermark, no collage, no split panels. Protective helmets for riding and flotation equipment for snorkelling; no touching coral or wildlife. No yacht, luxury amenities or wildlife guarantees.';
export interface Asset { key: string; target: string; scene: string; alt: string }
const asset = (key: string, target: string, scene: string, alt: string): Asset => ({ key, target, scene, alt: `Illustrative image: ${alt}` });
export const GRAND_ROCK_IMAGE_PLAN: readonly Asset[] = [
  asset('hero-quads', 'hero', 'Red quad bikes crossing golden desert tracks with the distant Red Sea horizon at sunset; adult riders wearing helmets, wide editorial view.', 'quad riders near the Red Sea at sunset'),
  asset('hero-boat', 'hero', 'A compact unbranded white private speed boat with open seating for at most six guests above turquoise reef water off Sahl Hasheesh, viewed from above.', 'small private speed boat off Sahl Hasheesh'),
  asset('hero-horses', 'hero', 'Adult riders wearing helmets on Arabian horses along a broad Makadi Bay shoreline at golden hour, a calm guided ride, expansive coastal composition.', 'guided horse ride along the Makadi Bay shore'),
  asset('horse-beach', 'horse-riding-by-the-sea', 'Helmeted adult riders on calm Arabian horses walking along the Makadi shoreline at sunset with a guide at the front, natural sandy beach.', 'guided Arabian horse ride on the shore'),
  asset('horse-sea', 'horse-riding-by-the-sea', 'A helmeted adult rider on a calm Arabian horse wading in shallow Red Sea water close to shore, guide nearby, gentle conditions and no deep water.', 'horse and rider wading near the shore'),
  asset('horse-trail', 'horse-riding-by-the-sea', 'Helmeted adult riders on Arabian horses following a guide along a sandy Makadi Bay desert trail, natural rocky hills, no infrastructure promises.', 'guided horse ride on a desert trail'),
  asset('horse-stable', 'horse-riding-by-the-sea', 'Calm Arabian horses at a modest generic open-air desert stable near Makadi Bay, groom checking tack, natural daylight, no luxury facilities.', 'Arabian horses at a simple desert stable'),
  asset('snorkel-reef', 'private-speed-boat-snorkeling-sahl-hasheesh', 'Adult snorkellers with flotation vests floating above a natural Red Sea coral garden, safe distance from coral, clear water and ordinary reef fish.', 'snorkellers above a Red Sea coral garden'),
  asset('snorkel-boat', 'private-speed-boat-snorkeling-sahl-hasheesh', 'Four adult guests with flotation vests preparing masks and fins beside a small private white speed boat off Sahl Hasheesh, guide assisting calmly.', 'guests preparing to snorkel from a small boat'),
  asset('snorkel-anchor', 'private-speed-boat-snorkeling-sahl-hasheesh', 'A small unbranded white speed boat held at a designated mooring beside a shallow reef in clear turquoise water, modest seating, no yacht facilities.', 'small private boat moored beside a reef'),
  asset('snorkel-water', 'private-speed-boat-snorkeling-sahl-hasheesh', 'Water-level view of adult snorkellers wearing flotation vests entering clear sheltered Red Sea water near a small private boat, guide supervising.', 'guided snorkelling near a private boat'),
  asset('buggy-four-track', 'buggy-car-safari-4-seats', 'A clearly four-seat side-by-side dune buggy with two rows of seats and four helmeted adult passengers wearing seat belts on a Makadi desert track.', 'four-seat buggy on a desert track'),
  asset('buggy-four-coast', 'buggy-car-safari-4-seats', 'A generic four-seat side-by-side dune buggy with two visible rows parked at a rocky Red Sea coastal viewpoint, adult passengers wearing helmets.', 'four-seat buggy at a coastal viewpoint'),
  asset('buggy-four-drive', 'buggy-car-safari-4-seats', 'A generic four-seat side-by-side dune buggy with two visible rows driving gently across a sandy desert trail, helmeted adults and modest dust trail.', 'four-seat buggy on a sandy trail'),
  asset('buggy-two', 'buggy-car-safari-2-seats', 'A generic two-seat dune buggy carrying two helmeted adults with seat belts along a Makadi Bay desert trail, modest dust plume and rocky background.', 'two-seat buggy on a desert trail'),
  asset('quad-camel', 'quad-safari-vip', 'An adult guest taking a short slow guided camel ride at a simple Makadi desert station, handler walking beside the camel, no luxury camp or entertainment.', 'short guided camel ride at a desert station'),
  asset('quad-coast', 'quad-safari-vip', 'Helmeted adult quad riders stopped at a natural rocky coastal viewpoint above the Red Sea near Makadi Bay, red unbranded quads and broad blue horizon.', 'quad riders at a coastal viewpoint'),
  asset('moto-350', 'motocross-ktm-350cc-vip', 'A generic orange mid-size 350-class dirt bike with no branding, adult rider in full protective gear on a natural Makadi desert track, no competition event.', 'orange mid-size dirt bike on a desert track'),
  asset('moto-530', 'motocross-ktm-530cc-vip', 'A generic orange larger 530-class dirt bike without branding, adult rider in full protective gear crossing rocky fossil-coral desert terrain near Makadi.', 'orange dirt bike on a rocky desert trail'),
  asset('moto-250', 'motocross-yamaha-250cc-vip', 'A generic blue compact 250-class dirt bike without branding, adult rider in full protective gear following a gentle sandy Makadi Bay desert track.', 'blue dirt bike on a sandy desert track'),
];
type Alt = { url: string; alt: string };
export interface Snapshot { id: string; images: string[]; alts?: Alt[] }
interface Staged { sha256: string; file: string; origin: 'codex-built-in'; url?: string }
interface Receipt { version: 1; tenant: string; planHash: string; tenantId: string; hero: Snapshot; tours: Record<string, Snapshot>; assets: Record<string, Staged> }
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const planHash = () => hash(JSON.stringify(GRAND_ROCK_IMAGE_PLAN));
export function assertOwnership(record: { ownerTenantId?: unknown; tenantIds: unknown[]; status: string }, id: string): void {
  if (String(record.ownerTenantId) !== id || record.tenantIds.length !== 1 || String(record.tenantIds[0]) !== id || record.status !== 'active') throw new Error('Refusing non-exclusive or inactive catalogue record');
}
export function nextGallery(original: Snapshot, rows: { url: string; alt: string }[]): Snapshot {
  const images = [...original.images, ...rows.map(row => row.url)];
  if (new Set(images).size !== images.length) throw new Error('Duplicate image URL');
  const alts = imageAltTextsSchema.parse([...(original.alts || []), ...rows]);
  return { ...original, images, alts };
}
export function casFilter(snapshot: Snapshot, tenantId: string, hero = false): Record<string, unknown> {
  if (hero) return { _id: snapshot.id, slug: TENANT, status: 'active', heroImages: snapshot.images };
  return { _id: snapshot.id, ownerTenantId: tenantId, tenantIds: [tenantId], status: 'active', images: snapshot.images, imageAltTexts: snapshot.alts === undefined ? { $exists: false } : snapshot.alts };
}
export function assetDigest(receipt: Pick<Receipt, 'assets'>): string {
  return hash(JSON.stringify(GRAND_ROCK_IMAGE_PLAN.map(item => [item.key, receipt.assets[item.key]?.sha256])));
}
function save(path: string, receipt: Receipt): void { writeFileSync(`${path}.tmp`, JSON.stringify(receipt, null, 2), { mode: 0o600 }); renameSync(`${path}.tmp`, path); }
function read(path: string): Receipt {
  const receipt = JSON.parse(readFileSync(path, 'utf8')) as Receipt;
  if (receipt.version !== 1 || receipt.tenant !== TENANT || receipt.planHash !== planHash()) throw new Error('Receipt ownership or plan mismatch');
  if (!/^[a-f0-9]{24}$/.test(receipt.tenantId) || receipt.hero.id !== receipt.tenantId || !Array.isArray(receipt.hero.images)) throw new Error('Invalid tenant snapshot');
  if (Object.keys(receipt.tours).sort().join(',') !== targets().sort().join(',')) throw new Error('Receipt target mismatch');
  for (const snapshot of Object.values(receipt.tours)) {
    if (!/^[a-f0-9]{24}$/.test(snapshot.id) || !Array.isArray(snapshot.images)) throw new Error('Invalid tour snapshot');
    if (snapshot.alts !== undefined) imageAltTextsSchema.parse(snapshot.alts);
  }
  for (const [key, staged] of Object.entries(receipt.assets)) {
    if (staged.origin !== 'codex-built-in' || !GRAND_ROCK_IMAGE_PLAN.some(item => item.key === key) || staged.file !== `${key}.jpg` || !/^[a-f0-9]{64}$/.test(staged.sha256)) throw new Error('Invalid staged asset receipt');
    if (staged.url && (!staged.url.startsWith('https://res.cloudinary.com/') || !staged.url.includes(MARKER))) throw new Error('Invalid uploaded asset receipt');
  }
  return receipt;
}
const targets = () => [...new Set(GRAND_ROCK_IMAGE_PLAN.filter(item => item.target !== 'hero').map(item => item.target))];
async function withDatabase(action: () => Promise<void>): Promise<void> { await connectDatabase(); try { await action(); } finally { await disconnectDatabase(); } }
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const modes = ['--check', '--stage', '--apply', '--restore'].filter(mode => argv.includes(mode));
  if (modes.length > 1) throw new Error('Choose one phase only');
  if (!modes.length) { console.log(JSON.stringify({ mode: 'dry-run', tenant: TENANT, origin: 'codex-built-in', assets: GRAND_ROCK_IMAGE_PLAN, safeguards: ['offline', 'no spend', 'no upload', 'no database writes', 'real photos stay first'] }, null, 2)); return; }
  const value = (name: string) => argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  if (value('--confirm-tenant') !== TENANT || value('--confirm-assets') !== 'generated-only') throw new Error('Exact tenant and generated-only fences required');
  const out = resolve(value('--out') || 'readiness-proof/2026-09-30-grand-rock-generated');
  mkdirSync(out, { recursive: true });
  const path = join(out, 'receipt.json');
  if (modes[0] === '--check') {
    if (existsSync(path)) throw new Error('Existing receipt is immutable; use another evidence folder');
    await withDatabase(async () => {
      const tenant = await Tenant.findOne({ slug: TENANT, status: 'active' }).select('_id heroImages').lean();
      if (!tenant) throw new Error('Active tenant missing');
      const id = String(tenant._id);
      const tours = await Attraction.find({ slug: { $in: targets() }, ownerTenantId: tenant._id, tenantIds: tenant._id }).select('_id slug status ownerTenantId tenantIds images imageAltTexts').lean();
      if (tours.length !== targets().length) throw new Error('Owned catalogue incomplete');
      const snapshots: Record<string, Snapshot> = {};
      for (const tour of tours) { assertOwnership(tour, id); if (tour.images.some(url => url.includes(MARKER))) throw new Error('Existing generated gallery: resume the original receipt'); snapshots[tour.slug] = { id: String(tour._id), images: [...tour.images], ...(tour.imageAltTexts !== undefined ? { alts: JSON.parse(JSON.stringify(tour.imageAltTexts)) } : {}) }; }
      for (const slug of targets()) nextGallery(snapshots[slug], GRAND_ROCK_IMAGE_PLAN.filter(item => item.target === slug).map(item => ({ url: `https://pending.invalid/${item.key}`, alt: item.alt })));
      save(path, { version: 1, tenant: TENANT, planHash: planHash(), tenantId: id, hero: { id, images: [...(tenant.heroImages || [])] }, tours: snapshots, assets: {} });
      console.log(JSON.stringify({ mode: 'read-only-snapshot', tenant: TENANT, tours: targets(), heroes: (tenant.heroImages || []).length }));
    }); return;
  }
  const receipt = read(path);
  if (modes[0] === '--stage') {
    // Validate the complete set before changing the receipt. Generation and
    // inspection happen through Codex's built-in tool, outside this script.
    const stagedAssets: Record<string, Staged> = {};
    for (const item of GRAND_ROCK_IMAGE_PLAN) {
      const file = `${item.key}.jpg`;
      const bytes = readFileSync(join(out, file));
      if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw new Error(`Invalid JPEG: ${item.key}`);
      const sha256 = hash(bytes);
      const prior = receipt.assets[item.key];
      if (prior && prior.sha256 !== sha256) throw new Error(`Previously staged asset changed: ${item.key}`);
      stagedAssets[item.key] = { ...prior, file, sha256, origin: 'codex-built-in' };
    }
    receipt.assets = stagedAssets;
    save(path, receipt);
    console.log(JSON.stringify({ mode: 'staged-only', origin: 'codex-built-in', assets: GRAND_ROCK_IMAGE_PLAN.length, approvedDigest: assetDigest(receipt), reviewRequired: true })); return;
  }
  if (value('--approved-sha256') !== assetDigest(receipt) || GRAND_ROCK_IMAGE_PLAN.some(item => !receipt.assets[item.key])) throw new Error('Inspect all images and pass their exact approved digest');
  for (const item of GRAND_ROCK_IMAGE_PLAN) { const staged = receipt.assets[item.key]; if (hash(readFileSync(join(out, staged.file))) !== staged.sha256) throw new Error('Staged image differs from reviewed file'); }
  await withDatabase(async () => {
    // Preflight every record before uploads or any write. No stale snapshot silently rebases.
    const currentTenant = await Tenant.findOne({ _id: receipt.tenantId, slug: TENANT, status: 'active' }).select('heroImages').lean();
    if (!currentTenant) throw new Error('Tenant identity changed');
    for (const slug of targets()) {
      const original = receipt.tours[slug];
      if (!original) throw new Error('Missing catalogue snapshot');
      const tour = await Attraction.findOne({ _id: original.id, slug, ownerTenantId: receipt.tenantId, tenantIds: [receipt.tenantId], status: 'active' }).select('ownerTenantId tenantIds status images imageAltTexts').lean();
      if (!tour) throw new Error(`Ownership changed: ${slug}`); assertOwnership(tour, receipt.tenantId);
      const rows = GRAND_ROCK_IMAGE_PLAN.filter(item => item.target === slug).map(item => ({ url: receipt.assets[item.key].url || `https://pending.invalid/${item.key}`, alt: item.alt }));
      const next = nextGallery(original, rows);
      const equal = (snapshot: Snapshot) => JSON.stringify(tour.images) === JSON.stringify(snapshot.images) && JSON.stringify(tour.imageAltTexts) === JSON.stringify(snapshot.alts);
      if (!equal(original) && !equal(next)) throw new Error(`Concurrent gallery edit: ${slug}`);
    }
    const knownHeroes = GRAND_ROCK_IMAGE_PLAN.filter(item => item.target === 'hero').map(item => receipt.assets[item.key].url);
    if (JSON.stringify(currentTenant.heroImages) !== JSON.stringify(receipt.hero.images) && JSON.stringify(currentTenant.heroImages) !== JSON.stringify([...receipt.hero.images, ...knownHeroes])) throw new Error('Concurrent hero edit');
    console.log(JSON.stringify({ mode: 'pre-mutation-report', tenant: TENANT, tours: receipt.tours, originalHeroes: receipt.hero.images }));
    if (modes[0] === '--apply') for (const item of GRAND_ROCK_IMAGE_PLAN) {
      const staged = receipt.assets[item.key]; if (staged.url) continue;
      const uploaded = await uploadBase64Image(`data:image/jpeg;base64,${readFileSync(join(out, staged.file)).toString('base64')}`, FOLDER, { publicId: `${item.key}-${staged.sha256.slice(0, 16)}`, overwrite: false, maxWidth: 1536, maxHeight: 1024 });
      if (!uploaded.url.includes(MARKER) || !uploaded.url.startsWith('https://res.cloudinary.com/')) throw new Error('Unexpected upload ownership');
      staged.url = uploaded.url; save(path, receipt);
    }
    for (const slug of targets()) {
      const original = receipt.tours[slug];
      const rows = GRAND_ROCK_IMAGE_PLAN.filter(item => item.target === slug).map(item => ({ url: receipt.assets[item.key].url!, alt: item.alt }));
      if (rows.some(row => !row.url || !row.url.includes(MARKER))) throw new Error('Upload receipt incomplete');
      const next = nextGallery(original, rows); const restoring = modes[0] === '--restore';
      const from = restoring ? next : original; const to = restoring ? original : next;
      const result = await Attraction.updateOne(casFilter(from, receipt.tenantId), { $set: { images: to.images, ...(to.alts !== undefined ? { imageAltTexts: to.alts } : {}) }, ...(to.alts === undefined ? { $unset: { imageAltTexts: 1 } } : {}) }, { runValidators: true });
      if (result.modifiedCount !== 1 && !await Attraction.exists(casFilter(to, receipt.tenantId))) throw new Error(`Concurrent gallery edit: ${slug}`);
    }
    const nextHeroes = { ...receipt.hero, images: [...receipt.hero.images, ...GRAND_ROCK_IMAGE_PLAN.filter(item => item.target === 'hero').map(item => receipt.assets[item.key].url!)] };
    const from = modes[0] === '--restore' ? nextHeroes : receipt.hero; const to = modes[0] === '--restore' ? receipt.hero : nextHeroes;
    const result = await Tenant.updateOne(casFilter(from, receipt.tenantId, true), { $set: { heroImages: to.images } }, { runValidators: true });
    if (result.modifiedCount !== 1 && !await Tenant.exists(casFilter(to, receipt.tenantId, true))) throw new Error('Concurrent hero edit');
    for (const slug of targets()) {
      const expected = modes[0] === '--restore' ? receipt.tours[slug] : nextGallery(receipt.tours[slug], GRAND_ROCK_IMAGE_PLAN.filter(item => item.target === slug).map(item => ({ url: receipt.assets[item.key].url!, alt: item.alt })));
      if (!await Attraction.exists(casFilter(expected, receipt.tenantId))) throw new Error(`Post-write verification failed: ${slug}`);
    }
    if (!await Tenant.exists(casFilter(to, receipt.tenantId, true))) throw new Error('Post-write hero verification failed');
    console.log(JSON.stringify({ mode: modes[0] === '--restore' ? 'restored' : 'applied', originalLeadsPreserved: true, generated: GRAND_ROCK_IMAGE_PLAN.length, orphanUploadsRetainedForRecovery: true }));
  });
}
if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : 'Image pipeline failed'); process.exitCode = 1; });
