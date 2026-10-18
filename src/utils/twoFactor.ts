import QRCode from 'qrcode';
import crypto from 'crypto';
import { decryptSecret, encryptSecret } from './secretCrypto';

// Production Node loads the package's CommonJS entry and its ESM dependency.
// Real crypto integration tests use a Node child because Jest's CJS VM cannot.
const getOtplib = (): typeof import('otplib') => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('otplib') as typeof import('otplib');
};

export const TWO_FACTOR_ISSUER = 'Attractions Network';
export const TWO_FACTOR_SETUP_TTL_MS = 10 * 60 * 1000;
const TWO_FACTOR_PERIOD_SECONDS = 30;

// Verification accepts the current and preceding 30-second step. A matched
// step cannot authorize a new session after the end of that exact window.
export const twoFactorProofDeadline = (timeStep: number): number => {
  if (!Number.isSafeInteger(timeStep) || timeStep < 0) throw new Error('Invalid authenticator time step');
  const deadline = (timeStep + 2) * TWO_FACTOR_PERIOD_SECONDS * 1000;
  if (!Number.isSafeInteger(deadline)) throw new Error('Invalid authenticator proof deadline');
  return deadline;
};

export function generateTwoFactorRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const value = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `AN-${value.slice(0, 4)}-${value.slice(4)}`;
  });
}

export async function createTwoFactorSetup(email: string, existing?: { encryptedSecret: string; expiresAt: Date }): Promise<{
  encryptedSecret: string;
  manualSecret: string;
  qrCodeDataUrl: string;
  expiresAt: Date;
}> {
  const { generateSecret, generateURI } = getOtplib();
  const manualSecret = existing ? decryptSecret(existing.encryptedSecret) : generateSecret();
  if (!manualSecret) throw new Error('Two-factor setup secret could not be decrypted');
  const encryptedSecret = existing?.encryptedSecret || encryptSecret(manualSecret);
  const uri = generateURI({
    issuer: TWO_FACTOR_ISSUER,
    label: email,
    secret: manualSecret,
    period: TWO_FACTOR_PERIOD_SECONDS,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
  return {
    encryptedSecret,
    manualSecret,
    qrCodeDataUrl,
    expiresAt: existing?.expiresAt || new Date(Date.now() + TWO_FACTOR_SETUP_TTL_MS),
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
    period: TWO_FACTOR_PERIOD_SECONDS,
    epochTolerance: [TWO_FACTOR_PERIOD_SECONDS, 0],
    ...(afterTimeStep === undefined ? {} : { afterTimeStep }),
  });
  return result.valid && 'timeStep' in result
    ? { valid: true, timeStep: result.timeStep }
    : { valid: false };
}
