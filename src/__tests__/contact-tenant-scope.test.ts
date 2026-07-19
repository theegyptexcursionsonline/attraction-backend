import express from 'express';
import request from 'supertest';
import contactRoutes from '../routes/contact.routes';
import { Tenant } from '../models/Tenant';
import { sendContactFormEmail } from '../services/email.service';

jest.mock('../models/Tenant', () => ({
  Tenant: { findOne: jest.fn() },
}));

jest.mock('../services/email.service', () => ({
  sendContactFormEmail: jest.fn().mockResolvedValue(undefined),
}));

const app = express().use(express.json()).use('/contact', contactRoutes);

describe('contact form tenant routing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('routes a submission only through the selected tenant context', async () => {
    const tenant = {
      _id: 'tenant-a-id',
      slug: 'tenant-a',
      name: 'Tenant A',
      status: 'active',
      contactInfo: { email: 'help@tenant-a.example' },
    };
    (Tenant.findOne as jest.Mock).mockResolvedValue(tenant);

    const response = await request(app)
      .post('/contact')
      .set('X-Tenant-ID', 'tenant-a')
      .send({
        firstName: 'Guest',
        lastName: 'User',
        email: 'guest@example.com',
        subject: 'Private tour',
        message: 'Please share availability.',
      });

    expect(response.status).toBe(200);
    expect(sendContactFormEmail).toHaveBeenCalledWith(
      tenant,
      'Guest User',
      'guest@example.com',
      'Private tour',
      'Please share availability.'
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
    expect(sendContactFormEmail).not.toHaveBeenCalled();
  });

  it('rejects malformed or oversized contact data before delivery', async () => {
    (Tenant.findOne as jest.Mock).mockResolvedValue({
      _id: 'tenant-a-id',
      slug: 'tenant-a',
      status: 'active',
      contactInfo: { email: 'help@tenant-a.example' },
    });

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
    expect(sendContactFormEmail).not.toHaveBeenCalled();
  });
});
