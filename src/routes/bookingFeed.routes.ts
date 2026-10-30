import { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Booking } from '../models/Booking';
import { Tenant } from '../models/Tenant';
import {
  FEED_SIGNATURE_HEADER,
  FeedRequestError,
  buildFeedPage,
  feedQuery,
  parseFeedRequest,
  verifyFeedSignature,
  type FeedBookingRow,
  type FeedSite,
  type FeedTour,
} from '../utils/bookingFeed';

/**
 * GET /api/internal/booking-feed — the Foxes booking API's signed read of Attraction Network
 * bookings (`utils/bookingFeed.ts`). One consumer, one secret (`BOOKING_FEED_SECRET`); without the
 * secret the feed answers 503 and reads nothing. Nothing about a guest is logged.
 *
 * Mounted ahead of the general API limiter with its own: the consumer polls every few minutes and
 * scans the service-day window hourly, and must not share a 100-per-15-minutes budget with whoever
 * else leaves the same egress address.
 */

const PROJECTION = {
  reference: 1, tenantId: 1, sellerTenantId: 1, attractionId: 1, items: 1, guestDetails: 1, total: 1, refundedAmount: 1,
  currency: 1, status: 1, paymentStatus: 1, paymentMethod: 1, attendanceStatus: 1, bundleOrderId: 1, updatedAt: 1,
} as const;

export const bookingFeedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

const objectIds = (values: unknown[]) => [...new Set(values.map((value) => String(value ?? '')).filter((value) => /^[a-f0-9]{24}$/i.test(value)))]
  .map((value) => new Types.ObjectId(value));

/** The site a guest booked on: the selling storefront for a resale or bundle service, else the booking's own site. */
const siteIdOf = (row: FeedBookingRow) => String(row.sellerTenantId || row.tenantId || '');

export async function getBookingFeed(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const secret = process.env.BOOKING_FEED_SECRET;
  if (!secret) {
    res.status(503).json({ success: false, error: 'Not configured' });
    return;
  }
  // The signature covers the path and query exactly as sent, so both are read from the raw URL.
  const url = new URL(req.originalUrl || req.url, 'http://booking-feed.invalid');
  const params = url.searchParams;
  if (!verifyFeedSignature(secret, req.header(FEED_SIGNATURE_HEADER), req.method, url.pathname, params, Date.now() / 1000)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  let feed;
  try {
    feed = parseFeedRequest(params);
  } catch (error) {
    if (error instanceof FeedRequestError) {
      res.status(400).json({ success: false, error: 'Invalid request', field: error.field });
      return;
    }
    throw error;
  }

  try {
    const { filter, sort } = feedQuery(feed, new Date());
    // Read from the collection, not the model: the model's query hook hides bundle component
    // bookings from generic reads, and these are the services operations runs for a bundle.
    const rows = await Booking.collection.find(filter, { projection: PROJECTION }).sort(sort).limit(feed.limit + 1).toArray() as unknown as FeedBookingRow[];
    const page = rows.slice(0, feed.limit);
    const siteIds = objectIds(page.map(siteIdOf));
    const tourIds = objectIds(page.map((row) => row.attractionId));
    const [sites, tours] = await Promise.all([
      siteIds.length ? Tenant.collection.find({ _id: { $in: siteIds } }, { projection: { slug: 1, timezone: 1 } }).toArray() : [],
      tourIds.length ? Attraction.collection.find({ _id: { $in: tourIds } }, { projection: { title: 1 } }).toArray() : [],
    ]);
    const siteById = new Map(sites.map((site) => [String(site._id), site as unknown as FeedSite]));
    const tourById = new Map(tours.map((tour) => [String(tour._id), tour as unknown as FeedTour]));
    const data = buildFeedPage(
      feed,
      rows,
      (row) => ({ site: siteById.get(siteIdOf(row)) ?? null, tour: tourById.get(String(row.attractionId ?? '')) ?? null }),
      params.get('cursor'),
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error('Booking feed read failed.', { code: error instanceof Error ? error.name : 'UNKNOWN_ERROR' });
    res.status(503).json({ success: false, error: 'Feed unavailable' });
  }
}

/** Statuses of a site that can sell, or soon will. Anything else (inactive, suspended) is left out. */
const LISTED_SITE_STATUSES = ['active', 'pending', 'coming_soon'];
const MAX_SITES = 1000;

/**
 * GET /api/internal/booking-feed/sites — every network site the booking API may name, with the same
 * signature as the feed (no parameters), so operations can give a person access to a site before
 * its first booking. Slug, name and status only: nothing about a guest, a domain or a setting.
 */
export async function getFeedSites(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const secret = process.env.BOOKING_FEED_SECRET;
  if (!secret) {
    res.status(503).json({ success: false, error: 'Not configured' });
    return;
  }
  const url = new URL(req.originalUrl || req.url, 'http://booking-feed.invalid');
  if (!verifyFeedSignature(secret, req.header(FEED_SIGNATURE_HEADER), req.method, url.pathname, url.searchParams, Date.now() / 1000)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  if ([...url.searchParams.keys()].length) {
    res.status(400).json({ success: false, error: 'Invalid request', field: 'query' });
    return;
  }
  try {
    const rows = await Tenant.collection
      .find({ $or: [{ status: { $in: LISTED_SITE_STATUSES } }, { status: { $exists: false } }] }, { projection: { slug: 1, name: 1, status: 1 } })
      .sort({ slug: 1 })
      .limit(MAX_SITES + 1)
      .toArray();
    // More sites than one answer holds would make the list silently incomplete: say so instead.
    if (rows.length > MAX_SITES) {
      res.status(503).json({ success: false, error: 'Too many sites' });
      return;
    }
    const sites = rows
      .filter((row) => typeof row.slug === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(row.slug))
      .map((row) => ({ slug: row.slug as string, name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : row.slug, status: typeof row.status === 'string' ? row.status : null }));
    res.json({ success: true, data: { sites } });
  } catch (error) {
    console.error('Booking feed site list failed.', { code: error instanceof Error ? error.name : 'UNKNOWN_ERROR' });
    res.status(503).json({ success: false, error: 'Feed unavailable' });
  }
}

const router = Router();
router.get('/booking-feed', bookingFeedLimiter, (req, res, next) => {
  getBookingFeed(req, res).catch(next);
});
router.get('/booking-feed/sites', bookingFeedLimiter, (req, res, next) => {
  getFeedSites(req, res).catch(next);
});

export default router;
