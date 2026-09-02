import {
  MAKADI_QUAD_GALLERY_SOURCES,
  validateMakadiQuadGallerySources,
} from '../scripts/enrich-makadi-quad-gallery';

describe('Makadi quad gallery import contract', () => {
  it('contains six unique source-site images', () => {
    expect(validateMakadiQuadGallerySources()).toEqual([]);
    expect(MAKADI_QUAD_GALLERY_SOURCES).toHaveLength(6);
    expect(new Set(MAKADI_QUAD_GALLERY_SOURCES)).toHaveProperty('size', 6);
  });

  it('rejects an image from any unapproved host', () => {
    expect(validateMakadiQuadGallerySources([
      ...MAKADI_QUAD_GALLERY_SOURCES.slice(0, 5),
      'https://example.com/not-source.jpg',
    ])).toContain('Source is outside the allowlist: https://example.com/not-source.jpg');
  });

  it('rejects duplicate or incomplete source plans', () => {
    const duplicated = [...MAKADI_QUAD_GALLERY_SOURCES.slice(0, 5), MAKADI_QUAD_GALLERY_SOURCES[0]];
    expect(validateMakadiQuadGallerySources(duplicated)).toContain('The source gallery contains duplicate images.');
    expect(validateMakadiQuadGallerySources(MAKADI_QUAD_GALLERY_SOURCES.slice(0, 5))).toContain(
      'The source gallery must contain exactly six additional images.',
    );
  });
});
