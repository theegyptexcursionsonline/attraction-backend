/**
 * The three B17 groups: the eighteen sites of the brief, each exactly once, each taken from the seed batch
 * that describes it, and each group a unit the export, the apply check and the language switch all accept.
 */
import { B17A, B17B, B17C, B17_GROUPS, B17_SITES } from '../scripts/network-arabic/b17';
import { B15A, B15B } from '../scripts/network-sites/b15';
import { B15C } from '../scripts/network-sites/b15c';
import { B16 } from '../scripts/network-sites/b16';
import { NETWORK_BATCHES } from '../scripts/export-network-arabic-sources';
import { PUBLISH_BATCHES } from '../scripts/network-arabic/publish';
import { languagesArguments } from '../scripts/set-arabic-languages';
import { checkArguments } from '../scripts/check-network-arabic-apply';
import { applyArguments } from '../scripts/apply-network-arabic';

const BRIEF = [
  'blue-lagoon-dahab', 'seven-pools', 'wadi-zaghara', 'ein-kid', 'daedalus-reef', 'zabargad-island',
  'hebat-allah-wreck', 'el-ikhwa-islands', 'gebel-el-rosas-bay', 'marsa-abu-galawa', 'skar-transport-cairo',
  'future-travel-egypt', 'erg-abu-ramada', 'shabruhr-umm-gamar', 'hamda', 'ras-hankorab', 'qulaan', 'wadi-lahmy',
];

describe('B17 groups', () => {
  it('cover the eighteen sites of the brief, each once, six to a group', () => {
    expect(B17_SITES).toHaveLength(18);
    expect(B17_SITES.map((site) => site.slug).sort()).toEqual([...BRIEF].sort());
    expect(new Set(B17_SITES.map((site) => site.slug)).size).toBe(18);
    for (const group of [B17A, B17B, B17C]) expect(group.sites).toHaveLength(6);
    expect(Object.keys(B17_GROUPS)).toEqual(['b17a', 'b17b', 'b17c']);
    expect([B17A.id, B17B.id, B17C.id]).toEqual(['b17a', 'b17b', 'b17c']);
  });

  it('take every site from the seed batch that describes it, by reference, in that batch order', () => {
    const seeded = new Map([...B15A.sites, ...B15B.sites, ...B15C.sites, ...B16.sites].map((site) => [site.slug, site]));
    for (const site of B17_SITES) expect(site).toBe(seeded.get(site.slug));
    expect(B17A.sites.map((site) => site.slug)).toEqual(['erg-abu-ramada', 'shabruhr-umm-gamar', 'hamda', 'ras-hankorab', 'qulaan', 'wadi-lahmy']);
    expect(B17B.sites.map((site) => site.slug)).toEqual(['daedalus-reef', 'el-ikhwa-islands', 'zabargad-island', 'hebat-allah-wreck', 'blue-lagoon-dahab', 'ein-kid']);
    expect(B17C.sites.map((site) => site.slug)).toEqual(['seven-pools', 'wadi-zaghara', 'gebel-el-rosas-bay', 'marsa-abu-galawa', 'skar-transport-cairo', 'future-travel-egypt']);
  });

  it('are known to the export, the apply check, the publication and the language switch', () => {
    for (const group of ['b17a', 'b17b', 'b17c']) {
      expect(NETWORK_BATCHES[group]).toBe(B17_GROUPS[group]);
      expect(PUBLISH_BATCHES[group]).toEqual({ batch: B17_GROUPS[group], folder: 'b17' });
      expect(checkArguments([`--group=${group}`])).toEqual({ groups: [group] });
      expect(languagesArguments([`--group=${group}`])).toEqual({ group, apply: false, approve: '' });
      expect(() => applyArguments([`--group=${group}`, `--approve=${'a'.repeat(64)}`])).not.toThrow();
    }
    expect(checkArguments(['--group=b17a,b17b,b17c'])).toEqual({ groups: ['b17a', 'b17b', 'b17c'] });
    expect(() => checkArguments(['--group=b17a,b17a'])).toThrow();
    expect(() => checkArguments(['--group=b17d'])).toThrow();
  });

  it('read their Arabic from the b17 folder and nothing from another batch', () => {
    expect([...new Set(Object.values(B17_GROUPS).map((group) => PUBLISH_BATCHES[group.id].folder))]).toEqual(['b17']);
    expect(PUBLISH_BATCHES.b14a.folder).toBe('b14');
  });
});
