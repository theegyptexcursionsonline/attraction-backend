import { encryptSecret, decryptSecret, secretHint } from '../utils/secretCrypto';
import {
  createPaymentIntent,
  constructWebhookEvent,
  retrievePaymentIntentStatus,
} from '../services/stripe.service';

describe('secretCrypto — encryption for tenant-held payment secrets', () => {
  it('round-trips a secret through encrypt → decrypt', async () => {
    const secret = 'sk_test_ABCdef1234567890';
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret); // never stored in the clear
    expect(enc.split(':')).toHaveLength(3); // iv:tag:ciphertext
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptSecret('whsec_same');
    const b = encryptSecret('whsec_same');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('whsec_same');
    expect(decryptSecret(b)).toBe('whsec_same');
  });

  it('returns empty (never throws) on tampered or malformed input', () => {
    const enc = encryptSecret('sk_test_tamper');
    const [iv, tag, data] = enc.split(':');
    const tampered = `${iv}:${tag}:${Buffer.from('evil').toString('base64')}`;
    expect(decryptSecret(tampered)).toBe('');
    expect(decryptSecret('not-valid')).toBe('');
    expect(decryptSecret('')).toBe('');
    expect(decryptSecret(null)).toBe('');
  });

  it('encrypts empty as empty', () => {
    expect(encryptSecret('')).toBe('');
  });

  it('secretHint exposes only the last 4 chars', () => {
    expect(secretHint('sk_test_abcd1234')).toBe('1234');
    expect(secretHint('')).toBe('');
  });
});

describe('stripe.service — mock fallback when a tenant has no key', () => {
  it('createPaymentIntent returns a mock intent + client secret without a key', async () => {
    const pi = await createPaymentIntent(undefined, 19950, 'usd', { bookingId: 'b1' });
    expect(pi.id).toMatch(/^pi_mock_/);
    expect(pi.clientSecret).toContain('_secret_');
    expect(pi.amount).toBe(19950);
    expect(pi.currency).toBe('usd');
  });

  it('retrievePaymentIntentStatus resolves "succeeded" in mock mode', async () => {
    expect(await retrievePaymentIntentStatus(undefined, 'pi_mock_x')).toBe('succeeded');
  });

  it('constructWebhookEvent refuses to verify without a configured tenant', () => {
    expect(() => constructWebhookEvent(undefined, undefined, Buffer.from('{}'), 'sig')).toThrow();
    expect(() => constructWebhookEvent('sk_test_x', undefined, Buffer.from('{}'), 'sig')).toThrow();
  });
});
