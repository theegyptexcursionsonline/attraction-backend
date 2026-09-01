import { publicDefaultTimeSlots } from '../utils/publicAvailability';

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
});
