import { packageDetailsSchema, publicPackageDetails } from '../utils/packageDetails';

const stop = { name: 'Cairo', lat: 30.0444, lng: 31.2357 };
const input = (stops?: unknown) => ({ version: 1, itinerary: [{ day: 1, title: 'Cairo', ...(stops === undefined ? {} : { stops }) }] });
describe('package itinerary locations', () => {
  it('preserves authored ordered stops in public projection', () => {
    const stops = [stop, { name: 'Giza', lat: 29.9792, lng: 31.1342 }];
    expect(publicPackageDetails(packageDetailsSchema.parse(input(stops)))?.itinerary).toEqual([expect.objectContaining({ stops })]);
  });
  it('keeps legacy itineraries valid without adding a guessed location', () => {
    expect(packageDetailsSchema.parse(input()).itinerary[0]).not.toHaveProperty('stops');
  });
  it.each([
    [{ ...stop, lat: 91 }], [{ ...stop, lng: -181 }], [{ ...stop, lat: Infinity }],
    [{ ...stop, lat: '30' }], [{ ...stop, name: '' }], [{ ...stop, name: '<script>' }],
    [{ ...stop, unknown: true }], Array.from({ length: 21 }, () => stop),
  ].map(stops => ({ stops })))('rejects invalid or unbounded location input %#', ({ stops }) => {
    expect(packageDetailsSchema.safeParse(input(stops)).success).toBe(false);
  });
});
