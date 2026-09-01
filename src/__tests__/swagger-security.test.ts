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

  it('documents package pricing, participant bounds, and authoritative add-on selection', () => {
    const spec = swaggerSpec as {
      components?: {
        schemas?: {
          Attraction?: { properties?: Record<string, any> };
          Booking?: { properties?: Record<string, any> };
          CreateBookingRequest?: { properties?: Record<string, any> };
        };
      };
    };

    const schemas = spec.components?.schemas;
    const attractionOption = schemas?.Attraction?.properties?.pricingOptions?.items?.properties;
    const attractionAddon = schemas?.Attraction?.properties?.addons?.items?.properties;
    const bookingItem = schemas?.Booking?.properties?.items?.items?.properties;
    const requestItem = schemas?.CreateBookingRequest?.properties?.items?.items?.properties;

    expect(attractionOption?.pricingModel?.enum).toEqual(['per-person', 'per-booking']);
    expect(attractionOption?.minParticipants?.minimum).toBe(1);
    expect(attractionOption?.maxParticipants?.maximum).toBe(50);
    expect(attractionAddon?.pricingModel?.default).toBe('per-booking');
    expect(bookingItem?.pricingBreakdown?.properties?.packagePrice).toBeDefined();
    expect(bookingItem?.addons?.items?.properties?.totalPrice).toBeDefined();
    expect(requestItem?.addons?.items?.required).toEqual(['id']);
    expect(requestItem?.addons?.items?.properties).toEqual({
      id: { type: 'string', example: 'el-gouna-transfer' },
    });
  });
});
