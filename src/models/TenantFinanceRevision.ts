import { Schema, model, Types } from 'mongoose';
import { FinanceFees, FinanceLocks, financeFeesSchema, financeLocksSchema } from '../utils/financeSettings';

interface Revision { tenantId: Types.ObjectId; revision: number; fees: FinanceFees; locks?: FinanceLocks; actorId: Types.ObjectId; createdAt: Date }
const schema = new Schema<Revision>({
  tenantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  revision: { type: Number, required: true, min: 1, immutable: true },
  fees: { type: Schema.Types.Mixed, required: true, immutable: true, validate: (value: unknown) => financeFeesSchema.safeParse(value).success },
  // Which fees the platform had locked for the website at this revision (absent before locks existed).
  locks: { type: Schema.Types.Mixed, immutable: true, validate: (value: unknown) => value === undefined || financeLocksSchema.safeParse(value).success },
  actorId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  createdAt: { type: Date, required: true, default: Date.now, immutable: true },
}, { versionKey: false });
schema.index({ tenantId: 1, revision: 1 }, { unique: true });
export const TenantFinanceRevision = model<Revision>('TenantFinanceRevision', schema);
