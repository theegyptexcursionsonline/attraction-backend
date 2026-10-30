/**
 * The account-creation limit, kept in the database: five sign-ups per connection per hour, shared by every server
 * instance and kept across a restart or release. If the database can't be reached the sign-up goes on.
 */
import express from 'express';
import rateLimit from 'express-rate-limit';
import { spawnSync } from 'child_process';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from '../test/loopbackRequest';
import { registerLimiter } from '../middleware/rate-limit.middleware';
import { MongoRateLimitStore } from '../middleware/mongoRateLimitStore';

jest.setTimeout(120_000);
let mongo: MongoMemoryServer;

const appWith = (limiter: express.RequestHandler) => {
  const app = express();
  app.set('trust proxy', 1);
  app.post('/register', limiter, (_req, res) => res.status(201).json({ success: true }));
  return app;
};
/** A second server instance, or the same one after a release: its own limiter object, the same stored counts. */
const anotherInstance = () => rateLimit({ windowMs: 60 * 60 * 1000, max: 5, store: new MongoRateLimitStore('register:'), passOnStoreError: true, message: { success: false, error: 'Too many accounts created from this connection. Please try again later.' } });
const signUp = (app: express.Express, ip: string) => request(app).post('/register').set('x-forwarded-for', ip);

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  mongo = await MongoMemoryServer.create(systemBinary ? { binary: { systemBinary } } : {});
  await mongoose.connect(mongo.getUri('signup_limit'));
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('the account-creation limit', () => {
  it('counts successful sign-ups and stops a sixth from one connection within the hour', async () => {
    const app = appWith(registerLimiter);
    for (let index = 0; index < 5; index += 1) expect((await signUp(app, '198.51.100.41')).status).toBe(201);
    const sixth = await signUp(app, '198.51.100.41');
    expect(sixth.status).toBe(429);
    expect(sixth.body.error).toMatch(/too many accounts/i);
    expect((await signUp(app, '198.51.100.42')).status).toBe(201);
  });

  it('keeps the count for another instance and after a restart', async () => {
    expect((await signUp(appWith(anotherInstance()), '198.51.100.41')).status).toBe(429);
    for (let index = 0; index < 4; index += 1) expect((await signUp(appWith(anotherInstance()), '198.51.100.43')).status).toBe(201);
    expect((await signUp(appWith(registerLimiter), '198.51.100.43')).status).toBe(201);
    expect((await signUp(appWith(anotherInstance()), '198.51.100.43')).status).toBe(429);
  });

  it('starts again once the hour is over', async () => {
    await mongoose.connection.collection('ratelimits').updateOne({ _id: 'register:198.51.100.41' as never }, { $set: { resetAt: new Date(Date.now() - 1000) } });
    expect((await signUp(appWith(registerLimiter), '198.51.100.41')).status).toBe(201);
    const stored = await mongoose.connection.collection('ratelimits').findOne({ _id: 'register:198.51.100.41' as never });
    expect(stored?.hits).toBe(1);
    expect(stored?.resetAt.getTime()).toBeGreaterThan(Date.now() + 59 * 60 * 1000);
  });

  it('lets the sign-up through when the database cannot be reached', async () => {
    await mongoose.disconnect();
    expect((await signUp(appWith(anotherInstance()), '198.51.100.41')).status).toBe(201);
    await mongoose.connect(mongo.getUri('signup_limit'));
  });
});
