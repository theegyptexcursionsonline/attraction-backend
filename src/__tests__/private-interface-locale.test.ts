import express from 'express';
import request from '../test/loopbackRequest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../models/User';
import '../models/Attraction';
import '../models/Tenant';
import authRoutes from '../routes/auth.routes';
import { generateAccessToken } from '../utils/jwt';
import { INTERFACE_LOCALES, IUser } from '../types';
import { updateProfileSchema } from '../utils/validators';

jest.setTimeout(120000);
const app = express();
app.use(express.json());
app.use('/auth', authRoutes);
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({error:'Profile unavailable'}));
let mongo: MongoMemoryServer;
let owner: IUser, other: IUser;
let token: string;
const ownerTenant = new Types.ObjectId(), otherTenant = new Types.ObjectId();
const password = 'FixturePasswordOnlyForLocalTests123!';
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  [owner, other] = await User.create([
    {email:'qa-profile-owner@example.invalid',password,firstName:'QA',lastName:'Owner',role:'customer',language:'de',currency:'EUR',assignedTenants:[ownerTenant]},
    {email:'qa-profile-other@example.invalid',password,firstName:'QA',lastName:'Other',role:'brand-admin',language:'ru',currency:'EGP',assignedTenants:[otherTenant]},
  ]);
  token = generateAccessToken(owner);
});
afterAll(async () => { await mongoose.disconnect(); if(mongo) await mongo.stop(); });
beforeEach(async () => {
  await User.collection.updateOne({_id:owner._id},{$set:{interfaceLocale:'en',status:'active',tokenVersion:0,role:'customer',language:'de',currency:'EUR'}});
  await User.collection.updateOne({_id:other._id},{$set:{interfaceLocale:'en'}});
});
const save = (body: unknown, bearer = token) => request(app).patch('/auth/profile').set('Authorization',`Bearer ${bearer}`).set('Content-Type','application/json').send(JSON.stringify(body));

