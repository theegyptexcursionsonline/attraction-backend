import type { HotelPickupSelection } from '../utils/hotel-pickup';
import Mailgun from 'mailgun.js';
import formData from 'form-data';
import sanitizeMarkup from 'sanitize-html';
import QRCode from 'qrcode';
import { env } from '../config/env';
import {
  EmailDetailRow,
  EmailTone,
  emailButtons,
  emailCode,
  emailDetails,
  emailLink,
  emailList,
  emailNotice,
  emailPanel,
  emailQuote,
  emailStats,
  renderEmailDocument,
} from './emailLayout';

const mailgun = new Mailgun(formData);
const mg = env.mailgunApiKey
  ? mailgun.client({ username: 'api', key: env.mailgunApiKey })
  : null;

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  tenant: EmailTenant | null;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    data: Buffer;
  }>;
  inlineAttachments?: Array<{
    filename: string;
    data: Buffer;
  }>;
}

const emailAddressFrom = (value: string): string => {
  const bracketed = value.match(/<([^<>\r\n]+)>/);
  return (bracketed?.[1] || value).trim().replace(/[\r\n]/g, '');
};

const isEmailAddress = (value?: string): value is string =>
  !!value && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.trim());

const safeMailtoAddress = (value: string): string | null => {
  const candidate = value.trim().toLowerCase();
  return isEmailAddress(candidate) ? candidate : null;
};

const safeDisplayName = (value: string): string =>
  value.replace(/[\r\n<>\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

export const escapeEmailHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sanitizeInlineEmailHtml = (value: string): string =>
  sanitizeMarkup(value, {
    allowedTags: ['strong', 'b', 'em', 'i', 'br'],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });

const safeHttpUrl = (value: string): string => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '#';
    return url.toString();
  } catch {
    return '#';
  }
};

export interface EmailEnvelope {
  from: string;
  to: string[];
  replyTo?: string;
}

export const resolveEmailEnvelope = (
  tenant: EmailTenant | null,
  recipient: string,
  explicitReplyTo?: string
): EmailEnvelope => {
  const senderAddress = emailAddressFrom(env.mailgunFromEmail);
  if (!isEmailAddress(senderAddress) || !isEmailAddress(recipient)) {
    throw new Error('Email sender or recipient is invalid');
  }

  const brand = getEmailBrand(tenant);
  const replyCandidate = explicitReplyTo?.trim() || tenant?.contactInfo?.email?.trim();
  return {
    from: `${safeDisplayName(brand.name) || 'Attractions Network'} <${senderAddress}>`,
    to: [recipient.trim().toLowerCase()],
    ...(isEmailAddress(replyCandidate) ? { replyTo: replyCandidate.toLowerCase() } : {}),
  };
};

/**
 * What `sendEmail` did. Existing callers ignore it (behaviour is unchanged: an
 * unconfigured provider is still a logged no-op), but callers that must record
 * the outcome — such as stored contact enquiries — can tell a skip from a send.
 * Provider failures still throw.
 */
export type EmailSendResult =
  | { status: 'sent' }
  | { status: 'skipped'; reason: 'provider_not_configured' };

export const sendEmail = async (options: EmailOptions): Promise<EmailSendResult> => {
  if (!mg || !env.mailgunDomain) {
    console.info('[email] delivery skipped: provider is not configured', {
      subject: options.subject.replace(/[\r\n]/g, ' ').slice(0, 160),
      tenant: options.tenant?.slug || 'platform',
    });
    return { status: 'skipped', reason: 'provider_not_configured' };
  }

  const envelope = resolveEmailEnvelope(options.tenant, options.to, options.replyTo);
  const messageData: Record<string, unknown> = {
    from: envelope.from,
    to: envelope.to,
    subject: options.subject.replace(/[\r\n]/g, ' ').slice(0, 200),
    html: options.html,
  };
  if (envelope.replyTo) messageData['h:Reply-To'] = envelope.replyTo;

  if (options.attachments && options.attachments.length > 0) {
    messageData.attachment = options.attachments.map((a) => ({
      filename: a.filename,
      data: a.data,
    }));
  }
  if (options.inlineAttachments && options.inlineAttachments.length > 0) {
    messageData.inline = options.inlineAttachments.map((a) => ({
      filename: a.filename,
      data: a.data,
    }));
  }

  await mg.messages.create(env.mailgunDomain, messageData as any);
  return { status: 'sent' };
};

// ---------------------------------------------------------------------------
// Tenant email branding
// Transactional emails must speak in the tenant's brand, never the generic
// "Foxes Network" platform. `getEmailBrand` resolves the display name and the
// base URL to use: a live custom domain when the tenant has one, otherwise the
// shared origin with a `?tenant=<slug>` so the linked page themes correctly.
// ---------------------------------------------------------------------------
export interface EmailTenant {
  name?: string;
  slug?: string;
  customDomain?: string;
  domainMigrated?: boolean; // true once the custom domain serves the Attractions build
  theme?: { primaryColor?: string; secondaryColor?: string };
  logo?: string;
  defaultLanguage?: string;
  defaultCurrency?: string;
  timezone?: string;
  contactInfo?: { email?: string; phone?: string; address?: string };
}

export interface EmailBrand {
  name: string;
  origin: string;
  slug?: string; // set only when NOT on a custom domain (needs ?tenant=)
  color: string; // brand primary, used for the email header/accents/button
  logo?: string; // absolute URL to the tenant logo, shown in the email header
  contact?: { email?: string; phone?: string }; // the site's own inbox and phone, for email footers
}

