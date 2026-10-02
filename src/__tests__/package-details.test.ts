import {
  MAX_PUBLISH_PROBLEMS,
  packageDetailsSchema,
  packagePublishChecklist,
  packagePublishProblems,
  publicPackageDetails,
  readPackageDetails,
  requiredRateFields,
} from '../utils/packageDetails';
import { samplePackage, samplePackageInput } from '../test/packageFixture';

const TODAY = '2026-10-01';
const problemsFor = (overrides: Parameters<typeof samplePackage>[0]) => packagePublishProblems(samplePackage(overrides), TODAY);
const storeErrors = (value: unknown): string[] => {
  const parsed = packageDetailsSchema.safeParse(value);
  return parsed.success ? [] : parsed.error.issues.map(issue => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message));
};

describe('package details: stored shape', () => {
  it('fills a new draft with safe defaults', () => {
    expect(packageDetailsSchema.parse({ version: 1 })).toEqual({
      version: 1,
      startCity: '',
      endCity: '',
      departureMode: 'daily',
      minNoticeDays: 2,
      daily: { weekdays: [0, 1, 2, 3, 4, 5, 6], blackoutDates: [], horizonMonths: 12, dailyCapacity: 20 },
      seasons: [],
      tiers: [],
      groupBands: [],
      rates: [],
      rooms: { allowSingle: true, allowTriple: true, maxChildrenPerRoom: 1, maxInfantsPerRoom: 1 },
      travellers: { allowChildren: true, allowInfants: true, childMinAge: 2, childMaxAge: 11, childWithOneAdult: 'double' },
      extras: [],
      cancellation: [],
      itinerary: [],
    });
  });

  it('keeps a partly entered draft', () => {
    const draft = packageDetailsSchema.parse({
      version: 1,
      seasons: [{ key: 'winter' }],
      tiers: [{ key: 'gold', name: 'Gold' }],
      groupBands: [{ key: 'small', min: 2, max: 4 }],
      rates: [{ tierKey: 'gold', seasonKey: 'winter', bandKey: 'small', double: 1000 }],
      extras: [{ id: 'balloon', unit: 'per_traveller' }],
    });
    expect(draft.rates[0]).toEqual({ tierKey: 'gold', seasonKey: 'winter', bandKey: 'small', double: 1000, single: null, triple: null, child: null, infant: null });
    expect(draft.seasons[0]).toEqual({ key: 'winter', name: '' });
    expect(draft.extras[0]).toMatchObject({ name: '', price: null, maxQuantity: 1 });
  });

  it('round-trips the complete sample unchanged', () => {
    const parsed = samplePackage();
    expect(packageDetailsSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(readPackageDetails(parsed)).toEqual(parsed);
    expect(readPackageDetails({ version: 2 })).toBeNull();
    expect(readPackageDetails(undefined)).toBeNull();
  });

  it.each([
    [{ version: 1, surprise: true }, "Unrecognized key(s) in object: 'surprise'"],
    [{ version: 2 }, 'version: Invalid literal value, expected 1'],
    [{ version: 1, durationDays: 1 }, 'durationDays: Use 2 or more'],
    [{ version: 1, durationDays: 2.5 }, 'durationDays: Use a whole number'],
    [{ version: 1, durationDays: '3' }, 'durationDays: Enter a whole number'],
    [{ version: 1, startCity: 'C'.repeat(81) }, 'startCity: Use at most 80 characters'],
    [{ version: 1, durationDays: 4, durationNights: 5 }, 'durationNights: A trip cannot have more nights than days'],
    [{ version: 1, startCity: '<script>alert(1)</script>' }, 'startCity: Use plain text without HTML'],
    [{ version: 1, startCity: 'Cairo\nGiza' }, 'startCity: Use plain text without HTML'],
    [{ version: 1, seasons: [{ key: 'Winter Season' }] }, 'seasons.0.key: Use lowercase letters, numbers and hyphens'],
    [{ version: 1, seasons: [{ key: 'w', from: '2026-02-30' }] }, 'seasons.0.from: Use a real date (YYYY-MM-DD)'],
    [{ version: 1, seasons: [{ key: 'w', from: '2026-12-01', to: '2026-11-30' }] }, 'seasons.0.to: A season must end on or after its first day'],
    [{ version: 1, seasons: [{ key: 'w' }, { key: 'w' }] }, 'seasons: "w" is used twice'],
    [{ version: 1, groupBands: [{ key: 'b', min: 5, max: 2 }] }, 'groupBands.0.max: The largest group size must be at least the smallest'],
    [{ version: 1, groupBands: [{ key: 'b', min: 1, max: 61 }] }, 'groupBands.0.max: Use 60 or less'],
    [{ version: 1, rates: [{ tierKey: 'gold', seasonKey: 'w', bandKey: 'b' }] }, 'rates.0.tierKey: This price belongs to a hotel level that does not exist'],
    [{ version: 1, tiers: [{ key: 'gold' }], seasons: [{ key: 'w' }], groupBands: [{ key: 'b', min: 1, max: 2 }], rates: [
      { tierKey: 'gold', seasonKey: 'w', bandKey: 'b', double: 1 }, { tierKey: 'gold', seasonKey: 'w', bandKey: 'b', double: 2 },
    ] }, 'rates.1: This hotel level, season and group size already has prices'],
    [{ version: 1, tiers: [{ key: 'gold' }], seasons: [{ key: 'w' }], groupBands: [{ key: 'b', min: 1, max: 2 }], rates: [{ tierKey: 'gold', seasonKey: 'w', bandKey: 'b', double: -1 }] }, 'rates.0.double: Prices cannot be negative'],
    [{ version: 1, tiers: [{ key: 'gold' }], seasons: [{ key: 'w' }], groupBands: [{ key: 'b', min: 1, max: 2 }], rates: [{ tierKey: 'gold', seasonKey: 'w', bandKey: 'b', double: 10.005 }] }, 'rates.0.double: Use at most two decimal places'],
    [{ version: 1, tiers: [{ key: 'gold' }], seasons: [{ key: 'w' }], groupBands: [{ key: 'b', min: 1, max: 2 }], rates: [{ tierKey: 'gold', seasonKey: 'w', bandKey: 'b', double: 1_000_001 }] }, 'rates.0.double: Use at most 1,000,000'],
    [{ version: 1, tiers: [{ key: 'gold' }], seasons: [{ key: 'w' }], groupBands: [{ key: 'b', min: 1, max: 2 }], rates: [{ tierKey: 'gold', seasonKey: 'w', bandKey: 'b', double: '900' }] }, 'rates.0.double: Enter the price as a number'],
    [{ version: 1, extras: [{ id: 'night', unit: 'per_room', price: 90, priceChild: 40 }] }, 'extras.0.priceChild: Only extras priced per traveller have a child price'],
    [{ version: 1, extras: [{ id: 'x', unit: 'per_guest' }] }, "extras.0.unit: Invalid enum value. Expected 'per_traveller' | 'per_room' | 'per_booking', received 'per_guest'"],
    [{ version: 1, daily: { weekdays: [1, 1] } }, 'daily.weekdays: Each weekday can be listed once'],
    [{ version: 1, daily: { blackoutDates: ['2026-12-31', '2026-12-31'] } }, 'daily.blackoutDates: Each closed date can be listed once'],
    [{ version: 1, travellers: { childMinAge: 12, childMaxAge: 11 } }, 'travellers.childMaxAge: The oldest child age must be at least the youngest'],
    [{ version: 1, cancellation: [{ daysBefore: 30, refundPercent: 100 }, { daysBefore: 30, refundPercent: 50 }] }, 'cancellation: Each cancellation deadline can be listed once'],
    [{ version: 1, cancellation: [{ daysBefore: 30, refundPercent: 101 }] }, 'cancellation.0.refundPercent: Use 100 or less'],
    [{ version: 1, itinerary: [{ day: 1 }, { day: 1 }] }, 'itinerary: Each day of the itinerary can be listed once'],
    [{ version: 1, itinerary: [{ day: 1, meals: ['lunch', 'lunch'] }] }, 'itinerary.0.meals: Each meal can be listed once'],
    [{ version: 1, itinerary: [{ day: 1, imageUrl: 'http://example.com/a.jpg' }] }, 'itinerary.0.imageUrl: Use a secure HTTPS image URL without credentials'],
  ])('refuses %j', (value, message) => {
    expect(storeErrors(value)).toContain(message);
  });

  it('accepts arrows and comparisons in prose, refuses tags', () => {
    expect(storeErrors({ version: 1, itinerary: [{ day: 1, title: 'Cairo -> Luxor', description: 'Temperatures < 30 °C\nBring a hat' }] })).toEqual([]);
    expect(storeErrors({ version: 1, itinerary: [{ day: 1, description: 'Hello <img src=x onerror=alert(1)>' }] }))
      .toEqual(['itinerary.0.description: Use plain text without HTML']);
  });
});

describe('package details: ready to sell', () => {
  it('finds nothing to fix in the complete sample', () => {
    expect(problemsFor({})).toEqual([]);
  });

  it('asks for the trip basics', () => {
    expect(packagePublishProblems(packageDetailsSchema.parse({ version: 1 }), TODAY)).toEqual([
      'Set how many days the trip lasts',
      'Set how many nights the trip lasts',
      'Set the city where the trip starts',
      'Set the city where the trip ends',
      'Add at least one season with its dates',
      'Add at least one hotel level',
      'Add at least one group size',
      'Add the cancellation terms (a single rule with 0 % refund means non-refundable)',
    ]);
  });

  it('names the exact price that is missing', () => {
    const rates = samplePackage().rates.map(row => (row.tierKey === 'diamond' && row.seasonKey === 'summer' && row.bandKey === 'large'
      ? { ...row, triple: null, double: 0 }
      : row));
    expect(problemsFor({ rates })).toEqual([
      'Diamond · Summer · 5–16 travellers: double room price must be more than zero',
      'Diamond · Summer · 5–16 travellers: triple room price missing',
    ]);
    // A solo traveller always takes a single room: only the single and infant prices are asked for.
    expect(problemsFor({ rates: samplePackage().rates.filter(row => row.bandKey !== 'solo') })).toEqual(
      ['Gold · Winter', 'Gold · Summer', 'Diamond · Winter', 'Diamond · Summer'].flatMap(where => [
        `${where} · 1 traveller: single room price missing`,
        `${where} · 1 traveller: infant price missing`,
      ]),
    );
  });

  it('asks only for the prices the room and traveller rules use', () => {
    const adultsInDoubles = samplePackage({
      rooms: { allowSingle: false, allowTriple: false, maxChildrenPerRoom: 0, maxInfantsPerRoom: 0 },
      travellers: { allowChildren: false, allowInfants: false, childMinAge: 2, childMaxAge: 11, childWithOneAdult: 'double' },
      groupBands: [{ key: 'small', min: 2, max: 4 }, { key: 'large', min: 5, max: 16 }],
      rates: samplePackage().rates.filter(row => row.bandKey !== 'solo').map(row => ({ ...row, single: null, triple: null, child: null, infant: null })),
    });
    expect(requiredRateFields(adultsInDoubles)).toEqual(['double']);
    // By group size: a solo traveller never shares; a triple needs three adults.
    const all = samplePackage();
    expect(requiredRateFields(all, { max: 1 })).toEqual(['single', 'infant']);
    expect(requiredRateFields(all, { max: 2 })).toEqual(['double', 'single', 'child', 'infant']);
    expect(requiredRateFields(all, { max: 4 })).toEqual(['double', 'single', 'triple', 'child', 'infant']);
    expect(packagePublishProblems(adultsInDoubles, TODAY)).toEqual([]);
  });

  it.each([
    [{ seasons: [{ key: 'winter', name: 'Winter', from: '2026-10-01', to: '2027-05-15' }, { key: 'summer', name: 'Summer', from: '2027-05-01', to: '2027-09-30' }] },
      'Winter and Summer overlap — each date can belong to one season'],
    [{ seasons: [{ key: 'winter', name: '', from: '2026-10-01', to: '2027-04-30' }, { key: 'summer', name: 'Summer', from: '2027-05-01' }] }, 'Season 1: add a name'],
    [{ seasons: [{ key: 'winter', name: 'Winter', from: '2026-10-01', to: '2027-04-30' }, { key: 'summer', name: 'Summer', from: '2027-05-01' }] }, 'Summer: set the first and last departure date'],
    [{ seasons: [{ key: 'winter', name: 'Winter', from: '2025-10-01', to: '2026-04-30' }, { key: 'summer', name: 'Summer', from: '2026-05-01', to: '2026-09-30' }] },
      'Every season has ended — add a season with future dates'],
    [{ groupBands: [{ key: 'solo', min: 1, max: 1 }, { key: 'small', min: 2, max: 4 }, { key: 'large', min: 6, max: 16 }] },
      'Group sizes must follow on without gaps or overlaps: 2–4 travellers is followed by 6–16 travellers'],
    [{ groupBands: [{ key: 'solo', min: 1, max: 1 }, { key: 'small', min: 2, max: 5 }, { key: 'large', min: 5, max: 16 }] },
      'Group sizes must follow on without gaps or overlaps: 2–5 travellers is followed by 5–16 travellers'],
    [{ rooms: { allowSingle: false, allowTriple: true, maxChildrenPerRoom: 2, maxInfantsPerRoom: 1 } },
      'A solo traveller needs a single room — allow single rooms or start group sizes at 2'],
    [{ rooms: { allowSingle: true, allowTriple: true, maxChildrenPerRoom: 0, maxInfantsPerRoom: 1 } },
      'Children are welcome, but no room can take a child — set how many children can share a room'],
    [{ rooms: { allowSingle: true, allowTriple: true, maxChildrenPerRoom: 2, maxInfantsPerRoom: 0 } },
      'Infants are welcome, but no room can take an infant — set how many infants can share a room'],
    [{ daily: { weekdays: [], blackoutDates: [], horizonMonths: 12, dailyCapacity: 20 } }, 'Choose at least one weekday the trip can start on'],
    [{ cancellation: [] }, 'Add the cancellation terms (a single rule with 0 % refund means non-refundable)'],
    [{ cancellation: [{ daysBefore: 30, refundPercent: 50 }, { daysBefore: 14, refundPercent: 80 }] },
      'Cancelling 14 days before cannot refund more than cancelling 30 days before'],
    [{ durationDays: 9 }, 'Itinerary: day 9 is missing'],
    [{ durationDays: 7, durationNights: 6 }, 'Itinerary: day 8 is after the last day of a 7-day trip'],
    [{ startCity: '' }, 'Set the city where the trip starts'],
  ])('flags %j', (overrides, problem) => {
    expect(problemsFor(overrides as Parameters<typeof samplePackage>[0])).toContain(problem);
  });

  it('names incomplete hotel levels, hotels, extras and itinerary days', () => {
    const input = samplePackageInput();
    const problems = packagePublishProblems(packageDetailsSchema.parse({
      ...input,
      tiers: [{ ...input.tiers![0], name: '' }, { ...input.tiers![1], hotels: [{ city: 'Cairo', name: '' }] }],
      extras: [{ id: 'balloon', name: '', unit: 'per_traveller', price: null }],
      itinerary: input.itinerary!.map(day => (day.day === 3 ? { ...day, title: '' } : day)),
    }), TODAY);
    expect(problems).toEqual(expect.arrayContaining([
      'Hotel level 1: add a name',
      'Diamond: hotel 1 needs a city and a hotel name',
      'Extra 1: add a name',
      'Extra 1: set a price',
      'Itinerary: day 3 needs a title',
    ]));
    expect(problems).toHaveLength(5);
  });

  it(`stops at ${MAX_PUBLISH_PROBLEMS} problems and says how many remain`, () => {
    const problems = packagePublishProblems(samplePackage({ rates: [] }), TODAY);
    expect(problems).toHaveLength(MAX_PUBLISH_PROBLEMS);
    // Per level and season: 2 prices for the solo group (single, infant) and 5 for each larger group.
    expect(problems[MAX_PUBLISH_PROBLEMS - 1]).toBe(`…and ${2 * 2 * (2 + 5 + 5) - (MAX_PUBLISH_PROBLEMS - 1)} more to fix`);
  });

  it('files every problem under the editor section that fixes it, and counts each section in full', () => {
    const empty = packagePublishChecklist(packageDetailsSchema.parse({ version: 1 }), TODAY);
    expect(empty.problems.map((problem) => problem.section)).toEqual(['trip', 'trip', 'trip', 'trip', 'seasons', 'levels', 'groups', 'cancellation']);
    expect(empty.problems.map((problem) => problem.message)).toEqual(packagePublishProblems(packageDetailsSchema.parse({ version: 1 }), TODAY));
    expect(empty.totals).toEqual({ trip: 4, seasons: 1, levels: 1, groups: 1, cancellation: 1 });

    const unpriced = packagePublishChecklist(samplePackage({ rates: [] }), TODAY);
    expect(unpriced.problems).toHaveLength(MAX_PUBLISH_PROBLEMS);
    expect(unpriced.problems[0]).toEqual({ section: 'prices', message: 'Gold · Winter · 1 traveller: single room price missing' });
    expect(unpriced.problems[MAX_PUBLISH_PROBLEMS - 1].section).toBe('more');
    // The list stops; the count per section does not.
    expect(unpriced.totals).toEqual({ prices: 2 * 2 * (2 + 5 + 5) });
  });

  it.each([
    [{ daily: { weekdays: [], blackoutDates: [], horizonMonths: 12, dailyCapacity: 20 } }, 'departures', 'Choose at least one weekday the trip can start on'],
    [{ extras: [{ id: 'balloon', name: '', description: '', unit: 'per_traveller', price: 100, priceChild: null, maxQuantity: 1 }] }, 'extras', 'Extra 1: add a name'],
    [{ rooms: { allowSingle: false, allowTriple: true, maxChildrenPerRoom: 1, maxInfantsPerRoom: 1 } }, 'rooms', 'A solo traveller needs a single room — allow single rooms or start group sizes at 2'],
  ] as const)('files %j under %s', (overrides, section, message) => {
    expect(packagePublishChecklist(samplePackage(overrides as never), TODAY).problems).toContainEqual({ section, message });
  });
});

describe('package details: what a storefront sees', () => {
  it('shows the trip, never the rate matrix or the daily capacity', () => {
    const shown = publicPackageDetails(samplePackage())!;
    expect(shown).not.toHaveProperty('rates');
    expect(shown).not.toHaveProperty('daily');
    expect(shown).not.toHaveProperty('seasons');
    expect(JSON.stringify(shown)).not.toContain('1400');
    expect(shown).toMatchObject({
      durationDays: 8, durationNights: 7, startCity: 'Cairo', departureMode: 'daily',
      groupBands: [{ min: 1, max: 1 }, { min: 2, max: 4 }, { min: 5, max: 16 }],
      cancellation: [{ daysBefore: 30, refundPercent: 100 }, { daysBefore: 14, refundPercent: 50 }, { daysBefore: 0, refundPercent: 0 }],
    });
    // Extras show their customer price (service fee inside, rounded like the quote) before they are added.
    expect(shown.extras).toEqual([
      { id: 'balloon', name: 'Hot-air balloon over Luxor', description: '', unit: 'per_traveller', maxQuantity: 1, price: 126, priceChild: 94.5 },
      { id: 'abu-simbel', name: 'Abu Simbel by road', description: '', unit: 'per_traveller', maxQuantity: 1, price: 157.5 },
      { id: 'extra-night', name: 'Extra night in Cairo', description: '', unit: 'per_room', maxQuantity: 3, price: 99.75 },
      { id: 'airport', name: 'Private airport transfer', description: '', unit: 'per_booking', maxQuantity: 2, price: 42 },
    ]);
    expect((shown.tiers as Array<Record<string, unknown>>)[0]).toMatchObject({ key: 'gold', name: 'Gold', hotels: [{ city: 'Cairo', name: 'Steigenberger Pyramids', nights: 3, stars: 5 }, expect.any(Object)] });
  });

  it('shows nothing for a document that is not a package', () => {
    expect(publicPackageDetails(undefined)).toBeUndefined();
    expect(publicPackageDetails({ version: 1, rates: 'all of them' })).toBeUndefined();
  });
});
