import {
  CAVE_DIVERS_HERO_SOURCES,
  CAVE_DIVERS_IMAGE_IMPORT,
  assetPublicId,
  validateImageImportPlan,
} from '../scripts/import-cave-divers-images';
import { CAVE_DIVERS_TOURS } from '../scripts/seed-cave-divers';

describe('Cave Divers first-party image import', () => {
  it('assigns four photographs to every catalogue record', () => {
    expect(validateImageImportPlan()).toEqual([]);
    expect(CAVE_DIVERS_IMAGE_IMPORT).toHaveLength(7);
    for (const item of CAVE_DIVERS_IMAGE_IMPORT) expect(item.sources).toHaveLength(4);
    expect(CAVE_DIVERS_HERO_SOURCES.length).toBeGreaterThanOrEqual(3);
  });

  it('targets exactly the slugs the catalogue seeds — no drift', () => {
    // An image plan that names a slug the catalogue does not have leaves that
    // record silently pictureless, which is how two records nearly shipped bare.
    const planned = [...CAVE_DIVERS_IMAGE_IMPORT.map((item) => item.slug)].sort();
    const seeded = [...CAVE_DIVERS_TOURS.map((tour) => tour.slug)].sort();
    expect(planned).toEqual(seeded);
  });

  it('never imports a minor, a third-party mark or another company’s branding', () => {
    const all = [...CAVE_DIVERS_IMAGE_IMPORT.flatMap((i) => i.sources), ...CAVE_DIVERS_HERO_SOURCES].join(' ');
    // Customer portraits, the two photographs of children, PADI course badges,
    // the TripAdvisor badge, old logos, and the staff photo carrying another
    // company's brand on the clothing.
    for (const banned of ['client01', 'client02', 'client03', 'padi-course', 'trip-advisor',
      'old-logo', 'courses-title', 'gal05.', 'gal37.', 'instructor01.']) {
      expect(all).not.toContain(banned);
    }
  });

  it('keeps every source on the operator’s own site and inside its images folder', () => {
    for (const source of [...CAVE_DIVERS_IMAGE_IMPORT.flatMap((i) => i.sources), ...CAVE_DIVERS_HERO_SOURCES]) {
      expect(source.startsWith('/')).toBe(false);
      expect(source).not.toContain('..');
      expect(source).not.toMatch(/^https?:/);
      expect(source).toMatch(/\.(jpe?g|png|webp)$/i);
    }
  });

  it('uses a deterministic asset id so a re-run replaces rather than duplicates', () => {
    expect(assetPublicId('cave-divers-red-sea-daily-diving', 0)).toBe('cave-divers-red-sea-daily-diving-01');
    expect(assetPublicId('cave-divers-red-sea-daily-diving', 3)).toBe('cave-divers-red-sea-daily-diving-04');
  });
});
