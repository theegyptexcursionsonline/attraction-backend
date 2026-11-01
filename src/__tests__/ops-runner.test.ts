import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

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

it('never starts the API server and never restarts', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'railway.ops.json'), 'utf8'));
  expect(config.deploy).toMatchObject({ startCommand: 'sh scripts/ops-runner.sh', restartPolicyType: 'NEVER' });
  expect(config.deploy).not.toHaveProperty('healthcheckPath');
  // The API service keeps its own config-as-code file.
  expect(JSON.parse(fs.readFileSync(path.join(root, 'railway.json'), 'utf8')).deploy.startCommand).toBe('npm start');
});
