import crypto from 'crypto';
import type { Types } from 'mongoose';
import type { HotelPickupSelection } from '../utils/hotel-pickup';
import Mailgun from 'mailgun.js';
import formData from 'form-data';
import sanitizeMarkup from 'sanitize-html';
import QRCode from 'qrcode';
import { env } from '../config/env';
import { EmailReceipt, ensureEmailReceiptIndexes } from '../models/EmailReceipt';
import {
  EmailBlockSpec,
  EmailDetailRow,
  EmailDir,
  EmailTone,
  directionForLanguage,
  emailButtons,
  emailCode,
  emailDetails,
  emailLink,
  emailList,
  emailNotice,
  emailPanel,
  emailQuote,
  emailStats,
  renderEmail,
  renderEmailDocument,
} from './emailLayout';

const mailgun = new Mailgun(formData);
const mg = env.mailgunApiKey
  ? mailgun.client({ username: 'api', key: env.mailgunApiKey })
  : null;

/**
 * Why the reader got this message, and whether they may opt out.
 *
 * - `transactional` — booking and money mail. No unsubscribe (they cannot opt out of being
 *   told their booking changed), but still carries a "why you received this" line.
 * - `account` — password reset / password changed. Always goes to the account's own address,
 *   including outside production, by design (EMAIL-DESIGN-STANDARD s4).
 * - `reminder` — scheduled mail (departure reminder, after-trip note). Carries List-Unsubscribe.
 */
export type EmailCategory = 'transactional' | 'account' | 'reminder';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  /** The plain-text alternative. Required for every new template; see `renderEmail`. */
  text?: string;
  tenant: EmailTenant | null;
  replyTo?: string;
  category?: EmailCategory;
  /** Absolute https URL or mailto: for List-Unsubscribe. Only used for `reminder`. */
  unsubscribeUrl?: string;
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

/**
 * Narrow inline markup for an intro line: <strong>/<b>/<em>/<i>/<br> and nothing else.
 *
 * `sanitize-html` DECODES entities while parsing and only re-encodes `&`, `<` and `>`, so an
 * already-escaped `&quot;` comes back out as a bare `"`. The allowed tags carry no attributes,
 * so no legitimate quote can survive this step — re-escaping every one keeps the output exactly
 * as escaped as the caller made it.
 */
const sanitizeInlineEmailHtml = (value: string): string =>
  sanitizeMarkup(value, {
    allowedTags: ['strong', 'b', 'em', 'i', 'br'],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  })
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeHttpUrl = (value: string): string => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '#';
    return httpsUrl(url.toString());
  } catch {
    return '#';
  }
};

/**
 * Every link in an email must be absolute https (EMAIL-DESIGN-STANDARD s6.3). A local
 * development origin is the one exception — it has no certificate and is never mailed.
 */
const isLocalHost = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.localhost');

const httpsUrl = (value: string): string => {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' && !isLocalHost(url.hostname)) {
      url.protocol = 'https:';
      return url.toString();
    }
    return url.toString();
  } catch {
    return value;
  }
};

/** Subjects are clamped to 60 characters and must not shout (EMAIL-DESIGN-STANDARD s4). */
export const SUBJECT_MAX = 60;

/**
 * "No ALL CAPS" is about shouting copy, not identifiers. A booking reference (`MSG-700T9F`,
 * `ATT-2K91`) is legitimately uppercase and must survive untouched, so only multi-word text is
 * treated as shouting.
 */
const looksLikeShouting = (value: string): boolean => {
  if (!/\s/.test(value.trim())) return false; // a single token is an identifier, not a sentence
  const letters = value.replace(/[^A-Za-z]/g, '');
  return letters.length >= 8 && letters === letters.toUpperCase();
};

/**
 * Build a subject from parts, longest-first-priority: parts are joined with a middle dot and
 * trailing parts are dropped rather than truncated, so a reference is never cut in half.
 */
