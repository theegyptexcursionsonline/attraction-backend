import { z } from 'zod';

// Public identifiers select a widget; Search still verifies the embedding domain.
// This setting never carries an API key, client identity or domain authorization.
export const AI_SEARCH_WIDGET_ID_PATTERN = /^wgt_[A-Za-z0-9_-]{16,64}$/;
// A Foxes Voice widget is addressed by its WidgetConfig ObjectId.
export const VOICE_WIDGET_ID_PATTERN = /^[a-f0-9]{24}$/;

const widgetId = z.string().trim().max(68).refine(
  value => value === '' || AI_SEARCH_WIDGET_ID_PATTERN.test(value),
  'AI Search widget ID must look like wgt_…',
).nullable().transform(value => value ?? '');
const voiceWidgetId = z.string().trim().toLowerCase().max(24).refine(
  value => value === '' || VOICE_WIDGET_ID_PATTERN.test(value),
  'Voice widget ID must be a 24-character widget id',
).nullable().transform(value => value ?? '');
// Where the storefront shows the launcher: 'browse' = home, catalogue listings and destination
// pages; 'all' = also tour pages and information pages. Checkout and account pages never show it.
export const AI_SEARCH_DISPLAY_PAGES = ['browse', 'all'] as const;
const languages = z.array(z.string().min(1).max(35)).max(50);

export const aiSettingsUpdateSchema = z.object({
  bookingWidget: z.object({
    enabled: z.boolean().optional(),
    position: z.string().max(100).optional(),
    primaryColor: z.string().max(100).optional(),
    welcomeMessage: z.string().max(5000).optional(),
    languages: languages.optional(),
    autoOpen: z.boolean().optional(),
  }).strict().optional(),
  voiceAgent: z.object({
    enabled: z.boolean().optional(),
    widgetId: voiceWidgetId.optional(),
    languages: languages.optional(),
    buttonPosition: z.string().max(100).optional(),
  }).strict().optional(),
  searchWidget: z.object({
    enabled: z.boolean().optional(),
    widgetId: widgetId.optional(),
    placeholder: z.string().max(500).optional(),
    showPopularSearches: z.boolean().optional(),
    maxSuggestions: z.number().int().min(1).max(20).optional(),
    displayPages: z.enum(AI_SEARCH_DISPLAY_PAGES).optional(),
  }).strict().optional(),
}).strict();

/** Atomic leaf updates preserve other AI integrations and concurrent fields. */
export function aiSettingsSetPaths(settings: z.infer<typeof aiSettingsUpdateSchema>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(settings).flatMap(([group, fields]) =>
    Object.entries(fields || {}).filter(([, value]) => value !== undefined)
      .map(([field, value]) => [`aiSettings.${group}.${field}`, value]),
  ));
}

/*
 * AI Search and Voice are Foxes products. Whether a site runs one, and which widget it
 * loads, is decided by a super admin through PATCH /tenants/:id/ai-products; every other
 * write path refuses to change these two fields. Presentation fields stay site-editable.
 */
export const AI_PRODUCTS = ['search', 'voice'] as const;
export type AiProduct = typeof AI_PRODUCTS[number];
export const AI_PRODUCT_GROUPS = { search: 'searchWidget', voice: 'voiceAgent' } as const;
export const AI_PRODUCT_CONTROL_FIELDS = ['enabled', 'widgetId'] as const;
const AI_PRODUCT_AUDIT_FIELDS = ['updatedBy', 'updatedAt'] as const;
const AI_PRODUCT_ID_PATTERNS: Record<AiProduct, RegExp> = { search: AI_SEARCH_WIDGET_ID_PATTERN, voice: VOICE_WIDGET_ID_PATTERN };
const AI_PRODUCT_LABELS: Record<AiProduct, string> = { search: 'AI Search', voice: 'Voice' };

