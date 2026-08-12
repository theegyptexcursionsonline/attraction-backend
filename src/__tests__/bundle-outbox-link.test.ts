import { bundleOrderGuestLink } from '../services/bundleOutbox.service';

describe('bundle customer email access link', () => {
  it('places the order capability in a fragment instead of the request URL', () => {
    const link = bundleOrderGuestLink({
      name: 'Makadi Horse Club',
      customDomain: 'makadihorseclub.com',
      domainMigrated: true,
      theme: { primaryColor: '#7c5d34' },
    } as never, 'order-1', 'BTW-LINK01');
    const [requestUrl, fragment] = link.split('#');

    expect(requestUrl).toBe('https://makadihorseclub.com/bundle-orders/order-1');
    expect(requestUrl).not.toContain('accessToken');
    expect(new URLSearchParams(fragment).get('accessToken')).toBeTruthy();
  });
});
