import express from 'express';
import request from 'supertest';
import { env } from '../config';
import { authenticateContentEngine } from '../middleware/contentEngineAuth';

const buildApp = () => {
  const app = express();
  app.get('/protected', authenticateContentEngine, (_req, res) => res.json({ ok: true }));
  return app;
};

describe('content receiver bearer authentication', () => {
  const originalKey = env.contentEngineApiKey;

  afterEach(() => {
    env.contentEngineApiKey = originalKey;
  });

  it('fails closed when the production key is not configured', async () => {
    env.contentEngineApiKey = '';
    const response = await request(buildApp()).get('/protected');
    expect(response.status).toBe(503);
  });

  it.each([
    ['missing', undefined],
    ['wrong scheme', 'Basic receiver-key'],
    ['wrong value of the same length', 'Bearer receiver-kex'],
  ])('rejects the %s principal', async (_label, authorization) => {
    env.contentEngineApiKey = 'receiver-key';
    const call = request(buildApp()).get('/protected');
    if (authorization) call.set('Authorization', authorization);
    const response = await call;
    expect(response.status).toBe(401);
  });

  it('accepts only the exact bearer principal', async () => {
    env.contentEngineApiKey = 'receiver-key';
    const response = await request(buildApp())
      .get('/protected')
      .set('Authorization', 'Bearer receiver-key');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
