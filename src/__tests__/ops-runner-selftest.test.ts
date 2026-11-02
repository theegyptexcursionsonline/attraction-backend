import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SELFTEST_COLLECTION, runOpsRunnerSelfTest } from '../scripts/ops-runner-selftest';

jest.setTimeout(90_000);
let mongo: MongoMemoryServer;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('ops_selftest'), { autoIndex: false });
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

it('writes, reads back and removes its own marker without touching sites', async () => {
  const site = { _id: new Types.ObjectId(), slug: 'kept-site', name: 'Kept', status: 'active' };
  await mongoose.connection.db!.collection('tenants').insertOne(site as never);
  const before = await mongoose.connection.db!.collection('tenants').find().toArray();
  const result = await runOpsRunnerSelfTest(mongoose.connection.db!);
  expect(result).toEqual({ wrote: true, readBack: true, deleted: true, leftover: 0, activeSites: 1 });
  expect(await mongoose.connection.db!.collection(SELFTEST_COLLECTION).countDocuments()).toBe(0);
  expect(await mongoose.connection.db!.collection('tenants').find().toArray()).toEqual(before);
});
