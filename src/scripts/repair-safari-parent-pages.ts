/** Run through the scoped environment. Dry-run writes an approval plan; apply requires that exact plan. */
import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { SAFARI_TENANT_ID, SAFARI_QUAD_PAGE_ID } from '../utils/safariLegacyPages';
import manifest from '../data/safari-sahara-quad-catalog.json';

const OLD_PATH = '/hurghada-quad-biking-tours';
const IDS = manifest.tours.map(tour => tour.targetId);
export function buildParentRepairPlan(tenant: any, tours: any[]) {
  if (String(tenant?._id) !== SAFARI_TENANT_ID || tenant.slug !== 'safari-sahara-hurghada') throw new Error('Unexpected site');
  const page = tenant.customPages?.find((p: any) => String(p._id) === SAFARI_QUAD_PAGE_ID);
  if (!page || page.status !== 'active' || page.isPublished !== true || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)) throw new Error('Target page is not published');
  if (tours.length !== IDS.length || new Set(tours.map(t => String(t._id))).size !== IDS.length) throw new Error('Expected exactly eight source tours');
  const parentPage = { label: page.title, path: `/${page.slug}` };
  const rows = IDS.map(id => {
    const tour = tours.find(t => String(t._id) === id);
    if (!tour || tour.status !== 'active' || tour.tenantIds?.length !== 1 || String(tour.tenantIds[0]) !== SAFARI_TENANT_ID) throw new Error('Tour ownership changed');
    const complete = tour.parentPage?.path === parentPage.path && tour.parentPage?.label === parentPage.label;
    if (!complete && tour.parentPage?.path !== OLD_PATH) throw new Error('Parent link was edited');
    if (!tour.updatedAt || !Number.isFinite(new Date(tour.updatedAt).getTime())) throw new Error('Missing revision timestamp');
    return { id, updatedAt: new Date(tour.updatedAt).toISOString(), parentPage: tour.parentPage, complete };
  });
  return { tenantId: SAFARI_TENANT_ID, pageId: SAFARI_QUAD_PAGE_ID, pageRevision: page.revision, parentPage, rows };
}

export async function applyParentRepair(db: any, session: any, expected: ReturnType<typeof buildParentRepairPlan>) {
  let count = 0;
  await session.withTransaction(async () => {
    const tenant = await db.collection('tenants').findOne({ _id: new Types.ObjectId(SAFARI_TENANT_ID) }, { session });
    const tours = await db.collection('attractions').find({ tenantIds: new Types.ObjectId(SAFARI_TENANT_ID), _id: { $in: IDS.map(id => new Types.ObjectId(id)) } }, { session }).toArray();
    const actual = buildParentRepairPlan(tenant, tours);
    if (actual.rows.every(row => row.complete)) { count = 0; return; }
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Content changed since dry-run; create a new plan');
    // Write lock serializes concurrent page/menu updates with the target revision check.
    const locked = await db.collection('tenants').updateOne({ _id: tenant._id, customPages: { $elemMatch: { _id: new Types.ObjectId(actual.pageId), revision: actual.pageRevision, status: 'active', isPublished: true, slug: actual.parentPage.path.slice(1) } } }, { $inc: { __v: 1 } }, { session });
    if (locked.modifiedCount !== 1) throw new Error('Target page changed');
    count = 0;
    for (const row of actual.rows.filter(row => !row.complete)) {
      const result = await db.collection('attractions').updateOne({ _id: new Types.ObjectId(row.id), status: 'active', tenantIds: [tenant._id], updatedAt: new Date(row.updatedAt), 'parentPage.path': OLD_PATH }, { $set: { parentPage: actual.parentPage, updatedAt: new Date() } }, { session });
      if (result.modifiedCount !== 1) throw new Error('Tour changed during repair');
      count++;
    }
  });
  return count;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (key: string) => args.find(value => value.startsWith(`${key}=`))?.slice(key.length + 1);
  if (arg('--confirm-tenant') !== 'safari-sahara-hurghada' || !arg('--plan-file')) throw new Error('Provide --confirm-tenant=safari-sahara-hurghada and --plan-file=<private path>');
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || '', { autoIndex: false, autoCreate: false });
  try {
    const db = mongoose.connection.db!;
    const tenant = await db.collection('tenants').findOne({ _id: new Types.ObjectId(SAFARI_TENANT_ID) });
    const tours = await db.collection('attractions').find({ tenantIds: new Types.ObjectId(SAFARI_TENANT_ID), _id: { $in: IDS.map(id => new Types.ObjectId(id)) } }).toArray();
    const plan = buildParentRepairPlan(tenant, tours);
    if (!args.includes('--apply')) {
      writeFileSync(arg('--plan-file')!, JSON.stringify(plan, null, 2), { mode: 0o600, flag: 'wx' });
      console.log(JSON.stringify({ state: 'dry-run', pending: plan.rows.filter(row => !row.complete).length })); return;
    }
    const expected = JSON.parse(readFileSync(arg('--plan-file')!, 'utf8'));
    if (!arg('--backup-file') || !arg('--receipt-file')) throw new Error('Apply requires --backup-file and --receipt-file');
    if (!plan.rows.every(row => row.complete)) {
      if (JSON.stringify(plan) !== JSON.stringify(expected)) throw new Error('Content changed since dry-run; create a new plan');
      const backup = JSON.stringify({ tenantId: SAFARI_TENANT_ID, rows: plan.rows, target: plan.parentPage }, null, 2);
      if (existsSync(arg('--backup-file')!)) {
        if (readFileSync(arg('--backup-file')!, 'utf8') !== backup) throw new Error('Backup already belongs to a different plan');
      } else writeFileSync(arg('--backup-file')!, backup, { mode: 0o600, flag: 'wx' });
    }
    const session = await mongoose.startSession();
    try {
      const changed = await applyParentRepair(db, session, expected);
      const freshTenant = await db.collection('tenants').findOne({ _id: new Types.ObjectId(SAFARI_TENANT_ID) });
      const freshTours = await db.collection('attractions').find({ tenantIds: new Types.ObjectId(SAFARI_TENANT_ID), _id: { $in: IDS.map(id => new Types.ObjectId(id)) } }).toArray();
      if (!buildParentRepairPlan(freshTenant, freshTours).rows.every(row => row.complete)) throw new Error('Post-repair verification failed');
      const receipt = { state: changed ? 'applied' : 'already-complete', changed, tenantId: SAFARI_TENANT_ID, target: plan.parentPage, at: new Date().toISOString() };
      writeFileSync(arg('--receipt-file')!, JSON.stringify(receipt, null, 2), { mode: 0o600 }); console.log(JSON.stringify(receipt));
    } finally { await session.endSession(); }
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : 'Repair failed'); process.exitCode = 1; });
