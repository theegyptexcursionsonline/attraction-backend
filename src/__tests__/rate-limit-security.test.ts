import express from 'express';
import request from 'supertest';
import {
  aiGenerationLimiter,
  paymentLimiter,
  publicWriteLimiter,
} from '../middleware/rate-limit.middleware';

const buildApp = (limiter: express.RequestHandler) => {
  const app = express();
  app.set('trust proxy', 1);
  app.post('/write', limiter, (_req, res) => res.status(201).json({ success: true }));
  return app;
};

const exhaust = async (limiter: express.RequestHandler, allowed: number, ip: string) => {
  const app = buildApp(limiter);
  for (let index = 0; index < allowed; index += 1) {
    const response = await request(app).post('/write').set('x-forwarded-for', ip);
    expect(response.status).toBe(201);
  }
  return request(app).post('/write').set('x-forwarded-for', ip);
};

describe('cost and abuse rate limits', () => {
  it('throttles public form submissions after 20 requests', async () => {
    const response = await exhaust(publicWriteLimiter, 20, '198.51.100.21');
    expect(response.status).toBe(429);
    expect(response.body.error).toMatch(/too many submissions/i);
  });

  it('throttles payment attempts independently after 30 requests', async () => {
    const response = await exhaust(paymentLimiter, 30, '198.51.100.22');
    expect(response.status).toBe(429);
    expect(response.body.error).toMatch(/too many payment attempts/i);
  });

  it('protects costly AI generation after 10 requests', async () => {
    const response = await exhaust(aiGenerationLimiter, 10, '198.51.100.23');
    expect(response.status).toBe(429);
    expect(response.body.error).toMatch(/generation limit reached/i);
  });
});
