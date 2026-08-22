import mongoose, { Types } from 'mongoose';
import { env } from '../config/env';
import {
  canonicalBlogUrl,
  ContentLocaleSchema,
  ContentTenantIdSchema,
} from '../utils/contentReceiverContract';

type InspectionArgs = { dryRun: true; tenants: string[] };

export function parseInspectionArgs(args: string[]): InspectionArgs {
  if (!args.includes('--dry-run')) {
    throw new Error('Refusing to inspect without the explicit --dry-run guard');
  }
  const unknown = args.filter(
    (arg) => arg !== '--dry-run' && !arg.startsWith('--tenant=')
  );
  if (unknown.length > 0) throw new Error(`Unsupported argument: ${unknown[0]}`);
  const tenants = args
    .filter((arg) => arg.startsWith('--tenant='))
    .map((arg) => arg.slice('--tenant='.length));
  if (tenants.length === 0) {
    throw new Error('At least one exact --tenant=<slug> is required');
  }
  const unique = new Set<string>();
  for (const tenant of tenants) {
    if (!ContentTenantIdSchema.safeParse(tenant).success || unique.has(tenant)) {
      throw new Error('Every --tenant value must be a unique exact lowercase tenant slug');
    }
    unique.add(tenant);
  }
  return { dryRun: true, tenants };
}

export function assertInspectionAllowlist(
  tenants: string[],
  configuredAllowlist: string[]
): void {
  if (configuredAllowlist.length === 0) {
    throw new Error('CONTENT_ENGINE_ALLOWED_TENANTS must be configured before inspection');
  }
  const allowed = new Set<string>();
  for (const tenant of configuredAllowlist) {
    if (!ContentTenantIdSchema.safeParse(tenant).success || allowed.has(tenant)) {
      throw new Error('CONTENT_ENGINE_ALLOWED_TENANTS is invalid');
    }
    allowed.add(tenant);
  }
  if (tenants.some((tenant) => !allowed.has(tenant))) {
    throw new Error('Every inspected tenant must be present in CONTENT_ENGINE_ALLOWED_TENANTS');
  }
}

type RawTenant = {
  _id: Types.ObjectId;
  slug: string;
  domain: string;
  customDomain?: string;
  domainMigrated?: boolean;
  customDomainStatus?: string;
  defaultLanguage?: string;
  supportedLanguages?: string[];
  status?: string;
};

type RawIndex = { key?: Record<string, number>; unique?: boolean; name?: string };

function hasExactUniqueIndex(indexes: RawIndex[], expected: Record<string, number>): boolean {
  const expectedEntries = Object.entries(expected);
  return indexes.some((index) => {
    const entries = Object.entries(index.key || {});
    return (
      index.unique === true &&
      entries.length === expectedEntries.length &&
      expectedEntries.every(([key, value], position) => {
        const actual = entries[position];
        return actual?.[0] === key && actual?.[1] === value;
      })
    );
  });
}

async function collectionIndexes(name: string): Promise<RawIndex[]> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is unavailable');
  try {
    return (await db.collection(name).indexes()) as RawIndex[];
  } catch (error) {
    const codeName = (error as { codeName?: string }).codeName;
    if (codeName === 'NamespaceNotFound') return [];
    throw error;
  }
}

