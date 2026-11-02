import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Tenant } from '../models/Tenant';
import { DomainClaim } from '../models/DomainClaim';
import {
  GATEWAY_DOMAIN_ASSIGNMENTS,
  applyGatewayDomainAssignment,
  applyGatewayDomainAssignments,
} from '../services/gatewayDomainAssignments.service';

jest.setTimeout(90_000);
const SLUG = 'coral-safari-hurghada';
const DOMAIN = 'coralsafarihurghada.com';
let mongo: MongoMemoryServer;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('gateway_domains'), { autoIndex: false });
});
beforeEach(async () => {
  await Tenant.collection.deleteMany({});
  await DomainClaim.collection.deleteMany({});
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

const site = (fields: Record<string, unknown> = {}) =>
  Tenant.collection.insertOne({ _id: new Types.ObjectId(), slug: SLUG, name: 'Coral Safari Hurghada', status: 'active', ...fields } as never);

it('lists Coral as a gateway domain assignment', () => {
  expect(GATEWAY_DOMAIN_ASSIGNMENTS).toContainEqual({ slug: SLUG, domain: DOMAIN });
});

it('attaches the domain and its claim, then leaves it alone', async () => {
  const { insertedId } = await site({ customDomainStatus: 'unconfigured' });
  await expect(applyGatewayDomainAssignment(SLUG, DOMAIN)).resolves.toBe('attached');
  const stored = await Tenant.collection.findOne({ _id: insertedId });
  expect(stored).toMatchObject({ customDomain: DOMAIN, customDomainStatus: 'pending_dns', name: 'Coral Safari Hurghada' });
  expect(String((await DomainClaim.findById(DOMAIN).lean())?.tenantId)).toBe(String(insertedId));
  await expect(applyGatewayDomainAssignment(SLUG, DOMAIN)).resolves.toBe('unchanged');
  expect(await DomainClaim.countDocuments()).toBe(1);
});

it('restores a missing claim for a site that already has the domain', async () => {
  const { insertedId } = await site({ customDomain: DOMAIN });
  await expect(applyGatewayDomainAssignment(SLUG, DOMAIN)).resolves.toBe('unchanged');
  expect(String((await DomainClaim.findById(DOMAIN).lean())?.tenantId)).toBe(String(insertedId));
});

it('never overwrites a different domain on the site', async () => {
  await site({ customDomain: 'other-example.com' });
  await expect(applyGatewayDomainAssignment(SLUG, DOMAIN)).resolves.toBe('site-has-other-domain');
  expect(await Tenant.collection.findOne({ slug: SLUG })).toMatchObject({ customDomain: 'other-example.com' });
  expect(await DomainClaim.countDocuments()).toBe(0);
});

it('refuses a domain another site uses or claims', async () => {
  await site();
  await Tenant.collection.insertOne({ _id: new Types.ObjectId(), slug: 'other-site', status: 'active', customDomain: DOMAIN } as never);
  await expect(applyGatewayDomainAssignment(SLUG, DOMAIN)).resolves.toBe('domain-in-use');
  await Tenant.collection.deleteOne({ slug: 'other-site' });
  await DomainClaim.create({ _id: DOMAIN, tenantId: new Types.ObjectId() });
  await expect(applyGatewayDomainAssignment(SLUG, DOMAIN)).resolves.toBe('claim-held-elsewhere');
  expect((await Tenant.collection.findOne({ slug: SLUG }))?.customDomain).toBeUndefined();
});

it('skips a site that is missing or not active', async () => {
  await expect(applyGatewayDomainAssignment(SLUG, DOMAIN)).resolves.toBe('missing-site');
  await site({ status: 'suspended' });
  await expect(applyGatewayDomainAssignment(SLUG, DOMAIN)).resolves.toBe('missing-site');
  expect(await DomainClaim.countDocuments()).toBe(0);
});

it('start-up hook applies the list and never throws', async () => {
  await site();
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  await expect(applyGatewayDomainAssignments()).resolves.toBeUndefined();
  expect(log).toHaveBeenCalledWith(expect.stringContaining(`${SLUG} → ${DOMAIN}: attached`));
  log.mockRestore();
});
