/**
 * Admin section access.
 *
 * The network sells four kinds of product, each with its own admin section: tours, attraction
 * tickets, packages and bundles. A brand may be limited to some of them (`Tenant.enabledSections`)
 * and a team member may be limited further (`User.sectionAccess`). A member may use a section only
 * when their own list allows it AND at least one brand they work for has it switched on. Super
 * admins have every section on every brand, whatever is stored.
 *
 * An unset list means "every section" so brands and members created before section access keep
 * exactly what they had.
 */

export const ADMIN_SECTIONS = ['tours', 'attractions', 'packages', 'bundles'] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export const SECTION_LABELS: Record<AdminSection, string> = {
  tours: 'Tours',
  attractions: 'Attractions',
  packages: 'Packages',
  bundles: 'Bundles',
};

export const isAdminSection = (value: unknown): value is AdminSection =>
  typeof value === 'string' && (ADMIN_SECTIONS as readonly string[]).includes(value);

/** The section a catalogue listing belongs to. Listings saved before types existed are tours. */
export const sectionForListingType = (listingType: unknown): AdminSection => {
  if (listingType === 'attraction') return 'attractions';
  if (listingType === 'package') return 'packages';
  return 'tours';
};

/** The listing types a set of sections may see in the catalogue. */
export const listingTypesForSections = (sections: readonly AdminSection[]): Array<'tour' | 'attraction' | 'package'> => {
  const types: Array<'tour' | 'attraction' | 'package'> = [];
  if (sections.includes('tours')) types.push('tour');
  if (sections.includes('attractions')) types.push('attraction');
  if (sections.includes('packages')) types.push('package');
  return types;
};

/** A stored list, or every section when unset. Unknown values are dropped. */
export const sectionsOrAll = (stored: unknown): AdminSection[] =>
  Array.isArray(stored) ? ADMIN_SECTIONS.filter((section) => stored.includes(section)) : [...ADMIN_SECTIONS];

/** De-duplicated, ordered sections from request input. */
export const normalizeSectionList = (value: readonly unknown[]): AdminSection[] =>
  ADMIN_SECTIONS.filter((section) => value.includes(section));

interface SectionUser {
  role?: string;
  sectionAccess?: unknown;
}

interface SectionBrand {
  enabledSections?: unknown;
}

/**
 * The sections a user may use across the given brands (normally their assigned brands, or the
 * single brand they are working in).
 */
export const effectiveSections = (user: SectionUser | null | undefined, brands: readonly SectionBrand[]): AdminSection[] => {
  if (!user) return [];
  if (user.role === 'super-admin') return [...ADMIN_SECTIONS];
  const own = sectionsOrAll(user.sectionAccess);
  // A member with no brand yet is limited only by their own list; every tenant-scoped endpoint
  // already refuses them until a brand is assigned.
  if (brands.length === 0) return own;
  const brandUnion = new Set(brands.flatMap((brand) => sectionsOrAll(brand.enabledSections)));
  return own.filter((section) => brandUnion.has(section));
};
