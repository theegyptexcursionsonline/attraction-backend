const mockCreate = jest.fn();
jest.mock('mailgun.js', () => ({
  __esModule: true,
  default: class { client() { return { messages: { create: mockCreate } }; } },
}));

process.env.MAILGUN_API_KEY = 'key-test';
process.env.MAILGUN_DOMAIN = 'mg.example.test';
process.env.MAILGUN_FROM_EMAIL = 'Notifications <noreply@mg.example.test>';
const { sendAdminBookingNotification, sendContactFormEmail, sendBookingStatusEmail, sendOperatorBookingStatusEmail, sendEmail } = require('../services/email.service');
const { env } = require('../config/env');

const tenant = {
  name: 'QA Cruises', slug: 'qa-cruises', contactInfo: { email: 'info@cruises.example' },
  notificationSettings: {
    bookingCcEmails: [' INFO@cruises.example ', 'info@cruises.example', 'reservation@cruises.example'],
    contactCcEmails: ['reservation@cruises.example'],
  },
};
const booking = { reference: 'QA-NOTIFICATION', tenantName: 'QA Cruises', attractionTitle: 'Cruise', date: '2026-10-01', guestName: 'QA Guest', guestEmail: 'visitor@example.test', guestPhone: '', total: 100, currency: 'EUR', adults: 2, children: 0, paymentMethod: 'card' };
const enquiry = { reference: 'MSG-QA-TEST', name: 'QA Guest', email: 'visitor@example.test', message: 'A question about the cruise.' };

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue({ id: '<queued@mg.example.test>' });
  env.nodeEnv = 'test';
  env.qaEmailRecipient = '';
});

it('sends booking copies once, excluding the primary and retaining the verified sender', async () => {
  await sendAdminBookingNotification('reservation@cruises.example', booking, tenant);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockCreate.mock.calls[0][1]).toMatchObject({ to: ['reservation@cruises.example'], cc: ['info@cruises.example'], from: 'QA Cruises <noreply@mg.example.test>' });
});

it('sends the enquiry to both operator inboxes and preserves visitor reply-to', async () => {
  await expect(sendContactFormEmail(tenant, enquiry)).resolves.toEqual({ status: 'sent' });
  expect(mockCreate.mock.calls[0][1]).toMatchObject({ to: ['info@cruises.example'], cc: ['reservation@cruises.example'], 'h:Reply-To': enquiry.email });
});

it('does not copy another tenant or customer confirmation', async () => {
  await sendAdminBookingNotification('other@operator.example', booking, { name: 'Other', slug: 'other' });
  expect(mockCreate.mock.calls[0][1]).not.toHaveProperty('cc');
  await sendBookingStatusEmail('visitor@example.test', { ...booking, kind: 'cancelled' }, tenant);
  expect(mockCreate.mock.calls[1][1]).not.toHaveProperty('cc');
});

it('redirects the entire operator message to QA outside production without leaking copies', async () => {
  env.nodeEnv = 'development';
  env.qaEmailRecipient = 'qa@example.test';
  await sendContactFormEmail(tenant, enquiry);
  expect(mockCreate.mock.calls[0][1].to).toEqual(['qa@example.test']);
  expect(mockCreate.mock.calls[0][1]).not.toHaveProperty('cc');
});

it('fails closed outside production when no QA inbox is configured', async () => {
  env.nodeEnv = 'development';
  await expect(sendContactFormEmail(tenant, enquiry)).resolves.toEqual({ status: 'skipped', reason: 'non_production_no_qa_inbox' });
  expect(mockCreate).not.toHaveBeenCalled();
});

it('rejects invalid stored copy recipients before any transport call', async () => {
  await expect(sendContactFormEmail({ ...tenant, notificationSettings: { contactCcEmails: ['copy@example.test\r\nBcc: other@example.test'] } }, enquiry)).rejects.toThrow('valid notification copy');
  expect(mockCreate).not.toHaveBeenCalled();
});

it('does not claim sent when the provider rejects the message', async () => {
  mockCreate.mockRejectedValue(new Error('provider unavailable'));
  await expect(sendContactFormEmail(tenant, enquiry)).rejects.toThrow('provider unavailable');
});

it('does not add operator copies to account messages even when accidentally supplied', async () => {
  await sendEmail({ to: 'visitor@example.test', cc: ['info@cruises.example'], category: 'account', subject: 'Account update', html: '<p>Updated</p>', tenant });
  expect(mockCreate.mock.calls[0][1]).not.toHaveProperty('cc');
});


it.each(['cancelled', 'refunded'])('sends a separate %s operator message to both inboxes without customer access', async (kind) => {
  await sendOperatorBookingStatusEmail({ reference: 'QA-STATUS', guestName: '<Guest>', kind, refundAmount: 25, currency: 'EUR', fullRefund: false, guestAccessToken: 'must-not-escape' }, { ...tenant, notificationSettings: { ...tenant.notificationSettings, bookingEmail: 'reservation@cruises.example' } });
  const message = mockCreate.mock.calls[0][1];
  expect(message.to).toEqual(['reservation@cruises.example']);
  expect(message.cc).toEqual(['info@cruises.example']);
  expect(message.subject).toContain(kind === 'cancelled' ? 'Booking cancelled' : 'Refund processed');
  expect(message.html).toContain('/admin/bookings');
  expect(message.html).toContain('&lt;Guest&gt;');
  expect(message.text).toContain('25');
  expect(message.html).not.toMatch(/accessToken|must-not-escape|checkout\/confirmation/);
  expect(message.html).not.toContain('Your booking is cancelled');
});

it('keeps operator status mail independent from a rejected customer notification', async () => {
  mockCreate.mockRejectedValueOnce(new Error('customer rejected'));
  await expect(sendBookingStatusEmail('visitor@example.test', { ...booking, kind: 'cancelled' }, tenant)).rejects.toThrow();
  await expect(sendOperatorBookingStatusEmail({ ...booking, kind: 'cancelled' }, tenant)).resolves.toEqual({ status: 'sent' });
  expect(mockCreate).toHaveBeenCalledTimes(2);
});

it('fails an operator status alert closed without a configured primary or fallback', async () => {
  await expect(sendOperatorBookingStatusEmail({ ...booking, kind: 'refunded' }, { name: 'Other', slug: 'other' })).rejects.toThrow('recipient');
  expect(mockCreate).not.toHaveBeenCalled();
});
