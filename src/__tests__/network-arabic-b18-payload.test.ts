/**
 * The B18A Arabic payloads, checked the way the B12, B13, B14 and B17 checkers checked theirs: every source
 * has its Arabic, every part and placeholder and paragraph is kept, digits stay Latin and the numbers stay
 * the same, one English string keeps one Arabic reading across the batch and the network glossary, and
 * nothing claims more than the English does. The repository's own content schemas and completeness
 * validators run on every record too.
 *
 * B18's sites were not created by the network seeds, so there is no `NetworkSite` to compare the payloads
 * against. The coverage table below is the production read of 4 November 2026 instead — the live trips,
 * destinations and presentation sources of each site, in the order the exporters list them — so a payload
 * that gains, loses or reorders a record fails here rather than at the apply check.
 */
import fs from 'fs';
import path from 'path';
import { loadGroupPayloads, type SitePayload } from '../scripts/network-arabic/publish';
import { flattenStrings } from '../scripts/network-arabic/text';
import { attractionTranslationContent, cleanTranslation, validateTranslationSource } from '../services/attractionLocalization.service';
import { destinationTranslationContent, cleanDestinationTranslation, validateDestinationTranslation } from '../services/destinationLocalization.service';
import { tenantPresentationContent } from '../services/tenantPresentationLocalization.service';
import { B18A } from '../scripts/network-arabic/b18';

type Glossary = { terms: Array<{ en: string; ar: string; forms?: string[]; avoid?: string[] }> };
const glossary: Glossary = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'network-arabic', 'b18', 'glossary.json'), 'utf8'));
const payloads: SitePayload[] = loadGroupPayloads('b18a');

/** What each site sells and shows, read in production on 4 November 2026. */
const LIVE: Record<string, { tours: string[]; destinations: string[]; presentation: string[] }> = {
  'cairo-adventures': {
    tours: ['cairo-night-cruise', 'cairo-tour-from-hurghada', 'cairo-tours-packages', 'pyramids-excursions', 'egyptian-museum-vip-tour', 'cairo-old-city-walking-tour', 'cairo-sunset-felucca-ride', 'cairo-sound-light-show-pyramids', 'cairo-citadel-mosque-tour', 'cairo-quad-bike-pyramids', 'cairo-food-street-tour', 'cairo-tour-from-hurghada-experience', 'cairo-tours-packages-deal', 'luxor-tour-from-hurghada-excursion', 'pyramids-excursions-guided-tour'],
    destinations: ['cairo', 'luxor'],
    presentation: ['tenant'],
  },
  'horse-riding-hurghada': {
    tours: ['hrh-horse-riding-in-hurghada-with-optional-stargazing-bbq', 'hrh-horseback-riding-across-the-desert-and-red-sea-with', 'hrh-explore-makadi-bay-on-horseback-from-hurghada'],
    destinations: ['hurghada'],
    presentation: ['tenant'],
  },
  'gamila-horse-stable': {
    tours: ['horse-riding-hurghada', 'two-hours-desert-ride', 'three-hours-desert-trip', 'four-hours-desert-sea-swimming', 'swimming-with-horse-2-hour', 'two-hours-beach-desert-ride', 'gamila-makadi-horse-riding-desert-sea-guide', 'gamila-sunset-beach-horse-ride', 'gamila-kids-pony-experience'],
    destinations: ['hurghada', 'makadi-bay'],
    presentation: ['tenant'],
  },
};

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

/**
 * Arabic words that make a claim, allowed only where the English itself makes it.
 *
 * Two of B17's rules are made word-aware here, narrowing them to the claim they were written for and to
 * nothing else. Both corrections were forced by the network's own published Arabic, which B18 reuses:
 * - `رسمي` matched inside **غير رسمية** ("informal"), the published reading of "Smart casual attire". The
 *   rule now skips a `رسمي` that `غير` negates, which is the opposite of the claim.
 * - `تضمن` matched inside **تتضمن** ("includes"), the published reading of "Long walking distances
 *   involved". The rule now requires the word to begin at a space or a punctuation mark, so `ضمان` and
 *   `تضمن` still catch a guarantee while `تتضمن` and `يتضمن` read as what they are.
 */
