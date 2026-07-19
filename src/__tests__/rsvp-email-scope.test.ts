import { createRsvp } from '../controllers/rsvps.controller';
import { EventRsvp } from '../models/EventRsvp';
import {
  sendEventRsvpConfirmation,
  sendEventRsvpNotification,
} from '../services/email.service';

jest.mock('../models/EventRsvp', () => ({
  EventRsvp: { create: jest.fn() },
}));

jest.mock('../services/email.service', () => ({
  sendEventRsvpConfirmation: jest.fn().mockResolvedValue(undefined),
  sendEventRsvpNotification: jest.fn().mockResolvedValue(undefined),
}));

describe('RSVP email tenant isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (EventRsvp.create as jest.Mock).mockResolvedValue({ _id: 'rsvp-1', status: 'pending' });
  });

  it('notifies only the RSVP tenant operator and sends tenant context to both messages', async () => {
    const tenant = {
      _id: 'tenant-a-id',
      slug: 'tenant-a',
      name: 'Tenant A',
      contactInfo: { email: 'events@tenant-a.example', address: 'Tenant A Venue' },
      defaultLanguage: 'en',
      timezone: 'Africa/Cairo',
    };
    const req = {
      tenant,
      body: {
        eventSlug: 'opening-night',
        eventName: 'Opening Night',
        eventDate: '2030-03-10T18:00:00.000Z',
        eventLocation: 'Tenant A Venue',
        firstName: 'Guest',
        lastName: 'User',
        email: 'guest@example.com',
        phone: '+12025550123',
        adultsCount: 2,
        childrenCount: 1,
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    await createRsvp(req as never, res as never, next);

    expect(sendEventRsvpConfirmation).toHaveBeenCalledWith(
      'guest@example.com',
      expect.objectContaining({ tenantName: 'Tenant A' }),
      tenant
    );
    expect(sendEventRsvpNotification).toHaveBeenCalledWith(
      'events@tenant-a.example',
      expect.objectContaining({ tenantName: 'Tenant A', email: 'guest@example.com' }),
      tenant
    );
    expect(JSON.stringify((sendEventRsvpNotification as jest.Mock).mock.calls)).not.toContain(
      'foxestechnology.com'
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects malformed email addresses before persisting or sending', async () => {
    const req = {
      tenant: { _id: 'tenant-a-id', slug: 'tenant-a', name: 'Tenant A' },
      body: {
        eventSlug: 'opening-night',
        eventName: 'Opening Night',
        eventDate: '2030-03-10T18:00:00.000Z',
        firstName: 'Guest',
        lastName: 'User',
        email: 'guest@example.com\" onmouseover=\"alert(1)',
        phone: '+12025550123',
        adultsCount: 2,
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await createRsvp(req as never, res as never, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(EventRsvp.create).not.toHaveBeenCalled();
    expect(sendEventRsvpConfirmation).not.toHaveBeenCalled();
    expect(sendEventRsvpNotification).not.toHaveBeenCalled();
  });
});
