import fs from 'node:fs';
import path from 'node:path';

describe('admin booking image contract', () => {
  it('populates the first attraction image for Recent Bookings', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/controllers/bookings.controller.ts'), 'utf8');
    const adminHandler = source.slice(source.indexOf('export const getAllBookings'));
    expect(adminHandler).toContain(".populate('attractionId', 'title slug images')");
  });
});
