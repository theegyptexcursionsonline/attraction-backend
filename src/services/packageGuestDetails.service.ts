import { z } from 'zod';
import { isoDateSchema, PackageDetails, PACKAGE_LIMITS } from '../utils/packageDetails';
import { PackageQuote, PackageSelection } from './packagePricing.service';

const plain = (max: number) => z.string().trim().min(1).max(max)
  .refine((value) => !/[<>\u0000-\u001f\u007f]/.test(value), 'Use plain text without HTML');

export const packageTravellerDetailsSchema = z.array(z.object({
  name: plain(120),
  type: z.enum(['adult', 'child', 'infant']),
  dateOfBirth: isoDateSchema.optional(),
  nationality: plain(80).optional(),
}).strict()).min(1).max(PACKAGE_LIMITS.travellers + PACKAGE_LIMITS.roomsPerBooking * 2);

export const packageArrivalDetailsSchema = z.object({
  date: isoDateSchema.optional(),
  /** Local time at the arrival airport or pickup location. */
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use local arrival time (HH:MM)').optional(),
  flightNumber: z.string().trim().regex(/^[A-Za-z0-9 -]{1,20}$/, 'Enter a flight number using letters and numbers').optional(),
  airport: plain(80).optional(),
  pickupLocation: plain(200).optional(),
}).strict();

export type PackageTravellerDetails = z.infer<typeof packageTravellerDetailsSchema>;
export type PackageArrivalDetails = z.infer<typeof packageArrivalDetailsSchema>;

/** Full years on departure day, including leap-day birthdays without JS date overflow. */
const ageOn = (birth: string, date: string): number => Number(date.slice(0, 4)) - Number(birth.slice(0, 4))
  - (date.slice(5) < birth.slice(5) ? 1 : 0);

/** Booking-only requirements. Quote remains available while a guest completes their details. */
export function packageGuestDetailsProblem(input: {
  details: PackageDetails;
  selection: PackageSelection;
  quote: PackageQuote;
  today: string;
  travellerNames?: string[];
  travellerDetails?: PackageTravellerDetails;
  arrivalDetails?: PackageArrivalDetails;
}): string | null {
  const { details, quote, travellerDetails, arrivalDetails } = input;
  const requirements = details.bookingRequirements;
  const count = quote.travellers.adults + quote.travellers.children + quote.travellers.infants;
  const needsDetails = requirements.travellerNames || requirements.dateOfBirth || requirements.nationality;
  if (needsDetails && !travellerDetails) return 'Enter the requested details for every traveller.';
  if (travellerDetails) {
    if (travellerDetails.length !== count) return `Enter details for all ${count} travellers.`;
    for (const type of ['adult', 'child', 'infant'] as const) {
      const expected = type === 'adult' ? quote.travellers.adults : type === 'child' ? quote.travellers.children : quote.travellers.infants;
      if (travellerDetails.filter((traveller) => traveller.type === type).length !== expected) {
        return 'Traveller types must match the adults, children and infants in your rooms.';
      }
    }
    for (const [index, traveller] of travellerDetails.entries()) {
      const label = `Traveller ${index + 1}`;
      if (requirements.dateOfBirth && !traveller.dateOfBirth) return `${label}: enter the date of birth.`;
      if (requirements.nationality && !traveller.nationality) return `${label}: enter the nationality.`;
      if (traveller.dateOfBirth) {
        const age = ageOn(traveller.dateOfBirth, quote.departureDate);
        if (traveller.dateOfBirth > input.today || age < 0 || age > 120) return `${label}: enter a valid date of birth.`;
        const type = age < details.travellers.childMinAge ? 'infant' : age <= details.travellers.childMaxAge ? 'child' : 'adult';
        if (traveller.type !== type) return `${label}: the date of birth does not match the selected traveller type on departure.`;
      }
    }
    if (input.travellerNames && (input.travellerNames.length !== travellerDetails.length
      || input.travellerNames.some((name, index) => name !== travellerDetails[index].name))) {
      return 'Traveller names must match the traveller details.';
    }
  }
  if (requirements.bedPreference) {
    const missing = input.selection.rooms.findIndex((room, index) => quote.rooms[index]?.occupancy === 'double' && !room.bedPreference);
    if (missing >= 0) return `Room ${missing + 1}: select a requested bed preference.`;
  }
  if (requirements.arrivalDetails === 'hidden' && arrivalDetails && Object.keys(arrivalDetails).length > 0) {
    return 'This package does not request arrival details.';
  }
  if (requirements.arrivalDetails === 'required' && (!arrivalDetails?.date || !arrivalDetails.time || !arrivalDetails.pickupLocation)) {
    return 'Enter the arrival date, local time and pickup location.';
  }
  if (arrivalDetails?.date && (arrivalDetails.date < input.today || arrivalDetails.date > quote.returnDate)) {
    return 'The arrival date must be today or later and no later than the final day of the trip.';
  }
  return null;
}
