import Mailgun from 'mailgun.js';
import formData from 'form-data';
import { env } from '../config/env';

const mailgun = new Mailgun(formData);
const mg = env.mailgunApiKey
  ? mailgun.client({ username: 'api', key: env.mailgunApiKey })
  : null;

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    data: Buffer;
  }>;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  if (!mg || !env.mailgunDomain) {
    console.log('Mailgun not configured. Would send:', options.subject, 'to:', options.to);
    return;
  }

  const messageData: Record<string, unknown> = {
    from: env.mailgunFromEmail,
    to: [options.to],
    subject: options.subject,
    html: options.html,
  };

  if (options.attachments && options.attachments.length > 0) {
    messageData.attachment = options.attachments.map((a) => ({
      filename: a.filename,
      data: a.data,
    }));
  }

  await mg.messages.create(env.mailgunDomain, messageData as any);
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
}

export interface EmailBrand {
  name: string;
  origin: string;
  slug?: string; // set only when NOT on a custom domain (needs ?tenant=)
  color: string; // brand primary, used for the email header/accents/button
  logo?: string; // absolute URL to the tenant logo, shown in the email header
}

export const getEmailBrand = (tenant?: EmailTenant | null): EmailBrand => {
  const base = env.frontendUrl.split(',')[0].trim().replace(/\/+$/, '');
  const name = tenant?.name?.trim() || 'Foxes Network';
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
    return /^https?:\/\//i.test(l) ? l : `${origin}${l.startsWith('/') ? '' : '/'}${l}`;
  };
  const cd = tenant?.customDomain?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
  if (cd && (tenant?.domainMigrated || MIGRATED_DOMAINS.has(cd))) {
    const origin = `https://${cd}`;
    return { name, origin, color, logo: absLogo(origin) };
  }
  return { name, origin: base, slug: tenant?.slug, color, logo: absLogo(base) };
};

/** The brand mark for an email header. Renders the tenant logo inside a white chip
 *  (so a dark/coloured logo stays legible on the brand-coloured header bar), falling
 *  back to the brand name as text when there's no logo — which is also the `alt`,
 *  so a blocked image still shows the brand. */
const brandHeaderMark = (brand: EmailBrand): string =>
  brand.logo
    ? `<span style="display:inline-block;background:#ffffff;border-radius:8px;padding:7px 12px;line-height:0;"><img src="${brand.logo}" alt="${brand.name}" height="30" style="height:30px;max-height:30px;width:auto;display:block;border:0;"></span>`
    : `<span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:0.3px;">${brand.name}</span>`;

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
  hotelPickup?: { hotelName?: string; roomNumber?: string; pickupTime?: string };
  meetingPoint?: { lat?: number; lng?: number; label?: string };
}

/**
 * Static meeting-point map card for the booking emails. Emails can't run the live
 * iframe map used on the confirmation page, so this renders a static map image —
 * proxied through the wsrv.nl image CDN so it loads reliably across email clients —
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
  // configured — the same key the tourticket/EEO sites use. Fall back to a keyless
  // static-map source (proxied via wsrv.nl for reliable email rendering) so the map
  // still shows even without a key.
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
  return `
        <tr><td class="px" style="padding:14px 34px 4px;">
          <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#9aa1ad;margin:0 0 8px;">Meeting point</div>
          ${mp.label ? `<p style="margin:0 0 10px;font-size:14px;color:#16181d;font-weight:600;line-height:1.45;">${mp.label}</p>` : ''}
          <a href="${mapsLink}" target="_blank" style="text-decoration:none;">
            <img src="${mapImg}" width="532" alt="Map to the meeting point" style="display:block;width:100%;max-width:532px;height:auto;border-radius:12px;border:1px solid #ececf0;">
          </a>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 0;"><tr>
            <td bgcolor="#eef0f3" style="border-radius:8px;">
              <a href="${mapsLink}" target="_blank" style="display:inline-block;padding:10px 20px;font-size:13px;font-weight:700;color:${brand.color};text-decoration:none;border-radius:8px;">&#128205; Get directions</a>
            </td>
          </tr></table>
        </td></tr>`;
};

/**
 * Shared builder for a simple branded "action" email (password reset, invitation).
 * Uses the tenant logo + brand colour via getEmailBrand — so these transactional
 * emails carry the operator's brand instead of a generic purple "Foxes Network"
 * template. Responsive + table-based like the booking emails.
 */
