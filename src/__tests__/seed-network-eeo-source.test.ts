import { EEO_BASE, eeoAddonBasisProblems, eeoLiveDrift, eeoProgramme, type EeoTour } from '../scripts/network-sites/eeo-source';

// A Sharm boat trip as the client's main site publishes it (shape of the 24 Oct snapshot), trimmed.
const TOUR: EeoTour = {
  slug: 'sharm-el-sheikh-tiran-island-cruise',
  id: 'eeo-tiran',
  detail: {
    title: 'Sharm El-Sheikh: Tiran Island Cruise with Snorkeling, Diving & Lunch',
    duration: '6 - 8 hours',
    languages: [],
    whatsIncluded: ['Hotel pickup and drop-off', 'Yacht trip to Tiran Island', 'Buffet lunch onboard', ' '],
    whatsNotIncluded: [],
    whatToBring: ['Swimwear', 'Towel'],
    itinerary: [{ title: 'Pickup location', description: 'Sharm El-Sheikh' }, { title: '', description: 'blank step' }, { title: 'Tiran Island', description: 'Visit, Snorkeling', duration: '1.5 hours' }],
    pricingSummary: { currency: 'USD' },
  },
  options: [
    { id: 'option-0', pricingKey: 'snorkel-included', title: 'Snorkeling Trip (Equipment Included)', type: 'Per Person', duration: '6 hours', guestPrices: { adult: 54.88, child: 26.27, infant: 0 }, timeSlots: [{ id: 'slot-1', time: '08:00', guestPrices: { adult: 54.88, child: 26.27, infant: 0 } }] },
    { id: 'option-1', pricingKey: 'snorkel-excluded', title: 'Snorkeling Trip (Equipment Excluded)', type: 'Per Person', duration: '8 hours', guestPrices: { adult: 54.88, child: 29.19, infant: 0 }, timeSlots: [{ id: 'slot-1', time: '08:00' }, { id: 'slot-2', time: '08:30' }] },
    { id: 'option-2', pricingKey: 'diving', title: 'Diving', type: 'Per Person', guestPrices: { adult: 75.9, child: 75.9, infant: 5.5 }, timeSlots: [{ id: 'slot-1', time: '08:00' }] },
    { id: 'option-3', pricingKey: 'private', title: 'Private boat', type: 'Per Group', guestPrices: { adult: 300 }, timeSlots: [] },
  ],
  addons: [
    { id: 'suit', title: 'Diving Suit Rental', price: 14.01, perGuest: true, bookingOptionKeys: ['snorkel-included', 'diving'] },
    { id: 'transfer', title: 'Private Transfer Round Trip', price: 40.87, perGuest: true, bookingOptionKeys: ['snorkel-included'] },
    { id: 'fee', title: 'Marine park fee', price: 5, perGuest: true, bookingOptionKeys: ['snorkel-included', 'diving'], required: true },
  ],
};

