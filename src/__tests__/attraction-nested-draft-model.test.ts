import { Attraction } from '../models/Attraction';

/**
 * Model-level counterpart of the deep-partial draft contract: nested pricing
 * options, time slots, add-ons and entry windows may persist incomplete while
 * the tour is a draft, but an ACTIVE document still fails validation without
 * them. Also covers the new `pricingType`, optional `endTime` and `needToKnow`.
 */

const partialNested = {
  pricingOptions: [
    { name: 'Private boat' },
    { id: 'shared', price: 0, timeSlots: [{ startTime: '08:00' }, { label: 'Late' }] },
  ],
  addons: [{ name: 'Lunch' }, { id: 'gear', pricingType: 'per_person' }],
  entryWindows: [{ label: 'Morning' }],
  itinerary: [{ time: '08:00' }],
};

const validationPaths = async (doc: { validate: () => Promise<void> }): Promise<string[]> => {
  try {
    await doc.validate();
    return [];
  } catch (error) {
    return Object.keys((error as { errors: Record<string, unknown> }).errors);
  }
};

describe('nested authoring documents on a draft', () => {
  it('persist partially filled while the tour is a draft', async () => {
    const draft = new Attraction({ slug: 'wip', title: 'WIP', status: 'draft', ...partialNested });
    await expect(draft.validate()).resolves.toBeUndefined();
    expect(draft.pricingOptions[0].name).toBe('Private boat');
    expect(draft.pricingOptions[1].timeSlots?.[0].startTime).toBe('08:00');
    expect(draft.addons[1].pricingType).toBe('per_person');
  });

  it('are required again once the same record is active', async () => {
    const active = new Attraction({
      slug: 'wip',
      title: 'WIP',
      status: 'active',
      shortDescription: 's',
      description: 'd',
      category: 'c',
      destination: { city: 'Hurghada', country: 'Egypt', coordinates: { lat: 1, lng: 2 } },
      duration: '4h',
      priceFrom: 10,
      ...partialNested,
    });
    const paths = await validationPaths(active);
    expect(paths).toEqual(expect.arrayContaining([
      'pricingOptions.0.id',
      'pricingOptions.0.price',
      'pricingOptions.1.name',
      'pricingOptions.1.timeSlots.0.id',
      'pricingOptions.1.timeSlots.0.label',
      'pricingOptions.1.timeSlots.1.startTime',
      'addons.0.id',
      'addons.0.price',
      'addons.1.name',
      'addons.1.price',
      'entryWindows.0.startTime',
    ]));
  });

  it('never demands an end time, even on an active tour', async () => {
    const active = new Attraction({
      slug: 'open-ended',
      title: 'Open ended',
      status: 'active',
      shortDescription: 's',
      description: 'd',
      category: 'c',
      destination: { city: 'Hurghada', country: 'Egypt', coordinates: { lat: 1, lng: 2 } },
      duration: '4h',
      priceFrom: 10,
      pricingOptions: [{ id: 'shared', name: 'Shared', price: 10, timeSlots: [{ id: 'am', label: 'Morning', startTime: '08:00' }] }],
      entryWindows: [{ label: 'Morning', startTime: '08:00' }],
    });
    await expect(active.validate()).resolves.toBeUndefined();
    expect(active.pricingOptions[0].timeSlots?.[0].endTime).toBeUndefined();
  });

  it('defaults add-on pricingType to per_unit and rejects unknown types', async () => {
    const doc = new Attraction({
      slug: 'a', title: 'A', status: 'draft',
      addons: [{ id: 'lunch', name: 'Lunch', price: 15 }],
    });
    await expect(doc.validate()).resolves.toBeUndefined();
    expect(doc.addons[0].pricingType).toBe('per_unit');

    const legacy = new Attraction({
      slug: 'legacy', title: 'Legacy', status: 'draft',
      addons: [{ id: 'gear', name: 'Gear', price: 10, pricingModel: 'per-person' }],
    });
    await expect(legacy.validate()).resolves.toBeUndefined();
    expect(legacy.addons[0].pricingType).toBe('per_person');

    const bad = new Attraction({
      slug: 'b', title: 'B', status: 'draft',
      addons: [{ id: 'lunch', name: 'Lunch', price: 15, pricingType: 'per_group' }],
    });
    expect(await validationPaths(bad)).toContain('addons.0.pricingType');
  });

  it('stores needToKnow as a string list', async () => {
    const doc = new Attraction({ slug: 'n', title: 'N', status: 'draft', needToKnow: ['Bring ID'] });
    await expect(doc.validate()).resolves.toBeUndefined();
    expect(doc.needToKnow).toEqual(['Bring ID']);
  });
});

describe('nested required rule under update validators', () => {
  const passesWithNoValue = (path: string, context: unknown): boolean => {
    const schemaPath = Attraction.schema.path(path) as unknown as {
      validators: Array<{ type?: string; validator: (this: unknown) => boolean }>;
    };
    const required = schemaPath.validators.find((v) => v.type === 'required');
    if (!required) throw new Error(`no required validator on ${path}`);
    return required.validator.call(context);
  };

  it('is draft-aware on the nested paths', () => {
    for (const path of ['pricingOptions.id', 'pricingOptions.price', 'addons.id', 'addons.price', 'entryWindows.label']) {
      expect(passesWithNoValue(path, { getUpdate: () => ({ $set: { status: 'draft' } }) })).toBe(true);
      expect(passesWithNoValue(path, { getUpdate: () => ({ $set: { status: 'active' } }) })).toBe(false);
    }
  });

  it('treats an array element with no root document (query-context update) as draft-safe', () => {
    // Under `findByIdAndUpdate(..., { runValidators: true, context: 'query' })`
    // a nested element's ownerDocument() is itself and carries no status, so
    // the rule cannot judge it; the route schema + publish gate are the
    // authority there. It must NOT throw or fail closed on a draft edit.
    const orphan: { status?: string; ownerDocument?: () => unknown } = {};
    orphan.ownerDocument = () => orphan;
    expect(passesWithNoValue('pricingOptions.price', orphan)).toBe(true);
  });

  it('still fails the nested field on an active root document', () => {
    const root = { status: 'active' };
    expect(passesWithNoValue('pricingOptions.price', { ownerDocument: () => root })).toBe(false);
    expect(passesWithNoValue('pricingOptions.price', { ownerDocument: () => ({ status: 'draft' }) })).toBe(true);
  });
});
