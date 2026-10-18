import { IUser } from '../types';
import type { Model, Types } from 'mongoose';

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
  // A stale document may have read these paths while absent. Force the unsets
  // so a capability issued since that read cannot survive this revocation.
  for (const field of ['refreshToken', 'passwordResetToken', 'passwordResetExpires']) user.markModified(field);
  // Persist a delta, not a stale document's absolute epoch. After concurrent
  // writes this instance may still show an old value; never mint a new session
  // from it without reloading authoritative state.
  user.$inc('tokenVersion', 1);
};
