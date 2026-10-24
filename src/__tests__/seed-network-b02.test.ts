import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { copiedFactProblems, eeoSourceProgramme, tripDocument, validateBatch } from '../scripts/seed-network-sites';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';
import { B02 } from '../scripts/network-sites/b02';

describe('batch B02: the next ten HIGH domains, nine built (Nabq waits for a trip)', () => {
  it('is a valid batch: claim-free copy, places each site serves, network-hosted photos', () => {
    expect(validateBatch(B02)).toEqual([]);
  });

  it('builds nine sites, none of them a site already built', () => {
    expect(B02.sites.map((item) => item.domain)).toEqual([
      'tunisvillagefayoum.com', 'giftunbeach.com', 'rasmohamednaturereserve.com', 'whiteislandsharmelsheikh.com',
      'tiranislandsharmelsheikh.com', 'safarimarsaalam.com', 'sunsetsafarimarsaalam.com', 'sharkreefsharmelsheikh.com', 'ummgamarhurghada.com',
    ]);
    expect(B02.sites.map((item) => item.domain)).not.toContain('nabqnationalpark.com');
    const built = new Set([...B01_SAFARI.sites.flatMap((item) => [item.slug, item.domain, item.slugPrefix]),
      'fox-safari-marsa-alam', 'fox-safari-makadi-bay', 'fox-safari-hurghada', 'power-safari-marsa-alam']);
    for (const item of B02.sites) {
      expect(built.has(item.slug) || built.has(item.domain) || built.has(item.slugPrefix)).toBe(false);
      expect(item.currency).toBe('USD');
    }
    // Neighbouring sites never open on the same photo, across both batches.
    const firstHeroes = [...B01_SAFARI.sites, ...B02.sites].map((item) => item.heroImages[0]);
    expect(new Set(firstHeroes).size).toBe(firstHeroes.length);
  });

  it('lists the boat and day trips at /trips and keeps the desert sites on /safaris', () => {
    expect(Object.fromEntries(B02.sites.map((item) => [item.slug, item.listingPath ?? '/safaris']))).toEqual({
      'tunis-village-fayoum': '/trips', 'giftun-beach': '/trips', 'ras-mohamed-nature-reserve': '/trips', 'white-island-sharm': '/trips',
      'tiran-island-sharm': '/trips', 'safari-marsa-alam': '/safaris', 'sunset-safari-marsa-alam': '/safaris',
      'shark-reef-sharm': '/trips', 'umm-gamar-hurghada': '/trips',
    });
  });

  it('takes fewer than three home photos only where the trips publish fewer, and says so', () => {
    for (const item of B02.sites) {
      const photos = new Set(item.trips.flatMap((one) => one.images));
      if (item.photoShortfall) expect(photos.size).toBeLessThan(3);
      else expect(item.heroImages).toHaveLength(3);
    }
    expect(B02.sites.filter((item) => item.photoShortfall).map((item) => item.slug)).toEqual(['tunis-village-fayoum', 'tiran-island-sharm']);
  });

  it('builds every trip the client publishes on its main site into a complete trip from the dated snapshot', () => {
    const tenantId = new Types.ObjectId();
    let built = 0;
    for (const item of B02.sites) {
      item.trips.forEach((one, index) => {
        if (one.price.provider !== 'eeo') return;
        const document = tripDocument(item, one, eeoSourceProgramme(one.price), index, tenantId);
        built += 1;
        expect(copiedFactProblems(item, document)).toEqual([]);
        expect(new Attraction(document).validateSync()?.errors ?? {}).toEqual({});
        expect(document.currency).toBe('USD');
        expect(document.hasHotelPickup).toBe(true);
        expect(document.inclusions as string[]).toEqual(expect.arrayContaining([expect.stringMatching(/^Hotel pickup/)]));
        // A conditional line ("if option selected") never reaches a site; the option sold decides it.
        expect((document.inclusions as string[]).filter((text) => /\(if |if selected|Know Before You Go/i.test(text))).toEqual([]);
        // Every extra sold is named in the site's own words, and every line is written once.
        const names = (document.addons as Array<{ name: string }>).map((addon) => addon.name);
        expect(names).toEqual(one.price.addons.map((id) => one.price.extras?.[id]?.name));
        for (const field of ['inclusions', 'exclusions', 'needToKnow'] as const) {
          const lines = document[field] as string[];
          expect(new Set(lines).size).toBe(lines.length);
        }
        expect(document.departures ?? document.entryWindows).toEqual([expect.objectContaining({ label: 'Morning' })]);
      });
    }
    expect(built).toBe(20);
  });

  it('never promises a stop at the reef a site is named after when no published trip goes there', () => {
    // Owner, 24 Oct: the nearest trips, with wording that places the reef in the area and never promises a stop.
    for (const [slug, place] of [['shark-reef-sharm', 'Shark Reef'], ['umm-gamar-hurghada', 'Umm Gamar']] as const) {
      const item = B02.sites.find((one) => one.slug === slug)!;
      expect(item.description).toMatch(new RegExp(`${place}[^.]*(not one of them|none of them promises)|(none of them promises|not one of them)[^.]*${place}`));
      for (const one of item.trips) {
        // A title, summary, highlight or search line never names the reef: only the sentence that says it is not a stop.
        expect([one.title, one.short, ...one.highlights, one.seo.metaTitle, one.seo.metaDescription].join(' ')).not.toContain(place);
        const mentions = one.description.split(/(?<=\.)\s+/).filter((sentence) => sentence.includes(place));
        expect(mentions.length).toBeGreaterThan(0);
        for (const sentence of mentions) expect(sentence).toMatch(/not one of|does not|is not|also lie|not include/);
      }
    }
  });

  it('sells the two Marsa Alam sites only from the published desert programmes, the sunset site only after noon', () => {
    const marsa = B02.sites.filter((item) => item.city === 'Marsa Alam');
    expect(marsa.map((item) => item.slug)).toEqual(['safari-marsa-alam', 'sunset-safari-marsa-alam']);
    for (const item of marsa) expect(new Set(item.trips.map((one) => one.price.tenant))).toEqual(new Set(['fox-safari-marsa-alam']));
    const sunset = marsa[1].trips.flatMap((one) => one.price.departures);
    expect(sunset.some((label) => /morning/i.test(label))).toBe(false);
  });
});
