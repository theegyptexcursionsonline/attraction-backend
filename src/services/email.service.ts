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
}

export interface EmailBrand {
  name: string;
  origin: string;
  slug?: string; // set only when NOT on a custom domain (needs ?tenant=)
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
  const cd = tenant?.customDomain?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
  if (cd && (tenant?.domainMigrated || MIGRATED_DOMAINS.has(cd))) {
    return { name, origin: `https://${cd}` };
  }
  return { name, origin: base, slug: tenant?.slug };
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
  const qs = new URLSearchParams(params);
  if (brand.slug) qs.set('tenant', brand.slug);
  const q = qs.toString();
  return `${brand.origin}${path}${q ? `?${q}` : ''}`;
};

export const sendBookingConfirmation = async (
  email: string,
  bookingDetails: {
    reference: string;
    attractionTitle: string;
    date: string;
    time?: string;
    guestName: string;
    total: number;
    currency: string;
  },
  ticketPdf?: Buffer,
  tenant?: EmailTenant | null
): Promise<void> => {
  const brand = getEmailBrand(tenant);
  const bookingsUrl = brandedLink(brand, '/dashboard/bookings');
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #7c3aed, #c026d3); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .booking-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
        .detail-row:last-child { border-bottom: none; }
        .label { color: #6b7280; }
        .value { font-weight: 600; }
        .total { font-size: 24px; color: #7c3aed; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Booking Confirmed!</h1>
          <p>Your adventure awaits</p>
        </div>
        <div class="content">
          <p>Hi ${bookingDetails.guestName},</p>
          <p>Great news! Your booking has been confirmed. Here are your details:</p>
          <div class="booking-details">
            <div class="detail-row">
              <span class="label">Booking Reference</span>
              <span class="value">${bookingDetails.reference}</span>
            </div>
            <div class="detail-row">
              <span class="label">Experience</span>
              <span class="value">${bookingDetails.attractionTitle}</span>
            </div>
            <div class="detail-row">
              <span class="label">Date</span>
              <span class="value">${bookingDetails.date}${bookingDetails.time ? ` at ${bookingDetails.time}` : ''}</span>
            </div>
            <div class="detail-row">
              <span class="label">Total Paid</span>
              <span class="value total">${bookingDetails.currency} ${bookingDetails.total.toFixed(2)}</span>
            </div>
          </div>
          <p>Your e-ticket is attached to this email. Simply show it on your phone at the venue.</p>
          <center>
            <a href="${bookingsUrl}" class="button">View My Bookings</a>
          </center>
        </div>
        <div class="footer">
          <p>Questions? Just reply to this email and our team will help.</p>
          <p>&copy; ${new Date().getFullYear()} ${brand.name}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: `Booking Confirmed - ${bookingDetails.reference}`,
    html,
    attachments: ticketPdf
      ? [{ filename: `ticket-${bookingDetails.reference}.pdf`, data: ticketPdf }]
      : undefined,
  });
};

export const sendAdminBookingNotification = async (
  recipientEmail: string,
  details: {
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
  }
): Promise<void> => {
  const adminUrl = `${env.frontendUrl.split(',')[0].trim()}/admin/bookings`;
  const totalGuests = details.adults + details.children;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937; background: #f3f4f6; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #7c3aed, #c026d3); color: white; padding: 24px 28px; }
        .header .eyebrow { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: 0.85; }
        .header h1 { margin: 6px 0 0; font-size: 22px; font-weight: 600; }
        .content { padding: 28px; }
        .ref { display: inline-block; background: #f3f4f6; color: #111; font-family: monospace; font-size: 14px; padding: 6px 12px; border-radius: 6px; margin-bottom: 16px; }
        table.details { width: 100%; border-collapse: collapse; margin: 16px 0; }
        table.details td { padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; vertical-align: top; }
        table.details td:first-child { color: #6b7280; width: 38%; }
        table.details td:last-child { color: #111; font-weight: 500; }
        .total-row td { font-size: 16px !important; font-weight: 600 !important; padding-top: 14px !important; border-top: 2px solid #111 !important; border-bottom: none !important; color: #111 !important; }
        .button { display: inline-block; background: #111; color: white !important; padding: 12px 22px; text-decoration: none; border-radius: 8px; margin-top: 18px; font-size: 14px; font-weight: 500; }
        .footer { padding: 20px 28px; color: #6b7280; font-size: 12px; background: #fafafa; border-top: 1px solid #e5e7eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="eyebrow">${details.tenantName}</div>
          <h1>New Booking Received</h1>
        </div>
        <div class="content">
          <div class="ref">${details.reference}</div>
          <p style="margin: 0 0 6px;"><strong>${details.guestName}</strong> just booked <strong>${details.attractionTitle}</strong>.</p>
          <table class="details">
            <tr><td>Experience</td><td>${details.attractionTitle}</td></tr>
            <tr><td>Date</td><td>${details.date}${details.time ? ` · ${details.time}` : ''}</td></tr>
            <tr><td>Guests</td><td>${totalGuests} (${details.adults} adult${details.adults === 1 ? '' : 's'}${details.children ? `, ${details.children} child${details.children === 1 ? '' : 'ren'}` : ''})</td></tr>
            <tr><td>Lead traveller</td><td>${details.guestName}</td></tr>
            <tr><td>Email</td><td><a href="mailto:${details.guestEmail}" style="color:#7c3aed;">${details.guestEmail}</a></td></tr>
            <tr><td>Phone</td><td>${details.guestPhone}</td></tr>
            <tr><td>Payment</td><td>${details.paymentMethod === 'pay-later' ? 'Pay at location' : 'Paid online'}</td></tr>
            <tr class="total-row"><td>Total</td><td>${details.currency} ${details.total.toFixed(2)}</td></tr>
          </table>
          <a href="${adminUrl}" class="button">Open in admin →</a>
        </div>
        <div class="footer">
          Sent automatically when a guest completes checkout on ${details.tenantName}.
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: recipientEmail,
    subject: `New booking · ${details.reference} · ${details.attractionTitle}`,
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

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1f2937; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          <center>
            <a href="${resetUrl}" class="button">Reset Password</a>
          </center>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email. Your password will remain unchanged.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} ${brand.name}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: `Reset Your Password - ${brand.name}`,
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

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #7c3aed, #c026d3); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>You're Invited!</h1>
        </div>
        <div class="content">
          <p>Hi there,</p>
          <p>${inviterName} has invited you to join ${brand.name} as a <strong>${role}</strong>.</p>
          <p>Click the button below to accept the invitation and set up your account:</p>
          <center>
            <a href="${inviteUrl}" class="button">Accept Invitation</a>
          </center>
          <p>This invitation will expire in 7 days.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} ${brand.name}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

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
