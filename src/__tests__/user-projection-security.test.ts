import { PUBLIC_USER_PROJECTION, redactUserSecrets } from '../utils/userProjection';

describe('public user projections', () => {
  it('removes every authentication and session-management field from lean results', () => {
    const safeUser = redactUserSecrets({
      _id: 'user-1',
      email: 'manager@example.com',
      role: 'manager',
      password: 'hashed-password',
      refreshToken: 'hashed-refresh-token',
      passwordResetToken: 'hashed-invitation-token',
      passwordResetExpires: new Date(),
      tokenVersion: 4,
      __v: 0,
    });

    expect(safeUser).toEqual({
      _id: 'user-1',
      email: 'manager@example.com',
      role: 'manager',
    });
  });

  it('also excludes sensitive fields at query time', () => {
    expect(PUBLIC_USER_PROJECTION.split(' ')).toEqual(
      expect.arrayContaining([
        '-password',
        '-refreshToken',
        '-passwordResetToken',
        '-passwordResetExpires',
        '-tokenVersion',
        '-__v',
      ])
    );
  });
});
