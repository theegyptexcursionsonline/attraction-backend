/** Grand Rock platform-account configuration. Dry-run is read-only, including
 * Stripe account/currency/endpoint inspection. Apply and restore require exact
 * tenant, live-platform-account and backend fences. No charge or booking is
 * created. Private receipt contains encrypted snapshots only, never plaintext.
 */
import Stripe from 'stripe';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { getTenantStripeConfig, stripeCredentialMode } from '../services/tenantPayment.service';
import { encryptSecret, decryptSecret } from '../utils/secretCrypto';

export const GRAND_ROCK_PAYMENT_TENANT = 'grand-rock-safari';
export const PLATFORM_PAYMENT_SOURCE = 'royal-cruise-hurghada';
export const PAYMENT_API_ORIGIN = 'https://web-production-69d42.up.railway.app';
const PURPOSE = 'grand-rock-platform-online-payment';
const EVENTS = ['payment_intent.succeeded', 'payment_intent.payment_failed', 'charge.refunded', 'refund.created', 'refund.updated', 'refund.failed'] as Stripe.WebhookEndpointCreateParams.EnabledEvent[];
type Settings = Record<string, any>;
interface Receipt {
  version: 1; tenant: string; tenantId: string; source: string; sourceAccountId: string;
  sourceFingerprint: string; original?: Settings; next?: Settings;
  endpointId?: string; createdAt: string; state: string;
}
const fingerprint = (publicKey: string, secretKey: string) => crypto.createHash('sha256').update(`${publicKey}\u0000${secretKey}`).digest('hex');
const canonical = (value: unknown): string => JSON.stringify(pack(value));
function pack(value: any): any {
  if (value instanceof Date) return { $operationalDate: value.toISOString() };
  if (Array.isArray(value)) return value.map(pack);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, pack(item)]));
  return value;
}
function unpack(value: any): any {
  if (Array.isArray(value)) return value.map(unpack);
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && typeof value.$operationalDate === 'string') return new Date(value.$operationalDate);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unpack(item)]));
  }
  return value;
}
function save(path: string, receipt: Receipt): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(pack(receipt), null, 2), { mode: 0o600 }); renameSync(`${path}.tmp`, path);
}
export function paymentCas(tenantId: string, expected: Settings | undefined): Record<string, unknown> {
  return { _id: new mongoose.Types.ObjectId(tenantId), slug: GRAND_ROCK_PAYMENT_TENANT, status: 'active', customDomain: 'grandrocksafari.com', paymentSettings: expected === undefined ? { $exists: false } : expected };
}
export function assertPlatformAccount(account: Pick<Stripe.Account, 'id' | 'charges_enabled' | 'payouts_enabled' | 'business_type' | 'company' | 'business_profile' | 'capabilities'>, expectedAccount: string): void {
  const brand = [account.company?.name, account.business_profile?.name].filter(Boolean).join(' ');
  if (account.id !== expectedAccount || !account.charges_enabled || !account.payouts_enabled || account.capabilities?.card_payments !== 'active' || !['company', 'corporation'].includes(account.business_type || '') || !/foxes|egypt excursions/i.test(brand)) throw new Error('Verified LIVE platform business account is not ready');
}
export function buildGrandRockPaymentSettings(original: Settings | undefined, source: Settings, encryptedWebhook: string, now = new Date()): Settings {
  if (!encryptedWebhook) throw new Error('Owned webhook signing secret required');
  const signingSecret = decryptSecret(encryptedWebhook);
  if (!signingSecret) throw new Error('Owned webhook signing secret cannot be decrypted');
  const prior = original || {};
  return {
    ...prior,
    enabledGateways: [...new Set([...(prior.enabledGateways || []), 'stripe', 'pay-later'])],
    ownPaymentGateway: false,
    allowPayAtLocation: prior.allowPayAtLocation !== false,
    stripe: {
      ...(prior.stripe || {}), enabled: true,
      publishableKey: source.stripe.publishableKey,
      secretKeyEnc: source.stripe.secretKeyEnc,
      webhookSecretEnc: encryptedWebhook,
      previousWebhookSecretEnc: '', previousWebhookValidUntil: null,
      verifiedAccountId: source.stripe.verifiedAccountId,
      verifiedCredentialFingerprint: source.stripe.verifiedCredentialFingerprint,
      configuredAt: now, credentialsVerifiedAt: now,
      // A real signed provider event must establish delivery trust. Never copy
      // another tenant's webhook verification stamp into this tenant.
      webhookVerifiedAt: null,
      webhookContextFingerprint: crypto.createHash('sha256').update(signingSecret).digest('hex'),
      configRevision: Number(prior.stripe?.configRevision || 0) + 1,
      bindingFenceRevision: Number(prior.stripe?.bindingFenceRevision || 0) + 1,
    },
  };
}
function assertReceipt(receipt: Receipt, tenantId: string): void {
  if (receipt.version !== 1 || receipt.tenant !== GRAND_ROCK_PAYMENT_TENANT || receipt.source !== PLATFORM_PAYMENT_SOURCE || receipt.tenantId !== tenantId || !/^[a-f0-9]{24}$/.test(receipt.tenantId) || !receipt.sourceAccountId || !/^[a-f0-9]{64}$/.test(receipt.sourceFingerprint)) throw new Error('Receipt target mismatch');
  for (const settings of [receipt.original, receipt.next]) if (settings?.stripe && ['secretKey', 'webhookSecret', 'previousWebhookSecret'].some(key => !!settings.stripe[key])) throw new Error('Plaintext secret in receipt');
}
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const apply = argv.includes('--apply'), restore = argv.includes('--restore');
  if (apply && restore) throw new Error('Choose apply or restore');
  const arg = (key: string) => argv.find(value => value.startsWith(`${key}=`))?.slice(key.length + 1);
  if ((apply || restore) && (arg('--confirm-tenant') !== GRAND_ROCK_PAYMENT_TENANT || arg('--confirm-account') !== 'platform-live' || arg('--confirm-api') !== PAYMENT_API_ORIGIN)) throw new Error('Exact tenant, platform LIVE and backend fences required');
  const receiptPath = resolve(arg('--receipt') || 'readiness-proof/2026-09-30-grand-rock-payments/private-receipt.json');
  await connectDatabase();
  try {
    const tenants = mongoose.connection.collection('tenants');
    const tenant = await tenants.findOne({ slug: GRAND_ROCK_PAYMENT_TENANT, status: 'active', customDomain: 'grandrocksafari.com' });
    const source = await tenants.findOne({ slug: PLATFORM_PAYMENT_SOURCE, status: 'active', 'paymentSettings.stripe.enabled': true, 'paymentSettings.ownPaymentGateway': { $ne: true } });
    if (!tenant || !source) throw new Error('Exact target or existing platform source missing');
    const tenantId = String(tenant._id);
    const config = await getTenantStripeConfig(source._id);
    if (stripeCredentialMode(config) !== 'live' || !config?.secretKey || !config.webhookSecret || !config.verifiedAccountId || !config.credentialsVerifiedAt || !config.webhookVerifiedAt || config.verifiedCredentialFingerprint !== fingerprint(config.publishableKey, config.secretKey)) throw new Error('Existing platform credentials or binding are not ready');
    const stripe = new Stripe(config.secretKey);
    const account = await stripe.accounts.retrieve(); assertPlatformAccount(account, config.verifiedAccountId);
    const country = await stripe.countrySpecs.retrieve(account.country!);
    if (!country.supported_payment_currencies.includes('eur')) throw new Error('Platform account does not support EUR');
    const endpointUrl = `${PAYMENT_API_ORIGIN}/api/payments/webhook/${tenantId}`;
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    if (endpoints.has_more) throw new Error('Endpoint inventory incomplete; no mutation performed');
    const existingEndpoint = endpoints.data.find(endpoint => endpoint.url === endpointUrl);
    console.log(JSON.stringify({ mode: apply ? 'pre-apply' : restore ? 'pre-restore' : 'read-only', tenant: GRAND_ROCK_PAYMENT_TENANT, provider: 'Stripe', livePlatformBusinessAccount: true, eurSupported: true, chargesEnabled: true, payoutEnabled: true, ownPaymentGateway: false, targetStripeEnabled: !!tenant.paymentSettings?.stripe?.enabled, targetEndpointExists: !!existingEndpoint, serviceFeePercent: 5, providerMutations: apply || restore }));
    if (!apply && !restore) return;
    let receipt: Receipt;
    if (existsSync(receiptPath)) {
      receipt = unpack(JSON.parse(readFileSync(receiptPath, 'utf8'))); assertReceipt(receipt, tenantId);
      if (receipt.sourceAccountId !== account.id || receipt.sourceFingerprint !== config.verifiedCredentialFingerprint) throw new Error('Platform account changed since receipt');
    } else {
      if (restore) throw new Error('Restore receipt missing');
      if (existingEndpoint || tenant.paymentSettings?.stripe?.enabled || tenant.paymentSettings?.stripe?.secretKeyEnc || tenant.paymentSettings?.stripe?.webhookSecretEnc) throw new Error('Target has an existing gateway; refusing adoption or replacement');
      receipt = { version: 1, tenant: GRAND_ROCK_PAYMENT_TENANT, tenantId, source: PLATFORM_PAYMENT_SOURCE, sourceAccountId: account.id, sourceFingerprint: config.verifiedCredentialFingerprint!, original: tenant.paymentSettings, createdAt: new Date().toISOString(), state: 'prepared' }; save(receiptPath, receipt);
    }
    const paymentsMatch = (expected?: Settings) => canonical(tenant.paymentSettings) === canonical(expected);
    if (!paymentsMatch(receipt.original) && (!receipt.next || !paymentsMatch(receipt.next))) throw new Error('Concurrent payment configuration edit');
    if (restore) {
      const bound = await mongoose.connection.collection('bookings').countDocuments({ tenantId: tenant._id, $or: [{ stripePaymentIntentId: { $exists: true, $nin: ['', null] } }, { stripePaymentBinding: { $exists: true } }] });
      if (bound) throw new Error('Provider-bound bookings exist; restore requires reconciliation');
      if (receipt.next && !paymentsMatch(receipt.original)) {
        const result = await tenants.updateOne(paymentCas(tenantId, receipt.next), receipt.original === undefined ? { $unset: { paymentSettings: '' } } : { $set: { paymentSettings: receipt.original } });
        if (result.modifiedCount !== 1) throw new Error('Concurrent payment configuration edit during restore');
      }
      if (receipt.endpointId) {
        const endpoint = endpoints.data.find(item => item.id === receipt.endpointId);
        if (endpoint && (endpoint.url !== endpointUrl || endpoint.metadata.purpose !== PURPOSE || endpoint.metadata.tenant !== GRAND_ROCK_PAYMENT_TENANT)) throw new Error('Refusing to delete an unowned endpoint');
        if (endpoint) await stripe.webhookEndpoints.del(endpoint.id);
      }
      receipt.state = 'restored'; save(receiptPath, receipt);
      if (!await tenants.findOne(paymentCas(tenantId, receipt.original))) throw new Error('Restore verification failed');
      console.log(JSON.stringify({ mode: 'restored', tenant: GRAND_ROCK_PAYMENT_TENANT, gatewayRestored: true, ownedEndpointRemoved: true })); return;
    }
    if (!receipt.endpointId) {
      if (existingEndpoint && (existingEndpoint.metadata.purpose !== PURPOSE || existingEndpoint.metadata.tenant !== GRAND_ROCK_PAYMENT_TENANT)) throw new Error('Existing target endpoint is not owned by this operation');
      if (Date.now() - new Date(receipt.createdAt).getTime() >= 23 * 60 * 60 * 1000) throw new Error('Endpoint creation recovery window elapsed; inspect before retry');
      const endpoint = await stripe.webhookEndpoints.create({ url: endpointUrl, enabled_events: EVENTS, metadata: { purpose: PURPOSE, tenant: GRAND_ROCK_PAYMENT_TENANT } }, { idempotencyKey: `${PURPOSE}:${tenantId}:${receipt.createdAt}` });
      if (!endpoint.secret || endpoint.url !== endpointUrl || endpoint.status !== 'enabled') throw new Error('Owned endpoint creation did not return a signing secret');
      receipt.endpointId = endpoint.id;
      receipt.next = buildGrandRockPaymentSettings(receipt.original, source.paymentSettings, encryptSecret(endpoint.secret));
      receipt.state = 'endpoint-created'; save(receiptPath, receipt);
    }
    if (!receipt.next) throw new Error('Receipt has no configured payment snapshot');
    const endpoint = await stripe.webhookEndpoints.retrieve(receipt.endpointId);
    if (endpoint.url !== endpointUrl || endpoint.status !== 'enabled' || endpoint.metadata.purpose !== PURPOSE || endpoint.metadata.tenant !== GRAND_ROCK_PAYMENT_TENANT || EVENTS.some(event => !endpoint.enabled_events.includes(event))) throw new Error('Owned webhook endpoint is not ready');
    // Source revision is checked again before target CAS. Copy no modified key.
    const refreshedSource = await tenants.findOne({ _id: source._id, paymentSettings: source.paymentSettings });
    if (!refreshedSource) throw new Error('Source platform configuration changed');
    if (!paymentsMatch(receipt.next)) {
      const result = await tenants.updateOne(paymentCas(tenantId, receipt.original), { $set: { paymentSettings: receipt.next } });
      if (result.modifiedCount !== 1) throw new Error('Concurrent payment configuration edit during apply');
    }
    if (!await tenants.findOne(paymentCas(tenantId, receipt.next))) throw new Error('Post-apply payment verification failed');
    receipt.state = 'configured-delivery-pending'; save(receiptPath, receipt);
    console.log(JSON.stringify({ mode: receipt.state, tenant: GRAND_ROCK_PAYMENT_TENANT, stripeEnabled: true, platformSettlement: true, onlineChargeTested: false, realWebhookDeliveryVerified: false, privateRollbackReceiptSaved: true }));
  } finally { await disconnectDatabase(); }
}
if (require.main === module) main().catch(() => { console.error('Grand Rock payment operation stopped; inspect readiness and receipt without exposing secrets'); process.exitCode = 1; });
