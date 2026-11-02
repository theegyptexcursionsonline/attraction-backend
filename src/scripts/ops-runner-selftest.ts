/**
 * Low-risk ops-runner self-test (docs/OPS_RUNNER.md). Proves the runner can read and write the
 * database without touching business data: it writes one marker document to its own
 * `ops_runner_selftest` collection, reads it back, deletes it, and counts active sites read-only.
 * Prints one JSON line. No connection details are printed.
 */
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant';

export const SELFTEST_COLLECTION = 'ops_runner_selftest';

export async function runOpsRunnerSelfTest(db: mongoose.mongo.Db) {
  const collection = db.collection<{ _id: string; at: Date; by: string }>(SELFTEST_COLLECTION);
  const marker = { _id: randomUUID(), at: new Date(), by: 'ops-runner' };
  await collection.insertOne(marker);
  const readBack = (await collection.findOne({ _id: marker._id }))?.by === 'ops-runner';
  const deleted = (await collection.deleteOne({ _id: marker._id })).deletedCount === 1;
  const leftover = await collection.countDocuments({ _id: marker._id });
  const activeSites = await Tenant.countDocuments({ status: 'active' });
  return { wrote: true, readBack, deleted, leftover, activeSites };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database handle unavailable');
    const result = await runOpsRunnerSelfTest(db);
    console.log(JSON.stringify({ selftest: 'ops-runner', database: mongoose.connection.name, ...result }));
    if (!result.readBack || !result.deleted || result.leftover !== 0) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[ops-runner-selftest] failed: ${(error as Error)?.name || 'Error'}`);
    process.exitCode = 1;
  });
}
