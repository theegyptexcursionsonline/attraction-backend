describe('production secret separation', () => {
  const originalEnv = { ...process.env };

  const loadEnv = (): Record<string, unknown> => {
    let loaded: Record<string, unknown> = {};
    jest.isolateModules(() => {
      loaded = require('../config/env').env as Record<string, unknown>;
    });
    return loaded;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'jwt-production-secret';
    process.env.ENCRYPTION_KEY = 'encryption-production-secret';
    process.env.REQUIRE_DEDICATED_ENCRYPTION_KEY = 'false';
    process.env.BOOKING_ACCESS_SECRET = 'booking-access-production-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('allows the transitional production bridge without ENCRYPTION_KEY', () => {
    process.env.ENCRYPTION_KEY = '';
    expect(loadEnv()).toMatchObject({
      encryptionKey: '',
      legacyEncryptionKey: 'jwt-production-secret',
      hasDedicatedEncryptionKey: false,
      requireDedicatedEncryptionKey: false,
    });
  });

  it('requires ENCRYPTION_KEY after the migration enforcement flag is enabled', () => {
    process.env.ENCRYPTION_KEY = '';
    process.env.REQUIRE_DEDICATED_ENCRYPTION_KEY = 'true';
    expect(loadEnv).toThrow(
      'ENCRYPTION_KEY environment variable is required when REQUIRE_DEDICATED_ENCRYPTION_KEY=true'
    );
  });

  it('requires ENCRYPTION_KEY to differ from JWT_SECRET in production', () => {
    process.env.ENCRYPTION_KEY = process.env.JWT_SECRET;
    expect(loadEnv).toThrow('ENCRYPTION_KEY must be distinct from JWT_SECRET in production');
  });

  it('requires BOOKING_ACCESS_SECRET in production', () => {
    process.env.BOOKING_ACCESS_SECRET = '';
    expect(loadEnv).toThrow('BOOKING_ACCESS_SECRET environment variable is required in production');
  });

  it('requires BOOKING_ACCESS_SECRET to differ from JWT_SECRET in production', () => {
    process.env.BOOKING_ACCESS_SECRET = process.env.JWT_SECRET;
    expect(loadEnv).toThrow('BOOKING_ACCESS_SECRET must be distinct from JWT_SECRET in production');
  });

  it('accepts independent production secrets', () => {
    expect(loadEnv()).toMatchObject({
      jwtSecret: 'jwt-production-secret',
      encryptionKey: 'encryption-production-secret',
      legacyEncryptionKey: 'jwt-production-secret',
      hasDedicatedEncryptionKey: true,
      bookingAccessSecret: 'booking-access-production-secret',
    });
  });

  it('keeps development workable with local fallbacks', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENCRYPTION_KEY = '';
    process.env.BOOKING_ACCESS_SECRET = '';
    expect(loadEnv()).toMatchObject({
      encryptionKey: 'jwt-production-secret',
      bookingAccessSecret: 'jwt-production-secret',
    });
  });

  it('fails closed when Railway production omits NODE_ENV', () => {
    delete process.env.NODE_ENV;
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    expect(loadEnv()).toMatchObject({
      nodeEnv: 'production',
      isProd: true,
      isDev: false,
    });
  });
});

describe('secret encryption rotation bridge', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../config/env');
  });

  const encryptWithKey = (plain: string, secret: string): string => {
    const crypto = require('crypto') as typeof import('crypto');
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = Buffer.alloc(12, 7);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
  };

  it('decrypts legacy JWT ciphertext and exposes it for idempotent migration', () => {
    jest.doMock('../config/env', () => ({
      env: {
        encryptionKey: 'new-primary-key',
        legacyEncryptionKey: 'legacy-jwt-key',
      },
    }));

    jest.isolateModules(() => {
      const cryptoUtils = require('../utils/secretCrypto') as typeof import('../utils/secretCrypto');
      const legacyPayload = encryptWithKey('sk_live_legacy', 'legacy-jwt-key');
      expect(cryptoUtils.decryptSecretWithSource(legacyPayload)).toEqual({
        value: 'sk_live_legacy',
        source: 'legacy',
      });

      const migrated = cryptoUtils.reencryptLegacySecret(legacyPayload);
      expect(migrated).not.toBe(legacyPayload);
      expect(cryptoUtils.decryptSecretWithSource(migrated)).toEqual({
        value: 'sk_live_legacy',
        source: 'primary',
      });
      expect(cryptoUtils.reencryptLegacySecret(migrated)).toBe(migrated);
    });
  });

  it('keeps legacy decrypt available but blocks new encryption without a primary key', () => {
    jest.doMock('../config/env', () => ({
      env: { encryptionKey: '', legacyEncryptionKey: 'legacy-jwt-key' },
    }));

    jest.isolateModules(() => {
      const cryptoUtils = require('../utils/secretCrypto') as typeof import('../utils/secretCrypto');
      const legacyPayload = encryptWithKey('whsec_legacy', 'legacy-jwt-key');
      expect(cryptoUtils.decryptSecret(legacyPayload)).toBe('whsec_legacy');
      expect(() => cryptoUtils.encryptSecret('sk_live_new')).toThrow(
        'ENCRYPTION_KEY is required before storing new encrypted secrets'
      );
    });
  });
});
