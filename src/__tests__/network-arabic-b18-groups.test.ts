/**
 * The B18A group: the three sites of the brief, each exactly once, each named by the facts the Arabic
 * pipeline checks against the live record, and the group a unit the export, the apply check, the
 * publication and the language switch all accept.
 */
import { B18A, B18_GROUPS, B18_SITES } from '../scripts/network-arabic/b18';
import { NETWORK_BATCHES } from '../scripts/export-network-arabic-sources';
import { PUBLISH_BATCHES } from '../scripts/network-arabic/publish';
import { languagesArguments } from '../scripts/set-arabic-languages';
import { checkArguments } from '../scripts/check-network-arabic-apply';
import { applyArguments } from '../scripts/apply-network-arabic';

const BRIEF = ['cairo-adventures', 'horse-riding-hurghada', 'gamila-horse-stable'];

describe('B18 groups', () => {
  it('cover the three sites of the brief, each once, in the brief order', () => {
    expect(B18_SITES.map((site) => site.slug)).toEqual(BRIEF);
    expect(new Set(B18_SITES.map((site) => site.slug)).size).toBe(3);
    expect(Object.keys(B18_GROUPS)).toEqual(['b18a']);
    expect(B18A.id).toBe('b18a');
  });

  it('name each site by its platform domain, and its own domain only where it has one', () => {
    expect(B18A.sites.map((site) => [site.slug, site.domain, site.customDomain ?? null])).toEqual([
      ['cairo-adventures', 'cairo-adventures.foxesnetwork.com', 'cairoattractionsticket.com'],
      ['horse-riding-hurghada', 'horse-riding-hurghada.foxesnetwork.com', 'horseridinghurghada.com'],
      ['gamila-horse-stable', 'gamila-horse-stable.foxesnetwork.com', null],
    ]);
    // A group states the platform domain the planner verifies, never a guess at it.
    for (const site of B18A.sites) expect(site.domain).toBe(`${site.slug}.foxesnetwork.com`);
  });

  it('are known to the export, the apply check, the publication and the language switch', () => {
    expect(NETWORK_BATCHES.b18a).toBe(B18A);
    expect(PUBLISH_BATCHES.b18a).toEqual({ batch: B18A, folder: 'b18' });
    expect(checkArguments(['--group=b18a'])).toEqual({ groups: ['b18a'] });
    expect(languagesArguments(['--group=b18a'])).toEqual({ group: 'b18a', apply: false, approve: '' });
    expect(() => applyArguments(['--group=b18a', `--approve=${'a'.repeat(64)}`])).not.toThrow();
    expect(() => checkArguments(['--group=b18a,b18a'])).toThrow();
    expect(() => checkArguments(['--group=b18b'])).toThrow();
  });

  it('read their Arabic from the b18 folder and nothing from another batch', () => {
    expect(PUBLISH_BATCHES.b18a.folder).toBe('b18');
    expect(PUBLISH_BATCHES.b17a.folder).toBe('b17');
    expect(PUBLISH_BATCHES.b14a.folder).toBe('b14');
  });

  it('leave the earlier batches, which declare no domain of their own, exactly as they were', () => {
    for (const group of ['b14a', 'b14b', 'b17a', 'b17b', 'b17c']) {
      for (const site of PUBLISH_BATCHES[group].batch.sites) expect(site.customDomain).toBeUndefined();
    }
  });
});
