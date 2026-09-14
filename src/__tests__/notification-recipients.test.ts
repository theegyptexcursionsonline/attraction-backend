import { bookingNotificationEmail, notificationSettingsUpdate } from '../utils/notificationRecipients';

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
