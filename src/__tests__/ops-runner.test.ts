import { spawnSync } from 'child_process';
import path from 'path';
import { OPS_RUNNER_SERVICE, refusesApiServer } from '../utils/opsRunnerGuard';

const root = path.resolve(__dirname, '../..');
const run = (task?: string) =>
  spawnSync('sh', ['scripts/ops-runner.sh'], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...(task === undefined ? {} : { OPS_TASK: task }) },
  });

it('stays idle without a task', () => {
  const result = run();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('idle');
  expect(run('').status).toBe(0);
});

it.each([
  'npm start',
  'node -e "process.exit(0)"',
  'sh -c id',
  'src/scripts/../../package.json',
  'src/app.ts',
  'src/scripts/does-not-exist.ts',
])('refuses %s', (task) => {
  const result = run(task);
  expect(result.status).toBe(2);
  expect(result.stdout).toContain('refused');
});

it('the API server refuses to start in the ops-runner service only', () => {
  expect(refusesApiServer({ RAILWAY_SERVICE_NAME: OPS_RUNNER_SERVICE })).toBe(true);
  expect(refusesApiServer({ RAILWAY_SERVICE_NAME: 'web' })).toBe(false);
  expect(refusesApiServer({})).toBe(false);
});
