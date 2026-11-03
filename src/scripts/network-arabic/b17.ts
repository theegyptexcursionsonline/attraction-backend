/**
 * The eighteen network sites whose Arabic records batch B17 prepares, in three groups of six.
 *
 * Unlike B14, whose groups were the seed batches themselves, these sites were seeded in four batches
 * (B15A, B15B, B15C and B16) and none of those batches holds six. A group here is only the unit one
 * ops-runner run takes, so the sites are regrouped into three sixes, each group keeping its sites in the
 * order its seed batch lists them:
 *
 * - `b17a` — the six B15 places: three reefs off Hurghada (B15A) and three places on the coast south of
 *   Marsa Alam (B15B).
 * - `b17b` — the four open-sea places and the wreck of B15C, and the two Sinai places of B16.
 * - `b17c` — the remaining six B16 sites: two places inside Ras Mohammed and on the Marsa Alam coast, the
 *   lower Wadi Zaghara, the Abu Galawa inlet, and the two business sites.
 *
 * Every site's own facts (its name, domain, city, trips and slug prefix) stay in its seed batch: this file
 * only selects and groups them, so a site cannot describe itself twice.
 */
import type { NetworkBatch, NetworkSite } from '../seed-network-sites';
import { B15A, B15B } from '../network-sites/b15';
import { B15C } from '../network-sites/b15c';
import { B16 } from '../network-sites/b16';

/** The named sites of a seed batch, in that batch's own order; an unknown slug is a mistake, not a skip. */
function pick(batch: NetworkBatch, slugs: readonly string[]): NetworkSite[] {
  const chosen = batch.sites.filter((site) => slugs.includes(site.slug));
  if (chosen.length !== slugs.length) throw new Error(`${batch.id}: ${slugs.filter((slug) => !batch.sites.some((site) => site.slug === slug)).join(', ')} is not a site of this batch`);
  return chosen;
}

export const B17A: NetworkBatch = {
  id: 'b17a',
  sites: [
    ...pick(B15A, ['erg-abu-ramada', 'shabruhr-umm-gamar', 'hamda']),
    ...pick(B15B, ['ras-hankorab', 'qulaan', 'wadi-lahmy']),
  ],
};

export const B17B: NetworkBatch = {
  id: 'b17b',
  sites: [
    ...pick(B15C, ['daedalus-reef', 'el-ikhwa-islands', 'zabargad-island', 'hebat-allah-wreck']),
    ...pick(B16, ['blue-lagoon-dahab', 'ein-kid']),
  ],
};

export const B17C: NetworkBatch = {
  id: 'b17c',
  sites: [
    ...pick(B16, ['seven-pools', 'wadi-zaghara', 'gebel-el-rosas-bay', 'marsa-abu-galawa', 'skar-transport-cairo', 'future-travel-egypt']),
  ],
};

/** The three groups by name, and every site of the batch in group order. */
export const B17_GROUPS: Record<string, NetworkBatch> = { b17a: B17A, b17b: B17B, b17c: B17C };
export const B17_SITES: NetworkSite[] = [B17A, B17B, B17C].flatMap((group) => group.sites);
