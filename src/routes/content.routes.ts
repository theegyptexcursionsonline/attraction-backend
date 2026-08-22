import { Request, Response, Router } from 'express';
import { env } from '../config';
import { authenticateContentEngine } from '../middleware/contentEngineAuth';
import {
  assertContentReceiverIndexesReady,
  ContentReceiverError,
  findBlogContentForTenant,
  publishBlogContent,
  resolveContentTenant,
} from '../services/contentReceiver.service';
import {
  ContentBlogPublishRequestSchema,
  ContentSlugSchema,
  ContentTenantIdSchema,
} from '../utils/contentReceiverContract';
import { sendError } from '../utils/response';

const router = Router();

// Every route below this boundary—including capability discovery and explicit
// unsupported-type failures—requires the dedicated receiver bearer token.
router.use(authenticateContentEngine);

function receiverError(res: Response, error: unknown): void {
  if (error instanceof ContentReceiverError) {
    if (error.code === 'CONTENT_RECEIVER_REQUEST_IN_PROGRESS') {
      res.setHeader('Retry-After', '2');
    }
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }
  sendError(res, 'Content receiver failed safely', 503);
}

/**
 * Code/config capability truth. Blog is the only current model + storefront
 * combination that satisfies the receiver contract. Readiness remains false
 * until the explicit database indexes and tenant allowlist exist.
 */
router.get('/capabilities', async (_req: Request, res: Response) => {
  let databaseMigrationReady = true;
  try {
    await assertContentReceiverIndexesReady();
  } catch {
    databaseMigrationReady = false;
  }
  const configuredTenants = env.contentEngineAllowedTenants;
  const configuredTenantSet = new Set(configuredTenants);
  const tenantAllowlistValid =
    configuredTenants.length > 0 &&
    configuredTenantSet.size === configuredTenants.length &&
    configuredTenants.every((tenant) => ContentTenantIdSchema.safeParse(tenant).success);
  res.json({
    contractVersion: 1,
    supportedTypes: ['blog'],
    unsupportedTypes: ['tour', 'destination', 'category'],
    requiredIdempotencyKey: 'uuid',
    transactionRequired: true,
    canonicalUrlScheme: 'https',
    tenantAllowlistConfigured: configuredTenants.length > 0,
    tenantAllowlistValid,
    configuredTenantCount: tenantAllowlistValid ? configuredTenantSet.size : 0,
    databaseMigrationReady,
    receiverConfigurationReady: tenantAllowlistValid && databaseMigrationReady,
  });
});

/**
 * Claim-before-effects receiver endpoint. The UUID receipt and tenant-scoped
 * blog upsert commit in one MongoDB transaction; completed calls replay the
 * exact canonical result.
 */
router.post('/blog', async (req: Request, res: Response) => {
  const parsed = ContentBlogPublishRequestSchema.safeParse({
    ...(req.body || {}),
    idempotencyKey: req.header('Idempotency-Key'),
  });
  if (!parsed.success) {
    sendError(
      res,
      'Content publish request violates the receiver contract',
      400,
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'request',
        message: issue.message,
      }))
    );
    return;
  }

  try {
    // Allowlist + active tenant lookup precede the publication receipt and blog
    // write, so a wrong tenant cannot leave either an audit or content effect.
    const tenant = await resolveContentTenant(parsed.data.tenantId);
    const published = await publishBlogContent(tenant, parsed.data);
    if (published.replayed) res.setHeader('Idempotency-Replayed', 'true');
    res.status(published.replayed ? 200 : 201).json(published.result);
  } catch (error) {
    receiverError(res, error);
  }
});

/** Slug-uniqueness preflight, scoped through the allowlisted tenant join. */
router.get('/blog/:slug', async (req: Request, res: Response) => {
  const tenantId = ContentTenantIdSchema.safeParse(req.query.tenantId);
  const slug = ContentSlugSchema.safeParse(req.params.slug);
  if (!tenantId.success || !slug.success) {
    sendError(res, 'A valid tenantId and slug are required', 400);
    return;
  }
  try {
    const tenant = await resolveContentTenant(tenantId.data);
    const doc = await findBlogContentForTenant(tenant, slug.data);
    if (!doc) {
      sendError(res, 'Not found', 404);
      return;
    }
    res.json({
      id: String(doc._id),
      slug: doc.slug,
      title: doc.title,
      isPublished: doc.status === 'published',
      defaultLocale: doc.defaultLocale || tenant.defaultLanguage,
      updatedAt: doc.updatedAt,
    });
  } catch (error) {
    receiverError(res, error);
  }
});

function unsupportedType(req: Request, res: Response): void {
  res.status(422).json({
    success: false,
    error: `Unsupported content receiver type: ${req.params.type}`,
    code: 'CONTENT_RECEIVER_TYPE_UNSUPPORTED',
    supportedTypes: ['blog'],
  });
}

router.all('/:type', unsupportedType);
router.all('/:type/*', unsupportedType);

export default router;