export const renderActionEmail = (
  brand: EmailBrand,
  opts: { title: string; heading: string; intro: string; note?: string; ctaLabel: string; ctaUrl: string }
): string => {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${opts.title}</title>
<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}body{margin:0;padding:0;width:100%!important;background:#f2f2f4;}@media screen and (max-width:600px){.container{width:100%!important;border-radius:0!important;}.px{padding-left:22px!important;padding-right:22px!important;}.btn a{display:block!important;}h1{font-size:21px!important;}}</style></head>
<body dir="ltr" style="margin:0;padding:0;background:#f2f2f4;direction:ltr;text-align:left;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f4;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" dir="ltr" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td class="px" style="background:${brand.color};padding:24px 34px;">${brandHeaderMark(brand)}</td></tr>
<tr><td class="px" style="padding:34px 34px 4px;"><h1 style="margin:0 0 10px;font-size:23px;line-height:1.3;color:#16181d;font-weight:700;">${opts.heading}</h1><p style="margin:0;font-size:15px;line-height:1.6;color:#5b6472;">${opts.intro}</p></td></tr>
<tr><td class="px btn" style="padding:24px 34px 6px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" bgcolor="${brand.color}" style="border-radius:10px;"><a href="${opts.ctaUrl}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${opts.ctaLabel}</a></td></tr></table></td></tr>
${opts.note ? `<tr><td class="px" style="padding:10px 34px 6px;"><p style="margin:0;font-size:13px;line-height:1.6;color:#8a909c;">${opts.note}</p></td></tr>` : ''}
<tr><td class="px" style="padding:22px 34px;background:#fafafb;border-top:1px solid #ececf0;"><p style="margin:0;font-size:12px;color:#adb2bd;">&copy; ${year} ${brand.name}. All rights reserved.</p></td></tr>
</table></td></tr></table></body></html>`;
};

/** Pure builder for the customer booking-confirmation email (exported so it can be
 *  previewed/unit-tested without sending). Responsive, table-based, brand-coloured. */
export const renderBookingConfirmationHtml = (
  brand: EmailBrand,
  bookingDetails: BookingEmailDetails,
  hasTicket = false
): string => {
  const viewUrl = brandedLink(brand, '/checkout/confirmation', {
    ref: bookingDetails.reference,
    ...(bookingDetails.guestAccessToken ? { accessToken: bookingDetails.guestAccessToken } : {}),
  });
  const firstName = (bookingDetails.guestName || 'there').trim().split(/\s+/)[0];
  const isPaid = !!bookingDetails.paymentMethod && bookingDetails.paymentMethod !== 'pay-later';
  const totalLabel = isPaid ? 'Total paid' : 'Total';
  const totalNote = isPaid ? 'Paid online' : 'Pay at location — collected on arrival';
  const dateStr = `${bookingDetails.date}${bookingDetails.time ? ` at ${bookingDetails.time}` : ''}`;
  const year = new Date().getFullYear();

  const row = (label: string, value: string, opts: { note?: string; first?: boolean } = {}): string => `
                <tr>
                  <td dir="ltr" width="38%" style="padding:12px 0;${opts.first ? '' : 'border-top:1px solid #f0f0f3;'}color:#6b7280;font-size:13px;vertical-align:top;text-align:left;direction:ltr;">${label}${opts.note ? `<div style="color:#a0a6b0;font-size:12px;margin-top:2px;">${opts.note}</div>` : ''}</td>
                  <td dir="ltr" align="left" style="padding:12px 0 12px 18px;${opts.first ? '' : 'border-top:1px solid #f0f0f3;'}color:#16181d;font-weight:600;font-size:14px;vertical-align:top;text-align:left;direction:ltr;unicode-bidi:isolate;word-break:break-word;">${value}</td>
                </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>Booking confirmed</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{border:0;line-height:100%;outline:none;text-decoration:none;}
    body{margin:0;padding:0;width:100%!important;background:#f2f2f4;}
    @media screen and (max-width:600px){
      .container{width:100%!important;border-radius:0!important;}
      .px{padding-left:22px!important;padding-right:22px!important;}
      .btn a{display:block!important;}
      h1{font-size:22px!important;}
    }
  </style>
</head>
<body dir="ltr" style="margin:0;padding:0;background:#f2f2f4;direction:ltr;text-align:left;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Booking confirmed — ${bookingDetails.reference} · ${bookingDetails.attractionTitle} on ${dateStr}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f4;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" dir="ltr" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td class="px" style="background:${brand.color};padding:24px 34px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;">${brandHeaderMark(brand)}</td>
            <td align="right" style="vertical-align:middle;"><span style="display:inline-block;background:rgba(255,255,255,0.2);color:#ffffff;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;padding:5px 12px;border-radius:999px;">Confirmed</span></td>
          </tr></table>
        </td></tr>
        <tr><td class="px" style="padding:34px 34px 6px;">
          <div style="width:46px;height:46px;border-radius:50%;background:#eef0f3;color:${brand.color};font-size:24px;line-height:46px;text-align:center;font-weight:700;">&#10003;</div>
          <h1 style="margin:18px 0 6px;font-size:25px;line-height:1.25;color:#16181d;font-weight:700;">You're all set, ${firstName}!</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#5b6472;">Your booking is confirmed. The details are below${hasTicket ? " and your e-ticket is attached" : ""}.</p>
        </td></tr>
        <tr><td class="px" style="padding:22px 34px 6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ececf0;border-radius:12px;">
            <tr><td style="padding:18px 20px 4px;">
              <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#9aa1ad;">Experience</div>
              <div style="font-size:18px;font-weight:700;color:#16181d;margin-top:4px;line-height:1.3;">${bookingDetails.attractionTitle}</div>
            </td></tr>
            <tr><td style="padding:6px 20px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${row('Booking reference', `<span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-weight:700;letter-spacing:0.5px;">${bookingDetails.reference}</span>`, { first: true })}
${row('Date &amp; time', dateStr)}
${bookingDetails.guests ? row('Guests', String(bookingDetails.guests)) : ''}
${bookingDetails.hotelPickup?.hotelName ? row('Hotel pickup', `${bookingDetails.hotelPickup.hotelName}${bookingDetails.hotelPickup.roomNumber ? `, Room ${bookingDetails.hotelPickup.roomNumber}` : ''}${bookingDetails.hotelPickup.pickupTime ? ` &middot; ${bookingDetails.hotelPickup.pickupTime}` : ''}`) : ''}
${row(totalLabel, `<span style="font-size:18px;font-weight:800;color:${brand.color};">${bookingDetails.currency} ${bookingDetails.total.toFixed(2)}</span>`, { note: totalNote })}
              </table>
            </td></tr>
          </table>
        </td></tr>
${renderMeetingPointBlock(brand, bookingDetails.meetingPoint)}
        <tr><td class="px btn" style="padding:24px 34px 4px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
            <td align="center" bgcolor="${brand.color}" style="border-radius:10px;">
              <a href="${viewUrl}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">View booking</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td class="px" style="padding:14px 34px 30px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#8a909c;text-align:center;">${hasTicket ? 'Show the attached e-ticket on your phone at the venue.' : 'Bring this confirmation with you to the venue.'}</p>
        </td></tr>
        <tr><td class="px" style="padding:22px 34px;background:#fafafb;border-top:1px solid #ececf0;">
          <p style="margin:0 0 4px;font-size:12px;line-height:1.6;color:#8a909c;">Questions? Just reply to this email — our team is happy to help.</p>
          <p style="margin:0;font-size:12px;color:#adb2bd;">&copy; ${year} ${brand.name}. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return html;
};

export const sendBookingConfirmation = async (
  email: string,
  bookingDetails: BookingEmailDetails,
  ticketPdf?: Buffer,
  tenant?: EmailTenant | null
): Promise<void> => {
  const brand = getEmailBrand(tenant);
  const html = renderBookingConfirmationHtml(brand, bookingDetails, !!ticketPdf);
  await sendEmail({
    to: email,
    subject: `Booking confirmed · ${bookingDetails.reference}`,
    html,
    attachments: ticketPdf
      ? [{ filename: `ticket-${bookingDetails.reference}.pdf`, data: ticketPdf }]
      : undefined,
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
  hotelPickup?: { hotelName?: string; roomNumber?: string; pickupTime?: string };
  meetingPoint?: { lat?: number; lng?: number; label?: string };
}

/** Pure builder for the operator "new booking" notification (exported for preview/tests).
 *  Responsive, table-based, brand-coloured — matches the customer confirmation. */
export const renderAdminBookingNotificationHtml = (
  brand: EmailBrand,
  details: AdminBookingDetails,
  adminUrl: string
): string => {
  const title = details.attractionTitle || 'Experience';
  const totalGuests = details.adults + details.children;
  const guestsText = `${totalGuests} · ${details.adults} adult${details.adults === 1 ? '' : 's'}${details.children ? `, ${details.children} child${details.children === 1 ? '' : 'ren'}` : ''}`;
  const isPaid = !!details.paymentMethod && details.paymentMethod !== 'pay-later';
  const paymentText = isPaid ? 'Paid online' : 'Pay at location';
  const dateStr = `${details.date}${details.time ? ` at ${details.time}` : ''}`;

  const row = (label: string, value: string, first = false): string => `
                <tr>
                  <td dir="ltr" width="38%" style="padding:12px 0;${first ? '' : 'border-top:1px solid #f0f0f3;'}color:#6b7280;font-size:13px;vertical-align:top;text-align:left;direction:ltr;">${label}</td>
                  <td dir="ltr" align="left" style="padding:12px 0 12px 18px;${first ? '' : 'border-top:1px solid #f0f0f3;'}color:#16181d;font-weight:600;font-size:14px;vertical-align:top;text-align:left;direction:ltr;unicode-bidi:isolate;word-break:break-word;">${value}</td>
                </tr>`;

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>New booking</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    body{margin:0;padding:0;width:100%!important;background:#f2f2f4;}
    @media screen and (max-width:600px){
      .container{width:100%!important;border-radius:0!important;}
      .px{padding-left:22px!important;padding-right:22px!important;}
      .btn a{display:block!important;}
      h1{font-size:21px!important;}
    }
  </style>
</head>
<body dir="ltr" style="margin:0;padding:0;background:#f2f2f4;direction:ltr;text-align:left;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${details.guestName} booked ${title} — ${dateStr} · ${details.reference}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f4;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" dir="ltr" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td class="px" style="background:${brand.color};padding:24px 34px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;">${brandHeaderMark(brand)}</td>
            <td align="right" style="vertical-align:middle;"><span style="display:inline-block;background:rgba(255,255,255,0.2);color:#ffffff;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;padding:5px 12px;border-radius:999px;">New booking</span></td>
          </tr></table>
        </td></tr>
        <tr><td class="px" style="padding:32px 34px 6px;">
          <h1 style="margin:0 0 6px;font-size:23px;line-height:1.3;color:#16181d;font-weight:700;"><strong>${details.guestName}</strong> just booked ${title}</h1>
          <p style="margin:0;font-size:14px;color:#8a909c;">Reference <span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-weight:700;color:#5b6472;">${details.reference}</span></p>
        </td></tr>
        <tr><td class="px" style="padding:20px 34px 6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ececf0;border-radius:12px;">
            <tr><td style="padding:8px 20px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${row('Experience', title, true)}
${row('Date &amp; time', dateStr)}
${row('Guests', guestsText)}
${details.hotelPickup?.hotelName ? row('Hotel pickup', `${details.hotelPickup.hotelName}${details.hotelPickup.roomNumber ? `, Room ${details.hotelPickup.roomNumber}` : ''}${details.hotelPickup.pickupTime ? ` &middot; ${details.hotelPickup.pickupTime}` : ''}`) : ''}
${row('Lead traveller', details.guestName)}
${row('Email', `<a href="mailto:${details.guestEmail}" style="color:${brand.color};text-decoration:none;font-weight:600;">${details.guestEmail}</a>`)}
${row('Phone', `<a href="tel:${details.guestPhone}" style="color:#16181d;text-decoration:none;">${details.guestPhone}</a>`)}
${row('Payment', paymentText)}
${row('Total', `<span style="font-size:17px;font-weight:800;color:${brand.color};">${details.currency} ${details.total.toFixed(2)}</span>`)}
              </table>
            </td></tr>
          </table>
        </td></tr>
${renderMeetingPointBlock(brand, details.meetingPoint)}
        <tr><td class="px btn" style="padding:22px 34px 4px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
            <td align="center" bgcolor="${brand.color}" style="border-radius:10px;">
              <a href="${adminUrl}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">Open in admin</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td class="px" style="padding:20px 34px;background:#fafafb;border-top:1px solid #ececf0;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#8a909c;">Sent automatically when a guest completes checkout on ${details.tenantName}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

export const sendAdminBookingNotification = async (
  recipientEmail: string,
  details: AdminBookingDetails,
  tenant?: EmailTenant | null
): Promise<void> => {
  const brand = getEmailBrand(tenant);
  const adminUrl = brandedLink(brand, '/admin/bookings');
  const html = renderAdminBookingNotificationHtml(brand, details, adminUrl);
  await sendEmail({
    to: recipientEmail,
    subject: `New booking · ${details.reference} · ${details.attractionTitle || 'Experience'}`,
    html,
  });
};

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  userName: string,
  tenant?: EmailTenant | null
): Promise<void> => {
  const brand = getEmailBrand(tenant);
  const resetUrl = brandedLink(brand, '/reset-password', { token: resetToken });
  const firstName = (userName || 'there').trim().split(/\s+/)[0];

  const html = renderActionEmail(brand, {
    title: 'Password reset',
    heading: 'Reset your password',
    intro: `Hi ${firstName}, we received a request to reset your password. Click below to choose a new one — this link expires in 1 hour.`,
    note: "If you didn't request this, you can safely ignore this email — your password won't change.",
    ctaLabel: 'Reset password',
    ctaUrl: resetUrl,
  });

  await sendEmail({
    to: email,
    subject: `Reset your password · ${brand.name}`,
    html,
  });
};

export const sendUserInvitation = async (
  email: string,
  invitationToken: string,
  inviterName: string,
  role: string,
  tenant?: EmailTenant | null
): Promise<void> => {
  // Brand the link + copy for the invited user's site (custom domain when set,
  // else the shared origin with ?tenant= so the set-password page themes right).
  const brand = getEmailBrand(tenant);
  const inviteUrl = brandedLink(brand, '/accept-invitation', { token: invitationToken });

  const html = renderActionEmail(brand, {
    title: 'Invitation',
    heading: "You're invited",
    intro: `${inviterName} has invited you to join <strong>${brand.name}</strong> as a <strong>${role}</strong>. Click below to accept and set up your account — this invitation expires in 7 days.`,
    ctaLabel: 'Accept invitation',
    ctaUrl: inviteUrl,
  });

  await sendEmail({
    to: email,
    subject: `You're invited to join ${brand.name}`,
    html,
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
  rsvp: {
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
  }
): Promise<void> => {
  const totalGuests = rsvp.adultsCount + rsvp.childrenCount;
  const adminPanelUrl = `${env.frontendUrl.split(',')[0].trim()}/admin/rsvps`;
  const receivedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const preheader = `${rsvp.firstName} ${rsvp.lastName} — ${totalGuests} guest${totalGuests === 1 ? '' : 's'} (${rsvp.adultsCount} adult${rsvp.adultsCount === 1 ? '' : 's'}, ${rsvp.childrenCount} child${rsvp.childrenCount === 1 ? '' : 'ren'})`;

  const adminHtml = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="dark light" />
  <meta name="supported-color-schemes" content="dark light" />
  <title>New RSVP · ${rsvp.eventName}</title>
  <!--[if mso]>
  <style>table{border-collapse:collapse;border-spacing:0;margin:0;}div,td{padding:0;}div{margin:0!important;}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#0a0604;font-family:Georgia,'Playfair Display',serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#0a0604;opacity:0;">${preheader}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0604" style="background:#0a0604;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Invitation-style hero -->
          <tr>
            <td bgcolor="#1a0f07" style="background:#1a0f07;border:1px solid #B8860B;border-bottom:none;border-radius:14px 14px 0 0;padding:40px 36px 36px;text-align:center;">
              <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:4px;color:#D4A843;text-transform:uppercase;font-weight:600;">New RSVP Received</div>
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto;">
                <tr>
                  <td width="40" height="1" bgcolor="#B8860B" style="background:#B8860B;line-height:1px;font-size:1px;">&nbsp;</td>
                  <td style="padding:0 10px;color:#D4A843;font-size:10px;">♦</td>
                  <td width="40" height="1" bgcolor="#B8860B" style="background:#B8860B;line-height:1px;font-size:1px;">&nbsp;</td>
                </tr>
              </table>
              <h1 style="margin:0;font-family:Georgia,'Playfair Display',serif;font-size:28px;font-style:italic;color:#E5C875;font-weight:400;line-height:1.25;">${rsvp.eventName}</h1>
              <div style="margin-top:14px;font-family:Arial,sans-serif;font-size:12px;color:#D4A843;letter-spacing:2px;text-transform:uppercase;">${rsvp.eventDate}</div>
              <div style="margin-top:4px;font-family:Arial,sans-serif;font-size:11px;color:#D4A843;opacity:0.75;letter-spacing:1.5px;">${rsvp.eventLocation}</div>
            </td>
          </tr>

          <!-- Hero guest count -->
          <tr>
            <td bgcolor="#1a0f07" style="background:#1a0f07;border-left:1px solid #B8860B;border-right:1px solid #B8860B;padding:0 36px 32px;text-align:center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:24px 0 12px;">
                    <div style="font-family:Arial,sans-serif;font-size:10px;color:#D4A843;letter-spacing:3px;text-transform:uppercase;font-weight:600;">Total Attending</div>
                    <div style="font-family:Georgia,'Playfair Display',serif;font-size:72px;color:#E5C875;font-weight:400;line-height:1;margin-top:8px;">${totalGuests}</div>
                    <div style="font-family:Georgia,serif;font-style:italic;color:#D4A843;font-size:13px;margin-top:6px;">guest${totalGuests === 1 ? '' : 's'} to welcome</div>
                  </td>
                </tr>
              </table>

              <!-- Adult + Children pills -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
                <tr>
                  <td width="50%" style="padding-right:6px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0604" style="background:#0a0604;border:1px solid #B8860B;border-radius:8px;">
                      <tr>
                        <td style="padding:18px 12px;text-align:center;">
                          <div style="font-family:Georgia,serif;font-size:34px;color:#E5C875;font-weight:400;line-height:1;">${rsvp.adultsCount}</div>
                          <div style="font-family:Arial,sans-serif;font-size:10px;color:#D4A843;letter-spacing:2.5px;text-transform:uppercase;margin-top:6px;">Adult${rsvp.adultsCount === 1 ? '' : 's'}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td width="50%" style="padding-left:6px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0604" style="background:#0a0604;border:1px solid #B8860B;border-radius:8px;">
                      <tr>
                        <td style="padding:18px 12px;text-align:center;">
                          <div style="font-family:Georgia,serif;font-size:34px;color:#E5C875;font-weight:400;line-height:1;">${rsvp.childrenCount}</div>
                          <div style="font-family:Arial,sans-serif;font-size:10px;color:#D4A843;letter-spacing:2.5px;text-transform:uppercase;margin-top:6px;">Child${rsvp.childrenCount === 1 ? '' : 'ren'}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Guest details section (cream) -->
          <tr>
            <td bgcolor="#fffaf0" style="background:#fffaf0;border-left:1px solid #B8860B;border-right:1px solid #B8860B;padding:36px 36px 28px;">
              <div style="font-family:Arial,sans-serif;font-size:10px;color:#B8860B;letter-spacing:3px;text-transform:uppercase;font-weight:700;margin-bottom:18px;">Guest Details</div>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid rgba(184,134,11,0.15);">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:Arial,sans-serif;font-size:11px;color:#7A5A33;letter-spacing:1.5px;text-transform:uppercase;">Name</td>
                        <td align="right" style="font-family:Georgia,serif;font-size:15px;color:#2A1A0E;font-weight:600;">${rsvp.firstName} ${rsvp.lastName}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid rgba(184,134,11,0.15);">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:Arial,sans-serif;font-size:11px;color:#7A5A33;letter-spacing:1.5px;text-transform:uppercase;">Email</td>
                        <td align="right" style="font-family:Georgia,serif;font-size:14px;"><a href="mailto:${rsvp.email}" style="color:#B8860B;text-decoration:none;font-weight:600;">${rsvp.email}</a></td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid rgba(184,134,11,0.15);">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:Arial,sans-serif;font-size:11px;color:#7A5A33;letter-spacing:1.5px;text-transform:uppercase;">Phone</td>
                        <td align="right" style="font-family:Georgia,serif;font-size:14px;"><a href="tel:${rsvp.phone.replace(/\s+/g, '')}" style="color:#B8860B;text-decoration:none;font-weight:600;">${rsvp.phone}</a></td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid rgba(184,134,11,0.15);">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:Arial,sans-serif;font-size:11px;color:#7A5A33;letter-spacing:1.5px;text-transform:uppercase;">Site</td>
                        <td align="right" style="font-family:Georgia,serif;font-size:14px;color:#2A1A0E;font-weight:600;">${rsvp.tenantName}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:Arial,sans-serif;font-size:11px;color:#7A5A33;letter-spacing:1.5px;text-transform:uppercase;">Received</td>
                        <td align="right" style="font-family:Georgia,serif;font-size:13px;color:#7A5A33;font-style:italic;">${receivedAt}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${rsvp.message ? `
              <!-- Guest message -->
              <div style="margin-top:26px;">
                <div style="font-family:Arial,sans-serif;font-size:10px;color:#B8860B;letter-spacing:3px;text-transform:uppercase;font-weight:700;margin-bottom:10px;">Message From Guest</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FDF6EC" style="background:#FDF6EC;border-left:3px solid #B8860B;border-radius:0 6px 6px 0;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <div style="font-family:Georgia,serif;font-style:italic;color:#4B3824;font-size:15px;line-height:1.6;">“${rsvp.message.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}”</div>
                    </td>
                  </tr>
                </table>
              </div>
              ` : ''}

              <!-- CTA button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:30px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td bgcolor="#1a0f07" style="background:#1a0f07;border-radius:8px;">
                          <a href="${adminPanelUrl}" style="display:inline-block;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#E5C875;text-decoration:none;padding:14px 28px;border:1px solid #B8860B;border-radius:8px;">Manage All RSVPs →</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#1a0f07" style="background:#1a0f07;border:1px solid #B8860B;border-top:none;border-radius:0 0 14px 14px;padding:22px 36px;text-align:center;">
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 8px;">
                <tr>
                  <td width="30" height="1" bgcolor="#B8860B" style="background:#B8860B;line-height:1px;font-size:1px;opacity:0.5;">&nbsp;</td>
                  <td style="padding:0 8px;color:#D4A843;font-size:9px;">♦</td>
                  <td width="30" height="1" bgcolor="#B8860B" style="background:#B8860B;line-height:1px;font-size:1px;opacity:0.5;">&nbsp;</td>
                </tr>
              </table>
              <div style="font-family:Georgia,serif;font-style:italic;color:#D4A843;font-size:12px;opacity:0.8;">Automated notification · ${rsvp.tenantName} · ${new Date().getFullYear()}</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await sendEmail({
    to: recipientEmail,
    subject: `RSVP · ${rsvp.firstName} ${rsvp.lastName} · ${totalGuests} guest${totalGuests === 1 ? '' : 's'} · ${rsvp.eventName}`,
    html: adminHtml,
  });
};

export const sendEventRsvpConfirmation = async (
  guestEmail: string,
  rsvp: {
    eventName: string;
    eventDate: string;
    eventLocation: string;
    tenantName: string;
    firstName: string;
    adultsCount: number;
    childrenCount: number;
    programme?: string[];
    eventTime?: string;
  }
): Promise<void> => {
  const totalGuests = rsvp.adultsCount + rsvp.childrenCount;
  const programme = rsvp.programme && rsvp.programme.length > 0 ? rsvp.programme : DEFAULT_OPENING_PROGRAMME;
  const eventTime = rsvp.eventTime || '5 PM – 10 PM';
  const preheader = `You’re on the list for ${rsvp.eventName} — ${rsvp.eventDate} · ${eventTime}. We are happy to welcome you soon.`;

  const programmeRows = programme
    .map(
      (item) => `
      <tr>
        <td style="padding:6px 0;font-family:Georgia,'Playfair Display',serif;font-size:16px;color:#E5C875;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="20" style="color:#D4A843;font-size:10px;vertical-align:middle;padding-right:10px;">♦</td>
              <td style="font-family:Georgia,'Playfair Display',serif;font-style:italic;color:#E5C875;font-size:16px;">${item}</td>
            </tr>
          </table>
        </td>
      </tr>`
    )
    .join('');

  const guestHtml = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="dark light" />
  <meta name="supported-color-schemes" content="dark light" />
  <title>${rsvp.eventName} — Your RSVP is Confirmed</title>
  <!--[if mso]>
  <style>table{border-collapse:collapse;border-spacing:0;margin:0;}div,td{padding:0;}div{margin:0!important;}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#0a0604;font-family:Georgia,'Playfair Display',serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#0a0604;opacity:0;">${preheader}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0604" style="background:#0a0604;">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Invitation card (black + gold) -->
          <tr>
            <td bgcolor="#1a0f07" style="background:#1a0f07;border:2px solid #B8860B;border-radius:14px;padding:48px 40px 40px;text-align:center;">
              <!-- Tenant name -->
              <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:5px;color:#D4A843;text-transform:uppercase;font-weight:600;">${rsvp.tenantName.toUpperCase()}</div>

              <!-- Diamond divider -->
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:20px auto;">
                <tr>
                  <td width="60" height="1" bgcolor="#B8860B" style="background:#B8860B;line-height:1px;font-size:1px;">&nbsp;</td>
                  <td style="padding:0 12px;color:#D4A843;font-size:11px;">♦</td>
                  <td width="60" height="1" bgcolor="#B8860B" style="background:#B8860B;line-height:1px;font-size:1px;">&nbsp;</td>
                </tr>
              </table>

              <!-- RSVP CONFIRMED label -->
              <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:4px;color:#D4A843;text-transform:uppercase;font-weight:700;">Your RSVP is Confirmed</div>

              <!-- Main headline -->
              <h1 style="margin:22px 0 8px;font-family:Georgia,'Playfair Display',serif;font-size:42px;font-style:italic;color:#E5C875;font-weight:400;line-height:1.15;">Thank you</h1>

              <!-- Guest greeting -->
              <div style="font-family:Georgia,'Playfair Display',serif;font-style:italic;color:#D4A843;font-size:16px;margin-top:10px;">${rsvp.firstName}, we’re thrilled you’re joining us.</div>

              <!-- Diamond divider -->
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:26px auto 22px;">
                <tr>
                  <td width="40" height="1" bgcolor="#B8860B" style="background:#B8860B;line-height:1px;font-size:1px;">&nbsp;</td>
                  <td style="padding:0 10px;color:#D4A843;font-size:10px;">♦</td>
                  <td width="40" height="1" bgcolor="#B8860B" style="background:#B8860B;line-height:1px;font-size:1px;">&nbsp;</td>
                </tr>
              </table>

              <!-- Date + time + location -->
              <div style="font-family:Georgia,'Playfair Display',serif;font-size:24px;color:#E5C875;letter-spacing:0.5px;line-height:1.3;font-weight:500;">${rsvp.eventDate}</div>
              <div style="font-family:Arial,sans-serif;font-size:13px;letter-spacing:3px;color:#D4A843;text-transform:uppercase;margin-top:8px;">${eventTime}</div>
              <div style="font-family:Georgia,serif;font-style:italic;font-size:14px;color:#D4A843;opacity:0.75;margin-top:10px;">${rsvp.eventLocation}</div>

              <!-- Guest count detail row -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-top:1px solid rgba(212,168,67,0.25);padding-top:26px;">
                <tr>
                  <td width="33%" align="center">
                    <div style="font-family:Georgia,'Playfair Display',serif;font-size:34px;color:#E5C875;font-weight:400;line-height:1;">${rsvp.adultsCount}</div>
                    <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:2.5px;color:#D4A843;text-transform:uppercase;margin-top:8px;">Adult${rsvp.adultsCount === 1 ? '' : 's'}</div>
                  </td>
                  <td width="33%" align="center" style="border-left:1px solid rgba(212,168,67,0.15);border-right:1px solid rgba(212,168,67,0.15);">
                    <div style="font-family:Georgia,'Playfair Display',serif;font-size:34px;color:#E5C875;font-weight:400;line-height:1;">${rsvp.childrenCount}</div>
                    <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:2.5px;color:#D4A843;text-transform:uppercase;margin-top:8px;">Child${rsvp.childrenCount === 1 ? '' : 'ren'}</div>
                  </td>
                  <td width="34%" align="center">
                    <div style="font-family:Georgia,'Playfair Display',serif;font-size:34px;color:#E5C875;font-weight:400;line-height:1;">${totalGuests}</div>
                    <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:2.5px;color:#D4A843;text-transform:uppercase;margin-top:8px;">Total</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Message body -->
          <tr>
            <td style="padding:32px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1a0f07" style="background:#1a0f07;border:1px solid rgba(184,134,11,0.4);border-radius:12px;">
                <tr>
                  <td style="padding:36px 36px 28px;">
                    <div style="font-family:Georgia,'Playfair Display',serif;font-size:16px;color:#E5C875;line-height:1.75;">
                      <p style="margin:0 0 16px;">Dear ${rsvp.firstName},</p>
                      <p style="margin:0 0 16px;">Thank you for your RSVP to the <span style="font-style:italic;color:#E5C875;">${rsvp.eventName}</span>. We are delighted to welcome you${totalGuests > 1 ? ' and your guests' : ''} to the grand opening of our new horse club in the heart of Makadi.</p>
                      <p style="margin:0;">Come experience an evening crafted for every age — a celebration of horses, heritage, and hospitality under the stars.</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Programme card -->
          <tr>
            <td style="padding:24px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0604" style="background:#0a0604;border:1px solid rgba(184,134,11,0.3);border-radius:12px;">
                <tr>
                  <td style="padding:32px 36px;">
                    <div style="text-align:center;">
                      <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:4px;color:#D4A843;text-transform:uppercase;font-weight:700;">Evening Programme</div>
                      <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:12px auto 22px;">
                        <tr>
                          <td width="40" height="1" bgcolor="#B8860B" style="background:#B8860B;line-height:1px;font-size:1px;opacity:0.6;">&nbsp;</td>
                          <td style="padding:0 10px;color:#D4A843;font-size:10px;">♦</td>
                          <td width="40" height="1" bgcolor="#B8860B" style="background:#B8860B;line-height:1px;font-size:1px;opacity:0.6;">&nbsp;</td>
                        </tr>
                      </table>
                    </div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${programmeRows}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Signoff -->
          <tr>
            <td align="center" style="padding:36px 24px 0;text-align:center;">
              <div style="font-family:Georgia,'Playfair Display',serif;font-style:italic;color:#E5C875;font-size:22px;line-height:1.4;">We are happy to welcome you soon.</div>
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
                <tr>
                  <td width="40" height="1" bgcolor="#B8860B" style="background:#B8860B;line-height:1px;font-size:1px;">&nbsp;</td>
                  <td style="padding:0 10px;color:#D4A843;font-size:10px;">♦</td>
                  <td width="40" height="1" bgcolor="#B8860B" style="background:#B8860B;line-height:1px;font-size:1px;">&nbsp;</td>
                </tr>
              </table>
              <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:4px;color:#D4A843;text-transform:uppercase;margin-top:18px;font-weight:600;">— The ${rsvp.tenantName} Team</div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:30px 24px 10px;text-align:center;">
              <div style="font-family:Georgia,serif;font-style:italic;font-size:12px;color:#7A5A33;line-height:1.7;opacity:0.85;">
                Questions about your booking? Simply reply to this email<br />and our team will be in touch personally.
              </div>
              <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:2px;color:#7A5A33;text-transform:uppercase;margin-top:16px;opacity:0.6;">${rsvp.tenantName} · ${rsvp.eventLocation}</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await sendEmail({
    to: guestEmail,
    subject: `✨ You’re on the list · ${rsvp.eventName}`,
    html: guestHtml,
  });
};

export const sendContactFormEmail = async (
  fromName: string,
  fromEmail: string,
  subject: string,
  message: string
): Promise<void> => {
  const adminHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1f2937; color: white; padding: 20px; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .field { margin-bottom: 15px; }
        .field-label { font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase; }
        .field-value { margin-top: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>New Contact Form Submission</h2>
        </div>
        <div class="content">
          <div class="field">
            <div class="field-label">From</div>
            <div class="field-value">${fromName} &lt;${fromEmail}&gt;</div>
          </div>
          <div class="field">
            <div class="field-label">Subject</div>
            <div class="field-value">${subject}</div>
          </div>
          <div class="field">
            <div class="field-label">Message</div>
            <div class="field-value">${message}</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: env.mailgunFromEmail.includes('<')
      ? env.mailgunFromEmail.match(/<(.+)>/)?.[1] || 'admin@foxesnetwork.com'
      : env.mailgunFromEmail,
    subject: `Contact Form: ${subject}`,
    html: adminHtml,
  });
};
