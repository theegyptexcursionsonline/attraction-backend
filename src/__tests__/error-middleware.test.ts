import type { NextFunction, Request, Response } from 'express';
import { errorHandler } from '../middleware/error.middleware';

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
});
