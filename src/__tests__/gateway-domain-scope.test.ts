import { assertDestructiveTenantSeedAllowed, legacyDomainWriteBlocked, runDestructiveTenantReset } from '../services/gatewayDomainScope';

afterEach(() => {
  Reflect.deleteProperty(process.env,'GATEWAY_DOMAIN_WRITER_FENCE_ENABLED');
  Reflect.deleteProperty(process.env,'GATEWAY_DOMAIN_SCOPE');
});

it('keeps existing writes unchanged when disabled', () => {
  expect(legacyDomainWriteBlocked('site-one.com')).toBe(false);
});
it('fences normalized scoped domains while preserving unrelated names', () => {
  process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED = 'true';
  process.env.GATEWAY_DOMAIN_SCOPE = 'site-one.com';
  expect(legacyDomainWriteBlocked(' WWW.SITE-ONE.COM. ')).toBe(true);
  expect(legacyDomainWriteBlocked('site-two.com')).toBe(false);
});
it('fails closed on missing scope configuration', () => {
  process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED = 'true';
  expect(() => legacyDomainWriteBlocked('site-one.com')).toThrow('scope unavailable');
});

it('refuses the bulk tenant reset before any delete while the fence is enabled', () => {
  process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED = 'true';
  expect(() => assertDestructiveTenantSeedAllowed()).toThrow('bulk tenant seed');
});

it('does not invoke any bulk delete callback when the fence is enabled', async () => {
  process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED = 'true';
  const reset = jest.fn(async () => 'deleted');
  await expect(runDestructiveTenantReset(reset)).rejects.toThrow('bulk tenant seed');
  expect(reset).not.toHaveBeenCalled();
});

it('retains the pre-existing bulk seed behavior when the fence is disabled', async () => {
  const reset = jest.fn(async () => 'deleted');
  await expect(runDestructiveTenantReset(reset)).resolves.toBe('deleted');
  expect(reset).toHaveBeenCalledTimes(1);
});
