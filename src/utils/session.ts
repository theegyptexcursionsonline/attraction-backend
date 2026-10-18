import { IUser } from '../types';

export const revokeUserSessions = (user: IUser): void => {
  user.refreshToken = undefined;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  // Persist a delta, not a stale document's absolute epoch. After concurrent
  // writes this instance may still show an old value; never mint a new session
  // from it without reloading authoritative state.
  user.$inc('tokenVersion', 1);
};
