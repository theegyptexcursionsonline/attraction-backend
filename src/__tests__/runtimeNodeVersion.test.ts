import { readFileSync } from 'fs';
import { join } from 'path';

// Production runs the Node.js release the Dockerfile names. Nixpacks took Node
// from a nixpkgs snapshot (24.10.0) with no patched release, so the service now
// builds from the official image. 24.22.1 carries the 21 Oct 2026 Node.js
// security release; the floor below keeps a rollback from reintroducing an
// unpatched or end-of-life runtime.
const PATCHED_FLOOR: Record<number, [number, number, number]> = {
  22: [22, 23, 4],
  24: [24, 22, 1],
};

const root = join(__dirname, '..', '..');

function nodeImageVersions(dockerfile: string): string[] {
  const args = new Map<string, string>();
  for (const [, name, value] of dockerfile.matchAll(/^\s*ARG\s+(\w+)=(\S+)/gm)) args.set(name, value);
  return [...dockerfile.matchAll(/^\s*FROM\s+(\S+)/gim)]
    .map(([, image]) => image.replace(/\$\{(\w+)\}/g, (_, name: string) => args.get(name) ?? ''))
    .filter(image => image.startsWith('node:'))
    .map(image => image.slice('node:'.length).split('-')[0]);
}

function atLeast(version: number[], floor: number[]): boolean {
  for (let i = 0; i < floor.length; i += 1) {
    if (version[i] !== floor[i]) return version[i] > floor[i];
  }
  return true;
}

describe('production Node.js runtime', () => {
  const versions = nodeImageVersions(readFileSync(join(root, 'Dockerfile'), 'utf8'));
  const railway = JSON.parse(readFileSync(join(root, 'railway.json'), 'utf8'));

  it('builds with the Dockerfile, keeping the readiness check', () => {
    expect(railway.build.builder).toBe('DOCKERFILE');
    expect(railway.deploy.healthcheckPath).toBe('/api/ready');
  });

  it('builds from one exact Node.js release', () => {
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(new Set(versions).size).toBe(1);
    expect(versions[0]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('uses a supported release line at or above its security floor', () => {
    const version = versions[0].split('.').map(Number);
    const floor = PATCHED_FLOOR[version[0]];
    expect(floor).toBeDefined();
    expect(atLeast(version, floor)).toBe(true);
  });
});
