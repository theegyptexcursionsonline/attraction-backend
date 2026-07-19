import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import contentRouter from '../routes/content.routes';
import blogRouter from '../routes/blog.routes';
import { BlogPost } from '../models/BlogPost';
import {
  sanitizeCustomPages,
  sanitizeRichText,
  sanitizeTranslations,
} from '../utils/sanitizeHtml';

jest.mock('../middleware/contentEngineAuth', () => ({
  authenticateContentEngine: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../models/BlogPost', () => ({
  BlogPost: {
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  },
}));

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/content', contentRouter);
  app.use('/api/blog', blogRouter);
  return app;
};

describe('content isolation and HTML safety', () => {
  beforeEach(() => jest.clearAllMocks());

  it('removes executable markup while preserving editorial HTML', () => {
    const sanitized = sanitizeRichText(
      '<h2>Welcome</h2><script>alert(1)</script>' +
      '<img src="https://images.example.com/photo.jpg" onerror="alert(2)">' +
      '<a href="javascript:alert(3)" onclick="alert(4)">unsafe</a>'
    );

    expect(sanitized).toContain('<h2>Welcome</h2>');
    expect(sanitized).toContain('https://images.example.com/photo.jpg');
    expect(sanitized).not.toMatch(/script|onerror|onclick|javascript:/i);
  });

  it('sanitizes custom pages and translated rich-text fields', () => {
    const [page] = sanitizeCustomPages([
      { slug: 'about', title: 'About', body: '<p>Safe</p><iframe src="https://evil.test"></iframe>' },
    ]) as Array<Record<string, unknown>>;
    const translations = sanitizeTranslations({
      de: { title: 'Hallo', content: '<p>Gut</p><svg onload="alert(1)"></svg>' },
    });

    expect(page.body).toBe('<p>Safe</p>');
    expect(translations.de.content).toBe('<p>Gut</p>');
  });

  it('sanitizes content-engine HTML before persistence', async () => {
    (BlogPost.findOneAndUpdate as jest.Mock).mockResolvedValue({
      _id: 'post-id',
      slug: 'safe-post',
    });

    const response = await request(buildApp())
      .post('/api/admin/content/blog')
      .send({
        tenantId: 'tenant-a',
        payload: {
          title: 'A safe editorial post',
          slug: 'safe-post',
          excerpt: 'A sufficiently long excerpt',
          content: '<p>Editorial content that is long enough for validation.</p><script>alert(1)</script>',
        },
      });

    expect(response.status).toBe(201);
    const update = (BlogPost.findOneAndUpdate as jest.Mock).mock.calls[0][1];
    expect(update.$set.content).toContain('<p>Editorial content');
    expect(update.$set.content).not.toContain('<script');
  });

  it('checks slug uniqueness inside the requested tenant namespace', async () => {
    const lean = jest.fn().mockResolvedValue(null);
    const select = jest.fn().mockReturnValue({ lean });
    (BlogPost.findOne as jest.Mock).mockReturnValue({ select });

    const response = await request(buildApp())
      .get('/api/admin/content/blog/shared-slug?tenantId=tenant-b');

    expect(response.status).toBe(404);
    expect(BlogPost.findOne).toHaveBeenCalledWith({
      tenantId: 'tenant-b',
      slug: 'shared-slug',
    });
  });

  it('sanitizes legacy blog HTML on the public read path', async () => {
    (BlogPost.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'post-id',
        tenantId: 'tenant-a',
        slug: 'legacy-post',
        status: 'published',
        content: '<p>Legacy copy</p><img src=x onerror="alert(1)">',
      }),
    });

    const response = await request(buildApp())
      .get('/api/blog/legacy-post?tenant=tenant-a');

    expect(response.status).toBe(200);
    expect(response.body.data.content).toContain('<p>Legacy copy</p>');
    expect(response.body.data.content).not.toMatch(/onerror|javascript:|<script/i);
  });
});
