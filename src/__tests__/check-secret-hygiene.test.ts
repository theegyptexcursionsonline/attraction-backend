import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

// Each case starts git and node; leave room for a busy machine.
jest.setTimeout(60_000);

const repositoryRoot = path.resolve(__dirname, '..', '..');
const checkScript = path.join(repositoryRoot, 'src', 'scripts', 'check-secret-hygiene.mjs');

// Assembled at runtime, so this file never contains what the check rejects.
const companyMarker = Buffer.from('cmRtaQ==', 'base64').toString('utf8');
const personalMarker = Buffer.from('cmFuaml0', 'base64').toString('utf8');
const capitalise = (value: string) => value[0].toUpperCase() + value.slice(1);
const homePath = (...segments: string[]) => ['', 'Users', ...segments].join('/');

// A calling git hook exports GIT_DIR and GIT_INDEX_FILE, which would aim the scratch
// repositories at this one, so the child processes never inherit them.
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
const run = (command: string, args: string[], cwd: string) => spawnSync(command, args, { cwd, env: childEnv, encoding: 'utf8' });

type Files = Record<string, string | Buffer>;
const scratchDirectories: string[] = [];

const writeFiles = (root: string, files: Files) => {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
};

const createRepository = (tracked: Files, untracked: Files = {}, links: Record<string, string> = {}) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hygiene-check-'));
  scratchDirectories.push(root);
  expect(run('git', ['init', '-q'], root).status).toBe(0);
  writeFiles(root, tracked);
  for (const [link, target] of Object.entries(links)) {
    mkdirSync(path.dirname(path.join(root, link)), { recursive: true });
    symlinkSync(target, path.join(root, link));
  }
  // -f: a developer's global excludes must not decide what the case tracks.
  expect(run('git', ['add', '-f', '--', ...Object.keys(tracked), ...Object.keys(links)], root).status).toBe(0);
  writeFiles(root, untracked);
  return root;
};

