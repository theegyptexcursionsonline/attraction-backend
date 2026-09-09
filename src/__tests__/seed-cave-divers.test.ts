import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CAVE_DIVERS_DRAFT_TOURS,
  CAVE_DIVERS_INSPIRATION_REFERENCES,
  CAVE_DIVERS_TENANT,
  catalogueOverwriteBlocker,
  validateCaveDiversPlan,
} from '../scripts/seed-cave-divers';

describe('Cave Divers launch package', () => {
  it('keeps the shared preview active while the custom domain and catalogue stay gated', () => {
    expect(validateCaveDiversPlan()).toEqual([]);
    expect(CAVE_DIVERS_TENANT.status).toBe('active');
    expect(CAVE_DIVERS_TENANT.designMode).toBe('depth');
    expect(CAVE_DIVERS_TENANT.domainMigrated).toBe(false);
    expect(CAVE_DIVERS_TENANT.customDomainStatus).toBe('unconfigured');
    expect(CAVE_DIVERS_TENANT.paymentSettings.enabledGateways).toEqual([]);
    expect(CAVE_DIVERS_TENANT.aiSettings.bookingWidget.enabled).toBe(false);
    expect(CAVE_DIVERS_TENANT.bundleSettings.mode).toBe('off');
  });

  it('creates exactly seven uniquely routed draft records', () => {
    expect(CAVE_DIVERS_DRAFT_TOURS).toHaveLength(7);
    expect(new Set(CAVE_DIVERS_DRAFT_TOURS.map((tour) => tour.slug)).size).toBe(7);
    expect(new Set(CAVE_DIVERS_DRAFT_TOURS.map((tour) => tour.pathSlug)).size).toBe(7);
    expect(CAVE_DIVERS_DRAFT_TOURS.every((tour) => tour.status === 'draft')).toBe(true);
  });

  it('withholds every operational and commercial field until supplier review', () => {
    const forbidden = [
      'priceFrom', 'pricingOptions', 'addons', 'entryWindows', 'availability',
      'cancellationPolicy', 'instantConfirmation', 'mobileTicket',
      'hasHotelPickup', 'images', 'rating', 'reviewCount',
    ];
    for (const tour of CAVE_DIVERS_DRAFT_TOURS) {
      const record = tour as unknown as Record<string, unknown>;
      expect(tour.reviewGate).toEqual(expect.arrayContaining([
        'Price, currency and tax confirmation',
        'Rights-cleared gallery and brand asset approval',
      ]));
      for (const key of forbidden) expect(record).not.toHaveProperty(key);
    }
  });

  it('uses first-party pages as catalogue evidence and keeps comparison traders inspiration-only', () => {
    expect(CAVE_DIVERS_DRAFT_TOURS.every((tour) => (
      new URL(tour.sourceUrl).hostname === 'www.cave-divers.com'
    ))).toBe(true);
    expect(CAVE_DIVERS_INSPIRATION_REFERENCES).toHaveLength(4);
    expect(CAVE_DIVERS_INSPIRATION_REFERENCES.every((url) => (
      new URL(url).hostname === 'www.getyourguide.com'
    ))).toBe(true);
    const persistedPlan = JSON.stringify({ tenant: CAVE_DIVERS_TENANT, tours: CAVE_DIVERS_DRAFT_TOURS });
    expect(persistedPlan).not.toMatch(/getyourguide\.com|white dolphin|diving star|pure coastal|dive red sea/i);
  });

  it('records source contradictions instead of turning them into claims', () => {
    const openWater = CAVE_DIVERS_DRAFT_TOURS.find((tour) => (
      tour.pathSlug === 'open-water-diver-course'
    ));
    const glassBoat = CAVE_DIVERS_DRAFT_TOURS.find((tour) => (
      tour.pathSlug === 'glass-boat-half-day'
    ));
    expect(openWater?.description).toMatch(/conflicting three-day and four-day/i);
    expect(openWater).not.toHaveProperty('duration');
    expect(glassBoat?.description).toMatch(/time appears inconsistent/i);
    expect(glassBoat).not.toHaveProperty('entryWindows');
  });

  it('never presents wildlife as guaranteed', () => {
    const dolphinTrip = CAVE_DIVERS_DRAFT_TOURS.find((tour) => (
      tour.pathSlug === 'dolphin-house-sea-trip'
    ));
    expect(dolphinTrip?.description).toMatch(/no promise/i);
    expect(dolphinTrip?.reviewGate.join(' ')).toMatch(/no-sighting guarantee/i);
  });

  describe('catalogue overwrite guard', () => {
    const record = (overrides: Partial<Parameters<typeof catalogueOverwriteBlocker>[0][number]> = {}) => ({
      slug: 'cave-divers-red-sea-daily-diving',
      status: 'draft',
      ownedByCaveTenant: true,
      hasOwner: true,
      ...overrides,
    });

    it('allows a re-run over this tenant\u2019s own drafts', () => {
      expect(catalogueOverwriteBlocker([])).toBeNull();
      expect(catalogueOverwriteBlocker([record()])).toBeNull();
      expect(catalogueOverwriteBlocker([record({ hasOwner: false, ownedByCaveTenant: false })])).toBeNull();
    });

    it('refuses to touch a published or archived record', () => {
      expect(catalogueOverwriteBlocker([record({ status: 'active' })]))
        .toMatch(/Refusing to overwrite non-draft record/);
      expect(catalogueOverwriteBlocker([record({ status: 'archived' })]))
        .toMatch(/Refusing to overwrite non-draft record/);
    });

    it('refuses another tenant\u2019s draft even on the very first run', () => {
      // First run: the Cave tenant does not exist yet, so nothing can be
      // owned by Cave. A slug collision must fail closed, not be adopted.
      expect(catalogueOverwriteBlocker([record({ ownedByCaveTenant: false })]))
        .toMatch(/Refusing cross-tenant catalogue overwrite/);
    });
  });

  it('refuses to write anything while URL-namespace writes are paused', () => {
    // The catalogue records claim public URLs, which the namespace guard blocks
    // while writes are paused. A rehearsal against a local database proved that
    // discovering this mid-run left an active tenant with an empty catalogue,
    // so the readiness check must come before the first connection.
    const script = readFileSync(join(__dirname, '../scripts/seed-cave-divers.ts'), 'utf8');
    const readinessAt = script.indexOf('urlNamespaceReadiness().writesReady');
    const connectAt = script.indexOf('await connectDatabase()');
    expect(readinessAt).toBeGreaterThan(-1);
    expect(connectAt).toBeGreaterThan(-1);
    expect(readinessAt).toBeLessThan(connectAt);
    expect(script).toContain('Nothing was written.');
  });
});
