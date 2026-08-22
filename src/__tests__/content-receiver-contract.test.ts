import {
  canonicalBlogUrl,
  ContentBlogPublishRequestSchema,
  contentPublishFingerprint,
} from '../utils/contentReceiverContract';
import {
  assertInspectionAllowlist,
  parseInspectionArgs,
} from '../scripts/inspect-content-receiver-migration';
import { ContentPublication } from '../models/ContentPublication';
import { BlogPost } from '../models/BlogPost';

const request = {
  tenantId: 'tenant-a',
  defaultLocale: 'en',
  idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
  payload: {
    title: 'A valid editorial title',
    slug: 'valid-editorial-title',
    excerpt: 'A sufficiently detailed excerpt.',
    content: '<p>This editorial content is safely longer than fifty characters for validation.</p>',
    status: 'published' as const,
  },
  translations: {},
};

describe('content receiver contract', () => {
  it('declares the exact uniqueness boundaries without automatic production DDL', () => {
    expect(ContentPublication.schema.options.autoCreate).toBe(false);
    expect(ContentPublication.schema.options.autoIndex).toBe(false);
    expect(ContentPublication.schema.indexes()).toEqual(
      expect.arrayContaining([
        [{ idempotencyKey: 1 }, expect.objectContaining({ unique: true })],
      ])
    );
    expect(BlogPost.schema.indexes()).toEqual(
      expect.arrayContaining([
        [{ tenantId: 1, slug: 1 }, expect.objectContaining({ unique: true })],
      ])
    );
  });

  it('accepts the exact standard request and applies safe defaults', () => {
    const parsed = ContentBlogPublishRequestSchema.parse(request);
    expect(parsed.payload.tags).toEqual([]);
    expect(parsed.payload.faqs).toEqual([]);
    expect(parsed.payload.featured).toBe(false);
  });

  it.each([
    ['non-UUID key', { idempotencyKey: 'not-a-uuid' }],
    ['mixed-case tenant', { tenantId: 'Tenant-A' }],
    ['draft status', { payload: { ...request.payload, status: 'draft' } }],
    ['insecure image', { payload: { ...request.payload, featuredImage: 'http://img.example/post.jpg' } }],
    ['unknown payload field', { payload: { ...request.payload, unsupported: true } }],
  ])('rejects %s', (_label, override) => {
    const candidate = {
      ...request,
      ...override,
      payload: 'payload' in override ? override.payload : request.payload,
    };
    expect(ContentBlogPublishRequestSchema.safeParse(candidate).success).toBe(false);
  });

  it('builds a canonical HTTPS URL from a ready migrated custom domain', () => {
    expect(
      canonicalBlogUrl(
        {
          domain: 'tenant-a.foxesnetwork.com',
          customDomain: 'www.tenant-a.example',
          domainMigrated: true,
          customDomainStatus: 'ready',
        },
        'a-post'
      )
    ).toBe('https://www.tenant-a.example/blog/a-post');
  });

  it('falls back to the tenant network domain until the custom domain is ready', () => {
    expect(
      canonicalBlogUrl(
        {
          domain: 'tenant-a.foxesnetwork.com',
          customDomain: 'www.tenant-a.example',
          domainMigrated: false,
          customDomainStatus: 'pending_dns',
        },
        'a-post'
      )
    ).toBe('https://tenant-a.foxesnetwork.com/blog/a-post');
  });

  it.each(['http://tenant.example', 'tenant.example/path', 'user@tenant.example', 'localhost'])(
    'rejects invalid canonical domain %s',
    (domain) => {
      expect(() => canonicalBlogUrl({ domain }, 'a-post')).toThrow(
        'Tenant canonical domain is invalid'
      );
    }
  );

  it('fingerprints object-key ordering deterministically and binds the tenant', () => {
    expect(contentPublishFingerprint({ a: 1, b: { c: 2, d: 3 } })).toBe(
      contentPublishFingerprint({ b: { d: 3, c: 2 }, a: 1 })
    );
    expect(contentPublishFingerprint({ tenantId: 'tenant-a' })).not.toBe(
      contentPublishFingerprint({ tenantId: 'tenant-b' })
    );
  });
});

describe('content receiver dry-run inspection guard', () => {
  it('requires dry-run and at least one exact tenant', () => {
    expect(() => parseInspectionArgs(['--tenant=tenant-a'])).toThrow('--dry-run');
    expect(() => parseInspectionArgs(['--dry-run'])).toThrow('--tenant');
    expect(() => parseInspectionArgs(['--dry-run', '--tenant=Tenant-A'])).toThrow(
      'lowercase tenant slug'
    );
  });

  it('rejects apply/unknown flags and duplicate tenant targets', () => {
    expect(() =>
      parseInspectionArgs(['--dry-run', '--tenant=tenant-a', '--apply'])
    ).toThrow('Unsupported argument');
    expect(() =>
      parseInspectionArgs(['--dry-run', '--tenant=tenant-a', '--tenant=tenant-a'])
    ).toThrow('unique exact');
  });

  it('accepts only tenants in the exact configured allowlist', () => {
    expect(parseInspectionArgs(['--dry-run', '--tenant=tenant-a'])).toEqual({
      dryRun: true,
      tenants: ['tenant-a'],
    });
    expect(() => assertInspectionAllowlist(['tenant-b'], ['tenant-a'])).toThrow(
      'must be present'
    );
    expect(() => assertInspectionAllowlist(['tenant-a'], [])).toThrow(
      'must be configured'
    );
    expect(() => assertInspectionAllowlist(['tenant-a'], ['tenant-a', 'tenant-a'])).toThrow(
      'is invalid'
    );
    expect(() => assertInspectionAllowlist(['tenant-a'], ['tenant-a'])).not.toThrow();
  });
});