const check = (cwd: string) => {
  const result = run(process.execPath, [checkScript], cwd);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

afterAll(() => {
  for (const directory of scratchDirectories) rmSync(directory, { recursive: true, force: true });
});

describe('secret and identity hygiene check', () => {
  it('passes on every file this repository tracks', () => {
    const tracked = run('git', ['ls-files', '-z'], repositoryRoot).stdout.split('\0').filter(Boolean);

    const result = check(repositoryRoot);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(tracked.length).toBeGreaterThan(0);
    expect(result.stdout).toContain(`Identity hygiene check passed (${tracked.length} tracked files scanned).`);
  });

  it('fails on a company or personal identifier in any letter case, naming the place but not the identifier', () => {
    const root = createRepository({
      'src/fixture.ts': `export const guest = {\n  firstName: '${companyMarker.toUpperCase()}',\n};\n`,
      'docs/owners.md': `# Owners\n\n- Release owner: ${capitalise(companyMarker)} Release Management\n`,
      'src/contact.ts': `export const contact = 'info@${companyMarker}webservices.com';\n`,
      'src/notes.ts': `// Retire the duplicate, per ${capitalise(personalMarker)}'s call.\n`,
      'src/clean.ts': 'export const ok = true;\n',
    });

    const result = check(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Identity hygiene check failed.');
    expect(result.stderr).toContain('- src/fixture.ts:2 (identity marker)');
    expect(result.stderr).toContain('- docs/owners.md:3 (identity marker)');
    expect(result.stderr).toContain('- src/contact.ts:1 (identity marker)');
    expect(result.stderr).toContain('- src/notes.ts:1 (identity marker)');
    expect(result.stderr).not.toContain('src/clean.ts');
    // CI logs of a public repository are public, so the report must not repeat the identifier.
    expect(`${result.stdout}${result.stderr}`.toLowerCase()).not.toContain(companyMarker);
    expect(`${result.stdout}${result.stderr}`.toLowerCase()).not.toContain(personalMarker);
  });

  it('fails on an absolute home-directory path but not on relative paths or lower-case user routes', () => {
    const root = createRepository({
      'src/proof.ts': `export const proof = '${homePath('someone', 'dev', 'app', 'proof.png')}';\n`,
      'docs/setup.md': `Compare with file://${homePath('someone', 'notes.txt')} first.\n`,
      'src/routes.ts': [
        "router.get('/api/users/:id', handler);",
        `import { list } from '${['.', 'Users', 'list'].join('/')}';`,
        `const view = '${['src', 'Users', 'view.ts'].join('/')}';`,
        '',
      ].join('\n'),
    });

    const result = check(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('- src/proof.ts:1 (home-directory path)');
    expect(result.stderr).toContain('- docs/setup.md:1 (home-directory path)');
    expect(result.stderr).not.toContain('src/routes.ts');
  });

  it('ignores lockfile integrity values but still checks the rest of the lockfile', () => {
    // Integrity values are random base64; this one happens to spell the identifier twice.
    const lockfile = (resolved: string) => [
      '{',
      '  "packages": {',
      '    "node_modules/left-pad": {',
      `      "integrity": "sha512-Qx${companyMarker.toUpperCase()}9+/Zq${companyMarker}Lw==",`,
      `      "resolved": "${resolved}"`,
      '    }',
      '  }',
      '}',
      '',
    ].join('\n');

    const clean = check(createRepository({ 'package-lock.json': lockfile('https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz') }));
    expect(clean.stderr).toBe('');
    expect(clean.status).toBe(0);

    const leaked = check(createRepository({ 'package-lock.json': lockfile(`git+https://github.com/${companyMarker}-stack/left-pad.git`) }));
    expect(leaked.status).toBe(1);
    expect(leaked.stderr).toContain('- package-lock.json:5 (identity marker)');
    expect(leaked.stderr).not.toContain('package-lock.json:4');
  });

  it('checks tracked files only', () => {
    const root = createRepository(
      { 'src/clean.ts': 'export const ok = true;\n' },
      { 'notes/local-only.md': `Owner: ${companyMarker}\n` },
    );

    const result = check(root);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Identity hygiene check passed (1 tracked files scanned).');
  });

  it('checks file names, link targets and binary content as well as text lines', () => {
    const pngWithTextChunk = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x1a]),
      Buffer.from(`tEXtAuthor\0${companyMarker.toUpperCase()} Studio`, 'latin1'),
    ]);
    const root = createRepository(
      {
        [`notes/${companyMarker}-handover.txt`]: 'Nothing else in here.\n',
        'assets/badge.png': pngWithTextChunk,
        'assets/plain.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]),
      },
      {},
      { 'docs/latest-notes': homePath('someone', 'notes') },
    );

    const result = check(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`- notes/${companyMarker}-handover.txt [file name] (identity marker)`);
    expect(result.stderr).not.toContain(`notes/${companyMarker}-handover.txt:`);
    expect(result.stderr).toContain('- assets/badge.png [binary content] (identity marker)');
    expect(result.stderr).not.toContain('assets/plain.png');
    expect(result.stderr).toContain('- docs/latest-notes [link target] (home-directory path)');
  });

  it('scans the whole repository when started from a subdirectory', () => {
    const root = createRepository({
      'docs/readme.txt': 'Plain notes.\n',
      'src/fixture.ts': `export const owner = '${companyMarker}';\n`,
    });

    const result = check(path.join(root, 'docs'));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('- src/fixture.ts:1 (identity marker)');
  });

  it('still rejects literal credentials in operational scripts', () => {
    const root = createRepository({
      'src/scripts/seed-admin.ts': [
        "import { createAdmin } from './admin';",
        "const ADMIN_PASSWORD = 'not-a-real-password';",
        'createAdmin(ADMIN_PASSWORD);',
        '',
      ].join('\n'),
    });

    const result = check(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Secret hygiene check failed.');
    expect(result.stderr).toContain('- src/scripts/seed-admin.ts:2');
    expect(result.stdout).toContain('Identity hygiene check passed (1 tracked files scanned).');
  });
});
