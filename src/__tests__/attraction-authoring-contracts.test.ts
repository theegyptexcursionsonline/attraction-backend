import {
  createAttractionSchema,
  createAttractionDraftSchema,
  createAttractionRequestSchema,
  updateAttractionRequestSchema,
} from '../utils/validators';

/**
 * Client-requested authoring contract changes (ATN sheet, 2026-09-02):
 *  - add-ons carry a pricing type (per_unit | per_person)
 *  - itinerary steps only need a title
 *  - time slots / entry windows may omit the end time
 *  - drafts may hold partially filled nested documents
 *  - `needToKnow` bullet list
 */

const publishable = () => ({
  slug: 'reef-trip',
  title: 'Reef trip',
  shortDescription: 'A reef trip',
  description: 'A complete reef trip',
  category: 'boat-trips',
  destination: { city: 'Hurghada', country: 'Egypt', coordinates: { lat: 27.25, lng: 33.81 } },
  duration: '4 hours',
  priceFrom: 10,
  currency: 'USD',
  pricingOptions: [{ id: 'shared', name: 'Shared tour', price: 100 }],
});

const issuePaths = (result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } }): string[] =>
  result.success ? [] : (result.error?.issues || []).map((issue) => issue.path.join('.'));

describe('add-on pricing type', () => {
  it('defaults to per_unit so existing add-ons keep being charged once', () => {
    const result = createAttractionSchema.safeParse({
      ...publishable(),
      addons: [{ id: 'lunch', name: 'Lunch', price: 15 }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.addons[0].pricingType).toBe('per_unit');
  });

  it('accepts per_person', () => {
    const result = createAttractionSchema.safeParse({
      ...publishable(),
      addons: [{ id: 'gear', name: 'Snorkel gear', price: 10, pricingType: 'per_person' }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.addons[0].pricingType).toBe('per_person');
  });

  it('normalizes the legacy field and rejects only genuinely conflicting dual fields', () => {
    const legacy = createAttractionSchema.safeParse({
      ...publishable(),
      addons: [{ id: 'gear', name: 'Snorkel gear', price: 10, pricingModel: 'per-person' }],
    });
    expect(legacy.success).toBe(true);
    if (legacy.success) expect(legacy.data.addons[0].pricingType).toBe('per_person');

    const conflict = createAttractionSchema.safeParse({
      ...publishable(),
      addons: [{
        id: 'gear',
        name: 'Snorkel gear',
        price: 10,
        pricingType: 'per_unit',
        pricingModel: 'per-person',
      }],
    });
    expect(issuePaths(conflict)).toContain('addons.0.pricingType');
  });

  it('rejects an unknown pricing type and a blank id/name on publish', () => {
    const result = createAttractionSchema.safeParse({
      ...publishable(),
      addons: [{ id: ' ', name: '', price: 10, pricingType: 'per_group' }],
    });
    expect(result.success).toBe(false);
    const paths = issuePaths(result);
    expect(paths).toContain('addons.0.pricingType');
    expect(paths).toContain('addons.0.id');
    expect(paths).toContain('addons.0.name');
  });
});

describe('itinerary steps', () => {
  it('needs only a title; time, duration and description default to empty', () => {
    const result = createAttractionSchema.safeParse({
      ...publishable(),
      itinerary: [{ title: 'Boat departure' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.itinerary[0]).toEqual({ title: 'Boat departure', time: '', duration: '', description: '' });
    }
  });

  it('rejects a step without a title, naming the field', () => {
    const result = createAttractionSchema.safeParse({
      ...publishable(),
      itinerary: [{ time: '08:00', duration: '30 min', title: '   ' }],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('itinerary.0.title');
  });
});

describe('time slots without an end time', () => {
  const withSlots = (slots: unknown[]) => ({
    ...publishable(),
    pricingOptions: [{ id: 'shared', name: 'Shared tour', price: 100, timeSlots: slots }],
  });

  it('accepts a slot with only a start time', () => {
    const result = createAttractionSchema.safeParse(withSlots([
      { id: 'am', label: 'Morning', startTime: '08:00' },
      { id: 'pm', label: 'Afternoon', startTime: '13:00', endTime: '17:00' },
    ]));
    expect(result.success).toBe(true);
  });

  it('still requires label and start time', () => {
    const result = createAttractionSchema.safeParse(withSlots([{ id: 'am', label: '', startTime: '' }]));
    expect(result.success).toBe(false);
    const paths = issuePaths(result);
    expect(paths).toContain('pricingOptions.0.timeSlots.0.label');
    expect(paths).toContain('pricingOptions.0.timeSlots.0.startTime');
  });

  it('validates the end time when it is supplied', () => {
    const badFormat = createAttractionSchema.safeParse(withSlots([{ id: 'am', label: 'Morning', startTime: '08:00', endTime: '8am' }]));
    expect(issuePaths(badFormat)).toContain('pricingOptions.0.timeSlots.0.endTime');

    const notAfterStart = createAttractionSchema.safeParse(withSlots([{ id: 'am', label: 'Morning', startTime: '08:00', endTime: '08:00' }]));
    expect(issuePaths(notAfterStart)).toContain('pricingOptions.0.timeSlots.0.endTime');
  });

  it('keeps unique ids, unique start times and the 48-slot cap', () => {
    const duplicateIds = createAttractionSchema.safeParse(withSlots([
      { id: 'am', label: 'A', startTime: '08:00' },
      { id: 'am', label: 'B', startTime: '09:00' },
    ]));
    expect(issuePaths(duplicateIds)).toContain('pricingOptions.0.timeSlots.1.id');

    const duplicateStarts = createAttractionSchema.safeParse(withSlots([
      { id: 'a', label: 'A', startTime: '08:00' },
      { id: 'b', label: 'B', startTime: '08:00' },
    ]));
    expect(issuePaths(duplicateStarts)).toContain('pricingOptions.0.timeSlots.1.startTime');

    const tooMany = createAttractionSchema.safeParse(withSlots(
      Array.from({ length: 49 }, (_, i) => ({ id: `s${i}`, label: `S${i}`, startTime: `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}` }))
    ));
    expect(issuePaths(tooMany)).toContain('pricingOptions.0.timeSlots');
  });
});

describe('entry windows without an end time', () => {
  it('accepts a window with only a start time and rejects an end before the start', () => {
    const open = createAttractionSchema.safeParse({
      ...publishable(),
      entryWindows: [{ label: 'Morning', startTime: '08:00' }],
    });
    expect(open.success).toBe(true);

    const inverted = createAttractionSchema.safeParse({
      ...publishable(),
      entryWindows: [{ label: 'Morning', startTime: '08:00', endTime: '07:00' }],
    });
    expect(issuePaths(inverted)).toContain('entryWindows.0.endTime');
  });
});

describe('needToKnow', () => {
  it('defaults to an empty list and accepts strings', () => {
    const absent = createAttractionSchema.safeParse(publishable());
    expect(absent.success && absent.data.needToKnow).toEqual([]);

    const present = createAttractionSchema.safeParse({ ...publishable(), needToKnow: ['Bring ID', 'Not for pregnant guests'] });
    expect(present.success && present.data.needToKnow).toEqual(['Bring ID', 'Not for pregnant guests']);

    const wrongType = createAttractionSchema.safeParse({ ...publishable(), needToKnow: [42] });
    expect(issuePaths(wrongType)).toContain('needToKnow.0');
  });
});

describe('participantRequirements', () => {
  it('survives the authoring schema and rejects blank or unbounded entries', () => {
    const present = createAttractionSchema.safeParse({
      ...publishable(),
      participantRequirements: ['Drivers must be 16 or older'],
    });
    expect(present.success && present.data.participantRequirements).toEqual(['Drivers must be 16 or older']);

    expect(issuePaths(createAttractionSchema.safeParse({
      ...publishable(), participantRequirements: ['   '],
    }))).toContain('participantRequirements.0');
    expect(issuePaths(createAttractionSchema.safeParse({
      ...publishable(), participantRequirements: ['x'.repeat(501)],
    }))).toContain('participantRequirements.0');
  });
});

describe('enquiry-only publishing', () => {
  it('publishes complete editorial content without price, pricing options, or duration', () => {
    const { duration: _duration, priceFrom: _priceFrom, pricingOptions: _pricingOptions, ...editorial } = publishable();
    const result = createAttractionSchema.safeParse({
      ...editorial,
      enquiryOnly: true,
      status: 'active',
    });
    expect(result.success).toBe(true);
  });

  it('keeps the existing price, duration, and option requirements for bookable records', () => {
    const { duration: _duration, priceFrom: _priceFrom, pricingOptions: _pricingOptions, ...incomplete } = publishable();
    const result = createAttractionSchema.safeParse({ ...incomplete, status: 'active' });
    expect(issuePaths(result)).toEqual(expect.arrayContaining(['duration', 'priceFrom', 'pricingOptions']));
  });

  it('rejects commercial fields on an enquiry-only record', () => {
    const result = createAttractionSchema.safeParse({
      ...publishable(),
      enquiryOnly: true,
      entryWindows: [{ label: 'Morning', startTime: '09:00' }],
    });
    expect(issuePaths(result)).toEqual(expect.arrayContaining(['priceFrom', 'pricingOptions', 'entryWindows']));
  });
});

describe('draft lifecycle — nothing but the title is required', () => {
  const partialNested = {
    pricingOptions: [
      { name: 'Private boat' },
      { id: 'shared', price: 0, timeSlots: [{ startTime: '08:00' }, { label: 'Late' }] },
    ],
    addons: [{ name: 'Lunch' }, { id: 'gear', pricingType: 'per_person' }],
    itinerary: [{ time: '08:00' }, {}],
    entryWindows: [{ label: 'Morning' }],
  };

  it('accepts partially filled nested documents on create', () => {
    const result = createAttractionRequestSchema.safeParse({
      slug: 'wip-tour',
      title: 'Work in progress',
      status: 'draft',
      tenantIds: ['6a860401efcdfb02fba39d99'],
      ...partialNested,
    });
    expect(result.success).toBe(true);
  });

  it('accepts the same partial nested documents on update', () => {
    const result = updateAttractionRequestSchema.safeParse({ status: 'draft', ...partialNested });
    expect(result.success).toBe(true);
  });

  it('keeps title (and slug on create) mandatory for a draft', () => {
    const noTitle = createAttractionDraftSchema.safeParse({ slug: 'x', title: '  ', status: 'draft' });
    expect(issuePaths(noTitle)).toContain('title');
    const noSlug = createAttractionDraftSchema.safeParse({ title: 'X', status: 'draft' });
    expect(issuePaths(noSlug)).toContain('slug');
    const blankTitleUpdate = updateAttractionRequestSchema.safeParse({ status: 'draft', title: '' });
    expect(issuePaths(blankTitleUpdate)).toContain('title');
  });

  it('still validates every value the author DID supply on a draft', () => {
    const result = createAttractionDraftSchema.safeParse({
      slug: 'bad-values',
      title: 'Bad values',
      status: 'draft',
      pricingOptions: [{
        price: -1,
        timeSlots: [
          { id: 'a', startTime: '25:00' },
          { id: 'a', startTime: '08:00', endTime: '07:00' },
        ],
      }],
      addons: [{ price: -5, pricingType: 'per_group' }],
      entryWindows: [{ startTime: '09:00', endTime: '08:00' }],
    });
    expect(result.success).toBe(false);
    const paths = issuePaths(result);
    expect(paths).toEqual(expect.arrayContaining([
      'pricingOptions.0.price',
      'pricingOptions.0.timeSlots.0.startTime',
      'pricingOptions.0.timeSlots.1.id',
      'pricingOptions.0.timeSlots.1.endTime',
      'addons.0.price',
      'addons.0.pricingType',
      'entryWindows.0.endTime',
    ]));
  });

  it('refuses to publish while nested documents are incomplete, naming each field', () => {
    // This is exactly what the PATCH publish gate runs against the merged
    // stored document + request body.
    const result = createAttractionSchema.safeParse({
      ...publishable(),
      status: 'active',
      pricingOptions: [{ name: 'Private boat', timeSlots: [{ startTime: '08:00' }] }],
      addons: [{ name: 'Lunch' }],
      itinerary: [{ time: '08:00' }],
    });
    expect(result.success).toBe(false);
    const paths = issuePaths(result);
    expect(paths).toEqual(expect.arrayContaining([
      'pricingOptions.0.id',
      'pricingOptions.0.price',
      'pricingOptions.0.timeSlots.0.id',
      'pricingOptions.0.timeSlots.0.label',
      'addons.0.id',
      'addons.0.price',
      'itinerary.0.title',
    ]));
  });
});
