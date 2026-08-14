import { Types } from 'mongoose';
import { BundleDefinition } from '../models/BundleDefinition';
import { BundleSupplyOffer } from '../models/BundleSupplyOffer';
import {
  replaceDraftBundleComponents,
  transitionBundleDefinition,
  updateDraftBundleDefinition,
} from '../services/bundleCatalog.service';
import {
  reviseBundleSupplyOffer,
  transitionBundleSupplyOffer,
} from '../services/bundleSupplyOffer.service';

jest.mock('../models/Attraction', () => ({ Attraction: { findOne: jest.fn(), find: jest.fn() } }));
jest.mock('../models/BundleDefinition', () => ({
  BundleDefinition: { findOne: jest.fn() },
}));
jest.mock('../models/BundleSupplyOffer', () => ({
  BundleSupplyOffer: { findOne: jest.fn(), find: jest.fn() },
}));
jest.mock('../services/bundleAudit.service', () => ({
  appendBundleEvent: jest.fn(),
}));
jest.mock('../services/bundleInventory.service', () => ({
  runBundleTransaction: jest.fn(async (work: (session: object) => Promise<unknown>) => work({})),
}));

const missing = () => ({
  session: jest.fn().mockResolvedValue(null),
});

describe('Bundle admin mutation owner scopes', () => {
  const ownerA = new Types.ObjectId().toString();
  const bundleId = new Types.ObjectId().toString();
  const offerId = new Types.ObjectId().toString();
  const actor = { actorType: 'user' as const, actorId: new Types.ObjectId() };

  beforeEach(() => {
    jest.clearAllMocks();
    (BundleDefinition.findOne as jest.Mock).mockImplementation(missing);
    (BundleSupplyOffer.findOne as jest.Mock).mockImplementation(missing);
  });

  it.each([
    ['update', () => updateDraftBundleDefinition(bundleId, ownerA, { title: 'Revised' }, 2, actor)],
    ['replace components', () => replaceDraftBundleComponents(bundleId, ownerA, [], 2, actor)],
    ['transition', () => transitionBundleDefinition(bundleId, 'in_review', actor, undefined, 2, ownerA)],
  ])('puts the storefront owner in the Bundle %s query', async (_label, operation) => {
    await expect(operation()).rejects.toMatchObject({
      code: 'BUNDLE_NOT_FOUND',
      statusCode: 404,
    });
    expect(BundleDefinition.findOne).toHaveBeenCalledWith({
      _id: bundleId,
      storefrontTenantId: ownerA,
    });
  });

  it('puts the supplier owner in the offer revision query', async () => {
    await expect(reviseBundleSupplyOffer(
      offerId,
      { termsVersion: 'v2' },
      2,
      actor,
      ownerA
    )).rejects.toMatchObject({ code: 'OFFER_NOT_FOUND', statusCode: 404 });
    expect(BundleSupplyOffer.findOne).toHaveBeenCalledWith({
      _id: offerId,
      supplierTenantId: ownerA,
    });
  });

  it('puts the supplier owner in the offer lifecycle query', async () => {
    await expect(transitionBundleSupplyOffer(
      offerId,
      'submitted',
      actor,
      { supplierTenantId: ownerA, expectedRevision: 2 }
    )).rejects.toMatchObject({ code: 'OFFER_NOT_FOUND', statusCode: 404 });
    expect(BundleSupplyOffer.findOne).toHaveBeenCalledWith({
      _id: offerId,
      supplierTenantId: ownerA,
    });
  });
});
