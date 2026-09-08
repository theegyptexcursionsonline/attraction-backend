import { normalizeHotelPickup } from '../utils/hotel-pickup';
import { createBookingSchema } from '../utils/validators';
import { Booking } from '../models/Booking';

describe('hotel pickup authority', () => {
  it('requires an explicit choice when the catalogue includes pickup', () => {
    expect(() => normalizeHotelPickup(true)).toThrow('Choose your hotel');
    expect(() => normalizeHotelPickup(true, {hotelName:'  '})).toThrow('Enter your hotel');
  });
  it('preserves later choice without stale hotel information', () => {
    expect(normalizeHotelPickup(true, {status:'provide_later',hotelName:'old hotel',address:'old address'})).toEqual({status:'provide_later',hotelName:''});
  });
  it('accepts legacy hotel details and normalizes the full selection', () => {
    expect(normalizeHotelPickup(true, {hotelName:' Hotel ',address:' Street ',roomNumber:' 5 '})).toEqual({status:'confirmed',hotelName:'Hotel',address:'Street',roomNumber:'5'});
  });
  it('rejects pickup for a tour without it', () => {
    expect(normalizeHotelPickup(false)).toBeUndefined();
    expect(() => normalizeHotelPickup(false,{hotelName:'Hotel'})).toThrow('not available');
  });
  it('persists status and address in the booking schema', () => {
    const path = Booking.schema.path('items');
    expect(path.schema?.path('hotelPickup.status')).toBeDefined();
    expect(path.schema?.path('hotelPickup.address')).toBeDefined();
  });
  it('validates the later choice while rejecting empty confirmed hotels and invalid statuses', () => {
    const pickup = createBookingSchema.shape.items.element.shape.hotelPickup;
    expect(pickup.safeParse({status:'provide_later',hotelName:''}).success).toBe(true);
    expect(pickup.safeParse({status:'confirmed',hotelName:''}).success).toBe(false);
    expect(pickup.safeParse({status:'unknown',hotelName:'Hotel'}).success).toBe(false);
    expect(pickup.safeParse({hotelName:'Hotel',address:'x'.repeat(501)}).success).toBe(false);
  });
});
