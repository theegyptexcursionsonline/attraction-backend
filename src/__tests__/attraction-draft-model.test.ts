import { Attraction } from '../models/Attraction';

describe('attraction draft persistence', () => {
  it('validates a title-only draft without inventing publish data', async () => {
    const draft = new Attraction({ slug: 'unfinished-tour', title: 'Unfinished tour', status: 'draft' });

    await expect(draft.validate()).resolves.toBeUndefined();
    expect(draft.shortDescription).toBeUndefined();
    expect(draft.destination?.city).toBeUndefined();
    expect(draft.pricingOptions).toHaveLength(0);
  });

  it('rejects the same incomplete record when it is active', async () => {
    const active = new Attraction({ slug: 'unfinished-tour', title: 'Unfinished tour', status: 'active' });

    await expect(active.validate()).rejects.toMatchObject({ name: 'ValidationError' });
  });
});

describe('draft-aware required fields under update validators', () => {
  // `findByIdAndUpdate(..., { runValidators: true, context: 'query' })` runs the
  // required validators with `this` bound to the QUERY, not a document, so the
  // status has to be read from the update payload. Without that, every field
  // looked required and re-saving an existing draft failed with
  // "Path `destination.city` is required" (ATN row 114).
  //
  // Mongoose wraps the `required` function, so the callable reports whether the
  // (absent) value PASSES — true means "not required here".
  const passesWithNoValue = (path: string, update: Record<string, unknown>): boolean => {
    const schemaPath = Attraction.schema.path(path) as unknown as {
      validators: Array<{ type?: string; validator: (this: unknown) => boolean }>;
    };
    const required = schemaPath.validators.find((v) => v.type === 'required');
    if (!required) throw new Error(`no required validator on ${path}`);
    return required.validator.call({ getUpdate: () => update });
  };

  it('lets a draft update omit publish-only fields', () => {
    expect(passesWithNoValue('destination.city', { $set: { status: 'draft' } })).toBe(true);
  });

  it('still demands them when the update publishes the tour', () => {
    expect(passesWithNoValue('destination.city', { $set: { status: 'active' } })).toBe(false);
  });

  it('does not force publish rules onto an update that never mentions status', () => {
    expect(passesWithNoValue('destination.city', { $set: { featured: true } })).toBe(true);
  });

  it('reads status from a bare (non-$set) update payload too', () => {
    expect(passesWithNoValue('destination.city', { status: 'active' })).toBe(false);
    expect(passesWithNoValue('destination.city', { status: 'draft' })).toBe(true);
  });

  it('applies the same rule to other publish-only fields', () => {
    for (const field of ['duration', 'category']) {
      expect(passesWithNoValue(field, { $set: { status: 'draft' } })).toBe(true);
      expect(passesWithNoValue(field, { $set: { status: 'active' } })).toBe(false);
    }
  });
});
