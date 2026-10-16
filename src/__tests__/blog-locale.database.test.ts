import { spawnSync } from 'child_process';
import express from 'express';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from '../test/loopbackRequest';
import { BlogPost } from '../models/BlogPost';
import { Tenant } from '../models/Tenant';
import blogRouter from '../routes/blog.routes';

/**
 * A journal read in another language returns one article in one language: the complete
 * translation, or the untouched original. These run the real routes against a disposable
 * MongoDB so the list's translation projection and the detail read are proven together.
 */
const app = express();
app.use('/api/blog', blogRouter);

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();
let mongo: MongoMemoryServer;
jest.setTimeout(120_000);

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  mongo = await MongoMemoryServer.create(located.status === 0 ? { binary: { systemBinary: located.stdout.trim() } } : {});
  await mongoose.connect(mongo.getUri('blog_locale'));
  await Tenant.collection.insertMany([
    { _id: tenantA, slug: 'tenant-a', status: 'active' },
    { _id: tenantB, slug: 'tenant-b', status: 'active' },
  ]);
  const base = { status: 'published', featured: false, defaultLocale: 'en', category: 'destination-guides', author: 'Tenant A Editorial Team' };
  await BlogPost.collection.insertMany([
    {
      ...base,
      tenantId: 'tenant-a',
      tenantRef: tenantA,
      slug: 'orange-bay-boat-trip',
      title: 'Orange Bay boat trip',
      excerpt: 'Choosing an Orange Bay day.',
      content: '<p>The English body of the article, long enough to read.</p>',
      metaTitle: 'Orange Bay boat trip | English',
      metaDescription: 'English search description.',
      tags: ['orange-bay'],
      faqs: [{ question: 'Is lunch included?', answer: 'Yes.' }],
      publishedAt: new Date('2026-10-16T05:11:00Z'),
      translations: {
        de: {
          title: 'Bootsfahrt nach Orange Bay',
          excerpt: 'So wählen Sie Ihren Tag in Orange Bay.',
          content: '<p>Der deutsche Text des Artikels.</p><script>alert(1)</script>',
          metaTitle: 'Bootsfahrt nach Orange Bay | Deutsch',
          metaDescription: 'Deutsche Suchbeschreibung.',
          tags: ['orange-bay', 'bootsfahrt'],
          faqs: [{ question: 'Ist das Mittagessen inklusive?', answer: 'Ja.' }],
        },
        // A title without a body is not a translation a reader can open.
        ar: { title: 'رحلة أورانج باي' },
        // Complete, but without its own search snippet.
        ru: { title: 'Морская прогулка на Оранж-Бэй', content: '<p>Русский текст статьи.</p>' },
      },
    },
    {
      ...base,
      tenantId: 'tenant-a',
      tenantRef: tenantA,
      slug: 'giftun-island-trip',
      title: 'Giftun Island trip',
      excerpt: 'A full day at Giftun.',
      content: '<p>Only in English so far.</p>',
      publishedAt: new Date('2026-10-16T05:25:00Z'),
    },
    {
      ...base,
      tenantId: 'tenant-b',
      tenantRef: tenantB,
      slug: 'orange-bay-boat-trip',
      title: 'Another site\'s Orange Bay article',
      excerpt: 'Tenant B excerpt.',
      content: '<p>Tenant B body.</p>',
      publishedAt: new Date('2026-10-16T06:00:00Z'),
      translations: { de: { title: 'Artikel einer anderen Seite', content: '<p>Text von Seite B.</p>' } },
    },
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

const detail = (slug: string, query: Record<string, string | string[]>) => request(app).get(`/api/blog/${slug}`).query(query);
const list = (query: Record<string, string>) => request(app).get('/api/blog').query(query);

describe('GET /api/blog/:slug in a requested language', () => {
  it('returns the original with the languages it can be read in', async () => {
    const response = await detail('orange-bay-boat-trip', { tenant: 'tenant-a' }).expect(200);
    expect(response.body.data).toMatchObject({
      title: 'Orange Bay boat trip',
      contentLocale: 'en',
      availableLocales: ['en', 'de', 'ru'],
    });
  });

  it('returns every reader-facing field from the complete translation', async () => {
    const { body } = await detail('orange-bay-boat-trip', { tenant: 'tenant-a', locale: 'de' }).expect(200);
    expect(body.data).toMatchObject({
      title: 'Bootsfahrt nach Orange Bay',
      excerpt: 'So wählen Sie Ihren Tag in Orange Bay.',
      metaTitle: 'Bootsfahrt nach Orange Bay | Deutsch',
      metaDescription: 'Deutsche Suchbeschreibung.',
      tags: ['orange-bay', 'bootsfahrt'],
      faqs: [{ question: 'Ist das Mittagessen inklusive?', answer: 'Ja.' }],
      // The category is the article's filing key, not reader text.
      category: 'destination-guides',
      slug: 'orange-bay-boat-trip',
      contentLocale: 'de',
      availableLocales: ['en', 'de', 'ru'],
    });
    expect(body.data.content).toContain('Der deutsche Text des Artikels.');
    expect(body.data.content).not.toContain('<script');
    expect(body.data.content).not.toContain('English body');
  });

  it('never fills a missing translated snippet with the original language', async () => {
    const { body } = await detail('orange-bay-boat-trip', { tenant: 'tenant-a', locale: 'ru' }).expect(200);
    expect(body.data).toMatchObject({ title: 'Морская прогулка на Оранж-Бэй', excerpt: '', faqs: [], tags: [], contentLocale: 'ru' });
    expect(body.data).not.toHaveProperty('metaTitle');
    expect(body.data).not.toHaveProperty('metaDescription');
  });

  it.each(['ar', 'fr', 'en'])('keeps the original for %s, which has no complete translation', async (locale) => {
    const { body } = await detail('orange-bay-boat-trip', { tenant: 'tenant-a', locale }).expect(200);
    expect(body.data).toMatchObject({ title: 'Orange Bay boat trip', metaTitle: 'Orange Bay boat trip | English', contentLocale: 'en' });
  });

  it.each([['a field path', 'de.title'], ['an operator', '$where'], ['two languages', ['de', 'ru']]])(
    'refuses %s as a language',
    async (_label, locale) => {
      await detail('orange-bay-boat-trip', { tenant: 'tenant-a', locale }).expect(400);
    }
  );

  it('reads the same address on another site as that site\'s own article', async () => {
    const { body } = await detail('orange-bay-boat-trip', { tenant: 'tenant-b', locale: 'de' }).expect(200);
    expect(body.data).toMatchObject({ tenantId: 'tenant-b', title: 'Artikel einer anderen Seite', contentLocale: 'de' });
    expect(JSON.stringify(body)).not.toContain('Bootsfahrt nach Orange Bay');
  });
});

describe('GET /api/blog in a requested language', () => {
  it('reads each card in the requested language and never sends the translations or bodies', async () => {
    const { body } = await list({ tenant: 'tenant-a', pagination: 'cursor', locale: 'de' }).expect(200);
    expect(body.data.map((post: { slug: string }) => post.slug)).toEqual(['giftun-island-trip', 'orange-bay-boat-trip']);
    const [giftun, orangeBay] = body.data;
    expect(orangeBay).toMatchObject({
      title: 'Bootsfahrt nach Orange Bay',
      excerpt: 'So wählen Sie Ihren Tag in Orange Bay.',
      tags: ['orange-bay', 'bootsfahrt'],
      contentLocale: 'de',
      availableLocales: ['en', 'de', 'ru'],
    });
    expect(giftun).toMatchObject({ title: 'Giftun Island trip', contentLocale: 'en', availableLocales: ['en'] });
    for (const post of body.data) {
      expect(post).not.toHaveProperty('translations');
      expect(post).not.toHaveProperty('content');
    }
    expect(body.pagination.total).toBe(2);
  });

  it('lists the original when no language is asked for', async () => {
    const { body } = await list({ tenant: 'tenant-a', pagination: 'cursor' }).expect(200);
    expect(body.data[1]).toMatchObject({ title: 'Orange Bay boat trip', contentLocale: 'en', availableLocales: ['en', 'de', 'ru'] });
  });

  it('searches the translated titles of the requested language', async () => {
    const german = await list({ tenant: 'tenant-a', pagination: 'cursor', locale: 'de', search: 'Bootsfahrt' }).expect(200);
    expect(german.body.data.map((post: { slug: string }) => post.slug)).toEqual(['orange-bay-boat-trip']);
    const english = await list({ tenant: 'tenant-a', pagination: 'cursor', search: 'Bootsfahrt' }).expect(200);
    expect(english.body.data).toEqual([]);
  });

  it('localizes the unpaginated list the same way', async () => {
    const { body } = await list({ tenant: 'tenant-a', locale: 'de' }).expect(200);
    expect(body.data.find((post: { slug: string }) => post.slug === 'orange-bay-boat-trip')).toMatchObject({ title: 'Bootsfahrt nach Orange Bay', contentLocale: 'de' });
    expect(body.data.every((post: { tenantId: string }) => post.tenantId === 'tenant-a')).toBe(true);
  });

  it('keeps every site\'s list to its own articles in every language', async () => {
    const { body } = await list({ tenant: 'tenant-b', pagination: 'cursor', locale: 'de' }).expect(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ tenantId: 'tenant-b', title: 'Artikel einer anderen Seite' });
  });

  it('refuses a malformed language before reading', async () => {
    await list({ tenant: 'tenant-a', pagination: 'cursor', locale: 'translations.de' }).expect(400);
  });
});
