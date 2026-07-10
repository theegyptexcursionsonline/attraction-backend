import crypto from 'crypto';
import { env } from '../config/env';

const tokenPayload = (bookingId: string, reference: string): string =>
  `booking-access:v1:${bookingId}:${reference.trim().toUpperCase()}`;

export const generateBookingAccessToken = (bookingId: string, reference: string): string =>
  crypto
    .createHmac('sha256', env.bookingAccessSecret)
    .update(tokenPayload(bookingId, reference))
    .digest('base64url');

export const verifyBookingAccessToken = (
  suppliedToken: unknown,
  bookingId: string,
  reference: string
): boolean => {
  if (typeof suppliedToken !== 'string' || !suppliedToken) return false;

  const expected = generateBookingAccessToken(bookingId, reference);
  const suppliedBuffer = Buffer.from(suppliedToken);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
};
