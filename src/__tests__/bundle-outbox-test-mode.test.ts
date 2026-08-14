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
    (BundleOrder.findById as jest.Mock).mockResolvedValue({ _id: orderId, checkoutMode: 'test' });
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
          manualRecoveryRequired: false,
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
      checkoutMode: 'live',
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
        $set: expect.objectContaining({
          status: 'delivered',
          manualRecoveryRequired: false,
        }),
      })
    );
  });

  it('suppresses a TEST supplier event even when its recipient tenant is not in TEST mode', async () => {
    const eventId = new Types.ObjectId();
    const supplierTenantId = new Types.ObjectId();
    const storefrontTenantId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const event = {
      _id: eventId,
      tenantId: supplierTenantId,
      orderId,
      audience: 'supplier',
      eventType: 'bundle.component_confirmed',
    };

    (BundleOutboxEvent.findOneAndUpdate as jest.Mock)
      .mockResolvedValueOnce(event)
      .mockResolvedValueOnce(null);
    (BundleOutboxEvent.findById as jest.Mock).mockResolvedValue(event);
    (Tenant.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: supplierTenantId,
        bundleSettings: { mode: 'live' },
        contactInfo: { email: 'supplier@example.test' },
      }),
    });
    (BundleOrder.findById as jest.Mock).mockResolvedValue({
      _id: orderId,
      storefrontTenantId,
      checkoutMode: 'test',
      components: [],
    });
    (BundleOutboxEvent.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await expect(processBundleOutboxBatch()).resolves.toEqual({
      delivered: 0,
      suppressed: 1,
      retried: 0,
      deadLetter: 0,
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('marks an exhausted delivery as requiring manual recovery until a redrive succeeds', async () => {
    const eventId = new Types.ObjectId();
    const tenantId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const event = {
      _id: eventId,
      tenantId,
      orderId,
      audience: 'customer',
      eventType: 'bundle.order_confirmed',
      attempts: 8,
    };

    (BundleOutboxEvent.findOneAndUpdate as jest.Mock)
      .mockResolvedValueOnce(event)
      .mockResolvedValueOnce(null);
    (BundleOutboxEvent.findById as jest.Mock).mockResolvedValue(event);
    (Tenant.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: tenantId }),
    });
    (BundleOrder.findById as jest.Mock).mockResolvedValue({
      _id: orderId,
      checkoutMode: 'live',
      reference: 'BND-TEST-002',
      status: 'confirmed',
      guestDetails: { email: 'safe-test-recipient@example.test' },
      components: [],
    });
    (sendEmail as jest.Mock).mockRejectedValue(new Error('Provider rejected delivery'));
    (BundleOutboxEvent.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await expect(processBundleOutboxBatch()).resolves.toEqual({
      delivered: 0,
      suppressed: 0,
      retried: 0,
      deadLetter: 1,
    });
    expect(BundleOutboxEvent.updateOne).toHaveBeenCalledWith(
      { _id: eventId },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'dead_letter',
          manualRecoveryRequired: true,
          lastError: 'Provider rejected delivery',
        }),
      })
    );
  });
});
