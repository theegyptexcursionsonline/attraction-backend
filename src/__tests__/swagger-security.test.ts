import { swaggerSpec } from '../config/swagger';

describe('OpenAPI authentication contract', () => {
  it('does not document browser-readable auth tokens in JSON responses', () => {
    const spec = swaggerSpec as {
      components?: {
        schemas?: {
          AuthResponse?: {
            properties?: {
              data?: { properties?: Record<string, unknown> };
            };
          };
        };
      };
    };

    const authDataProperties =
      spec.components?.schemas?.AuthResponse?.properties?.data?.properties || {};

    expect(authDataProperties).not.toHaveProperty('accessToken');
    expect(authDataProperties).not.toHaveProperty('refreshToken');
    expect(authDataProperties).toHaveProperty('user');
  });
});
