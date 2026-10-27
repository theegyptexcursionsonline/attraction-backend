import { Types } from 'mongoose';
import { NETWORK_PICKUP_CUTOFF_MINUTES, eeoSourceProgramme, tripDocument, withPickupCutoff } from '../scripts/seed-network-sites';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';
import { B02 } from '../scripts/network-sites/b02';
import { B03A } from '../scripts/network-sites/b03';
import { B03B, B03C, B03D } from '../scripts/network-sites/b03-rest';
import { B08A, B08B, B08C, B08D } from '../scripts/network-sites/b08';
import { EEO_SOURCE } from '../scripts/network-sites/eeo-source';

/**
 * Owner decision 27 Oct 2026 (PLATFORM #1713): a network trip's hotel-pickup departures stop selling two hours before
 * they leave. The live trips were changed once; this keeps every re-run and every later batch on the same rule, since
 * a seed writes the whole option list and would otherwise put back the programme's own value (often none, or a 0).
 */
describe('the network booking cut-off for hotel-pickup departures', () => {
  it('sets two hours on a departure trip whose option has none or a copied 0, and keeps a cut-off the programme sets', () => {
    const options = [
      { id: 'a', price: 40 },
      { id: 'b', price: 40, bookingCutoffMinutes: 0 },
      { id: 'c', price: 400, bookingCutoffMinutes: 2880 },
      { id: 'd', price: 40, bookingCutoffMinutes: null },
    ];
    expect(withPickupCutoff(options, 'time-slots').map((option) => option.bookingCutoffMinutes)).toEqual([120, 120, 2880, 120]);
    expect(NETWORK_PICKUP_CUTOFF_MINUTES).toBe(120);
    // The input list is not changed in place: the programme record stays as it was read.
    expect(options[0]).not.toHaveProperty('bookingCutoffMinutes');
  });

  it('leaves a trip sold by the day without one: there is no departure to count back from', () => {
    const options = [{ id: 'a', price: 40 }, { id: 'b', price: 40, bookingCutoffMinutes: 0 }];
    expect(withPickupCutoff(options, 'date-only')).toEqual(options);
    expect(withPickupCutoff(options, undefined)).toEqual(options);
  });

  // Trips built from the client's own site's snapshot can be checked here without a database; trips built from
  // another operator's programme are read from the database at run time and are covered with a fixture in
  // seed-network-sites.test.ts.
  const BATCHES = { B01_SAFARI, B02, B03A, B03B, B03C, B03D, B08A, B08B, B08C, B08D };
  const FROM_SNAPSHOT = Object.entries(BATCHES).filter(([, batch]) => batch.sites.some((site) => site.trips.some((trip) => trip.price.tenant === EEO_SOURCE)));
  it('checks every batch that has trips from the snapshot', () => {
    expect(FROM_SNAPSHOT.map(([name]) => name)).toEqual(expect.arrayContaining(['B03A', 'B08A', 'B08B', 'B08C', 'B08D']));
  });
  it.each(FROM_SNAPSHOT)('writes it on every departure trip of %s, and on no trip sold by the day', (_name, batch) => {
    let departureTrips = 0;
    for (const site of batch.sites) {
      site.trips.filter((trip) => trip.price.tenant === EEO_SOURCE).forEach((trip, index) => {
        const programme = eeoSourceProgramme(trip.price);
        const document = tripDocument(site, trip, programme, index, new Types.ObjectId()) as Record<string, any>;
        const options = document.pricingOptions as Array<{ id: string; bookingCutoffMinutes?: number }>;
        expect(document.hasHotelPickup).toBe(true);
        if (document.availability.type === 'time-slots') {
          departureTrips += 1;
          for (const option of options) expect(option.bookingCutoffMinutes).toBeGreaterThanOrEqual(NETWORK_PICKUP_CUTOFF_MINUTES);
        } else {
          // Sold by the day: each option keeps exactly the cut-off its programme has (usually none).
          const source = new Map((programme.pricingOptions as Array<{ id: string; bookingCutoffMinutes?: number }>).map((option) => [option.id, option.bookingCutoffMinutes]));
          for (const option of options) expect(option.bookingCutoffMinutes).toBe(source.get(option.id));
        }
      });
    }
    expect(departureTrips).toBeGreaterThan(0);
  });
});
