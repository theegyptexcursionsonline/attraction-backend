import crypto from 'crypto';
import { env } from '../config/env';

const BUNDLE_ACCESS_TTL_SECONDS = 30 * 24 * 60 * 60;

const payload = (orderId: string, reference: string, expiresAt: number): string =>
  `bundle-access:v2:${orderId}:${reference.trim().toUpperCase()}:${expiresAt}`;

const signature = (orderId: string, reference: string, expiresAt: number): string =>
  crypto.createHmac('sha256', env.bookingAccessSecret)
    .update(payload(orderId, reference, expiresAt))
    .digest('base64url');

export const generateBundleAccessToken = (orderId: string, reference: string): string => {
  const expiresAt = Math.floor(Date.now() / 1000) + BUNDLE_ACCESS_TTL_SECONDS;
  return `${expiresAt}.${signature(orderId, reference, expiresAt)}`;
};

export const verifyBundleAccessToken = (
  suppliedToken: unknown,
  orderId: string,
  reference: string
): boolean => {
  if (typeof suppliedToken !== 'string' || !suppliedToken) return false;
  const separator = suppliedToken.indexOf('.');
  if (separator <= 0 || separator !== suppliedToken.lastIndexOf('.')) return false;
  const expiresAtText = suppliedToken.slice(0, separator);
  if (!/^\d{10}$/.test(expiresAtText)) return false;
  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signature(orderId, reference, expiresAt));
  const supplied = Buffer.from(suppliedToken.slice(separator + 1));
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
};
