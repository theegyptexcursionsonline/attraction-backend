import crypto from 'crypto';
import { env } from '../config/env';

const BUNDLE_ACCESS_TTL_SECONDS = 30 * 24 * 60 * 60;

const payload = (
  orderId: string,
  reference: string,
  epoch: number,
  expiresAt: number
): string =>
  `bundle-access:v3:${epoch}:${orderId}:${reference.trim().toUpperCase()}:${expiresAt}`;

const signature = (
  orderId: string,
  reference: string,
  epoch: number,
  expiresAt: number
): string =>
  crypto.createHmac('sha256', env.bookingAccessSecret)
    .update(payload(orderId, reference, epoch, expiresAt))
    .digest('base64url');

export const generateBundleAccessToken = (orderId: string, reference: string): string => {
  const expiresAt = Math.floor(Date.now() / 1000) + BUNDLE_ACCESS_TTL_SECONDS;
  return `v3.${env.bundleAccessTokenEpoch}.${expiresAt}.${signature(
    orderId,
    reference,
    env.bundleAccessTokenEpoch,
    expiresAt
  )}`;
};

export const verifyBundleAccessToken = (
  suppliedToken: unknown,
  orderId: string,
  reference: string
): boolean => {
  if (typeof suppliedToken !== 'string' || !suppliedToken) return false;
  const parts = suppliedToken.split('.');
  if (parts.length !== 4 || parts[0] !== 'v3') return false;
  const [, epochText, expiresAtText, suppliedSignature] = parts;
  if (!/^\d{1,9}$/.test(epochText)) return false;
  const epoch = Number(epochText);
  if (!Number.isSafeInteger(epoch) || epoch !== env.bundleAccessTokenEpoch) return false;
  if (!/^\d{10}$/.test(expiresAtText)) return false;
  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signature(orderId, reference, epoch, expiresAt));
  const supplied = Buffer.from(suppliedSignature);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
};