describe('a network trip built on a trip the client publishes on its main site', () => {
  it('copies the published option, its child and infant prices, departure, inclusions and schedule', () => {
    const programme = eeoProgramme(TOUR, ['snorkel-included'], 'water');
    expect(programme).toMatchObject({
      currency: 'USD',
      category: 'water',
      duration: '6 hours',
      pricingOptions: [{ id: 'snorkel-included', name: 'Snorkeling Trip (Equipment Included)', price: 54.88, childPrice: 26.27, pricingModel: 'per-person' }],
      entryWindows: [{ label: '08:00', startTime: '08:00' }],
      inclusions: ['Hotel pickup and drop-off', 'Yacht trip to Tiran Island', 'Buffet lunch onboard'],
      whatToBring: ['Swimwear', 'Towel'],
      itinerary: [{ title: 'Pickup location', description: 'Sharm El-Sheikh', duration: '' }, { title: 'Tiran Island', description: 'Visit, Snorkeling', duration: '1.5 hours' }],
      availability: { type: 'time-slots', advanceBooking: 30 },
    });
    expect((programme.pricingOptions as Array<Record<string, unknown>>)[0]).not.toHaveProperty('infantPrice');
    // Only the extras that apply to the option sold, and never a required one.
    expect((programme.addons as Array<{ id: string }>).map((addon) => addon.id)).toEqual(['suit', 'transfer']);
  });

  it('charges an infant price the record charges, and leaves a child at the adult price when they are equal', () => {
    const [option] = eeoProgramme(TOUR, ['diving'], 'water').pricingOptions as Array<Record<string, unknown>>;
    expect(option.infantPrice).toBe(5.5);
    expect(option).not.toHaveProperty('childPrice');
  });

  it('offers an extra only when it applies to every option sold together', () => {
    const programme = eeoProgramme(TOUR, ['snorkel-included', 'diving'].slice(0, 1), 'water');
    expect((programme.addons as Array<{ id: string }>).map((addon) => addon.id)).toContain('transfer');
    const together = eeoProgramme({ ...TOUR, options: TOUR.options.map((option) => (option.pricingKey === 'diving' ? { ...option, timeSlots: [{ id: 's', time: '08:00' }] } : option)) }, ['snorkel-included', 'diving'], 'water');
    expect((together.addons as Array<{ id: string }>).map((addon) => addon.id)).toEqual(['suit']);
  });

  it('refuses what it cannot copy faithfully', () => {
    expect(() => eeoProgramme({ ...TOUR, detail: { ...TOUR.detail, pricingSummary: {} } }, ['snorkel-included'], 'water')).toThrow(/names no currency/);
    expect(() => eeoProgramme(TOUR, ['gone'], 'water')).toThrow(/option "gone" is missing/);
    expect(() => eeoProgramme(TOUR, ['private'], 'water')).toThrow(/priced "Per Group", not per person/);
    expect(() => eeoProgramme(TOUR, ['snorkel-included', 'snorkel-excluded'], 'water')).toThrow(/leave at different times/);
    expect(() => eeoProgramme(TOUR, [], 'water')).toThrow(/no booking option is sold/);
    const dearChild = { ...TOUR, options: [{ ...TOUR.options[0], guestPrices: { adult: 20, child: 25 } }] };
    expect(() => eeoProgramme(dearChild, ['snorkel-included'], 'water')).toThrow(/charges a child more than an adult/);
    const slotPrice = { ...TOUR, options: [{ ...TOUR.options[0], timeSlots: [{ id: 's', time: '08:00', guestPrices: { adult: 60, child: 26.27, infant: 0 } }] }] };
    expect(() => eeoProgramme(slotPrice, ['snorkel-included'], 'water')).toThrow(/prices its 08:00 departure apart/);
  });

  // The record keeps its inclusions in one field or the other, and the client's own page reads whichever is
  // filled; every Giza trip of batch B03 fills only `includes`, every Red Sea trip of B02 only `whatsIncluded`.
  it('takes the inclusions the published page shows, from whichever field carries them', () => {
    const named = { ...TOUR, detail: { ...TOUR.detail, includes: ['Never shown while whatsIncluded is filled'] } };
    expect(eeoProgramme(named, ['snorkel-included'], 'water').inclusions)
      .toEqual(['Hotel pickup and drop-off', 'Yacht trip to Tiran Island', 'Buffet lunch onboard']);
    const fallback = { ...TOUR, detail: { ...TOUR.detail, whatsIncluded: [], includes: ['Hotel pickup and drop-off', 'Entry fees', '  '] } };
    expect(eeoProgramme(fallback, ['snorkel-included'], 'water').inclusions).toEqual(['Hotel pickup and drop-off', 'Entry fees']);
    const neither = { ...TOUR, detail: { ...TOUR.detail, whatsIncluded: [] } };
    expect(eeoProgramme(neither, ['snorkel-included'], 'water').inclusions).toEqual([]);
  });

  it('keeps a per-guest extra per guest', () => {
    const programme = eeoProgramme(TOUR, ['snorkel-included'], 'water');
    expect(eeoAddonBasisProblems(programme, ['suit', 'transfer'], ['suit', 'transfer'])).toEqual([]);
    expect(eeoAddonBasisProblems(programme, ['suit'], [])).toEqual([`${TOUR.slug}: extra "Diving Suit Rental" is charged per guest on the published record.`]);
  });
});

describe('the live check before any write', () => {
  const live = (options = TOUR.options, addons = TOUR.addons) => async (url: string) => {
    if (url === `${EEO_BASE}/api/tours/${TOUR.id}/options`) return options;
    if (url === `${EEO_BASE}/api/tours/${TOUR.id}/addons`) return addons;
    throw new Error(`unexpected ${url}`);
  };

  it('passes when the published options and extras are unchanged', async () => {
    await expect(eeoLiveDrift(TOUR, ['snorkel-included'], ['suit', 'transfer'], live())).resolves.toEqual([]);
  });

  it('names every price, departure and extra that changed or vanished', async () => {
    const options = TOUR.options.map((option) => (option.pricingKey === 'snorkel-included'
      ? { ...option, guestPrices: { adult: 59, child: 26.27, infant: 0 }, timeSlots: [{ id: 'slot-1', time: '09:00' }] }
      : option));
    const addons = [{ ...TOUR.addons[0], price: 16 }];
    await expect(eeoLiveDrift(TOUR, ['snorkel-included', 'gone'], ['suit', 'transfer'], live(options, addons))).resolves.toEqual([
      `egypt-excursions-online/${TOUR.slug}: option "snorkel-included" adult price 54.88 is now 59.`,
      `egypt-excursions-online/${TOUR.slug}: option "snorkel-included" departures 08:00 are now 09:00.`,
      `egypt-excursions-online/${TOUR.slug}: option "gone" is no longer published.`,
      `egypt-excursions-online/${TOUR.slug}: extra "Diving Suit Rental" 14.01 is now 16.`,
      `egypt-excursions-online/${TOUR.slug}: extra "transfer" is no longer published.`,
    ]);
  });
});
