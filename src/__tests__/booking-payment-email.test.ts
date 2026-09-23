jest.mock('mailgun.js', () => ({ __esModule: true, default: class { client() { return { messages: { create: jest.fn() } }; } } }));
jest.mock('../services/email.service', () => ({ ...jest.requireActual('../services/email.service'), sendEmail: jest.fn() }));
import { sendEmail, getEmailBrand } from '../services/email.service';
import { renderBookingPaymentNotice, sendBookingPaymentNotice, BookingPaymentNoticeDetails } from '../services/bookingPaymentEmail.service';

const tenant = { name: 'QA Cruises', slug: 'qa-cruises', customDomain: 'qa.example.invalid', domainMigrated: true,
  notificationSettings: { bookingEmail: 'operator@example.invalid', bookingCcEmails: ['copy@example.invalid'] } };
const details: BookingPaymentNoticeDetails = { kind: 'payment_failed', audience: 'customer', reference: 'QA-NOTICE', guestName: 'QA Guest', guestEmail: 'guest@example.invalid', total: 120, currency: 'EUR', guestAccessToken: 'qa-token' };
beforeEach(() => { jest.clearAllMocks(); (sendEmail as jest.Mock).mockResolvedValue({ status: 'sent' }); });

it('renders honest failed-payment copy with a secure payment fragment and no bank/no-charge promise', () => {
  const { html, text } = renderBookingPaymentNotice(getEmailBrand(tenant), details);
  expect(html).toContain('/checkout/pay?ref=QA-NOTICE#accessToken=qa-token');
  expect(text).toContain('not confirmed'); expect(text).not.toMatch(/card was not charged|bank may have declined|place is still held/i);
});
it('renders expiry with current-date/pricing advice and no old token or payment link', () => {
  const result = renderBookingPaymentNotice(getEmailBrand(tenant), { ...details, kind: 'checkout_expired', tourPath: '/qa-yacht' });
  expect(result.html).toContain('https://qa.example.invalid/qa-yacht');
  expect(result.html).not.toMatch(/qa-token|checkout\/pay/); expect(result.text).toContain('current availability and pricing');
});
it('keeps operator mail and copies separate from customer mail', async () => {
  await sendBookingPaymentNotice(details, tenant);
  expect(sendEmail).toHaveBeenLastCalledWith(expect.objectContaining({ to: 'guest@example.invalid', cc: undefined }));
  await sendBookingPaymentNotice({ ...details, audience: 'operator' }, tenant);
  expect(sendEmail).toHaveBeenLastCalledWith(expect.objectContaining({ to: 'operator@example.invalid', cc: ['copy@example.invalid'] }));
  const sent = (sendEmail as jest.Mock).mock.calls[1][0]; expect(sent.html).not.toContain('qa-token'); expect(sent.text).toContain('not confirmed');
});
it('escapes untrusted text and refuses external or script tour destinations', () => {
  const { html } = renderBookingPaymentNotice(getEmailBrand(tenant), { ...details, kind: 'checkout_expired', guestName: '<script>alert(1)</script>', tourPath: '//evil.example.invalid', experience: '<img onerror=alert(1)>' });
  expect(html).not.toContain('<script>'); expect(html).not.toContain('https://evil'); expect(html).toContain('&lt;img');
});
it('fails closed for missing customer capability and invalid operator recipient/copies', async () => {
  expect(() => renderBookingPaymentNotice(getEmailBrand(tenant), { ...details, guestAccessToken: undefined })).toThrow('CUSTOMER_PAYMENT_TOKEN_REQUIRED');
  await expect(sendBookingPaymentNotice({ ...details, audience: 'operator' }, { name: 'QA' })).rejects.toThrow('OPERATOR_RECIPIENT_MISSING');
  await expect(sendBookingPaymentNotice({ ...details, audience: 'operator' }, { ...tenant, notificationSettings: { bookingEmail: 'operator@example.invalid', bookingCcEmails: ['bad\r\nBcc:bad@example.invalid'] } })).rejects.toThrow();
  expect(sendEmail).not.toHaveBeenCalled();
});
