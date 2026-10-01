/**
 * Listing types on the shared attraction endpoints (create, update).
 *
 * - The tour editor still sends its older `productType` ('tour' | 'attraction-ticket'); it is read
 *   as the listing type so an attraction ticket stays a ticket after saving (PLATFORM #1069).
 * - A package is created here as a draft (title, text, images, sites, URL like any listing), but
 *   its prices, dates, duration and publication belong to the package editor
 *   (packages.controller), which checks the rate matrix and the departures first. These endpoints
 *   therefore refuse anything that would bypass those checks or turn one kind of listing into
 *   another.
 */

const PACKAGE_MANAGED_FIELDS = ['pricingOptions', 'entryWindows', 'addons', 'priceFrom', 'duration'] as const;

const present = (value: unknown): boolean => (Array.isArray(value) ? value.length > 0 : value !== undefined);

const MANAGED_MESSAGE = 'Package prices, dates and duration are set in the package editor.';

/** Reads the older `productType` field as the listing type, in place. */
export const normalizeListingTypeInput = (body: Record<string, unknown>): void => {
  if (body.listingType === undefined && body.productType !== undefined) {
    body.listingType = body.productType === 'attraction-ticket' ? 'attraction' : 'tour';
  }
  delete body.productType;
};

/** Why a create through the shared endpoint must be refused, or null. */
export const listingCreateProblem = (body: Record<string, unknown>): string | null => {
  normalizeListingTypeInput(body);
  if (body.listingType !== 'package') return null;
  if (body.status !== 'draft') return 'Create a package as a draft, then publish it from the package editor.';
  if (PACKAGE_MANAGED_FIELDS.some((field) => present(body[field])) || body.enquiryOnly === true) return MANAGED_MESSAGE;
  return null;
};

/**
 * Why an update through the shared endpoint must be refused, or null, given the stored listing's
 * type. Call it after the caller's access to the listing is established, so a refusal never
 * describes someone else's listing.
 */
export const listingUpdateProblem = (storedListingType: unknown, body: Record<string, unknown>): string | null => {
  normalizeListingTypeInput(body);
  if ((storedListingType ?? 'tour') !== 'package') {
    return body.listingType === 'package' ? 'A tour or ticket cannot become a package. Create a new package instead.' : null;
  }
  if (body.listingType !== undefined && body.listingType !== 'package') return 'A package cannot be changed into another kind of listing.';
  if (body.status === 'active') return 'Publish a package from the package editor, so its prices and dates are checked first.';
  if (PACKAGE_MANAGED_FIELDS.some((field) => present(body[field])) || body.enquiryOnly === true) return MANAGED_MESSAGE;
  return null;
};
