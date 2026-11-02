import fs from 'fs';
import path from 'path';
import { alignPairs, fieldOf, flattenStrings, logChunks, reassembleChunks, TranslationMemory, LOG_TAG } from '../scripts/network-arabic/text';
import { destinationTemplate, exportArguments, presentationSources } from '../scripts/export-network-arabic-sources';

describe('network Arabic text helpers', () => {
  it('flattens strings by item identity, never by position, and skips identity fields', () => {
    const flat = flattenStrings({
      title: 'A day',
      pricingOptions: [{ id: 'opt-b', name: 'Child', timeSlots: [{ id: 's1', label: 'Morning' }] }],
      itinerary: [{ index: 1, title: 'Lunch' }],
      imageAltTexts: [{ url: 'https://x.test/a.jpg', alt: 'A boat' }],
      highlights: ['One', 'Two'],
    });
    expect([...flat.entries()]).toEqual([
      ['title', 'A day'],
      ['pricingOptions[id=opt-b].name', 'Child'],
      ['pricingOptions[id=opt-b].timeSlots[id=s1].label', 'Morning'],
      ['itinerary[i=1].title', 'Lunch'],
      ['imageAltTexts[url=https://x.test/a.jpg].alt', 'A boat'],
      ['highlights[0]', 'One'],
      ['highlights[1]', 'Two'],
    ]);
  });

  it('pairs English and Arabic by identity even when the translated list is reordered', () => {
    const source = { pricingOptions: [{ id: 'a', name: 'Adult' }, { id: 'b', name: 'Child' }], duration: '5 hours', cancellationPolicy: '' };
    const translated = { pricingOptions: [{ id: 'b', name: 'طفل' }, { id: 'a', name: 'بالغ' }], duration: '5 hours', cancellationPolicy: '' };
    expect(alignPairs(source, translated)).toEqual([
      { path: 'pricingOptions[id=a].name', en: 'Adult', ar: 'بالغ' },
      { path: 'pricingOptions[id=b].name', en: 'Child', ar: 'طفل' },
    ]);
    expect(fieldOf('itinerary[i=4].title')).toBe('itinerary[].title');
  });

  it('carries a payload through log lines in any order and refuses a gap or a changed piece', () => {
    const payload = { text: 'شعب أبو نقر '.repeat(400), n: 14 };
    const lines = logChunks('source:x', payload, 500);
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.every((line) => line.t === LOG_TAG && line.d.length <= 500)).toBe(true);
    const shuffled = [...lines].reverse().map((line) => ({ ...line, seq: String(line.seq), of: String(line.of) }));
    expect(reassembleChunks(shuffled)).toEqual({ 'source:x': payload });
    expect(() => reassembleChunks(lines.slice(1))).toThrow('pieces');
    const tampered = lines.map((line, index) => (index === 0 ? { ...line, d: `${line.d.slice(0, -4)}AAAA` } : line));
    expect(() => reassembleChunks(tampered)).toThrow('digest mismatch');
  });

  it('keeps every rendering of an English string, most used first, and finds term examples', () => {
    const memory = new TranslationMemory();
    memory.add([{ path: 'inclusions[0]', en: 'Hotel pickup', ar: 'النقل من الفندق' }], 'site-a');
    memory.add([{ path: 'inclusions[2]', en: 'Hotel pickup', ar: 'النقل من الفندق' }], 'site-b');
    memory.add([{ path: 'itinerary[i=0].title', en: 'Hotel pickup', ar: 'الاستلام من الفندق' }], 'site-c');
    memory.add([{ path: 'title', en: 'Pickup and drop-off at your hotel in Hurghada', ar: 'النقل من فندقك في الغردقة والعودة إليه' }], 'site-a');
    expect(memory.lookup(' Hotel pickup ')).toEqual({
      en: 'Hotel pickup',
      renderings: [
        { ar: 'النقل من الفندق', uses: 2, sites: ['site-a', 'site-b'], fields: ['inclusions[]'] },
        { ar: 'الاستلام من الفندق', uses: 1, sites: ['site-c'], fields: ['itinerary[].title'] },
      ],
    });
    expect(memory.lookup('Not there')).toBeNull();
    expect(memory.examples('pickup', 1).map((entry) => entry.en)).toEqual(['Hotel pickup']);
  });
});

describe('network Arabic source export', () => {
  it('accepts only known groups, once each', () => {
    expect(exportArguments(['--batch=b14a,b14b'])).toEqual({ batches: ['b14a', 'b14b'] });
    expect(() => exportArguments(['--batch=b14a,b14a'])).toThrow();
    expect(() => exportArguments(['--batch=b99'])).toThrow();
    expect(() => exportArguments([])).toThrow();
  });

  it('builds the destination fields and the presentation source list the repository exporters use', () => {
    expect(destinationTemplate({ name: 'Hurghada', country: 'Egypt', description: 'D', price: 3 })).toEqual({ name: 'Hurghada', country: 'Egypt', description: 'D', shortDescription: '', highlights: [], bestTimeToVisit: '', tags: [] });
    const tenant = { _id: '0123456789abcdef01234567', customPages: [{ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa' }, { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', isPublished: false }, { _id: 'cccccccccccccccccccccccc', status: 'archived' }] };
    expect(presentationSources(tenant)).toEqual([{ kind: 'tenant', id: '0123456789abcdef01234567' }, { kind: 'page', id: 'aaaaaaaaaaaaaaaaaaaaaaaa' }]);
  });

  it('contains no database write and connects without creating indexes or collections', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'export-network-arabic-sources.ts'), 'utf8');
    expect(source).toContain('autoIndex: false, autoCreate: false');
    expect(source).not.toMatch(/\.(insert(One|Many)?|update(One|Many)?|replaceOne|delete(One|Many)?|findOneAnd\w+|bulkWrite|save|create|drop\w*)\(/);
  });
});
