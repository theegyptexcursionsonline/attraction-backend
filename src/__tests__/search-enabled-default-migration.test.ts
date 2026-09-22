import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Collection, Document } from 'mongodb';
import { toPublicTenantDto } from '../controllers/tenants.controller';
import { Tenant } from '../models/Tenant';
import {
  applySearchEnabledMigration,
  planSearchEnabledMigration,
  rollbackSearchEnabledMigration,
} from '../scripts/search-enabled-default-migration';

jest.setTimeout(120_000);
const ids = { liveLegacy: new Types.ObjectId(), noId: new Types.ObjectId(), noAi: new Types.ObjectId(), explicitOn: new Types.ObjectId(), explicitOff: new Types.ObjectId(), boolean: new Types.ObjectId(), badId: new Types.ObjectId() };
const widgetId = 'wgt_abcdefghijklmnopqrstuv';
const toObjectId = (id: string) => new Types.ObjectId(id) as never;
let mongo: MongoMemoryReplSet;
let tenants: Collection<Document>;

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('search_enabled_migration'));
  await Tenant.init();
  tenants = mongoose.connection.db!.collection('tenants');
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await tenants.deleteMany({});
  await tenants.insertMany([
    { _id: ids.liveLegacy, slug: 'live-legacy', aiSettings: { searchWidget: { widgetId, placeholder: 'Search' } } },
    { _id: ids.noId, slug: 'no-id', aiSettings: { searchWidget: { placeholder: 'Search' } } },
    { _id: ids.noAi, slug: 'no-ai' },
    { _id: ids.explicitOn, slug: 'explicit-on', aiSettings: { searchWidget: { enabled: true, widgetId } } },
    { _id: ids.explicitOff, slug: 'explicit-off', aiSettings: { searchWidget: { enabled: false, widgetId } } },
    { _id: ids.boolean, slug: 'legacy-boolean', aiSettings: { searchWidget: true } },
    { _id: ids.badId, slug: 'bad-id', aiSettings: { searchWidget: { widgetId: 'wgt_short' } } },
  ].map(tenant => ({ ...tenant, domain: `${tenant.slug}.invalid` })));
});

// What the storefront gates on: the published switch and id (a site without AI settings gains an
// empty searchWidget object, which publishes nothing either way).
const publicSearch = async (id: Types.ObjectId) => {
  const search = (toPublicTenantDto(await tenants.findOne({ _id: id })).aiSettings as any)?.searchWidget;
  return { enabled: search?.enabled, widgetId: search?.widgetId, placeholder: search?.placeholder };
};
const snapshot = () => tenants.find({}, { sort: { _id: 1 } }).toArray();

it('plans without writing: on only where a widget id exists, off otherwise, explicit and odd records untouched', async () => {
  const before = await snapshot();
  const plan = await planSearchEnabledMigration(tenants);
  expect(plan.setTrue).toEqual([{ id: String(ids.liveLegacy), slug: 'live-legacy', widgetId }]);
  expect(plan.setFalse.map(target => target.slug).sort()).toEqual(['bad-id', 'no-ai', 'no-id']);
  expect(plan.blocked).toEqual([{ id: String(ids.boolean), slug: 'legacy-boolean', reason: 'aiSettings.searchWidget is not an object' }]);
  expect(await snapshot()).toEqual(before);
});

it('applies without changing what any site publishes, is idempotent, and rolls back exactly what it wrote', async () => {
  const publishedBefore = await Promise.all(Object.values(ids).map(publicSearch));
  expect(await publicSearch(ids.liveLegacy)).toMatchObject({ enabled: true, widgetId });

  const receipt = await applySearchEnabledMigration(tenants, await planSearchEnabledMigration(tenants), { database: 'test', toObjectId });
  expect(receipt.setTrue.map(target => target.id)).toEqual([String(ids.liveLegacy)]);
  expect(receipt.setFalse).toHaveLength(3);
  expect(receipt.skipped).toEqual([]);
  expect((await tenants.findOne({ _id: ids.liveLegacy }))?.aiSettings.searchWidget.enabled).toBe(true);
  expect((await tenants.findOne({ _id: ids.noAi }))?.aiSettings).toEqual({ searchWidget: { enabled: false } });
  expect(await Promise.all(Object.values(ids).map(publicSearch))).toEqual(publishedBefore);

  const second = await planSearchEnabledMigration(tenants);
  expect([...second.setTrue, ...second.setFalse]).toEqual([]);

  // A super admin switches no-id's search on after the migration: rollback keeps that choice.
  await tenants.updateOne({ _id: ids.noId }, { $set: { 'aiSettings.searchWidget.enabled': true, 'aiSettings.searchWidget.widgetId': widgetId, 'aiSettings.searchWidget.updatedAt': new Date(Date.now() + 1000) } });
  const rollback = await rollbackSearchEnabledMigration(tenants, receipt, toObjectId);
  expect(rollback.restored.sort()).toEqual([String(ids.liveLegacy), String(ids.badId), String(ids.noAi)].sort());
  expect(rollback.skipped).toEqual([{ id: String(ids.noId), reason: 'switch changed since the migration' }]);
  expect((await tenants.findOne({ _id: ids.liveLegacy }))?.aiSettings.searchWidget).toEqual({ widgetId, placeholder: 'Search' });
  expect((await tenants.findOne({ _id: ids.noId }))?.aiSettings.searchWidget.enabled).toBe(true);
  expect((await tenants.findOne({ _id: ids.explicitOff }))?.aiSettings.searchWidget.enabled).toBe(false);
});

it('skips records that changed between plan and apply instead of writing a stale value', async () => {
  const plan = await planSearchEnabledMigration(tenants);
  await tenants.updateOne({ _id: ids.liveLegacy }, { $unset: { 'aiSettings.searchWidget.widgetId': '' } });
  await tenants.updateOne({ _id: ids.noId }, { $set: { 'aiSettings.searchWidget.widgetId': widgetId } });
  const receipt = await applySearchEnabledMigration(tenants, plan, { database: 'test', toObjectId });
  expect(receipt.skipped.map(target => target.slug).sort()).toEqual(['live-legacy', 'no-id']);
  expect((await tenants.findOne({ _id: ids.liveLegacy }))?.aiSettings.searchWidget).not.toHaveProperty('enabled');
  expect((await tenants.findOne({ _id: ids.noId }))?.aiSettings.searchWidget).not.toHaveProperty('enabled');
});

it('refuses a rollback from anything but an apply receipt', async () => {
  await expect(rollbackSearchEnabledMigration(tenants, { mode: 'dry-run' } as never, toObjectId)).rejects.toThrow('Not an apply receipt');
});
