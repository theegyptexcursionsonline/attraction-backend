import type { NextFunction, Request, Response } from 'express';
import { AppError, errorHandler } from '../middleware/error.middleware';
import { TenantBookingCreationClosedError } from '../services/tenantBookingPolicy.service';

describe('error middleware', () => {
  it('returns actionable Mongoose validation fields instead of a generic message', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const request = { method: 'POST', originalUrl: '/api/attractions' } as Request;
    const response = { status, locals: { requestId: 'test-request' } } as unknown as Response;
    const error = Object.assign(new Error('Attraction validation failed'), {
      name: 'ValidationError',
      errors: {
        'pricingOptions.0.childPrice': {
          path: 'pricingOptions.0.childPrice',
          message: 'Child price cannot be negative',
        },
      },
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    errorHandler(error, request, response, jest.fn() as NextFunction);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: 'Validation failed',
      errors: [{ field: 'pricingOptions.0.childPrice', message: 'Child price cannot be negative' }],
    });
    consoleSpy.mockRestore();
  });

  const run = (error: Error) => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const request = { method: 'POST', originalUrl: '/api/bookings/quote' } as Request;
    const response = { status, locals: { requestId: 'test-request' } } as unknown as Response;
    errorHandler(error, request, response, jest.fn() as NextFunction);
    jest.restoreAllMocks();
    return { status, json };
  };

  it('names a site closed to bookings with its fixed code so the storefront can say so', () => {
    const { status, json } = run(new TenantBookingCreationClosedError());
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: 'Bookings are temporarily unavailable for this site',
      code: 'TENANT_BOOKING_CREATION_CLOSED',
    });
  });

  it('sends no code for an app error that declares none, nor a non-string one', () => {
    expect(run(new AppError('Route not found', 404)).json).toHaveBeenCalledWith({ success: false, error: 'Route not found' });
    const numeric = Object.assign(new AppError('Conflict', 409), { code: 42 });
    expect(run(numeric).json).toHaveBeenCalledWith({ success: false, error: 'Conflict' });
  });
});
