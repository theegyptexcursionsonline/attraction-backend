import { bookingNotificationEmail, notificationCopyEmails, notificationSettingsUpdate } from '../utils/notificationRecipients';

const invalidCopies: unknown[] = [
  null, 'copy@qa-site.invalid', 123, {},
  [null], [123], [{}], [''], ['   '], ['not-an-email'],
  ['One Person <copy@qa-site.invalid>'],
  ['one@qa-site.invalid,two@qa-site.invalid'],
  ['one@qa-site.invalid\r\nBcc: two@qa-site.invalid'],
  [`${'a'.repeat(250)}@qa-site.invalid`],
  Array.from({ length: 6 }, (_, i) => `copy${i}@qa-site.invalid`),
  Array.from({ length: 6 }, () => 'same@qa-site.invalid'),
];

describe('notificationCopyEmails', () => {
  it('normalizes and deduplicates copies and excludes the primary inbox case-insensitively', () => {
    expect(notificationCopyEmails([
      ' Copy@QA-Site.invalid ', 'copy@qa-site.invalid', 'PRIMARY@qa-site.invalid', 'Other@qa-site.invalid',
    ], ' primary@qa-site.invalid ')).toEqual(['copy@qa-site.invalid', 'other@qa-site.invalid']);
  });

  it('allows an empty list and up to five independent copies', () => {
    expect(notificationCopyEmails([])).toEqual([]);
    const five = Array.from({ length: 5 }, (_, i) => `copy${i}@qa-site.invalid`);
    expect(notificationCopyEmails(five)).toEqual(five);
  });

  it.each(invalidCopies.map(value => [value]))('rejects the complete invalid list %j', value => {
    expect(() => notificationCopyEmails(value)).toThrow();
  });

  it('rejects mixed valid and invalid entries instead of silently omitting a recipient', () => {
    expect(() => notificationCopyEmails(['copy@qa-site.invalid', 'not-an-email'])).toThrow();
  });
});

describe('bookingNotificationEmail', () => {
  it('prefers the reservations inbox, then the support email, then nothing', () => {
    const contactInfo = { email: ' support@qa-site.invalid ' };
    expect(bookingNotificationEmail({ contactInfo, notificationSettings: { bookingEmail: ' reservations@qa-site.invalid ' } })).toBe('reservations@qa-site.invalid');
    expect(bookingNotificationEmail({ contactInfo, notificationSettings: { bookingEmail: '' } })).toBe('support@qa-site.invalid');
    expect(bookingNotificationEmail({ contactInfo, notificationSettings: { bookingEmail: 'not-an-email' } })).toBe('support@qa-site.invalid');
    expect(bookingNotificationEmail({ contactInfo })).toBe('support@qa-site.invalid');
    expect(bookingNotificationEmail({ contactInfo: { email: '  ' } })).toBeNull();
    expect(bookingNotificationEmail(null)).toBeNull();
  });
});

describe('notificationSettingsUpdate', () => {
  it('normalizes both private copy lists and patches only fields explicitly supplied', () => {
    expect(notificationSettingsUpdate({
      bookingCcEmails: [' Copy@QA-Site.invalid ', 'copy@qa-site.invalid'],
      contactCcEmails: ['Contact@qa-site.invalid'],
    })).toEqual({ set: {
      'notificationSettings.bookingCcEmails': ['copy@qa-site.invalid'],
      'notificationSettings.contactCcEmails': ['contact@qa-site.invalid'],
    } });
    expect(notificationSettingsUpdate({ bookingEmail: 'reservations@qa-site.invalid' })).toEqual({
      set: { 'notificationSettings.bookingEmail': 'reservations@qa-site.invalid' },
    });
  });

  it.each(['bookingCcEmails', 'contactCcEmails'])('clears only %s when an empty array is supplied', field => {
    expect(notificationSettingsUpdate({ [field]: [] })).toEqual({ set: { [`notificationSettings.${field}`]: [] } });
  });

  it.each(['bookingCcEmails', 'contactCcEmails'])('rejects malformed %s without returning any partial patch', field => {
    for (const value of invalidCopies) {
      const result = notificationSettingsUpdate({ bookingEmail: 'changed@qa-site.invalid', [field]: value });
      expect(result).toHaveProperty('error');
      expect(result).not.toHaveProperty('set');
    }
  });

  it('normalises a valid email and clears with empty or null', () => {
    expect(notificationSettingsUpdate({ bookingEmail: ' Reservations@QA-Site.invalid ' })).toEqual({ set: { 'notificationSettings.bookingEmail': 'reservations@qa-site.invalid' } });
    expect(notificationSettingsUpdate({ bookingEmail: '' })).toEqual({ set: { 'notificationSettings.bookingEmail': '' } });
    expect(notificationSettingsUpdate({ bookingEmail: null })).toEqual({ set: { 'notificationSettings.bookingEmail': '' } });
    expect(notificationSettingsUpdate({})).toEqual({ set: {} });
  });

  it.each([
    [null], [[]], ['reservations@qa-site.invalid'], [{ bookingEmail: 42 }], [{ bookingEmail: 'nope' }],
    [{ bookingEmail: `${'a'.repeat(250)}@x.io` }], [{ bookingEmail: 'ok@qa-site.invalid', cc: 'x@y.z' }],
  ])('rejects %j', (value) => {
    expect(notificationSettingsUpdate(value)).toHaveProperty('error');
  });
});
