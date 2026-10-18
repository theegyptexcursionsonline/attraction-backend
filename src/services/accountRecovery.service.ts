import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { IUser } from '../types';
import { generateRandomToken, hashToken } from '../utils/hash';

export type AccountRecoveryMode = 'reset' | 'invitation';
export type AccountRecoveryResult = { kind: 'updated'; user: IUser } | { kind: 'invalid' | 'not_pending' };

type RecoveryIssuerSnapshot = Pick<IUser, '_id' | 'email' | 'role' | 'status' | 'assignedTenants' |
  'tokenVersion' | 'passwordResetToken' | 'passwordResetExpires'>;
// Read issuer snapshots with lean(): hydration defaults are not persisted state.
export const RECOVERY_ISSUER_FIELDS = '_id email firstName lastName role status assignedTenants tokenVersion passwordResetToken passwordResetExpires';
const exactStored = (value: unknown) => value === undefined ? { $exists: false } : { $exists: true, $eq: value };

/** Replace a recovery capability only while the originally authorized account
 * context and prior capability still match. Late issuers cannot undo revocation,
 * and competing issuers from one snapshot cannot return two successful links.
 */
export const issueAccountRecovery = async (user: RecoveryIssuerSnapshot, mode: AccountRecoveryMode) => {
  if ((mode === 'reset' && user.status !== 'active') || (mode === 'invitation' && user.status !== 'pending') ||
    !['reset', 'invitation'].includes(mode)) return null;
  const token = generateRandomToken();
  const expiresAt = new Date(Date.now() + (mode === 'invitation' ? 7 * 24 : 1) * 60 * 60 * 1000);
  const result = await User.updateOne({
    _id: user._id,
    email: user.email,
    role: user.role,
    status: user.status,
    assignedTenants: exactStored(user.assignedTenants),
    tokenVersion: exactStored(user.tokenVersion),
    passwordResetToken: exactStored(user.passwordResetToken),
    passwordResetExpires: exactStored(user.passwordResetExpires),
  }, { $set: { passwordResetToken: hashToken(token), passwordResetExpires: expiresAt } }, { runValidators: true });
  return result.matchedCount === 1 ? { token, expiresAt } : null;
};

/** Consume a current account capability once. Hashing happens after a cheap
 * preflight; the single write rechecks the capability and security context.
 * Never save a stale document's tokenVersion over concurrent revocations.
 */
export const consumeAccountRecovery = async (
  token: string, password: string, mode: AccountRecoveryMode,
): Promise<AccountRecoveryResult> => {
  if (typeof token !== 'string' || !token || typeof password !== 'string' || password.length < 8 ||
    !['reset', 'invitation'].includes(mode)) return { kind: 'invalid' };
  const tokenHash = hashToken(token);
  const user = await User.findOne({ passwordResetToken: tokenHash, passwordResetExpires: { $gt: new Date() } })
    .select('_id email role status assignedTenants').lean();
  if (!user) return { kind: 'invalid' };
  if (mode === 'invitation' && user.status !== 'pending') return { kind: 'not_pending' };
  if (mode === 'reset' && user.status !== 'active') return { kind: 'invalid' };

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);
  const updated = await User.findOneAndUpdate({
    _id: user._id,
    passwordResetToken: tokenHash,
    passwordResetExpires: { $gt: new Date() },
    status: user.status,
    email: user.email,
    role: user.role,
    assignedTenants: user.assignedTenants === undefined ? { $exists: false } : user.assignedTenants,
  }, {
    $set: { password: passwordHash, ...(mode === 'invitation' ? { status: 'active' } : {}) },
    $inc: { tokenVersion: 1 },
    $unset: { passwordResetToken: 1, passwordResetExpires: 1, refreshToken: 1 },
  }, { new: true, runValidators: true });
  return updated ? { kind: 'updated', user: updated } : { kind: 'invalid' };
};
