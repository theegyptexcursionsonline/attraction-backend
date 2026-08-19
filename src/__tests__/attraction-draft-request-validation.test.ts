import {
  createAttractionDraftSchema,
  createAttractionRequestSchema,
  updateAttractionRequestSchema,
} from '../utils/validators';
import { flattenZodIssues } from '../middleware/validate.middleware';
import { ZodError } from 'zod';

/**
 * ATN client sheet rows 81 / 109 / 114.
 *
 * The admin "Save as Draft" action posts whatever the author has filled in so
 * far. `createAttractionSchema.partial()` only relaxes TOP-LEVEL keys, so a
 * submitted-but-blank `destination.city` and an empty `pricingOptions` array
 * still failed the draft branch. The union then reported one `invalid_union`
 * issue with an EMPTY path, which the admin saw as ": Invalid input" — no field
 * named, nothing to act on, and the draft was never stored.
 */

// The exact body the tour editor sends when only the title and short
// description have been typed.
const partialDraftFromEditor = {
  slug: 'sunset-camel-trek-abc123',
  title: 'Sunset Camel Trek',
  shortDescription: 'Draft short description typed before saving',
  status: 'draft' as const,
  tenantIds: ['6a860401efcdfb02fba39d99'],
  currency: 'USD',
  languages: ['English'],
  destination: { city: '', country: 'Egypt', coordinates: { lat: 0, lng: 0 } },
  pricingOptions: [],
  images: [],
  cancellationPolicy: 'Free cancellation up to 24 hours before',
  instantConfirmation: true,
  mobileTicket: true,
  availability: { type: 'time-slots' as const, advanceBooking: 30 },
};

describe('tour draft request validation', () => {
  it('accepts a title-only draft', () => {
    const result = createAttractionDraftSchema.safeParse({
      slug: 'unfinished-tour',
      title: 'Unfinished tour',
      status: 'draft',
    });

    expect(result.success).toBe(true);
  });

  it('accepts the partially filled body the editor actually posts', () => {
    const result = createAttractionRequestSchema.safeParse(partialDraftFromEditor);

    expect(result.success).toBe(true);
  });

  it('still requires a title on a draft', () => {
    const result = createAttractionDraftSchema.safeParse({ slug: 'no-title', status: 'draft' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'title')).toBe(true);
    }
  });

  it('still validates pricing options that were supplied on a draft', () => {
    const result = createAttractionDraftSchema.safeParse({
      slug: 'bad-pricing',
      title: 'Bad pricing',
      status: 'draft',
      pricingOptions: [{ id: 'opt-1', name: '', price: -5 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('pricingOptions.0.name');
      expect(paths).toContain('pricingOptions.0.price');
    }
  });

  it('does not let an incomplete draft through the publish contract', () => {
    const publishAttempt = { ...partialDraftFromEditor, status: 'active' as const };
    const result = createAttractionRequestSchema.safeParse(publishAttempt);

    expect(result.success).toBe(false);
  });
});

describe('validation error field names', () => {
  it('names the offending fields instead of an empty ": Invalid input"', () => {
    const result = createAttractionRequestSchema.safeParse({
      slug: 'broken',
      title: 'Broken',
      status: 'active',
      pricingOptions: [],
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    const flattened = flattenZodIssues(result.error.issues);

    // The bug: a failing union produced a single unnamed entry.
    expect(flattened.length).toBeGreaterThan(0);
    expect(flattened.every((entry) => entry.field !== '')).toBe(true);
    expect(flattened.some((entry) => entry.message === 'Invalid input' && entry.field === '')).toBe(false);
  });

  it('keeps ordinary (non-union) issues unchanged', () => {
    const error = new ZodError([
      { code: 'custom', path: ['duration'], message: 'Duration is required' },
    ] as never);

    expect(flattenZodIssues(error.errors)).toEqual([
      { field: 'duration', message: 'Duration is required' },
    ]);
  });
});

describe('re-saving an existing draft (PATCH)', () => {
  // After the first save the author stays in the editor, so every further save
  // is a PATCH. That path used the same shallow `.partial()`, so the SECOND
  // save failed exactly like the first one used to.
  it('accepts a pruned draft body whose blank city was dropped', () => {
    const result = updateAttractionRequestSchema.safeParse({
      title: 'Half-written tour',
      status: 'draft',
      destination: { country: 'Egypt', coordinates: { lat: 0, lng: 0 } },
      pricingOptions: [],
    });

    expect(result.success).toBe(true);
  });

  it('accepts a title-only draft update', () => {
    expect(updateAttractionRequestSchema.safeParse({ title: 'Half-written', status: 'draft' }).success).toBe(true);
  });

  it('leaves ordinary partial updates working', () => {
    expect(updateAttractionRequestSchema.safeParse({ featured: true }).success).toBe(true);
  });

  it('still validates pricing options supplied on a draft update', () => {
    const result = updateAttractionRequestSchema.safeParse({
      status: 'draft',
      pricingOptions: [{ id: 'opt-1', name: '', price: -1 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('pricingOptions.0.name');
    }
  });
});
