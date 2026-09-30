import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import { main, paymentCas, buildGrandRockPaymentSettings, assertPlatformAccount, PAYMENT_API_ORIGIN } from '../scripts/configure-grand-rock-payments';
import { getTenantStripeConfig, stripeCredentialMode } from '../services/tenantPayment.service';
import { connectDatabase } from '../config/database';

jest.mock('../config/database', () => ({ connectDatabase: jest.fn(), disconnectDatabase: jest.fn() }));
jest.mock('../services/tenantPayment.service', () => ({ getTenantStripeConfig: jest.fn(), stripeCredentialMode: jest.fn() }));
jest.mock('../utils/secretCrypto', () => ({ encryptSecret: jest.fn(() => 'encrypted-webhook-fixture'), decryptSecret: jest.fn(() => 'owned-signing-fixture') }));
jest.mock('stripe', () => ({ __esModule: true, default: jest.fn() }));
const id = new mongoose.Types.ObjectId('123456789012345678901234');
const sourceId = new mongoose.Types.ObjectId('123456789012345678901235');
const accountId = 'acct_fixture';
const publicKey = ['pk', 'live', 'fixture'].join('_'), secretKey = ['sk', 'live', 'fixture'].join('_');
const fp = crypto.createHash('sha256').update(`${publicKey}\u0000${secretKey}`).digest('hex');
const account = { id: accountId, country: 'GB', charges_enabled: true, payouts_enabled: true, business_type: 'corporation', company: { name: 'Foxes Technology' }, capabilities: { card_payments: 'active' } };
let dir: string, target: any, source: any, endpoints: any[], provider: any, tenants: any, bookings: any;
let logs: string[];
const cloneSettings = (value: any): any => value instanceof Date ? new Date(value.getTime()) : Array.isArray(value) ? value.map(cloneSettings) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneSettings(item)])) : value;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grand-rock-payment-'));
  target = { _id: id, slug: 'grand-rock-safari', status: 'active', customDomain: 'grandrocksafari.com', paymentSettings: { enabledGateways: ['pay-later'], ownPaymentGateway: false, allowPayAtLocation: true, stripe: { enabled: false }, operatorPreference: 'preserve' } };
  source = { _id: sourceId, slug: 'royal-cruise-hurghada', status: 'active', paymentSettings: { ownPaymentGateway: false, stripe: { enabled: true, publishableKey: publicKey, secretKeyEnc: 'source-encrypted-key', webhookSecretEnc: 'source-encrypted-webhook', verifiedAccountId: accountId, verifiedCredentialFingerprint: fp, webhookVerifiedAt: new Date(), credentialsVerifiedAt: new Date() } } };
  jest.mocked(getTenantStripeConfig).mockResolvedValue({ enabled: true, publishableKey: publicKey, secretKey, webhookSecret: 'source-signing-fixture', verifiedAccountId: accountId, verifiedCredentialFingerprint: fp, credentialsVerifiedAt: new Date(), webhookVerifiedAt: new Date() });
  jest.mocked(stripeCredentialMode).mockReturnValue('live');
  endpoints = [];
  provider = { accounts: { retrieve: jest.fn(async () => account) }, countrySpecs: { retrieve: jest.fn(async () => ({ supported_payment_currencies: ['eur', 'gbp'] })) }, webhookEndpoints: {
    list: jest.fn(async () => ({ data: endpoints, has_more: false })),
    create: jest.fn(async (params: any) => { const endpoint = { ...params, id: 'we_owned', secret: 'owned-signing-fixture', status: 'enabled' }; endpoints.push(endpoint); return endpoint; }),
    retrieve: jest.fn(async (endpointId: string) => endpoints.find(row => row.id === endpointId)),
    del: jest.fn(async (endpointId: string) => { endpoints = endpoints.filter(row => row.id !== endpointId); return { deleted: true }; }),
  } };
  jest.mocked(Stripe).mockImplementation(() => provider);
  tenants = { findOne: jest.fn(async (filter: any) => {
    if (filter.slug === source.slug) return { ...source, paymentSettings: cloneSettings(source.paymentSettings) };
    if (filter._id && String(filter._id) === String(sourceId)) return JSON.stringify(filter.paymentSettings) === JSON.stringify(source.paymentSettings) ? source : null;
    if (filter.slug !== target.slug || target.status !== 'active' || target.customDomain !== 'grandrocksafari.com') return null;
    if ('paymentSettings' in filter) return JSON.stringify(filter.paymentSettings) === JSON.stringify(target.paymentSettings) ? target : null;
    return { ...target, paymentSettings: cloneSettings(target.paymentSettings) };
  }), updateOne: jest.fn(async (filter: any, update: any) => {
    if (JSON.stringify(filter.paymentSettings) !== JSON.stringify(target.paymentSettings)) return { modifiedCount: 0 };
    if (update.$set) target.paymentSettings = update.$set.paymentSettings; else delete target.paymentSettings;
    return { modifiedCount: 1 };
  }) };
  bookings = { countDocuments: jest.fn(async () => 0) };
  jest.spyOn(mongoose.connection, 'collection').mockImplementation((name: string) => (name === 'tenants' ? tenants : bookings) as any);
  logs = []; jest.spyOn(console, 'log').mockImplementation(value => logs.push(String(value)));
});
afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); rmSync(dir, { recursive: true, force: true }); });
const fence = ['--confirm-tenant=grand-rock-safari', '--confirm-account=platform-live', `--confirm-api=${PAYMENT_API_ORIGIN}`];
const run = (mode?: string) => main([...(mode ? [mode, ...fence] : []), `--receipt=${join(dir, 'private-receipt.json')}`]);

