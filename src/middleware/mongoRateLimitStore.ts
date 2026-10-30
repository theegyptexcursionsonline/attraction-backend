import mongoose from 'mongoose';
import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';

/**
 * A rate-limit counter kept in the database, so it is shared by every server instance and survives a restart or a
 * release (the default store lives in one process's memory). One atomic update per hit: a window that has ended starts
 * again at one. Finished windows are removed by a TTL index on `resetAt`.
 */
export class MongoRateLimitStore implements Store {
  windowMs = 60_000;
  readonly prefix: string;
  private indexed = false;

  constructor(prefix: string, private readonly collectionName = 'ratelimits') {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private get collection() {
    return mongoose.connection.collection<{ _id: string; hits: number; resetAt: Date }>(this.collectionName);
  }

  private async ensureIndex(): Promise<void> {
    if (this.indexed) return;
    await this.collection.createIndex({ resetAt: 1 }, { expireAfterSeconds: 0, name: 'reset_ttl' });
    this.indexed = true;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    // A closed connection would queue the update until it reopens; refuse at once instead (the limiter lets the
    // request through and logs it, see `passOnStoreError`).
    if (mongoose.connection.readyState !== 1) throw new Error('rate-limit store: database not connected');
    await this.ensureIndex();
    const now = new Date();
    const open = { $gt: ['$resetAt', now] };
    const doc = await this.collection.findOneAndUpdate(
      { _id: `${this.prefix}${key}` },
      [{ $set: { hits: { $cond: [open, { $add: ['$hits', 1] }, 1] }, resetAt: { $cond: [open, '$resetAt', new Date(now.getTime() + this.windowMs)] } } }],
      { upsert: true, returnDocument: 'after' }
    );
    return { totalHits: doc?.hits ?? 1, resetTime: doc?.resetAt };
  }

  async decrement(key: string): Promise<void> {
    if (mongoose.connection.readyState !== 1) return;
    await this.collection.updateOne({ _id: `${this.prefix}${key}`, hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }

  async resetKey(key: string): Promise<void> {
    if (mongoose.connection.readyState !== 1) return;
    await this.collection.deleteOne({ _id: `${this.prefix}${key}` });
  }
}
