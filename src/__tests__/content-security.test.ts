import express from 'express';
import request from '../test/loopbackRequest';
import blogRouter from '../routes/blog.routes';
import { BlogPost } from '../models/BlogPost';
import { Tenant } from '../models/Tenant';
import { Types } from 'mongoose';
import {
  sanitizeCustomPages,
  sanitizeRichText,
  sanitizeTranslations,
} from '../utils/sanitizeHtml';

jest.mock('../models/BlogPost', () => ({
  BlogPost: {
    findOne: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock('../models/Tenant', () => ({
  Tenant: { findOne: jest.fn() },
}));

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/blog', blogRouter);
  return app;
};

describe('content isolation and HTML safety', () => {
  const tenantId = new Types.ObjectId('64b000000000000000000001');

  beforeEach(() => {
    jest.clearAllMocks();
    (Tenant.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: tenantId, slug: 'tenant-a' }),
      }),
    });
  });

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

  it('keeps SVG animation URI-list payloads outside the editorial allow-list', () => {
    const sanitized = sanitizeRichText('<p>Published text</p><svg><a><animate attributeName="href" values="#safe;javascript:alert(1)" dur=".01s"></animate><text>Link</text></a></svg>');
    expect(sanitized).toContain('<p>Published text</p>');
    expect(sanitized).not.toMatch(/<svg|<animate|javascript:|attributeName/i);
  });

  it('does not turn malformed textarea closure into active markup and preserves normal links and tables', () => {
    const sanitized = sanitizeRichText('<textarea>text</textarea/><img src="https://images.example.com/photo.jpg" onerror="alert(1)"><script>alert(2)</script><a href="https://example.com" target="_blank">Read</a><table><tr><td>Value</td></tr></table>');
    expect(sanitized).not.toMatch(/<textarea|<script|<img[^>]*onerror|<a[^>]*javascript:/i);
    const editorial = sanitizeRichText('<a href="https://example.com" target="_blank">Read</a><table><tr><td>Value</td></tr></table>');
    expect(editorial).toContain('rel="noopener noreferrer"');
    expect(editorial).toContain('<td>Value</td>');
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
    expect(Tenant.findOne).toHaveBeenCalledWith({
      slug: 'tenant-a',
      status: { $in: ['active', 'coming_soon'] },
    });
    expect(BlogPost.findOne).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      $or: [{ tenantRef: tenantId }, { tenantRef: { $exists: false } }],
      slug: 'legacy-post',
      status: 'published',
    });
  });

  it('returns not found before a content query when the tenant join fails', async () => {
    (Tenant.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    });
    const response = await request(buildApp()).get('/api/blog/post?tenant=unknown-tenant');
    expect(response.status).toBe(404);
    expect(BlogPost.findOne).not.toHaveBeenCalled();
  });
});
