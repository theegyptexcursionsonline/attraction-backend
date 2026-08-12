import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import {
  assertOrderSelectionsTravelRules,
  BundleOrderError,
} from '../services/bundleOrder.service';

jest.mock('../models/Attraction', () => ({ Attraction: { find: jest.fn() } }));

const supplierTenantId = new Types.ObjectId();
const attractionId = new Types.ObjectId();
const supplyOfferId = new Types.ObjectId();
const session = {} as never;

const selection = {
  attractionId,
  supplyOfferId,
  supplierTenantId,
  date: '2030-04-01',
  time: '08:00',
};

const offer = {
  _id: supplyOfferId,
  supplierTenantId,
  validTravelFrom: new Date('2030-01-01T00:00:00.000Z'),
  validTravelTo: new Date('2030-12-31T23:59:59.999Z'),
  blackoutDates: [],
  leadTimeHours: 0,
  entryWindowLabels: ['Morning Session'],
};

const mockAttractions = (rows: unknown[]) => {
  const lean = jest.fn().mockResolvedValue(rows);
  const withSession = jest.fn().mockReturnValue({ lean });
  const select = jest.fn().mockReturnValue({ session: withSession });
  (Attraction.find as jest.Mock).mockReturnValue({ select });
  return { select, withSession };
};

describe('bundle order entry-window revalidation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reloads the attraction entry windows inside the order transaction', async () => {
    const query = mockAttractions([{
      _id: attractionId,
      ownerTenantId: supplierTenantId,
      entryWindows: [{ label: 'Morning Session', startTime: '08:00', endTime: '08:30' }],
    }]);

    await expect(assertOrderSelectionsTravelRules({
      selections: [selection],
      offers: [offer],
      session,
    })).resolves.toBeUndefined();

    expect(query.select).toHaveBeenCalledWith('ownerTenantId entryWindows');
    expect(query.withSession).toHaveBeenCalledWith(session);
  });

  it('still fails closed for a time outside the committed entry window', async () => {
    mockAttractions([{
      _id: attractionId,
      ownerTenantId: supplierTenantId,
      entryWindows: [{ label: 'Morning Session', startTime: '08:00', endTime: '08:30' }],
    }]);

    await expect(assertOrderSelectionsTravelRules({
      selections: [{ ...selection, time: '09:00' }],
      offers: [offer],
      session,
    })).rejects.toEqual(expect.objectContaining<Partial<BundleOrderError>>({
      code: 'OFFER_ENTRY_WINDOW',
    }));
  });

  it('rejects a supplier ownership change before inventory is reserved', async () => {
    mockAttractions([{
      _id: attractionId,
      ownerTenantId: new Types.ObjectId(),
      entryWindows: [{ label: 'Morning Session', startTime: '08:00', endTime: '08:30' }],
    }]);

    await expect(assertOrderSelectionsTravelRules({
      selections: [selection],
      offers: [offer],
      session,
    })).rejects.toEqual(expect.objectContaining<Partial<BundleOrderError>>({
      code: 'BUNDLE_SUPPLY_CHANGED',
      statusCode: 409,
    }));
  });
});