export const emailSubject = (...parts: Array<string | undefined | null>): string => {
  const cleaned = parts
    .map((part) => String(part ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim())
    .map((part) => (looksLikeShouting(part) ? part.charAt(0) + part.slice(1).toLowerCase() : part))
    .map((part) => part.replace(/!{2,}/g, '!'))
    .filter(Boolean);
  if (cleaned.length === 0) return 'Update';

  const kept: string[] = [];
  for (const part of cleaned) {
    const candidate = [...kept, part].join(' · ');
    if (candidate.length <= SUBJECT_MAX) kept.push(part);
  }
  if (kept.length > 0) return kept.join(' · ');
  // Even the first part alone is too long: cut it on a word boundary.
  const first = cleaned[0];
  const cut = first.slice(0, SUBJECT_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 24 ? cut.slice(0, lastSpace) : cut).replace(/[\s·,.;:-]+$/, '')}…`;
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
  | { status: 'skipped'; reason: 'provider_not_configured' | 'non_production_no_qa_inbox' };

/** SHA-256 of the lowercased address: enough to correlate a receipt, never the address itself. */
export const recipientFingerprint = (recipient: string): string =>
  crypto.createHash('sha256').update(recipient.trim().toLowerCase()).digest('hex');

/**
 * Where a message may actually go (EMAIL-DESIGN-STANDARD s4: "Testing never contacts a real
 * customer: in non-production the only recipient is the QA inbox, and account-holder mail
 * (password reset) goes to the account's own address by design").
 *
 * Pure and exported so the routing rule is unit-tested directly rather than inferred from an
 * environment the test process happens to be running in.
 *
 * - production: deliver as addressed.
 * - `account` category: deliver as addressed anywhere — password reset and password-changed
 *   must reach the account holder, which is the standard's stated exception.
 * - `test`: deliver as addressed. The transport is mocked inside the process, so nothing leaves
 *   it; exempting it keeps delivery assertions meaningful without weakening a deployed
 *   environment, which is where the real risk lives.
 * - any other deployed environment (staging, preview, development): redirect to the QA inbox,
 *   and when none is configured SKIP rather than deliver. Fail closed.
 */
export const resolveEmailRecipient = (
  recipient: string,
  category: EmailCategory,
  runtime: { nodeEnv: string; qaInbox: string }
): { recipient: string } | { skip: 'non_production_no_qa_inbox' } => {
  if (runtime.nodeEnv === 'production' || runtime.nodeEnv === 'test') return { recipient };
  if (category === 'account') return { recipient };
  if (isEmailAddress(runtime.qaInbox)) return { recipient: runtime.qaInbox.trim().toLowerCase() };
  return { skip: 'non_production_no_qa_inbox' };
};

export const sendEmail = async (options: EmailOptions): Promise<EmailSendResult> => {
  const category = options.category || 'transactional';
  const subject = emailSubject(options.subject);

  if (!mg || !env.mailgunDomain) {
    console.info('[email] delivery skipped: provider is not configured', {
      subject: subject.slice(0, 160),
      tenant: options.tenant?.slug || 'platform',
      category,
    });
    return { status: 'skipped', reason: 'provider_not_configured' };
  }

  const routed = resolveEmailRecipient(options.to, category, { nodeEnv: env.nodeEnv, qaInbox: env.qaEmailRecipient });
  if ('skip' in routed) {
    console.warn('[email] delivery skipped: non-production run has no QA inbox configured', {
      subject: subject.slice(0, 160),
      tenant: options.tenant?.slug || 'platform',
      category,
      recipient: recipientFingerprint(options.to).slice(0, 12),
    });
    return { status: 'skipped', reason: 'non_production_no_qa_inbox' };
  }

  const envelope = resolveEmailEnvelope(options.tenant, routed.recipient, options.replyTo);
  const messageData: Record<string, unknown> = {
    from: envelope.from,
    to: envelope.to,
    subject,
    html: options.html,
  };
  // A message without a plain-text part renders as a blob in text-only clients and scores
  // worse with spam filters. Every template built through `renderEmail` supplies one.
  if (options.text && options.text.trim()) messageData.text = options.text;
  if (envelope.replyTo) messageData['h:Reply-To'] = envelope.replyTo;

  // Reminders and anything not strictly transactional must offer a documented opt-out.
  if (category === 'reminder' && options.unsubscribeUrl) {
    const target = options.unsubscribeUrl.trim();
    if (/^https:\/\//i.test(target) || /^mailto:/i.test(target)) {
      messageData['h:List-Unsubscribe'] = `<${target.replace(/[<>\r\n]/g, '')}>`;
      // One-click POST is only valid for an https endpoint; a mailto opt-out is handled by a human.
      if (/^https:\/\//i.test(target)) {
        messageData['h:List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }
    }
  }

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

/**
 * Send without ever failing the surrounding operation (EMAIL-DESIGN-STANDARD s4: "Delivery
 * failures are logged with the event and recipient category ... and never crash the surrounding
 * operation"). Use this wherever the email is a side effect of a business action that has
 * already succeeded; use `sendEmail` only where the caller genuinely needs the outcome.
 */
export const deliverEmail = async (
  event: string,
  options: EmailOptions
): Promise<EmailSendResult | { status: 'failed' }> => {
  try {
    return await sendEmail(options);
  } catch (error) {
    console.error('[email] delivery failed', {
      event,
      tenant: options.tenant?.slug || 'platform',
      category: options.category || 'transactional',
      // Never the address itself, per the standard.
      recipient: recipientFingerprint(options.to).slice(0, 12),
      error: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
    });
    return { status: 'failed' };
  }
};

export type EmailOnceResult =
  | EmailSendResult
  | { status: 'failed' }
  | { status: 'duplicate' };

/**
 * Send exactly once per event (EMAIL-DESIGN-STANDARD s4: "an email tied to an event is sent once
 * per event, with a stored receipt; a retry never sends twice").
 *
 * The receipt is claimed BEFORE the provider is called, so two concurrent workers cannot both
 * win. The claim is scoped to the tenant, so one site's job can never suppress another site's
 * mail. A provider failure releases the claim so the next sweep retries; a success marks it sent.
 *
 * Never throws: a receipt-store outage must not break the business operation either.
 */
export const sendEmailOnce = async (
  claim: { dedupeKey: string; eventType: string; tenantId?: Types.ObjectId | string | null },
  options: EmailOptions
): Promise<EmailOnceResult> => {
  const recipientHash = recipientFingerprint(options.to);
  let claimed: { _id: unknown } | null = null;
  try {
    await ensureEmailReceiptIndexes();
    claimed = await EmailReceipt.create({
      tenantId: claim.tenantId || null,
      dedupeKey: claim.dedupeKey.slice(0, 200),
      eventType: claim.eventType.slice(0, 120),
      recipientHash,
      status: 'claimed',
      attempts: 1,
    });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      console.info('[email] duplicate suppressed by receipt', {
        event: claim.eventType,
        key: claim.dedupeKey.slice(0, 120),
      });
      return { status: 'duplicate' };
    }
    // The receipt store is unavailable. Fail closed on the EMAIL, not on the caller: sending
    // without a receipt is exactly the double-send the guard exists to prevent.
    console.error('[email] receipt claim failed; send suppressed', {
      event: claim.eventType,
      error: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
    });
    return { status: 'failed' };
  }

  const result = await deliverEmail(claim.eventType, options);
  try {
    if (result.status === 'sent') {
      await EmailReceipt.updateOne({ _id: claimed._id }, { $set: { status: 'sent', sentAt: new Date() } });
    } else if (result.status === 'skipped') {
      await EmailReceipt.updateOne({ _id: claimed._id }, { $set: { status: 'skipped', lastError: result.reason } });
    } else {
      // Release the claim so a later sweep can retry this event.
      await EmailReceipt.deleteOne({ _id: claimed._id });
    }
  } catch (error) {
    console.error('[email] receipt update failed', {
      event: claim.eventType,
      error: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
    });
  }
  return result;
};

// ---------------------------------------------------------------------------
// Tenant email branding
// Transactional emails must speak in the tenant's brand, never the generic
// "Foxes Network" platform. `getEmailBrand` resolves the display name and the
// base URL to use: a live custom domain when the tenant has one, otherwise the
// shared origin with a `?tenant=<slug>` so the linked page themes correctly.
//
// Isolation contract: the ONLY source of brand identity is the `tenant` argument.
// This function reads no ambient/request state, so a caller that passes tenant A's
// document can never render tenant B's name, logo, colour, domain or contact details.
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
  dir?: EmailDir; // reading direction of the tenant's default language
  lang?: string; // <html lang>, from the tenant's default language
  postalAddress?: string; // legal footer address, from the tenant's own contact details
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
  const base = httpsUrl(env.frontendUrl.split(',')[0].trim().replace(/\/+$/, ''));
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
      return httpsUrl(url.toString());
    } catch {
      return undefined;
    }
  };
  const contactEmail = tenant?.contactInfo?.email?.trim();
  const contactPhone = tenant?.contactInfo?.phone?.trim();
  const contact = isEmailAddress(contactEmail) || contactPhone
    ? { ...(isEmailAddress(contactEmail) ? { email: contactEmail.toLowerCase() } : {}), ...(contactPhone ? { phone: contactPhone.slice(0, 40) } : {}) }
    : undefined;
  // The email is written in the recipient site's language, so Arabic tenants get an RTL
  // document rather than a mirrored-looking LTR one.
  const lang = safeDisplayName(tenant?.defaultLanguage?.trim() || 'en').slice(0, 20) || 'en';
  const dir = directionForLanguage(lang);
  // Only the tenant's OWN postal address may appear in its footer.
  const postal = tenant?.contactInfo?.address?.trim()
    ? safeDisplayName(tenant.contactInfo.address).slice(0, 200)
    : (env.emailPostalAddress || undefined);
  const common = {
    name,
    color,
    dir,
    lang,
    ...(contact ? { contact } : {}),
    ...(postal ? { postalAddress: postal } : {}),
  };
  const cd = normalizedCustomDomain(tenant?.customDomain);
  if (cd && (tenant?.domainMigrated || MIGRATED_DOMAINS.has(cd))) {
    const origin = `https://${cd}`;
    return { ...common, origin, logo: absLogo(origin) };
  }
  return { ...common, origin: base, slug: tenant?.slug, logo: absLogo(base) };
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
  return httpsUrl(`${brand.origin}${path}${q ? `?${q}` : ''}`);
};

/**
 * The opt-out target for scheduled mail. There is no hosted preference centre yet, so the
 * documented route is the site's own monitored inbox — a real, working mailto opt-out rather
 * than a link to a page that does not exist. When a preference-centre route ships, return its
 * https URL here and `sendEmail` will additionally emit List-Unsubscribe-Post (one-click).
 */
export const unsubscribeTarget = (brand: EmailBrand, reference?: string): string | undefined => {
  const inbox = brand.contact?.email;
  if (!isEmailAddress(inbox)) return undefined;
  const subject = encodeURIComponent(`Unsubscribe from trip reminders${reference ? ` (${reference})` : ''}`);
  return `mailto:${inbox}?subject=${subject}`;
};

const WHY_BOOKING = 'You received this email because it relates to a booking you made with us.';
const WHY_ACCOUNT = 'You received this email because it concerns the security of your account.';
const WHY_OPERATOR = 'You received this email because you are listed as a contact for this site.';
const WHY_REMINDER = 'You received this reminder because you have an upcoming booking with us.';

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
  /** Receipt breakdown. Rendered only when the booking was actually paid online. */
  subtotal?: number;
  fees?: number;
  discount?: number;
  promoCode?: string;
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
const meetingPointBlock = (
  brand: EmailBrand,
  mp?: { lat?: number; lng?: number; label?: string }
): EmailBlockSpec => {
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
  const label = mp.label ? `${mp.label} — ` : '';
  return {
    kind: 'panel',
    eyebrow: 'Meeting point',
    titleHtml: mp.label ? escapeEmailHtml(mp.label) : undefined,
    // The image is decoration: the directions button and the text link below carry the meaning,
    // so the block is complete with images blocked.
    contentHtml: `<a href="${mapsLink}" target="_blank" style="text-decoration:none;"><img src="${escapeEmailHtml(mapImg)}" width="484" alt="Map showing the meeting point${mp.label ? ` at ${escapeEmailHtml(mp.label)}` : ''}" style="display:block;width:100%;max-width:484px;height:auto;border-radius:10px;border:1px solid #ece7df;"></a>
        <div style="margin-top:14px;">${emailButtons(brand, { label: 'Get directions', url: mapsLink }, undefined, { outline: true })}</div>`,
    text: `${label}Directions: ${mapsLink}`,
  };
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
    valueText: label,
  }));
};

