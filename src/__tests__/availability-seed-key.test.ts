import { Availability } from '../models/Availability';

describe('Availability controlled seed ownership', () => {
  it('keeps an optional unique sparse seed key for reversible TEST capacity', () => {
    const path = Availability.schema.path('seedKey');
    expect(path).toBeDefined();
    expect(Availability.schema.indexes()).toEqual(expect.arrayContaining([
      [{ seedKey: 1 }, expect.objectContaining({ unique: true, sparse: true })],
    ]));
  });
});
