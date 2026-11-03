/**
 * The B17 Arabic payloads, checked the way the B12, B13 and B14 checkers checked theirs: every source has
 * its Arabic, every part and placeholder and paragraph is kept, digits stay Latin and the numbers stay the
 * same, one term keeps one reading across the batch and the network glossary, and nothing claims more than
 * the English does. The repository's own content schemas and completeness validators run on every record too.
 */
import fs from 'fs';
import path from 'path';
import { loadGroupPayloads, type SitePayload } from '../scripts/network-arabic/publish';
import { flattenStrings } from '../scripts/network-arabic/text';
import { attractionTranslationContent, cleanTranslation, validateTranslationSource } from '../services/attractionLocalization.service';
import { destinationTranslationContent, cleanDestinationTranslation, validateDestinationTranslation } from '../services/destinationLocalization.service';
import { tenantPresentationContent } from '../services/tenantPresentationLocalization.service';
import { B17A, B17B, B17C } from '../scripts/network-arabic/b17';

type Glossary = { terms: Array<{ en: string; ar: string; forms?: string[]; avoid?: string[] }> };
const glossary: Glossary = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'network-arabic', 'b17', 'glossary.json'), 'utf8'));
const payloads: SitePayload[] = [...loadGroupPayloads('b17a'), ...loadGroupPayloads('b17b'), ...loadGroupPayloads('b17c')];
const sites = [...B17A.sites, ...B17B.sites, ...B17C.sites];

type Pair = { site: string; where: string; path: string; en: string; ar: string };
const records = (payload: SitePayload) => [
  ...payload.presentation.map((entry) => ({ where: `presentation:${entry.kind}`, english: entry.english, arabic: entry.arabic })),
  ...payload.tours.map((entry) => ({ where: `tour:${entry.sourceSlug}`, english: entry.english, arabic: entry.arabic })),
  ...payload.destinations.map((entry) => ({ where: `destination:${entry.sourceSlug}`, english: entry.english, arabic: entry.arabic })),
];
const pairs: Pair[] = payloads.flatMap((payload) => records(payload).flatMap((record) => {
  const arabic = flattenStrings(record.arabic);
  return [...flattenStrings(record.english)].map(([key, en]) => ({ site: payload.tenant.slug, where: record.where, path: key, en, ar: arabic.get(key) ?? '\u0000missing' }));
}));
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const numbers = (text: string) => (text.match(/\d+/g) || []).map(Number).sort((a, b) => a - b);

