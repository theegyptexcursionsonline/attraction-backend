import express from 'express';
import request from '../test/loopbackRequest';
import { validateCustomerSiteHint } from '../utils/customerLists';

describe.each(['simple','extended'] as const)('customer site hints with %s query parser', parser => {
  const app = express();
  app.set('query parser', parser);
  app.use(express.json());
  app.all('/saved', validateCustomerSiteHint, (_req,res) => res.json({success:true}));

  test.each([
    '?tenantId%5B%5D=site', '?tenantId%5B0%5D=site', '?tenantId.other=site',
    '?tenantId=site&tenantId=other', '?tenant=site&tenant=other', '?tenantId=', '?TenantId=site',
  ])('malformed explicit hint cannot reach reads or page removal: %s', async query => {
    for (const method of ['get','delete'] as const) {
      const call = request(app)[method](`/saved${query}`);
      if (method === 'delete') call.send({ids:['aaaaaaaaaaaaaaaaaaaaaaaa']});
      const result = await call;
      expect(result.status).toBe(400);
      expect(result.body.success).toBe(false);
    }
  });

  test('valid legacy, scoped and header-priority requests retain their contracts', async () => {
    expect((await request(app).get('/saved')).status).toBe(200);
    expect((await request(app).get('/saved?tenantId=site')).status).toBe(200);
    expect((await request(app).get('/saved?tenantId=other').set('X-Tenant-ID','site')).status).toBe(200);
  });
});