const normalizedCustomDomain = (value?: string): string | null => {
  const candidate = value
    ?.trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (!candidate || candidate.length > 253) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(candidate)) {
    return null;
  }
  return candidate;
};

export const getEmailBrand = (tenant?: EmailTenant | null): EmailBrand => {
  const base = env.frontendUrl.split(',')[0].trim().replace(/\/+$/, '');
  const name = safeDisplayName(tenant?.name?.trim() || 'Foxes Network') || 'Foxes Network';
  // Prefer the brand's own custom domain for links — but only when it's confirmed to
  // serve the Attractions build. Many custom domains still point at the client's OLD
  // site (e.g. a WordPress build) where /reset-password and /accept-invitation 404.
  // A domain is "migrated" when the per-tenant `domainMigrated` flag is set (flip it
  // from the admin — no deploy), OR it's in the legacy MIGRATED_DOMAINS allow-list.
  // Otherwise link via the shared origin + ?tenant= (which themes the linked page).
  // Brand accent for the email chrome. Fall back to a premium near-black that always
  // contrasts white text, so a missing/very-light brand colour never breaks the header.
  const raw = tenant?.theme?.primaryColor?.trim() || '';
  const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : '#111827';
  // Resolve the tenant logo (stored as a site-relative path like /logos/x.png,
  // served by the frontend build) to an absolute URL against a given origin, so
  // it loads in email clients. Both the shared origin and migrated custom domains
  // serve the same /logos assets.
  const absLogo = (origin: string): string | undefined => {
    const l = tenant?.logo?.trim();
    if (!l) return undefined;
    try {
      const url = new URL(l, `${origin}/`);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
      return url.toString();
    } catch {
      return undefined;
    }
  };
  const contactEmail = tenant?.contactInfo?.email?.trim();
  const contactPhone = tenant?.contactInfo?.phone?.trim();
  const contact = isEmailAddress(contactEmail) || contactPhone
    ? { ...(isEmailAddress(contactEmail) ? { email: contactEmail.toLowerCase() } : {}), ...(contactPhone ? { phone: contactPhone.slice(0, 40) } : {}) }
    : undefined;
  const cd = normalizedCustomDomain(tenant?.customDomain);
  if (cd && (tenant?.domainMigrated || MIGRATED_DOMAINS.has(cd))) {
    const origin = `https://${cd}`;
    return { name, origin, color, logo: absLogo(origin), ...(contact ? { contact } : {}) };
  }
  return { name, origin: base, slug: tenant?.slug, color, logo: absLogo(base), ...(contact ? { contact } : {}) };
};

// Custom domains confirmed to serve the Attractions Network build (not an old
// site). Links in transactional emails may safely target these directly.
const MIGRATED_DOMAINS = new Set<string>([
  'makadihorseclub.com',
  'www.makadihorseclub.com',
  'splashspeedboathurghada.com',
  'www.splashspeedboathurghada.com',
]);

// Build a link on the brand's origin, carrying ?tenant= only on the shared origin.
export const brandedLink = (
  brand: EmailBrand,
  path: string,
  params: Record<string, string> = {}
): string => {
  if (!/^\/[A-Za-z0-9/_-]*$/.test(path)) return brand.origin;
  const qs = new URLSearchParams(params);
  if (brand.slug) qs.set('tenant', brand.slug);
  const q = qs.toString();
  return `${brand.origin}${path}${q ? `?${q}` : ''}`;
};

export interface BookingEmailDetails {
  reference: string;
  guestAccessToken?: string;
  attractionTitle: string;
  date: string;
  time?: string;
  guestName: string;
  total: number;
  currency: string;
  paymentMethod?: string;
  guests?: number;
  hotelPickups?: HotelPickupSelection[];
  hotelPickup?: { status?: 'confirmed' | 'provide_later'; address?: string; hotelName?: string; roomNumber?: string; pickupTime?: string };
  meetingPoint?: { lat?: number; lng?: number; label?: string };
}

/**
 * Static meeting-point map card for the booking emails. Emails can't run the live
 * iframe map used on the confirmation page, so this renders a static map image
 * wrapped in a Google Maps link, with a "Get directions" button as the always-works
 * fallback if images are blocked. Renders nothing unless real coordinates exist.
 */
const renderMeetingPointBlock = (
  brand: EmailBrand,
  mp?: { lat?: number; lng?: number; label?: string }
): string => {
  if (!mp || typeof mp.lat !== 'number' || typeof mp.lng !== 'number') return '';
  const { lat, lng } = mp;
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  // Prefer Google Static Maps (clean, no third-party watermark) when a key is
  // configured. Fall back to a keyless static-map source (proxied via wsrv.nl for
  // reliable email rendering) so the map still shows even without a key.
  let mapImg: string;
  if (env.googleMapsStaticKey) {
    const p = new URLSearchParams({
      center: `${lat},${lng}`,
      zoom: '15',
      size: '600x280',
      scale: '2',
      maptype: 'roadmap',
      key: env.googleMapsStaticKey,
    });
    p.append('markers', `color:0xDC2626|${lat},${lng}`);
    p.append('style', 'feature:poi|visibility:off');
    p.append('style', 'feature:road|element:labels.icon|visibility:off');
    mapImg = `https://maps.googleapis.com/maps/api/staticmap?${p.toString()}`;
  } else {
    const upstream = `static-maps.yandex.ru/1.x/?ll=${lng},${lat}&z=14&size=650,300&l=map&lang=en_US&pt=${lng},${lat},pm2rdm`;
    mapImg = `https://wsrv.nl/?url=${encodeURIComponent(upstream)}&output=jpg&q=82`;
  }
  return emailPanel(
    brand,
    'Meeting point',
    `<a href="${mapsLink}" target="_blank" style="text-decoration:none;"><img src="${escapeEmailHtml(mapImg)}" width="484" alt="Map to the meeting point" style="display:block;width:100%;max-width:484px;height:auto;border-radius:10px;border:1px solid #ece7df;"></a>
        <div style="margin-top:14px;">${emailButtons(brand, { label: 'Get directions', url: mapsLink }, undefined, { outline: true })}</div>`,
    { titleHtml: mp.label ? escapeEmailHtml(mp.label) : undefined }
  );
};

