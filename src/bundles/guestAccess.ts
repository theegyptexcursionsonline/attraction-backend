import crypto from 'crypto';
import { env } from '../config/env';

const payload = (orderId: string, reference: string): string =>
  `bundle-access:v1:${orderId}:${reference.trim().toUpperCase()}`;

export const generateBundleAccessToken = (orderId: string, reference: string): string =>
  crypto.createHmac('sha256', env.bookingAccessSecret).update(payload(orderId, reference)).digest('base64url');

export const verifyBundleAccessToken = (
  suppliedToken: unknown,
  orderId: string,
  reference: string
): boolean => {
  if (typeof suppliedToken !== 'string' || !suppliedToken) return false;
  const expected = Buffer.from(generateBundleAccessToken(orderId, reference));
  const supplied = Buffer.from(suppliedToken);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
};
