import { z } from 'zod';

// Public identifiers select a widget; Search still verifies the embedding domain.
// This setting never carries an API key, client identity or domain authorization.
export const AI_SEARCH_WIDGET_ID_PATTERN = /^wgt_[A-Za-z0-9_-]{16,64}$/;

const widgetId = z.string().trim().max(68).refine(
  value => value === '' || AI_SEARCH_WIDGET_ID_PATTERN.test(value),
  'AI Search widget ID must look like wgt_…',
).nullable().transform(value => value ?? '');
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
    languages: languages.optional(),
    buttonPosition: z.string().max(100).optional(),
  }).strict().optional(),
  searchWidget: z.object({
    enabled: z.boolean().optional(),
    widgetId: widgetId.optional(),
    placeholder: z.string().max(500).optional(),
    showPopularSearches: z.boolean().optional(),
    maxSuggestions: z.number().int().min(1).max(20).optional(),
  }).strict().optional(),
}).strict();

/** Atomic leaf updates preserve other AI integrations and concurrent fields. */
export function aiSettingsSetPaths(settings: z.infer<typeof aiSettingsUpdateSchema>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(settings).flatMap(([group, fields]) =>
    Object.entries(fields || {}).filter(([, value]) => value !== undefined)
      .map(([field, value]) => [`aiSettings.${group}.${field}`, value]),
  ));
}

/** Legacy/raw Mongo documents must not publish unknown credentials or policy fields. */
export function publicAiSettings(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, unknown> = {};
  for (const [group, optionalSchema] of Object.entries(aiSettingsUpdateSchema.shape)) {
    const fields = (value as Record<string, unknown>)[group];
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
    const publicFields: Record<string, unknown> = {};
    for (const [field, schema] of Object.entries(optionalSchema.unwrap().shape)) {
      const raw = (fields as Record<string, unknown>)[field];
      if (raw === undefined) continue;
      const parsed = schema.safeParse(raw);
      if (parsed.success) publicFields[field] = parsed.data;
    }
    result[group] = publicFields;
  }
  return result;
}
