import express from 'express';
import request from 'supertest';
import router from '../routes';

const KEYS = ['RAILWAY_GIT_COMMIT_SHA', 'RAILWAY_DEPLOYMENT_ID'] as const;
const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

const app = express();
app.use('/api', router);

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('GET /api/version', () => {
  it('names the commit and deployment this process is running, without auth and never cached', async () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = 'bb138af0123456789abcdef0123456789abcdef0';
    process.env.RAILWAY_DEPLOYMENT_ID = '7f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f';
    const response = await request(app).get('/api/version').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      commit: 'bb138af0123456789abcdef0123456789abcdef0',
      deployId: '7f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f',
      builtAt: expect.any(String),
    });
    const builtAt = new Date(response.body.builtAt);
    expect(Number.isFinite(builtAt.getTime())).toBe(true);
    expect(builtAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('a process without Railway metadata reports null, never an empty string or a guess', async () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = '';
    process.env.RAILWAY_DEPLOYMENT_ID = '   ';
    const { body } = await request(app).get('/api/version').expect(200);
    expect(body.commit).toBeNull();
    expect(body.deployId).toBeNull();
    expect(typeof body.builtAt).toBe('string');
  });

  it('is stable across calls in one process and exposes only release identity', async () => {
    const first = (await request(app).get('/api/version')).body;
    const second = (await request(app).get('/api/version')).body;
    expect(second.builtAt).toBe(first.builtAt);
    expect(Object.keys(first).sort()).toEqual(['builtAt', 'commit', 'deployId']);
    expect(JSON.stringify(first)).not.toMatch(/key|secret|token|mongodb|password|@/i);
  });
});
