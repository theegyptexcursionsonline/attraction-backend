/**
 * Email verification for self sign-ups, through the real app against a real database. With the switch on, a sign-up
 * opens no session and makes no admin notice or welcome email until the address's owner follows the emailed link; a
 * second sign-up never replaces a waiting account's password; a password reset confirms the address. With the switch
 * off, and for every account made before it, nothing changes.
 */
import http from 'http';
import { spawnSync } from 'child_process';
import request from '../test/loopbackRequest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import { User } from '../models/User';
import { env } from '../config/env';
import { sendEmailVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } from '../services/email.service';
import { createAdminNotifications } from '../services/notification.service';

jest.mock('../services/email.service', () => ({
  ...jest.requireActual('../services/email.service'),
  sendEmailVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendPasswordChangedEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
}));
jest.mock('../services/notification.service', () => ({ createAdminNotifications: jest.fn(() => Promise.resolve()) }));

jest.setTimeout(240_000);

const PASSWORD = 'FixturePasswordOnlyForLocalTests123!';
const OTHER_PASSWORD = 'AnotherFixturePassword456!';
const verificationMail = jest.mocked(sendEmailVerificationEmail);
const resetMail = jest.mocked(sendPasswordResetEmail);
const welcomeMail = jest.mocked(sendWelcomeEmail);
const adminNotice = jest.mocked(createAdminNotifications);

let mongo: MongoMemoryServer;
let server: http.Server;
const switchBefore = env.emailVerificationRequired;

const register = (email: string, password = PASSWORD) =>
  request(server).post('/api/auth/register').send({ email, password, firstName: 'Anna', lastName: 'Smith' });
const login = (email: string, password = PASSWORD) => request(server).post('/api/auth/login').send({ email, password });
const cookies = (response: request.Response): string[] => (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
const lastToken = () => verificationMail.mock.calls.at(-1)?.[1] as string;

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  mongo = await MongoMemoryServer.create(systemBinary ? { binary: { systemBinary } } : {});
  await mongoose.connect(mongo.getUri('email_verification'));
  server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
});