const firstNameOf = (name: string | undefined, fallback = 'there'): string =>
  (name || '').trim().split(/\s+/)[0] || fallback;

const pickupRows = (pickups: Array<{ status?: string; hotelName?: string; address?: string; roomNumber?: string; pickupTime?: string }>): EmailDetailRow[] => {
  const labels = pickups
    .map((pickup) => pickup.status === 'provide_later'
      ? 'Hotel details to be provided later'
      : [pickup.hotelName, pickup.address, pickup.roomNumber ? `Room ${pickup.roomNumber}` : '', pickup.pickupTime].filter(Boolean).join(', '))
    .filter(Boolean);
  return labels.map((label, index) => ({
    label: labels.length > 1 ? `Hotel pickup ${index + 1}` : 'Hotel pickup',
    valueHtml: escapeEmailHtml(label),
  }));
};

/**
 * Shared builder for a simple branded "action" email (payment link, cancellation,
 * password reset, invitation): heading, short intro, optional details, one button.
 * `intro` may contain <strong>/<em>/<br> only; everything else is escaped.
 */
export const renderActionEmail = (
  brand: EmailBrand,
  opts: {
    title: string;
    heading: string;
    intro: string;
    note?: string;
    ctaLabel: string;
    ctaUrl: string;
    badge?: { label: string; tone: EmailTone };
    details?: EmailDetailRow[];
    noteTone?: EmailTone;
    footerNote?: string;
    preheader?: string;
  }
): string =>
  renderEmailDocument({
    brand,
    title: opts.title,
    preheader: opts.preheader || opts.heading,
    badge: opts.badge,
    heading: opts.heading,
    introHtml: sanitizeInlineEmailHtml(opts.intro),
    blocks: [
      opts.details?.length ? emailDetails(brand, opts.details) : '',
      emailButtons(brand, { label: opts.ctaLabel, url: safeHttpUrl(opts.ctaUrl) }),
      opts.note ? emailNotice(brand, opts.noteTone || 'neutral', escapeEmailHtml(opts.note)) : '',
    ],
    footer: { note: opts.footerNote, contact: brand.contact },
  });

/** Pure builder for the customer booking-confirmation email (exported so it can be
 *  previewed/unit-tested without sending). */
export const renderBookingConfirmationHtml = (
  brand: EmailBrand,
  bookingDetails: BookingEmailDetails,
  hasTicket = false,
  qrImageSrc?: string,
): string => {
  const viewUrl = brandedLink(brand, '/checkout/confirmation', {
    ref: bookingDetails.reference,
    ...(bookingDetails.guestAccessToken ? { accessToken: bookingDetails.guestAccessToken } : {}),
  });
  const pickups = bookingDetails.hotelPickups || (bookingDetails.hotelPickup ? [bookingDetails.hotelPickup] : []);
  const isPaid = !!bookingDetails.paymentMethod && bookingDetails.paymentMethod !== 'pay-later';
  const dateStr = `${bookingDetails.date}${bookingDetails.time ? ` at ${bookingDetails.time}` : ''}`;
  const reference = bookingDetails.reference;

  const rows: EmailDetailRow[] = [
    { label: 'Booking reference', valueHtml: emailCode(reference) },
    { label: 'Date & time', valueHtml: escapeEmailHtml(dateStr) },
    ...(bookingDetails.guests ? [{ label: 'Guests', valueHtml: escapeEmailHtml(bookingDetails.guests) }] : []),
    ...pickupRows(pickups),
    {
      label: isPaid ? 'Total paid' : 'Total',
      hint: isPaid ? 'Paid online' : 'Pay at location — collected on arrival',
      valueHtml: `${escapeEmailHtml(bookingDetails.currency)} ${bookingDetails.total.toFixed(2)}`,
      emphasis: true,
    },
  ];

  const ticket = qrImageSrc
    ? emailPanel(
        brand,
        'Your mobile ticket',
        `<img src="${escapeEmailHtml(qrImageSrc)}" width="156" height="156" alt="QR code for booking ${escapeEmailHtml(reference)}" style="display:block;width:156px;height:156px;margin:0 auto;background:#ffffff;border:10px solid #ffffff;border-radius:12px;">
        <div style="margin-top:12px;font-size:13px;line-height:20px;color:#57534e;">Reference ${emailCode(reference)}</div>`,
        { align: 'center', titleHtml: 'Scan for booking details' }
      )
    : '';

  return renderEmailDocument({
    brand,
    title: 'Booking confirmed',
    preheader: `Booking confirmed — ${reference} · ${bookingDetails.attractionTitle} on ${dateStr}.`,
    badge: { label: 'Booking confirmed', tone: 'success' },
    heading: `You're all set, ${firstNameOf(bookingDetails.guestName)}!`,
    introHtml: `Your booking is confirmed${hasTicket ? ' and your e-ticket is attached' : ''}. Keep this email handy for the day of your tour.`,
    blocks: [
      emailDetails(brand, rows, { eyebrow: 'Your booking', titleHtml: escapeEmailHtml(bookingDetails.attractionTitle) }),
      emailButtons(brand, { label: 'Open your booking', url: viewUrl }),
      ticket,
      renderMeetingPointBlock(brand, bookingDetails.meetingPoint),
      emailNotice(brand, 'neutral', hasTicket ? 'Your PDF ticket is attached. Show it on your phone when requested.' : 'Bring this confirmation with you on the day of your tour.'),
    ],
    footer: { note: 'Questions? Reply to this email and our team will help.', contact: brand.contact },
  });
};