async function inspect(): Promise<void> {
  const args = parseInspectionArgs(process.argv.slice(2));
  assertInspectionAllowlist(args.tenants, env.contentEngineAllowedTenants);

  // This executable has no apply mode and disables automatic collection/index
  // creation before connecting. All operations below are reads.
  mongoose.set('autoCreate', false);
  mongoose.set('autoIndex', false);
  await mongoose.connect(env.mongodbUri, { autoCreate: false, autoIndex: false });
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection is unavailable');
    const [hello, blogIndexes, publicationIndexes] = await Promise.all([
      db.admin().command({ hello: 1 }),
      collectionIndexes('blogposts'),
      collectionIndexes('contentpublications'),
    ]);
    const transactionsSupported = Boolean(
      hello.logicalSessionTimeoutMinutes && (hello.setName || hello.msg === 'isdbgrid')
    );
    const blogTenantSlugUnique = hasExactUniqueIndex(blogIndexes, {
      tenantId: 1,
      slug: 1,
    });
    const publicationIdempotencyUnique = hasExactUniqueIndex(publicationIndexes, {
      idempotencyKey: 1,
    });

    const tenantReports = [];
    for (const slug of args.tenants) {
      const tenant = (await db.collection<RawTenant>('tenants').findOne(
        { slug },
        {
          projection: {
            _id: 1,
            slug: 1,
            domain: 1,
            customDomain: 1,
            domainMigrated: 1,
            customDomainStatus: 1,
            defaultLanguage: 1,
            supportedLanguages: 1,
            status: 1,
          },
        }
      )) as RawTenant | null;
      if (!tenant) {
        tenantReports.push({ slug, exists: false, ready: false });
        continue;
      }

      const defaultLocale = tenant.defaultLanguage || '';
      const configuredLocales = tenant.supportedLanguages || [];
      const supportedLocales = new Set(configuredLocales);
      const localeContractValid =
        ContentLocaleSchema.safeParse(defaultLocale).success &&
        supportedLocales.has(defaultLocale) &&
        supportedLocales.size === configuredLocales.length &&
        Array.from(supportedLocales).every(
          (locale) => ContentLocaleSchema.safeParse(locale).success
        );
      let canonicalUrl: string | null = null;
      try {
        canonicalUrl = canonicalBlogUrl(tenant, 'receiver-readiness-check');
      } catch {
        canonicalUrl = null;
      }

      const tenantFilter = { tenantId: tenant.slug };
      const [
        postCount,
        missingTenantRef,
        conflictingTenantRef,
        missingDefaultLocale,
        duplicateSlugs,
      ] = await Promise.all([
        db.collection('blogposts').countDocuments(tenantFilter),
        db.collection('blogposts').countDocuments({
          ...tenantFilter,
          $or: [{ tenantRef: { $exists: false } }, { tenantRef: null }],
        }),
        db.collection('blogposts').countDocuments({
          ...tenantFilter,
          tenantRef: { $exists: true, $ne: tenant._id },
        }),
        db.collection('blogposts').countDocuments({
          ...tenantFilter,
          $or: [{ defaultLocale: { $exists: false } }, { defaultLocale: '' }],
        }),
        db
          .collection('blogposts')
          .aggregate([
            { $match: tenantFilter },
            { $group: { _id: '$slug', count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
            { $limit: 100 },
          ])
          .toArray(),
      ]);
      const ready =
        tenant.status === 'active' &&
        localeContractValid &&
        canonicalUrl !== null &&
        conflictingTenantRef === 0 &&
        duplicateSlugs.length === 0;
      tenantReports.push({
        slug,
        exists: true,
        status: tenant.status,
        defaultLocale,
        supportedLocales: Array.from(supportedLocales),
        canonicalUrl,
        postCount,
        migrationPreview: {
          missingTenantRef,
          conflictingTenantRef,
          missingDefaultLocale,
          duplicateSlugs: duplicateSlugs.map((entry) => entry._id),
        },
        ready,
      });
    }

    const ready =
      transactionsSupported &&
      blogTenantSlugUnique &&
      publicationIdempotencyUnique &&
      tenantReports.every((tenant) => tenant.ready === true);
    process.stdout.write(
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          mode: 'dry-run',
          writesPerformed: 0,
          requestedTenants: args.tenants,
          database: {
            transactionsSupported,
            indexes: {
              blogTenantSlugUnique,
              publicationIdempotencyUnique,
            },
          },
          tenants: tenantReports,
          ready,
        },
        null,
        2
      )}\n`
    );
    if (!ready) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  void inspect().catch(async (error) => {
    process.stderr.write(
      `Content receiver migration inspection failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }\n`
    );
    process.exitCode = 1;
    await mongoose.disconnect();
  });
}
