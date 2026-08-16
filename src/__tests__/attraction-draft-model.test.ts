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
