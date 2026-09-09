import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CAVE_DIVERS_IMAGE_PLAN,
  validateCaveDiversImagePlan,
} from '../scripts/generate-cave-divers-images';
import { CAVE_DIVERS_TOURS } from '../scripts/seed-cave-divers';

describe('Cave Divers generated-image plan', () => {
  it('has four original scene prompts for each of the seven exact records', () => {
    expect(validateCaveDiversImagePlan()).toEqual([]);
    expect(CAVE_DIVERS_IMAGE_PLAN).toHaveLength(7);
    expect(new Set(CAVE_DIVERS_IMAGE_PLAN.map((item) => item.slug)).size).toBe(7);
    expect(CAVE_DIVERS_IMAGE_PLAN.every((item) => item.scenes.length === 4)).toBe(true);
    expect(CAVE_DIVERS_IMAGE_PLAN.map((item) => item.slug).sort()).toEqual(
      CAVE_DIVERS_TOURS.map((item) => item.slug).sort(),
    );
  });

  it('uses the project image service, stable uploads, and compare-and-set persistence', () => {
    const script = readFileSync(join(__dirname, '../scripts/generate-cave-divers-images.ts'), 'utf8');
    expect(script).toContain('generateImageFromPrompt');
    expect(script).toContain("IMAGE_FOLDER = 'tours/cave-divers'");
    expect(script).toContain('publicId: `${item.slug}-${String(index + 1).padStart(2, \'0\')}`');
    expect(script).toContain('images: currentImages');
    expect(script).toContain('result.modifiedCount !== 1');
    expect(script).not.toMatch(/getyourguide|images\.unsplash|source-site photograph URL/i);
  });

  it('requires explicit tenant and generated-only apply fences', () => {
    const script = readFileSync(join(__dirname, '../scripts/generate-cave-divers-images.ts'), 'utf8');
    expect(script).toContain('--confirm-tenant=cave-divers');
    expect(script).toContain('--confirm-assets=generated-only');
  });
});
