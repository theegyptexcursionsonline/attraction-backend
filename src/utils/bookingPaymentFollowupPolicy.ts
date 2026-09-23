import { env } from '../config/env';

/** Only newly created checkouts after an explicit UTC rollout boundary qualify. */
export const paymentFollowupEnabledFor = (createdAt: unknown): boolean => {
  const boundary = env.bookingPaymentFollowupStartAt;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(boundary)) return false;
  const start = Date.parse(boundary);
  const now = Date.now();
  if (!Number.isFinite(start) || start > now) return false;
  const canonical = new Date(start).toISOString();
  if (canonical !== boundary && canonical.replace('.000Z', 'Z') !== boundary) return false;
  if (!(createdAt instanceof Date) && typeof createdAt !== 'string') return false;
  const created = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  return Number.isFinite(created) && created >= start && created <= now;
};
