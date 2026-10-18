import { IUser } from '../types';

export const revokeUserSessions = (user: IUser): void => {
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
