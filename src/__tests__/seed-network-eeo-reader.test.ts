import { readEeoTour, serverPayload, snapshotAddon, snapshotOption, tripRecord } from '../scripts/network-sites/eeo-reader';
import { EEO_BASE, eeoProgramme } from '../scripts/network-sites/eeo-source';
import { withTrips } from '../scripts/read-eeo-snapshot';

/**
 * A trip page as the client's main site serves it: the record arrives in the Server Components payload, split over
 * several `self.__next_f.push` chunks, with a smaller card of the same trip elsewhere on the page.
 */
const RECORD = {
  _id: '03efe682a425981017cef045',
  title: 'VIP Grand Egyptian Museum Experience with Hotel Transfer',
  slug: 'vip-grand-egyptian-museum-experience-with-hotel-transfer',
  price: 85,
  discountPrice: 85,
  duration: '4 hours',
  languages: [],
  whatsIncluded: [],
  includes: ['All transfers by a private air-conditioned vehicle', 'Entry Fees', 'A brace { in a line }'],
  whatsNotIncluded: ['Tips'],
  whatToBring: ['Passport'],
  itinerary: [{ title: 'Pickup location:', description: 'Al Giza' }, { title: 'Grand Egyptian Museum', description: 'Giza', duration: '3 hours', icon: 'location' }],
  pricingSummary: { fromPrice: 85, currency: 'USD', version: 0 },
  bookingOptions: [{ pricingKey: 'page-only' }],
};
const CARD = { slug: RECORD.slug, title: RECORD.title, image: 'x.jpg' };

function page(chunks: string[]): string {
  return `<html><body>${chunks.map((chunk) => `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`).join('')}</body></html>`;
}

const PAYLOAD = `0:["$","div",null,{"card":${JSON.stringify(CARD)}}]\n1:{"tour":${JSON.stringify(RECORD)},"related":[]}\n`;
const HTML = page([PAYLOAD.slice(0, 40), PAYLOAD.slice(40, 333), PAYLOAD.slice(333)]);

const OPTIONS = [{
  id: 'option-0', pricingKey: 'grand-egyptian-museum-with-hotel-pickup-b3deaaec07e2', title: 'Grand Egyptian Museum With Hotel Pickup', type: 'Per Person',
  minCapacity: null, maxCapacity: null, price: 85, guestPrices: { adult: 85, child: 30, infant: 0 }, duration: '4 hours', languages: [],
  description: 'Hotel pickup in Cairo or Giza.', timeSlots: [{ id: 'slot-1', time: '08:00', available: 10, price: 85, guestPrices: { adult: 85, child: 30, infant: 0 }, isPopular: false }],
  highlights: [], groupSize: 'Max 10 people',
}];
const ADDONS = [{ id: 'a1', title: 'Photos', description: '', price: 20, category: 'Photography', perGuest: false, pricingMethod: 'per_booking', bookingOptionKeys: [], maxQuantity: 1, required: false }];

describe('reading a trip from the client main site', () => {
  it('joins the page payload and finds the trip record rather than a card of the same trip', () => {
    const payload = serverPayload(HTML);
    expect(payload).toBe(PAYLOAD);
    const record = tripRecord(payload, RECORD.slug);
    expect(record).toMatchObject({ _id: RECORD._id, includes: RECORD.includes });
    expect(tripRecord(payload, 'some-other-trip')).toBeNull();
    expect(serverPayload('<html></html>')).toBe('');
  });

  it('keeps only the option and extra fields the snapshot keeps', () => {
    expect(snapshotOption(OPTIONS[0])).toEqual({
      id: 'option-0',
      pricingKey: 'grand-egyptian-museum-with-hotel-pickup-b3deaaec07e2',
      title: 'Grand Egyptian Museum With Hotel Pickup',
      type: 'Per Person',
      description: 'Hotel pickup in Cairo or Giza.',
      duration: '4 hours',
      guestPrices: { adult: 85, child: 30, infant: 0 },
      maxCapacity: null,
      timeSlots: [{ id: 'slot-1', time: '08:00', guestPrices: { adult: 85, child: 30, infant: 0 } }],
    });
    expect(snapshotAddon(ADDONS[0])).toEqual({ id: 'a1', title: 'Photos', description: '', price: 20, perGuest: false, bookingOptionKeys: [], required: false });
  });

  it('reads the page and the booking API with GET only, into a trip the seed can sell', async () => {
    const asked: string[] = [];
    const fetchText = async (url: string) => { asked.push(url); return HTML; };
    const fetchJson = async (url: string) => {
      asked.push(url);
      if (url.endsWith('/options')) return OPTIONS;
      if (url.endsWith('/addons')) return ADDONS;
      throw new Error(url);
    };
    const tour = await readEeoTour(RECORD.slug, '2026-10-28T09:00:00Z', fetchText, fetchJson);
    expect(asked).toEqual([
      `${EEO_BASE}/${RECORD.slug}`,
      `${EEO_BASE}/api/tours/${RECORD._id}/options`,
      `${EEO_BASE}/api/tours/${RECORD._id}/addons`,
    ]);
    expect(tour).toMatchObject({
      slug: RECORD.slug,
      id: RECORD._id,
      readAt: '2026-10-28T09:00:00Z',
      detail: {
        title: RECORD.title,
        duration: '4 hours',
        whatsIncluded: [],
        includes: RECORD.includes,
        whatsNotIncluded: ['Tips'],
        itinerary: [{ title: 'Pickup location:', description: 'Al Giza' }, { title: 'Grand Egyptian Museum', description: 'Giza', duration: '3 hours' }],
        pricingSummary: { currency: 'USD' },
      },
    });
    const programme = eeoProgramme(tour, ['grand-egyptian-museum-with-hotel-pickup-b3deaaec07e2'], 'day-trips');
    expect(programme).toMatchObject({
      currency: 'USD',
      pricingOptions: [{ price: 85, childPrice: 30 }],
      entryWindows: [{ label: '08:00', startTime: '08:00' }],
      inclusions: RECORD.includes,
    });
  });

  it('refuses a page without the trip, and a booking API that does not answer with lists', async () => {
    await expect(readEeoTour('missing-trip', 'now', async () => HTML, async () => [])).rejects.toThrow('the page carries no record');
    await expect(readEeoTour(RECORD.slug, 'now', async () => HTML, async () => ({ error: 'down' }))).rejects.toThrow('did not answer with lists');
  });

  it('adds new trips to the snapshot and never touches one already in it', () => {
    const kept = { slug: 'kept', id: 'k', detail: { title: 'Kept' }, options: [], addons: [] };
    const snapshot = { readAt: '2026-10-24T06:03:34Z', source: EEO_BASE, tours: [kept] };
    const next = withTrips(snapshot, [{ ...kept, detail: { title: 'Changed' } }, { slug: 'new', id: 'n', detail: { title: 'New' }, options: [], addons: [] }]);
    expect(next.tours.map((tour) => [tour.slug, tour.detail.title])).toEqual([['kept', 'Kept'], ['new', 'New']]);
    expect(next.readAt).toBe(snapshot.readAt);
  });
});
