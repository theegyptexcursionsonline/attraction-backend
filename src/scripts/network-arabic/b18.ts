/**
 * Batch B18: Arabic records for the older network sites that are still served in English only, taken three
 * at a time (owner, 4 November 2026). Group `b18a` is the first three.
 *
 * These sites were not created by the network seed batches, so unlike B14's and B17's groups there is no
 * `NetworkSite` description to take them from: each is named here by the three facts the Arabic pipeline
 * checks against the live record (`network-arabic/group.ts`) and nothing else. Their trips, destinations,
 * copy and page list are read from production at export time, never restated here, so this file cannot
 * disagree with the site.
 *
 * Read in production on 4 November 2026, all three `status: active`, platform domain
 * `<slug>.foxesnetwork.com`, and **no custom pages on any of them**:
 *
 * | Site | Own domain | Languages | Live trips | Destinations |
 * |---|---|---|---|---|
 * | `cairo-adventures` | `cairoattractionsticket.com` | `en, ar, de, fr, es, ru` | 15 | `cairo`, `luxor` |
 * | `horse-riding-hurghada` | `horseridinghurghada.com` | `en` | 3 | `hurghada` |
 * | `gamila-horse-stable` | none | `en, ar, de` | 9 | `hurghada`, `makadi-bay` |
 *
 * Two of the three already list `ar` among their supported languages, and `cairo-adventures` lists four
 * more, but **not one translation row exists for any of them, in any locale**: the languages were set on
 * the tenant record without the records behind them ever being written. So nothing here completes or
 * replaces an existing translation; all thirty-five rows are new. The two sites that already advertise
 * Arabic need no language switch; `horse-riding-hurghada` does, and that step is prepared, not run
 * (`docs/B18_ARABIC.md`).
 */
import type { ArabicGroup } from './group';

export const B18A: ArabicGroup = {
  id: 'b18a',
  sites: [
    { slug: 'cairo-adventures', domain: 'cairo-adventures.foxesnetwork.com', customDomain: 'cairoattractionsticket.com' },
    { slug: 'horse-riding-hurghada', domain: 'horse-riding-hurghada.foxesnetwork.com', customDomain: 'horseridinghurghada.com' },
    { slug: 'gamila-horse-stable', domain: 'gamila-horse-stable.foxesnetwork.com' },
  ],
};

/** The groups of this batch by name, and every site of the batch in group order. */
export const B18_GROUPS: Record<string, ArabicGroup> = { b18a: B18A };
export const B18_SITES = [B18A].flatMap((group) => group.sites);
