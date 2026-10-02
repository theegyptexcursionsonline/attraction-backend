import { PackageDetailsInput, packageDetailsSchema, PackageDetails } from '../utils/packageDetails';

/**
 * A complete eight-day Cairo and Nile package: two hotel levels × two seasons × three group sizes,
 * every room and traveller price set, three kinds of extras and a full itinerary. Prices are the
 * operator's, before the service fee.
 */
export const RATE_TABLE: Record<string, Record<string, Record<string, { double: number; single: number; triple: number; child: number; infant: number }>>> = {
  gold: {
    winter: {
      solo: { double: 1500, single: 1600, triple: 1450, child: 750, infant: 0 },
      small: { double: 1000, single: 1400, triple: 950, child: 500, infant: 0 },
      large: { double: 800, single: 1200, triple: 760, child: 400, infant: 0 },
    },
    summer: {
      solo: { double: 1200, single: 1300, triple: 1150, child: 600, infant: 0 },
      small: { double: 700, single: 1000, triple: 650, child: 350, infant: 0 },
      large: { double: 600, single: 900, triple: 570, child: 300, infant: 0 },
    },
  },
  diamond: {
    winter: {
      solo: { double: 2100, single: 2300, triple: 2000, child: 1050, infant: 50 },
      small: { double: 1400, single: 1900, triple: 1330, child: 700, infant: 50 },
      large: { double: 1150, single: 1650, triple: 1090, child: 575, infant: 50 },
    },
    summer: {
      solo: { double: 1800, single: 2000, triple: 1700, child: 900, infant: 50 },
      small: { double: 1100, single: 1500, triple: 1045, child: 550, infant: 50 },
      large: { double: 950, single: 1350, triple: 900, child: 475, infant: 50 },
    },
  },
};

export const samplePackageInput = (overrides: Partial<PackageDetailsInput> = {}): PackageDetailsInput => ({
  version: 1,
  durationDays: 8,
  durationNights: 7,
  startCity: 'Cairo',
  endCity: 'Cairo',
  departureMode: 'daily',
  minNoticeDays: 2,
  daily: { weekdays: [0, 1, 2, 3, 4, 5, 6], blackoutDates: ['2026-12-31'], horizonMonths: 12, dailyCapacity: 20 },
  seasons: [
    { key: 'winter', name: 'Winter', from: '2026-10-01', to: '2027-04-30' },
    { key: 'summer', name: 'Summer', from: '2027-05-01', to: '2027-09-30' },
  ],
  tiers: [
    {
      key: 'gold',
      name: 'Gold',
      description: 'Four-star hotels and a five-star Nile cruise',
      hotels: [
        { city: 'Cairo', name: 'Steigenberger Pyramids', nights: 3, stars: 5 },
        { city: 'Nile cruise', name: 'MS Royal Esadora', nights: 4, stars: 5 },
      ],
    },
    {
      key: 'diamond',
      name: 'Diamond',
      description: 'Five-star luxury throughout',
      hotels: [
        { city: 'Cairo', name: 'Marriott Mena House', nights: 3, stars: 5 },
        { city: 'Nile cruise', name: 'Oberoi Philae', nights: 4, stars: 5 },
      ],
    },
  ],
  groupBands: [
    { key: 'solo', min: 1, max: 1 },
    { key: 'small', min: 2, max: 4 },
    { key: 'large', min: 5, max: 16 },
  ],
  rates: Object.entries(RATE_TABLE).flatMap(([tierKey, seasons]) =>
    Object.entries(seasons).flatMap(([seasonKey, bands]) =>
      Object.entries(bands).map(([bandKey, prices]) => ({ tierKey, seasonKey, bandKey, ...prices })))),
  rooms: { allowSingle: true, allowTriple: true, maxChildrenPerRoom: 2, maxInfantsPerRoom: 1 },
  travellers: { allowChildren: true, allowInfants: true, childMinAge: 2, childMaxAge: 11, childWithOneAdult: 'double' },
  extras: [
    { id: 'balloon', name: 'Hot-air balloon over Luxor', unit: 'per_traveller', price: 120, priceChild: 90 },
    { id: 'abu-simbel', name: 'Abu Simbel by road', unit: 'per_traveller', price: 150, priceChild: null },
    { id: 'extra-night', name: 'Extra night in Cairo', unit: 'per_room', price: 95, maxQuantity: 3 },
    { id: 'airport', name: 'Private airport transfer', unit: 'per_booking', price: 40, maxQuantity: 2 },
  ],
  cancellation: [
    { daysBefore: 30, refundPercent: 100 },
    { daysBefore: 14, refundPercent: 50 },
    { daysBefore: 0, refundPercent: 0 },
  ],
  itinerary: Array.from({ length: 8 }, (_, index) => ({
    day: index + 1,
    title: ['Arrive in Cairo', 'Pyramids and Sphinx', 'Fly to Luxor', 'Valley of the Kings', 'Edfu and Kom Ombo', 'Aswan', 'Fly to Cairo', 'Depart'][index],
    description: 'Guided day with an Egyptologist.',
    meals: index === 0 ? ['dinner' as const] : ['breakfast' as const],
    overnight: index < 3 ? 'Cairo' : 'Nile cruise',
  })),
  ...overrides,
});

export const samplePackage = (overrides: Partial<PackageDetailsInput> = {}): PackageDetails =>
  packageDetailsSchema.parse(samplePackageInput(overrides));
