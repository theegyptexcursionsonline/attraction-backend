import mongoose, { Schema, Types } from 'mongoose';
import { AUDIT_SUBJECTS, AUDIT_VERBS, MAX_CHANGED_FIELDS, MAX_CHANGES, type AuditChange } from '../services/auditSubjects';

/**
 * User log: who on the admin team did what, when, from where.
 *
 * Every create / change / delete an admin account makes through the API is written here by
 * `auditTrail` (middleware/audit.middleware), and sign-in events are written by the auth
 * controller. Entries are append-only from the application's point of view and expire after
 * `AUDIT_RETENTION_DAYS`. Request bodies are never stored. An entry names the action, the record
 * (its name at the time) and, for allow-listed fields only, what changed (services/auditSubjects):
 * passwords, tokens, 2FA, card data and traveller contact details never land here.
 */
export const AUDIT_RETENTION_DAYS = 400;

export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.two_factor_failed',
  'auth.logout',
  'auth.password_changed',
  'record.create',
  'record.update',
  'record.delete',
  'record.export',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface IAuditLog {
  _id: Types.ObjectId;
  action: AuditAction;
  outcome: 'success' | 'failure';
  actorId?: Types.ObjectId;
  actorEmail: string;
  actorName?: string;
  actorRole?: string;
  method?: string;
  path?: string;
  resource?: string;
  resourceId?: string;
  tenantId?: Types.ObjectId;
  /** The kind of record and what was done to it (`tour` + `update`), the record's name then, a plain summary. */
  subject?: string;
  verb?: string;
  resourceLabel?: string;
  summary?: string;
  /** Before → after for allow-listed fields; `changedFields` names fields whose values are never kept. */
  changes?: AuditChange[];
  changedFields?: string[];
  statusCode?: number;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    outcome: { type: String, enum: ['success', 'failure'], required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorEmail: { type: String, required: true, lowercase: true, trim: true },
    actorName: { type: String, trim: true },
    actorRole: { type: String },
    method: { type: String },
    path: { type: String, maxlength: 300 },
    resource: { type: String, maxlength: 60 },
    resourceId: { type: String, maxlength: 64 },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    subject: { type: String, enum: AUDIT_SUBJECTS },
    verb: { type: String, enum: AUDIT_VERBS },
    resourceLabel: { type: String, trim: true, maxlength: 160 },
    summary: { type: String, maxlength: 300 },
    changes: {
      type: [new Schema<AuditChange>({
        field: { type: String, required: true, maxlength: 80 },
        before: { type: Schema.Types.Mixed },
        after: { type: Schema.Types.Mixed },
      }, { _id: false })],
      default: undefined,
      validate: (value: unknown[] | undefined) => !value || value.length <= MAX_CHANGES,
    },
    changedFields: {
      type: [{ type: String, maxlength: 80 }],
      default: undefined,
      validate: (value: unknown[] | undefined) => !value || value.length <= MAX_CHANGED_FIELDS,
    },
    statusCode: { type: Number },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 300 },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: AUDIT_RETENTION_DAYS * 24 * 60 * 60 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
