const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
export function notificationSettingsUpdate(value: unknown): { set: Record<string, string> } | { error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Notification settings must be an object' };
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([key]) => key !== 'bookingEmail')) return { error: 'Unknown notification setting' };
  const raw = (value as Record<string, unknown>).bookingEmail;
  if (raw === undefined) return { set: {} };
  if (raw !== null && typeof raw !== 'string') return { error: 'Booking notifications email must be text' };
  const email = (raw ?? '').trim().toLowerCase();
  if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) return { error: 'Enter a valid booking notifications email' };
  return { set: { 'notificationSettings.bookingEmail': email } };
}
