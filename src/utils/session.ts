import { IUser } from '../types';
import { createHash } from 'crypto';
import type { FilterQuery, Model, Types } from 'mongoose';

const FACTOR_ROLES = new Set(['super-admin', 'brand-admin', 'manager', 'editor', 'viewer']);
export const requiresLocalFactor = (user: Pick<IUser, 'role' | 'twoFactorEnabled'>): boolean =>
  FACTOR_ROLES.has(user.role) || user.twoFactorEnabled === true;
export const factorProofAllows = (user: Pick<IUser, 'role' | 'twoFactorEnabled'>, proof: { mfaVerified?: unknown }): boolean =>
  !requiresLocalFactor(user) || (user.twoFactorEnabled === true && proof.mfaVerified === true);

export const sessionEpoch = (value: unknown): number => {
  if (value === undefined || value === null) return 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid account session epoch');
  return value;
};

export type AccountAuthority = Pick<IUser, '_id' | 'email' | 'password' | 'role' | 'status' | 'assignedTenants' |
  'sectionAccess' | 'tokenVersion' | 'twoFactorEnabled' | 'twoFactorSecretEnc'>;
export const exactStoredValue = (value: unknown) => value === undefined ? { $exists: false } : { $exists: true, $eq: value };

/** Use a lean/raw snapshot. Defaults must not turn missing persisted fields into
 * permissive predicates or overwrite a security change after async validation.
 */
export const accountAuthorityFilter = (user: AccountAuthority): FilterQuery<IUser> => ({
  _id: user._id,
  ...Object.fromEntries(['email', 'password', 'role', 'status', 'assignedTenants', 'sectionAccess', 'tokenVersion',
    'twoFactorEnabled', 'twoFactorSecretEnc'].map(field => [field, exactStoredValue(user[field as keyof AccountAuthority])])),
});

/** Bind a challenge to the authority checked at its password step. Pending
 * enrollment and refresh rotation are separate state, so neither is hashed.
 */
export const accountAuthorityHash = (user: AccountAuthority): string => createHash('sha256').update(JSON.stringify({
  id: String(user._id), email: user.email, password: user.password ?? null,
  role: user.role === undefined ? 'customer' : user.role, status: user.status === undefined ? 'active' : user.status,
  tenants: (user.assignedTenants || []).map(String).sort(), sections: user.sectionAccess ? [...user.sectionAccess].sort() : null,
  epoch: sessionEpoch(user.tokenVersion), factor: user.twoFactorEnabled === true, secret: user.twoFactorSecretEnc ?? null,
})).digest('hex');

/** Existing readers interpret a legacy null epoch as zero. Normalize only that
 * representation; the exact type guard cannot overwrite any numeric epoch.
 * Revocation itself remains the later atomic increment with its owning write.
 */
export const normalizeLegacySessionEpoch = async (model: Model<IUser>, userId: Types.ObjectId): Promise<void> => {
  await model.updateOne({ _id: userId, tokenVersion: { $type: 10 } }, { $set: { tokenVersion: 0 } });
};

export const revokeUserSessions = async (user: IUser): Promise<void> => {
  if (user.tokenVersion === null) await normalizeLegacySessionEpoch(user.constructor as Model<IUser>, user._id);
  user.refreshToken = undefined;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.twoFactorChallengeHash = undefined;
  user.twoFactorChallengeExpires = undefined;
  user.twoFactorPendingSecretEnc = undefined;
  user.twoFactorSetupExpires = undefined;
  // A stale document may have read these paths while absent. Force the unsets
  // so a capability issued since that read cannot survive this revocation.
  for (const field of ['refreshToken', 'passwordResetToken', 'passwordResetExpires', 'twoFactorChallengeHash',
    'twoFactorChallengeExpires', 'twoFactorPendingSecretEnc', 'twoFactorSetupExpires']) user.markModified(field);
  // Persist a delta, not a stale document's absolute epoch. After concurrent
  // writes this instance may still show an old value; never mint a new session
  // from it without reloading authoritative state.
  user.$inc('tokenVersion', 1);
};
