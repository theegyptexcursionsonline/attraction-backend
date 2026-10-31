/**
 * A trip's words never tell its stops in another order than its own itinerary (#1823, 31 Oct 2026). Seven sites sell
 * the client's days south of Giza, each in its own words, and nine B11 descriptions had the shared and private days
 * opening at Saqqara and ending at Dahshur, or the Nile-sail day reaching Saqqara before Memphis, while the itinerary
 * on the same page ran Dahshur, Sakkara, Memphis (and Giza, Memphis, Sakkara, Dahshur). This holds every batch that
 * sells those days to the programme's own order, by the phrasings that told the wrong one.
 */
import type { NetworkBatch, NetworkTrip } from '../scripts/seed-network-sites';
import { PROGRAMMES as B03 } from '../scripts/network-sites/b03';
import { B10A, B10B, B10C, B10D } from '../scripts/network-sites/b10';
import { B11A } from '../scripts/network-sites/b11';
import { B12A } from '../scripts/network-sites/b12';

const BATCHES: NetworkBatch[] = [B10A, B10B, B10C, B10D, B11A, B12A];

/** Dahshur, then Sakkara, then Memphis: the shared and the private day south of Giza. */
const SOUTH_DAYS = [B03.MAS_SHARED, B03.MAS_PRIVATE];
/** The Giza plateau, Memphis, Sakkara, Dahshur: the private day with lunch and a sail. */
const NILE_SAIL_DAY = B03.MAS_NILE_SAIL;

const SOUTH_WRONG = [
  /opens at Saqqara/i, /\b(begins|starts) at Saqqara/i, /Step Pyramid is the first stop/i,
  /brings you to the Step Pyramid before/i, /Dahshur closes/i, /ends at Dahshur/i, /Dahshur follows/i,
  /(then on|carries on|goes on) to Memphis and (to )?Dahshur/i, /then Memphis and Dahshur/i,
];
const NILE_SAIL_WRONG = [
  /Giza plateau to Saqqara/i, /from the Giza plateau to the Step Pyramid/i,
];

const words = (trip: NetworkTrip) => [trip.title, trip.short, trip.description, ...(trip.highlights || [])].join('\n');
const tripsOn = (programmes: unknown[]) => BATCHES.flatMap((batch) => batch.sites.flatMap((site) =>
  site.trips.filter((trip) => programmes.includes(trip.price)).map((trip) => ({ site: site.slug, trip }))));

describe('the days south of Giza are told in their own order', () => {
  it('finds the trips it checks', () => {
    expect(tripsOn(SOUTH_DAYS).length).toBeGreaterThanOrEqual(20);
    expect(tripsOn([NILE_SAIL_DAY]).length).toBeGreaterThanOrEqual(8);
  });

  it('never opens the shared or the private day at Saqqara, nor ends it at Dahshur', () => {
    const wrong = tripsOn(SOUTH_DAYS).flatMap(({ site, trip }) =>
      SOUTH_WRONG.filter((pattern) => pattern.test(words(trip))).map((pattern) => `${site}/${trip.path}: ${pattern}`));
    expect(wrong).toEqual([]);
  });

  it('never takes the Nile-sail day to Saqqara before Memphis', () => {
    const wrong = tripsOn([NILE_SAIL_DAY]).flatMap(({ site, trip }) =>
      NILE_SAIL_WRONG.filter((pattern) => pattern.test(words(trip))).map((pattern) => `${site}/${trip.path}: ${pattern}`));
    expect(wrong).toEqual([]);
  });

  it('tells the programme the same order the itinerary does', () => {
    const order = (programme: (typeof SOUTH_DAYS)[number]) => (programme.itinerary || []).map((step) => step.title);
    for (const programme of SOUTH_DAYS) expect(order(programme)).toEqual(['Hotel pickup', 'Dahshur', 'Sakkara', 'Memphis', 'Back to your hotel']);
  });
});
