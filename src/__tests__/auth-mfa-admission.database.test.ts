import path from 'path';
import { execFile, spawnSync } from 'child_process';
import { promisify } from 'util';
import { MongoMemoryServer } from 'mongodb-memory-server';

jest.setTimeout(180_000);
it('enforces real authenticator lifecycle, concurrency, expiry and revocation against a disposable database', async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  const mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  try {
    const result = await promisify(execFile)(process.execPath, ['src/test/fixtures/auth-mfa-admission.cjs'], {
      cwd: path.resolve(__dirname, '../..'), timeout: 150_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, NODE_ENV: 'test', TEST_MONGO_URI: mongo.getUri('auth_mfa_admission'), MAILGUN_API_KEY: '', MAILGUN_DOMAIN: '' },
    });
    const line = result.stdout.split('\n').find(value => value.startsWith('RESULT '));
    expect(line).toBeDefined();
    expect(JSON.parse(line!.slice(7))).toEqual([
      'same challenge setup is idempotent and fresh login supersedes its pending secret',
      'enrollment revokes previously issued sessions and advances legacy null once',
      'a consumed challenge cannot mint another session in a later unused TOTP step',
      'concurrent authenticator verification consumes one challenge once',
      'setup never discloses a secret after revocation while rendering QR',
      'confirmation refuses pending setup rotation during real verification',
      'confirmation refuses pending setup expiry during real verification',
      'confirmation refuses pending setup context during real verification',
      'verify refuses a TOTP proof expired after asynchronous crypto',
      'confirm refuses a TOTP proof expired after asynchronous crypto',
      'TOTP proof cannot outlive claim response work',
      'TOTP proof cannot outlive sections response work',
      'expired pending setup is refused even after the final asynchronous state read',
      'setup helper reuses exact encrypted secret and rejects invalid ciphertext',
    ]);
  } finally { await mongo.stop(); }
});