export const sendBookingConfirmation = async (
  email: string,
  bookingDetails: BookingEmailDetails,
  ticketPdf: Buffer | undefined,
  tenant: EmailTenant | null
): Promise<void> => {
  const brand = getEmailBrand(tenant);
  const viewUrl = brandedLink(brand, '/checkout/confirmation', {
    ref: bookingDetails.reference,
    ...(bookingDetails.guestAccessToken ? { accessToken: bookingDetails.guestAccessToken } : {}),
  });
  let qrBuffer: Buffer | undefined;
  if (bookingDetails.guestAccessToken) {
    try {
      qrBuffer = await QRCode.toBuffer(viewUrl, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#17120d', light: '#ffffff' },
      });
    } catch (error) {
      console.error('Booking email QR generation failed:', error);
    }
  }
  const qrFilename = `booking-${bookingDetails.reference.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)}-qr.png`;
  const html = renderBookingConfirmationHtml(
    brand,
    bookingDetails,
    !!ticketPdf,
    qrBuffer ? `cid:${qrFilename}` : undefined,
  );
  await sendEmail({
    to: email,
    subject: `Booking confirmed · ${bookingDetails.reference}`,
    html,
    tenant: tenant || null,
    attachments: ticketPdf
      ? [{
          filename: `ticket-${bookingDetails.reference.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)}.pdf`,
          data: ticketPdf,
        }]
      : undefined,
    inlineAttachments: qrBuffer ? [{ filename: qrFilename, data: qrBuffer }] : undefined,
  });
};

export interface BookingPaymentLinkDetails {
  reference: string;
  guestName: string;
  guestAccessToken: string;
  total: number;
  currency: string;
}

/**
 * Build the customer payment URL without putting the capability token in the
 * query string. URL fragments are never sent to Netlify, the custom-domain
 * server, or access logs; the payment page moves the token into the API header.
 */
export const bookingPaymentLink = (
  brand: EmailBrand,
  reference: string,
  guestAccessToken: string
): string => {
  const base = brandedLink(brand, '/checkout/pay', { ref: reference });
  return `${base}#accessToken=${encodeURIComponent(guestAccessToken)}`;
};

export const renderBookingPaymentLinkHtml = (
  brand: EmailBrand,
  details: BookingPaymentLinkDetails
): string => {
  const amount = `${details.currency.toUpperCase()} ${details.total.toFixed(2)}`;
  return renderActionEmail(brand, {
    title: `Complete payment · ${details.reference}`,
    preheader: `Your booking ${details.reference} is reserved — pay ${amount} to confirm it.`,
    badge: { label: 'Payment due', tone: 'warning' },
    heading: 'Complete your secure payment',
    intro: `Hi ${escapeEmailHtml(firstNameOf(details.guestName))}, your booking is reserved and waiting for payment.`,
    details: [
      { label: 'Booking reference', valueHtml: emailCode(details.reference) },
      { label: 'Amount due', valueHtml: escapeEmailHtml(amount), emphasis: true },
    ],
    ctaLabel: `Pay ${amount}`,
    ctaUrl: bookingPaymentLink(brand, details.reference, details.guestAccessToken),
    note: 'Pay by card through the secure link above. Your booking is confirmed only after the payment succeeds.',
    noteTone: 'info',
    footerNote: 'Questions? Reply to this email and our team will help.',
  });
};

export const sendBookingPaymentLinkEmail = async (
  email: string,
  details: BookingPaymentLinkDetails,
  tenant: EmailTenant | null
): Promise<void> => {
  const brand = getEmailBrand(tenant);
  await sendEmail({
    to: email,
    subject: `Complete payment · ${safeDisplayName(details.reference)}`,
    html: renderBookingPaymentLinkHtml(brand, details),
    tenant,
  });
};

export interface AdminBookingDetails {
  reference: string;
  tenantName: string;
  attractionTitle: string;
  date: string;
  time?: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  adults: number;
  children: number;
  total: number;
  currency: string;
  paymentMethod: string;
  hotelPickups?: HotelPickupSelection[];
  hotelPickup?: { status?: 'confirmed' | 'provide_later'; address?: string; hotelName?: string; roomNumber?: string; pickupTime?: string };
  meetingPoint?: { lat?: number; lng?: number; label?: string };
}

