import mongoose, { Schema, Types } from 'mongoose';

/**
 * User log: who on the admin team did what, when, from where.
 *
 * Every create / change / delete an admin account makes through the API is written here by
 * `auditTrail` (middleware/audit.middleware), and sign-in events are written by the auth
 * controller. Entries are append-only from the application's point of view and expire after
 * `AUDIT_RETENTION_DAYS`. Request bodies are never stored: an entry names the action and the
 * record, not its content, so passwords, card data and traveller details never land here.
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