/** Arabic words that make a claim, allowed only where the English itself makes it. */
const CLAIMS: Array<{ ar: RegExp; en: RegExp; claim: string }> = [
  { ar: /رسمي/, en: /official/i, claim: 'official' },
  { ar: /أفضل|الأروع|أجمل/, en: /\bbest\b|\bbetter\b|finest/i, claim: 'best' },
  { ar: /تقييم|نجمة|نجوم|★/, en: /\bstars?\b|stargaz|astronom|rating|rated/i, claim: 'rating' },
  { ar: /مضمون|نضمن|ضمان|يضمن|تضمن/, en: /guarantee|promise/i, claim: 'guarantee' },
  { ar: /لا يُنسى|لا تُنسى|لا ينسى|لا تنسى/, en: /unforgettable/i, claim: 'unforgettable' },
  { ar: /فاخر|فخم|فخامة/, en: /luxur|gourmet|deluxe/i, claim: 'luxury' },
  { ar: /حصري/, en: /exclusive/i, claim: 'exclusive' },
  { ar: /الأشهر|الأكثر شهرة|الأول من نوعه|رقم 1/, en: /famous|best known|first of its kind|#1|number one/i, claim: 'famous' },
  { ar: /عالمي/, en: /world/i, claim: 'world-class' },
  { ar: /جنة/, en: /paradise/i, claim: 'paradise' },
  { ar: /رائد/, en: /premier|leading/i, claim: 'premier' },
];

describe('B17 Arabic payloads', () => {
  it('cover every site of the three groups, each with its trip, its destination and its presentation', () => {
    expect(payloads.map((payload) => payload.tenant.slug)).toEqual(sites.map((site) => site.slug));
    for (const payload of payloads) {
      const site = sites.find((item) => item.slug === payload.tenant.slug)!;
      expect(payload.tours.map((tour) => tour.sourceSlug).sort()).toEqual(site.trips.map((trip) => `${site.slugPrefix}${trip.path}`).sort());
      expect(payload.destinations).toHaveLength(1);
      expect(payload.destinations[0].sourceSlug).toBe(site.pickupDestination);
      expect(payload.presentation.map((entry) => entry.kind)).toEqual(['tenant']);
      for (const entry of [...payload.tours, ...payload.destinations]) expect(entry.slug).toBe(`${entry.sourceSlug}-ar`);
    }
    expect(payloads.reduce((sum, payload) => sum + payload.tours.length, 0)).toBe(18);
    expect(payloads.reduce((sum, payload) => sum + payload.presentation.length + payload.tours.length + payload.destinations.length, 0)).toBe(54);
  });

  it('give every English string its Arabic, and invent nothing where the English is empty', () => {
    const problems = pairs.filter((pair) => (pair.en.trim() ? !pair.ar.trim() || pair.ar === '\u0000missing' : pair.ar.trim() !== ''));
    for (const payload of payloads) for (const record of records(payload)) {
      const english = [...flattenStrings(record.english).keys()];
      const arabic = [...flattenStrings(record.arabic).keys()];
      if (JSON.stringify(english) !== JSON.stringify(arabic)) problems.push({ site: payload.tenant.slug, where: record.where, path: 'structure', en: english.join(','), ar: arabic.join(',') });
    }
    expect(problems).toEqual([]);
  });

  it('leave no English prose standing in an Arabic field', () => {
    const problems = pairs.filter((pair) => pair.en.trim() && pair.ar === pair.en && /\s/.test(pair.en.trim()) && !/[؀-ۿ]/.test(pair.en));
    expect(problems.map((pair) => `${pair.site} ${pair.where} ${pair.path}`)).toEqual([]);
  });

  it('keep identities, paragraphs, placeholders and line breaks', () => {
    const problems: string[] = [];
    for (const payload of payloads) for (const record of records(payload)) {
      const ids = (value: unknown): string => JSON.stringify(value, (key, child) => (typeof child === 'string' && !['id', 'url', 'key', 'type'].includes(key) ? '' : child));
      if (ids(record.english) !== ids(record.arabic)) problems.push(`${payload.tenant.slug} ${record.where}: ids, indexes or urls changed`);
    }
    for (const pair of pairs) {
      const breaks = (text: string) => (text.match(/\n\n/g) || []).length;
      if (pair.where.startsWith('presentation') ? /[\n\r\t]/.test(pair.ar) : breaks(pair.en) !== breaks(pair.ar)) problems.push(`${pair.site} ${pair.where} ${pair.path}: paragraph breaks`);
      const placeholders = (text: string) => (text.match(/\{[a-z]+\}/gi) || []).sort().join();
      if (placeholders(pair.en) !== placeholders(pair.ar)) problems.push(`${pair.site} ${pair.where} ${pair.path}: placeholders`);
      if (/<[a-z/]/i.test(pair.ar) !== /<[a-z/]/i.test(pair.en)) problems.push(`${pair.site} ${pair.where} ${pair.path}: markup`);
    }
    expect(problems).toEqual([]);
  });

  it('write Latin digits only, with exactly the numbers of the English', () => {
    const problems = pairs.filter((pair) => /[٠-٩۰-۹]/.test(pair.ar) || JSON.stringify(numbers(pair.en)) !== JSON.stringify(numbers(pair.ar)));
    expect(problems.map((pair) => `${pair.site} ${pair.where} ${pair.path}: ${numbers(pair.en)} / ${numbers(pair.ar)}`)).toEqual([]);
  });

  it('give one English string one Arabic reading across the eighteen sites', () => {
    const readings = new Map<string, Set<string>>();
    for (const pair of pairs) if (pair.en.trim()) readings.set(pair.en.trim(), (readings.get(pair.en.trim()) || new Set()).add(pair.ar));
    expect([...readings].filter(([, values]) => values.size > 1).map(([en]) => en)).toEqual([]);
  });

  it('keep every glossary term on its one network reading, and no second reading anywhere', () => {
    const problems: string[] = [];
    for (const pair of pairs) for (const term of glossary.terms) {
      const named = new RegExp(`(^|[^A-Za-z])${escape(term.en)}([^A-Za-z]|$)`, 'i').test(pair.en);
      if (named && !(term.forms || [term.ar]).concat(term.ar).some((form) => pair.ar.includes(form))) problems.push(`${pair.site} ${pair.where} ${pair.path}: "${term.en}" without ${term.ar}`);
      for (const variant of term.avoid || []) if (pair.ar.includes(variant)) problems.push(`${pair.site} ${pair.where} ${pair.path}: second reading ${variant}`);
    }
    expect(problems).toEqual([]);
  });

  it('claim nothing the English does not: no "official", "best", rating, guarantee or year it lacks', () => {
    const problems: string[] = [];
    for (const pair of pairs) for (const rule of CLAIMS) if (rule.ar.test(pair.ar) && !rule.en.test(pair.en)) problems.push(`${pair.site} ${pair.where} ${pair.path}: ${rule.claim}`);
    expect(problems).toEqual([]);
  });

  it('pass the repository content schemas and completeness validation, record by record', () => {
    for (const payload of payloads) {
      for (const tour of payload.tours) {
        const english = tour.english;
        const source = { ...english, images: english.imageAltTexts.map((image: { url: string }) => image.url), pricingOptions: english.pricingOptions, itinerary: english.itinerary, entryWindows: english.entryWindows, gettingThere: english.gettingThere };
        expect(() => validateTranslationSource(source, cleanTranslation(attractionTranslationContent.parse(tour.arabic)))).not.toThrow();
      }
      for (const destination of payload.destinations) expect(() => validateDestinationTranslation(destination.english, cleanDestinationTranslation(destinationTranslationContent.parse(destination.arabic)))).not.toThrow();
      for (const entry of payload.presentation) expect(tenantPresentationContent.safeParse(entry.arabic).success).toBe(true);
    }
  });
});
