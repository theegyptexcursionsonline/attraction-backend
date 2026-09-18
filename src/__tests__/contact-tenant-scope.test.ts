import express from 'express';
import request from 'supertest';
import contactRoutes from '../routes/contact.routes';
import { Tenant } from '../models/Tenant';
import { ContactMessage } from '../models/ContactMessage';
import { sendContactFormEmail } from '../services/email.service';

// Fast routing contract without a database: which tenant a public submission is
// stored and delivered under. Persistence, idempotency and delivery bookkeeping
// against a real replica set live in contact-messages-api.test.ts.
jest.mock('../models/Tenant', () => ({
  Tenant: { findOne: jest.fn() },
}));

jest.mock('../models/ContactMessage', () => ({
  ...jest.requireActual('../models/ContactMessage'),
  ensureContactMessageIndexes: jest.fn().mockResolvedValue(undefined),
  ContactMessage: { create: jest.fn(), findOne: jest.fn(), updateOne: jest.fn() },
}));

jest.mock('../services/email.service', () => ({
  sendContactFormEmail: jest.fn(),
  // The visitor acknowledgement is a second, independent send; a partial mock would make the
  // route throw on an undefined export rather than exercise the routing this suite is about.
  sendEnquiryReceivedEmail: jest.fn().mockResolvedValue({ status: 'sent' }),
}));

const app = express().use(express.json()).use('/contact', contactRoutes);

const tenantA = {
  _id: 'tenant-a-id',
  slug: 'tenant-a',
  name: 'Tenant A',
  status: 'active',
  contactInfo: { email: 'help@tenant-a.example' },
};

describe('contact form tenant routing', () => {
  beforeEach(() => {
    (sendContactFormEmail as jest.Mock).mockResolvedValue({ status: 'sent' });
    (ContactMessage.create as jest.Mock).mockImplementation(async (doc) => ({ _id: 'message-1', ...doc }));
    (ContactMessage.updateOne as jest.Mock).mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  });

  it('stores and delivers a submission only under the selected tenant context', async () => {
    (Tenant.findOne as jest.Mock).mockResolvedValue(tenantA);

    const response = await request(app)
      .post('/contact')
      .set('X-Tenant-ID', 'tenant-a')
      .send({
        firstName: 'Guest',
        lastName: 'User',
        email: 'guest@example.com',
        subject: 'Private tour',
        message: 'Please share availability.',
        tenantId: 'tenant-b-id',
        tenantSlug: 'tenant-b',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.reference).toMatch(/^MSG-[0-9A-Z]{6}$/);
    expect(ContactMessage.create).toHaveBeenCalledTimes(1);
    const stored = (ContactMessage.create as jest.Mock).mock.calls[0][0];
    expect(stored).toMatchObject({ tenantId: 'tenant-a-id', name: 'Guest User', subject: 'Private tour' });
    expect(JSON.stringify(stored)).not.toContain('tenant-b');
    expect(sendContactFormEmail).toHaveBeenCalledWith(
      tenantA,
      expect.objectContaining({
        reference: response.body.data.reference,
        name: 'Guest User',
        email: 'guest@example.com',
        subject: 'Private tour',
        message: 'Please share availability.',
      })
    );
  });

  it('rejects a contact submission without tenant context', async () => {
    const response = await request(app).post('/contact').send({
      firstName: 'Guest',
      lastName: 'User',
      email: 'guest@example.com',
      subject: 'Question',
      message: 'Hello',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Tenant context required');
    expect(ContactMessage.create).not.toHaveBeenCalled();
    expect(sendContactFormEmail).not.toHaveBeenCalled();
  });

  it('rejects malformed or oversized contact data before storage or delivery', async () => {
    (Tenant.findOne as jest.Mock).mockResolvedValue(tenantA);

    const response = await request(app)
      .post('/contact')
      .set('X-Tenant-ID', 'tenant-a')
      .send({
        firstName: 'Guest',
        lastName: 'User',
        email: 'not-an-email',
        subject: 'Question',
        message: 'Hello',
      });

    expect(response.status).toBe(400);
    expect(ContactMessage.create).not.toHaveBeenCalled();
    expect(sendContactFormEmail).not.toHaveBeenCalled();
  });
});