/** Pure builder for the operator "new booking" notification (exported for preview/tests). */
export const renderAdminBookingNotificationHtml = (
  brand: EmailBrand,
  details: AdminBookingDetails,
  adminUrl: string
): string => {
  const emailHref = safeMailtoAddress(details.guestEmail);
  const phoneHref = details.guestPhone.replace(/[^+0-9]/g, '');
  const title = details.attractionTitle || 'Experience';
  const totalGuests = details.adults + details.children;
  const guestsText = `${totalGuests} · ${details.adults} adult${details.adults === 1 ? '' : 's'}${details.children ? `, ${details.children} child${details.children === 1 ? '' : 'ren'}` : ''}`;
  const isPaid = !!details.paymentMethod && details.paymentMethod !== 'pay-later';
  const dateStr = `${details.date}${details.time ? ` at ${details.time}` : ''}`;
  const pickups = details.hotelPickups || (details.hotelPickup ? [details.hotelPickup] : []);

  const rows: EmailDetailRow[] = [
    { label: 'Experience', valueHtml: escapeEmailHtml(title) },
    { label: 'Date & time', valueHtml: escapeEmailHtml(dateStr) },
    { label: 'Guests', valueHtml: escapeEmailHtml(guestsText) },
    ...pickupRows(pickups),
    { label: 'Lead traveller', valueHtml: escapeEmailHtml(details.guestName) },
    { label: 'Email', valueHtml: emailHref ? emailLink(brand, `mailto:${emailHref}`, escapeEmailHtml(details.guestEmail)) : escapeEmailHtml(details.guestEmail) },
    { label: 'Phone', valueHtml: phoneHref ? emailLink(brand, `tel:${phoneHref}`, escapeEmailHtml(details.guestPhone)) : escapeEmailHtml(details.guestPhone) },
    { label: 'Payment', valueHtml: isPaid ? 'Paid online' : 'Pay at location' },
    { label: 'Total', valueHtml: `${escapeEmailHtml(details.currency)} ${details.total.toFixed(2)}`, emphasis: true },
  ];

  return renderEmailDocument({
    brand,
    title: 'New booking',
    preheader: `${details.guestName} booked ${title} — ${dateStr} · ${details.reference}.`,
    badge: { label: 'New booking', tone: 'brand' },
    heading: `${details.guestName} booked ${title}`,
    introHtml: `Reference ${emailCode(details.reference)} · ${escapeEmailHtml(dateStr)}`,
    blocks: [
      emailDetails(brand, rows),
      emailButtons(
        brand,
        { label: 'Open in admin', url: safeHttpUrl(adminUrl) },
        emailHref ? { label: `Email ${firstNameOf(details.guestName, 'guest')}`, url: `mailto:${emailHref}?subject=${encodeURIComponent(`Your booking ${details.reference}`)}` } : undefined
      ),
      renderMeetingPointBlock(brand, details.meetingPoint),
    ],
    footer: { note: `Sent automatically when a guest completes checkout on ${details.tenantName}.` },
  });
};

export const sendAdminBookingNotification = async (
  recipientEmail: string,
  details: AdminBookingDetails,
  tenant: EmailTenant | null
): Promise<void> => {
  const brand = getEmailBrand(tenant);
  const adminUrl = brandedLink(brand, '/admin/bookings');
  const html = renderAdminBookingNotificationHtml(brand, details, adminUrl);
  await sendEmail({
    to: recipientEmail,
    subject: `New booking · ${details.reference} · ${details.attractionTitle || 'Experience'}`,
    html,
    tenant: tenant || null,
  });
};

export interface BookingStatusEmailDetails {
  reference: string;
  guestName: string;
  kind: 'cancelled' | 'refunded';
  guestAccessToken?: string;
  refundAmount?: number;
  currency?: string;
  fullRefund?: boolean;
}

export const renderBookingStatusEmailHtml = (
  brand: EmailBrand,
  details: BookingStatusEmailDetails
): string => {
  const firstName = escapeEmailHtml(firstNameOf(details.guestName));
  const reference = escapeEmailHtml(details.reference);
  const viewUrl = brandedLink(brand, '/checkout/confirmation', {
    ref: details.reference,
    ...(details.guestAccessToken ? { accessToken: details.guestAccessToken } : {}),
  });
  const refund = Number.isFinite(details.refundAmount) && details.refundAmount
    ? `${(details.currency || '').toUpperCase()} ${details.refundAmount.toFixed(2)}`.trim()
    : '';

  if (details.kind === 'cancelled') {
    return renderActionEmail(brand, {
      title: `Booking cancelled · ${details.reference}`,
      badge: { label: 'Booking cancelled', tone: 'danger' },
      heading: 'Your booking is cancelled',
      intro: `Hi ${firstName}, booking <strong>${reference}</strong> has been cancelled.`,
      details: [
        { label: 'Booking reference', valueHtml: emailCode(details.reference) },
        ...(refund && details.currency ? [{ label: 'Refund', valueHtml: escapeEmailHtml(refund), emphasis: true }] : []),
      ],
      note: refund && details.currency
        ? `A refund of ${refund} has been processed to the original payment method.`
        : 'No online payment was collected for this booking.',
      ctaLabel: 'View booking',
      ctaUrl: viewUrl,
      footerNote: 'Questions? Reply to this email and our team will help.',
    });
  }

  const amount = refund || 'your payment';
  return renderActionEmail(brand, {
    title: `Refund processed · ${details.reference}`,
    badge: { label: 'Refund processed', tone: 'success' },
    heading: details.fullRefund ? 'Your refund is complete' : 'Your partial refund is complete',
    intro: `Hi ${firstName}, a refund of <strong>${escapeEmailHtml(amount)}</strong> has been processed for booking <strong>${reference}</strong>.`,
    details: [
      { label: 'Booking reference', valueHtml: emailCode(details.reference) },
      ...(refund ? [{ label: 'Refund', valueHtml: escapeEmailHtml(refund), emphasis: true }] : []),
    ],
    note: 'Your bank may take several business days to show the credit on your statement.',
    ctaLabel: 'View booking',
    ctaUrl: viewUrl,
    footerNote: 'Questions? Reply to this email and our team will help.',
  });
};