const WORD_START = '(?:^|[\\s،.:;!?()\\-|—])';
const CLAIMS: Array<{ ar: RegExp; en: RegExp; claim: string }> = [
  { ar: /(?<!غير\s)رسمي/, en: /official/i, claim: 'official' },
  { ar: /أفضل|الأروع|أجمل/, en: /\bbest\b|\bbetter\b|finest/i, claim: 'best' },
  { ar: /تقييم|نجمة|نجوم|★/, en: /\bstars?\b|stargaz|astronom|rating|rated/i, claim: 'rating' },
  { ar: new RegExp(`${WORD_START}(?:مضمون|نضمن|ضمان|يضمن|تضمن)`), en: /guarantee|promise/i, claim: 'guarantee' },
  { ar: /لا يُنسى|لا تُنسى|لا ينسى|لا تنسى/, en: /unforgettable/i, claim: 'unforgettable' },
  { ar: /فاخر|فخم|فخامة/, en: /luxur|gourmet|deluxe/i, claim: 'luxury' },
  { ar: /حصري/, en: /exclusive/i, claim: 'exclusive' },
  { ar: /الأشهر|الأكثر شهرة|الأول من نوعه|رقم 1/, en: /famous|best known|first of its kind|#1|number one/i, claim: 'famous' },
  { ar: /عالمي/, en: /world/i, claim: 'world-class' },
  { ar: /جنة/, en: /paradise/i, claim: 'paradise' },
  { ar: /رائد/, en: /premier|leading/i, claim: 'premier' },
];

describe('B18 Arabic payloads', () => {
  it('cover every site of the group with exactly the records production shows', () => {
    expect(payloads.map((payload) => payload.tenant.slug)).toEqual(B18A.sites.map((site) => site.slug));
    for (const payload of payloads) {
      const live = LIVE[payload.tenant.slug];
      expect(payload.tours.map((tour) => tour.sourceSlug)).toEqual(live.tours);
      expect(payload.destinations.map((item) => item.sourceSlug)).toEqual(live.destinations);
      expect(payload.presentation.map((entry) => entry.kind)).toEqual(live.presentation);
      for (const entry of [...payload.tours, ...payload.destinations]) expect(entry.slug).toBe(`${entry.sourceSlug}-ar`);
    }
    expect(payloads.reduce((sum, payload) => sum + payload.tours.length, 0)).toBe(27);
    expect(payloads.reduce((sum, payload) => sum + payload.presentation.length + payload.tours.length + payload.destinations.length, 0)).toBe(35);
  });

  it('carry the site identity the group declares, own domain included', () => {
    for (const payload of payloads) {
      const site = B18A.sites.find((item) => item.slug === payload.tenant.slug)!;
      expect(payload.tenant.domain).toBe(site.domain);
      expect(payload.tenant.customDomain).toBe(site.customDomain);
      expect(payload.batch).toBe('b18a');
      expect(payload.locale).toBe('ar');
    }
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

  it('give one English string one Arabic reading across the three sites', () => {
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
        const english = tour.english as any;
        const source = { ...english, images: english.imageAltTexts.map((image: { url: string }) => image.url), pricingOptions: english.pricingOptions, itinerary: english.itinerary, entryWindows: english.entryWindows, gettingThere: english.gettingThere };
        expect(() => validateTranslationSource(source, cleanTranslation(attractionTranslationContent.parse(tour.arabic)))).not.toThrow();
      }
      for (const destination of payload.destinations) expect(() => validateDestinationTranslation(destination.english, cleanDestinationTranslation(destinationTranslationContent.parse(destination.arabic)))).not.toThrow();
      for (const entry of payload.presentation) expect(tenantPresentationContent.safeParse(entry.arabic).success).toBe(true);
    }
  });
});
