import {
  configuredAvailabilityTimes,
  publicAvailabilityTimeSlots,
  publicDefaultTimeSlots,
} from '../utils/publicAvailability';

describe('publicDefaultTimeSlots', () => {
  it('uses configured catalog entry windows instead of unrelated network defaults', () => {
    expect(publicDefaultTimeSlots({
      entryWindows: [
        { startTime: '07:00' },
        { startTime: '10:00' },
        { startTime: '07:00' },
      ],
    }, 12)).toEqual([
      { time: '07:00', available: true, spotsLeft: 12 },
      { time: '10:00', available: true, spotsLeft: 12 },
    ]);
  });

  it('preserves legacy defaults for tours with no configured schedule', () => {
    expect(publicDefaultTimeSlots({}, 25).map((slot) => slot.time)).toEqual([
      '09:00', '10:00', '11:00', '14:00', '15:00', '16:00',
    ]);
  });

  it('combines entry windows and option-owned slots without duplicates', () => {
    expect(configuredAvailabilityTimes({
      entryWindows: [
        { startTime: '07:00' },
        { startTime: '10:00' },
      ],
      pricingOptions: [{
        timeSlots: [
          { startTime: '10:00' },
          { startTime: '13:00' },
        ],
      }],
    })).toEqual(['07:00', '10:00', '13:00']);
  });

  it('preserves materialized configured capacity and hides stale defaults', () => {
    expect(publicAvailabilityTimeSlots(
      {
        entryWindows: [
          { startTime: '07:00' },
          { startTime: '10:00' },
          { startTime: '13:00' },
        ],
      },
      [
        { time: '09:00', capacity: 25, booked: 0 },
        { time: '10:00', capacity: 12, booked: 12 },
      ],
      25,
    )).toEqual([
      { time: '10:00', available: false, spotsLeft: 0 },
    ]);
  });

  it('keeps custom stored slots for a legacy tour with no catalog schedule', () => {
    expect(publicAvailabilityTimeSlots(
      {},
      [{ time: '08:30', capacity: 6, booked: 2 }],
      25,
    )).toEqual([
      { time: '08:30', available: true, spotsLeft: 4 },
    ]);
  });

  it('does not manufacture capacity inside an existing empty date override', () => {
    expect(publicAvailabilityTimeSlots(
      { entryWindows: [{ startTime: '07:00' }] },
      [],
      25,
    )).toEqual([]);
  });
});