export const sendBookingStatusEmail = async (
  email: string,
  details: BookingStatusEmailDetails,
  tenant: EmailTenant | null
): Promise<void> => {
  const brand = getEmailBrand(tenant);
  await sendEmail({
    to: email,
    subject: `${details.kind === 'cancelled' ? 'Booking cancelled' : 'Refund processed'} · ${safeDisplayName(details.reference)}`,
    html: renderBookingStatusEmailHtml(brand, details),
    tenant,
  });
};

export const renderPasswordResetHtml = (brand: EmailBrand, input: { userName: string; resetUrl: string }): string =>
  renderActionEmail(brand, {
    title: 'Password reset',
    badge: { label: 'Account security', tone: 'neutral' },
    heading: 'Reset your password',
    intro: `Hi ${escapeEmailHtml(firstNameOf(input.userName))}, we received a request to reset your password. Choose a new one with the button below — this link expires in 1 hour.`,
    ctaLabel: 'Reset password',
    ctaUrl: input.resetUrl,
    note: "If you didn't request this, you can safely ignore this email — your password won't change.",
  });

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  userName: string,
  tenant: EmailTenant | null
): Promise<void> => {
  const brand = getEmailBrand(tenant);
  const resetUrl = brandedLink(brand, '/reset-password', { token: resetToken });
  await sendEmail({
    to: email,
    subject: `Reset your password · ${brand.name}`,
    html: renderPasswordResetHtml(brand, { userName, resetUrl }),
    tenant: tenant || null,
  });
};

export const renderInvitationHtml = (brand: EmailBrand, input: { inviterName: string; role: string; inviteUrl: string }): string =>
  renderActionEmail(brand, {
    title: 'Invitation',
    badge: { label: 'Team invitation', tone: 'brand' },
    heading: `Join ${brand.name}`,
    intro: `${escapeEmailHtml(input.inviterName)} has invited you to join <strong>${escapeEmailHtml(brand.name)}</strong> as a <strong>${escapeEmailHtml(input.role)}</strong>. Accept to set up your account.`,
    details: [
      { label: 'Invited by', valueHtml: escapeEmailHtml(input.inviterName) },
      { label: 'Role', valueHtml: escapeEmailHtml(input.role) },
      { label: 'Invitation expires', valueHtml: 'In 7 days' },
    ],
    ctaLabel: 'Accept invitation',
    ctaUrl: input.inviteUrl,
    note: "If you weren't expecting this invitation, you can ignore this email.",
  });

export const sendUserInvitation = async (
  email: string,
  invitationToken: string,
  inviterName: string,
  role: string,
  tenant: EmailTenant | null
): Promise<void> => {
  // Brand the link + copy for the invited user's site (custom domain when set,
  // else the shared origin with ?tenant= so the set-password page themes right).
  const brand = getEmailBrand(tenant);
  const inviteUrl = brandedLink(brand, '/accept-invitation', { token: invitationToken });
  await sendEmail({
    to: email,
    subject: `You're invited to join ${brand.name}`,
    html: renderInvitationHtml(brand, { inviterName, role, inviteUrl }),
    tenant: tenant || null,
  });
};

// Default programme shown in guest confirmation emails. If RSVPs for other
// events need different programmes, pass `programme` in the rsvp object.
const DEFAULT_OPENING_PROGRAMME = [
  'Horse show',
  'Children’s programme',
  'Pony rides',
  'Carriage rides',
  'Snacks and drinks',
  'and more…',
];

