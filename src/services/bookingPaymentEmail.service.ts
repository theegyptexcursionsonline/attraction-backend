import {
  bookingPaymentLink, brandedLink, EmailBrand, EmailSendResult, EmailTenant,
  emailSubject, escapeEmailHtml, getEmailBrand, renderActionEmailParts, sendEmail,
} from './email.service';
import { BookingPaymentNotificationKind } from '../models/BookingPaymentNotification';
import { bookingNotificationEmail, notificationCopyEmails } from '../utils/notificationRecipients';

export interface BookingPaymentNoticeDetails {
  kind: BookingPaymentNotificationKind;
  audience: 'customer' | 'operator';
  reference: string;
  guestName: string;
  guestEmail?: string;
  experience?: string;
  departure?: string;
  total: number;
  currency: string;
  tourPath?: string;
  guestAccessToken?: string;
}

export const renderBookingPaymentNotice = (brand: EmailBrand, details: BookingPaymentNoticeDetails): { html: string; text: string } => {
  const expired = details.kind === 'checkout_expired';
  const operator = details.audience === 'operator';
  const title = expired ? 'Checkout expired' : 'Payment not completed';
  const row = (label: string, value: string) => ({ label, valueHtml: escapeEmailHtml(value), valueText: value });
  if (!operator && !expired && !details.guestAccessToken) throw new Error('CUSTOMER_PAYMENT_TOKEN_REQUIRED');
  const tourPath = /^\/[a-z0-9][a-z0-9/_-]*$/i.test(details.tourPath || '') ? details.tourPath! : '/';
  return renderActionEmailParts(brand, {
    title: `${title} · ${details.reference}`, heading: title,
    preheader: `Booking ${details.reference} is not confirmed.`,
    badge: { label: 'Not confirmed', tone: 'warning' },
    intro: operator
      ? `The checkout for ${escapeEmailHtml(details.guestName)} is unsuccessful and this booking is not confirmed.${expired ? ' Its temporary reservation has expired.' : ' Payment has not completed.'}`
      : `Hi ${escapeEmailHtml(details.guestName)}, your booking is not confirmed.${expired ? ' Your temporary reservation has expired. Please choose dates again to see current availability and pricing.' : ' Payment has not completed. You can review the booking and try payment again while its temporary reservation remains available.'}`,
    details: [row('Booking reference', details.reference),
      ...(operator ? [row('Lead traveller', details.guestName), ...(details.guestEmail ? [row('Customer email', details.guestEmail)] : [])] : []),
      ...(details.experience ? [row('Experience', details.experience)] : []),
      ...(details.departure ? [row('Requested departure', details.departure)] : []),
      row(expired ? 'Previous checkout total' : 'Booking total', `${details.currency} ${details.total.toFixed(2)}`),
    ],
    ctaLabel: operator ? 'Review in admin' : expired ? 'Choose dates again' : 'Review payment',
    ctaUrl: operator ? brandedLink(brand, '/admin/bookings') : expired
      ? brandedLink(brand, tourPath) : bookingPaymentLink(brand, details.reference, details.guestAccessToken!),
    note: operator ? 'Do not treat this as a confirmed reservation. Review the current booking status before contacting the customer.'
      : expired ? 'A new checkout uses the prices and availability shown when you book again.'
        : 'If your bank shows a pending payment, check its status before trying again. Contact us if you need help.',
    hideContact: operator,
    footerNote: operator ? 'This is a checkout status notice for your site.' : 'Questions? Reply to this email for help.',
  });
};

/** Direct send: the durable payment queue exclusively owns dedupe/retry. */
export const sendBookingPaymentNotice = async (
  details: BookingPaymentNoticeDetails, tenant: EmailTenant
): Promise<EmailSendResult> => {
  const operator = details.audience === 'operator';
  const recipient = operator ? bookingNotificationEmail(tenant) : details.guestEmail;
  if (!recipient) throw new Error(operator ? 'OPERATOR_RECIPIENT_MISSING' : 'CUSTOMER_RECIPIENT_MISSING');
  notificationCopyEmails([recipient]);
  const cc = operator ? notificationCopyEmails(tenant.notificationSettings?.bookingCcEmails, recipient) : undefined;
  const rendered = renderBookingPaymentNotice(getEmailBrand(tenant), details);
  return sendEmail({ to: recipient, cc, ...rendered, tenant,
    subject: emailSubject(details.kind === 'checkout_expired' ? 'Checkout expired' : 'Payment not completed', details.reference) });
};
