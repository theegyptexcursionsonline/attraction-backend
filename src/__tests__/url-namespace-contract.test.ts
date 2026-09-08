import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';
import router from '../routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { urlNamespaceReadiness } from '../plugins/urlNamespace';

it('reports an explicit protocol version and fails closed when activation is absent', async () => {
  const previous = process.env.URL_NAMESPACE_WRITES_READY;
  const app = express(); app.use('/api', router);
  try {
    delete process.env.URL_NAMESPACE_WRITES_READY;
    expect(urlNamespaceReadiness()).toEqual({ protocol: 1, writesReady: false });
    expect((await request(app).get('/api/health').expect(200)).body.urlNamespace).toEqual({ protocol: 1, writesReady: false });
    process.env.URL_NAMESPACE_WRITES_READY = 'true';
    expect((await request(app).get('/api/health').expect(200)).body.urlNamespace).toEqual({ protocol: 1, writesReady: true });
  } finally { if (previous === undefined) delete process.env.URL_NAMESPACE_WRITES_READY; else process.env.URL_NAMESPACE_WRITES_READY = previous; }
});
it('guards the documented document save alias on both namespace owners', () => {
  expect(Tenant.prototype.$save).toBe(Tenant.prototype.save);
  expect(Attraction.prototype.$save).toBe(Attraction.prototype.save);
});
it('keeps application and maintenance writers on guarded model methods', () => {
  const offenders: string[] = [];
  const root = path.resolve(__dirname, '..');
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === 'test') continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.name.endsWith('.ts')) {
        const source = fs.readFileSync(filename, 'utf8');
        if (/(?:Tenant|Attraction)\.collection\.(?:insertOne|insertMany|updateOne|updateMany|replaceOne|bulkWrite|findOneAndUpdate|deleteOne|deleteMany)\s*\(/.test(source)
          || /collection\(\s*['"](?:tenants|attractions)['"]\s*\)\s*\.(?:insertOne|insertMany|updateOne|updateMany|replaceOne|bulkWrite|findOneAndUpdate|deleteOne|deleteMany)\s*\(/.test(source)) offenders.push(path.relative(root, filename));
      }
    }
  };
  visit(root);
  expect(offenders).toEqual([]);
});