export const sendEventRsvpNotification = async (
  recipientEmail: string,
  rawRsvp: {
    eventName: string;
    eventDate: string;
    eventLocation: string;
    tenantName: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    adultsCount: number;
    childrenCount: number;
    message?: string;
  },
  tenant: EmailTenant | null
): Promise<void> => {
  const rsvp = {
    ...rawRsvp,
    eventName: escapeEmailHtml(rawRsvp.eventName),
    eventDate: escapeEmailHtml(rawRsvp.eventDate),
    eventLocation: escapeEmailHtml(rawRsvp.eventLocation),
    tenantName: escapeEmailHtml(rawRsvp.tenantName),
    firstName: escapeEmailHtml(rawRsvp.firstName),
    lastName: escapeEmailHtml(rawRsvp.lastName),
    email: escapeEmailHtml(rawRsvp.email),
    phone: escapeEmailHtml(rawRsvp.phone),
    message: rawRsvp.message ? escapeEmailHtml(rawRsvp.message) : undefined,
  };
  const totalGuests = rsvp.adultsCount + rsvp.childrenCount;
  const adminPanelUrl = brandedLink(getEmailBrand(tenant), '/admin/rsvps');
  let receivedAt: string;
  try {
    receivedAt = new Date().toLocaleString(tenant?.defaultLanguage || 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(tenant?.timezone ? { timeZone: tenant.timezone } : {}),
    });
  } catch {
    receivedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  }
  const emailHref = safeMailtoAddress(rawRsvp.email);
  const phoneHref = rawRsvp.phone.replace(/[^+0-9]/g, '');
  const preheader = `${rsvp.firstName} ${rsvp.lastName} — ${totalGuests} guest${totalGuests === 1 ? '' : 's'} (${rsvp.adultsCount} adult${rsvp.adultsCount === 1 ? '' : 's'}, ${rsvp.childrenCount} child${rsvp.childrenCount === 1 ? '' : 'ren'})`;

  const brand = getEmailBrand(tenant);
  const adminHtml = renderEmailDocument({
    brand,
    title: `New RSVP · ${rawRsvp.eventName}`,
    preheader,
    badge: { label: 'New RSVP', tone: 'brand' },
    heading: `${rawRsvp.firstName} ${rawRsvp.lastName} is coming to ${rawRsvp.eventName}`,
    introHtml: `${rsvp.eventDate} · ${rsvp.eventLocation}`,
    blocks: [
      emailStats(brand, [
        { value: totalGuests, label: `Guest${totalGuests === 1 ? '' : 's'}` },
        { value: rsvp.adultsCount, label: `Adult${rsvp.adultsCount === 1 ? '' : 's'}` },
        { value: rsvp.childrenCount, label: `Child${rsvp.childrenCount === 1 ? '' : 'ren'}` },
      ]),
      emailDetails(brand, [
        { label: 'Name', valueHtml: `${rsvp.firstName} ${rsvp.lastName}` },
        { label: 'Email', valueHtml: emailHref ? emailLink(brand, `mailto:${emailHref}`, rsvp.email) : rsvp.email },
        { label: 'Phone', valueHtml: phoneHref ? emailLink(brand, `tel:${phoneHref}`, rsvp.phone) : rsvp.phone },
        { label: 'Site', valueHtml: rsvp.tenantName },
        { label: 'Received', valueHtml: escapeEmailHtml(receivedAt) },
      ], { eyebrow: 'Guest details' }),
      rawRsvp.message ? emailQuote(brand, 'Message from guest', rawRsvp.message) : '',
      emailButtons(
        brand,
        { label: 'Manage RSVPs', url: adminPanelUrl },
        emailHref ? { label: `Email ${firstNameOf(rawRsvp.firstName, 'guest')}`, url: `mailto:${emailHref}` } : undefined
      ),
    ],
    footer: { note: `Automated notification from ${rawRsvp.tenantName}.` },
  });

  await sendEmail({
    to: recipientEmail,
    subject: `RSVP · ${safeDisplayName(rawRsvp.firstName)} ${safeDisplayName(rawRsvp.lastName)} · ${totalGuests} guest${totalGuests === 1 ? '' : 's'} · ${safeDisplayName(rawRsvp.eventName)}`,
    html: adminHtml,
    tenant,
  });
};

export const sendEventRsvpConfirmation = async (
  guestEmail: string,
  rawRsvp: {
    eventName: string;
    eventDate: string;
    eventLocation: string;
    tenantName: string;
    firstName: string;
    adultsCount: number;
    childrenCount: number;
    programme?: string[];
    eventTime?: string;
  },
  tenant: EmailTenant | null
): Promise<void> => {
  const rsvp = {
    ...rawRsvp,
    eventName: escapeEmailHtml(rawRsvp.eventName),
    eventDate: escapeEmailHtml(rawRsvp.eventDate),
    eventLocation: escapeEmailHtml(rawRsvp.eventLocation),
    tenantName: escapeEmailHtml(rawRsvp.tenantName),
    firstName: escapeEmailHtml(rawRsvp.firstName),
    programme: rawRsvp.programme?.map(escapeEmailHtml),
    eventTime: rawRsvp.eventTime ? escapeEmailHtml(rawRsvp.eventTime) : undefined,
  };
  const totalGuests = rsvp.adultsCount + rsvp.childrenCount;
  const eventTime = rsvp.eventTime || '5 PM – 10 PM';
  const preheader = `You’re on the list for ${rsvp.eventName} — ${rsvp.eventDate} · ${eventTime}. We are happy to welcome you soon.`;

  const brand = getEmailBrand(tenant);
  const programmeItems = rawRsvp.programme && rawRsvp.programme.length > 0 ? rawRsvp.programme : DEFAULT_OPENING_PROGRAMME;
  const guestHtml = renderEmailDocument({
    brand,
    title: `${rawRsvp.eventName} — Your RSVP is confirmed`,
    preheader,
    badge: { label: 'RSVP confirmed', tone: 'success' },
    heading: `Thank you, ${rawRsvp.firstName}`,
    introHtml: `You're on the list for <strong>${rsvp.eventName}</strong>. We are delighted to welcome you${totalGuests > 1 ? ' and your guests' : ''}.`,
    blocks: [
      emailDetails(brand, [
        { label: 'Date', valueHtml: rsvp.eventDate },
        { label: 'Time', valueHtml: eventTime },
        { label: 'Location', valueHtml: rsvp.eventLocation },
        { label: 'Guests', valueHtml: `${totalGuests} · ${rsvp.adultsCount} adult${rsvp.adultsCount === 1 ? '' : 's'}, ${rsvp.childrenCount} child${rsvp.childrenCount === 1 ? '' : 'ren'}` },
      ], { eyebrow: 'Your invitation', titleHtml: rsvp.eventName }),
      emailList(brand, 'Programme', programmeItems.map((item) => ({ title: item }))),
      emailNotice(brand, 'brand', `We are happy to welcome you soon. — The ${rsvp.tenantName} team`),
    ],
    footer: { note: 'Questions? Simply reply to this email and our team will be in touch.', contact: brand.contact },
  });

  await sendEmail({
    to: guestEmail,
    subject: `You're on the list · ${safeDisplayName(rawRsvp.eventName)}`,
    html: guestHtml,
    tenant,
  });
};

