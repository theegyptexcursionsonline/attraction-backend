import { renderBookingConfirmationHtml } from '../services/email.service';
import type { EmailBrand, BookingEmailDetails } from '../services/email.service';

const brand: EmailBrand = {
  name: 'Makadi Horse Club',
  origin: 'https://makadihorseclub.com',
  color: '#8B4513',
};

const base: BookingEmailDetails = {
  reference: 'ATT-TEST-1',
  attractionTitle: 'Private VIP Horse Ride',
  date: '2026-07-15',
  time: '08:00',
  guestName: 'QA Test',
  total: 199.5,
  currency: 'USD',
  guests: 2,
};

describe('renderBookingConfirmationHtml', () => {
  it('includes the brand, reference, date and a working public confirmation link', () => {
    const html = renderBookingConfirmationHtml(brand, { ...base, paymentMethod: 'pay-later' });
    expect(html).toContain('Makadi Horse Club');
    expect(html).toContain('ATT-TEST-1');
    expect(html).toContain('2026-07-15');
    expect(html).toContain('#8B4513'); // brand colour applied to the chrome
    // "View booking" points at the PUBLIC confirmation page, not the login-gated dashboard
    expect(html).toContain('https://makadihorseclub.com/checkout/confirmation?ref=ATT-TEST-1');
    expect(html).not.toContain('/dashboard/bookings');
  });

  it('says "Pay at location" and never "paid" for a pay-later booking', () => {
    const html = renderBookingConfirmationHtml(brand, { ...base, paymentMethod: 'pay-later' });
    expect(html).toMatch(/Pay at location/i);
    expect(html).not.toMatch(/paid/i);
  });

  it('says "Total paid" for a card booking', () => {
    const html = renderBookingConfirmationHtml(brand, { ...base, paymentMethod: 'card' });
    expect(html).toMatch(/Total paid/i);
  });
});
