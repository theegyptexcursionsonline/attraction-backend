import { createGatewayDomain, getGatewayDomain } from '../controllers/gatewayDomain.controller';
import { resolveGatewayDomain } from '../services/gatewayDomain.service';
import { createGatewayDomainOwnership } from '../services/gatewayDomainOwnership.service';

jest.mock('../services/gatewayDomain.service', () => ({ resolveGatewayDomain: jest.fn() }));
jest.mock('../services/gatewayDomainOwnership.service', () => ({
  createGatewayDomainOwnership: jest.fn(), GatewayOwnershipConflict: class extends Error {},
}));
const response = () => {
  const res = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
};
beforeEach(() => {
  jest.resetAllMocks();
  process.env.GATEWAY_DOMAIN_RESOLVER_ENABLED = 'true';
  process.env.GATEWAY_DOMAIN_NAMESPACE_READY = 'true';
  process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED = 'true';
  process.env.GATEWAY_DOMAIN_SCOPE = 'site-one.com,unknown.com';
});
afterEach(() => {
  Reflect.deleteProperty(process.env, 'GATEWAY_DOMAIN_RESOLVER_ENABLED');
  Reflect.deleteProperty(process.env, 'GATEWAY_DOMAIN_NAMESPACE_READY');
  Reflect.deleteProperty(process.env, 'GATEWAY_DOMAIN_WRITER_FENCE_ENABLED');
  Reflect.deleteProperty(process.env, 'GATEWAY_DOMAIN_SCOPE');
});

it('is disabled by default and never looks up ownership', async () => {
  Reflect.deleteProperty(process.env, 'GATEWAY_DOMAIN_RESOLVER_ENABLED');
  const res = response();
  await getGatewayDomain({ params: { hostname: 'site-one.com' } } as never, res as never, jest.fn());
  expect(res.status).toHaveBeenCalledWith(503);
  expect(resolveGatewayDomain).not.toHaveBeenCalled();
});

it('remains disabled until the namespace is ready', async () => {
  Reflect.deleteProperty(process.env, 'GATEWAY_DOMAIN_NAMESPACE_READY');
  const res = response();
  await getGatewayDomain({ params: { hostname: 'site-one.com' } } as never, res as never, jest.fn());
  expect(res.status).toHaveBeenCalledWith(503);
  expect(resolveGatewayDomain).not.toHaveBeenCalled();
});

it('fails closed if the writer fence is disabled', async () => {
  Reflect.deleteProperty(process.env, 'GATEWAY_DOMAIN_WRITER_FENCE_ENABLED');
  const res = response();
  await getGatewayDomain({ params: { hostname: 'site-one.com' } } as never, res as never, jest.fn());
  expect(res.status).toHaveBeenCalledWith(503);
  expect(resolveGatewayDomain).not.toHaveBeenCalled();
});

it('returns only the approved identity and prevents caching', async () => {
  const identity = { id: 'tenant-1', slug: 'site-one', customDomain: 'site-one.com', status: 'active' };
  (resolveGatewayDomain as jest.Mock).mockResolvedValue(identity);
  const res = response();
  await getGatewayDomain({ params: { hostname: 'site-one.com' } } as never, res as never, jest.fn());
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: identity }));
});

it('fails closed when domain ownership is not established', async () => {
  (resolveGatewayDomain as jest.Mock).mockResolvedValue(null);
  const res = response();
  await getGatewayDomain({ params: { hostname: 'unknown.com' } } as never, res as never, jest.fn());
  expect(res.status).toHaveBeenCalledWith(404);
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
});

it('passes database errors to the existing error handler without accepting the host', async () => {
  const error = new Error('unavailable');
  (resolveGatewayDomain as jest.Mock).mockRejectedValue(error);
  const res = response(), next = jest.fn();
  await getGatewayDomain({ params: { hostname: 'site-one.com' } } as never, res as never, next);
  expect(next).toHaveBeenCalledWith(error);
  expect(res.json).not.toHaveBeenCalled();
});

it.each([undefined, {role:'brand-admin'}, {role:'customer'}])('rejects non-super-admin ownership writes', async user => {
  const res = response();
  await createGatewayDomain({user,params:{id:'tenant-1'},body:{domain:'site-one.com'}} as never, res as never, jest.fn());
  expect(res.status).toHaveBeenCalledWith(user ? 403 : 401);
  expect(createGatewayDomainOwnership).not.toHaveBeenCalled();
});