afterAll(async () => {
  (env as { emailVerificationRequired: boolean }).emailVerificationRequired = switchBefore;
  await new Promise((resolve) => server?.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(() => {
  jest.clearAllMocks();
  (env as { emailVerificationRequired: boolean }).emailVerificationRequired = true;
});

describe('with the switch off', () => {
  it('signs a new account in at once, as before', async () => {
    (env as { emailVerificationRequired: boolean }).emailVerificationRequired = false;
    const response = await register('qa-switch-off@example.invalid').expect(201);
    expect(response.body.data.user.email).toBe('qa-switch-off@example.invalid');
    expect(cookies(response).some((cookie) => cookie.startsWith('accessToken='))).toBe(true);
    expect(verificationMail).not.toHaveBeenCalled();
    expect(adminNotice).toHaveBeenCalledTimes(1);
    await login('qa-switch-off@example.invalid').expect(200);
  });
});

describe('a sign-up with the switch on', () => {
  const email = 'qa-new-customer@example.invalid';

  it('opens no session and makes no admin notice or welcome until the link is followed', async () => {
    const response = await register(email).expect(201);
    expect(response.body.data).toEqual({ requiresEmailVerification: true, email });
    expect(cookies(response).some((cookie) => cookie.startsWith('accessToken='))).toBe(false);
    expect(verificationMail).toHaveBeenCalledTimes(1);
    expect(verificationMail.mock.calls[0][0]).toBe(email);
    expect(adminNotice).not.toHaveBeenCalled();
    expect(welcomeMail).not.toHaveBeenCalled();
    const stored = await User.findOne({ email }).select('+emailVerificationToken');
    expect(stored?.emailVerificationRequired).toBe(true);
    // Only the hash is stored.
    expect(stored?.emailVerificationToken).not.toBe(lastToken());
  });

  it('refuses the right password until the address is confirmed, without mailing again within minutes', async () => {
    const response = await login(email).expect(403);
    expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(cookies(response).some((cookie) => cookie.startsWith('accessToken='))).toBe(false);
    expect(verificationMail).not.toHaveBeenCalled();
    // A wrong password learns nothing about the account's state.
    await login(email, OTHER_PASSWORD).expect(401);
  });

  it('keeps the first password when someone signs up again with the same address', async () => {
    await register(email, OTHER_PASSWORD).expect(409);
    const stored = await User.findOne({ email }).select('+password');
    expect(await stored!.comparePassword(PASSWORD)).toBe(true);
    expect(await stored!.comparePassword(OTHER_PASSWORD)).toBe(false);
  });

  it('confirms the address from the link, signs the person in and announces the account once', async () => {
    await User.updateOne({ email }, { $unset: { emailVerificationSentAt: 1 } });
    await request(server).post('/api/auth/resend-verification').send({ email }).expect(200);
    const token = lastToken();
    const response = await request(server).post('/api/auth/verify-email').send({ token }).expect(200);
    expect(response.body.data.user.email).toBe(email);
    expect(cookies(response).some((cookie) => cookie.startsWith('accessToken='))).toBe(true);
    expect(adminNotice).toHaveBeenCalledTimes(1);
    expect(welcomeMail).toHaveBeenCalledTimes(1);
    await request(server).post('/api/auth/verify-email').send({ token }).expect(400);
    await login(email).expect(200);
  });

  it('still signs up when the site header names no known site', async () => {
    await request(server).post('/api/auth/register').set('X-Tenant-ID', 'www.no-such-site.example')
      .send({ email: 'qa-unknown-site@example.invalid', password: PASSWORD, firstName: 'Anna', lastName: 'Smith' }).expect(201);
    expect(verificationMail.mock.calls.at(-1)?.[3]).toBeNull();
  });

  it('refuses an expired link', async () => {
    await register('qa-expired@example.invalid').expect(201);
    const token = lastToken();
    await User.updateOne({ email: 'qa-expired@example.invalid' }, { emailVerificationExpires: new Date(Date.now() - 1000) });
    await request(server).post('/api/auth/verify-email').send({ token }).expect(400);
  });
});

describe('the address owner of an account someone else created', () => {
  it('takes it over with a password reset, which confirms the address', async () => {
    const email = 'qa-taken-over@example.invalid';
    await register(email, OTHER_PASSWORD).expect(201);
    await request(server).post('/api/auth/forgot-password').send({ email }).expect(200);
    const resetToken = resetMail.mock.calls.at(-1)?.[1] as string;
    await request(server).post('/api/auth/reset-password').send({ token: resetToken, password: PASSWORD }).expect(200);
    await login(email, OTHER_PASSWORD).expect(401);
    await login(email).expect(200);
    expect(adminNotice).toHaveBeenCalledTimes(1);
  });
});

describe('resending a link', () => {
  it('answers the same for an unknown address and sends nothing', async () => {
    const response = await request(server).post('/api/auth/resend-verification').send({ email: 'qa-nobody@example.invalid' }).expect(200);
    expect(response.body.success).toBe(true);
    expect(verificationMail).not.toHaveBeenCalled();
  });
});

describe('an account made before the switch', () => {
  it('signs in as it always has', async () => {
    await User.create({ email: 'qa-existing@example.invalid', password: PASSWORD, firstName: 'QA', lastName: 'Existing', role: 'customer', status: 'active' });
    await login('qa-existing@example.invalid').expect(200);
  });
});

describe('one inbox, one account', () => {
  it('refuses another spelling of an inbox that already has an account, and mails nobody', async () => {
    await User.create({ email: 'qa.inbox.owner@gmail.com', password: PASSWORD, firstName: 'QA', lastName: 'Owner', role: 'customer', status: 'active' });
    await User.create({ email: 'qa-desk@example.invalid', password: PASSWORD, firstName: 'QA', lastName: 'Desk', role: 'customer', status: 'active' });
    for (const variant of ['qainboxowner@gmail.com', 'q.a.inbox.owner+promo@googlemail.com', 'QA.Inbox.Owner+x@Gmail.com', 'qa-desk+2@example.invalid']) {
      const response = await register(variant).expect(409);
      expect(response.body.error).toBe('Email already registered');
    }
    expect(verificationMail).not.toHaveBeenCalled();
    expect(await User.countDocuments({ email: { $in: ['qainboxowner@gmail.com', 'qa-desk+2@example.invalid'] } })).toBe(0);
  });

  it('still lets a different inbox sign up', async () => {
    await register('qa.inbox.owner2@gmail.com').expect(201);
    await register('qa-desk2@example.invalid').expect(201);
  });
});
