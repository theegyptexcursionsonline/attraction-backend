import { Tenant } from '../models/Tenant';

describe('persisted page presentation', () => {
  const page = (values: Record<string, unknown>) => new Tenant({ customPages: [{ slug: 'landing', title: 'Landing', ...values }] }).customPages![0] as any;
  it('defaults legacy pages to website layout and retains authored values', () => {
    expect(page({}).layoutMode).toBe('website');
    const stored = page({ layoutMode: 'standalone', heroImage: 'https://images.example/a.jpg', heroDescription: 'Authored intro' });
    expect(stored.validateSync()).toBeUndefined();
    expect(stored.toObject()).toEqual(expect.objectContaining({ layoutMode: 'standalone', heroDescription: 'Authored intro', heroImage: 'https://images.example/a.jpg' }));
    expect(page({ heroImage: '', heroDescription: '' }).validateSync()).toBeUndefined();
  });
  test.each([{ layoutMode: 'invalid' }, { heroImage: 'http://images.example/a.jpg' }, { heroDescription: 'a'.repeat(1001) }])('rejects invalid persistence %j', values => {
    expect(page(values).validateSync()).toBeDefined();
  });
});