const money = (currency: string, amount: number): string =>
  `${String(currency || '').toUpperCase()} ${Number(amount || 0).toFixed(2)}`;

/**
 * Shared builder for a simple branded "action" email (payment link, cancellation,
 * password reset, invitation): heading, short intro, optional details, one button.
 * `intro` may contain <strong>/<em>/<br> only; everything else is escaped.
 */
export interface ActionEmailOptions {
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
  whyReceived?: string;
  unsubscribeUrl?: string;
  /** Operator-facing mail must not advertise the site's own contact details back to the site. */
  hideContact?: boolean;
}

export const renderActionEmailParts = (
  brand: EmailBrand,
  opts: ActionEmailOptions
): { html: string; text: string } =>
  renderEmail({
    brand,
    title: opts.title,
    preheader: opts.preheader || opts.heading,
    badge: opts.badge,
    heading: opts.heading,
    introHtml: sanitizeInlineEmailHtml(opts.intro),
    blocks: [
      opts.details?.length ? { kind: 'details', rows: opts.details } : '',
      { kind: 'buttons', primary: { label: opts.ctaLabel, url: safeHttpUrl(opts.ctaUrl) } },
      opts.note ? { kind: 'notice', tone: opts.noteTone || 'neutral', messageHtml: escapeEmailHtml(opts.note), text: opts.note } : '',
    ],
    footer: {
      note: opts.footerNote,
      contact: opts.hideContact ? undefined : brand.contact,
      whyReceived: opts.whyReceived,
      postalAddress: brand.postalAddress,
      unsubscribeUrl: opts.unsubscribeUrl,
    },
  });

export const renderActionEmail = (brand: EmailBrand, opts: ActionEmailOptions): string =>
  renderActionEmailParts(brand, opts).html;

/** Pure builder for the customer booking-confirmation email (exported so it can be
 *  previewed/unit-tested without sending). */
export const renderBookingConfirmation = (
  brand: EmailBrand,
  bookingDetails: BookingEmailDetails,
  hasTicket = false,
  qrImageSrc?: string,
): { html: string; text: string } => {
  const viewUrl = brandedLink(brand, '/checkout/confirmation', {
    ref: bookingDetails.reference,
    ...(bookingDetails.guestAccessToken ? { accessToken: bookingDetails.guestAccessToken } : {}),
  });
  const pickups = bookingDetails.hotelPickups || (bookingDetails.hotelPickup ? [bookingDetails.hotelPickup] : []);
  const isPaid = !!bookingDetails.paymentMethod && bookingDetails.paymentMethod !== 'pay-later';
  const dateStr = `${bookingDetails.date}${bookingDetails.time ? ` at ${bookingDetails.time}` : ''}`;
  const reference = bookingDetails.reference;
  const total = money(bookingDetails.currency, bookingDetails.total);

  // When the money was actually taken, the confirmation doubles as the payment receipt
  // (standard s5, "payment receipt") — an itemised breakdown rather than a bare total.
  const receiptRows: EmailDetailRow[] = isPaid
    ? [
        ...(typeof bookingDetails.subtotal === 'number'
          ? [{ label: 'Subtotal', valueHtml: escapeEmailHtml(money(bookingDetails.currency, bookingDetails.subtotal)), valueText: money(bookingDetails.currency, bookingDetails.subtotal) }]
          : []),
        ...(bookingDetails.fees
          ? [{ label: 'Fees', valueHtml: escapeEmailHtml(money(bookingDetails.currency, bookingDetails.fees)), valueText: money(bookingDetails.currency, bookingDetails.fees) }]
          : []),
        ...(bookingDetails.discount
          ? [{
              label: bookingDetails.promoCode ? `Discount (${bookingDetails.promoCode})` : 'Discount',
              valueHtml: escapeEmailHtml(`-${money(bookingDetails.currency, bookingDetails.discount)}`),
              valueText: `-${money(bookingDetails.currency, bookingDetails.discount)}`,
            }]
          : []),
      ]
    : [];

  const rows: EmailDetailRow[] = [
    { label: 'Booking reference', valueHtml: emailCode(reference), valueText: reference },
    { label: 'Date & time', valueHtml: escapeEmailHtml(dateStr), valueText: dateStr },
    ...(bookingDetails.guests ? [{ label: 'Guests', valueHtml: escapeEmailHtml(bookingDetails.guests), valueText: String(bookingDetails.guests) }] : []),
    ...pickupRows(pickups),
    ...receiptRows,
    {
      label: isPaid ? 'Total paid' : 'Total',
      hint: isPaid ? 'Paid online' : 'Pay at location — collected on arrival',
      valueHtml: `${escapeEmailHtml(bookingDetails.currency)} ${bookingDetails.total.toFixed(2)}`,
      valueText: total,
      emphasis: true,
    },
  ];

  const ticket: EmailBlockSpec = qrImageSrc
    ? {
        kind: 'panel',
        eyebrow: 'Your mobile ticket',
        titleHtml: 'Scan for booking details',
        align: 'center',
        contentHtml: `<img src="${escapeEmailHtml(qrImageSrc)}" width="156" height="156" alt="QR code for booking ${escapeEmailHtml(reference)}" style="display:block;width:156px;height:156px;margin:0 auto;background:#ffffff;border:10px solid #ffffff;border-radius:12px;">
        <div class="fx-muted" style="margin-top:12px;font-size:13px;line-height:20px;color:#57534e;">Reference ${emailCode(reference)}</div>`,
        text: `Reference ${reference}. If the QR code does not display, open your booking: ${viewUrl}`,
      }
    : '';

  const closing = hasTicket
    ? 'Your PDF ticket is attached. Show it on your phone when requested.'
    : 'Bring this confirmation with you on the day of your tour.';

  return renderEmail({
    brand,
    title: 'Booking confirmed',
    preheader: `${reference} · ${bookingDetails.attractionTitle} on ${dateStr}.`,
    badge: { label: 'Booking confirmed', tone: 'success' },
    heading: `You're all set, ${firstNameOf(bookingDetails.guestName)}!`,
    introHtml: `Your booking is confirmed${hasTicket ? ' and your e-ticket is attached' : ''}. Keep this email handy for the day of your tour.`,
    blocks: [
      { kind: 'details', rows, eyebrow: 'Your booking', titleHtml: escapeEmailHtml(bookingDetails.attractionTitle), titleText: bookingDetails.attractionTitle },
      { kind: 'buttons', primary: { label: 'Open your booking', url: viewUrl } },
      ticket,
      meetingPointBlock(brand, bookingDetails.meetingPoint),
      { kind: 'notice', tone: 'neutral', messageHtml: escapeEmailHtml(closing), text: closing },
    ],
    footer: {
      note: 'Questions? Reply to this email and our team will help.',
      contact: brand.contact,
      whyReceived: WHY_BOOKING,
      postalAddress: brand.postalAddress,
    },
  });
};