describe('Grand Rock existing platform LIVE payment configuration', () => {
  it('is provider-read-only by default and prints no keys or full settings', async () => {
    await run(); expect(provider.webhookEndpoints.create).not.toHaveBeenCalled(); expect(tenants.updateOne).not.toHaveBeenCalled();
    expect(logs.join(' ')).not.toContain(publicKey); expect(logs.join(' ')).not.toContain(secretKey); expect(logs.join(' ')).not.toContain('operatorPreference');
  });
  it('requires exact consequential fences before connecting', async () => {
    await expect(main(['--apply'])).rejects.toThrow('fences'); expect(connectDatabase).not.toHaveBeenCalled();
    await expect(main(['--apply', '--restore', ...fence])).rejects.toThrow('Choose');
  });
  it('rejects TEST or unverified/mismatched credentials before provider mutation', async () => {
    jest.mocked(stripeCredentialMode).mockReturnValue('test'); await expect(run('--apply')).rejects.toThrow('credentials');
    jest.mocked(stripeCredentialMode).mockReturnValue('live'); jest.mocked(getTenantStripeConfig).mockResolvedValue({ enabled: true, publishableKey: publicKey, secretKey, webhookSecret: 'signing', verifiedAccountId: accountId, credentialsVerifiedAt: new Date(), webhookVerifiedAt: new Date(), verifiedCredentialFingerprint: 'wrong' });
    await expect(run('--apply')).rejects.toThrow('credentials'); expect(provider.webhookEndpoints.create).not.toHaveBeenCalled();
  });
  it('rejects wrong account, business owner, disabled charges or unsupported currency', async () => {
    for (const patch of [{ id: 'other' }, { charges_enabled: false }, { payouts_enabled: false }, { company: { name: 'Other business' } }, { capabilities: { card_payments: 'inactive' } }]) expect(() => assertPlatformAccount({ ...account, ...patch } as any, accountId)).toThrow();
    provider.countrySpecs.retrieve.mockResolvedValue({ supported_payment_currencies: ['gbp'] }); await expect(run('--apply')).rejects.toThrow('EUR'); expect(provider.webhookEndpoints.create).not.toHaveBeenCalled();
  });
  it('preserves offline and unrelated settings, but does not claim webhook delivery', () => {
    const original = { allowPayAtLocation: false, other: 'keep', stripe: { configRevision: 4 } };
    const next = buildGrandRockPaymentSettings(original, source.paymentSettings, 'encrypted');
    expect(next.other).toBe('keep'); expect(next.allowPayAtLocation).toBe(false); expect(next.ownPaymentGateway).toBe(false);
    expect(next.stripe.configRevision).toBe(5); expect(next.stripe.webhookVerifiedAt).toBeNull(); expect(next.stripe.webhookSecretEnc).not.toBe(source.paymentSettings.stripe.webhookSecretEnc);
    expect(next.stripe.webhookContextFingerprint).toBe(crypto.createHash('sha256').update('owned-signing-fixture').digest('hex'));
    expect(() => buildGrandRockPaymentSettings(original, source.paymentSettings, '')).toThrow();
  });
  it('CAS is exact target/status/domain/payment snapshot', () => {
    const filter = paymentCas(String(id), target.paymentSettings); expect(String(filter._id)).toBe(String(id)); expect(filter).toMatchObject({ slug: target.slug, status: 'active', customDomain: target.customDomain, paymentSettings: target.paymentSettings });
    expect(paymentCas(String(id), undefined).paymentSettings).toEqual({ $exists: false });
  });
  it('creates an owned webhook, applies once, resumes, and restores only its own endpoint', async () => {
    const original = JSON.stringify(target.paymentSettings);
    await run('--apply'); expect(provider.webhookEndpoints.create).toHaveBeenCalledTimes(1);
    expect(target.paymentSettings.stripe.enabled).toBe(true); expect(target.paymentSettings.operatorPreference).toBe('preserve'); expect(target.paymentSettings.stripe.webhookVerifiedAt).toBeNull();
    await run('--apply'); expect(provider.webhookEndpoints.create).toHaveBeenCalledTimes(1);
    const receipt = readFileSync(join(dir, 'private-receipt.json'), 'utf8'); expect(receipt).not.toContain(secretKey); expect(receipt).not.toContain('owned-signing-fixture');
    await run('--restore'); expect(JSON.stringify(target.paymentSettings)).toBe(original); expect(endpoints).toHaveLength(0);
  });
  it('refuses adopting existing gateway or unowned endpoint', async () => {
    target.paymentSettings.stripe.secretKeyEnc = 'existing'; await expect(run('--apply')).rejects.toThrow('existing gateway');
    delete target.paymentSettings.stripe.secretKeyEnc; endpoints.push({ id: 'foreign', url: `${PAYMENT_API_ORIGIN}/api/payments/webhook/${id}`, metadata: {}, status: 'enabled' });
    await expect(run('--apply')).rejects.toThrow('existing gateway'); expect(provider.webhookEndpoints.create).not.toHaveBeenCalled();
  });
  it('keeps a concurrent source or target edit instead of overwriting it', async () => {
    provider.webhookEndpoints.retrieve.mockImplementation(async (endpointId: string) => { source.paymentSettings.changed = true; return endpoints.find(row => row.id === endpointId); });
    await expect(run('--apply')).rejects.toThrow('Source platform'); expect(target.paymentSettings.stripe.enabled).toBe(false);
  });
  it('refuses restore after provider-bound bookings and preserves enabled gateway', async () => {
    await run('--apply'); bookings.countDocuments.mockResolvedValue(1);
    await expect(run('--restore')).rejects.toThrow('reconciliation'); expect(target.paymentSettings.stripe.enabled).toBe(true); expect(provider.webhookEndpoints.del).not.toHaveBeenCalled();
  });
});