export interface AiProductState { enabled: boolean; widgetId: string | null }

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/**
 * The effective switch and id stored for a product. Search used to default to on, and only a
 * saved widget id made it live; a record that never stored the switch keeps that meaning (on
 * exactly when it has an id) until migrate-enabled-default writes the value explicitly.
 */
export function aiProductState(aiSettings: unknown, product: AiProduct): AiProductState {
  const fields = asRecord(asRecord(aiSettings)?.[AI_PRODUCT_GROUPS[product]]) ?? {};
  const rawId = typeof fields.widgetId === 'string' ? fields.widgetId.trim() : '';
  const widgetId = AI_PRODUCT_ID_PATTERNS[product].test(rawId) ? rawId : null;
  const enabled = typeof fields.enabled === 'boolean' ? fields.enabled : product === 'search' && widgetId !== null;
  return { enabled, widgetId };
}

export const isAiProductLive = (state: AiProductState): boolean => state.enabled && state.widgetId !== null;

/** Legacy/raw Mongo documents must not publish unknown credentials or policy fields. */
export function publicAiSettings(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, unknown> = {};
  const productGroups = new Set<string>(Object.values(AI_PRODUCT_GROUPS));
  for (const [group, optionalSchema] of Object.entries(aiSettingsUpdateSchema.shape)) {
    const fields = (value as Record<string, unknown>)[group];
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
    const publicFields: Record<string, unknown> = {};
    for (const [field, schema] of Object.entries(optionalSchema.unwrap().shape)) {
      // A product's switch and id are published only as a live pair, below.
      if (productGroups.has(group) && (AI_PRODUCT_CONTROL_FIELDS as readonly string[]).includes(field)) continue;
      const raw = (fields as Record<string, unknown>)[field];
      if (raw === undefined) continue;
      const parsed = schema.safeParse(raw);
      if (parsed.success) publicFields[field] = parsed.data;
    }
    result[group] = publicFields;
  }
  for (const product of AI_PRODUCTS) {
    const group = AI_PRODUCT_GROUPS[product];
    const state = aiProductState(value, product);
    if (result[group] && isAiProductLive(state)) Object.assign(result[group] as object, { enabled: true, widgetId: state.widgetId });
  }
  return result;
}

/**
 * Admin read of aiSettings: the product switches carry their effective value, and only super
 * admins see who changed them.
 */
export function adminAiSettings(value: unknown, options: { includeAudit: boolean }): unknown {
  const settings = asRecord(value);
  if (!settings) return value;
  const result: Record<string, unknown> = { ...settings };
  for (const product of AI_PRODUCTS) {
    const group = AI_PRODUCT_GROUPS[product];
    const fields = asRecord(settings[group]);
    if (!fields) continue;
    const next: Record<string, unknown> = { ...fields, enabled: aiProductState(settings, product).enabled };
    if (!options.includeAudit) for (const field of AI_PRODUCT_AUDIT_FIELDS) delete next[field];
    result[group] = next;
  }
  return result;
}

export interface AdminAiProduct extends AiProductState {
  live: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}
export interface AdminAiProducts { revision: number; search: AdminAiProduct; voice: AdminAiProduct }

export const aiProductsRevisionOf = (tenant: unknown): number => {
  const revision = asRecord(tenant)?.aiProductsRevision;
  return typeof revision === 'number' && Number.isInteger(revision) && revision >= 0 ? revision : 0;
};

export function adminAiProducts(tenant: unknown): AdminAiProducts {
  const aiSettings = asRecord(tenant)?.aiSettings;
  const product = (key: AiProduct): AdminAiProduct => {
    const state = aiProductState(aiSettings, key);
    const fields = asRecord(asRecord(aiSettings)?.[AI_PRODUCT_GROUPS[key]]) ?? {};
    const updatedAt = fields.updatedAt instanceof Date ? fields.updatedAt.toISOString()
      : typeof fields.updatedAt === 'string' ? fields.updatedAt : null;
    return { ...state, live: isAiProductLive(state), updatedBy: fields.updatedBy ? String(fields.updatedBy) : null, updatedAt };
  };
  return { revision: aiProductsRevisionOf(tenant), search: product('search'), voice: product('voice') };
}

