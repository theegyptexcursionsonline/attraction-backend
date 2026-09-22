const EMAIL_PATTERN = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** A bounded list of explicit mailboxes, never header syntax or a comma-separated string. */
export function notificationCopyEmails(value: unknown, primary?: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 5) throw new Error('Enter at most 5 notification copy email addresses');
  const emails = value.map((raw) => {
    if (typeof raw !== 'string' || /[\r\n]/.test(raw)) throw new Error('Enter valid notification copy email addresses');
    const email = raw.trim().toLowerCase();
    if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) throw new Error('Enter valid notification copy email addresses');
    return email;
  });
  return [...new Set(emails)].filter((email) => email !== primary?.trim().toLowerCase());
}

type TenantRecipients = {
  contactInfo?: { email?: string | null } | null;
  notificationSettings?: { bookingEmail?: string | null } | null;
} | null | undefined;

/** The inbox that receives new-booking alerts: the reservations email when set, else the support email. */
export function bookingNotificationEmail(tenant: TenantRecipients): string | null {
  const booking = tenant?.notificationSettings?.bookingEmail?.trim();
  if (booking && EMAIL_PATTERN.test(booking)) return booking;
  const support = tenant?.contactInfo?.email?.trim();
  return support || null;
}

/**
 * Validates the admin settings payload. Returns the `$set` paths to write, or an error.
 * An empty string clears the reservations inbox so alerts fall back to the support email.
 */
export function notificationSettingsUpdate(value: unknown): { set: Record<string, string | string[]> } | { error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Notification settings must be an object' };
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([key]) => !['bookingEmail', 'bookingCcEmails', 'contactCcEmails'].includes(key))) return { error: 'Unknown notification setting' };
  const set: Record<string, string | string[]> = {};
  for (const key of ['bookingCcEmails', 'contactCcEmails']) {
    const copies = (value as Record<string, unknown>)[key];
    if (copies !== undefined) {
      try { set[`notificationSettings.${key}`] = notificationCopyEmails(copies); }
      catch (error) { return { error: (error as Error).message }; }
    }
  }
  const raw = (value as Record<string, unknown>).bookingEmail;
  if (raw === undefined) return { set };
  if (raw !== null && typeof raw !== 'string') return { error: 'Booking notifications email must be text' };
  const email = (raw ?? '').trim().toLowerCase();
  if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) return { error: 'Enter a valid booking notifications email' };
  return { set: { ...set, 'notificationSettings.bookingEmail': email } };
}
