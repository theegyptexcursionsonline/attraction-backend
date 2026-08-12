import { Types } from 'mongoose';
import { BundleOrder } from '../models/BundleOrder';
import { BundleOutboxEvent } from '../models/BundleOutboxEvent';
import { Tenant } from '../models/Tenant';
import { processBundleOutboxBatch } from '../services/bundleOutbox.service';
import { sendEmail } from '../services/email.service';

jest.mock('../models/BundleOrder', () => ({ BundleOrder: { findById: jest.fn() } }));
jest.mock('../models/BundleOutboxEvent', () => ({
  BundleOutboxEvent: {
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
}));
jest.mock('../models/Tenant', () => ({ Tenant: { findById: jest.fn() } }));
jest.mock('../config/env', () => ({
  env: {
    bookingAccessSecret: 'test-booking-access-secret',
    mailgunApiKey: 'test-mailgun-key',
    mailgunDomain: 'example.test',
  },
}));
jest.mock('../services/email.service', () => ({
  brandedLink: jest.fn(() => 'https://example.test/bundle-orders/order-1'),
  escapeEmailHtml: jest.fn((value) => String(value)),
  getEmailBrand: jest.fn(() => ({ name: 'Test brand', color: '#111111', origin: 'https://example.test' })),
  sendEmail: jest.fn(),
}));

describe('bundle TEST-mode outbox safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records a suppressed terminal outcome and never invokes live email delivery', async () => {
    const eventId = new Types.ObjectId();
    const tenantId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const event = { _id: eventId, tenantId, orderId };

    (BundleOutboxEvent.findOneAndUpdate as jest.Mock)
      .mockResolvedValueOnce(event)
      .mockResolvedValueOnce(null);
    (BundleOutboxEvent.findById as jest.Mock).mockResolvedValue(event);
    (Tenant.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: tenantId, bundleSettings: { mode: 'test' } }),
    });
    (BundleOrder.findById as jest.Mock).mockResolvedValue({ _id: orderId });
    (BundleOutboxEvent.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await expect(processBundleOutboxBatch()).resolves.toEqual({
      delivered: 0,
      suppressed: 1,
      retried: 0,
      deadLetter: 0,
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(BundleOutboxEvent.updateOne).toHaveBeenCalledWith(
      { _id: eventId, status: 'processing' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'suppressed',
          suppressionReason: 'TEST_MODE_NO_EXTERNAL_DELIVERY',
        }),
      })
    );
  });

  it('preserves live-mode delivery through the mocked email boundary', async () => {
    const eventId = new Types.ObjectId();
    const tenantId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const event = {
      _id: eventId,
      tenantId,
      orderId,
      audience: 'customer',
      eventType: 'bundle.order_confirmed',
    };

    (BundleOutboxEvent.findOneAndUpdate as jest.Mock)
      .mockResolvedValueOnce(event)
      .mockResolvedValueOnce(null);
    (BundleOutboxEvent.findById as jest.Mock).mockResolvedValue(event);
    (Tenant.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: tenantId, bundleSettings: { mode: 'live' } }),
    });
    (BundleOrder.findById as jest.Mock).mockResolvedValue({
      _id: orderId,
      reference: 'BND-TEST-001',
      status: 'confirmed',
      guestDetails: { email: 'safe-test-recipient@example.test' },
      components: [],
    });
    (BundleOutboxEvent.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await expect(processBundleOutboxBatch()).resolves.toEqual({
      delivered: 1,
      suppressed: 0,
      retried: 0,
      deadLetter: 0,
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(BundleOutboxEvent.updateOne).toHaveBeenCalledWith(
      { _id: eventId, status: 'processing' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'delivered' }),
      })
    );
  });
});