const productPatch = <T extends z.ZodTypeAny>(id: T) =>
  z.object({ enabled: z.boolean().optional(), widgetId: id.optional() }).strict();

export const aiProductsUpdateSchema = z.object({
  expectedRevision: z.number().int().min(0),
  search: productPatch(widgetId).optional(),
  voice: productPatch(voiceWidgetId).optional(),
}).strict().refine(body => body.search !== undefined || body.voice !== undefined, 'Send search or voice settings');
export type AiProductsUpdate = z.infer<typeof aiProductsUpdateSchema>;

export interface AiProductChange { product: AiProduct; before: AiProductState; after: AiProductState }

/** The resulting state of each product in the request; a product can only be on with a valid id. */
export function planAiProductsUpdate(aiSettings: unknown, body: AiProductsUpdate): { error: string } | { changes: AiProductChange[] } {
  const changes: AiProductChange[] = [];
  for (const product of AI_PRODUCTS) {
    const patch = body[product];
    if (!patch) continue;
    const before = aiProductState(aiSettings, product);
    const after: AiProductState = {
      enabled: patch.enabled ?? before.enabled,
      widgetId: patch.widgetId === undefined ? before.widgetId : patch.widgetId || null,
    };
    if (after.enabled && !after.widgetId) {
      return { error: `${AI_PRODUCT_LABELS[product]} needs a valid widget ID before it can be switched on` };
    }
    if (after.enabled !== before.enabled || after.widgetId !== before.widgetId) changes.push({ product, before, after });
  }
  return { changes };
}

export function aiProductsUpdateOperators(changes: AiProductChange[], actorId: unknown, now: Date) {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = {};
  for (const { product, after } of changes) {
    const prefix = `aiSettings.${AI_PRODUCT_GROUPS[product]}`;
    $set[`${prefix}.enabled`] = after.enabled;
    if (after.widgetId) $set[`${prefix}.widgetId`] = after.widgetId;
    else $unset[`${prefix}.widgetId`] = '';
    $set[`${prefix}.updatedBy`] = actorId;
    $set[`${prefix}.updatedAt`] = now;
  }
  return { $set, ...(Object.keys($unset).length ? { $unset } : {}), $inc: { aiProductsRevision: 1 } };
}

/**
 * Settings writes carry the whole AI form, switches included, from admin builds that predate
 * the AI products endpoint. Values equal to what is stored are dropped; any real change to a
 * switch or id is reported so the caller can refuse it.
 */
export function splitAiProductControls(
  current: unknown,
  settings: z.infer<typeof aiSettingsUpdateSchema>,
): { settings: z.infer<typeof aiSettingsUpdateSchema>; changed: AiProduct[] } {
  const next = { ...settings } as Record<string, Record<string, unknown> | undefined>;
  const changed: AiProduct[] = [];
  for (const product of AI_PRODUCTS) {
    const group = AI_PRODUCT_GROUPS[product];
    const fields = next[group];
    if (!fields) continue;
    const state = aiProductState(current, product);
    const { enabled, widgetId: sentId, ...presentation } = fields;
    const idChanged = sentId !== undefined && ((sentId as string) || null) !== state.widgetId;
    if ((enabled !== undefined && enabled !== state.enabled) || idChanged) changed.push(product);
    next[group] = presentation;
  }
  return { settings: next as z.infer<typeof aiSettingsUpdateSchema>, changed };
}

export function hasAiProductControls(settings: unknown): boolean {
  const record = asRecord(settings);
  return AI_PRODUCTS.some(product => {
    const fields = asRecord(record?.[AI_PRODUCT_GROUPS[product]]);
    return !!fields && AI_PRODUCT_CONTROL_FIELDS.some(field => fields[field] !== undefined);
  });
}
