export interface HotelPickupSelection {
  status?: 'confirmed' | 'provide_later';
  hotelName?: string;
  address?: string;
  roomNumber?: string;
  pickupTime?: string;
}

export class HotelPickupError extends Error {}

/** The persisted attraction, never the browser flag, determines pickup availability. */
export function normalizeHotelPickup(enabled: boolean, selection?: HotelPickupSelection, selectionVersion?: 1) {
  if (!enabled) {
    if (selection) throw new HotelPickupError('Hotel pickup is not available for this tour');
    return undefined;
  }
  if (!selection) {
    // Older checkouts never collected a choice. Preserve availability without
    // inventing hotel details; new checkouts must collect an explicit choice.
    if (selectionVersion === undefined) return { status: 'provide_later' as const, hotelName: '' };
    throw new HotelPickupError('Choose your hotel pickup details or provide them later');
  }
  if (selection.status === 'provide_later') return { status: 'provide_later' as const, hotelName: '' };
  if (selection.status !== undefined && selection.status !== 'confirmed') throw new HotelPickupError('Invalid hotel pickup selection');
  const hotelName = selection.hotelName?.trim();
  if (!hotelName) throw new HotelPickupError('Enter your hotel name or choose to provide it later');
  return {
    status: 'confirmed' as const,
    hotelName,
    ...(selection.address?.trim() ? { address: selection.address.trim() } : {}),
    ...(selection.roomNumber?.trim() ? { roomNumber: selection.roomNumber.trim() } : {}),
    ...(selection.pickupTime ? { pickupTime: selection.pickupTime } : {}),
  };
}
