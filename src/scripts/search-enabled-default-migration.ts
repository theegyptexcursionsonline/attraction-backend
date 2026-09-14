import type { Collection, Document, ObjectId } from 'mongodb';
import { AI_SEARCH_WIDGET_ID_PATTERN } from '../utils/aiSettings';

/*
 * `aiSettings.searchWidget.enabled` used to default to true; it now defaults to false. Records
 * that never stored the switch are read as "on exactly when a widget id exists" (utils/aiSettings
 * aiProductState). This migration writes that same value explicitly, so nothing a visitor sees
 * changes. It is verify-first: plan reads only, apply re-checks each record in its write filter,
 * and rollback removes only values this run wrote that nobody has changed since.
 */

export interface SearchEnabledTarget { id: string; slug: string; widgetId?: string }
export interface SearchEnabledPlan {
  setTrue: SearchEnabledTarget[];
  setFalse: SearchEnabledTarget[];
  /** Records whose searchWidget is not an object (legacy boolean shape); left for a person to look at. */
  blocked: Array<SearchEnabledTarget & { reason: string }>;
}
export interface SearchEnabledReceipt {
  mode: 'apply';
  at: string;
  database: string;
  setTrue: SearchEnabledTarget[];
  setFalse: SearchEnabledTarget[];
  skipped: Array<SearchEnabledTarget & { reason: string }>;
}
export interface SearchEnabledRollbackResult { restored: string[]; skipped: Array<{ id: string; reason: string }> }

const MISSING_SWITCH = { 'aiSettings.searchWidget.enabled': { $exists: false } };

export async function planSearchEnabledMigration(tenants: Collection<Document>): Promise<SearchEnabledPlan> {
  const plan: SearchEnabledPlan = { setTrue: [], setFalse: [], blocked: [] };
  const cursor = tenants.find(MISSING_SWITCH, { projection: { slug: 1, 'aiSettings.searchWidget': 1 } }).sort({ _id: 1 });
  for await (const tenant of cursor) {
    const target: SearchEnabledTarget = { id: String(tenant._id), slug: String(tenant.slug ?? '') };
    const aiSettings = tenant.aiSettings;
    const searchWidget = aiSettings?.searchWidget;
    if ((aiSettings !== undefined && (aiSettings === null || typeof aiSettings !== 'object' || Array.isArray(aiSettings)))
      || (searchWidget !== undefined && (searchWidget === null || typeof searchWidget !== 'object' || Array.isArray(searchWidget)))) {
      plan.blocked.push({ ...target, reason: 'aiSettings.searchWidget is not an object' });
      continue;
    }
    const widgetId = typeof searchWidget?.widgetId === 'string' ? searchWidget.widgetId.trim() : '';
    if (AI_SEARCH_WIDGET_ID_PATTERN.test(widgetId)) plan.setTrue.push({ ...target, widgetId });
    else plan.setFalse.push(target);
  }
  return plan;
}

export async function applySearchEnabledMigration(
  tenants: Collection<Document>,
  plan: SearchEnabledPlan,
  context: { database: string; now?: Date; toObjectId: (id: string) => ObjectId },
): Promise<SearchEnabledReceipt> {
  const receipt: SearchEnabledReceipt = { mode: 'apply', at: (context.now ?? new Date()).toISOString(), database: context.database, setTrue: [], setFalse: [], skipped: [] };
  for (const [value, targets] of [[true, plan.setTrue], [false, plan.setFalse]] as const) {
    for (const target of targets) {
      // The id the plan saw must still be there (or still absent), and the switch still unset.
      const filter: Document = { _id: context.toObjectId(target.id), ...MISSING_SWITCH };
      if (value) filter['aiSettings.searchWidget.widgetId'] = target.widgetId;
      else filter.$nor = [{ 'aiSettings.searchWidget.widgetId': AI_SEARCH_WIDGET_ID_PATTERN }];
      const result = await tenants.updateOne(filter, { $set: { 'aiSettings.searchWidget.enabled': value } });
      if (result.modifiedCount === 1) (value ? receipt.setTrue : receipt.setFalse).push(target);
      else receipt.skipped.push({ ...target, reason: 'changed since the plan was read' });
    }
  }
  return receipt;
}

export async function rollbackSearchEnabledMigration(
  tenants: Collection<Document>,
  receipt: SearchEnabledReceipt,
  toObjectId: (id: string) => ObjectId,
): Promise<SearchEnabledRollbackResult> {
  if (receipt?.mode !== 'apply' || !Array.isArray(receipt.setTrue) || !Array.isArray(receipt.setFalse) || Number.isNaN(Date.parse(receipt.at))) {
    throw new Error('Not an apply receipt from migrate-enabled-default');
  }
  const appliedAt = new Date(receipt.at);
  const result: SearchEnabledRollbackResult = { restored: [], skipped: [] };
  for (const [value, targets] of [[true, receipt.setTrue], [false, receipt.setFalse]] as const) {
    for (const target of targets) {
      const update = await tenants.updateOne({
        _id: toObjectId(target.id),
        'aiSettings.searchWidget.enabled': value,
        // A super admin switch made after the migration is newer intent; keep it.
        $or: [{ 'aiSettings.searchWidget.updatedAt': { $exists: false } }, { 'aiSettings.searchWidget.updatedAt': { $lte: appliedAt } }],
      }, { $unset: { 'aiSettings.searchWidget.enabled': '' } });
      if (update.modifiedCount === 1) result.restored.push(target.id);
      else result.skipped.push({ id: target.id, reason: 'switch changed since the migration' });
    }
  }
  return result;
}
