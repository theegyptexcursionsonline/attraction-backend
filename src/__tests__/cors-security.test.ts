import { corsOptions } from '../config/cors';

const evaluateOrigin = (origin: string): Promise<{ allowed: boolean; error?: Error }> =>
  new Promise((resolve) => {
    const originHandler = corsOptions.origin;
    if (typeof originHandler !== 'function') {
      resolve({ allowed: originHandler === true || originHandler === origin });
      return;
    }

    originHandler(origin, (error, allowed) => {
      resolve({ allowed: allowed === true, error: error || undefined });
    });
  });

describe('credentialed CORS origin isolation', () => {
  it.each([
    'https://foxes-network.netlify.app',
    'https://deploy-preview-42--foxes-network.netlify.app',
    'https://abc123--foxes-network.netlify.app',
    'https://makadihorseclub.com',
    'https://tenant.foxesnetwork.com',
  ])('allows an owned origin: %s', async (origin) => {
    await expect(evaluateOrigin(origin)).resolves.toEqual({ allowed: true, error: undefined });
  });

  it.each([
    'https://attacker-site.netlify.app',
    'https://foxes-network.netlify.app.evil.test',
    'https://notfoxes-network.netlify.app',
    'https://attacker.up.railway.app',
  ])('rejects an unrelated origin: %s', async (origin) => {
    const result = await evaluateOrigin(origin);
    expect(result.allowed).toBe(false);
    expect(result.error?.message).toBe('Not allowed by CORS');
  });
});
