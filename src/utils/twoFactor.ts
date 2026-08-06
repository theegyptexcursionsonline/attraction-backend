import QRCode from 'qrcode';
import crypto from 'crypto';
import { decryptSecret, encryptSecret } from './secretCrypto';

// Use the package's CommonJS export in this CommonJS service. This also keeps
// Jest from following the optional ESM-only browser Base32 implementation.
const getOtplib = (): typeof import('otplib') => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('otplib') as typeof import('otplib');
};

export const TWO_FACTOR_ISSUER = 'Attractions Network';
export const TWO_FACTOR_SETUP_TTL_MS = 10 * 60 * 1000;

export function generateTwoFactorRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const value = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `AN-${value.slice(0, 4)}-${value.slice(4)}`;
  });
}

export async function createTwoFactorSetup(email: string): Promise<{
  encryptedSecret: string;
  manualSecret: string;
  qrCodeDataUrl: string;
  expiresAt: Date;
}> {
  const { generateSecret, generateURI } = getOtplib();
  const manualSecret = generateSecret();
  const encryptedSecret = encryptSecret(manualSecret);
  const uri = generateURI({
    issuer: TWO_FACTOR_ISSUER,
    label: email,
    secret: manualSecret,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
  return {
    encryptedSecret,
    manualSecret,
    qrCodeDataUrl,
    expiresAt: new Date(Date.now() + TWO_FACTOR_SETUP_TTL_MS),
  };
}

export async function verifyTwoFactorCode({
  encryptedSecret,
  token,
  afterTimeStep,
}: {
  encryptedSecret: string;
  token: string;
  afterTimeStep?: number;
}): Promise<{ valid: boolean; timeStep?: number }> {
  const { verify } = getOtplib();
  const secret = decryptSecret(encryptedSecret);
  if (!secret) throw new Error('Two-factor secret could not be decrypted');
  const result = await verify({
    secret,
    token,
    epochTolerance: [30, 0],
    ...(afterTimeStep === undefined ? {} : { afterTimeStep }),
  });
  return result.valid && 'timeStep' in result
    ? { valid: true, timeStep: result.timeStep }
    : { valid: false };
}
