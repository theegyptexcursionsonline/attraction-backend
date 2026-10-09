import { SUBJECT_TEXT, type AuditChange, type AuditSubject, type AuditValue } from '../services/auditSubjects';

/**
 * The User log as a CSV report (English, like the rest of the platform's reports). Times are given
 * in Cairo, where the brands operate, and in UTC.
 */

const CAIRO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const CAIRO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** "2026-10-09 12:46:31" in Cairo. */
export const cairoTime = (value: Date | string): string => CAIRO.format(new Date(value)).replace(', ', ' ');
/** "2026-10-09" in Cairo. */
export const cairoDate = (value: Date | string): string => CAIRO_DAY.format(new Date(value));

/**
 * One CSV cell. A value a spreadsheet would run as a formula (=, +, -, @, or a tab/return in front)
 * is kept as text with a leading apostrophe; every cell is quoted.
 */
export const csvCell = (value: unknown): string => {
  let text = value === undefined || value === null ? '' : String(value);
  if (/^\s*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

const ROLE_TEXT: Record<string, string> = {
  'super-admin': 'Super admin', 'brand-admin': 'Brand admin', manager: 'Manager', editor: 'Editor', viewer: 'Viewer',
};

const ACTION_TEXT: Record<string, string> = {
  'auth.login': 'Signed in', 'auth.login_failed': 'Failed sign-in', 'auth.two_factor_failed': 'Wrong 2FA code',
  'auth.logout': 'Signed out', 'auth.password_changed': 'Changed password', 'record.create': 'Created',
  'record.update': 'Changed', 'record.delete': 'Deleted', 'record.export': 'Exported',
};

/** Field names as people read them; fields not listed are turned from camelCase into words. */
export const FIELD_TEXT: Record<string, string> = {
  title: 'Title', name: 'Name', slug: 'Web address', pathSlug: 'Short web address', status: 'Status', listingType: 'Listing type',
  category: 'Category', subcategory: 'Subcategory', 'destination.city': 'City', 'destination.country': 'Country', duration: 'Duration',
  priceFrom: 'Price from', currency: 'Currency', enquiryOnly: 'Enquiry only', featured: 'Featured', sortOrder: 'Sort order',
  instantConfirmation: 'Instant confirmation', mobileTicket: 'Mobile ticket', hasHotelPickup: 'Hotel pickup',
  validityDuration: 'Ticket validity', languages: 'Languages', 'reseller.enabled': 'Open to resellers', trashedAt: 'In trash since',
  shortDescription: 'Short description', description: 'Description', images: 'Photos', imageAltTexts: 'Photo descriptions',
  pricingOptions: 'Prices and options', addons: 'Add-ons', entryWindows: 'Entry times', itinerary: 'Itinerary',
  highlights: 'Highlights', inclusions: 'What is included', exclusions: 'What is not included', whatToBring: 'What to bring',
  needToKnow: 'Need to know', accessibility: 'Accessibility', gettingThere: 'Getting there', participantRequirements: 'Participant requirements',
  meetingPoint: 'Meeting point', cancellationPolicy: 'Cancellation policy', availability: 'Availability', seo: 'Search listing',
  venueInfo: 'Venue', packageDetails: 'Package details', parentPage: 'Parent page', badges: 'Badges', tenantIds: 'Sites',
  'reseller.value': 'Reseller commission', 'reseller.allowedTenants': 'Allowed resellers', items: 'Booked items',
  settlementStatus: 'Settlement', settledAt: 'Settled on', firstName: 'First name', lastName: 'Last name', role: 'Role',
  sectionAccess: 'Sections', interfaceLocale: 'Admin language', email: 'Email address', assignedTenants: 'Brands',
  domain: 'Domain', customDomain: 'Custom domain', customDomainStatus: 'Custom domain status', defaultCurrency: 'Default currency',
  defaultLanguage: 'Default language', supportedLanguages: 'Languages', timezone: 'Time zone', designMode: 'Design',
  flatUrls: 'Short web addresses', enabledSections: 'Sections', tagline: 'Tagline', 'theme.primaryColor': 'Main colour',
  'theme.secondaryColor': 'Second colour', 'theme.accentColor': 'Accent colour', 'fonts.heading': 'Heading font', 'fonts.body': 'Text font',
  logo: 'Logo', logoDark: 'Logo for dark backgrounds', favicon: 'Browser icon', heroImages: 'Home page photos', contactInfo: 'Contact details',
  notificationSettings: 'Notifications', socialLinks: 'Social links', pricingSettings: 'Pricing settings', aiSettings: 'AI assistant',
  navigation: 'Menu', seoSettings: 'Search settings', trackingSettings: 'Tracking', pageSeo: 'Page search listings',
  externalRatings: 'External ratings', bundleSettings: 'Bundle settings', pickupDestinationSlugs: 'Pickup areas', isPublished: 'Published',
  pageType: 'Page type', layoutMode: 'Layout', parentPath: 'Parent page', metaTitle: 'Search title', body: 'Page text', sections: 'Page sections',
  heroImage: 'Main photo', heroDescription: 'Main photo text', heroImageAlt: 'Main photo description', metaDescription: 'Search description',
  ogImage: 'Sharing image', categoryIds: 'Categories', archivedAt: 'Archived on', code: 'Code', discountType: 'Discount type',
  discountValue: 'Discount', minOrderAmount: 'Minimum order', maxDiscount: 'Maximum discount', usageLimit: 'Usage limit',
  validFrom: 'Valid from', validUntil: 'Valid until', isActive: 'Active', rating: 'Rating', verified: 'Verified', adminReply: 'Reply',
  icon: 'Icon', parentId: 'Parent category', country: 'Country', continent: 'Continent', language: 'Language', bestTimeToVisit: 'Best time to visit',
  coordinates: 'Map position', tags: 'Tags', area: 'Area', version: 'Version', components: 'Components', policies: 'Policies',
  customerPricesMinor: 'Customer prices', validTravelFrom: 'Travel from', validTravelTo: 'Travel until', salesStartsAt: 'Sales start',
  salesEndsAt: 'Sales end', leadTimeHours: 'Notice (hours)', termsVersion: 'Terms version', supplierNetPricesMinor: 'Supplier prices',
  optionIds: 'Options', entryWindowLabels: 'Entry times', capacityPerDeparture: 'Capacity', blackoutDates: 'Closed dates',
  rejectionReason: 'Rejection reason', pausedReason: 'Pause reason', publishedAt: 'Published on', excerpt: 'Summary', content: 'Text',
  featuredImage: 'Main photo', featuredImageAlt: 'Main photo description', faqs: 'Questions and answers', translations: 'Translations',
  author: 'Author', label: 'Name', scopes: 'Permissions', revoked: 'Revoked', events: 'Events', enabled: 'On', url: 'Address',
  reopenedDate: 'Reopened date', entryCount: 'Entries',
};

export const fieldText = (field: string): string =>
  FIELD_TEXT[field] || field.replace(/[._]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (first) => first.toUpperCase());

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const valueText = (value: AuditValue | undefined): string => {
  if (value === undefined || value === null || value === '') return 'Not set';
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (Array.isArray(value)) return value.length ? value.map((item) => valueText(item)).join(', ') : 'None';
  if (typeof value === 'string' && ISO.test(value)) return /T00:00:00(\.0+)?Z$/.test(value) ? value.slice(0, 10) : cairoTime(value);
  return String(value);
};

/** "Price from: 45 → 49; Featured: No → Yes" (a new record lists what it was set to, a deleted one what it had). */
export const changesText = (changes: AuditChange[]): string => changes.map((change) => {
  const label = fieldText(change.field);
  if (!('before' in change) || change.before === undefined) return `${label}: ${valueText(change.after)}`;
  if (!('after' in change) || change.after === undefined) return `${label} was ${valueText(change.before)}`;
  return `${label}: ${valueText(change.before)} → ${valueText(change.after)}`;
}).join('; ');

/** "Chrome · macOS" from a user agent. */
export const deviceText = (userAgent: string | null): string => {
  if (!userAgent) return '';
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Chrome\//.test(userAgent) ? 'Chrome' : /Firefox\//.test(userAgent) ? 'Firefox' : /Safari\//.test(userAgent) ? 'Safari' : '';
  const system = /iPhone|iPad/.test(userAgent) ? 'iOS' : /Android/.test(userAgent) ? 'Android' : /Mac OS X/.test(userAgent) ? 'macOS' : /Windows/.test(userAgent) ? 'Windows' : /Linux/.test(userAgent) ? 'Linux' : '';
  return [browser, system].filter(Boolean).join(' · ');
};

const resultText = (outcome: string, statusCode: number | null): string => {
  if (outcome === 'success') return 'Succeeded';
  return `${statusCode !== null && statusCode >= 500 ? 'Failed' : 'Refused'}${statusCode ? ` (${statusCode})` : ''}`;
};

const COLUMNS = ['Time (Cairo)', 'Time (UTC)', 'Who', 'Email', 'Role', 'Result', 'Summary', 'Record type', 'Record', 'Brand', 'Changes', 'Also changed', 'IP address', 'Device', 'Event ID'];

export const auditCsvHeader = (withRequest: boolean): string =>
  `${[...COLUMNS, ...(withRequest ? ['Request'] : [])].map(csvCell).join(',')}\r\n`;

interface CsvEntry {
  id: string;
  action: string;
  outcome: string;
  actor: { email: string; name: string | null; role: string | null };
  method: string | null;
  path: string | null;
  resource: string | null;
  subject: string | null;
  resourceLabel: string | null;
  summary: string | null;
  changes: AuditChange[];
  changedFields: string[];
  brand: { name: string } | null;
  statusCode: number | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date | string;
}

export const auditCsvRow = (entry: CsvEntry, withRequest: boolean): string => {
  const summary = entry.summary || `${ACTION_TEXT[entry.action] || entry.action}${entry.resource ? ` (${entry.resource})` : ''}`;
  const cells = [
    cairoTime(entry.createdAt),
    new Date(entry.createdAt).toISOString(),
    entry.actor.name || '',
    entry.actor.email,
    (entry.actor.role && ROLE_TEXT[entry.actor.role]) || entry.actor.role || '',
    resultText(entry.outcome, entry.statusCode),
    summary,
    entry.subject ? (SUBJECT_TEXT[entry.subject as AuditSubject] || entry.subject).replace(/^./, (first) => first.toUpperCase()) : '',
    entry.resourceLabel || '',
    entry.brand?.name || '',
    changesText(entry.changes),
    entry.changedFields.map(fieldText).join(', '),
    entry.ip || '',
    deviceText(entry.userAgent),
    entry.id,
    ...(withRequest ? [[entry.method, entry.path].filter(Boolean).join(' ')] : []),
  ];
  return `${cells.map(csvCell).join(',')}\r\n`;
};
