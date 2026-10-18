import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

describe('verified production runtime installation', () => {
  let root: string;
  let bin: string;
  let destination: string;
  const installer = path.resolve(__dirname, '../../scripts/install-node-runtime.sh');
  const writeCommand = (name: string, body: string) => writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\nset -eu\n${body}\n`, { mode: 0o755 });
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'runtime-contract-'));
    bin = path.join(root, 'bin');
    destination = path.join(root, 'runtime');
    mkdirSync(bin);
    writeCommand('uname', 'if [ "$1" = "-s" ]; then echo "${TEST_PLATFORM:-Linux}"; else echo "${TEST_ARCH:-x86_64}"; fi');
    writeCommand('curl', 'printf "%s\\n" "$@" > "$TEST_ROOT/download-arguments"\n[ "${TEST_DOWNLOAD_FAIL:-0}" = 0 ] || exit 22\nwhile [ "$1" != "--output" ]; do shift; done\nprintf fixture > "$2"');
    writeCommand('sha256sum', 'cat > "$TEST_ROOT/checksum-input"\n[ "${TEST_CHECKSUM_FAIL:-0}" = 0 ]');
    writeCommand('tar', 'touch "$TEST_ROOT/extracted"\nwhile [ "$1" != "-C" ]; do shift; done\nmkdir -p "$2/bin"\nprintf \'#!/usr/bin/env bash\\necho "%s"\\n\' "${TEST_VERSION:-v24.22.0}" > "$2/bin/node"\nchmod +x "$2/bin/node"');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const run = (extra: Record<string, string> = {}) => spawnSync('bash', [installer, destination], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_ROOT: root, ...extra }, encoding: 'utf8',
  });
  const expectNoInstalledRuntime = () => {
    expect(existsSync(path.join(destination, 'node'))).toBe(false);
    if (existsSync(destination)) expect(readdirSync(destination).filter(name => name.startsWith('.node-install.'))).toEqual([]);
  };
  it.each([
    ['x86_64', 'x64', 'cc2f601cee82d9a5a233302fe307abc600727035fd7d2c3a3571755989e95008'],
    ['aarch64', 'arm64', 'fef00bb4d36e1c50104a9775a10359beee98f162b4104dd12472c75065c6a143'],
  ])('installs the pinned official %s archive only after digest and version admission', (machine, arch, hash) => {
    const result = run({ TEST_ARCH: machine });
    expect(result.status).toBe(0);
    expect(readFileSync(path.join(root, 'download-arguments'), 'utf8')).toContain(`https://nodejs.org/dist/v24.22.0/node-v24.22.0-linux-${arch}.tar.xz`);
    expect(readFileSync(path.join(root, 'checksum-input'), 'utf8')).toBe(`${hash}  node-v24.22.0-linux-${arch}.tar.xz\n`);
    expect(existsSync(path.join(destination, 'node/bin/node'))).toBe(true);
    expect(readdirSync(destination)).toEqual(['node']);
  });
  it('refuses unsupported platforms before any download', () => {
    expect(run({ TEST_PLATFORM: 'Darwin' }).status).not.toBe(0);
    expect(existsSync(path.join(root, 'download-arguments'))).toBe(false);
    expectNoInstalledRuntime();
  });
  it('does not extract an archive whose digest fails verification', () => {
    expect(run({ TEST_CHECKSUM_FAIL: '1' }).status).not.toBe(0);
    expect(existsSync(path.join(root, 'extracted'))).toBe(false);
    expectNoInstalledRuntime();
  });
  it('cleans up after a failed download without extracting or verifying partial bytes', () => {
    expect(run({ TEST_DOWNLOAD_FAIL: '1' }).status).not.toBe(0);
    expect(existsSync(path.join(root, 'checksum-input'))).toBe(false);
    expect(existsSync(path.join(root, 'extracted'))).toBe(false);
    expectNoInstalledRuntime();
  });
  it('does not promote a runtime with an unexpected executable version', () => {
    expect(run({ TEST_VERSION: 'v24.10.0' }).status).not.toBe(0);
    expectNoInstalledRuntime();
  });
  it('does not overwrite an existing runtime or download over it', () => {
    mkdirSync(path.join(destination, 'node'), { recursive: true });
    writeFileSync(path.join(destination, 'node/marker'), 'existing');
    expect(run().status).not.toBe(0);
    expect(readFileSync(path.join(destination, 'node/marker'), 'utf8')).toBe('existing');
    expect(existsSync(path.join(root, 'download-arguments'))).toBe(false);
  });
});

describe('production startup admission', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'runtime-start-'));
    mkdirSync(path.join(root, 'scripts'));
    mkdirSync(path.join(root, '.runtime/node/bin'), { recursive: true });
    copyFileSync(path.resolve(__dirname, '../../scripts/start-production.sh'), path.join(root, 'scripts/start-production.sh'));
    writeFileSync(path.join(root, '.runtime/node/bin/node'), `#!/usr/bin/env bash
set -eu
if [ "$1" = --version ]; then echo "\${TEST_VERSION:-v24.22.0}"; exit 0; fi
printf '%s\\n' "$PWD" "$@" > "$TEST_ROOT/application-invocation"
exit 42
`, { mode: 0o755 });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const start = (version: string) => spawnSync('bash', [path.join(root, 'scripts/start-production.sh')], {
    cwd: tmpdir(), env: { ...process.env, TEST_ROOT: root, TEST_VERSION: version }, encoding: 'utf8',
  });
  it('refuses the earlier Node runtime before launching the application', () => {
    expect(start('v24.10.0').status).toBe(1);
    expect(existsSync(path.join(root, 'application-invocation'))).toBe(false);
  });
  it('starts from the application root with the verified runtime and propagates its exit', () => {
    expect(start('v24.22.0').status).toBe(42);
    expect(readFileSync(path.join(root, 'application-invocation'), 'utf8')).toBe(`${root}\ndist/app.js\n`);
  });
});
