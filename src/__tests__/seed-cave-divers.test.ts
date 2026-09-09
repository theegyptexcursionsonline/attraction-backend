import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CAVE_DIVERS_DRAFT_TOURS,
  CAVE_DIVERS_INSPIRATION_REFERENCES,
  CAVE_DIVERS_TENANT,
  catalogueOverwriteBlocker,
  customerFacingContent,
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

  it('withholds every price, availability and booking promise while the terms are unconfirmed', () => {
    const forbidden = [
      'priceFrom', 'pricingOptions', 'addons', 'entryWindows', 'availability',
      'cancellationPolicy', 'instantConfirmation', 'mobileTicket',
      'hasHotelPickup', 'images', 'rating', 'reviewCount',
    ];
    for (const tour of CAVE_DIVERS_DRAFT_TOURS) {
      const record = tour as unknown as Record<string, unknown>;
      for (const key of forbidden) expect(record).not.toHaveProperty(key);
      // The same fields must be absent from what actually gets written.
      const written = customerFacingContent(tour);
      for (const key of forbidden) expect(written).not.toHaveProperty(key);
      expect(tour.openDecisions.length).toBeGreaterThan(0);
    }
  });

  it('carries substantive original content on every record rather than an editorial shell', () => {
    for (const tour of CAVE_DIVERS_DRAFT_TOURS) {
      expect(tour.description.length).toBeGreaterThanOrEqual(700);
      expect(tour.shortDescription.length).toBeGreaterThanOrEqual(90);
      expect(tour.highlights.length).toBeGreaterThanOrEqual(4);
      expect(tour.itinerary.length).toBeGreaterThanOrEqual(4);
      expect(tour.inclusions.length).toBeGreaterThanOrEqual(3);
      expect(tour.exclusions.length).toBeGreaterThanOrEqual(3);
      expect(tour.whatToBring.length).toBeGreaterThanOrEqual(3);
      expect(tour.accessibility.length).toBeGreaterThanOrEqual(2);
      expect(tour.seo.metaTitle.length).toBeGreaterThan(20);
      expect(tour.seo.keywords.length).toBeGreaterThan(2);
      // Need-to-know doubles as the FAQ, so it must actually answer questions.
      expect(tour.needToKnow.length).toBeGreaterThanOrEqual(5);
      expect(tour.needToKnow.filter((item) => item.includes('?')).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('keeps every record distinct instead of repeating one description', () => {
    const descriptions = new Set(CAVE_DIVERS_DRAFT_TOURS.map((tour) => tour.description));
    const titles = new Set(CAVE_DIVERS_DRAFT_TOURS.map((tour) => tour.title));
    expect(descriptions.size).toBe(CAVE_DIVERS_DRAFT_TOURS.length);
    expect(titles.size).toBe(CAVE_DIVERS_DRAFT_TOURS.length);
  });

  it('sources every record from Cave Divers and keeps the four comparison traders structure-only', () => {
    for (const tour of CAVE_DIVERS_DRAFT_TOURS) {
      expect(tour.firstPartySources.length).toBeGreaterThan(0);
      for (const note of tour.firstPartySources) {
        expect(new URL(note.url).hostname).toBe('www.cave-divers.com');
        expect(note.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      for (const note of tour.referenceNotes) {
        expect(new URL(note.url).hostname).toBe('www.getyourguide.com');
        expect(note.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // A reference may inform shape only; it can never supply Cave copy.
        expect(note.used).toMatch(/structure only/i);
      }
    }
    expect(CAVE_DIVERS_INSPIRATION_REFERENCES).toHaveLength(4);
    expect(CAVE_DIVERS_INSPIRATION_REFERENCES.every((url) => (
      new URL(url).hostname === 'www.getyourguide.com'
    ))).toBe(true);
  });

  it('reviewed all four supplied comparison suppliers', () => {
    const reviewed = new Set(CAVE_DIVERS_DRAFT_TOURS.flatMap((tour) => tour.referenceNotes.map((note) => note.url)));
    // Each of the four intake suppliers must appear through one of its pages.
    const suppliers = ['t1196989', 't1300885', 't792868', 't330276', 't439309', 't1328891'];
    const seen = suppliers.filter((id) => [...reviewed].some((url) => url.includes(id)));
    expect(seen.length).toBeGreaterThanOrEqual(6);
  });

  it('never lets trader material or internal process wording reach a customer field', () => {
    for (const tour of CAVE_DIVERS_DRAFT_TOURS) {
      const customerCopy = JSON.stringify(customerFacingContent(tour));
      expect(customerCopy).not.toMatch(/getyourguide|white dolphin|diving star|pure coastal|dive red sea/i);
      expect(customerCopy).not.toMatch(/supplier approval|approval gate|review gate|rights-cleared|content rights/i);
    }
    // Provenance and open decisions are deliberately outside the written payload.
    const written = JSON.stringify(CAVE_DIVERS_DRAFT_TOURS.map(customerFacingContent));
    expect(written).not.toMatch(/openDecisions|referenceNotes|firstPartySources|BLOCKING/);
  });

  it('records source contradictions instead of turning them into claims', () => {
    const openWater = CAVE_DIVERS_DRAFT_TOURS.find((tour) => tour.pathSlug === 'open-water-diver-course');
    const glassBoat = CAVE_DIVERS_DRAFT_TOURS.find((tour) => tour.pathSlug === 'glass-boat-half-day');

    // The course length is contradicted by its own source, so no length ships.
    expect(openWater?.duration).toBeUndefined();
    expect(openWater?.openDecisions.some((item) => item.startsWith('BLOCKING:'))).toBe(true);
    expect(openWater?.needToKnow.join(' ')).toMatch(/two different lengths/i);
    // A competitor's course length must never be borrowed as the answer.
    expect(JSON.stringify(customerFacingContent(openWater!))).not.toMatch(/three[- ]day course|3[- ]day course/i);

    // The afternoon glass-boat departure is misprinted at source, so it is
    // withheld while the unambiguous morning window is published.
    expect(glassBoat?.openDecisions.some((item) => item.startsWith('BLOCKING:'))).toBe(true);
    expect(glassBoat?.needToKnow.join(' ')).toMatch(/inconsistent/i);
    expect(glassBoat?.needToKnow.join(' ')).toMatch(/09:30 to 13:00/);
    expect(JSON.stringify(customerFacingContent(glassBoat!))).not.toContain('01:30');
  });

  it('never presents wildlife as guaranteed', () => {
    const dolphinTrip = CAVE_DIVERS_DRAFT_TOURS.find((tour) => tour.pathSlug === 'dolphin-house-sea-trip');
    expect(dolphinTrip?.description).toMatch(/nobody can promise/i);
    expect(dolphinTrip?.highlights.join(' ')).toMatch(/never guaranteed/i);
    expect(dolphinTrip?.needToKnow[0]).toMatch(/^Will I definitely see dolphins\? No\./);
    expect(dolphinTrip?.seo.metaDescription).toMatch(/never guaranteed/i);
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
