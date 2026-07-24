/**
 * Stop-sale blocked dates became a PUBLIC read so guest booking calendars can
 * disable stop-sale days (they previously 401'd and silently treated every day
 * as bookable — issue #73). These lock the boundaries that come with that:
 *  - the tenant filter is ANDed into the attraction lookup (rule B1), so a
 *    cross-tenant id is indistinguishable from a missing one,
 *  - only publicly visible (active) attractions expose their blocked days,
 *  - guests receive DATES ONLY — never the operator's blocking reason,
 *    capacity or internal notes,
 *  - admins keep the full records.
 */

import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { getBlockedDates } from '../controllers/attractions.controller';

jest.mock('../models/Attraction', () => ({
  Attraction: { exists: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../models/Availability', () => ({ Availability: { find: jest.fn() } }));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockBlocked = (rows: unknown[]) => {
  const lean = jest.fn().mockResolvedValue(rows);
  const sort = jest.fn().mockReturnValue({ lean });
  (Availability.find as jest.Mock).mockReturnValue({ sort });
};

const attractionId = new Types.ObjectId().toString();

describe('public blocked-dates read', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scopes the attraction lookup to the active tenant and active status', async () => {
    const tenantId = new Types.ObjectId();
    (Attraction.exists as jest.Mock).mockResolvedValue(null);

    await getBlockedDates(
      { tenant: { _id: tenantId }, params: { id: attractionId }, query: {} } as never,
      response(),
      jest.fn()
    );

    expect(Attraction.exists).toHaveBeenCalledWith({
      _id: attractionId,
      status: 'active',
      tenantIds: { $in: [tenantId] },
    });
  });

  it('404s a guest when the attraction is not visible to this tenant', async () => {
    (Attraction.exists as jest.Mock).mockResolvedValue(null);
    const res = response();

    await getBlockedDates(
      { tenant: { _id: new Types.ObjectId() }, params: { id: attractionId }, query: {} } as never,
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(Availability.find).not.toHaveBeenCalled();
  });

  it('404s an unparseable id instead of throwing', async () => {
    const res = response();

    await getBlockedDates(
      { params: { id: 'not-an-object-id' }, query: {} } as never,
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(Attraction.exists).not.toHaveBeenCalled();
  });

  it('returns dates only to a guest — no reason, capacity or notes', async () => {
    (Attraction.exists as jest.Mock).mockResolvedValue({ _id: attractionId });
    const date = new Date('2026-08-01T00:00:00.000Z');
    mockBlocked([
      { date, isBlocked: true, blockReason: 'private charter for VIP client', allDayCapacity: 12 },
    ]);
    const res = response();

    await getBlockedDates({ params: { id: attractionId }, query: {} } as never, res, jest.fn());

    const payload = res.json.mock.calls[0][0];
    const rows = payload.data ?? payload;
    expect(rows).toEqual([{ date }]);
    expect(JSON.stringify(rows)).not.toContain('private charter');
  });

  it('gives an admin caller the full records', async () => {
    const date = new Date('2026-08-01T00:00:00.000Z');
    const full = { date, isBlocked: true, blockReason: 'maintenance', allDayCapacity: 12 };
    mockBlocked([full]);
    const res = response();

    await getBlockedDates(
      { user: { role: 'super-admin' }, params: { id: attractionId }, query: {} } as never,
      res,
      jest.fn()
    );

    const payload = res.json.mock.calls[0][0];
    const rows = payload.data ?? payload;
    expect(rows).toEqual([full]);
    // Admin path must not be gated behind the public active-attraction check.
    expect(Attraction.exists).not.toHaveBeenCalled();
  });

  it('still applies the requested date window', async () => {
    (Attraction.exists as jest.Mock).mockResolvedValue({ _id: attractionId });
    mockBlocked([]);

    await getBlockedDates(
      { params: { id: attractionId }, query: { from: '2026-08-01', to: '2026-08-31' } } as never,
      response(),
      jest.fn()
    );

    const query = (Availability.find as jest.Mock).mock.calls[0][0];
    expect(query.isBlocked).toBe(true);
    expect(query.date.$gte).toEqual(new Date('2026-08-01'));
    expect(query.date.$lte).toEqual(new Date('2026-08-31'));
  });
});
