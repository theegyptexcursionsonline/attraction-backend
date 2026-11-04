/**
 * What the Arabic pipeline needs to know about a site to export its sources, plan its rows, check the plan
 * and switch Arabic on: its slug, its platform domain, and the domain of its own that it already answers on.
 *
 * Earlier batches took these from the seed batch that created the site (`NetworkBatch` / `NetworkSite` in
 * `seed-network-sites.ts`), which carries a site's whole description — its trips, its copy, its colours. The
 * older sites of B18 were not created by those seeds, so no such description exists for them and inventing
 * one would be a second, competing account of a site production already holds. A group therefore names only
 * these three facts, each one checked against the live record before anything is planned, and a `NetworkBatch`
 * satisfies the same shape, so the groups of B14 and B17 keep working unchanged.
 */
export interface ArabicSite {
  slug: string;
  /** The platform domain, `<slug>.foxesnetwork.com`. */
  domain: string;
  /**
   * The site's own domain, exactly as the live record carries it, for a site whose DNS is already connected.
   * Absent means the site must have none: a site that has grown one since the group was written is refused
   * rather than planned against a domain nobody declared.
   */
  customDomain?: string;
}

export interface ArabicGroup {
  id: string;
  sites: readonly ArabicSite[];
}
