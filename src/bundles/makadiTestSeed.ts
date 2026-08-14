import { assertBundleEconomics } from './money';
import { BundleStatus, SupplyOfferStatus } from './domain';

export const MAKADI_TEST_STOREFRONT_SLUG = 'makadi-horse-club';
export const MAKADI_TEST_BUNDLE_SLUG = 'makadi-network-test-preview';
export const MAKADI_TEST_TERMS_VERSION = 'makadi-test-seed-v1';

const offerTransitionPath: Partial<Record<SupplyOfferStatus, SupplyOfferStatus[]>> = {
  draft: ['submitted', 'approved', 'active'],
  submitted: ['approved', 'active'],
  approved: ['active'],
  active: [],
};

const bundleTransitionPath: Partial<Record<BundleStatus, BundleStatus[]>> = {
  draft: ['in_review', 'approved', 'published'],
  in_review: ['approved', 'published'],
  approved: ['published'],
  published: [],
};

export const pendingOfferSeedTransitions = (status: SupplyOfferStatus): SupplyOfferStatus[] => {
  const path = offerTransitionPath[status];
  if (!path) throw new Error(`TEST seed cannot resume supply offer from ${status}`);
  return path;
};

export const pendingBundleSeedTransitions = (status: BundleStatus): BundleStatus[] => {
  const path = bundleTransitionPath[status];
  if (!path) throw new Error(`TEST seed cannot resume bundle from ${status}`);
  return path;
};

export interface MakadiTestSeedOffer {
  supplierTenantSlug: string;
  attractionSlug: string;
  supplierNetPricesMinor: { adult: number; child: number; infant: number };
  optionIds: string[];
  entryWindowLabels: string[];
  dayNumber: number;
  startTime: string;
  capacityDate: string;
}

export interface MakadiTestSeedManifest {
  storefrontTenantSlug: string;
  bundleSlug: string;
  termsVersion: string;
  offerWindow: { travelFrom: string; travelTo: string };
  offers: MakadiTestSeedOffer[];
  bundle: {
    title: string;
    shortDescription: string;
    description: string;
    area: string;
    category: string;
    currency: string;
    customerPricesMinor: { adult: number; child: number; infant: number };
    platformFeeReserveMinor: number;
    taxReserveMinor: number;
    policies: {
      cancellation: string;
      refund: string;
      substitution: string;
      promoStacking: false;
    };
  };
}

export const buildMakadiTestSeedManifest = (): MakadiTestSeedManifest => {
  const manifest: MakadiTestSeedManifest = {
    storefrontTenantSlug: MAKADI_TEST_STOREFRONT_SLUG,
    bundleSlug: MAKADI_TEST_BUNDLE_SLUG,
    termsVersion: MAKADI_TEST_TERMS_VERSION,
    offerWindow: {
      travelFrom: '2026-08-18T00:00:00.000Z',
      travelTo: '2027-08-31T23:59:59.999Z',
    },
    offers: [
      {
        supplierTenantSlug: 'makadi-horse-club',
        attractionSlug: 'makadi-beach-horse-ride',
        supplierNetPricesMinor: { adult: 2800, child: 2000, infant: 0 },
        optionIds: ['opt_1'],
        entryWindowLabels: ['Morning Session'],
        dayNumber: 1,
        startTime: '08:00',
        capacityDate: '2027-01-12T00:00:00.000Z',
      },
      {
        supplierTenantSlug: 'makadi-bay-safari-center',
        attractionSlug: 'makadi-bay-safari',
        supplierNetPricesMinor: { adult: 3600, child: 2500, infant: 0 },
        optionIds: ['opt_1'],
        entryWindowLabels: ['Morning Session'],
        dayNumber: 2,
        startTime: '08:00',
        capacityDate: '2027-01-13T00:00:00.000Z',
      },
      {
        supplierTenantSlug: 'desert-fox-safari',
        attractionSlug: 'hurghada-jeep-safari',
        supplierNetPricesMinor: { adult: 3600, child: 2500, infant: 0 },
        optionIds: ['opt_1'],
        entryWindowLabels: ['Morning Session'],
        dayNumber: 3,
        startTime: '08:00',
        capacityDate: '2027-01-14T00:00:00.000Z',
      },
    ],
    bundle: {
      title: 'Makadi Desert & Coast - TEST Preview',
      shortDescription: 'A clearly labelled preview itinerary for validating coordinated TEST checkout.',
      description:
        'TEST catalogue only. This three-day itinerary validates multi-supplier availability, one coordinated order and TEST payment handling. It is not a live commercial supplier commitment.',
      area: 'Makadi Bay & Hurghada',
      category: 'TEST preview itinerary',
      currency: 'USD',
      customerPricesMinor: { adult: 13000, child: 9000, infant: 0 },
      platformFeeReserveMinor: 500,
      taxReserveMinor: 500,
      policies: {
        cancellation: 'TEST orders may be cancelled before fulfilment.',
        refund: 'TEST payments follow the verified refund workflow.',
        substitution: 'No silent substitutions; any replacement requires explicit review.',
        promoStacking: false,
      },
    },
  };

  assertBundleEconomics({
    customerPricesMinor: manifest.bundle.customerPricesMinor,
    supplierPriceSetsMinor: manifest.offers.map((offer) => offer.supplierNetPricesMinor),
    fixedObligationsMinor:
      manifest.bundle.platformFeeReserveMinor + manifest.bundle.taxReserveMinor,
  });
  return manifest;
};
