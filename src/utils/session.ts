import { IUser } from '../types';

export const revokeUserSessions = (user: IUser): void => {
  user.refreshToken = undefined;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
};