export const renderBookingConfirmationHtml = (
  brand: EmailBrand,
  bookingDetails: BookingEmailDetails,
  hasTicket = false,
  qrImageSrc?: string,
): string => renderBookingConfirmation(brand, bookingDetails, hasTicket, qrImageSrc).html;

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
  const { html, text } = renderBookingConfirmation(
    brand,
    bookingDetails,
    !!ticketPdf,
    qrBuffer ? `cid:${qrFilename}` : undefined,
  );
  await sendEmail({
    to: email,
    subject: emailSubject('Booking confirmed', bookingDetails.reference),
    html,
    text,
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

export const renderBookingPaymentLink = (
  brand: EmailBrand,
  details: BookingPaymentLinkDetails
): { html: string; text: string } => {
  const amount = money(details.currency, details.total);
  return renderActionEmailParts(brand, {
    title: `Complete payment · ${details.reference}`,
    preheader: `Booking ${details.reference} is reserved — pay ${amount} to confirm it.`,
    badge: { label: 'Payment due', tone: 'warning' },
    heading: 'Complete your secure payment',
    intro: `Hi ${escapeEmailHtml(firstNameOf(details.guestName))}, your booking is reserved and waiting for payment.`,
    details: [
      { label: 'Booking reference', valueHtml: emailCode(details.reference), valueText: details.reference },
      { label: 'Amount due', valueHtml: escapeEmailHtml(amount), valueText: amount, emphasis: true },
    ],
    ctaLabel: `Pay ${amount}`,
    ctaUrl: bookingPaymentLink(brand, details.reference, details.guestAccessToken),
    note: 'Pay by card through the secure link above. Your booking is confirmed only after the payment succeeds.',
    noteTone: 'info',
    footerNote: 'Questions? Reply to this email and our team will help.',
    whyReceived: WHY_BOOKING,
  });
};

export const renderBookingPaymentLinkHtml = (
  brand: EmailBrand,
  details: BookingPaymentLinkDetails
): string => renderBookingPaymentLink(brand, details).html;

export const sendBookingPaymentLinkEmail = async (
  email: string,
  details: BookingPaymentLinkDetails,
  tenant: EmailTenant | null
): Promise<void> => {
  const brand = getEmailBrand(tenant);
  const { html, text } = renderBookingPaymentLink(brand, details);
  await sendEmail({
    to: email,
    subject: emailSubject('Complete payment', safeDisplayName(details.reference)),
    html,
    text,
    tenant,
  });
};

/**
 * Payment could not be taken. The booking is held, not lost — the reader's one action is to
 * try again through the same secure link.
 */
export interface PaymentFailedDetails {
  reference: string;
  guestName: string;
  guestAccessToken?: string;
  total: number;
  currency: string;
  attractionTitle?: string;
}

export const renderPaymentFailed = (
  brand: EmailBrand,
  details: PaymentFailedDetails
): { html: string; text: string } => {
  const amount = money(details.currency, details.total);
  const payUrl = details.guestAccessToken
    ? bookingPaymentLink(brand, details.reference, details.guestAccessToken)
    : brandedLink(brand, '/checkout/confirmation', { ref: details.reference });
  return renderActionEmailParts(brand, {
    title: `Payment not completed · ${details.reference}`,
    preheader: `We could not take payment for ${details.reference}. Your place is still held.`,
    badge: { label: 'Action needed', tone: 'warning' },
    heading: 'We could not confirm your payment',
    intro: `Hi ${escapeEmailHtml(firstNameOf(details.guestName))}, your card was not charged and your booking is not confirmed yet. Your place is still held — you can try again below.`,
    details: [
      { label: 'Booking reference', valueHtml: emailCode(details.reference), valueText: details.reference },
      ...(details.attractionTitle
        ? [{ label: 'Experience', valueHtml: escapeEmailHtml(details.attractionTitle), valueText: details.attractionTitle }]
        : []),
      { label: 'Amount due', valueHtml: escapeEmailHtml(amount), valueText: amount, emphasis: true },
    ],
    ctaLabel: 'Try payment again',
    ctaUrl: payUrl,
    note: 'Your bank may have declined the payment for a routine reason. Trying a different card usually works.',
    noteTone: 'info',
    footerNote: 'Questions? Reply to this email and our team will help.',
    whyReceived: WHY_BOOKING,
  });
};

export const sendPaymentFailedEmail = async (
  email: string,
  details: PaymentFailedDetails,
  tenant: EmailTenant | null
): Promise<EmailOnceResult> => {
  const brand = getEmailBrand(tenant);
  const { html, text } = renderPaymentFailed(brand, details);
  return sendEmailOnce(
    { dedupeKey: `booking.payment_failed:${details.reference}`, eventType: 'booking.payment_failed', tenantId: (tenant as { _id?: Types.ObjectId })?._id },
    {
      to: email,
      subject: emailSubject('Payment not completed', details.reference),
      html,
      text,
      tenant,
    }
  );
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
export const renderAdminBookingNotification = (
  brand: EmailBrand,
  details: AdminBookingDetails,
  adminUrl: string
): { html: string; text: string } => {
  const emailHref = safeMailtoAddress(details.guestEmail);
  const phoneHref = details.guestPhone.replace(/[^+0-9]/g, '');
  const title = details.attractionTitle || 'Experience';
  const totalGuests = details.adults + details.children;
  const guestsText = `${totalGuests} · ${details.adults} adult${details.adults === 1 ? '' : 's'}${details.children ? `, ${details.children} child${details.children === 1 ? '' : 'ren'}` : ''}`;
  const isPaid = !!details.paymentMethod && details.paymentMethod !== 'pay-later';
  const dateStr = `${details.date}${details.time ? ` at ${details.time}` : ''}`;
  const pickups = details.hotelPickups || (details.hotelPickup ? [details.hotelPickup] : []);
  const total = money(details.currency, details.total);

  const rows: EmailDetailRow[] = [
    { label: 'Experience', valueHtml: escapeEmailHtml(title), valueText: title },
    { label: 'Date & time', valueHtml: escapeEmailHtml(dateStr), valueText: dateStr },
    { label: 'Guests', valueHtml: escapeEmailHtml(guestsText), valueText: guestsText },
    ...pickupRows(pickups),
    { label: 'Lead traveller', valueHtml: escapeEmailHtml(details.guestName), valueText: details.guestName },
    { label: 'Email', valueHtml: emailHref ? emailLink(brand, `mailto:${emailHref}`, escapeEmailHtml(details.guestEmail)) : escapeEmailHtml(details.guestEmail), valueText: details.guestEmail },
    { label: 'Phone', valueHtml: phoneHref ? emailLink(brand, `tel:${phoneHref}`, escapeEmailHtml(details.guestPhone)) : escapeEmailHtml(details.guestPhone), valueText: details.guestPhone },
    { label: 'Payment', valueHtml: isPaid ? 'Paid online' : 'Pay at location', valueText: isPaid ? 'Paid online' : 'Pay at location' },
    { label: 'Total', valueHtml: `${escapeEmailHtml(details.currency)} ${details.total.toFixed(2)}`, valueText: total, emphasis: true },
  ];

  return renderEmail({
    brand,
    title: 'New booking',
    preheader: `${details.guestName} booked ${title} — ${dateStr}`,
    badge: { label: 'New booking', tone: 'brand' },
    heading: `${details.guestName} booked ${title}`,
    introHtml: `Reference ${emailCode(details.reference)} · ${escapeEmailHtml(dateStr)}`,
    introText: `Reference ${details.reference} · ${dateStr}`,
    blocks: [
      { kind: 'details', rows },
      {
        kind: 'buttons',
        primary: { label: 'Open in admin', url: safeHttpUrl(adminUrl) },
        secondary: emailHref
          ? { label: `Email ${firstNameOf(details.guestName, 'guest')}`, url: `mailto:${emailHref}?subject=${encodeURIComponent(`Your booking ${details.reference}`)}` }
          : undefined,
      },
      meetingPointBlock(brand, details.meetingPoint),
    ],
    // Operator mail deliberately omits `contact`: the site does not need its own address read
    // back to it, and including it would put customer-facing support details in an internal alert.
    footer: {
      note: `Sent automatically when a guest completes checkout on ${details.tenantName}.`,
      whyReceived: WHY_OPERATOR,
      postalAddress: brand.postalAddress,
    },
  });
};

export const renderAdminBookingNotificationHtml = (
  brand: EmailBrand,
  details: AdminBookingDetails,
  adminUrl: string
): string => renderAdminBookingNotification(brand, details, adminUrl).html;

export const sendAdminBookingNotification = async (
  recipientEmail: string,
  details: AdminBookingDetails,
  tenant: EmailTenant | null
): Promise<void> => {
  const brand = getEmailBrand(tenant);
  const adminUrl = brandedLink(brand, '/admin/bookings');
  const { html, text } = renderAdminBookingNotification(brand, details, adminUrl);
  await sendEmail({
    to: recipientEmail,
    subject: emailSubject('New booking', details.reference, details.attractionTitle || 'Experience'),
    html,
    text,
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

export const renderBookingStatusEmail = (
  brand: EmailBrand,
  details: BookingStatusEmailDetails
): { html: string; text: string } => {
  const firstName = escapeEmailHtml(firstNameOf(details.guestName));
  const reference = escapeEmailHtml(details.reference);
  const viewUrl = brandedLink(brand, '/checkout/confirmation', {
    ref: details.reference,
    ...(details.guestAccessToken ? { accessToken: details.guestAccessToken } : {}),
  });
  const refund = Number.isFinite(details.refundAmount) && details.refundAmount
    ? money(details.currency || '', details.refundAmount).trim()
    : '';

  if (details.kind === 'cancelled') {
    const note = refund && details.currency
      ? `A refund of ${refund} has been processed to the original payment method.`
      : 'No online payment was collected for this booking.';
    return renderActionEmailParts(brand, {
      title: `Booking cancelled · ${details.reference}`,
      preheader: `Booking ${details.reference} is cancelled. ${refund ? `Refund ${refund}.` : ''}`.trim(),
      badge: { label: 'Booking cancelled', tone: 'danger' },
      heading: 'Your booking is cancelled',
      intro: `Hi ${firstName}, booking <strong>${reference}</strong> has been cancelled.`,
      details: [
        { label: 'Booking reference', valueHtml: emailCode(details.reference), valueText: details.reference },
        ...(refund && details.currency ? [{ label: 'Refund', valueHtml: escapeEmailHtml(refund), valueText: refund, emphasis: true }] : []),
      ],
      note,
      ctaLabel: 'View booking',
      ctaUrl: viewUrl,
      footerNote: 'Questions? Reply to this email and our team will help.',
      whyReceived: WHY_BOOKING,
    });
  }

  const amount = refund || 'your payment';
  return renderActionEmailParts(brand, {
    title: `Refund processed · ${details.reference}`,
    preheader: `Refund of ${amount} processed for booking ${details.reference}.`,
    badge: { label: 'Refund processed', tone: 'success' },
    heading: details.fullRefund ? 'Your refund is complete' : 'Your partial refund is complete',
    intro: `Hi ${firstName}, a refund of <strong>${escapeEmailHtml(amount)}</strong> has been processed for booking <strong>${reference}</strong>.`,
    details: [
      { label: 'Booking reference', valueHtml: emailCode(details.reference), valueText: details.reference },
      ...(refund ? [{ label: 'Refund', valueHtml: escapeEmailHtml(refund), valueText: refund, emphasis: true }] : []),
    ],
    note: 'Your bank may take several business days to show the credit on your statement.',
    ctaLabel: 'View booking',
    ctaUrl: viewUrl,
    footerNote: 'Questions? Reply to this email and our team will help.',
    whyReceived: WHY_BOOKING,
  });
};

export const renderBookingStatusEmailHtml = (
  brand: EmailBrand,
  details: BookingStatusEmailDetails
): string => renderBookingStatusEmail(brand, details).html;

export const sendBookingStatusEmail = async (
  email: string,
  details: BookingStatusEmailDetails,
  tenant: EmailTenant | null
): Promise<void> => {
  const brand = getEmailBrand(tenant);
  const { html, text } = renderBookingStatusEmail(brand, details);
  await sendEmail({
    to: email,
    subject: emailSubject(
      details.kind === 'cancelled' ? 'Booking cancelled' : 'Refund processed',
      safeDisplayName(details.reference)
    ),
    html,
    text,
    tenant,
  });
};

// ---------------------------------------------------------------------------
// Scheduled booking mail — departure reminder and after-trip thank-you
// ---------------------------------------------------------------------------

export interface BookingReminderDetails {
  reference: string;
  guestName: string;
  guestAccessToken?: string;
  attractionTitle: string;
  date: string;
  time?: string;
  guests?: number;
  hotelPickups?: HotelPickupSelection[];
  hotelPickup?: { status?: 'confirmed' | 'provide_later'; address?: string; hotelName?: string; roomNumber?: string; pickupTime?: string };
  meetingPoint?: { lat?: number; lng?: number; label?: string };
}

export const renderDepartureReminder = (
  brand: EmailBrand,
  details: BookingReminderDetails
): { html: string; text: string } => {
  const viewUrl = brandedLink(brand, '/checkout/confirmation', {
    ref: details.reference,
    ...(details.guestAccessToken ? { accessToken: details.guestAccessToken } : {}),
  });
  const dateStr = `${details.date}${details.time ? ` at ${details.time}` : ''}`;
  const pickups = details.hotelPickups || (details.hotelPickup ? [details.hotelPickup] : []);
  const rows: EmailDetailRow[] = [
    { label: 'Booking reference', valueHtml: emailCode(details.reference), valueText: details.reference },
    { label: 'Date & time', valueHtml: escapeEmailHtml(dateStr), valueText: dateStr },
    ...(details.guests ? [{ label: 'Guests', valueHtml: escapeEmailHtml(details.guests), valueText: String(details.guests) }] : []),
    ...pickupRows(pickups),
  ];
  const closing = 'Bring your booking reference and arrive a few minutes early.';

  return renderEmail({
    brand,
    title: `Tomorrow: ${details.attractionTitle}`,
    preheader: `${details.attractionTitle} — ${dateStr}. Reference ${details.reference}.`,
    badge: { label: 'Tomorrow', tone: 'info' },
    heading: `See you tomorrow, ${firstNameOf(details.guestName)}`,
    introHtml: `Your booking for <strong>${escapeEmailHtml(details.attractionTitle)}</strong> is tomorrow. Here are the details one more time.`,
    introText: `Your booking for ${details.attractionTitle} is tomorrow. Here are the details one more time.`,
    blocks: [
      { kind: 'details', rows, eyebrow: 'Your booking', titleHtml: escapeEmailHtml(details.attractionTitle), titleText: details.attractionTitle },
      { kind: 'buttons', primary: { label: 'Open your booking', url: viewUrl } },
      meetingPointBlock(brand, details.meetingPoint),
      { kind: 'notice', tone: 'neutral', messageHtml: escapeEmailHtml(closing), text: closing },
    ],
    footer: {
      note: 'Need to change something? Reply to this email and our team will help.',
      contact: brand.contact,
      whyReceived: WHY_REMINDER,
      postalAddress: brand.postalAddress,
      unsubscribeUrl: unsubscribeTarget(brand, details.reference),
    },
  });
};

export interface TripThankYouDetails {
  reference: string;
  guestName: string;
  attractionTitle: string;
  guestAccessToken?: string;
  /**
   * Storefront path of the experience, for a direct review link. Supply ONLY a path that has
   * been verified to exist on the tenant's storefront. The backend deliberately does not derive
   * one from a slug: it hands the frontend `slug`/`pathSlug`/`parentPath` and the frontend
   * assembles the public URL (see `page.controller.ts` sitemap feed), so a path guessed here
   * would ship a link that 404s on flat-URL and parent-page tenants.
   */
  attractionPath?: string;
}

export const renderTripThankYou = (
  brand: EmailBrand,
  details: TripThankYouDetails
): { html: string; text: string } => {
  const bookingUrl = brandedLink(brand, '/checkout/confirmation', {
    ref: details.reference,
    ...(details.guestAccessToken ? { accessToken: details.guestAccessToken } : {}),
  });
  // A verified experience path gets the direct review CTA; otherwise the one action is the
  // guest's own booking page, which this codebase provably builds, and the review invitation
  // is a reply to this email (Reply-To reaches the site's monitored inbox).
  const hasReviewPage = !!details.attractionPath && /^\/[A-Za-z0-9/_-]*$/.test(details.attractionPath);
  const ctaUrl = hasReviewPage ? brandedLink(brand, details.attractionPath as string) : bookingUrl;
  const ctaLabel = hasReviewPage ? 'Leave a review' : 'View your booking';
  const note = hasReviewPage
    ? 'A short review helps other travellers choose with confidence.'
    : 'Just reply to this email with a line or two — it goes straight to the team who looked after you.';

  return renderActionEmailParts(brand, {
    title: `Thank you for travelling with ${brand.name}`,
    preheader: `We hope ${details.attractionTitle} was everything you wanted.`,
    badge: { label: 'Thank you', tone: 'brand' },
    heading: `Thank you, ${firstNameOf(details.guestName)}`,
    intro: `We hope <strong>${escapeEmailHtml(details.attractionTitle)}</strong> was everything you hoped for. If you have a moment, we would love to hear how it went.`,
    details: [
      { label: 'Booking reference', valueHtml: emailCode(details.reference), valueText: details.reference },
      { label: 'Experience', valueHtml: escapeEmailHtml(details.attractionTitle), valueText: details.attractionTitle },
    ],
    ctaLabel,
    ctaUrl,
    note,
    noteTone: 'brand',
    footerNote: 'Questions or feedback? Reply to this email and our team will read it.',
    whyReceived: 'You received this message because you recently travelled with us.',
    unsubscribeUrl: unsubscribeTarget(brand, details.reference),
  });
};

// ---------------------------------------------------------------------------
// Account mail
// ---------------------------------------------------------------------------

export const renderWelcome = (
  brand: EmailBrand,
  input: { userName: string; accountEmail: string }
): { html: string; text: string } =>
  renderActionEmailParts(brand, {
    title: `Welcome to ${brand.name}`,
    preheader: `Your ${brand.name} account is ready.`,
    badge: { label: 'Welcome', tone: 'brand' },
    heading: `Welcome, ${firstNameOf(input.userName)}`,
    intro: `Your account on <strong>${escapeEmailHtml(brand.name)}</strong> is ready. Sign in any time to see your bookings and manage your details.`,
    details: [
      { label: 'Account email', valueHtml: escapeEmailHtml(input.accountEmail), valueText: input.accountEmail },
    ],
    ctaLabel: 'Browse experiences',
    ctaUrl: brandedLink(brand, '/'),
    note: "If you did not create this account, reply to this email and we'll close it.",
    footerNote: 'Questions? Reply to this email and our team will help.',
    whyReceived: 'You received this email because an account was created with this address.',
  });

export const sendWelcomeEmail = async (
  email: string,
  userName: string,
  tenant: EmailTenant | null
): Promise<EmailOnceResult> => {
  const brand = getEmailBrand(tenant);
  const { html, text } = renderWelcome(brand, { userName, accountEmail: email });
  return sendEmailOnce(
    // One welcome per address per site, however many times registration is retried.
    { dedupeKey: `account.welcome:${recipientFingerprint(email)}`, eventType: 'account.welcome', tenantId: (tenant as { _id?: Types.ObjectId })?._id },
    {
      to: email,
      subject: emailSubject(`Welcome to ${brand.name}`),
      html,
      text,
      tenant,
      category: 'account',
    }
  );
};

export const renderPasswordReset = (
  brand: EmailBrand,
  input: { userName: string; resetUrl: string }
): { html: string; text: string } =>
  renderActionEmailParts(brand, {
    title: 'Password reset',
    preheader: 'Choose a new password. This link expires in 1 hour.',
    badge: { label: 'Account security', tone: 'neutral' },
    heading: 'Reset your password',
    intro: `Hi ${escapeEmailHtml(firstNameOf(input.userName))}, we received a request to reset your password. Choose a new one with the button below — this link expires in 1 hour.`,
    ctaLabel: 'Reset password',
    ctaUrl: input.resetUrl,
    note: "If you didn't request this, you can safely ignore this email — your password won't change.",
    whyReceived: WHY_ACCOUNT,
  });

export const renderPasswordResetHtml = (brand: EmailBrand, input: { userName: string; resetUrl: string }): string =>
  renderPasswordReset(brand, input).html;

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  userName: string,
  tenant: EmailTenant | null
): Promise<void> => {
  const brand = getEmailBrand(tenant);
  const resetUrl = brandedLink(brand, '/reset-password', { token: resetToken });
  const { html, text } = renderPasswordReset(brand, { userName, resetUrl });
  await sendEmail({
    to: email,
    subject: emailSubject('Reset your password', brand.name),
    html,
    text,
    tenant: tenant || null,
    category: 'account',
  });
};

/**
 * Sent after a password actually changes, whoever changed it. This is the message that lets
 * someone notice a compromised account, so it is never suppressed and never batched.
 */
export const renderPasswordChanged = (
  brand: EmailBrand,
  input: { userName: string; changedAt: string; byAdmin?: boolean }
): { html: string; text: string } =>
  renderActionEmailParts(brand, {
    title: 'Your password was changed',
    preheader: `Password changed on ${input.changedAt}.`,
    badge: { label: 'Account security', tone: 'neutral' },
    heading: 'Your password was changed',
    intro: input.byAdmin
      ? `Hi ${escapeEmailHtml(firstNameOf(input.userName))}, an administrator set a new password on your account. You have been signed out everywhere.`
      : `Hi ${escapeEmailHtml(firstNameOf(input.userName))}, the password on your account was changed. You have been signed out everywhere.`,
    details: [
      { label: 'Changed', valueHtml: escapeEmailHtml(input.changedAt), valueText: input.changedAt },
      { label: 'Site', valueHtml: escapeEmailHtml(brand.name), valueText: brand.name },
    ],
    ctaLabel: 'Sign in',
    ctaUrl: brandedLink(brand, '/login'),
    note: "If this wasn't you, reset your password immediately and contact us.",
    noteTone: 'warning',
    whyReceived: WHY_ACCOUNT,
  });

export const sendPasswordChangedEmail = async (
  email: string,
  input: { userName: string; byAdmin?: boolean },
  tenant: EmailTenant | null
): Promise<EmailSendResult | { status: 'failed' }> => {
  const brand = getEmailBrand(tenant);
  const changedAt = formatMoment(new Date(), tenant);
  const { html, text } = renderPasswordChanged(brand, { ...input, changedAt });
  // Not deduped: every password change is its own security event and must be reported.
  return deliverEmail('account.password_changed', {
    to: email,
    subject: emailSubject('Your password was changed', brand.name),
    html,
    text,
    tenant,
    category: 'account',
  });
};

export const renderInvitation = (
  brand: EmailBrand,
  input: { inviterName: string; role: string; inviteUrl: string }
): { html: string; text: string } =>
  renderActionEmailParts(brand, {
    title: 'Invitation',
    preheader: `${input.inviterName} invited you to join as ${input.role}.`,
    badge: { label: 'Team invitation', tone: 'brand' },
    heading: `Join ${brand.name}`,
    intro: `${escapeEmailHtml(input.inviterName)} has invited you to join <strong>${escapeEmailHtml(brand.name)}</strong> as a <strong>${escapeEmailHtml(input.role)}</strong>. Accept to set up your account.`,
    details: [
      { label: 'Invited by', valueHtml: escapeEmailHtml(input.inviterName), valueText: input.inviterName },
      { label: 'Role', valueHtml: escapeEmailHtml(input.role), valueText: input.role },
      { label: 'Invitation expires', valueHtml: 'In 7 days', valueText: 'In 7 days' },
    ],
    ctaLabel: 'Accept invitation',
    ctaUrl: input.inviteUrl,
    note: "If you weren't expecting this invitation, you can ignore this email.",
    whyReceived: 'You received this email because someone invited you to this site.',
  });

export const renderInvitationHtml = (brand: EmailBrand, input: { inviterName: string; role: string; inviteUrl: string }): string =>
  renderInvitation(brand, input).html;

/** The accept-invitation link for a site: its live custom domain, else the shared origin with ?tenant=. */
export const invitationLink = (invitationToken: string, tenant: EmailTenant | null): string =>
  brandedLink(getEmailBrand(tenant), '/accept-invitation', { token: invitationToken });

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
  const inviteUrl = invitationLink(invitationToken, tenant);
  const { html, text } = renderInvitation(brand, { inviterName, role, inviteUrl });
  await sendEmail({
    to: email,
    subject: emailSubject(`You're invited to join ${brand.name}`),
    html,
    text,
    tenant: tenant || null,
  });
};

/**
 * Sent when a team member's role, status or site access actually changes. Access is a security
 * fact: the person whose permissions moved is told, in plain words, what they can now do.
 */
export interface AccessChangedDetails {
  userName: string;
  role: string;
  status: string;
  /** Names of the sites the user can now reach. Empty means none. */
  siteNames: string[];
  changedBy: string;
}

export const renderAccessChanged = (
  brand: EmailBrand,
  details: AccessChangedDetails
): { html: string; text: string } => {
  const sites = details.siteNames.length > 0 ? details.siteNames.join(', ') : 'No sites assigned';
  const active = details.status === 'active';
  return renderActionEmailParts(brand, {
    title: 'Your access was updated',
    preheader: `Your role is now ${details.role}.`,
    badge: { label: 'Access updated', tone: active ? 'info' : 'warning' },
    heading: 'Your access was updated',
    intro: `Hi ${escapeEmailHtml(firstNameOf(details.userName))}, ${escapeEmailHtml(details.changedBy)} updated your access. You have been signed out and will need to sign in again.`,
    details: [
      { label: 'Role', valueHtml: escapeEmailHtml(details.role), valueText: details.role },
      { label: 'Account status', valueHtml: escapeEmailHtml(details.status), valueText: details.status },
      { label: 'Sites', valueHtml: escapeEmailHtml(sites), valueText: sites },
    ],
    ctaLabel: 'Sign in',
    ctaUrl: brandedLink(brand, '/login'),
    note: active
      ? 'If you think this is wrong, reply to this email and we will check it.'
      : 'Your account is not active, so you cannot sign in until an administrator restores it.',
    noteTone: active ? 'neutral' : 'warning',
    whyReceived: WHY_ACCOUNT,
  });
};

export const sendAccessChangedEmail = async (
  email: string,
  details: AccessChangedDetails,
  tenant: EmailTenant | null
): Promise<EmailSendResult | { status: 'failed' }> => {
  const brand = getEmailBrand(tenant);
  const { html, text } = renderAccessChanged(brand, details);
  return deliverEmail('account.access_changed', {
    to: email,
    subject: emailSubject('Your access was updated', brand.name),
    html,
    text,
    tenant,
    category: 'account',
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

/** A date/time written for the site's own language and time zone, never the server's. */
const formatMoment = (when: Date, tenant: EmailTenant | null): string => {
  try {
    return when.toLocaleString(tenant?.defaultLanguage || 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(tenant?.timezone ? { timeZone: tenant.timezone } : {}),
    });
  } catch {
    return when.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  }
};

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
  const brand = getEmailBrand(tenant);
  const adminPanelUrl = brandedLink(brand, '/admin/rsvps');
  const receivedAt = formatMoment(new Date(), tenant);
  const emailHref = safeMailtoAddress(rawRsvp.email);
  const phoneHref = rawRsvp.phone.replace(/[^+0-9]/g, '');
  const guestLine = `${rawRsvp.firstName} ${rawRsvp.lastName} — ${totalGuests} guest${totalGuests === 1 ? '' : 's'}`;

  const { html, text } = renderEmail({
    brand,
    title: `New RSVP · ${rawRsvp.eventName}`,
    preheader: guestLine,
    badge: { label: 'New RSVP', tone: 'brand' },
    heading: `${rawRsvp.firstName} ${rawRsvp.lastName} is coming to ${rawRsvp.eventName}`,
    introHtml: `${rsvp.eventDate} · ${rsvp.eventLocation}`,
    introText: `${rawRsvp.eventDate} · ${rawRsvp.eventLocation}`,
    blocks: [
      {
        kind: 'stats',
        items: [
          { value: totalGuests, label: `Guest${totalGuests === 1 ? '' : 's'}` },
          { value: rsvp.adultsCount, label: `Adult${rsvp.adultsCount === 1 ? '' : 's'}` },
          { value: rsvp.childrenCount, label: `Child${rsvp.childrenCount === 1 ? '' : 'ren'}` },
        ],
      },
      {
        kind: 'details',
        eyebrow: 'Guest details',
        rows: [
          { label: 'Name', valueHtml: `${rsvp.firstName} ${rsvp.lastName}`, valueText: `${rawRsvp.firstName} ${rawRsvp.lastName}` },
          { label: 'Email', valueHtml: emailHref ? emailLink(brand, `mailto:${emailHref}`, rsvp.email) : rsvp.email, valueText: rawRsvp.email },
          { label: 'Phone', valueHtml: phoneHref ? emailLink(brand, `tel:${phoneHref}`, rsvp.phone) : rsvp.phone, valueText: rawRsvp.phone },
          { label: 'Site', valueHtml: rsvp.tenantName, valueText: rawRsvp.tenantName },
          { label: 'Received', valueHtml: escapeEmailHtml(receivedAt), valueText: receivedAt },
        ],
      },
      rawRsvp.message ? { kind: 'quote', label: 'Message from guest', text: rawRsvp.message } : '',
      {
        kind: 'buttons',
        primary: { label: 'Manage RSVPs', url: adminPanelUrl },
        secondary: emailHref ? { label: `Email ${firstNameOf(rawRsvp.firstName, 'guest')}`, url: `mailto:${emailHref}` } : undefined,
      },
    ],
    footer: {
      note: `Automated notification from ${rawRsvp.tenantName}.`,
      whyReceived: WHY_OPERATOR,
      postalAddress: brand.postalAddress,
    },
  });

  await sendEmail({
    to: recipientEmail,
    subject: emailSubject('RSVP', `${safeDisplayName(rawRsvp.firstName)} ${safeDisplayName(rawRsvp.lastName)}`, safeDisplayName(rawRsvp.eventName)),
    html,
    text,
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
    eventTime: rawRsvp.eventTime ? escapeEmailHtml(rawRsvp.eventTime) : undefined,
  };
  const totalGuests = rsvp.adultsCount + rsvp.childrenCount;
  const eventTime = rawRsvp.eventTime || '5 PM – 10 PM';
  const guestsLine = `${totalGuests} · ${rsvp.adultsCount} adult${rsvp.adultsCount === 1 ? '' : 's'}, ${rsvp.childrenCount} child${rsvp.childrenCount === 1 ? '' : 'ren'}`;

  const brand = getEmailBrand(tenant);
  const programmeItems = rawRsvp.programme && rawRsvp.programme.length > 0 ? rawRsvp.programme : DEFAULT_OPENING_PROGRAMME;
  const closing = `We are happy to welcome you soon. — The ${rawRsvp.tenantName} team`;

  const { html, text } = renderEmail({
    brand,
    title: `${rawRsvp.eventName} — Your RSVP is confirmed`,
    preheader: `${rawRsvp.eventDate} · ${eventTime} · ${rawRsvp.eventLocation}`,
    badge: { label: 'RSVP confirmed', tone: 'success' },
    heading: `Thank you, ${rawRsvp.firstName}`,
    introHtml: `You're on the list for <strong>${rsvp.eventName}</strong>. We are delighted to welcome you${totalGuests > 1 ? ' and your guests' : ''}.`,
    introText: `You're on the list for ${rawRsvp.eventName}. We are delighted to welcome you${totalGuests > 1 ? ' and your guests' : ''}.`,
    blocks: [
      {
        kind: 'details',
        eyebrow: 'Your invitation',
        titleHtml: rsvp.eventName,
        titleText: rawRsvp.eventName,
        rows: [
          { label: 'Date', valueHtml: rsvp.eventDate, valueText: rawRsvp.eventDate },
          { label: 'Time', valueHtml: escapeEmailHtml(eventTime), valueText: eventTime },
          { label: 'Location', valueHtml: rsvp.eventLocation, valueText: rawRsvp.eventLocation },
          { label: 'Guests', valueHtml: guestsLine, valueText: guestsLine },
        ],
      },
      { kind: 'list', title: 'Programme', items: programmeItems.map((item) => ({ title: item })) },
      { kind: 'notice', tone: 'brand', messageHtml: escapeEmailHtml(closing), text: closing },
    ],
    footer: {
      note: 'Questions? Simply reply to this email and our team will be in touch.',
      contact: brand.contact,
      whyReceived: 'You received this email because you registered for this event.',
      postalAddress: brand.postalAddress,
    },
  });

  await sendEmail({
    to: guestEmail,
    subject: emailSubject("You're on the list", safeDisplayName(rawRsvp.eventName)),
    html,
    text,
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
  | { status: 'skipped'; reason: 'provider_not_configured' | 'non_production_no_qa_inbox' }
  | { status: 'failed'; reason: 'no_recipient' };

const singleLine = (value: string): string => value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

export const contactEnquirySubject = (details: ContactEnquiryDetails): string =>
  emailSubject(
    `New enquiry ${singleLine(details.reference)}`,
    singleLine(details.tourTitle?.trim() || details.subject?.trim() || 'Website message')
  );

export const renderContactForm = (
  tenant: EmailTenant,
  details: ContactEnquiryDetails
): { html: string; text: string } => {
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
    { label: 'Reference', valueHtml: emailCode(details.reference), valueText: details.reference },
    { label: 'Name', valueHtml: escapeEmailHtml(details.name), valueText: details.name },
    { label: 'Email', valueHtml: mailto ? emailLink(brand, `mailto:${mailto}`, escapeEmailHtml(mailto)) : escapeEmailHtml(details.email), valueText: details.email },
  ];
  if (details.phone) {
    rows.push({ label: 'Phone', valueHtml: telephone ? emailLink(brand, `tel:${telephone}`, escapeEmailHtml(details.phone)) : escapeEmailHtml(details.phone), valueText: details.phone });
  }
  if (tour) rows.push({ label: 'Tour', valueHtml: escapeEmailHtml(tour), valueText: tour });
  if (details.travelDate) rows.push({ label: 'Travel date', valueHtml: escapeEmailHtml(details.travelDate), valueText: details.travelDate });
  if (details.guests !== undefined && details.guests !== null) rows.push({ label: 'Guests', valueHtml: escapeEmailHtml(details.guests), valueText: String(details.guests) });
  if (details.subject) rows.push({ label: 'Subject', valueHtml: escapeEmailHtml(details.subject), valueText: details.subject });
  if (details.pagePath) rows.push({ label: 'Page', valueHtml: escapeEmailHtml(details.pagePath), valueText: details.pagePath });
  if (details.locale) rows.push({ label: 'Language', valueHtml: escapeEmailHtml(details.locale), valueText: details.locale });

  const closing = 'Replying to this email answers the visitor directly. The message is also saved in Admin → Messages.';

  return renderEmail({
    brand,
    title: `New enquiry ${details.reference}`,
    preheader: `${details.name}: ${singleLine(details.message)}`,
    badge: { label: 'New enquiry', tone: 'brand' },
    heading: `${details.name} sent a message`,
    introHtml: `About <strong>${escapeEmailHtml(topic)}</strong> · via the ${escapeEmailHtml(brand.name)} contact form`,
    introText: `About ${topic} · via the ${brand.name} contact form`,
    blocks: [
      { kind: 'quote', label: 'Message', text: details.message },
      { kind: 'details', eyebrow: 'Enquiry details', rows },
      {
        kind: 'buttons',
        primary: replyUrl ? { label: `Reply to ${firstNameOf(details.name, 'visitor')}`, url: replyUrl } : { label: 'Open Messages', url: inboxUrl },
        secondary: replyUrl ? { label: 'Open Messages', url: inboxUrl } : undefined,
      },
      { kind: 'notice', tone: 'neutral', messageHtml: escapeEmailHtml(closing), text: closing },
    ],
    footer: {
      note: `Sent from the contact form on ${brand.name}.`,
      whyReceived: WHY_OPERATOR,
      postalAddress: brand.postalAddress,
    },
  });
};

export const renderContactFormHtml = (tenant: EmailTenant, details: ContactEnquiryDetails): string =>
  renderContactForm(tenant, details).html;

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

  const { html, text } = renderContactForm(tenant, details);
  return sendEmail({
    to: recipient,
    subject: contactEnquirySubject(details),
    html,
    text,
    tenant,
    replyTo: details.email,
  });
};

/**
 * The acknowledgement the visitor gets: their reference, what they wrote, and when to expect
 * an answer. Without it a visitor has no proof their message was received.
 */
export const renderEnquiryReceived = (
  brand: EmailBrand,
  details: ContactEnquiryDetails
): { html: string; text: string } => {
  const topic = singleLine(details.tourTitle?.trim() || details.subject?.trim() || 'your message');
  const rows: EmailDetailRow[] = [
    { label: 'Your reference', valueHtml: emailCode(details.reference), valueText: details.reference },
    { label: 'About', valueHtml: escapeEmailHtml(topic), valueText: topic },
  ];
  if (details.travelDate) rows.push({ label: 'Travel date', valueHtml: escapeEmailHtml(details.travelDate), valueText: details.travelDate });
  if (details.guests !== undefined && details.guests !== null) {
    rows.push({ label: 'Guests', valueHtml: escapeEmailHtml(details.guests), valueText: String(details.guests) });
  }

  const closing = 'Please keep your reference — quoting it helps us find your message straight away.';

  return renderEmail({
    brand,
    title: `We received your message · ${details.reference}`,
    preheader: `Reference ${details.reference}. Our team will reply by email.`,
    badge: { label: 'Message received', tone: 'success' },
    heading: `Thanks, ${firstNameOf(details.name)} — we have your message`,
    introHtml: `Our team has your enquiry about <strong>${escapeEmailHtml(topic)}</strong> and will reply to this email address.`,
    introText: `Our team has your enquiry about ${topic} and will reply to this email address.`,
    blocks: [
      { kind: 'details', rows, eyebrow: 'Your enquiry' },
      { kind: 'quote', label: 'What you sent us', text: details.message },
      { kind: 'buttons', primary: { label: `Visit ${brand.name}`, url: brandedLink(brand, '/') } },
      { kind: 'notice', tone: 'neutral', messageHtml: escapeEmailHtml(closing), text: closing },
    ],
    footer: {
      note: 'Need to add something? Reply to this email and it reaches the same team.',
      contact: brand.contact,
      whyReceived: 'You received this email because you sent us a message through our website.',
      postalAddress: brand.postalAddress,
    },
  });
};

/**
 * Acknowledge a stored enquiry to the visitor. Deduped on the stored reference, so a retried
 * delivery of the same enquiry can never mail the visitor twice.
 */
export const sendEnquiryReceivedEmail = async (
  tenant: EmailTenant,
  details: ContactEnquiryDetails
): Promise<EmailOnceResult> => {
  if (!isEmailAddress(details.email)) return { status: 'failed' };
  const brand = getEmailBrand(tenant);
  const { html, text } = renderEnquiryReceived(brand, details);
  return sendEmailOnce(
    {
      dedupeKey: `contact.ack:${details.reference}`,
      eventType: 'contact.ack',
      tenantId: (tenant as { _id?: Types.ObjectId })?._id,
    },
    {
      to: details.email,
      subject: emailSubject('We received your message', details.reference),
      html,
      text,
      tenant,
      replyTo: tenant.contactInfo?.email,
    }
  );
};

// Re-exported so preview harnesses and callers do not need a second import.
export { renderEmailDocument, emailDetails, emailButtons, emailNotice, emailPanel, emailList, emailQuote, emailStats, emailCode, emailLink };
