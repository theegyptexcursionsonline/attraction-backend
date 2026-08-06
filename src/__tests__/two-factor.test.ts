import { spawnSync } from 'child_process';
import path from 'path';
import { generateTwoFactorRecoveryCodes } from '../utils/twoFactor';

describe('admin two-factor authentication primitives', () => {
  it('creates unique one-time recovery codes in the accepted format', () => {
    const codes = generateTwoFactorRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(codes.every((code) => /^AN-[A-F0-9]{4}-[A-F0-9]{4}$/.test(code))).toBe(true);
  });

  it('encrypts the secret, renders a QR code, accepts a valid TOTP and rejects replay', () => {
    const script = `
      require('ts-node/register');
      const { generate } = require('otplib');
      const { decryptSecret } = require('./src/utils/secretCrypto');
      const { createTwoFactorSetup, verifyTwoFactorCode } = require('./src/utils/twoFactor');
      (async () => {
        const setup = await createTwoFactorSetup('admin@example.com');
        const token = await generate({ secret: setup.manualSecret });
        const first = await verifyTwoFactorCode({ encryptedSecret: setup.encryptedSecret, token });
        const replay = await verifyTwoFactorCode({ encryptedSecret: setup.encryptedSecret, token, afterTimeStep: first.timeStep });
        const wrong = await verifyTwoFactorCode({ encryptedSecret: setup.encryptedSecret, token: '000000' });
        process.stdout.write(JSON.stringify({
          secretEncrypted: !setup.encryptedSecret.includes(setup.manualSecret),
          decrypts: decryptSecret(setup.encryptedSecret) === setup.manualSecret,
          qr: setup.qrCodeDataUrl.startsWith('data:image/png;base64,'),
          firstValid: first.valid,
          hasTimeStep: Number.isInteger(first.timeStep),
          replayRejected: !replay.valid,
          wrongRejected: !wrong.valid,
        }));
      })().catch((error) => { console.error(error.message); process.exit(1); });
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
      env: { ...process.env, ENCRYPTION_KEY: 'test-two-factor-encryption-key-at-least-32-characters' },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      secretEncrypted: true,
      decrypts: true,
      qr: true,
      firstValid: true,
      hasTimeStep: true,
      replayRejected: true,
      wrongRejected: true,
    });
  });
});
