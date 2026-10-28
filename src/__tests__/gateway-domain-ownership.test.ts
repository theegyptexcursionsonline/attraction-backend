import mongoose from 'mongoose';
import { DomainClaim } from '../models/DomainClaim';
import { Tenant } from '../models/Tenant';
import { createGatewayDomainOwnership } from '../services/gatewayDomainOwnership.service';

jest.mock('../models/DomainClaim', () => ({ DomainClaim: { findById: jest.fn(), create: jest.fn(), updateOne: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: { findById: jest.fn(), find: jest.fn(), findOneAndUpdate: jest.fn() } }));
const id = '6ad9180019cdb7353ebbd0f5', actor = '6ad9180019cdb7353ebbd0f6';
const tenant = { _id:id, slug:'site-one', status:'active', customDomain:null };
const session = { withTransaction:jest.fn(), endSession:jest.fn() };
const q = (value:unknown) => {
  const result = {select:jest.fn(),limit:jest.fn(),maxTimeMS:jest.fn(),session:jest.fn(),lean:jest.fn().mockResolvedValue(value)};
  result.select.mockReturnValue(result); result.limit.mockReturnValue(result); result.maxTimeMS.mockReturnValue(result); result.session.mockReturnValue(result); return result;
};
beforeEach(() => {
  jest.clearAllMocks();
  process.env.GATEWAY_DOMAIN_OWNERSHIP_ENABLED = 'true';
  process.env.GATEWAY_DOMAIN_NAMESPACE_READY = 'true';
  process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED = 'true';
  process.env.GATEWAY_DOMAIN_SCOPE = 'site-one.com';
  jest.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
  session.withTransaction.mockImplementation(async (fn: () => Promise<unknown>) => fn());
  (Tenant.findById as jest.Mock).mockReturnValue(q(tenant));
  (Tenant.find as jest.Mock).mockReturnValue(q([tenant]));
  (DomainClaim.findById as jest.Mock).mockReturnValue(q(null));
  (DomainClaim.create as jest.Mock).mockResolvedValue([{}]);
  (DomainClaim.updateOne as jest.Mock).mockResolvedValue({modifiedCount:1});
  (Tenant.findOneAndUpdate as jest.Mock).mockReturnValue(q({...tenant,customDomain:'site-one.com'}));
});
afterEach(() => {
  for (const key of ['GATEWAY_DOMAIN_OWNERSHIP_ENABLED','GATEWAY_DOMAIN_NAMESPACE_READY','GATEWAY_DOMAIN_WRITER_FENCE_ENABLED','GATEWAY_DOMAIN_SCOPE']) Reflect.deleteProperty(process.env,key);
  jest.restoreAllMocks();
});

it('fails closed when disabled or unscoped, without database writes', async () => {
  Reflect.deleteProperty(process.env,'GATEWAY_DOMAIN_OWNERSHIP_ENABLED');
  await expect(createGatewayDomainOwnership('site-one.com',id,actor)).rejects.toThrow();
  expect(mongoose.startSession).not.toHaveBeenCalled();
});

it('fails closed when the bounded inventory limit is reached', async () => {
  (Tenant.find as jest.Mock).mockReturnValue(q(Array.from({length:3},(_,i)=>({...tenant,_id:String(i)}))));
  await expect(createGatewayDomainOwnership('site-one.com',id,actor,undefined,2)).rejects.toThrow('safe bound');
  expect(DomainClaim.create).not.toHaveBeenCalled();
});

it('rejects a different tenant with a Unicode-normalized matching domain', async () => {
  (Tenant.find as jest.Mock).mockReturnValue(q([tenant,{_id:'other',domain:'ｓｉｔｅ-one.com'}]));
  await expect(createGatewayDomainOwnership('site-one.com',id,actor)).rejects.toThrow('already assigned');
  expect(DomainClaim.create).not.toHaveBeenCalled();
});

it('creates a scoped claim and compare-and-sets the tenant in one transaction', async () => {
  expect(await createGatewayDomainOwnership('www.site-one.com',id,actor)).toMatchObject({id,customDomain:'site-one.com'});
  expect(DomainClaim.create).toHaveBeenCalledWith([expect.objectContaining({_id:'site-one.com',provider:'cloudflare'})],{session});
  expect(Tenant.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({_id:id,status:'active'}),expect.any(Object),expect.objectContaining({session}));
  expect(session.withTransaction).toHaveBeenCalledWith(expect.any(Function),{readConcern:{level:'snapshot'}});
  expect(session.endSession).toHaveBeenCalled();
});

it('does not silently adopt an unclaimed existing tenant domain', async () => {
  (Tenant.findById as jest.Mock).mockReturnValue(q({...tenant,customDomain:'site-one.com'}));
  await expect(createGatewayDomainOwnership('site-one.com',id,actor)).rejects.toThrow('Existing domain requires review');
  expect(DomainClaim.create).not.toHaveBeenCalled();
});

it('rejects a foreign or legacy claim without provider calls', async () => {
  (DomainClaim.findById as jest.Mock).mockReturnValue(q({tenantId:id}));
  await expect(createGatewayDomainOwnership('site-one.com',id,actor)).rejects.toThrow('Existing claim requires review');
  expect(Tenant.findOneAndUpdate).not.toHaveBeenCalled();
});

it('adopts an exact existing unclaimed assignment only with explicit confirmation', async () => {
  (Tenant.findById as jest.Mock).mockReturnValue(q({...tenant,customDomain:'site-one.com'}));
  await expect(createGatewayDomainOwnership('site-one.com',id,actor,{adoptExisting:true,expectedCurrentDomain:'site-one.com'}))
    .resolves.toMatchObject({id,customDomain:'site-one.com'});
  expect(DomainClaim.create).toHaveBeenCalledTimes(1);
  expect(Tenant.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({customDomain:'site-one.com'}),
    {$inc:{gatewayDomainRevision:1}},expect.objectContaining({session}));
});

it('adopts an existing same-tenant legacy claim only on explicit exact confirmation', async () => {
  (Tenant.findById as jest.Mock).mockReturnValue(q({...tenant,customDomain:'site-one.com'}));
  (DomainClaim.findById as jest.Mock).mockReturnValue(q({tenantId:id}));
  await expect(createGatewayDomainOwnership('site-one.com',id,actor,{adoptExisting:true,expectedCurrentDomain:'site-one.com'}))
    .resolves.toMatchObject({id,customDomain:'site-one.com'});
  expect(DomainClaim.updateOne).toHaveBeenCalledWith(expect.objectContaining({_id:'site-one.com',tenantId:id}),
    {$set:{provider:'cloudflare'}},{session});
  expect(DomainClaim.create).not.toHaveBeenCalled();
});

it('rejects adoption when expected domain mismatches', async () => {
  (Tenant.findById as jest.Mock).mockReturnValue(q({...tenant,customDomain:'site-one.com'}));
  await expect(createGatewayDomainOwnership('site-one.com',id,actor,{adoptExisting:true,expectedCurrentDomain:'site-two.com'})).rejects.toThrow('Existing domain changed');
  expect(DomainClaim.create).not.toHaveBeenCalled();
});

it('fails when the tenant compare-and-set loses a race', async () => {
  (Tenant.findOneAndUpdate as jest.Mock).mockReturnValue(q(null));
  await expect(createGatewayDomainOwnership('site-one.com',id,actor)).rejects.toThrow('Tenant changed');
  expect(session.endSession).toHaveBeenCalled();
});

it('maps duplicate claim insertion to a conflict', async () => {
  (DomainClaim.create as jest.Mock).mockRejectedValue({code:11000});
  await expect(createGatewayDomainOwnership('site-one.com',id,actor)).rejects.toThrow('Domain already claimed');
});
