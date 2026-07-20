import { User } from '../models/User';

describe('user serialization security', () => {
  it('never serializes authentication or session-management fields', () => {
    const user = new User({
      email: 'operator@example.com',
      password: 'PlaintextOnlyForSerializationTest123!',
      firstName: 'Test',
      lastName: 'Operator',
      tokenVersion: 7,
      refreshToken: 'hashed-refresh-token',
      passwordResetToken: 'hashed-reset-token',
      passwordResetExpires: new Date(),
    });

    const serialized = user.toJSON() as Record<string, unknown>;

    expect(serialized).not.toHaveProperty('password');
    expect(serialized).not.toHaveProperty('refreshToken');
    expect(serialized).not.toHaveProperty('passwordResetToken');
    expect(serialized).not.toHaveProperty('passwordResetExpires');
    expect(serialized).not.toHaveProperty('tokenVersion');
  });
});