it.each(INTERFACE_LOCALES)('saves and reads the account-owned %s preference without changing correspondence, commerce or membership', async interfaceLocale => {
  const response = await save({interfaceLocale}).expect(200);
  expect(response.body.data).toMatchObject({interfaceLocale,language:'de',currency:'EUR',role:'customer',assignedTenants:[String(ownerTenant)]});
  const own = await request(app).get('/auth/me').set('Authorization',`Bearer ${token}`).expect(200);
  expect(own.body.data.interfaceLocale).toBe(interfaceLocale);
  expect((await User.findById(other._id))!.interfaceLocale).toBe('en');
  for(const secret of ['password','refreshToken','tokenVersion','twoFactorSecretEnc','twoFactorRecoveryCodeHashes'])expect(own.body.data).not.toHaveProperty(secret);
});
it.each(['es','it','AR',' ar ','ar-EG','',null,[],{},42,'<script>alert(1)</script>'])('rejects unsupported or hostile preference %j without a partial write', async interfaceLocale => {
  await save({interfaceLocale,firstName:'Attempted change'}).expect(400);
  const stored=await User.findById(owner._id);
  expect(stored!.interfaceLocale).toBe('en');
  expect(stored!.firstName).toBe('QA');
});
it.each(['userId','id','_id','role','assignedTenants','tenantId','permissions','email','$set','__proto__','constructor','prototype','password','status','tokenVersion','twoFactorEnabled','twoFactorSecretEnc','refreshToken','passwordResetToken','totalSpent','loyaltyPoints','assignedTenants.0','$unset'])('rejects principal/security field %s alongside a language update',async key => {
  const body=JSON.parse(`{"interfaceLocale":"ar","${key}":"${other._id}"}`);
  await save(body).expect(400);
  expect((await User.findById(owner._id))!.interfaceLocale).toBe('en');
  expect((await User.findById(other._id))!.interfaceLocale).toBe('en');
});
it('strips benign extra fields from old clients while saving only authenticated profile fields',async()=> {
  const response=await save({interfaceLocale:'ar',firstName:'QA updated',timezone:'UTC',clientVersion:2,preferences:{theme:'dark'}}).expect(200);
  expect(response.body.data).toMatchObject({interfaceLocale:'ar',firstName:'QA updated',language:'de',currency:'EUR',role:'customer'});
  const stored=await User.collection.findOne({_id:owner._id});
  for(const key of ['timezone','clientVersion','preferences']) expect(stored).not.toHaveProperty(key);
  expect((await User.findById(other._id))!.interfaceLocale).toBe('en');
  expect(updateProfileSchema.parse({interfaceLocale:'fr',timezone:'UTC'})).toEqual({interfaceLocale:'fr'});
});
it('cannot target another account using a public tenant header or query',async()=> {
  await request(app).patch(`/auth/profile?userId=${other._id}&tenantId=${otherTenant}&lang=ru`).set('X-Tenant-ID',String(otherTenant)).set('Authorization',`Bearer ${token}`).send({interfaceLocale:'fr'}).expect(200);
  expect((await User.findById(owner._id))!.interfaceLocale).toBe('fr');
  expect((await User.findById(other._id))!.interfaceLocale).toBe('en');
});
it('requires a valid active non-revoked account',async()=> {
  await request(app).patch('/auth/profile').send({interfaceLocale:'ar'}).expect(401);
  await save({interfaceLocale:'ar'},'invalid-session').expect(401);
  await User.collection.updateOne({_id:owner._id},{$set:{status:'suspended'}});
  await save({interfaceLocale:'ar'}).expect(403);
  await User.collection.updateOne({_id:owner._id},{$set:{status:'active',tokenVersion:1}});
  await save({interfaceLocale:'ar'}).expect(401);
  expect((await User.findById(owner._id))!.interfaceLocale).toBe('en');
});
it('keeps legacy reads English and old profile writes from resetting a saved preference',async()=> {
  await User.collection.updateOne({_id:owner._id},{$unset:{interfaceLocale:''}});
  const legacy = await request(app).get('/auth/me').set('Authorization',`Bearer ${token}`).expect(200);
  expect(legacy.body.data.interfaceLocale).toBe('en');
  expect(await User.collection.findOne({_id:owner._id})).not.toHaveProperty('interfaceLocale');
  await save({interfaceLocale:'ar'}).expect(200);
  await save({phone:'123456',language:'fr',currency:'USD'}).expect(200);
  expect((await User.findById(owner._id))!.toJSON()).toMatchObject({interfaceLocale:'ar',language:'fr',currency:'USD'});
});
it('retries are idempotent and a simultaneous legacy edit preserves the independent preference',async()=> {
  await Promise.all([save({interfaceLocale:'ar'}).expect(200),save({phone:'123456'}).expect(200)]);
  await save({interfaceLocale:'ar'}).expect(200);
  const stored=await User.findById(owner._id);
  expect(stored!.interfaceLocale).toBe('ar');expect(stored!.phone).toBe('123456');
});
it('exposes a safe default from legacy/malformed serialization and validates model writes',async()=> {
  const fixture = {email:'qa-schema@example.invalid',password,firstName:'QA',lastName:'Schema'};
  expect(new User(fixture).toJSON()).toHaveProperty('interfaceLocale','en');
  for(const interfaceLocale of ['es',null]) {
    const user=new User({...fixture,interfaceLocale});
    expect(user.validateSync()?.errors).toHaveProperty('interfaceLocale');
    expect(user.toJSON()).toHaveProperty('interfaceLocale','en');
  }
  expect(updateProfileSchema.parse({firstName:'QA'})).not.toHaveProperty('interfaceLocale');
});
it('database/provider failures do not report success or overwrite a preference',async()=> {
  const failure=jest.spyOn(User,'findByIdAndUpdate').mockRejectedValueOnce(new Error('Temporary failure'));
  try {await save({interfaceLocale:'ar'}).expect(500);} finally {failure.mockRestore();}
  expect((await User.findById(owner._id))!.interfaceLocale).toBe('en');
});

it.each(['super-admin','brand-admin','manager','editor','viewer','customer'] as const)('%s can change only their own interface preference',async role=> {
  await User.collection.updateOne({_id:owner._id},{$set:{role}});
  const principal=(await User.findById(owner._id))!;
  const response=await save({interfaceLocale:'de'},generateAccessToken(principal)).expect(200);
  expect(response.body.data).toMatchObject({role,interfaceLocale:'de'});
  expect((await User.findById(other._id))!.interfaceLocale).toBe('en');
});
it('handles an account disappearing after authentication without reporting success',async()=> {
  const missing=jest.spyOn(User,'findByIdAndUpdate').mockResolvedValueOnce(null);
  try {await save({interfaceLocale:'ar'}).expect(404);} finally {missing.mockRestore();}
  expect((await User.findById(owner._id))!.interfaceLocale).toBe('en');
});