/** Every field a visitor can provide on a site contact or tour enquiry form. */
export interface ContactEnquiryDetails {
  reference: string;
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  tourSlug?: string;
  tourTitle?: string;
  travelDate?: string;
  guests?: number;
  message: string;
  pagePath?: string;
  locale?: string;
}

/** What happened to the operator notification for a stored enquiry. Provider
 *  failures are thrown, never folded into an outcome, so callers log them. */
export type ContactEmailOutcome =
  | { status: 'sent' }
  | { status: 'skipped'; reason: 'provider_not_configured' }
  | { status: 'failed'; reason: 'no_recipient' };

const singleLine = (value: string): string => value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

export const contactEnquirySubject = (details: ContactEnquiryDetails): string =>
  singleLine(
    `New enquiry ${details.reference}: ${details.tourTitle?.trim() || details.subject?.trim() || 'Website message'}`
  ).slice(0, 200);

export const renderContactFormHtml = (tenant: EmailTenant, details: ContactEnquiryDetails): string => {
  const brand = getEmailBrand(tenant);
  const mailto = safeMailtoAddress(details.email);
  const telephone = details.phone?.replace(/[^0-9+]/g, '');
  const topic = singleLine(details.tourTitle?.trim() || details.subject?.trim() || 'Website message');
  // The operator knows tours by name; the internal slug is shown only when the title is missing.
  const tour = details.tourTitle?.trim() || details.tourSlug?.trim() || '';
  const replyUrl = mailto
    ? `mailto:${mailto}?subject=${encodeURIComponent(`Re: ${topic} (${singleLine(details.reference)})`)}`
    : undefined;
  const inboxUrl = brandedLink(brand, '/admin/messages');

  const rows: EmailDetailRow[] = [
    { label: 'Reference', valueHtml: emailCode(details.reference) },
    { label: 'Name', valueHtml: escapeEmailHtml(details.name) },
    { label: 'Email', valueHtml: mailto ? emailLink(brand, `mailto:${mailto}`, escapeEmailHtml(mailto)) : escapeEmailHtml(details.email) },
  ];
  if (details.phone) {
    rows.push({ label: 'Phone', valueHtml: telephone ? emailLink(brand, `tel:${telephone}`, escapeEmailHtml(details.phone)) : escapeEmailHtml(details.phone) });
  }
  if (tour) rows.push({ label: 'Tour', valueHtml: escapeEmailHtml(tour) });
  if (details.travelDate) rows.push({ label: 'Travel date', valueHtml: escapeEmailHtml(details.travelDate) });
  if (details.guests !== undefined && details.guests !== null) rows.push({ label: 'Guests', valueHtml: escapeEmailHtml(details.guests) });
  if (details.subject) rows.push({ label: 'Subject', valueHtml: escapeEmailHtml(details.subject) });
  if (details.pagePath) rows.push({ label: 'Page', valueHtml: escapeEmailHtml(details.pagePath) });
  if (details.locale) rows.push({ label: 'Language', valueHtml: escapeEmailHtml(details.locale) });

  return renderEmailDocument({
    brand,
    title: `New enquiry ${details.reference}`,
    preheader: `${details.name}: ${singleLine(details.message).slice(0, 110)}`,
    badge: { label: 'New enquiry', tone: 'brand' },
    heading: `${details.name} sent a message`,
    introHtml: `About <strong>${escapeEmailHtml(topic)}</strong> · via the ${escapeEmailHtml(brand.name)} contact form`,
    blocks: [
      emailQuote(brand, 'Message', details.message),
      emailDetails(brand, rows, { eyebrow: 'Enquiry details' }),
      emailButtons(
        brand,
        replyUrl ? { label: `Reply to ${firstNameOf(details.name, 'visitor')}`, url: replyUrl } : { label: 'Open Messages', url: inboxUrl },
        replyUrl ? { label: 'Open Messages', url: inboxUrl } : undefined
      ),
      emailNotice(brand, 'neutral', 'Replying to this email answers the visitor directly. The message is also saved in Admin → Messages.'),
    ],
    footer: { note: `Sent from the contact form on ${brand.name}.` },
  });
};

/**
 * Notifies the site's contact inbox about a stored enquiry. A site without a
 * valid contact address resolves to a recorded failure instead of throwing, so
 * the caller can keep the enquiry and show the operator why no email arrived.
 */
export const sendContactFormEmail = async (
  tenant: EmailTenant,
  details: ContactEnquiryDetails
): Promise<ContactEmailOutcome> => {
  const recipient = tenant.contactInfo?.email?.trim();
  if (!isEmailAddress(recipient)) {
    return { status: 'failed', reason: 'no_recipient' };
  }

  return sendEmail({
    to: recipient,
    subject: contactEnquirySubject(details),
    html: renderContactFormHtml(tenant, details),
    tenant,
    replyTo: details.email,
  });
};
